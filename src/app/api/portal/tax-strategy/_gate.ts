import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession, type StaffSession } from "@/lib/firebase/session";

/**
 * The Tax Strategy tab's access gate, for every route under
 * /api/portal/tax-strategy. Reachable directly over HTTP, so it never trusts
 * the page that called it. `needsAdmin` is for the shared vocabulary (tool
 * names); client records — S-corp clients, accountable plans — are the tax
 * team's day-to-day work and need only the tab.
 *
 * Returns the session or the response to send; callers discriminate with
 * `instanceof NextResponse`.
 */
export async function gate(needsAdmin = false): Promise<StaffSession | NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Server missing Firebase credentials" },
      { status: 500 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  }
  if (!session.permissions.includes("tax-strategy")) {
    return NextResponse.json(
      { ok: false, message: "No access to the tax strategy tab" },
      { status: 403 },
    );
  }
  if (needsAdmin && session.role !== "admin") {
    return NextResponse.json(
      { ok: false, message: "Only admins can do that" },
      { status: 403 },
    );
  }
  return session;
}

/** Who to record on a write: the name staff know each other by, else the login. */
export const actorName = (s: StaffSession) => s.displayName.trim() || s.email;
