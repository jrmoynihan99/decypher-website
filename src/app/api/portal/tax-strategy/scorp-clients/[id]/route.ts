import { NextResponse } from "next/server";
import { SCORP_ID_RE, sanitizeScorpClient } from "@/lib/tax-strategy/scorp";
import {
  ScorpStoreError,
  removeScorpClient,
  upsertScorpClient,
} from "@/lib/tax-strategy/scorp-store";
import { actorName, gate } from "../../_gate";

/**
 * One saved S-corp client. PUT replaces the whole record — the analyzer
 * always sends the full thing (a check, a tweak, an undo all rebuild it), so
 * there's no partial-merge path to get wrong. The path id wins over any id in
 * the body.
 */

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!SCORP_ID_RE.test(id)) {
    return NextResponse.json({ ok: false, message: "Bad client id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, message: "Expected an object" }, { status: 400 });
  }
  const rec = sanitizeScorpClient({ ...(body as Record<string, unknown>), id });
  if (!rec) {
    return NextResponse.json({ ok: false, message: "Bad client record" }, { status: 400 });
  }

  try {
    const client = await upsertScorpClient(id, rec, actorName(session));
    return NextResponse.json({ ok: true, client });
  } catch (e) {
    if (e instanceof ScorpStoreError) {
      return NextResponse.json(
        { ok: false, message: e.message },
        { status: e.code === "config" ? 500 : 400 },
      );
    }
    console.error("[scorp] update failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}

/** Delete a client permanently. Succeeds if it's already gone. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!SCORP_ID_RE.test(id)) {
    return NextResponse.json({ ok: false, message: "Bad client id" }, { status: 400 });
  }
  try {
    await removeScorpClient(id);
    console.log(`[scorp] ${session.email} deleted client ${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ScorpStoreError) {
      return NextResponse.json(
        { ok: false, message: e.message },
        { status: e.code === "config" ? 500 : 400 },
      );
    }
    console.error("[scorp] delete failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't delete" }, { status: 500 });
  }
}
