import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";

/**
 * The tools-hub access gate, shared by the catalog and logo routes.
 *
 * Two different gates, and the split is the point: everyone with the tab may
 * READ, but only an admin may write. The catalog is one document the whole
 * team's page renders from, so a typo in it is everyone's typo — the same
 * reason the Staff tab is admin-only.
 *
 * No route handler trusts that the page did the check — these are reachable
 * directly over HTTP.
 */
export async function gate(needsAdmin: boolean) {
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
  if (!session.permissions.includes("tools-hub")) {
    return NextResponse.json(
      { ok: false, message: "No access to the tools hub" },
      { status: 403 },
    );
  }
  if (needsAdmin && session.role !== "admin") {
    return NextResponse.json(
      { ok: false, message: "Only admins can edit the tool catalog" },
      { status: 403 },
    );
  }
  return session;
}
