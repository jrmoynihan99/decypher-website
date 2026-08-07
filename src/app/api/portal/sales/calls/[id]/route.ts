import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import {
  COMMISSION_PRESETS,
  DEAL_STATUSES,
  REFERRAL_KINDS,
  SHOW_STATUSES,
  asDate,
  asMoney,
  asOption,
} from "@/lib/sales/options";
import { getOptionsConfig, keysOf } from "@/lib/sales/config";
import { SalesStoreError, updateSalesCall } from "@/lib/sales/store";
import type { SalesCallEdits, SalesOptionsConfig } from "@/lib/sales/types";

/**
 * Save one cell.
 *
 * The grid PATCHes a single field at a time rather than the whole row, so two
 * staff editing different columns of the same deal don't clobber each other —
 * an every-field write would make the second save undo the first.
 *
 * Every value is re-derived from the allowed list rather than trusted, and an
 * unrecognised one becomes null instead of an error: the alternative is a row
 * that can't be saved because an option was retired underneath it. Keys outside
 * SalesCallEdits are dropped here and again in the store, so nothing from a
 * request body can reach a Calendly-owned field.
 */

const PRESET_IDS = COMMISSION_PRESETS.map((p) => p.id);

/**
 * Field name → how to narrow whatever arrived for it.
 *
 * Two validation regimes on purpose. The closed lists (status, show,
 * referral kind, preset) validate against the static unions — code branches
 * on those keys. The open lists (lead source, service, payment plan) validate
 * against the live config, because the client can add options there and a
 * freshly added key must save without a deploy.
 */
const PARSERS: {
  [K in keyof SalesCallEdits]: (v: unknown, config: SalesOptionsConfig) => SalesCallEdits[K];
} = {
  isSales: (v) => Boolean(v),
  isReferral: (v) => Boolean(v),
  paid: (v) => Boolean(v),
  archived: (v) => Boolean(v),

  leadSource: (v, c) => asOption(v, keysOf(c, "leadSource")),
  showStatus: (v) => asOption(v, SHOW_STATUSES),
  status: (v) => asOption(v, DEAL_STATUSES),
  paymentPlan: (v, c) => asOption(v, keysOf(c, "paymentPlan")),
  service: (v, c) => asOption(v, keysOf(c, "service")),
  referralKind: (v) => asOption(v, REFERRAL_KINDS),
  commissionPreset: (v) => asOption(v, PRESET_IDS),

  offer: asMoney,
  partnerCommission: asMoney,
  refereeCommission: asMoney,

  onboardingDate: asDate,

  // Free text. Trimmed, capped, and empty means cleared.
  notes: (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 2000) : null),
  // Validated against the referrers collection in the store, which is the only
  // place that can tell whether the id exists.
  referrerId: (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : null),
};

const FIELDS = Object.keys(PARSERS) as (keyof SalesCallEdits)[];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  // Becomes a Firestore document path — reject anything odd rather than hand an
  // arbitrary string to the store.
  if (!id || id.length > 200 || id.includes("/")) {
    return NextResponse.json({ ok: false, message: "Bad call id" }, { status: 400 });
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
  const config = await getOptionsConfig();
  const edits: Partial<SalesCallEdits> = {};
  for (const field of FIELDS) {
    if (!(field in raw)) continue;
    // The index signature loses the per-key correlation TypeScript needs to see
    // that parser and slot agree; they do, by construction of PARSERS above.
    (edits as Record<string, unknown>)[field] = PARSERS[field](raw[field], config);
  }

  if (!Object.keys(edits).length) {
    return NextResponse.json(
      { ok: false, message: "No editable fields in the request" },
      { status: 400 },
    );
  }

  try {
    const call = await updateSalesCall(id, edits, session.email);
    return NextResponse.json({ ok: true, call });
  } catch (e) {
    if (e instanceof SalesStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[sales] update failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}
