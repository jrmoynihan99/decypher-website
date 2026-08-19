import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession, type StaffSession } from "@/lib/firebase/session";

/**
 * Shared gate for /api/portal/applications/*.
 *
 * Route handlers are reachable directly over HTTP, so each one re-checks
 * rather than trusting that the page did. Modelled on sales/_guard.ts: returns
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
  if (!session.permissions.includes("applications")) {
    return NextResponse.json(
      { ok: false, message: "No access to applications" },
      { status: 403 },
    );
  }
  return session;
}

/**
 * A Firestore document id off the URL. It becomes a document path, so reject
 * anything odd rather than hand an arbitrary string to the store.
 */
export function badId(id: string): boolean {
  return !id || id.length > 200 || id.includes("/");
}
