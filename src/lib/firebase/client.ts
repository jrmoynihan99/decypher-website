"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";

/**
 * Browser-side Firebase, used for exactly one thing: exchanging an email +
 * password for an ID token, which we immediately hand to /api/portal/session
 * to be swapped for an httpOnly session cookie. Every gated read after that is
 * server-side off the cookie — the client SDK never talks to Firestore.
 *
 * Initialised lazily, on the sign-in click, and NOT at module scope. getAuth()
 * throws auth/invalid-api-key on bad config, and a client component's module
 * body still runs during SSR — so at module scope, one wrong env var 500s the
 * login page itself. Lazy keeps the failure inside the click handler where it
 * can be caught and explained.
 *
 * Persistence is deliberately per-tab rather than the default localStorage: the
 * session cookie is the durable credential, so there's no reason to also leave
 * a refresh token where XSS can reach it.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Whether the browser has enough config to attempt a sign-in at all. */
export function isFirebaseConfigured() {
  return Boolean(
    config.apiKey && config.authDomain && config.projectId && config.appId,
  );
}

let cached: Auth | null = null;

export function getAuthClient(): Auth {
  if (cached) return cached;

  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  setPersistence(auth, browserSessionPersistence).catch(() => {});
  cached = auth;
  return auth;
}
