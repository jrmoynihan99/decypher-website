import { NextResponse } from "next/server";
import { gate } from "../_gate";
import {
  RecapInputError,
  asMoney,
  sanitizeExtract,
  sanitizeNextSteps,
  sanitizeNumbers,
  sanitizeStrategies,
} from "@/lib/tax-recap/schema";
import {
  TaxRecapStoreError,
  updateRecap,
  type RecapEdits,
} from "@/lib/tax-recap/store";

/**
 * Update a recap. Any subset of the RecapInput fields plus `revoked`; keys
 * that aren't present are left alone, so the list's "revoke link" button
 * and the builder's full re-save go through the same door.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!id || id.length > 200 || id.includes("/")) {
    return NextResponse.json({ ok: false, message: "Bad recap id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, message: "Expected an object" }, { status: 400 });
  }
  const r = body as Record<string, unknown>;

  const edits: RecapEdits = {};
  try {
    if ("clientName" in r) {
      const name = typeof r.clientName === "string" ? r.clientName.trim().slice(0, 80) : "";
      if (!name) throw new RecapInputError("A client name is required");
      edits.clientName = name;
    }
    if ("taxYear" in r) {
      const year = Number(r.taxYear);
      if (!Number.isInteger(year) || year < 2015 || year > 2040) {
        throw new RecapInputError("Tax year must be a four-digit year");
      }
      edits.taxYear = year;
    }
    if ("priorYearIncome" in r) edits.priorYearIncome = asMoney(r.priorYearIncome);
    if ("stateCode" in r) {
      const code = typeof r.stateCode === "string" ? r.stateCode.trim().toUpperCase() : "";
      edits.stateCode = /^[A-Z]{2}$/.test(code) ? code : null;
    }
    if ("before" in r) edits.before = sanitizeNumbers(r.before);
    if ("after" in r) edits.after = sanitizeNumbers(r.after);
    if ("strategies" in r) edits.strategies = sanitizeStrategies(r.strategies);
    if ("nextSteps" in r) edits.nextSteps = sanitizeNextSteps(r.nextSteps);
    if ("extraction" in r && r.extraction && typeof r.extraction === "object") {
      const ex = r.extraction as Record<string, unknown>;
      edits.extraction = {
        before: sanitizeExtract(ex.before),
        after: sanitizeExtract(ex.after),
      };
    }
    if ("revoked" in r) edits.revoked = Boolean(r.revoked);
  } catch (e) {
    if (e instanceof RecapInputError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    throw e;
  }

  if (!Object.keys(edits).length) {
    return NextResponse.json(
      { ok: false, message: "No editable fields in the request" },
      { status: 400 },
    );
  }

  try {
    const recap = await updateRecap(id, edits, session.email);
    return NextResponse.json({ ok: true, recap });
  } catch (e) {
    if (e instanceof TaxRecapStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-recap] update failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}
