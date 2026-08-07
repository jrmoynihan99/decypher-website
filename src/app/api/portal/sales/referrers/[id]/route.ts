import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import {
  SalesStoreError,
  deleteReferrer,
  updateReferrer,
  type ReferrerEdits,
} from "@/lib/sales/store";

/**
 * Edit or remove one referral partner. Renames propagate to the denormalised
 * `referrerName` on every call row (see updateReferrer); deletes degrade to
 * deactivation when calls reference the partner.
 */

function badId(id: string): boolean {
  return !id || id.length > 120 || id.includes("/");
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (badId(id)) {
    return NextResponse.json({ ok: false, message: "Bad referrer id" }, { status: 400 });
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

  const raw = body as Record<string, unknown>;
  const edits: ReferrerEdits = {};
  if (typeof raw.name === "string") edits.name = raw.name;
  if (Array.isArray(raw.aliases)) edits.aliases = raw.aliases.map(String);
  if (typeof raw.active === "boolean") edits.active = raw.active;
  if (typeof raw.showOnLeaderboard === "boolean") {
    edits.showOnLeaderboard = raw.showOnLeaderboard;
  }
  if ("sanityCreatorId" in raw) {
    edits.sanityCreatorId = typeof raw.sanityCreatorId === "string" ? raw.sanityCreatorId : null;
  }

  try {
    const referrer = await updateReferrer(id, edits);
    return NextResponse.json({ ok: true, referrer });
  } catch (e) {
    if (e instanceof SalesStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[sales] couldn't update referrer:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (badId(id)) {
    return NextResponse.json({ ok: false, message: "Bad referrer id" }, { status: 400 });
  }

  try {
    const outcome = await deleteReferrer(id);
    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    if (e instanceof SalesStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[sales] couldn't delete referrer:", e);
    return NextResponse.json({ ok: false, message: "Couldn't delete" }, { status: 500 });
  }
}
