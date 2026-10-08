/**
 * The client feedback survey's rules: who the teams are, what each survey
 * asks, how a set of answers is scored, and what a response record holds.
 *
 * Isomorphic on purpose. The survey page renders these questions, the submit
 * route re-scores the answers it's sent (a client's flags are never trusted),
 * and the portal re-derives every flag on read — one copy of the thresholds,
 * so the end screen a client sees, the follow-up the team gets and the number
 * on the scorecard can't drift apart.
 *
 * Field names are the survey prototype's, which were the advisor's spec
 * columns (`csat_overall`, `bookkeeping_nps_0_10`, …). They're kept snake_case
 * in Firestore and in the CSV, against this codebase's camelCase habit, so the
 * export lines up with the spreadsheets and the spec it was designed against.
 *
 * Three surveys share the record:
 *   onboarding  when onboarding moves to Done              s=onb (default)
 *   bookkeeping 2–3 months after onboarding, per quarter   s=bk  bq=2026-Q4
 *   tax         1–2 weeks after returns, per tax year      s=tax ty=2025
 *   both        bookkeeping and tax in one sitting         s=both
 * Bookkeeping and tax are each scored as their own team, so a "both" response
 * counts once for each.
 */

import {
  SURVEY_KINDS,
  SURVEY_KIND_LABELS,
  TEAM_PARAMS,
  defaultQuarter,
  defaultTaxYear,
  type SurveyKind,
  type TeamRole,
} from "./links";

export type { SurveyKind, TeamRole } from "./links";

export const SURVEY_VERSION = "fb-2026-10-v1";

/** Google Business "Ask for reviews" link. The promoter screen's QR encodes it. */
export const GOOGLE_REVIEW_URL = "https://g.page/r/CTZ-7NME4sXREAI/review";

/** Founder copied on every at-risk follow-up, until Team & setup says otherwise. */
export const DEFAULT_ESCALATION = "OT";

/**
 * Every answered team CSAT ≥ 4 AND NPS ≥ 7 → the review ask.
 * Any team CSAT ≤ 3 OR NPS ≤ 6 → the at-risk thank-you and a follow-up
 * (onboarding's flag also trips at confidence ≤ 3, per the advisor — the end
 * screen doesn't, exactly as the prototype routed it).
 */
export const THRESHOLDS = { promoterCsat: 4, promoterNps: 7, atRiskCsat: 3, atRiskNps: 6 } as const;

/** Pause between a tap and the next question, so the pick visibly lands. */
export const AUTO_ADVANCE_MS = 340;

/* ─────────────────────────────── teams ─────────────────────────────── */

export type TeamKey = "onboarding" | "bookkeeping" | "tax";
export const TEAM_KEYS: TeamKey[] = ["onboarding", "bookkeeping", "tax"];

export const TEAMS: Record<
  TeamKey,
  { short: SurveyKind; label: string; letter: string; owner: TeamRole; roles: TeamRole[] }
> = {
  onboarding: {
    short: "onb",
    label: "Onboarding",
    letter: "",
    owner: "onboarding_team_lead_id",
    roles: ["onboarding_team_lead_id", "onboarding_senior_id", "onboarding_staff_id"],
  },
  bookkeeping: {
    short: "bk",
    label: "Bookkeeping",
    letter: "A",
    owner: "bookkeeping_lead_id",
    roles: ["bookkeeping_lead_id", "bookkeeping_support_id"],
  },
  tax: {
    short: "tax",
    label: "Tax",
    letter: "B",
    owner: "tax_strategist_id",
    roles: ["tax_strategist_id", "tax_manager_id", "tax_senior_id", "tax_staff_id"],
  },
};

export const TEAM_ROLES = Object.keys(TEAM_PARAMS) as TeamRole[];

export const ROLE_LABELS: Record<TeamRole, string> = {
  onboarding_team_lead_id: "Onboarding team lead",
  onboarding_senior_id: "Onboarding senior",
  onboarding_staff_id: "Onboarding staff",
  bookkeeping_lead_id: "Bookkeeping lead",
  bookkeeping_support_id: "Bookkeeping support",
  tax_strategist_id: "Tax strategist",
  tax_manager_id: "Tax manager",
  tax_senior_id: "Tax senior",
  tax_staff_id: "Tax staff",
};

