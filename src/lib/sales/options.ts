/**
 * The vocabulary of the sales pipeline — every dropdown, in one place.
 *
 * Every list here was read off the client's live Airtable base (SALES,
 * appP8cXs7sdicj0E3) rather than invented, so an import lands without a
 * translation layer and the client recognises their own screen. Where this
 * file deliberately diverges from Airtable, the comment says why.
 *
 * Isomorphic on purpose: the grid renders these in the browser, the PATCH route
 * validates against them on the server, and both must agree or a value the UI
 * offers gets rejected on save. Nothing here may import Firebase or anything
 * server-only.
 *
 * The stored value is the key, never the label. Labels are display text and get
 * reworded; keys are what a year of history is written in. Renaming a key means
 * migrating documents, so don't.
 *
 * MONEY IS WHOLE DOLLARS throughout — not cents. Every figure in the source
 * base is a whole-dollar offer or commission (995, 1995, 750, 250) and there is
 * no sub-dollar amount anywhere in 576 deals. This differs from the QuickBooks
 * collections, which store cents; don't copy a helper between them.
 */

/* ─────────────────────────── call types ─────────────────────────── */

/**
 * The three event types that count as a sales call. Everything else on the
 * org's Calendly — QBO onboarding, tax manager, "Catch up w/OT" — is client
 * delivery, not pipeline, and never enters this tool.
 *
 * These keys mirror lib/calendly.ts's EVENT_TYPES, which owns the UUIDs.
 */
export const CALL_TYPES = ["qualified", "unqualified", "referral"] as const;
export type CallType = (typeof CALL_TYPES)[number];

export const CALL_TYPE_LABELS: Record<CallType, string> = {
  qualified: "Creator Discovery Call 1 📞",
  unqualified: "Creator Discovery Call 1 ☎️",
  referral: "Referral Discovery Call 📱",
};

/** Compact label for a narrow column. */
export const CALL_TYPE_SHORT: Record<CallType, string> = {
  qualified: "Discovery 📞",
  unqualified: "Discovery ☎️",
  referral: "Referral 📱",
};

/**
 * Retired event names still attached to historical rows, mapped onto the three
 * live types so an import doesn't drop 110 deals on the floor. Booked Calls
 * carries 110 "Creator Discovery Call 📞" and 13 "VidCon Creator Discovery
 * Call 📞" rows against event types that no longer exist in Calendly.
 *
 * Import-only. Live ingestion resolves by event-type UUID and never comes here.
 */
export const LEGACY_CALL_TYPE_NAMES: Record<string, CallType> = {
  "creator discovery call": "qualified",
  "creator discovery call 📞": "qualified",
  "creator discovery call 1 📞": "qualified",
  "vidcon creator discovery call 📞": "qualified",
  "discovery business call": "qualified",
  "creator discovery call 1 ☎️": "unqualified",
  "referral discovery call 📱": "referral",
  "decypher affiliate": "referral",
};

/* ─────────────────────────── lead source ─────────────────────────── */

/** Exactly Airtable's DEAL Desk → Lead Source, in its own order. */
export const LEAD_SOURCES = [
  "cold-email",
  "referral",
  "newsletter",
  "ads",
  "linkedin",
  "affiliate",
  "organic-content",
  "event",
  "google-seo",
  "organic-relationship",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  "cold-email": "Cold Email",
  referral: "Referral",
  newsletter: "Newsletter",
  ads: "Ads",
  linkedin: "LinkedIn",
  affiliate: "Affiliate",
  "organic-content": "Organic Content",
  event: "Event",
  "google-seo": "Google SEO",
  "organic-relationship": "Organic Relationship",
};

/** Airtable label → key, for the import. */
export const LEAD_SOURCE_BY_LABEL: Record<string, LeadSource> = Object.fromEntries(
  LEAD_SOURCES.map((k) => [LEAD_SOURCE_LABELS[k].toLowerCase(), k]),
);

/* ─────────────────────────── deal status ─────────────────────────── */

/**
 * The outcome of a deal — and ONLY the outcome.
 *
 * Airtable's Status column is overloaded: alongside the five real outcomes it
 * also carries NO SHOW (28 rows) and CANCELLED (6), which are attendance facts
 * that its own Show column already records. Kept as-is, a deal that no-showed
 * has no recoverable outcome, and "did they turn up" can contradict itself
 * across two columns.
 *
 * So the two axes are split here: attendance lives in ShowStatus, outcome lives
 * here, and the import routes NO SHOW / CANCELLED to the former. "Follow up
 * later" survives as an outcome because it has no attendance equivalent — it's
 * a genuine pipeline state and 8 deals are sitting in it.
 */
