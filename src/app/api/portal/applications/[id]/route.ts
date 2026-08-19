import { NextResponse } from "next/server";
import { badId, guard } from "../_guard";
import { asOption } from "@/lib/option-list";
import { applicationKeysOf, getApplicationOptions } from "@/lib/applications/config";
import { NOTES_MAX, type ApplicationPipeline } from "@/lib/applications/pipeline";
import {
  ApplicationStoreError,
  deleteApplication,
  updateApplicationPipeline,
} from "@/lib/application-store";

/**
 * One application: PATCH its pipeline fields, or DELETE it outright.
 *
 * PATCH takes one field at a time, like the sales grid — an every-field write
 * would make two people triaging the same applicant undo each other.
 *
 * Every value is re-derived from the live config rather than trusted, and an
 * unrecognised one becomes null instead of an error: the alternative is a row
 * that can't be saved because an option was retired underneath it. Validation
 * runs against ALL configured keys, retired included, so a row already holding
 * a retired option stays saveable.
 *
 * Nothing an applicant submitted is reachable from here. The parsers below are
 * the entire writable surface, and they only ever produce keys on the
 * `pipeline` map — see lib/applications/pipeline for why that split matters.
 */

type Parsers = {
  [K in keyof ApplicationPipeline]: (
    v: unknown,
    keys: Record<string, string[]>,
  ) => ApplicationPipeline[K];
};

const PARSERS: Parsers = {
  fit: (v, k) => asOption(v, k.fit),
  offer: (v, k) => asOption(v, k.offer),
  outcome: (v, k) => asOption(v, k.outcome),
  role: (v, k) => asOption(v, k.role),
  notes: (v) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, NOTES_MAX) : null,
};

const FIELDS = Object.keys(PARSERS) as (keyof ApplicationPipeline)[];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (badId(id)) {
    return NextResponse.json({ ok: false, message: "Bad application id" }, { status: 400 });
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
  const config = await getApplicationOptions();
  const keys = {
    fit: applicationKeysOf(config, "fit"),
    offer: applicationKeysOf(config, "offer"),
    outcome: applicationKeysOf(config, "outcome"),
    role: applicationKeysOf(config, "role"),
  };

  const patch: Partial<ApplicationPipeline> = {};
  for (const field of FIELDS) {
    if (!(field in raw)) continue;
    // The index signature loses the per-key correlation TypeScript needs to see
    // that parser and slot agree; they do, by construction of PARSERS above.
    (patch as Record<string, unknown>)[field] = PARSERS[field](raw[field], keys);
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json(
      { ok: false, message: "No editable fields in the request" },
      { status: 400 },
    );
  }

  try {
    const pipeline = await updateApplicationPipeline(id, patch, session.email);
    return NextResponse.json({ ok: true, pipeline });
  } catch (e) {
    if (e instanceof ApplicationStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[applications] update failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}

/**
 * Permanent, resume and all — see deleteApplication for why this collection
 * gets a real delete rather than the archive flag the sales grid uses. The UI
 * arms the button before it fires, which is the confirmation step.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (badId(id)) {
    return NextResponse.json({ ok: false, message: "Bad application id" }, { status: 400 });
  }

  try {
    await deleteApplication(id);
    console.info(`[applications] ${session.email} deleted application ${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[applications] delete failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't delete" }, { status: 500 });
  }
}