export const ROLE_LABELS_SHORT: Record<TeamRole, string> = {
  onboarding_team_lead_id: "Lead",
  onboarding_senior_id: "Senior",
  onboarding_staff_id: "Staff",
  bookkeeping_lead_id: "Lead",
  bookkeeping_support_id: "Support",
  tax_strategist_id: "Strategist",
  tax_manager_id: "Manager",
  tax_senior_id: "Senior",
  tax_staff_id: "Staff",
};

/** Who the link was sent with, frozen on the response as these fields. */
export type LinkField =
  | "link_onboarding_team_lead"
  | "link_onboarding_senior"
  | "link_onboarding_staff"
  | "link_bookkeeping_lead"
  | "link_bookkeeping_support"
  | "link_tax_strategist"
  | "link_tax_manager"
  | "link_tax_senior"
  | "link_tax_staff";

/** role → link parameter → payload field → team. */
export const LINK_ROLES: { role: TeamRole; param: string; field: LinkField; team: TeamKey }[] = [
  { role: "onboarding_team_lead_id", param: TEAM_PARAMS.onboarding_team_lead_id, field: "link_onboarding_team_lead", team: "onboarding" },
  { role: "onboarding_senior_id", param: TEAM_PARAMS.onboarding_senior_id, field: "link_onboarding_senior", team: "onboarding" },
  { role: "onboarding_staff_id", param: TEAM_PARAMS.onboarding_staff_id, field: "link_onboarding_staff", team: "onboarding" },
  { role: "bookkeeping_lead_id", param: TEAM_PARAMS.bookkeeping_lead_id, field: "link_bookkeeping_lead", team: "bookkeeping" },
  { role: "bookkeeping_support_id", param: TEAM_PARAMS.bookkeeping_support_id, field: "link_bookkeeping_support", team: "bookkeeping" },
  { role: "tax_strategist_id", param: TEAM_PARAMS.tax_strategist_id, field: "link_tax_strategist", team: "tax" },
  { role: "tax_manager_id", param: TEAM_PARAMS.tax_manager_id, field: "link_tax_manager", team: "tax" },
  { role: "tax_senior_id", param: TEAM_PARAMS.tax_senior_id, field: "link_tax_senior", team: "tax" },
  { role: "tax_staff_id", param: TEAM_PARAMS.tax_staff_id, field: "link_tax_staff", team: "tax" },
];
export const LINK_FIELDS = LINK_ROLES.map((r) => r.field);

/** The onboarding table's team columns: the bookkeeping lead is who they're handed to. */
export const ONB_ROLES: TeamRole[] = [
  "onboarding_team_lead_id",
  "onboarding_senior_id",
  "onboarding_staff_id",
  "bookkeeping_lead_id",
];
export const SVC_ROLES: TeamRole[] = LINK_ROLES.filter((r) => r.team !== "onboarding").map((r) => r.role);

/* ───────────────────────────── questions ───────────────────────────── */

export type QuestionType = "scale" | "squares" | "nps" | "choice" | "text";

export type Question = {
  id: string;
  team: TeamKey;
  tag: string;
  type: QuestionType;
  text: string;
  /** scale: one label per point, 1 first. */
  labels?: string[];
  /** squares / nps: the two ends. */
  ends?: [string, string];
  /** choice: [value, label]. */
  options?: [string, string][];
  optional?: boolean;
  /** text: needs at least a couple of characters to move on. */
  required?: boolean;
  placeholder?: string;
};

export const CSAT_LABELS = ["Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"];
export const NPS_ENDS: [string, string] = ["Not at all likely", "Extremely likely"];

export type Expectation = "exceeded" | "matched" | "fell_short";
export const EXPECTATION_OPTIONS: [Expectation, string][] = [
  ["exceeded", "Exceeded my expectations"],
  ["matched", "Matched my expectations"],
  ["fell_short", "Fell short of my expectations"],
];
export const EXPECT_SHORT: Record<Expectation, string> = {
  exceeded: "Exceeded",
  matched: "Matched",
  fell_short: "Fell short",
};