export const DEAL_STATUSES = [
  "won",
  "lost",
  "thinking",
  "won-backed-out",
  "not-a-fit",
  "follow-up-later",
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  won: "WON Closed",
  lost: "Lost",
  thinking: "Thinking about it",
  "won-backed-out": "WON then Backed Out",
  "not-a-fit": "Not a Fit",
  "follow-up-later": "Follow up later",
};

/**
 * How each status reads as a chip, and — more importantly — whether it counts.
 *
 * `counts` is the single definition of "this deal closed and a referral earned
 * its commission", used by the payout column now and by the public leaderboard
 * later. "won-backed-out" is deliberately false: the money came back, so the
 * credit does too. Change it here and every consumer follows.
 */
export const DEAL_STATUS_META: Record<
  DealStatus,
  { tone: "pos" | "warn" | "neg" | "mute"; counts: boolean }
> = {
  won: { tone: "pos", counts: true },
  lost: { tone: "neg", counts: false },
  thinking: { tone: "warn", counts: false },
  "won-backed-out": { tone: "neg", counts: false },
  "not-a-fit": { tone: "mute", counts: false },
  "follow-up-later": { tone: "warn", counts: false },
};

/** Airtable Status label (trimmed, lowercased) → our key. */
export const DEAL_STATUS_BY_LABEL: Record<string, DealStatus> = {
  "won closed": "won",
  lost: "lost",
  "thinking about it": "thinking",
  "won then backed out": "won-backed-out",
  "not a fit": "not-a-fit",
  "follow up later": "follow-up-later",
  // The REFERRALS table spells the same outcomes differently.
  closed: "won",
  "not fit": "not-a-fit",
  thinking_: "thinking",
};

/* ─────────────────────────── attendance ─────────────────────────── */

/** Exactly Airtable's DEAL Desk → Show. */
export const SHOW_STATUSES = ["showed", "no-show", "cancelled", "we-missed"] as const;
export type ShowStatus = (typeof SHOW_STATUSES)[number];

export const SHOW_STATUS_LABELS: Record<ShowStatus, string> = {
  showed: "Show",
  "no-show": "No Show",
  cancelled: "Cancelled",
  "we-missed": "We missed Call",
};

export const SHOW_STATUS_META: Record<ShowStatus, "pos" | "warn" | "neg" | "mute"> = {
  showed: "pos",
  "no-show": "neg",
  cancelled: "mute",
  "we-missed": "warn",
};

/* ─────────────────────────── payment plan ─────────────────────────── */

/** Exactly Airtable's DEAL Desk → Pmt PLAN. */
export const PAYMENT_PLANS = ["pif", "2-pay", "3-pay", "4-pay"] as const;
export type PaymentPlan = (typeof PAYMENT_PLANS)[number];

export const PAYMENT_PLAN_LABELS: Record<PaymentPlan, string> = {
  pif: "PIF",
  "2-pay": "2 Payments",
  "3-pay": "3 Payments",
  "4-pay": "4 Payments",
};

/* ────────────────────────── service sold ────────────────────────── */

/**
 * Exactly Airtable's DEAL Desk → Service sold. This is the client's real offer
 * catalogue; the counts in the comment are live deal volumes, kept as a hint
 * about which entries matter and which are nearly dead.
 *
 * "N/A" is a real, heavily-used value (43 deals) and not a null — it means the
 * call happened and nothing was sold, which is different from "not filled in".
 * Airtable's "x. Thinking about it" is dropped: it duplicates the status.
 */
export const SERVICES = [
  "launch-imp", // 208
  "grow-imp", // 35
  "sole-prop-tax", // 23
  "llc-imp", // 18
  "core-partnership", // 10
  "creator-partnership", // 10
  "scorp-tax", // 7
  "csuite-partnership", // 1
  "scale-imp", // 0 live, offered
  "basic-partnership", // 0 live, offered
  "ccorp-tax", // 0 live, offered
  "tax-only",
  "none", // 43 — sold nothing
] as const;
export type Service = (typeof SERVICES)[number];

export const SERVICE_LABELS: Record<Service, string> = {
  "launch-imp": "DeCypher LAUNCH Implementation",
  "grow-imp": "DeCypher GROW Implementation",
  "scale-imp": "DeCypher SCALE Implementation",
  "llc-imp": "LLC Implementation",
  "core-partnership": "DeCypher CORE Partnership Program",
  "creator-partnership": "DeCypher CREATOR Partnership Program",
  "csuite-partnership": "DeCypher C-SUITE Partnership Program",
  "basic-partnership": "DeCypher BASIC Partnership Program",
  "sole-prop-tax": "Single member/Sole prop Tax Package",
  "scorp-tax": "S-Corp/Partnership Tax Package",
  "ccorp-tax": "C-corp Tax Package",
  "tax-only": "TAX ONLY",
  none: "N/A",
};

