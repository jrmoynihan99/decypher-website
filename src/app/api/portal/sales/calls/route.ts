import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { listReferrers, listSalesCalls } from "@/lib/sales/store";

/**
 * The whole pipeline in one payload — calls and the referrer roster together,
 * because the grid can't render a referrer column without both and two requests
 * would let them arrive out of step.
 */
export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const [calls, referrers] = await Promise.all([listSalesCalls(), listReferrers()]);
  return NextResponse.json({ ok: true, calls, referrers });
}