export const ONB_QUESTIONS: Question[] = [
  { id: "csat", team: "onboarding", tag: "OVERALL", type: "scale", text: "Overall, how satisfied are you with your onboarding experience with DeCypher so far?", labels: CSAT_LABELS },
  { id: "nps", team: "onboarding", tag: "RECOMMEND", type: "nps", text: "How likely are you to recommend DeCypher to another creator or small business owner?", ends: NPS_ENDS },
  { id: "clarity", team: "onboarding", tag: "NEXT STEPS", type: "squares", text: "How clear do you feel about what happens next (what we’ll do, what you’re responsible for, and key dates)?", ends: ["Very unclear", "Very clear"] },
  { id: "effort", team: "onboarding", tag: "EFFORT", type: "scale", text: "How easy did we make the onboarding for you (vs. you having to chase admin, forms, and tech yourself)?", labels: ["Much harder than expected", "Harder than expected", "About what I expected", "Easier than expected", "Much easier than expected"] },
  { id: "confidence", team: "onboarding", tag: "CONFIDENCE", type: "squares", text: "After onboarding, how confident do you feel about where you stand with taxes, bookkeeping, and your plan for this year?", ends: ["Not confident at all", "Extremely confident"] },
  { id: "fa_confidence", team: "onboarding", tag: "12-MONTH PLAN", type: "squares", text: "After your financial analysis, how confident do you feel with your plan for the next 12 months?", ends: ["Not confident at all", "Extremely confident"] },
  { id: "expectation", team: "onboarding", tag: "EXPECTATIONS", type: "choice", text: "Compared to what we described on the sales calls and in our content, your onboarding experience…", options: EXPECTATION_OPTIONS },
  { id: "best", team: "onboarding", tag: "BEST PART", type: "text", optional: true, text: "What was the most valuable part of onboarding for you?", placeholder: "A sentence or two is plenty" },
  { id: "improve", team: "onboarding", tag: "ONE FIX", type: "text", optional: true, text: "What is one thing we could have done to make onboarding better or easier?", placeholder: "Even small things help" },
];

export const SVC_QUESTIONS: Question[] = [
  // Section A: Bookkeeping
  { id: "bookkeeping_csat_1_5", team: "bookkeeping", tag: "BOOKKEEPING · OVERALL", type: "scale", text: "Overall, how satisfied are you with your bookkeeping experience with DeCypher over the last few months?", labels: CSAT_LABELS },
  { id: "bookkeeping_nps_0_10", team: "bookkeeping", tag: "BOOKKEEPING · RECOMMEND", type: "nps", text: "Based on your experience with our bookkeeping team, how likely are you to recommend DeCypher’s bookkeeping services to another creator or small business owner?", ends: NPS_ENDS },
  { id: "bookkeeping_reason_text", team: "bookkeeping", tag: "BOOKKEEPING · WHY", type: "text", required: true, text: "What is the main reason for your bookkeeping scores above?", placeholder: "A sentence or two is plenty" },
  { id: "bookkeeping_ease_1_5", team: "bookkeeping", tag: "BOOKKEEPING · EASE", type: "scale", optional: true, text: "How easy is it to keep your books up to date with us (sending statements, answering questions, etc.)?", labels: ["Very hard", "Hard", "Okay", "Easy", "Very easy"] },
  // Section B: Tax
  { id: "tax_csat_1_5", team: "tax", tag: "TAX · OVERALL", type: "scale", text: "Overall, how satisfied are you with your tax preparation and tax strategy experience with DeCypher this year?", labels: CSAT_LABELS },
  { id: "tax_nps_0_10", team: "tax", tag: "TAX · RECOMMEND", type: "nps", text: "Based on your experience with our tax team, how likely are you to recommend DeCypher’s tax services to another creator or small business owner?", ends: NPS_ENDS },
  { id: "tax_reason_text", team: "tax", tag: "TAX · WHY", type: "text", required: true, text: "What is the main reason for your tax scores above?", placeholder: "A sentence or two is plenty" },
  { id: "tax_clarity_1_5", team: "tax", tag: "TAX · CLARITY", type: "scale", optional: true, text: "How clear do you feel about your tax position and plan after working with our tax team this year?", labels: ["Very unclear", "Unclear", "Somewhat clear", "Clear", "Very clear"] },
];

export const ALL_QUESTIONS = [...ONB_QUESTIONS, ...SVC_QUESTIONS];