export const SERVICE_BY_LABEL: Record<string, Service> = {
  ...Object.fromEntries(SERVICES.map((k) => [SERVICE_LABELS[k].toLowerCase(), k])),
  // REFERRALS → Offer Type Closed uses a coarser spelling for the same things.
  "core imp": "core-partnership",
  "creator imp": "creator-partnership",
  "llc only": "llc-imp",
  "tax only": "tax-only",
  "x. thinking about it": "none",
};

/* ─────────────────────────── referrals ─────────────────────────── */

/** Airtable REFERRALS → Referral Type. */
export const REFERRAL_KINDS = ["client", "outside"] as const;
export type ReferralKind = (typeof REFERRAL_KINDS)[number];

export const REFERRAL_KIND_LABELS: Record<ReferralKind, string> = {
  client: "DeCypher Client",
  outside: "Outside Referral",
};

/**
 * Commission presets, named as the client names them.
 *
 * "750/250" is $750 to the partner who sent the lead plus $250 to the person
 * referred — the bonus the Referral Discovery Call advertises on booking. The
 * preset only SEEDS the two amounts; both stay editable, because the live data
 * is full of exceptions: 42 rows carry a preset with $0/$0, and partner amounts
 * of 160, 300, 350 and 500 all appear against the "250" preset. Storing the two
 * figures and treating the preset as a shortcut is the only shape that survives
 * that. Never derive a payout from the preset at read time.
 */
export const COMMISSION_PRESETS = [
  { id: "750-250", label: "750 / 250", partner: 750, referee: 250 },
  { id: "250", label: "250", partner: 250, referee: 250 },
  { id: "custom", label: "Custom", partner: null, referee: null },
] as const;
export type CommissionPreset = (typeof COMMISSION_PRESETS)[number]["id"];

export const COMMISSION_PRESET_BY_LABEL: Record<string, CommissionPreset> = {
  "750/250": "750-250",
  "250": "250",
};

/** Commission is paid 60 days after the call was booked (Airtable's formula). */
export const PAYOUT_DELAY_DAYS = 60;

/** Payout date for a booking, as an ISO date (yyyy-mm-dd), or null. */
export function payoutDate(bookedAt: string | null): string | null {
  if (!bookedAt) return null;
  const d = new Date(bookedAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + PAYOUT_DELAY_DAYS);
  return d.toISOString().slice(0, 10);
}

/**
 * What this referral pays out in total, in whole dollars.
 *
 * Zero unless the deal actually closed — `DEAL_STATUS_META.counts` is the one
 * definition of that, so a status flipping from won to backed-out zeroes the
 * payout everywhere at once. Returns 0 rather than null so a column sums
 * without filtering first.
 */
export function commissionTotal(row: {
  status: DealStatus | null;
  partnerCommission: number | null;
  refereeCommission: number | null;
}): number {
  if (!row.status || !DEAL_STATUS_META[row.status].counts) return 0;
  return Math.round((row.partnerCommission ?? 0) + (row.refereeCommission ?? 0));
}

/** Just the partner's share — what the leaderboard will rank on. */
export function partnerPayout(row: {
  status: DealStatus | null;
  partnerCommission: number | null;
}): number {
  if (!row.status || !DEAL_STATUS_META[row.status].counts) return 0;
  return Math.round(row.partnerCommission ?? 0);
}

/* ──────────────── reading Calendly's answers ──────────────── */

/**
 * Everything below turns what an invitee typed into Calendly into a *suggestion*
 * for a dropdown. Suggestions are never written into the editable field — they
 * sit alongside it, the operator sees the raw answer and the guess, and picks.
 *
 * That separation is the whole design, and the client asked for it explicitly.
 * These are free-text-capable multi-selects on a form we don't control: the
 * answers include an "other" escape hatch, and Airtable's equivalent column has
 * already rotted into 233 distinct "choices" because every stray answer became
 * one. Auto-filling a column from them would look authoritative and be wrong,
 * and nobody would ever catch it. Suggest, don't decide.
 */

/** Loose match: case, punctuation and spacing in these answers are not stable. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Substrings of the "How did you hear about us?" choices, mapped to our own
 * vocabulary. Ordered — first hit wins — so specific entries sit above general
 * ones ("ugc foundations" before "ad", which would otherwise match inside it).
 */
