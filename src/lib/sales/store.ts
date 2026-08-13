import "server-only";
import { randomUUID } from "node:crypto";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import {
  type Answer,
  CALL_TYPE_LABELS,
  type CallType,
  handleAnswer,
  leadSourceAnswer,
  phoneAnswer,
  referrerAnswer,
  revenueAnswer,
  suggestLeadSource,
} from "./options";
import type { ReferrerRow, SalesCallEdits, SalesCallRow } from "./types";

export type { ReferrerRow, SalesCallEdits, SalesCallRow };

/**
 * The sales pipeline, in Firestore. Replaces the client's Airtable SALES base.
 *
 * ONE COLLECTION, THREE VIEWS. Booked Calls, Deal Desk and Referrals are not
 * three tables — they're filters over `salesCalls`:
 *
 *   Booked Calls  every row
 *   Deal Desk     isSales || isReferral
 *   Referrals     isReferral
 *
 * Airtable models them as three tables and pays for it: a deal's status lives
 * in DEAL Desk *and* in REFERRALS, the two disagree, and the same person is
 * typed in twice under two spellings. Here a referred deal is one document —
 * edit its status on either tab and both tabs are correct, because there is
 * only one status. The client's own data justifies the collapse: of 4,532
 * booked calls, every one of the 130 flagged Referral is also flagged Sales.
 *
 * Two ownership zones inside each document, and the boundary is load-bearing:
 *
 *   CALENDLY-OWNED   who booked, when, which event, what they answered.
 *                    Overwritten on every sync. Never edited in the portal.
 *   OPERATOR-OWNED   the triage checkboxes and every Deal Desk / Referral
 *                    field. Written only by PATCH. A sync must never touch one.
 *
 * `upsertFromCalendly` enforces that boundary — see the comment there before
 * changing what it writes. Getting it wrong means a routine re-sync silently
 * wipes months of the client's manual work.
 *
 * Nothing reads this from the browser: firestore.rules denies all client access
 * and the Admin SDK bypasses rules, so no rules change is needed. Don't "fix"
 * that by opening a hole — these documents hold contact details, revenue and
 * deal values.
 */

const CALLS = "salesCalls";
const REFERRERS = "salesReferrers";

/* ────────────────────────────── shapes ────────────────────────────── */

/** Defaults for a brand-new row. Every operator field starts empty. */
const BLANK_EDITS: SalesCallEdits = {
  isSales: false,
  isReferral: false,
  archived: false,
  leadSource: null,
  showStatus: null,
  status: null,
  offer: null,
  paymentPlan: null,
  service: null,
  onboardingDate: null,
  objection: null,
  notes: null,
  referrerId: null,
  referralKind: null,
  commissionPreset: null,
  partnerCommission: null,
  refereeCommission: null,
  paid: false,
};

export const EDITABLE_KEYS = Object.keys(BLANK_EDITS) as (keyof SalesCallEdits)[];

/* ────────────────────────────── reads ────────────────────────────── */

const iso = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v;
  const d = (v as { toDate?: () => Date }).toDate?.();
  return d ? d.toISOString() : null;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function toRow(id: string, d: FirebaseFirestore.DocumentData): SalesCallRow {
  // NB: d.answers is intentionally not copied out — see the note in types.ts.
  // It stays on the document; it just doesn't travel to the browser.
  return {
    id,
    source: d.source ?? "calendly",
    callType: d.callType,
    callName: d.callName ?? "",
    name: d.name ?? "",
    email: d.email ?? "",
    phone: str(d.phone),
    socials: str(d.socials),
    revenueBand: str(d.revenueBand),
    timezone: str(d.timezone),
    bookedAt: iso(d.bookedAt),
    scheduledAt: iso(d.scheduledAt),
    calendlyStatus: d.calendlyStatus ?? null,
    rescheduled: Boolean(d.rescheduled),

    suggestedLeadSource: d.suggestedLeadSource ?? null,
    leadSourceRaw: str(d.leadSourceRaw),
    referrerRaw: str(d.referrerRaw),

    isSales: Boolean(d.isSales),
    isReferral: Boolean(d.isReferral),
    archived: Boolean(d.archived),
    leadSource: d.leadSource ?? null,
    showStatus: d.showStatus ?? null,
    status: d.status ?? null,
    offer: num(d.offer),
    paymentPlan: d.paymentPlan ?? null,
    service: d.service ?? null,
    onboardingDate: str(d.onboardingDate),
    objection: d.objection ?? null,
    notes: str(d.notes),

    referrerId: str(d.referrerId),
    referrerName: str(d.referrerName),
    referralKind: d.referralKind ?? null,
    commissionPreset: d.commissionPreset ?? null,
    partnerCommission: num(d.partnerCommission),
    refereeCommission: num(d.refereeCommission),
    paid: Boolean(d.paid),

    updatedAt: iso(d.updatedAt),
    updatedBy: str(d.updatedBy),
  };
}