/** onb → onboarding · bk → bookkeeping · tax → tax · both → bookkeeping + tax. */
export function sectionsFor(kind: SurveyKind): TeamKey[] {
  return kind === "onb" ? ["onboarding"] : kind === "bk" ? ["bookkeeping"] : kind === "tax" ? ["tax"] : ["bookkeeping", "tax"];
}

export function questionsFor(kind: SurveyKind): Question[] {
  if (kind === "onb") return ONB_QUESTIONS;
  const secs = sectionsFor(kind);
  return SVC_QUESTIONS.filter((q) => secs.includes(q.team));
}

/** The two record shapes: onboarding has its own questions; bookkeeping and tax share one. */
export type SurveyFamily = "onboarding" | "service";
export const familyOf = (kind: SurveyKind): SurveyFamily => (kind === "onb" ? "onboarding" : "service");

/** A written answer counts once it's more than a stray keystroke. */
export const textOK = (v: unknown) => typeof v === "string" && v.trim().length >= 2;

/* ───────────────────────────── the record ───────────────────────────── */

/** What the client answered, in the advisor's column names. Null = not asked or skipped. */
export type ScoreFields = {
  csat_overall: number | null;
  nps_score: number | null;
  clarity_score: number | null;
  ease_score: number | null;
  confidence_score: number | null;
  fa_confidence_score: number | null;
  expectation_match: Expectation | null;
  most_valuable_text: string | null;
  improvement_text: string | null;
  bookkeeping_csat_1_5: number | null;
  bookkeeping_nps_0_10: number | null;
  bookkeeping_reason_text: string | null;
  bookkeeping_ease_1_5: number | null;
  tax_csat_1_5: number | null;
  tax_nps_0_10: number | null;
  tax_reason_text: string | null;
  tax_clarity_1_5: number | null;
};

export const SCORE_FIELDS: (keyof ScoreFields)[] = [
  "csat_overall", "nps_score", "clarity_score", "ease_score", "confidence_score", "fa_confidence_score",
  "expectation_match", "most_valuable_text", "improvement_text",
  "bookkeeping_csat_1_5", "bookkeeping_nps_0_10", "bookkeeping_reason_text", "bookkeeping_ease_1_5",
  "tax_csat_1_5", "tax_nps_0_10", "tax_reason_text", "tax_clarity_1_5",
];

export type LinkFields = Record<LinkField, string | null>;

/**
 * The only fields staff can change, kept in their own map on the response so
 * nothing about an edit can reach what the client said.
 */
export type TeamFields = Record<TeamRole, string | null> & {
  legal_name: string | null;
  brand_name: string | null;
  segment: string | null;
  package: string | null;
};
export const TEAM_FIELD_KEYS: (keyof TeamFields)[] = [...TEAM_ROLES, "legal_name", "brand_name", "segment", "package"];

export const emptyTeam = (): TeamFields =>
  Object.fromEntries(TEAM_FIELD_KEYS.map((k) => [k, null])) as TeamFields;

export const PACKAGES: [string, string][] = [
  ["creator", "Creator"],
  ["core", "Core"],
  ["c_suite", "C-Suite"],
  ["tax_only", "Tax-only"],
];
export const SEGMENTS: [string, string][] = [
  ["creator", "Creator"],
  ["creator_mgmt", "Creator mgmt"],
  ["small_biz", "Small biz"],
];
export const listLabel = (list: [string, string][], v: string | null) =>
  list.find((o) => o[0] === v)?.[1] ?? (v || "Not set");

export type NpsBand = "promoter" | "passive" | "detractor";

/** The flags, re-derived from the scores every time anything reads them. */
export type Flags = {
  teams: TeamKey[];
  /** Onboarding's band (the prototype's `nps_band` column); null on bookkeeping/tax. */
  nps_band: NpsBand | null;
  happy_for_review: boolean;
  at_risk_flag: boolean;
  onboarding_nps_band: NpsBand | null;
  onboarding_happy: boolean;
  onboarding_at_risk: boolean;
  bookkeeping_nps_band: NpsBand | null;
  bookkeeping_happy: boolean;
  bookkeeping_at_risk: boolean;
  tax_nps_band: NpsBand | null;
  tax_happy: boolean;
  tax_at_risk: boolean;
};

