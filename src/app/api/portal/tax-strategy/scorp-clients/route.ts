import { NextResponse } from "next/server";
import { newScorpId, sanitizeScorpClient } from "@/lib/tax-strategy/scorp";
import {
  ScorpStoreError,
  createScorpClient,
  listScorpClients,
} from "@/lib/tax-strategy/scorp-store";
import { actorName, gate } from "../_gate";

/**
 * The S-Corp Analyzer's saved clients. Tab permission only — this is the tax
 * team's day-to-day list, not shared vocabulary.
 *
 * GET returns every client plus `me`, the caller's display name, which the
 * analyzer stamps onto the history entries it writes (the server stamps
 * `updatedBy` itself). POST adds one client: the body is the record; an
 * absent id is generated, a supplied one (a backup import) must be a safe
 * document id and not already taken.
 */

export async function GET() {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  try {
    const clients = await listScorpClients();
    return NextResponse.json({ ok: true, clients, me: actorName(session) });
  } catch (e) {
    console.error("[scorp] couldn't list clients:", e);
    return NextResponse.json(
      { ok: false, message: "Couldn't load the client list" },
      { status: 500 },
    );
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, message: "Expected an object" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const id = raw.id == null || raw.id === "" ? newScorpId() : raw.id;
  const rec = sanitizeScorpClient({ ...raw, id });
  if (!rec) {
    return NextResponse.json({ ok: false, message: "Bad client id" }, { status: 400 });
  }

  try {
    const client = await createScorpClient(rec, actorName(session));
    return NextResponse.json({ ok: true, client }, { status: 201 });
  } catch (e) {
    if (e instanceof ScorpStoreError) {
      const status = e.code === "exists" ? 409 : e.code === "config" ? 500 : 400;
      return NextResponse.json({ ok: false, message: e.message }, { status });
    }
    console.error("[scorp] create failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}
