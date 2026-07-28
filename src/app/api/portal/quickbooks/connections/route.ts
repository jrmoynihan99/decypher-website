import { NextResponse } from "next/server";
import { listConnections } from "@/lib/quickbooks/connections";
import { guard } from "../_guard";

/** Every connected company, without figures — the connections panel's list. */
export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ ok: true, connections: await listConnections() });
}
