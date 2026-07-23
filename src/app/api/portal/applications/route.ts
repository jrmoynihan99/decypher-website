import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { listApplications } from "@/lib/application-store";

/**
 * Job applications for the portal's Applications tab. Same posture as
 * /api/portal/leads: gated on the tab permission, re-checked here because the
 * route is reachable directly over HTTP, admins pass via the resolved set.
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
  if (!session.permissions.includes("applications")) {
    return NextResponse.json(
      { ok: false, message: "No access to applications" },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, applications: await listApplications() });
}
