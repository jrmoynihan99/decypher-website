/**
 * Pull every recorded Tax Recap failure to a folder of JSON files.
 *
 *   npm run recap:failures -- <out-dir> [--status open|fixed|dismissed|all] [--limit N]
 *
 * Each file is the document the Failures page downloads — the numbers as
 * read, the meta, the entity's numbers, the reader's notes, and what the
 * engine said — so `npm run recap:replay -- <file>` runs it against the
 * engine as it is now. Written for working a batch of refusals at once
 * instead of downloading them one by one from the portal.
 *
 * Prints one line per failure: when, who, what shape, which engine, and
 * the first reason. The kept PDFs are not pulled (they're redacted copies
 * with a 14-day life; the numbers are what the engine needs).
 *
 * Reads the Firebase admin credential from .env.local by hand, like the
 * other scripts here — no dotenv. Runs on plain Node (24+).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const status = flag("status", "all");
const limit = Number(flag("limit", "500"));
if (!outDir) {
  console.error("usage: npm run recap:failures -- <out-dir> [--status open|fixed|dismissed|all] [--limit N]");
  process.exit(2);
}

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
for (const key of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) {
  if (!env[key]) {
    console.error(`Missing ${key} in .env.local`);
    process.exit(1);
  }
}
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

/** Firestore Timestamps → ISO strings, so the file is plain JSON. */
const plain = (v) => {
  if (v && typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};

let q = db.collection("taxRecapFailures").orderBy("createdAt", "desc").limit(limit);
if (status !== "all") q = q.where("status", "==", status);
const snap = await q.get();
mkdirSync(outDir, { recursive: true });

const rows = [];
for (const d of snap.docs) {
  const doc = plain({ id: d.id, ...d.data() });
  const when = (doc.createdAt ?? "").slice(0, 10) || "unknown";
  const safeName = String(doc.clientName ?? "client").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
  writeFileSync(join(outDir, `${when}-${safeName}-${d.id}.json`), JSON.stringify(doc, null, 2));
  rows.push(doc);
}

const pad = (s, w) => String(s ?? "").padEnd(w).slice(0, w);
console.log(`${rows.length} failure(s) → ${outDir}\n`);
console.log(`${pad("when", 11)}${pad("client", 26)}${pad("yr", 5)}${pad("st", 3)}${pad("entity", 7)}${pad("eng", 4)}${pad("status", 10)}${pad("stage", 9)} first reason`);
for (const r of rows) {
  const meta = r.meta ?? {};
  const first = (r.reasons ?? [])[0] ?? "";
  console.log(
    `${pad((r.createdAt ?? "").slice(0, 10), 11)}${pad(r.clientName, 26)}${pad(meta.taxYear, 5)}${pad(meta.stateCode, 3)}${pad(meta.entityForm ?? "1040", 7)}${pad(r.engineVersion, 4)}${pad(r.status, 10)}${pad(r.stage, 9)} ${first.slice(0, 110)}`,
  );
}
