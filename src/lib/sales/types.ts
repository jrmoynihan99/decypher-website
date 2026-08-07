/**
 * Wire shapes for the sales pipeline.
 *
 * Separate from store.ts because store.ts is `server-only` and the grid is a
 * client component. `import type` is erased at compile time so importing from
 * there would technically work, but one accidental value import would poison
 * the browser bundle with the Admin SDK. Types live here; nothing in this file
 * may import anything with a runtime side effect.
 */

import type {
  CallType,
  CommissionPreset,
  DealStatus,
  LeadSource,
  PaymentPlan,
  ReferralKind,
  Service,
  ShowStatus,
} from "./options";

/** The fields an operator may change. Exactly what PATCH accepts. */
export interface SalesCallEdits {
  isSales: boolean;
  isReferral: boolean;

  leadSource: LeadSource | null;
  showStatus: ShowStatus | null;
  status: DealStatus | null;
  /** The offer made, whole dollars. Airtable's DEAL Desk → Offer. */
  offer: number | null;
  paymentPlan: PaymentPlan | null;
  service: Service | null;
  /** Onboarding date, ISO yyyy-mm-dd. Airtable's OB Date. */
  onboardingDate: string | null;
  notes: string | null;

  referrerId: string | null;
  referralKind: ReferralKind | null;
  commissionPreset: CommissionPreset | null;
  /** Whole dollars to the partner who sent the lead. */
  partnerCommission: number | null;
  /** Whole dollars to the person referred — the advertised booking bonus. */
  refereeCommission: number | null;
  paid: boolean;
}

export interface SalesCallRow extends SalesCallEdits {
  id: string;

  /* ── Calendly-owned. Rewritten on every sync; never edited in the portal. ── */
  source: "calendly" | "airtable" | "manual";
  callType: CallType;
  /** The event name as booked — retired names survive on historical rows. */
  callName: string;
  name: string;
  email: string;
  phone: string | null;
  socials: string | null;
  revenueBand: string | null;
  timezone: string | null;
  /** When they booked. Airtable's Date Booked; the pipeline sorts on this. */
  bookedAt: string | null;
  /** When the call actually is. */
  scheduledAt: string | null;
  calendlyStatus: "active" | "canceled" | null;
  rescheduled: boolean;

  /* ── Derived from the answers: a suggestion, never an answer to anything. ──
   *
   * The raw `answers` array is deliberately NOT on the wire. It's stored on the
   * document and is the source of everything below, but it is 60% of the
   * payload — 1.1MB of the 1.9MB for 824 rows, serialised twice (once in the
   * RSC flight data, once for hydration) — and the grid renders none of it.
   * A detail view that needs the full Q&A should fetch one document, not ship
   * every answer to every session. */
  suggestedLeadSource: LeadSource | null;
  /** Verbatim "How did you hear about us?", shown next to the dropdown. */
  leadSourceRaw: string | null;
  /** Verbatim "Who referred you?", shown next to the referrer picker. */
  referrerRaw: string | null;

  /** Denormalised for display and for the leaderboard's group-by. */
  referrerName: string | null;

  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ReferrerRow {
  id: string;
  name: string;
  /** Other spellings seen in the wild — "MEGHAN" for "MEGHAN LIM". */
  aliases: string[];
  active: boolean;
  createdAt: string | null;
}
