import { NextResponse } from "next/server";
import { gate } from "./_gate";
import { RecapInputError, sanitizeRecapInput } from "@/lib/tax-recap/schema";
import { TaxRecapStoreError, createRecap } from "@/lib/tax-recap/store";

/**
 * Create a recap from reviewed numbers. The body is the full RecapInput —
 * client, year, both sets of numbers, strategies, next steps, and the raw
 * extraction as its audit trail. Everything is re-narrowed here; the review
 * grid is trusted for nothing.
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
    const input = sanitizeRecapInput(body);
    const recap = await createRecap(input, session.email);
    return NextResponse.json({ ok: true, recap });
  } catch (e) {
    if (e instanceof RecapInputError || e instanceof TaxRecapStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-recap] create failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}
