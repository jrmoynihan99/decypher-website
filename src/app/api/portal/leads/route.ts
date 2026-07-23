import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { listLeads } from "@/lib/lead-store";

/**
 * Estimator leads for the portal's Leads tab. Gated on the "leads" tab
 * permission, not on admin — and re-checked here rather than trusted from the
 * page, because a route handler is reachable directly over HTTP. Admins pass
 * automatically: session.permissions is pre-resolved to the full set for them.
 */

export async function GET() {
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
  if (!session.permissions.includes("leads")) {
    return NextResponse.json(
      { ok: false, message: "No access to leads" },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, leads: await listLeads() });
}
