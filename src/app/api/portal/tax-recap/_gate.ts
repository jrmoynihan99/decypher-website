import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";

/**
 * The tax-recap access gate. One level, not two: everyone with the tab is
 * the tax team, and building a recap IS writing one, so there's no read-only
 * tier to separate out. Reachable directly over HTTP, so it never trusts the
 * page that called it.
 */
export async function gate() {
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
  // "receipts" is the Tax Recap tab's key — see lib/permissions for why.
  if (!session.permissions.includes("receipts")) {
    return NextResponse.json({ ok: false, message: "No access to Tax Recap" }, { status: 403 });
  }
  return session;
}