/** One client submission, as the portal receives it. Dates are ISO strings. */
export type FeedbackResponse = ScoreFields &
  LinkFields &
  Flags & {
    id: string;
    survey: SurveyFamily;
    kind: SurveyKind;
    sections: TeamKey[];
    survey_version: string;
    client_id: string | null;
    /** The tax recap the link came from, when it did. */
    recap_id: string | null;
    client_name: string;
    escalation: string | null;
    bookkeeping_period: string | null;
    tax_year: string | null;
    submitted_at: string | null;
    duration_sec: number | null;
    review_prompt_shown: boolean;
    review_link_clicked: boolean;
    review_link_clicked_at: string | null;
    is_test: boolean;
    onboarding_completed_at: string | null;
    team: TeamFields;
    team_updated_at: string | null;
    team_updated_by: string | null;
  };

export type TaskStatus = "open" | "done";

export type FeedbackTask = {
  task_id: string;
  team: TeamKey;
  kind: "at_risk";
  survey_id: string;
  client_id: string | null;
  priority: "high";
  status: TaskStatus;
  title: string;
  assignees: string[];
  /** yyyy-mm-dd */
  due_date: string;
  body: string;
  created_at: string | null;
  completed_at: string | null;
  is_test: boolean;
};

export type FeedbackSettings = {
  /** One dropdown list per role. Starts empty: the team adds the names. */
  lists: Record<TeamRole, string[]>;
  /** Founder on at-risk follow-ups. "" means nobody beyond the team owner. */
  escalation: string;
  /** Where the survey lives, for the TaxDome templates. "" = this site's /feedback. */
  baseUrl: string;
};

/* ───────────────────────────── scoring ───────────────────────────── */

export const npsBand = (n: number | null | undefined): NpsBand | null =>
  n == null ? null : n >= 9 ? "promoter" : n >= 7 ? "passive" : "detractor";

/** One team's headline numbers off a record, whichever survey it came from. */
export function teamScores(
  r: ScoreFields,
  t: TeamKey,
): { csat: number | null; nps: number | null; diag: number | null; reason: string } {
  if (t === "onboarding") {
    return {
      csat: r.csat_overall,
      nps: r.nps_score,
      diag: r.clarity_score,
      reason: r.improvement_text || r.most_valuable_text || "",
    };
  }
  if (t === "bookkeeping") {
    return {
      csat: r.bookkeeping_csat_1_5,
      nps: r.bookkeeping_nps_0_10,
      diag: r.bookkeeping_ease_1_5,
      reason: r.bookkeeping_reason_text || "",
    };
  }
  return { csat: r.tax_csat_1_5, nps: r.tax_nps_0_10, diag: r.tax_clarity_1_5, reason: r.tax_reason_text || "" };
}

export function teamFlags(f: Flags, t: TeamKey): { band: NpsBand | null; happy: boolean; atRisk: boolean } {
  if (t === "onboarding") return { band: f.onboarding_nps_band, happy: f.onboarding_happy, atRisk: f.onboarding_at_risk };
  if (t === "bookkeeping") return { band: f.bookkeeping_nps_band, happy: f.bookkeeping_happy, atRisk: f.bookkeeping_at_risk };
  return { band: f.tax_nps_band, happy: f.tax_happy, atRisk: f.tax_at_risk };
}

const lowCsat = (c: number | null) => c != null && c <= THRESHOLDS.atRiskCsat;
const lowNps = (n: number | null) => n != null && n <= THRESHOLDS.atRiskNps;
// "Happy" (the review-ready flag) wants a true promoter, 9+; the end screen's
// review ask is looser at 7+. Both are the prototype's, kept as they were.
const happy = (c: number | null, n: number | null) => c != null && c >= 4 && n != null && n >= 9;

/**
 * Per-team flags. A team is "in" a service response when it has either score;
 * the review-ready flag needs every team in it happy, the at-risk flag any one.
 */
