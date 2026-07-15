import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Privileged Firebase, holding the service-account credential. The
 * "server-only" import above is load-bearing: it turns any accidental import
 * from a client component into a build error rather than a leaked private key.
 *
 * Initialised lazily so that a missing/rotated credential surfaces as a 500 on
 * the request that needed it, rather than crashing the whole app at boot (and
 * so `next build` can prerender the public site without any of these set).
 */

function credentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase admin is not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    );
  }

  return cert({
    projectId,
    clientEmail,
    // Env vars can't hold real newlines, so the PEM is stored with literal "\n"
    // pairs and rehydrated here. Without this, cert() throws "Failed to parse
    // private key". Vercel's UI does allow real newlines, hence the tolerant
    // replace rather than a hard requirement either way.
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });
}

let cached: App | null = null;

function app(): App {
  if (cached) return cached;
  cached = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: credentials() });
  return cached;
}

export function adminAuth() {
  return getAuth(app());
}

export function adminDb() {
  return getFirestore(app());
}

/** True when the server has enough config to talk to Firebase at all. */
export function isConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}
