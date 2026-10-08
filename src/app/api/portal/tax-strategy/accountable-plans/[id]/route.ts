import { NextResponse } from "next/server";
import { gate, actorName } from "../../_gate";
import { isValidPlanId, sanitizePlanState } from "@/lib/tax-strategy/accountable-plan";
import {
  AccountablePlanStoreError,
  deletePlan,
  updatePlan,
} from "@/lib/tax-strategy/accountable-plan-store";

/**
 * One saved plan. PUT replaces its answers with `{ state }` — the whole plan,
 * as the builder holds it — and answers `{ ok, plan }` with the summary
 * recomputed server-side; who created it and when are kept. DELETE removes
 * it for good — `{ ok }`. A plan that's gone answers 404, which the builder
 * reads as "save it as a new record instead".
 */

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  // Becomes a Firestore document path — reject anything odd up front.
  if (!isValidPlanId(id)) {
    return NextResponse.json({ ok: false, message: "Bad plan id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  const state = (body as { state?: unknown } | null)?.state;
  if (!state || typeof state !== "object") {
    return NextResponse.json({ ok: false, message: "Expected { state }" }, { status: 400 });
  }

  try {
    const plan = await updatePlan(id, sanitizePlanState(state), actorName(session));
    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    if (e instanceof AccountablePlanStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    }
    console.error("[accountable-plans] update failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!isValidPlanId(id)) {
    return NextResponse.json({ ok: false, message: "Bad plan id" }, { status: 400 });
  }
  try {
    await deletePlan(id);
    console.log(`[accountable-plans] ${session.email} deleted plan ${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AccountablePlanStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    }
    console.error("[accountable-plans] delete failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't delete" }, { status: 500 });
  }
}
