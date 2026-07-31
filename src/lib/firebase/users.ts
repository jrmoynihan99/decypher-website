import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { StaffUser } from "@/lib/firebase/session";
import { parsePermissions } from "@/lib/permissions";
import { absoluteUrl } from "@/lib/site-url";

/** The staff roster, read straight from Firestore. Shared by the admin page
 *  (which calls it server-side) and GET /api/portal/users (which the client
 *  polls after a mutation) so the two can't drift. */
export async function listStaff(): Promise<StaffUser[]> {
  const snap = await adminDb().collection("users").orderBy("createdAt", "asc").get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      uid: doc.id,
      email: d.email ?? "",
      displayName: d.displayName ?? "",
      role: d.role === "admin" ? "admin" : "staff",
      disabled: Boolean(d.disabled),
      createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
      // null = pre-permissions doc; resolves to full access everywhere.
      permissions: parsePermissions(d.permissions),
    };
  });
}

/**
 * A one-time set-password link for a staff account — the only way into an
 * invite-created login, and what both "Create account" and "Re-invite" hand
 * back to the admin.
 *
 * Two things this is careful about, both learned the hard way in production:
 *
 * 1. The continue URL is the canonical site origin, never the origin of the
 *    incoming request. Firebase only accepts continue URLs whose domain is
 *    allowlisted under Auth → Settings → Authorized domains, and a Vercel
 *    per-deployment hostname never will be. Bouncing a preview-deploy admin to
 *    the production login page is the right trade.
 *
 * 2. If the domain isn't allowlisted, Firebase rejects the entire call with
 *    auth/unauthorized-continue-uri — which used to take account creation down
 *    with it, since the account is minted before the link. So a rejected
 *    continue URL degrades to a bare link (still valid; it just doesn't offer
 *    the hop back to /portal/login afterwards) and shouts in the logs.
 */
export async function generateInviteLink(email: string): Promise<string> {
  const url = absoluteUrl("/portal/login");

  try {
    return await adminAuth().generatePasswordResetLink(email, {
      url,
      handleCodeInApp: false,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (
      code !== "auth/unauthorized-continue-uri" &&
      code !== "auth/invalid-continue-uri"
    ) {
      throw err;
    }
    console.error(
      `[portal] Firebase rejected the invite continue URL (${url}) with ${code}. ` +
        "Add that domain under Firebase Console → Authentication → Settings → " +
        "Authorized domains. Issuing a link without a continue URL for now.",
    );
    return adminAuth().generatePasswordResetLink(email);
  }
}