export function deriveFlags(r: ScoreFields & { survey: SurveyFamily }): Flags {
  const out: Flags = {
    teams: [],
    nps_band: null,
    happy_for_review: false,
    at_risk_flag: false,
    onboarding_nps_band: null,
    onboarding_happy: false,
    onboarding_at_risk: false,
    bookkeeping_nps_band: null,
    bookkeeping_happy: false,
    bookkeeping_at_risk: false,
    tax_nps_band: null,
    tax_happy: false,
    tax_at_risk: false,
  };
  if (r.survey === "onboarding") {
    const c = r.csat_overall;
    const n = r.nps_score;
    const risk = lowCsat(c) || lowNps(n) || (r.confidence_score != null && r.confidence_score <= 3);
    out.teams = ["onboarding"];
    out.nps_band = out.onboarding_nps_band = npsBand(n);
    out.happy_for_review = out.onboarding_happy = happy(c, n);
    out.at_risk_flag = out.onboarding_at_risk = risk;
    return out;
  }
  for (const t of ["bookkeeping", "tax"] as const) {
    const { csat: c, nps: n } = teamScores(r, t);
    if (c == null && n == null) continue;
    out.teams.push(t);
    if (t === "bookkeeping") {
      out.bookkeeping_nps_band = npsBand(n);
      out.bookkeeping_happy = happy(c, n);
      out.bookkeeping_at_risk = lowCsat(c) || lowNps(n);
    } else {
      out.tax_nps_band = npsBand(n);
      out.tax_happy = happy(c, n);
      out.tax_at_risk = lowCsat(c) || lowNps(n);
    }
  }
  out.happy_for_review = out.teams.length > 0 && out.teams.every((t) => teamFlags(out, t).happy);
  out.at_risk_flag = out.teams.some((t) => teamFlags(out, t).atRisk);
  return out;
}

export type Segment = "promoter" | "passive" | "at_risk";

/**
 * Which end screen a set of answers earns, keyed by question id (the survey's
 * own state, and what the submit route receives). Onboarding has one CSAT/NPS
 * pair; bookkeeping/tax get the review ask only when EVERY section is happy,
 * and the at-risk screen when ANY section is unhappy.
 */
export function segmentFor(kind: SurveyKind, answers: Record<string, unknown>): Segment {
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const pairs: [number | null, number | null][] =
    kind === "onb"
      ? [[num(answers.csat), num(answers.nps)]]
      : sectionsFor(kind)
          .map((k): [number | null, number | null] => [num(answers[`${k}_csat_1_5`]), num(answers[`${k}_nps_0_10`])])
          .filter((p) => p[0] != null);
  if (!pairs.length) return "passive";
  if (pairs.some(([c, n]) => lowCsat(c) || lowNps(n))) return "at_risk";
  if (pairs.every(([c, n]) => c != null && c >= THRESHOLDS.promoterCsat && n != null && n >= THRESHOLDS.promoterNps)) {
    return "promoter";
  }
  return "passive";
}

/* ───────────────────────────── rounds ───────────────────────────── */

/**
 * Who a response belongs to, for "already answered" and for carrying the
 * team forward: the TaxDome client ID, else the tax recap it came from.
 */
export function dedupeKey(cid: string | null, rid: string | null): string | null {
  if (cid) return cid;
  if (rid) return `recap:${rid}`;
  return null;
}

export type RoundInfo = {
  survey: SurveyFamily;
  sections: TeamKey[];
  bookkeeping_period: string | null;
  tax_year: string | null;
};

/**
 * Has `existing` already answered the round `next` is about? Onboarding: once
 * per client. Bookkeeping/tax: once per section per quarter / tax year — so a
 * "both" response blocks a later bookkeeping-only one for the same quarter.
 */
export function sameRound(existing: RoundInfo, next: RoundInfo): boolean {
  if (next.survey === "onboarding") return existing.survey === "onboarding";
  if (existing.survey !== "service") return false;
  const bk =
    next.sections.includes("bookkeeping") &&
    existing.sections.includes("bookkeeping") &&
    existing.bookkeeping_period === next.bookkeeping_period;
  const tax =
    next.sections.includes("tax") &&
    existing.sections.includes("tax") &&
    String(existing.tax_year) === String(next.tax_year);
  return bk || tax;
}

/** The round a link points at, with the same defaults the survey page shows. */
export function roundOf(kind: SurveyKind, bq: string | null, ty: string | null, now = new Date()): RoundInfo {
  const sections = sectionsFor(kind);
  return {
    survey: familyOf(kind),
    sections,
    bookkeeping_period: sections.includes("bookkeeping") ? bq || defaultQuarter(now) : null,
    tax_year: sections.includes("tax") ? ty || defaultTaxYear(now) : null,
  };
}

/* ───────────────────────────── sanitizers ───────────────────────────── */

