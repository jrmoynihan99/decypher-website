import { NextResponse } from "next/server";
import { guard, actorName } from "../_guard";
import { sanitizeCall, sanitizeTeam } from "@/lib/discovery/schema";
import { DiscoveryStoreError, createCall } from "@/lib/discovery/store";

/**
 * The first save of a discovery call, from the call page:
 * `{ call, team, isTest }` → `{ ok, call }` (the record as stored). The
 * answers are re-narrowed here; nothing from the browser is trusted as-is.
 * The practice flag is fixed at this save, as a feedback link's preview is.
 */
export async function POST(req: Request) {
  const session = await guard("write");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, message: "Expected an object" }, { status: 400 });
  }
  const b = body as { call?: unknown; team?: unknown; isTest?: unknown };
  if (!b.call || typeof b.call !== "object") {
    return NextResponse.json({ ok: false, message: "Expected { call }" }, { status: 400 });
  }

  try {
    const call = sanitizeCall(b.call);
    const team = sanitizeTeam(b.team);
    if (!team.advisor) team.advisor = actorName(session);
    const rec = await createCall(call, team, b.isTest === true, actorName(session));
    return NextResponse.json({ ok: true, call: rec }, { status: 201 });
  } catch (e) {
    if (e instanceof DiscoveryStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    }
    console.error("[setter-answers] save failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t save" }, { status: 500 });
  }
}
