import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession, type StaffSession } from "@/lib/firebase/session";

/**
 * Shared gate for /api/portal/setter-answers/*. Same shape as feedback/_guard:
 * returns the session or the response to send.
 *
 * Two sides touch these records. The call itself (Tax Strategy → Sales
 * Discovery) writes a call and its drawer's staff fields, so `write` accepts
 * either tab; the Setter Answers inbox reads, edits and deletes, so `read`
 * needs its own key.
 */
export async function guard(need: "read" | "write" = "read"): Promise<StaffSession | NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json({ ok: false, message: "Server missing Firebase credentials" }, { status: 500 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  }
  const p = session.permissions;
  const allowed = need === "write" ? p.includes("setter-answers") || p.includes("tax-strategy") : p.includes("setter-answers");
  if (!allowed) {
    return NextResponse.json({ ok: false, message: "No access to setter answers" }, { status: 403 });
  }
  return session;
}

/** Who to record on a write: the name staff know each other by, else the login. */
export const actorName = (s: StaffSession) => s.displayName.trim() || s.email;
