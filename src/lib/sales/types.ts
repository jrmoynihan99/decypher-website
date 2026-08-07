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
  ReferralKind,
  ShowStatus,
} from "./options";

/* ───────────────────────── editable dropdowns ───────────────────────── */

/**
 * One entry in an editable dropdown.
 *
 * `key` is permanent — it's what a year of rows is written in, so the editor
 * can never change it. `label` and position are the editable parts; `retired`
 * hides an option from new picks while old rows keep rendering it. Deleting a
 * key outright would strand every row that holds it, which is why there is no
 * delete, only retire.
 */
export interface OptionItem {
  key: string;
  label: string;
  retired?: boolean;
}

/**
 * The dropdown lists an operator can edit, in display order.
 *
 * Two tiers, and the boundary is semantic, not arbitrary:
 * - `leadSource` / `service` / `paymentPlan` are pure vocabulary — rename,
 *   reorder, retire AND add freely. Nothing in the code branches on their keys.
 * - `dealStatus` / `showStatus` / `referralKind` allow rename + reorder only.
 *   Their keys drive money logic (DEAL_STATUS_META.counts decides what a
 *   commission pays and what the leaderboard ranks), so adding or retiring
 *   entries is not an edit, it's a code change.
 */
export interface SalesOptionsConfig {
  leadSource: OptionItem[];
  service: OptionItem[];
  paymentPlan: OptionItem[];
  dealStatus: OptionItem[];
  showStatus: OptionItem[];
  referralKind: OptionItem[];
}

export type EditableList = keyof SalesOptionsConfig;
/** The lists where adding and retiring keys is allowed. */
export const OPEN_LISTS = ["leadSource", "service", "paymentPlan"] as const;

/** The fields an operator may change. Exactly what PATCH accepts. */
export interface SalesCallEdits {
  isSales: boolean;
  isReferral: boolean;

  /**
   * Hidden from all three tabs. The "delete" the grid offers.
   *
   * Deliberately a flag rather than a document delete: rows are keyed on the
   * Calendly invitee UUID, so a deleted one is recreated by the next backfill
   * or by any reschedule/cancel webhook for the same invitee. A real delete
   * would look like it worked and quietly undo itself. Being operator-owned,
   * this survives every sync — see the ownership note in store.ts.
   */
  archived: boolean;

  /** A key from the editable leadSource list — plain string, not a union. */
  leadSource: string | null;
  showStatus: ShowStatus | null;
  status: DealStatus | null;
  /** The offer made, whole dollars. Airtable's DEAL Desk → Offer. */
  offer: number | null;
  paymentPlan: string | null;
  service: string | null;
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
  suggestedLeadSource: string | null;
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
  /** Inactive = hidden from the picker for new rows; old rows keep the name. */
  active: boolean;
  /**
   * On the public /leaderboard page. Defaults true; the switch exists for the
   * out-of-network people (gift-card referrers, one-off intros) the client
   * doesn't want ranked publicly.
   */
  showOnLeaderboard: boolean;
  /**
   * Explicit link to a Sanity `creator` document, for the photo. Set in the
   * referrer manager; when null the leaderboard falls back to a fuzzy name
   * match against the Sanity roster, and to initials when that misses too.
   */
  sanityCreatorId: string | null;
  createdAt: string | null;
}

/** A Sanity creator, trimmed to what the referrer manager needs. */
export interface CreatorOption {
  id: string;
  name: string;
  imageUrl: string | null;
}