/** Caps on everything a public form can send. */
export const LIMITS = {
  body: 32_000,
  name: 120,
  person: 80,
  clientId: 100,
  recapId: 200,
  period: 24,
  text: 2000,
  record: 200,
  escalation: 80,
  baseUrl: 300,
  listSize: 100,
} as const;

/** Single-line text: whitespace collapsed, trimmed, capped. */
export const line = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
/** Multi-line text: newlines kept, trimmed, capped. */
const para = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Client-made submission id, doubling as the document id (so a retried send is idempotent). */
export const SURVEY_ID_RE = /^(onb|svc)_[a-z0-9]{12,48}$/;
/** A recap id is a Firestore auto-id; anything else isn't one. */
const RECAP_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

export type Submission = {
  survey_id: string;
  kind: SurveyKind;
  client_id: string | null;
  recap_id: string | null;
  client_name: string;
  escalation: string | null;
  bookkeeping_period: string | null;
  tax_year: string | null;
  duration_sec: number | null;
  is_test: boolean;
  /** Who the link named, for the kind's own sections only. */
  link: LinkFields;
  /** Validated answers by question id — what segmentFor reads. */
  answers: Record<string, number | string | null>;
  scores: ScoreFields;
};

/**
 * Narrow a submit body to a Submission, or say what's wrong. Every score is
 * checked for integer-ness and range against its question; answers for a
 * section the survey didn't ask are dropped; required answers must be there.
 */
export function sanitizeSubmission(raw: unknown, now = new Date()): { ok: true; value: Submission } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Expected an object" };
  const r = raw as Record<string, unknown>;

  const survey_id = typeof r.survey_id === "string" ? r.survey_id : "";
  if (!SURVEY_ID_RE.test(survey_id)) return { ok: false, error: "Bad survey id" };

  const kind = (SURVEY_KINDS as readonly unknown[]).includes(r.kind) ? (r.kind as SurveyKind) : null;
  if (!kind) return { ok: false, error: "Unknown survey" };
  if ((kind === "onb") !== survey_id.startsWith("onb_")) return { ok: false, error: "Survey id doesn’t match the survey" };
  const sections = sectionsFor(kind);

  const client_name = line(r.name, LIMITS.name);
  if (client_name.length < 2) return { ok: false, error: "Your name is required" };

  const client_id = line(r.cid, LIMITS.clientId) || null;
  const ridRaw = line(r.rid, LIMITS.recapId);
  const recap_id = RECAP_ID_RE.test(ridRaw) ? ridRaw : null;
  const round = roundOf(kind, line(r.bq, LIMITS.period) || null, line(r.ty, LIMITS.period) || null, now);

  const dur = r.duration_sec;
  const duration_sec =
    typeof dur === "number" && Number.isFinite(dur) && dur >= 0 ? Math.min(Math.round(dur), 86_400) : null;

  const teamIn = (r.team && typeof r.team === "object" ? r.team : {}) as Record<string, unknown>;
  const link = Object.fromEntries(LINK_FIELDS.map((f) => [f, null])) as LinkFields;
  for (const lr of LINK_ROLES) {
    if (!sections.includes(lr.team)) continue;
    link[lr.field] = line(teamIn[lr.role], LIMITS.person) || null;
  }

  // Test data only when the link said preview=1 (the page passes it on) and
  // names nobody: a link that names a client, a recap or a team member is a
  // real one, whatever the page claims. A plain link is real too.
  const is_test = r.preview === true && !client_id && !recap_id && Object.values(link).every((v) => !v);

  const ansIn = (r.answers && typeof r.answers === "object" ? r.answers : {}) as Record<string, unknown>;
  const answers: Record<string, number | string | null> = {};
  for (const q of questionsFor(kind)) {
    const v = ansIn[q.id];
    const given = v !== undefined && v !== null && v !== "";
    if (q.type === "text") {
      const t = para(v, LIMITS.text);
      if (q.required && !textOK(t)) return { ok: false, error: `Missing an answer: ${q.tag}` };
      answers[q.id] = t || null;
      continue;
    }
    if (!given) {
      if (!q.optional) return { ok: false, error: `Missing an answer: ${q.tag}` };
      answers[q.id] = null;
      continue;
    }
    if (q.type === "choice") {
      if (!q.options?.some(([val]) => val === v)) return { ok: false, error: `Invalid answer: ${q.tag}` };
      answers[q.id] = v as string;
      continue;
    }
    const [min, max] = q.type === "nps" ? [0, 10] : [1, q.labels?.length ?? 5];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      return { ok: false, error: `Invalid score: ${q.tag}` };
    }
    answers[q.id] = v;
  }

  const n = (id: string) => (typeof answers[id] === "number" ? (answers[id] as number) : null);
  const s = (id: string) => (typeof answers[id] === "string" ? (answers[id] as string) : null);
  const scores: ScoreFields = {
    csat_overall: n("csat"),
    nps_score: n("nps"),
    clarity_score: n("clarity"),
    ease_score: n("effort"),
    confidence_score: n("confidence"),
    fa_confidence_score: n("fa_confidence"),
    expectation_match: (s("expectation") as Expectation | null) ?? null,
    most_valuable_text: s("best"),
    improvement_text: s("improve"),
    bookkeeping_csat_1_5: n("bookkeeping_csat_1_5"),
    bookkeeping_nps_0_10: n("bookkeeping_nps_0_10"),
    bookkeeping_reason_text: s("bookkeeping_reason_text"),
    bookkeeping_ease_1_5: n("bookkeeping_ease_1_5"),
    tax_csat_1_5: n("tax_csat_1_5"),
    tax_nps_0_10: n("tax_nps_0_10"),
    tax_reason_text: s("tax_reason_text"),
    tax_clarity_1_5: n("tax_clarity_1_5"),
  };

  return {
    ok: true,
    value: {
      survey_id,
      kind,
      client_id,
      recap_id,
      client_name,
      escalation: line(r.esc, LIMITS.escalation) || null,
      bookkeeping_period: round.bookkeeping_period,
      tax_year: round.tax_year,
      duration_sec,
      is_test,
      link,
      answers,
      scores,
    },
  };
}

