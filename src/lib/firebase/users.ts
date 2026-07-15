import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import type { StaffUser } from "@/lib/firebase/session";

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
    };
  });
}