/**
 * Every booked call, newest booking first.
 *
 * Unpaginated on purpose: the client's whole history across the three sales
 * event types is ~400 rows, and the grid filters and totals client-side. If
 * that ever stops being true, page here rather than in the component — the
 * Deal Desk's sums have to see every row to be right.
 */
export async function listSalesCalls(limit = 2000): Promise<SalesCallRow[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb()
    .collection(CALLS)
    .orderBy("bookedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => toRow(doc.id, doc.data()));
}

function toReferrer(id: string, d: FirebaseFirestore.DocumentData): ReferrerRow {
  return {
    id,
    name: d.name ?? "",
    aliases: Array.isArray(d.aliases) ? d.aliases : [],
    active: d.active !== false,
    showOnLeaderboard: d.showOnLeaderboard !== false,
    sanityCreatorId: str(d.sanityCreatorId),
    createdAt: iso(d.createdAt),
  };
}

export async function listReferrers(): Promise<ReferrerRow[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb().collection(REFERRERS).orderBy("name").get();
  return snap.docs.map((doc) => toReferrer(doc.id, doc.data()));
}

/* ────────────────────────────── writes ────────────────────────────── */

export class SalesStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesStoreError";
  }
}

/**
 * Apply an operator's edits.
 *
 * `edits` is a partial — only the keys present are written, so the grid can
 * PATCH one cell without sending the row back and racing another edit. The
 * caller is responsible for having validated every value against options.ts;
 * this only re-checks that no key outside EDITABLE_KEYS sneaks through, so a
 * malformed body can never reach a Calendly-owned field.
 *
 * `referrerName` is denormalised alongside `referrerId` so the grid and the
 * future leaderboard don't join on every read. It's refreshed here rather than
 * trusted from the client.
 */
export async function updateSalesCall(
  id: string,
  edits: Partial<SalesCallEdits>,
  actor: string,
): Promise<{ call: SalesCallRow; previousStatus: SalesCallRow["status"] }> {
  if (!isConfigured()) throw new SalesStoreError("Firebase is not configured");

  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    if (key in edits) patch[key] = edits[key] ?? null;
  }
  if (!Object.keys(patch).length) throw new SalesStoreError("No editable fields supplied");

  if ("referrerId" in patch) {
    const referrerId = patch.referrerId as string | null;
    if (referrerId) {
      const ref = await adminDb().collection(REFERRERS).doc(referrerId).get();
      if (!ref.exists) throw new SalesStoreError("Unknown referrer");
      patch.referrerName = ref.data()?.name ?? null;
    } else {
      patch.referrerName = null;
    }
  }

  patch.updatedAt = new Date();
  patch.updatedBy = actor;

  const doc = adminDb().collection(CALLS).doc(id);
  // The pre-read exists for the caller: a status flipping INTO "won" is what
  // rings the onboarding channel, and only the pre-image can tell a close
  // apart from an edit to an already-won deal.
  const before = await doc.get();
  if (!before.exists) throw new SalesStoreError("That call no longer exists");
  const previousStatus = (before.data()?.status ?? null) as SalesCallRow["status"];

  // update() rather than set(merge) so editing a row deleted between the read
  // above and now is an error the operator sees, not a resurrection.
  try {
    await doc.update(patch);
  } catch {
    throw new SalesStoreError("That call no longer exists");
  }
  const after = await doc.get();
  return { call: toRow(after.id, after.data()!), previousStatus };
}

/** What ingestion knows about a booking. Everything here is Calendly-owned. */
export interface CalendlyBooking {
  /** Invitee UUID — the document id, stable across re-syncs and reschedules. */
  inviteeId: string;
  callType: CallType;
  callName: string;
  name: string;
  email: string;
  timezone: string | null;
  textReminderNumber: string | null;
  bookedAt: string;
  scheduledAt: string;
  status: "active" | "canceled";
  rescheduled: boolean;
  answers: Answer[];
}

/**
 * Write a booking, creating it or refreshing it without disturbing the operator.
 *
 * THE MERGE IS THE POINT. A booking is re-seen constantly — the backfill script
 * re-reads history, the webhook fires again on cancel and reschedule — and each
 * time only the Calendly-owned half may be rewritten. Everything an operator
 * typed is absent from `payload`, so a `set(..., {merge: true})` leaves it
 * untouched by construction rather than by remembering to exclude it.
 *
 * The one exception is the first write, where `BLANK_EDITS` seeds the operator
 * fields and the triage checkboxes get their suggested defaults:
 *
 *   isSales     true for all three event types — every discovery call is a
 *               sales call. The client checks it on 390 of 390.
 *   isReferral  true only for the Referral Discovery Call, which is the one
 *               unambiguous signal. A creator's name in "How did you hear
 *               about us?" is NOT auto-checked — that answer is free text and
 *               the client asked not to trust it. It surfaces as a suggestion
 *               on the row instead.
 *
 * Both remain editable forever; these are opening positions, not conclusions.
 */