/**
 * A team edit, whitelisted: the nine roles, the client's names, segment and
 * package. Anything else in the body is ignored. Roles take any name (lists
 * change; a stored name outlives its list entry); segment and package must be
 * a known option, and an unknown one clears rather than errors.
 */
export function sanitizeTeamPatch(raw: unknown): Partial<TeamFields> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<TeamFields> = {};
  for (const role of TEAM_ROLES) if (role in r) out[role] = line(r[role], LIMITS.person) || null;
  for (const k of ["legal_name", "brand_name"] as const) if (k in r) out[k] = line(r[k], LIMITS.record) || null;
  if ("package" in r) out.package = PACKAGES.some(([v]) => v === r.package) ? (r.package as string) : null;
  if ("segment" in r) out.segment = SEGMENTS.some(([v]) => v === r.segment) ? (r.segment as string) : null;
  return out;
}

/** Settings off the wire or out of Firestore. Malformed degrades to the defaults, never throws. */
export function sanitizeSettings(raw: unknown): FeedbackSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const listsIn = (r.lists && typeof r.lists === "object" ? r.lists : {}) as Record<string, unknown>;
  const lists = {} as Record<TeamRole, string[]>;
  for (const role of TEAM_ROLES) {
    const l = Array.isArray(listsIn[role]) ? (listsIn[role] as unknown[]) : [];
    const seen = new Set<string>();
    lists[role] = [];
    for (const v of l) {
      const name = line(v, LIMITS.person);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      lists[role].push(name);
      if (lists[role].length >= LIMITS.listSize) break;
    }
  }
  let baseUrl = line(r.baseUrl, LIMITS.baseUrl).replace(/[?#].*$/, "");
  if (baseUrl && !/^https?:\/\/[^\s/]+/i.test(baseUrl)) baseUrl = "";
  return {
    lists,
    // Only a missing value takes the default: a founder cleared on purpose stays cleared.
    escalation: typeof r.escalation === "string" ? line(r.escalation, LIMITS.escalation) : DEFAULT_ESCALATION,
    baseUrl,
  };
}

/* ───────────────────────────── words ───────────────────────────── */

/** "A, B and C". */
export function joinNames(list: (string | null | undefined)[]): string {
  const l = list.filter((v): v is string => !!v);
  return l.length < 2 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}

export const kindLabel = (kind: SurveyKind) => SURVEY_KIND_LABELS[kind];
