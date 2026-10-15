import { NextResponse } from "next/server";
import { guard, actorName } from "../../_guard";
import { isValidCallId, sanitizeCall, sanitizeTeamPatch } from "@/lib/discovery/schema";
import { DiscoveryStoreError, deleteCall, replaceCall, updateTeam } from "@/lib/discovery/store";

/**
 * One saved discovery call.
 *
 *   PUT     `{ call, team? }` — the call re-saved by the call page (an answer
 *           changed, the next-call choice made); the whole answer set
 *           replaces the stored one, the team fields sent are merged.
 *   PATCH   a team patch — advisor, fit, fitReason, nextStep, notes, fathom;
 *           only the keys sent change. The inbox table and the drawer.
 *   DELETE  for good. A practice call by anyone with the inbox; a real call
 *           by an admin, as with client feedback (it feeds the close rate).
 *
 * PUT and PATCH answer `{ ok, call }` with the record as stored; DELETE
 * `{ ok }`. A call that's gone answers 404.
 */

type Ctx = { params: Promise<{ id: string }> };

const bad = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function fail(e: unknown, what: string) {
  if (e instanceof DiscoveryStoreError) return bad(e.message, e.status);
  console.error(`[setter-answers] ${what} failed:`, e);
  return bad(`Couldn’t ${what}`, 500);
}

export async function PUT(req: Request, { params }: Ctx) {
  const session = await guard("write");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (!isValidCallId(id)) return bad("Bad call id");
  const body = await readBody(req);
  if (!body) return bad("Expected an object");
  if (!body.call || typeof body.call !== "object") return bad("Expected { call }");
  try {
    const team = body.team !== undefined ? sanitizeTeamPatch(body.team) : null;
    const rec = await replaceCall(id, sanitizeCall(body.call), team, actorName(session));
    return NextResponse.json({ ok: true, call: rec });
  } catch (e) {
    return fail(e, "save");
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await guard("write");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (!isValidCallId(id)) return bad("Bad call id");
  const body = await readBody(req);
  if (!body) return bad("Expected an object");
  const patch = sanitizeTeamPatch(body);
  if (!Object.keys(patch).length) return bad("Nothing to change");
  try {
    const rec = await updateTeam(id, patch, actorName(session));
    return NextResponse.json({ ok: true, call: rec });
  } catch (e) {
    return fail(e, "save that change");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (!isValidCallId(id)) return bad("Bad call id");
  try {
    const gone = await deleteCall(id, { allowReal: session.role === "admin" });
    console.log(
      `[setter-answers] ${session.email} deleted ${gone.isTest ? "practice" : "real"} call ${id} (${gone.creatorName || "unnamed"})`,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "delete");
  }
}
