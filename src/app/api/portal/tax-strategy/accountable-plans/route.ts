import { NextResponse } from "next/server";
import { gate, actorName } from "../_gate";
import { sanitizePlanRecord, sanitizePlanState } from "@/lib/tax-strategy/accountable-plan";
import {
  AccountablePlanStoreError,
  createPlan,
  importPlan,
  listPlans,
} from "@/lib/tax-strategy/accountable-plan-store";

/**
 * The team's saved accountable plans.
 *
 * GET lists them all, newest save first — `{ ok, plans }`.
 *
 * POST takes one of two bodies and answers `{ ok, plan }`:
 *   { state }   a plan from the builder — a new record
 *   { record }  one record from a backup file — restored on its own id when
 *               it has a valid one, so re-importing doesn't duplicate
 *
 * Either way the plan is re-narrowed here and its summary (estimated benefit,
 * per-vehicle methods, signature status) recomputed from it; the browser's
 * figures are trusted for nothing.
 */

export async function GET() {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json({ ok: true, plans: await listPlans() });
  } catch (e) {
    console.error("[accountable-plans] list failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't load saved plans" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await gate();
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
  const b = body as { state?: unknown; record?: unknown };

  try {
    if (b.record !== undefined) {
      const rec = sanitizePlanRecord(b.record);
      if (!rec) {
        return NextResponse.json({ ok: false, message: "That record has no plan in it" }, { status: 400 });
      }
      const plan = await importPlan(rec, actorName(session));
      return NextResponse.json({ ok: true, plan });
    }
    if (!b.state || typeof b.state !== "object") {
      return NextResponse.json({ ok: false, message: "Expected { state } or { record }" }, { status: 400 });
    }
    const plan = await createPlan(sanitizePlanState(b.state), actorName(session));
    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    if (e instanceof AccountablePlanStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    }
    console.error("[accountable-plans] save failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}
