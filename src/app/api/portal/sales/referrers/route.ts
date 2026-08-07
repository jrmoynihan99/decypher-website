import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { SalesStoreError, createReferrer, listReferrers } from "@/lib/sales/store";

/**
 * The referral partner roster.
 *
 * POST is deliberately reachable from the grid so a partner can be added in the
 * moment a referral arrives, without leaving the row. The alternative — a
 * separate admin screen — is what produced the state the client is in now: 64
 * free-text partner names across 126 referrals, several of them the same person
 * spelled differently, which is exactly why those totals can't be trusted.
 * Adding is idempotent by slug, so a double-click can't fork a partner in two.
 */

export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ ok: true, referrers: await listReferrers() });
}

export async function POST(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const name = (body as { name?: unknown })?.name;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ ok: false, message: "A name is required" }, { status: 400 });
  }

  try {
    const referrer = await createReferrer(name.slice(0, 120));
    return NextResponse.json({ ok: true, referrer });
  } catch (e) {
    if (e instanceof SalesStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[sales] couldn't add referrer:", e);
    return NextResponse.json({ ok: false, message: "Couldn't add" }, { status: 500 });
  }
}
