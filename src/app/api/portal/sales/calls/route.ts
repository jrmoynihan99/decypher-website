import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { CALL_TYPES, asDate, asOption } from "@/lib/sales/options";
import {
  SalesStoreError,
  createManualCall,
  listReferrers,
  listSalesCalls,
} from "@/lib/sales/store";

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

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/**
 * Add a row by hand — a call that was booked somewhere Calendly never saw.
 *
 * Only the Calendly-owned identity fields are accepted here, plus the two
 * triage checkboxes. Everything on the Deal Desk and Referrals tabs is left
 * empty and filled in through PATCH like any other row, so there is exactly one
 * code path that writes operator fields and one set of rules validating them.
 */
export async function POST(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, message: "Expected an object" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const callType = asOption(raw.callType, CALL_TYPES);
  if (!callType) {
    return NextResponse.json({ ok: false, message: "Pick a call type" }, { status: 400 });
  }
  const bookedAt = asDate(raw.bookedAt);
  if (!bookedAt) {
    return NextResponse.json(
      { ok: false, message: "Booked date must be a real yyyy-mm-dd date" },
      { status: 400 },
    );
  }

  try {
    const call = await createManualCall(
      {
        name: text(raw.name, 200) ?? "",
        email: text(raw.email, 200) ?? "",
        phone: text(raw.phone, 60),
        socials: text(raw.socials, 300),
        callType,
        bookedAt,
        isSales: raw.isSales !== false,
        isReferral: Boolean(raw.isReferral),
      },
      session.email,
    );
    return NextResponse.json({ ok: true, call });
  } catch (e) {
    if (e instanceof SalesStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[sales] manual create failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't add that row" }, { status: 500 });
  }
}
