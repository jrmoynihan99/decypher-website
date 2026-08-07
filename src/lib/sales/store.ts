import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import {
  type Answer,
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
  leadSource: null,
  showStatus: null,
  status: null,
  offer: null,
  paymentPlan: null,
  service: null,
  onboardingDate: null,
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
    leadSource: d.leadSource ?? null,
    showStatus: d.showStatus ?? null,
    status: d.status ?? null,
    offer: num(d.offer),
    paymentPlan: d.paymentPlan ?? null,
    service: d.service ?? null,
    onboardingDate: str(d.onboardingDate),
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

export async function listReferrers(): Promise<ReferrerRow[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb().collection(REFERRERS).orderBy("name").get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      name: d.name ?? "",
      aliases: Array.isArray(d.aliases) ? d.aliases : [],
      active: d.active !== false,
      createdAt: iso(d.createdAt),
    };
  });
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
): Promise<SalesCallRow> {
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
  // update() rather than set(merge) so editing a row that no longer exists is
  // an error the operator sees, not a resurrection of a deleted document.
  try {
    await doc.update(patch);
  } catch {
    throw new SalesStoreError("That call no longer exists");
  }
  const after = await doc.get();
  return toRow(after.id, after.data()!);
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
  if (existing.exists) {
    const d = existing.data()!;
    return {
      id,
      name: d.name ?? clean,
      aliases: Array.isArray(d.aliases) ? d.aliases : [],
      active: d.active !== false,
      createdAt: iso(d.createdAt),
    };
  }

  const createdAt = new Date();
  await doc.set({ name: clean, aliases, active: true, createdAt });
  return { id, name: clean, aliases, active: true, createdAt: createdAt.toISOString() };
}
