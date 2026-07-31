import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, adminDb, isConfigured } from "@/lib/firebase/admin";
import {
  parsePermissions,
  resolvePermissions,
  type PermissionKey,
} from "@/lib/permissions";

/**
 * The single gate every protected surface goes through. Nothing in the portal
 * is allowed to decide "is this person allowed in?" on its own — it asks here.
 *
 * Two decisions worth knowing about:
 *
 * 1. Role lives in Firestore, not in a Firebase custom claim. Claims get frozen
 *    into the session cookie when it's minted, so demoting an admin wouldn't
 *    take effect until their cookie expired — up to days later. A Firestore
 *    read costs one round-trip and is always correct.
 *
 * 2. verifySessionCookie is called with checkRevoked: true, which also costs a
 *    round-trip but is what makes "disable this person" work *now* rather than
 *    whenever their cookie happens to lapse. At staff scale that trade is free.
 */

export const SESSION_COOKIE = "dcy_session";

/** 5 days. Firebase's ceiling is 14; short enough that a stolen cookie ages out. */
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export type StaffRole = "admin" | "staff";

export type StaffUser = {
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
  disabled: boolean;
  createdAt: string | null;
  /** Explicit tab grants, or null when the doc predates permissions (= full access). */
  permissions: PermissionKey[] | null;
};

export type StaffSession = {
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
  /** Already resolved: admins and legacy docs hold every key. Check with .includes(). */
  permissions: PermissionKey[];
};

function userDoc(uid: string) {
  return adminDb().collection("users").doc(uid);
}

/**
 * Resolve the current signed-in staff member, or null. Wrapped in React's
 * cache() so a layout, a page and three server components in one render share
 * a single verify + Firestore read instead of doing five.
 */
export const getSession = cache(async (): Promise<StaffSession | null> => {
  if (!isConfigured()) return null;

  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const snap = await userDoc(decoded.uid).get();
    if (!snap.exists) return null;

    const data = snap.data() as Partial<StaffUser> | undefined;
    // Revoked in Firestore but the cookie hasn't been torn down yet — deny.
    if (!data || data.disabled) return null;

    const role: StaffRole = data.role === "admin" ? "admin" : "staff";
    return {
      uid: decoded.uid,
      email: data.email ?? decoded.email ?? "",
      displayName: data.displayName ?? "",
      role,
      permissions: resolvePermissions(role, parsePermissions(data.permissions)),
    };
  } catch {
    // Expired, revoked, malformed, or Firebase is unreachable. All of these
    // mean "not signed in" as far as callers are concerned.
    return null;
  }
});

/**
 * For pages/layouts: resolve a session or bounce to the login screen.
 *
 * The `stale` flag is load-bearing, not cosmetic. Getting here means a session
 * cookie was present (the proxy would have redirected otherwise) but didn't
 * survive verification. Without the flag the proxy sees that same cookie on the
 * login request and bounces it straight back to /portal — an infinite redirect
 * for anyone holding an expired or revoked cookie. The flag tells the proxy to
 * let this one through and bin the cookie on the way past.
 */
export async function requireSession(): Promise<StaffSession> {
  const session = await getSession();
  if (!session) redirect("/portal/login?stale=1");
  return session;
}

/** For pages/layouts: resolve an admin session or bounce to the dashboard. */
export async function requireAdmin(): Promise<StaffSession> {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/portal");
  return session;
}

/**
 * For pages/layouts: resolve a session that holds the given tab permission, or
 * bounce to the dashboard. The sidebar hiding a tab is tidiness; this is the
 * gate. session.permissions is pre-resolved, so a plain includes() is the whole
 * check — admins and grandfathered accounts already hold every key.
 */
export async function requirePermission(key: PermissionKey): Promise<StaffSession> {
  const session = await requireSession();
  if (!session.permissions.includes(key)) redirect("/portal");
  return session;
}