export async function upsertFromCalendly(booking: CalendlyBooking): Promise<"created" | "updated"> {
  if (!isConfigured()) throw new SalesStoreError("Firebase is not configured");

  const doc = adminDb().collection(CALLS).doc(booking.inviteeId);
  const existing = await doc.get();

  const leadSourceRaw = leadSourceAnswer(booking.answers);
  const payload: Record<string, unknown> = {
    source: "calendly",
    callType: booking.callType,
    callName: booking.callName,
    name: booking.name,
    email: booking.email,
    // The dedicated SMS field is the reliable one; the phone question is a
    // fallback for event types that don't collect a reminder number.
    phone: booking.textReminderNumber ?? phoneAnswer(booking.answers),
    socials: handleAnswer(booking.answers),
    revenueBand: revenueAnswer(booking.answers),
    timezone: booking.timezone,
    bookedAt: new Date(booking.bookedAt),
    scheduledAt: new Date(booking.scheduledAt),
    calendlyStatus: booking.status,
    rescheduled: booking.rescheduled,
    answers: booking.answers,
    leadSourceRaw,
    referrerRaw: referrerAnswer(booking.answers),
    suggestedLeadSource: suggestLeadSource(leadSourceRaw),
    syncedAt: new Date(),
  };

  if (!existing.exists) {
    await doc.set({
      ...BLANK_EDITS,
      isSales: true,
      isReferral: booking.callType === "referral",
      ...payload,
      createdAt: new Date(),
    });
    return "created";
  }

  await doc.set(payload, { merge: true });
  return "updated";
}

/* ─────────────────────────── manual rows ─────────────────────────── */

/** What the operator types into the "add a row" form. */
export interface ManualCallInput {
  name: string;
  email: string;
  phone: string | null;
  socials: string | null;
  callType: CallType;
  /** ISO yyyy-mm-dd. The pipeline sorts on this, so it isn't optional. */
  bookedAt: string;
  isSales: boolean;
  isReferral: boolean;
}

/**
 * A row that never came from Calendly — a call booked over DM, a deal typed in
 * from memory, a lead that arrived by phone.
 *
 * THE ID PREFIX IS LOAD-BEARING. Calendly rows are keyed on the invitee UUID,
 * and `upsertFromCalendly` addresses documents by that id. A `manual-` prefix
 * puts these outside that address space entirely, so no sync can ever adopt,
 * overwrite or resurrect one — the same guarantee that lets the backfill be
 * re-run at will.
 *
 * `source: "manual"` is what a reader of the document goes by; the prefix is
 * what the *machinery* goes by, and they must not be conflated.
 *
 * Deliberately NOT deduplicated against existing rows by email. The same person
 * legitimately books more than once, and a second discovery call six months
 * later is a second row in every other part of this system. The grid warns
 * about a matching email before submitting — a human decision, made with the
 * matching row on screen, rather than a silent merge.
 */
export async function createManualCall(
  input: ManualCallInput,
  actor: string,
): Promise<SalesCallRow> {
  if (!isConfigured()) throw new SalesStoreError("Firebase is not configured");

  const name = input.name.trim().slice(0, 200);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!name && !email) throw new SalesStoreError("A row needs a name or an email");

  const bookedAt = new Date(`${input.bookedAt}T12:00:00Z`);
  if (Number.isNaN(bookedAt.getTime())) throw new SalesStoreError("That date isn't valid");

  const id = `manual-${randomUUID()}`;
  const now = new Date();

  await adminDb()
    .collection(CALLS)
    .doc(id)
    .set({
      ...BLANK_EDITS,
      isSales: input.isSales,
      isReferral: input.isReferral,
      source: "manual",
      callType: input.callType,
      callName: CALL_TYPE_LABELS[input.callType],
      name,
      email,
      phone: input.phone?.trim().slice(0, 60) || null,
      socials: input.socials?.trim().slice(0, 300) || null,
      revenueBand: null,
      timezone: null,
      bookedAt,
      // No separate meeting time to record: whoever types a row in already
      // knows when the call was, and inventing one would look like Calendly data.
      scheduledAt: bookedAt,
      calendlyStatus: null,
      rescheduled: false,
      answers: [],
      leadSourceRaw: null,
      referrerRaw: null,
      suggestedLeadSource: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor,
    });

  const after = await adminDb().collection(CALLS).doc(id).get();
  return toRow(after.id, after.data()!);
}

/* ───────────────────────────── referrers ───────────────────────────── */

