/**
 * Shared bootstrap for the sales pipeline scripts: .env.local parsing, a
 * Firestore handle, and the small pieces of vocabulary the scripts need.
 *
 * The option keys are duplicated from src/lib/sales/options.ts rather than
 * imported — these are plain .mjs run by node with no TypeScript pipeline, the
 * same reason every other script in here re-parses .env.local by hand. If you
 * change a key there, change it here. The import script asserts against these
 * lists, so a drift shows up as a loud "unmapped value" rather than silence.
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
}

export function requireEnv(...keys) {
  for (const key of keys) {
    if (!env[key]) {
      console.error(`Missing ${key} in .env.local`);
      process.exit(1);
    }
  }
}

/** Lazily initialised Firestore, so a script that only reads Calendly needn't. */
export function db() {
  requireEnv("FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY");
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

export const CALENDLY_API = "https://api.calendly.com";

/**
 * `path` may be an absolute URL, which is how pagination is followed.
 *
 * Calendly's `pagination.next_page_token` cannot be reliably re-assembled into
 * a query string — feeding it back as `page_token` alongside the original
 * params returns "page_token is invalid" (verified live). `pagination.next_page`
 * is the fully-formed URL for the next page and is the only thing that works.
 */
export async function calendly(path, init) {
  requireEnv("CALENDLY_API_TOKEN");
  const url = path.startsWith("http") ? path : `${CALENDLY_API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CALENDLY_API_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(
      new Error(`${res.status} ${body?.message ?? body?.title ?? res.statusText}`),
      { status: res.status, body },
    );
  }
  return body;
}

/** The three event types that count as pipeline. Mirrors lib/calendly.ts. */
export const EVENT_TYPE_UUIDS = {
  unqualified: "dad6beb5-5021-4d0d-a3b2-b5e653ad48a5",
  qualified: "e1c21fab-de02-49e6-b255-e104b1a0e01d",
  referral: "58960ea7-46ed-467c-adca-2be5059234e3",
};

export function callTypeForEventType(uri) {
  if (!uri) return null;
  const uuid = String(uri).split("?")[0].split("/").pop();
  for (const [key, known] of Object.entries(EVENT_TYPE_UUIDS)) {
    if (known === uuid) return key;
  }
  return null;
}

/** `--flag` / `--key=value` parsing, shared by every script here. */
export function args() {
  const out = { _: [] };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      out[k] = v ?? true;
    } else out._.push(a);
  }
  return out;
}

export const rule = (label) => console.log(`\n${"─".repeat(66)}\n${label}\n`);
