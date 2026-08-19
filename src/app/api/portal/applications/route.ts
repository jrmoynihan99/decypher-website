import { NextResponse } from "next/server";
import { guard } from "./_guard";
import { listApplications } from "@/lib/application-store";

/**
 * Job applications for the portal's Applications tab — the Inbox list and the
 * Pipeline tracker both refresh through here, so both always see the same
 * rows, pipeline annotations included.
 */

export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  return NextResponse.json({ ok: true, applications: await listApplications() });
}
