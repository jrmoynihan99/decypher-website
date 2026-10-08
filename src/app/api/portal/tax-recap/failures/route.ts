import { NextResponse } from "next/server";
import { gate } from "../_gate";
import { TaxRecapFailureError, recordFailure, sanitizeFailureInput } from "@/lib/tax-recap/failures-store";

/**
 * Record a refused derivation: everything the engine was handed and what it
 * said (lib/tax-recap/failures-store). The builder posts it the moment the
 * engine refuses; no PDF comes with it.
 */
export async function POST(req: Request) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  try {
    const input = sanitizeFailureInput(body);
    const failure = await recordFailure(input, session.email);
    console.log(`[tax-recap] ${session.email} recorded failure ${failure.id} (${input.reasons.length} reasons)`);
    return NextResponse.json({ ok: true, id: failure.id });
  } catch (e) {
    if (e instanceof TaxRecapFailureError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-recap] record failure failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't record the failure" }, { status: 500 });
  }
}
