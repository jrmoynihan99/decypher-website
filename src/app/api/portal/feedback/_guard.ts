import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession, type StaffSession } from "@/lib/firebase/session";

/**
 * Shared gate for /api/portal/feedback/*.
 *
 * Route handlers are reachable directly over HTTP, so each one re-checks rather
 * than trusting that the page did. Same shape as sales/_guard.ts: returns
 * either the session or the response to send, and callers discriminate with
 * `instanceof NextResponse`.
 */
export async function guard(): Promise<StaffSession | NextResponse> {
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
  if (!session.permissions.includes("client-feedback")) {
    return NextResponse.json(
      { ok: false, message: "No access to client feedback" },
      { status: 403 },
    );
  }
  return session;
}