/** Slug used as the document id, so the same partner can't be added twice. */
export function referrerId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Add a partner, or return the one already there.
 *
 * Idempotent by slug: "Meghan Lim", "meghan lim" and "MEGHAN LIM" are one
 * record. That's the fix for the state the client is in — 64 free-text partner
 * names across 126 referrals, several of which are the same person under two
 * spellings, which is exactly why the totals can't be trusted today.
 */
export async function createReferrer(
  name: string,
  aliases: string[] = [],
): Promise<ReferrerRow> {
  if (!isConfigured()) throw new SalesStoreError("Firebase is not configured");
  const clean = name.trim();
  if (!clean) throw new SalesStoreError("A referrer needs a name");

  const id = referrerId(clean);
  if (!id) throw new SalesStoreError("That name has no usable characters");

  const doc = adminDb().collection(REFERRERS).doc(id);
  const existing = await doc.get();
  if (existing.exists) return toReferrer(id, existing.data()!);

  const createdAt = new Date();
  await doc.set({
    name: clean,
    aliases,
    active: true,
    showOnLeaderboard: true,
    sanityCreatorId: null,
    createdAt,
  });
  return {
    id,
    name: clean,
    aliases,
    active: true,
    showOnLeaderboard: true,
    sanityCreatorId: null,
    createdAt: createdAt.toISOString(),
  };
}

/** The fields the referrer manager may change. */
export interface ReferrerEdits {
  name?: string;
  aliases?: string[];
  active?: boolean;
  showOnLeaderboard?: boolean;
  sanityCreatorId?: string | null;
}

/**
 * Edit a partner.
 *
 * The document id is the slug of the ORIGINAL name and never changes on
 * rename — it's the foreign key on every call row, and rewriting keys to
 * chase a spelling would touch hundreds of documents for nothing. What does
 * get rewritten is the denormalised `referrerName` on every call that points
 * here, in one batch, so the grid and the leaderboard never show the old
 * spelling. The Airtable import left names in ALL CAPS; this is how the
 * client fixes "JUSTINE" to "Justine" everywhere at once.
 */
export async function updateReferrer(
  id: string,
  edits: ReferrerEdits,
): Promise<ReferrerRow> {
  if (!isConfigured()) throw new SalesStoreError("Firebase is not configured");
  const doc = adminDb().collection(REFERRERS).doc(id);
  const existing = await doc.get();
  if (!existing.exists) throw new SalesStoreError("Unknown referrer");

  const patch: Record<string, unknown> = {};
  if (edits.name !== undefined) {
    const clean = edits.name.trim().slice(0, 120);
    if (!clean) throw new SalesStoreError("A referrer needs a name");
    patch.name = clean;
  }
  if (edits.aliases !== undefined) {
    patch.aliases = edits.aliases
      .map((a) => String(a).trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 20);
  }
  if (edits.active !== undefined) patch.active = Boolean(edits.active);
  if (edits.showOnLeaderboard !== undefined) {
    patch.showOnLeaderboard = Boolean(edits.showOnLeaderboard);
  }
  if (edits.sanityCreatorId !== undefined) {
    const v = edits.sanityCreatorId;
    patch.sanityCreatorId =
      typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null;
  }
  if (!Object.keys(patch).length) throw new SalesStoreError("Nothing to change");

  await doc.update(patch);

  if (typeof patch.name === "string" && patch.name !== existing.data()?.name) {
    // Propagate the rename to the denormalised copy on every call row.
    const calls = await adminDb().collection(CALLS).where("referrerId", "==", id).get();
    for (let i = 0; i < calls.docs.length; i += 400) {
      const batch = adminDb().batch();
      for (const c of calls.docs.slice(i, i + 400)) {
        batch.update(c.ref, { referrerName: patch.name });
      }
      await batch.commit();
    }
  }

  const after = await doc.get();
  return toReferrer(after.id, after.data()!);
}

/**
 * Delete a partner — really delete only when nothing references them.
 *
 * A partner with calls attached deactivates instead: the picker stops offering
 * them, the leaderboard stops showing them, but the rows keep their name and
 * their history. Hard-deleting a referenced partner would leave orphaned
 * `referrerId`s pointing at nothing.
 */
export async function deleteReferrer(id: string): Promise<"deleted" | "deactivated"> {
  if (!isConfigured()) throw new SalesStoreError("Firebase is not configured");
  const doc = adminDb().collection(REFERRERS).doc(id);
  if (!(await doc.get()).exists) throw new SalesStoreError("Unknown referrer");

  const used = await adminDb()
    .collection(CALLS)
    .where("referrerId", "==", id)
    .limit(1)
    .get();

  if (used.empty) {
    await doc.delete();
    return "deleted";
  }
  await doc.update({ active: false, showOnLeaderboard: false });
  return "deactivated";
}