const SOURCE_HINTS: [needle: string, source: LeadSource][] = [
  ["ugc foundations", "referral"],
  ["creator perks", "affiliate"],
  ["creator referral", "referral"],
  ["referral", "referral"],
  ["newsletter", "newsletter"],
  ["publish press", "newsletter"],
  ["linkedin", "linkedin"],
  ["google", "google-seo"],
  ["website", "google-seo"],
  ["email", "cold-email"],
  ["ad", "ads"],
];

/**
 * A multi_select answer arrives as one string with the picks run together —
 * newline-separated in practice, comma-separated in older records. Split on
 * both so a compound answer still matches on its first recognisable part.
 */
function answerParts(answer: string): string[] {
  return answer
    .split(/[\n,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Best guess at a lead source, or null when the answer is free text we can't place. */
export function suggestLeadSource(answer: string | null): LeadSource | null {
  if (!answer) return null;
  for (const part of answerParts(answer)) {
    const hay = ` ${norm(part)} `;
    for (const [needle, source] of SOURCE_HINTS) {
      // Word-boundary-ish so "ad" doesn't match inside "already".
      if (hay.includes(` ${needle} `) || hay.includes(needle)) return source;
    }
  }
  return null;
}

export type Answer = { question: string; answer: string; position: number };

const REFERRER_QUESTION = /who\s+referred\s+you/i;
const SOURCE_QUESTION = /how\s+did\s+you\s+hear/i;

/** The invitee's answer to a question matching `re`, or null. */
function findAnswer(answers: Answer[], re: RegExp): string | null {
  const hit = answers.find((a) => re.test(a.question));
  const value = hit?.answer?.trim();
  return value ? value : null;
}

/**
 * The raw text naming whoever sent this lead.
 *
 * Both questions are read, in priority order: the referral call asks outright,
 * and the two creator calls fold it into "How did you hear about us?" with the
 * instruction to name the creator in the OTHER box. A creator's name arriving
 * by the second route is exactly as much a referral as by the first — 152 of
 * the client's deals are sourced "Referral" against only 75 referral-call
 * bookings, so most referrals do arrive that way.
 */
export function referrerAnswer(answers: Answer[]): string | null {
  return findAnswer(answers, REFERRER_QUESTION) ?? findAnswer(answers, SOURCE_QUESTION);
}

export function leadSourceAnswer(answers: Answer[]): string | null {
  return findAnswer(answers, SOURCE_QUESTION) ?? findAnswer(answers, REFERRER_QUESTION);
}

/** The invitee's phone, from whichever question asked for a callback number. */
export function phoneAnswer(answers: Answer[]): string | null {
  return findAnswer(answers, /phone|call\s*back|callback/i);
}

/** Website or social handle, for identifying the lead at a glance. */
export function handleAnswer(answers: Answer[]): string | null {
  return findAnswer(answers, /website|social media handle/i);
}

/** Self-reported revenue band, useful context next to the deal. */
export function revenueAnswer(answers: Answer[]): string | null {
  return findAnswer(answers, /projected\s+yearly\s+revenue/i);
}

/**
 * Match a free-text referrer answer against the known partner list.
 *
 * Deliberately conservative — normalised substring in either direction, so
 * "Tran - UGC Foundations" and "Tran x UGC Foundations" meet, and null on
 * anything it isn't sure of rather than a guess at the nearest name. An
 * unmatched answer surfaces as "they said: …" beside an empty picker, which is
 * the right prompt to either pick someone or add a partner.
 *
 * Short names are the trap here — the live roster contains "PT", "ALI" and
 * "FOLA", and a two-character substring match would claim half the table. Names
 * under three characters only match a whole part exactly.
 */
export function matchReferrer<T extends { id: string; name: string; aliases?: string[] }>(
  answer: string | null,
  referrers: T[],
): T | null {
  if (!answer) return null;
  const parts = answerParts(answer).map(norm).filter(Boolean);
  if (!parts.length) return null;

  for (const referrer of referrers) {
    const names = [referrer.name, ...(referrer.aliases ?? [])].map(norm).filter(Boolean);
    for (const name of names) {
      if (!name) continue;
      if (name.length < 3) {
        if (parts.some((p) => p === name)) return referrer;
        continue;
      }
      if (parts.some((p) => p.includes(name) || name.includes(p))) return referrer;
    }
  }
  return null;
}

/* ─────────────────────────── validation ─────────────────────────── */

/** Narrow an untrusted string to a known key, or null. Used by the PATCH route. */
export function asOption<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** Narrow an untrusted value to a non-negative whole-dollar amount, or null. */
export function asMoney(value: unknown): number | null {
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Narrow an untrusted value to an ISO yyyy-mm-dd date, or null. */
export function asDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}
