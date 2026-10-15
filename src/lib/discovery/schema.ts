/**
 * Sales Discovery — the engine behind the discovery call (Tax Strategy →
 * Sales Discovery, run at /discovery-call) and the Setter Answers inbox tab
 * its answers land in.
 *
 * The advisor runs the call screen-shared with the creator: one question per
 * screen, branches opening on the answers (an S corp gets the payroll
 * questions, a non-US filer gets nothing past the first), a pop-up when an
 * answer is a red flag, and a recap at the end that books the next call.
 *
 * Everything that isn't rendering lives here so the call, the inbox and the
 * API agree: the question list and its branching, what counts as answered,
 * which answers trip a pop-up, the record built from the answers (what the
 * creator said — locked once saved), the staff record beside it (advisor,
 * fit, next step, notes — the drawer during the call, the table after), the
 * sanitizers the routes narrow every body through, the talking points, the
 * inbox filters and the CSV. Same shape as lib/feedback/schema.
 *
 * Ported from the sales team's standalone page; its question wording, option
 * lists, pop-up copy and talking points are kept verbatim — staff have run
 * calls on them — so diff against a new version of theirs before editing.
 *
 * Creator-facing wording says "prior year" / "current year" so nothing needs
 * editing as years roll; the record stores the actual years asked about.
 */

import { PERIODS, periodEnd, periodStart, type PeriodId } from "@/lib/feedback/analytics";

export const DISCOVERY_VERSION = "disc-2026-10-v3";

/** We recommend an LLC above this much a year. */
export const LLC_THRESHOLD = 20000;

/** Social Security wage base by year (SSA). Add each new year when SSA announces it (usually October). */
export const SS_WAGE_BASE: Record<number, number> = { 2025: 176100, 2026: 184500 };

/** The links the call hands the creator. */
export const LINKS = {
  /** Opens when they pick a review of their own return. */
  taxdome: "https://wedecypher.taxdome.com/app/inbox",
  /** "Book your next call". */
  calendly: "https://calendly.com/creator-support1/creator-review-call",
  /** Free credit card masterclass, pasted into the Zoom chat. */
  masterclass: "https://www.loom.com/share/baffb005be7546d98b1bc05b41841c49",
  /** Write-off guide, shown when business and personal are mixed. */
  writeoffs: "https://www.loom.com/share/3a88159d0f5947d684b200f5a1212240",
} as const;

/** What the next call is called on the end screen. */
export const SESSION_NAME = "Creator Tax Strategy Session";

/* ─────────────────────────────── years ─────────────────────────────── */

export const currentYear = (now = new Date()) => now.getFullYear();

/** Which return "last year's" means: the prior year from April 16 on, the year before that until then. */
export function taxYearAsked(now = new Date()): number {
  const cy = now.getFullYear();
  const pastDeadline = now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() > 15);
  return pastDeadline ? cy - 1 : cy - 2;
}

export function wageBase(now = new Date()): number {
  const years = Object.keys(SS_WAGE_BASE).map(Number);
  return SS_WAGE_BASE[now.getFullYear()] ?? SS_WAGE_BASE[Math.max(...years)];
}

/* ─────────────────────────────── lists ─────────────────────────────── */

export type Option = readonly [string, string];

export const LISTS = {
  source: [
    ["referral", "A referral"],
    ["email", "Email"],
    ["instagram", "Instagram"],
    ["tiktok", "TikTok"],
    ["youtube", "YouTube"],
    ["podcast", "A podcast or event"],
    ["search", "Google or an AI search"],
    ["other", "Somewhere else"],
  ],
  entity: [
    ["sole_prop", "No entity (sole prop)"],
    ["llc", "LLC, single member"],
    ["s_corp", "S corp"],
    ["partnership", "Partnership (2 or more people)"],
    ["c_corp", "C corp"],
  ],
  payroll_provider: [
    ["gusto", "Gusto"],
    ["adp", "ADP"],
    ["paychex", "Paychex"],
    ["other", "Another provider"],
  ],
  bank: [
    ["chase", "Chase"],
    ["boa", "Bank of America"],
    ["wells", "Wells Fargo"],
    ["capone", "Capital One"],
    ["mercury", "Mercury"],
    ["relay", "Relay"],
    ["bluevine", "Bluevine"],
    ["novo", "Novo"],
    ["other", "Another bank"],
  ],
  issuers: [
    ["amex", "American Express"],
    ["chase", "Chase"],
    ["capone", "Capital One"],
    ["boa", "Bank of America"],
    ["citi", "Citi"],
    ["discover", "Discover"],
    ["wells", "Wells Fargo"],
    ["ramp", "Ramp or Brex"],
    ["other", "Another card"],
  ],
  commingle: [
    ["yes", "Yes, it’s pretty mixed"],
    ["some", "Probably a little"],
    ["no", "No, it’s all separate"],
  ],
  filed_prior: [
    ["yes", "Yes"],
    ["extension", "I’m on an extension"],
    ["no", "No"],
  ],
  filing_status: [
    ["single", "Single"],
    ["hoh", "Head of household"],
    ["mfj", "Married filing jointly"],
    ["mfs", "Married filing separately"],
    ["unsure", "Not sure"],
  ],
  decider: [
    ["self", "I’m the final decision maker"],
    ["others", "I want to include someone"],
  ],
  filed_how: [
    ["hrb_store", "H&R Block, in person"],
    ["software", "Self-prepared through online software (TurboTax, FreeTaxUSA, H&R Block online)"],
    ["cpa", "A friend’s or parent’s accountant, or a traditional CPA"],
    ["other", "Something else"],
  ],
  streams: [
    ["brand_deals", "Brand deals"],
    ["ugc", "UGC"],
    ["adsense", "AdSense"],
    ["digital", "Digital products"],
    ["memberships", "Memberships"],
    ["subscriptions", "Subscriptions"],
    ["affiliate", "Affiliates"],
    ["coaching", "Coaching"],
    ["services", "Services"],
  ],
  revenue: [
    ["u50", "Under $50k"],
    ["50_100", "$50k–$100k"],
    ["100_250", "$100k–$250k"],
    ["250_500", "$250k–$500k"],
    ["500_1m", "$500k–$1M"],
    ["1m", "$1M+"],
  ],
  tracking: [
    ["none", "Not tracking it at all"],
    ["statements", "Combing through bank statements at the end of the year"],
    ["sheets", "My Excel empire (Excel or Google Sheets)"],
    ["qbo", "QuickBooks"],
    ["receipts", "Just receipts"],
    ["notes", "Notes app"],
    ["other_tool", "Another online tool"],
  ],
  yn: [
    ["yes", "Yes"],
    ["no", "No"],
  ],
  review_choice: [
    ["return", "Improvements based on my tax return"],
    ["example", "Review a creator example"],
  ],
  fit: [
    ["good", "Good fit"],
    ["maybe", "Not sure"],
    ["not_fit", "Not a fit"],
  ],
  fit_reason: [
    ["not_us", "Doesn’t file US taxes"],
    ["vibes", "Vibes: not the right fit"],
    ["other", "Something else"],
  ],
  next_step: [
    ["proposal", "Send proposal"],
    ["followup", "Book a follow-up"],
    ["won", "Signed"],
    ["lost", "Not moving forward"],
    ["none", "No next step"],
  ],
} as const satisfies Record<string, readonly Option[]>;

export type ListKey = keyof typeof LISTS;

/** Compact labels for tables and the recap, where the full option text is too long. */
const SHORT: Partial<Record<ListKey, Record<string, string>>> = {
  entity: { sole_prop: "Sole prop", llc: "Single-member LLC", s_corp: "S corp", partnership: "Partnership", c_corp: "C corp" },
  issuers: { amex: "Amex", capone: "Capital One", boa: "BofA", ramp: "Ramp/Brex", other: "Other" },
  bank: { boa: "BofA", capone: "Capital One", other: "Other" },
  filed_how: { hrb_store: "H&R Block (in person)", software: "Self-prepared (software)", cpa: "Friend/parent’s CPA", other: "Other" },
  tracking: { none: "Not tracking", statements: "Year-end statements", sheets: "Excel empire", qbo: "QuickBooks", receipts: "Receipts", notes: "Notes app", other_tool: "Other tool" },
  commingle: { yes: "Mixed", some: "A little", no: "Separate" },
  review_choice: { return: "Tax return", example: "Creator example" },
  filing_status: { single: "Single", hoh: "Head of household", mfj: "Married, joint", mfs: "Married, separate", unsure: "Not sure" },
  decider: { self: "Final decision maker", others: "Including someone" },
  source: { referral: "Referral", email: "Email", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", podcast: "Podcast/event", search: "Search", other: "Other" },
};

export const label = (list: ListKey, v: string | null | undefined): string =>
  (v && (LISTS[list] as readonly Option[]).find((o) => o[0] === v)?.[1]) || "";

export const short = (list: ListKey, v: string | null | undefined): string =>
  (v && SHORT[list]?.[v]) || label(list, v);

export const inList = (list: ListKey, v: unknown): v is string =>
  typeof v === "string" && (LISTS[list] as readonly Option[]).some((o) => o[0] === v);

/** "Other" entries carry a typed detail; this picks the detail or the short label. */
export const named = (list: ListKey, v: string | null, detail: string | null): string =>
  v === "other" ? detail || "Other" : short(list, v);

/* ─────────────────────────────── answers ─────────────────────────────── */

export type DateAnswer = { y?: string; m?: string; unsure?: boolean };
/** Per bank or card issuer: how many business and personal accounts. */
export type Counts = Record<string, { b: number; p: number }>;
export type AnswerValue = string | number | boolean | string[] | DateAnswer | Counts | null | undefined;
/** The in-progress call, keyed by question id (plus `_detail`, `_exact`, `_unsure`, `_none` suffixes). */
export type Answers = { name: string } & Record<string, AnswerValue>;

export const emptyAnswers = (): Answers => ({ name: "" });

export const strOf = (A: Answers, k: string): string => (typeof A[k] === "string" ? (A[k] as string) : "");
export const numOf = (A: Answers, k: string): number | null => (typeof A[k] === "number" ? (A[k] as number) : null);
export const boolOf = (A: Answers, k: string): boolean => A[k] === true;
export const listOf = (A: Answers, k: string): string[] => (Array.isArray(A[k]) ? (A[k] as string[]) : []);
export const dateOf = (A: Answers, k: string): DateAnswer =>
  A[k] && typeof A[k] === "object" && !Array.isArray(A[k]) ? (A[k] as DateAnswer) : {};
export const countsOf = (A: Answers, k: string): Counts =>
  A[k] && typeof A[k] === "object" && !Array.isArray(A[k]) ? (A[k] as Counts) : {};

export const countTotals = (c: Counts) =>
  Object.values(c).reduce((t, x) => ({ b: t.b + (x?.b || 0), p: t.p + (x?.p || 0) }), { b: 0, p: 0 });

/** Drop issuers with no cards, so the record only carries what was said. */
export const cleanCounts = (c: Counts): Counts =>
  Object.fromEntries(
    Object.entries(c)
      .filter(([, x]) => x && (x.b || x.p))
      .map(([k, x]) => [k, { b: x.b || 0, p: x.p || 0 }]),
  );

/** "Amex 3 business, 1 personal · Chase 1 business" */
export function countsText(c: Counts, detail: string | null, list: ListKey): string {
  return Object.entries(c)
    .map(([k, x]) => {
      const name = k === "other" ? detail || "Other" : short(list, k);
      return `${name} ${[x.b && `${x.b} business`, x.p && `${x.p} personal`].filter(Boolean).join(", ")}`;
    })
    .join(" · ");
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date answer as stored: "YYYY-MM", "YYYY", "unsure", or null. */
export const dateStr = (d: DateAnswer): string | null =>
  d.unsure ? "unsure" : d.y ? (d.m ? `${d.y}-${d.m}` : d.y) : null;

export const parseDateStr = (s: string | null): DateAnswer =>
  !s ? {} : s === "unsure" ? { unsure: true } : { y: s.slice(0, 4), m: s.length > 4 ? s.slice(5, 7) : "" };

export const fmtDateAnswer = (d: DateAnswer): string =>
  d.unsure ? "Not sure" : d.y ? (d.m ? `${MONTHS[Number(d.m) - 1]} ${d.y}` : d.y) : "";

export type RevenueBand = (typeof LISTS.revenue)[number][0];

export const bandFor = (n: number | null): RevenueBand | null =>
  n == null ? null
  : n < 50000 ? "u50"
  : n < 100000 ? "50_100"
  : n < 250000 ? "100_250"
  : n < 500000 ? "250_500"
  : n < 1000000 ? "500_1m"
  : "1m";

/* ─────────────────────────────── questions ─────────────────────────────── */

export const SECTIONS = {
  story: "Your story",
  setup: "Business setup",
  banking: "Banking",
  taxes: "Taxes",
  income: "Income",
} as const;
export type SectionKey = keyof typeof SECTIONS;

/** `say` is asked out loud with nothing to type in — Fathom has the notes. */
export type QuestionType = "say" | "choice" | "multi" | "date" | "counts" | "amount" | "money" | "revenue";

export type Question = {
  id: string;
  sec: SectionKey;
  type: QuestionType;
  text: string | ((A: Answers) => string);
  sub?: string;
  options?: readonly Option[];
  /** Big two-up tiles rather than numbered rows. */
  tiles?: boolean;
  required?: boolean;
  badges?: Record<string, string>;
  /** Option → label of the follow-up text field it opens. */
  reveal?: Record<string, string>;
  when?: (A: Answers) => boolean;
  /** counts: the issuer list, column heading, unit, and the labels of the extras. */
  list?: ListKey;
  col?: string;
  unit?: string;
  otherLabel?: string;
  noneLabel?: string;
  /** amount: the field label. */
  label?: string;
  /** revenue: the exact-amount field label. */
  exactLabel?: (A: Answers) => string;
};

/** Unanswered counts as yes, so the progress bar shows the full call up front. */
const us = (A: Answers) => A.us_filer !== "no";
const scorp = (A: Answers) => us(A) && A.entity === "s_corp";
const filed = (A: Answers) => A.filed_prior === "yes";
const filedOrExtended = (A: Answers) => us(A) && (A.filed_prior === "yes" || A.filed_prior === "extension");

export const QUESTIONS: Question[] = [
  { id: "origin", sec: "story", type: "say", text: "How did you become a content creator?", sub: "(What’s your creator hero’s journey?)" },
  { id: "source", sec: "story", type: "choice", text: "How did you hear about us?", options: LISTS.source, reveal: { referral: "Who referred you?", other: "Where did you find us?" } },
  { id: "prompt", sec: "story", type: "say", text: "What prompted you to book the call?", sub: "How can we help?" },
  { id: "us_filer", sec: "setup", type: "choice", tiles: true, required: true, text: "Do you file your taxes in the United States?", options: LISTS.yn },

  { id: "entity", sec: "setup", when: us, type: "choice", text: "What’s your entity structure?", options: LISTS.entity, badges: { llc: "Most common", s_corp: "Most common" } },
  { id: "llc_date", sec: "setup", when: (A) => us(A) && A.entity === "llc", type: "date", text: "When did you file the LLC?" },
  { id: "scorp_date", sec: "setup", when: scorp, type: "date", text: "When did you make the S corp election?" },
  { id: "payroll", sec: "setup", when: scorp, type: "choice", tiles: true, text: "Do you have payroll?", options: LISTS.yn },
  { id: "payroll_provider", sec: "setup", when: (A) => scorp(A) && A.payroll === "yes", type: "choice", text: "Who is your payroll provider?", options: LISTS.payroll_provider, badges: { gusto: "Most common" }, reveal: { other: "Which provider?" } },
  { id: "salary", sec: "setup", when: (A) => scorp(A) && A.payroll === "yes", type: "amount", text: "What’s your estimated salary?", label: "Estimated annual salary" },
  { id: "partnership_date", sec: "setup", when: (A) => us(A) && A.entity === "partnership", type: "date", text: "When did you file the partnership?" },

  { id: "banks", sec: "banking", when: us, type: "counts", text: "What bank accounts do you have?", list: "bank", col: "Bank", unit: "account", otherLabel: "Which bank?" },
  { id: "cards", sec: "banking", when: us, type: "counts", text: "What credit cards do you have?", list: "issuers", col: "Card", unit: "card", otherLabel: "Which card?", noneLabel: "No credit cards" },
  { id: "commingle", sec: "banking", when: us, type: "choice", text: "Is there a chance business and personal spending are mixed across your accounts and cards?", options: LISTS.commingle },

  { id: "filed_prior", sec: "taxes", when: us, type: "choice", text: "Did you file your prior-year tax return?", options: LISTS.filed_prior },
  { id: "filing_status", sec: "taxes", when: us, type: "choice", text: "How do you file?", options: LISTS.filing_status },
  { id: "filed_how", sec: "taxes", when: filedOrExtended, type: "choice", text: (A) => (A.filed_prior === "extension" ? "How are you filing it?" : "How did you file it?"), options: LISTS.filed_how, reveal: { other: "How did you file?" } },
  { id: "filed_dislike", sec: "taxes", when: (A) => filedOrExtended(A) && !!A.filed_how, type: "say", text: "What didn’t you like about the tax process?" },
  { id: "tax_owed", sec: "taxes", when: (A) => us(A) && filed(A), type: "money", text: "If you don’t mind us asking, how much did you owe on that return?" },

  { id: "streams", sec: "income", when: us, type: "multi", text: "Where does your income come from?", options: LISTS.streams },
  // Not filed yet: prior year first, then current year. Filed: current year first, prior year after (see visibleQuestions).
  { id: "rev_prior", sec: "income", when: us, type: "revenue", text: (A) => (filed(A) ? "What was your revenue for the prior year?" : "What’s your expected revenue for the prior year?"), exactLabel: (A) => (filed(A) ? "Exact amount, if you have it" : "Exact estimate, if you have one") },
  { id: "revenue", sec: "income", when: us, type: "revenue", text: "What’s your expected income for the current year?", exactLabel: () => "Exact estimate, if you have one" },
  { id: "tracking", sec: "income", when: us, type: "multi", text: "How are you capturing your income and expenses today?", options: LISTS.tracking, reveal: { other_tool: "Which tool?" } },
];

export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

export const questionText = (q: Question, A: Answers): string => (typeof q.text === "function" ? q.text(A) : q.text);

/** The questions this call asks, in order, given the answers so far. */
export function visibleQuestions(A: Answers): Question[] {
  const v = QUESTIONS.filter((q) => !q.when || q.when(A));
  // Filed the prior-year return: ask about the current year first, the prior year second.
  const i = v.findIndex((q) => q.id === "rev_prior");
  const j = v.findIndex((q) => q.id === "revenue");
  if (A.filed_prior === "yes" && i >= 0 && j > i) [v[i], v[j]] = [v[j], v[i]];
  return v;
}

export function answered(q: Question, A: Answers): boolean {
  const a = A[q.id];
  if (q.type === "say") return true;
  if (q.type === "multi") return listOf(A, q.id).length > 0;
  if (q.type === "date") {
    const d = dateOf(A, q.id);
    return !!(d.unsure || d.y);
  }
  if (q.type === "money") return numOf(A, "total_tax") != null || boolOf(A, "tax_unsure");
  if (q.type === "amount") return numOf(A, q.id) != null || boolOf(A, `${q.id}_unsure`);
  if (q.type === "counts") {
    const t = countTotals(countsOf(A, q.id));
    return boolOf(A, `${q.id}_none`) || t.b + t.p > 0;
  }
  if (q.type === "revenue") return numOf(A, `${q.id}_exact`) != null || (boolOf(A, `${q.id}_unsure`) && !!a);
  return a !== undefined && a !== "" && a !== null;
}

/* ─────────────────────────────── pop-ups ─────────────────────────────── */

export type FlagKey = "scorp_payroll" | "llc" | "veil" | "mixed" | "biz_bank" | "wage_base";
/** The dialogs with their own body rather than a flag's copy. */
export type DialogKey = FlagKey | "points" | "decider";

export type FlagCopy = {
  eyebrow: "Red flag" | "Our recommendation";
  title: string;
  body: string[];
  /** The reassuring last line. */
  good?: string;
  /** A Loom link to copy into the Zoom chat. */
  guide?: "writeoffs";
};

/** Pop-up copy: one-line title, one or two short sentences. Keep them scannable on a screen share. */
export function flagCopy(key: FlagKey, now = new Date()): FlagCopy {
  switch (key) {
    case "scorp_payroll":
      return {
        eyebrow: "Red flag",
        title: "S corp with no payroll is a red flag.",
        body: ["The IRS expects you to pay yourself a reasonable salary. Without payroll, your distributions can be taxed as wages, plus penalties."],
        good: "It’s fixable, and it’s one of the first things we’d set up.",
      };
    case "llc":
      return {
        eyebrow: "Our recommendation",
        title: `Making over $${LLC_THRESHOLD / 1000}k a year? Get an LLC.`,
        body: ["It keeps your personal assets separate, so a lawsuit against the business generally stays with the business."],
      };
    case "veil":
      return {
        eyebrow: "Red flag",
        title: "Mixing business and personal is a red flag.",
        body: ["If you’re sued, a court is more likely to hold you personally liable. If you’re audited, it’s harder to prove your business expenses."],
        good: "The fix: keep business and personal completely separate.",
        guide: "writeoffs",
      };
    case "mixed":
      return {
        eyebrow: "Our recommendation",
        title: "Keep business and personal separate.",
        body: ["Mixed accounts make your write-offs harder to track and harder to prove."],
        guide: "writeoffs",
      };
    case "biz_bank":
      return {
        eyebrow: "Our recommendation",
        title: "Open a bank account just for the business.",
        body: ["It makes your income and expenses easy to track and your taxes simpler."],
      };
    case "wage_base":
      return {
        eyebrow: "Our recommendation",
        title: `Cap your salary at ${fmtMoney(wageBase(now))}.`,
        body: [`That’s the ${now.getFullYear()} Social Security wage base. Salary above it still pays Medicare tax, so you’d overpay on payroll tax.`],
      };
  }
}

/** Stop and explain before moving on: an S corp with no payroll, no entity at all, mixed spending. */
export function flagForPick(q: Question, v: string, A: Answers): FlagKey | null {
  if (q.id === "payroll" && v === "no" && A.entity === "s_corp") return "scorp_payroll";
  if (q.id === "entity" && v === "sole_prop") return "llc";
  if (q.id === "commingle" && (v === "yes" || v === "some")) {
    return ["llc", "s_corp", "c_corp"].includes(strOf(A, "entity")) ? "veil" : "mixed";
  }
  return null;
}

/** Pop-ups that fire when you move on from a question (counts are set with +/−, so there's no single pick). */
export const GATE_OF: Record<string, DialogKey> = { banks: "biz_bank", cards: "points", salary: "wage_base" };

export function gateFor(id: string, A: Answers, now = new Date()): DialogKey | null {
  if (id === "banks") {
    const t = countTotals(countsOf(A, "banks"));
    if (t.p > 0 && t.b === 0) return "biz_bank";
  }
  if (id === "cards") {
    const t = countTotals(countsOf(A, "cards"));
    if (!boolOf(A, "cards_none") && t.b + t.p > 3) return "points";
  }
  if (id === "salary") {
    const s = numOf(A, "salary");
    if (!boolOf(A, "salary_unsure") && s != null && s > wageBase(now)) return "wage_base";
  }
  return null;
}

/* ─────────────────────────────── the record ─────────────────────────────── */

export type YesNo = "yes" | "no";

/** What the creator said. Written by the call, never edited from the backend. */
export type DiscoveryCall = {
  version: string;
  creatorName: string;
  startedAt: string | null;
  durationMin: number | null;
  /** The "prior year" the call asked about, and the "current year". */
  taxYearAsked: number;
  revenueYear: number;
  source: string | null;
  sourceDetail: string | null;
  usFiler: YesNo | null;
  entity: string | null;
  llcFiled: string | null;
  scorpElected: string | null;
  partnershipFiled: string | null;
  payroll: YesNo | null;
  payrollProvider: string | null;
  payrollProviderDetail: string | null;
  salary: number | null;
  salaryUnsure: boolean | null;
  banks: Counts;
  banksBusiness: number | null;
  banksPersonal: number | null;
  banksDetail: string | null;
  cards: Counts;
  cardsNone: boolean | null;
  cardsBusiness: number | null;
  cardsPersonal: number | null;
  cardsDetail: string | null;
  commingle: string | null;
  filedPrior: string | null;
  filedHow: string | null;
  filedHowDetail: string | null;
  filingStatus: string | null;
  totalTax: number | null;
  totalTaxUnsure: boolean | null;
  streams: string[];
  priorRevenueExact: number | null;
  priorRevenueUnsure: boolean | null;
  priorRevenueBand: RevenueBand | null;
  revenueExact: number | null;
  revenueUnsure: boolean | null;
  revenueBand: RevenueBand | null;
  tracking: string[];
  trackingDetail: string | null;
  pointsInterest: YesNo | null;
  masterclassCopied: boolean | null;
  writeoffsCopied: boolean | null;
  reviewChoice: string | null;
  decider: string | null;
  deciderWho: string | null;
};

/** What staff fill in — the drawer during the call, the table after. */
export type DiscoveryTeam = {
  advisor: string | null;
  fit: string | null;
  fitReason: string | null;
  nextStep: string | null;
  notes: string | null;
  fathom: string | null;
};

export const TEAM_KEYS: (keyof DiscoveryTeam)[] = ["advisor", "fit", "fitReason", "nextStep", "notes", "fathom"];

export const emptyTeam = (): DiscoveryTeam => ({ advisor: null, fit: null, fitReason: null, nextStep: null, notes: null, fathom: null });

/** A saved call as the API hands it back. */
export type DiscoveryRecord = {
  id: string;
  call: DiscoveryCall;
  team: DiscoveryTeam;
  /** A practice run, kept out of the real numbers. Set when the call is first saved. */
  isTest: boolean;
  /** When the call was first saved — the call date. */
  submittedAt: string | null;
  savedAt: string | null;
  savedByName: string;
  teamUpdatedAt: string | null;
  teamUpdatedBy: string | null;
};

/**
 * The record from the answers. Only questions the call actually asked are
 * written; a branch that closed (an S corp that became an LLC) leaves nulls.
 */
export function buildCall(A: Answers, ctx: { startedAt: Date | null; savedAt: Date; now?: Date }): DiscoveryCall {
  const now = ctx.now ?? new Date();
  const vis = new Set(visibleQuestions(A).map((q) => q.id));
  const v = (id: string): string | null => (vis.has(id) ? strOf(A, id) || null : null);
  const detail = (id: string): string | null => {
    const q = QUESTION_BY_ID[id];
    if (!vis.has(id) || !q?.reveal) return null;
    const a = A[id];
    const on = Array.isArray(a) ? a.some((x) => q.reveal![x]) : !!q.reveal[strOf(A, id)];
    return on ? strOf(A, `${id}_detail`).trim() || null : null;
  };
  const counts = (id: string) => {
    const on = vis.has(id);
    const none = on && boolOf(A, `${id}_none`);
    const c = on && !none ? cleanCounts(countsOf(A, id)) : {};
    const t = countTotals(c);
    const ans = on && (none || t.b + t.p > 0);
    return {
      c,
      none: on ? none : null,
      b: ans ? t.b : null,
      p: ans ? t.p : null,
      detail: c.other ? strOf(A, `${id}_detail`).trim() || null : null,
    };
  };
  const rev = (id: string) => {
    const on = vis.has(id);
    const un = on && boolOf(A, `${id}_unsure`);
    const exact = on && !un ? numOf(A, `${id}_exact`) : null;
    const band = strOf(A, id);
    return {
      exact,
      un: on ? un : null,
      band: on ? (un ? (inList("revenue", band) ? (band as RevenueBand) : null) : bandFor(exact)) : null,
    };
  };
  const owed = vis.has("tax_owed");
  const taxUn = owed && boolOf(A, "tax_unsure");
  const banks = counts("banks");
  const cards = counts("cards");
  const cur = rev("revenue");
  const pri = rev("rev_prior");
  const salOn = vis.has("salary");
  const salUn = salOn && boolOf(A, "salary_unsure");
  const mixed = A.commingle === "yes" || A.commingle === "some";
  const date = (id: string) => (vis.has(id) ? dateStr(dateOf(A, id)) : null);
  const yn = (id: string): YesNo | null => {
    const s = v(id);
    return s === "yes" || s === "no" ? s : null;
  };

  return {
    version: DISCOVERY_VERSION,
    creatorName: A.name.trim(),
    startedAt: ctx.startedAt ? ctx.startedAt.toISOString() : null,
    durationMin: ctx.startedAt ? Math.max(1, Math.round((ctx.savedAt.getTime() - ctx.startedAt.getTime()) / 60000)) : null,
    taxYearAsked: taxYearAsked(now),
    revenueYear: currentYear(now),
    source: v("source"),
    sourceDetail: detail("source"),
    usFiler: yn("us_filer"),
    entity: v("entity"),
    llcFiled: date("llc_date"),
    scorpElected: date("scorp_date"),
    partnershipFiled: date("partnership_date"),
    payroll: yn("payroll"),
    payrollProvider: v("payroll_provider"),
    payrollProviderDetail: detail("payroll_provider"),
    salary: salOn && !salUn ? numOf(A, "salary") : null,
    salaryUnsure: salOn ? salUn : null,
    banks: banks.c,
    banksBusiness: banks.b,
    banksPersonal: banks.p,
    banksDetail: banks.detail,
    cards: cards.c,
    cardsNone: cards.none,
    cardsBusiness: cards.b,
    cardsPersonal: cards.p,
    cardsDetail: cards.detail,
    commingle: v("commingle"),
    filedPrior: v("filed_prior"),
    filedHow: v("filed_how"),
    filedHowDetail: detail("filed_how"),
    filingStatus: v("filing_status"),
    totalTax: owed && !taxUn ? numOf(A, "total_tax") : null,
    totalTaxUnsure: owed ? taxUn : null,
    streams: vis.has("streams") ? listOf(A, "streams") : [],
    priorRevenueExact: pri.exact,
    priorRevenueUnsure: pri.un,
    priorRevenueBand: pri.band,
    revenueExact: cur.exact,
    revenueUnsure: cur.un,
    revenueBand: cur.band,
    tracking: vis.has("tracking") ? listOf(A, "tracking") : [],
    trackingDetail: detail("tracking"),
    pointsInterest: vis.has("cards") ? yn("points") : null,
    masterclassCopied: vis.has("cards") ? boolOf(A, "masterclass_copied") : null,
    writeoffsCopied: vis.has("commingle") && mixed ? boolOf(A, "writeoffs_copied") : null,
    reviewChoice: strOf(A, "review_choice") || null,
    decider: strOf(A, "decider") || null,
    deciderWho: A.decider === "others" ? strOf(A, "decider_who").trim() || null : null,
  };
}

/* ─────────────────────────────── sanitizers ─────────────────────────────── */

export const LIMITS = { text: 200, notes: 5000, name: 120, money: 1_000_000_000, count: 20, duration: 600 } as const;

/** Single-line text: whitespace collapsed, trimmed, capped; empty → null. */
const line = (v: unknown, max: number): string | null =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) || null : null;
/** Multi-line text: newlines kept. */
const para = (v: unknown, max: number): string | null => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
const wholeDollars = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v)) : null;
const boolOrNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const yesNo = (v: unknown): YesNo | null => (v === "yes" || v === "no" ? v : null);
const pick = (list: ListKey, v: unknown): string | null => (inList(list, v) ? v : null);
const picks = (list: ListKey, v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => inList(list, x)))] : [];
const DATE_RE = /^(\d{4})(-(0[1-9]|1[0-2]))?$/;
const dateField = (v: unknown): string | null => (v === "unsure" ? "unsure" : typeof v === "string" && DATE_RE.test(v) ? v : null);
const yearField = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 2015 && v <= 2040 ? v : fallback;
const isoOrNull = (v: unknown): string | null =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;

function countsField(v: unknown, list: ListKey): Counts {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Counts = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!inList(list, k) || !x || typeof x !== "object") continue;
    const { b, p } = x as { b?: unknown; p?: unknown };
    const bb = typeof b === "number" && Number.isFinite(b) ? Math.max(0, Math.min(LIMITS.count, Math.round(b))) : 0;
    const pp = typeof p === "number" && Number.isFinite(p) ? Math.max(0, Math.min(LIMITS.count, Math.round(p))) : 0;
    if (bb || pp) out[k] = { b: bb, p: pp };
  }
  return out;
}

/**
 * Narrow a call off the wire (or out of Firestore) to a DiscoveryCall. Every
 * option is checked against its list, every number is a whole non-negative
 * dollar figure, every string is capped. Unknown values drop to null rather
 * than erroring — a call saved by an older version still reads.
 */
export function sanitizeCall(raw: unknown, now = new Date()): DiscoveryCall {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const banks = countsField(r.banks, "bank");
  const cards = countsField(r.cards, "issuers");
  const money = (v: unknown) => wholeDollars(v, LIMITS.money);
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(LIMITS.count * 9, Math.round(v))) : null);
  const band = (v: unknown): RevenueBand | null => (inList("revenue", v) ? (v as RevenueBand) : null);
  return {
    version: line(r.version, 40) ?? DISCOVERY_VERSION,
    creatorName: line(r.creatorName, LIMITS.name) ?? "",
    startedAt: isoOrNull(r.startedAt),
    durationMin: typeof r.durationMin === "number" && Number.isFinite(r.durationMin) ? Math.max(1, Math.min(LIMITS.duration, Math.round(r.durationMin))) : null,
    taxYearAsked: yearField(r.taxYearAsked, taxYearAsked(now)),
    revenueYear: yearField(r.revenueYear, currentYear(now)),
    source: pick("source", r.source),
    sourceDetail: line(r.sourceDetail, LIMITS.text),
    usFiler: yesNo(r.usFiler),
    entity: pick("entity", r.entity),
    llcFiled: dateField(r.llcFiled),
    scorpElected: dateField(r.scorpElected),
    partnershipFiled: dateField(r.partnershipFiled),
    payroll: yesNo(r.payroll),
    payrollProvider: pick("payroll_provider", r.payrollProvider),
    payrollProviderDetail: line(r.payrollProviderDetail, LIMITS.text),
    salary: money(r.salary),
    salaryUnsure: boolOrNull(r.salaryUnsure),
    banks,
    banksBusiness: count(r.banksBusiness),
    banksPersonal: count(r.banksPersonal),
    banksDetail: line(r.banksDetail, LIMITS.text),
    cards,
    cardsNone: boolOrNull(r.cardsNone),
    cardsBusiness: count(r.cardsBusiness),
    cardsPersonal: count(r.cardsPersonal),
    cardsDetail: line(r.cardsDetail, LIMITS.text),
    commingle: pick("commingle", r.commingle),
    filedPrior: pick("filed_prior", r.filedPrior),
    filedHow: pick("filed_how", r.filedHow),
    filedHowDetail: line(r.filedHowDetail, LIMITS.text),
    filingStatus: pick("filing_status", r.filingStatus),
    totalTax: money(r.totalTax),
    totalTaxUnsure: boolOrNull(r.totalTaxUnsure),
    streams: picks("streams", r.streams),
    priorRevenueExact: money(r.priorRevenueExact),
    priorRevenueUnsure: boolOrNull(r.priorRevenueUnsure),
    priorRevenueBand: band(r.priorRevenueBand),
    revenueExact: money(r.revenueExact),
    revenueUnsure: boolOrNull(r.revenueUnsure),
    revenueBand: band(r.revenueBand),
    tracking: picks("tracking", r.tracking),
    trackingDetail: line(r.trackingDetail, LIMITS.text),
    pointsInterest: yesNo(r.pointsInterest),
    masterclassCopied: boolOrNull(r.masterclassCopied),
    writeoffsCopied: boolOrNull(r.writeoffsCopied),
    reviewChoice: pick("review_choice", r.reviewChoice),
    decider: pick("decider", r.decider),
    deciderWho: line(r.deciderWho, LIMITS.text),
  };
}

/**
 * A staff edit, whitelisted: the six team fields. Keys absent from the body
 * are left alone, so two people editing different columns of the same call
 * don't overwrite each other. Fit, reason and next step must be known
 * options — an unknown one clears rather than errors.
 */
export function sanitizeTeamPatch(raw: unknown): Partial<DiscoveryTeam> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<DiscoveryTeam> = {};
  if ("advisor" in r) out.advisor = line(r.advisor, LIMITS.text);
  if ("fit" in r) out.fit = pick("fit", r.fit);
  if ("fitReason" in r) out.fitReason = pick("fit_reason", r.fitReason);
  if ("nextStep" in r) out.nextStep = pick("next_step", r.nextStep);
  if ("notes" in r) out.notes = para(r.notes, LIMITS.notes);
  if ("fathom" in r) out.fathom = line(r.fathom, LIMITS.text);
  return out;
}

export const sanitizeTeam = (raw: unknown): DiscoveryTeam => ({ ...emptyTeam(), ...sanitizeTeamPatch(raw) });

/** A Firestore document id, and nothing odder. */
export const isValidCallId = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(id) && !/^__.*__$/.test(id);

/** Only an https link is rendered as one; anything else shows as text. */
export const safeUrl = (u: string | null | undefined): string =>
  /^https:\/\/[^\s"'<>]+$/i.test(String(u ?? "").trim()) ? String(u).trim() : "";

/* ─────────────────────────────── words ─────────────────────────────── */

export function fmtMoney(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "" : `$${Math.round(n).toLocaleString("en-US")}`;
}

export const revenueText = (exact: number | null, band: RevenueBand | null): string =>
  exact != null ? fmtMoney(exact) : band ? label("revenue", band) : "";

/** What the next call covers, as read out on the end screen. */
export function nextCallSteps(reviewChoice: string | null): string[] {
  return [
    "You’re going to meet with one of our co-founders.",
    "We’ll recap what we talked about on this call.",
    "We’ll show you everything we do at DeCypher.",
    reviewChoice === "return"
      ? "We’ll go through your tax return with you, line by line."
      : reviewChoice === "example"
        ? "We’ll walk you through a real creator’s return. Most creators have never been shown how to read one."
        : "We’ll review your tax return, or walk you through a creator example. Most creators have never been shown how to read one.",
    "We’ll give you points of improvement and see if you qualify for tax strategies.",
  ];
}

/** What the staff drawer and the backend flag about a call. Staff-only — never on the shared screen. */
export function talkingPoints(c: DiscoveryCall, now = new Date()): string[] {
  if (c.usFiler === "no") return ["Doesn’t file taxes in the US. Not a fit."];
  const out: string[] = [];
  const TY = c.taxYearAsked;
  const wb = wageBase(now);
  const big = c.revenueBand != null && ["100_250", "250_500", "500_1m", "1m"].includes(c.revenueBand);
  const rev = revenueText(c.revenueExact, c.revenueBand) || revenueText(c.priorRevenueExact, c.priorRevenueBand);
  const best = c.revenueExact ?? c.priorRevenueExact;
  const overLLC =
    best != null
      ? best > LLC_THRESHOLD
      : !!(c.revenueBand && c.revenueBand !== "u50") || !!(c.priorRevenueBand && c.priorRevenueBand !== "u50");

  if (c.entity === "s_corp" && c.payroll === "no")
    out.push("Red flag: S corp with no payroll. The IRS expects S corp owners who work in the business to pay themselves reasonable compensation through payroll.");
  if (c.entity === "s_corp" && c.salary != null)
    out.push(
      c.salary > wb
        ? `S corp salary ${fmtMoney(c.salary)} is over the ${fmtMoney(wb)} Social Security wage base. Recommend capping it there.`
        : `S corp salary around ${fmtMoney(c.salary)}${rev ? ` on ${rev} expected this year` : ""}. Check it’s reasonable.`,
    );
  if (c.entity === "sole_prop")
    out.push(
      overLLC
        ? `Sole prop${rev ? ` at ${rev}` : ""}, over the $20k line. We recommend an LLC for liability protection.`
        : "Sole prop. We recommend an LLC once they’re over $20k a year.",
    );
  if (c.entity === "llc" && big) out.push(`Single-member LLC at ${rev} expected. Worth running the S corp comparison.`);
  if (c.banksBusiness === 0) out.push(`No business bank account${c.banksPersonal ? ` (${c.banksPersonal} personal)` : ""}.`);
  if (c.cardsNone) out.push("No credit cards at all.");
  else if (c.cardsBusiness === 0) out.push(`No business credit card${c.cardsPersonal ? ` (${c.cardsPersonal} personal)` : ""}.`);
  if (c.commingle === "yes" || c.commingle === "some")
    out.push(`Business and personal spending are ${c.commingle === "yes" ? "mixed" : "probably a little mixed"}. Separating accounts is step one for clean books.`);
  if (c.filedPrior === "no") out.push(`Hasn’t filed the prior-year (${TY}) return.`);
  if (c.filedPrior === "extension") out.push(`Prior-year (${TY}) return is on extension. Extended returns are due October 15.`);
  if (c.totalTax != null)
    out.push(
      `${fmtMoney(c.totalTax)} total tax for ${TY}${c.filedHow ? ` · ${c.filedHow === "other" ? c.filedHowDetail || "prepared another way" : short("filed_how", c.filedHow)}` : ""}.`,
    );
  if (c.totalTaxUnsure) out.push(`Not sure what they owed for ${TY}. Ask them to upload the return to TaxDome.`);
  const informal = ["notes", "receipts", "none", "statements"];
  if (c.tracking.some((t) => informal.includes(t)) && !c.tracking.includes("qbo"))
    out.push(
      "Income and expense tracking is informal" +
        (c.tracking.includes("none")
          ? " (not tracking at all)."
          : ` (${c.tracking.filter((t) => ["statements", "receipts", "notes"].includes(t)).map((t) => short("tracking", t).toLowerCase()).join(", ")}).`),
    );
  if (c.writeoffsCopied) out.push("Write-off guide link copied for the Zoom chat.");
  if (c.pointsInterest === "yes") out.push(`Into credit card points. Masterclass link ${c.masterclassCopied ? "copied for the Zoom chat" : "shown"}.`);
  if (c.filingStatus === "mfj" || c.filingStatus === "mfs")
    out.push(`Files ${label("filing_status", c.filingStatus).toLowerCase()}. Ask whether their spouse should be on the next call.`);
  if (c.decider === "others") out.push(`Wants to include ${c.deciderWho || "someone else"} on the next call. Make sure they’re on the invite.`);
  if (c.decider === "self") out.push("Final decision maker.");
  if (c.reviewChoice === "return") out.push("Chose a review of their own return. Create their TaxDome account.");
  if (c.reviewChoice === "example") out.push("Chose to review a creator example on the next call.");
  if (c.source === "referral" && c.sourceDetail) out.push(`Referred by ${c.sourceDetail.replace(/[.\s]+$/, "")}. Thank them.`);
  return out;
}

/* ─────────────────────────────── backend ─────────────────────────────── */

export { PERIODS, type PeriodId };

export type DataScope = "real" | "test" | "all";
export const DATA_SCOPES: [DataScope, string][] = [
  ["real", "Real calls"],
  ["test", "Practice only"],
  ["all", "Real + practice"],
];

export type Filters = {
  period: PeriodId;
  advisor: string;
  /** A fit key, "_none" for not set, "" for any. */
  fit: string;
  data: DataScope;
  q: string;
};

export const DEFAULT_FILTERS: Filters = { period: "ytd", advisor: "", fit: "", data: "real", q: "" };

export const inScope = (r: DiscoveryRecord, data: DataScope) =>
  data === "all" || (data === "real" ? !r.isTest : r.isTest);

export function filterRecords(rows: DiscoveryRecord[], F: Filters, now = new Date()): DiscoveryRecord[] {
  const from = periodStart(F.period, now);
  const to = periodEnd(F.period, now);
  const q = F.q.trim().toLowerCase();
  return rows.filter((x) => {
    const t = new Date(x.submittedAt ?? "");
    if (!(t >= from && t < to)) return false;
    if (F.advisor && x.team.advisor !== F.advisor) return false;
    if (F.fit && (F.fit === "_none" ? !!x.team.fit : x.team.fit !== F.fit)) return false;
    if (!inScope(x, F.data)) return false;
    if (q) {
      const c = x.call;
      const hay = [c.creatorName, c.sourceDetail, c.banksDetail, c.cardsDetail, c.payrollProviderDetail, c.deciderWho, x.team.notes, x.team.advisor];
      if (!hay.some((v) => String(v || "").toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

/** Newest call first. */
export const byNewest = (a: DiscoveryRecord, b: DiscoveryRecord) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "");

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const CSV_COLS: [string, (r: DiscoveryRecord) => unknown][] = [
  ["call_id", (r) => r.id],
  ["is_test", (r) => r.isTest],
  ["submitted_at", (r) => r.submittedAt],
  ["duration_min", (r) => r.call.durationMin],
  ["creator_name", (r) => r.call.creatorName],
  ["source", (r) => r.call.source],
  ["source_detail", (r) => r.call.sourceDetail],
  ["us_filer", (r) => r.call.usFiler],
  ["entity", (r) => r.call.entity],
  ["llc_filed", (r) => r.call.llcFiled],
  ["scorp_elected", (r) => r.call.scorpElected],
  ["payroll", (r) => r.call.payroll],
  ["payroll_provider", (r) => r.call.payrollProvider],
  ["payroll_provider_detail", (r) => r.call.payrollProviderDetail],
  ["salary", (r) => r.call.salary],
  ["salary_unsure", (r) => r.call.salaryUnsure],
  ["partnership_filed", (r) => r.call.partnershipFiled],
  ["banks_business", (r) => r.call.banksBusiness],
  ["banks_personal", (r) => r.call.banksPersonal],
  ["banks", (r) => countsText(r.call.banks, r.call.banksDetail, "bank")],
  ["banks_detail", (r) => r.call.banksDetail],
  ["cards_none", (r) => r.call.cardsNone],
  ["cards_business", (r) => r.call.cardsBusiness],
  ["cards_personal", (r) => r.call.cardsPersonal],
  ["cards", (r) => countsText(r.call.cards, r.call.cardsDetail, "issuers")],
  ["cards_detail", (r) => r.call.cardsDetail],
  ["commingle", (r) => r.call.commingle],
  ["tax_year_asked", (r) => r.call.taxYearAsked],
  ["filed_prior", (r) => r.call.filedPrior],
  ["filed_how", (r) => r.call.filedHow],
  ["filed_how_detail", (r) => r.call.filedHowDetail],
  ["total_tax", (r) => r.call.totalTax],
  ["total_tax_unsure", (r) => r.call.totalTaxUnsure],
  ["streams", (r) => r.call.streams],
  ["prior_revenue_exact", (r) => r.call.priorRevenueExact],
  ["prior_revenue_unsure", (r) => r.call.priorRevenueUnsure],
  ["prior_revenue_band", (r) => r.call.priorRevenueBand],
  ["revenue_year", (r) => r.call.revenueYear],
  ["revenue_exact", (r) => r.call.revenueExact],
  ["revenue_unsure", (r) => r.call.revenueUnsure],
  ["revenue_band", (r) => r.call.revenueBand],
  ["tracking", (r) => r.call.tracking],
  ["tracking_detail", (r) => r.call.trackingDetail],
  ["points_interest", (r) => r.call.pointsInterest],
  ["masterclass_copied", (r) => r.call.masterclassCopied],
  ["writeoffs_copied", (r) => r.call.writeoffsCopied],
  ["filing_status", (r) => r.call.filingStatus],
  ["review_choice", (r) => r.call.reviewChoice],
  ["decider", (r) => r.call.decider],
  ["decider_who", (r) => r.call.deciderWho],
  ["advisor", (r) => r.team.advisor],
  ["fit", (r) => r.team.fit],
  ["fit_reason", (r) => r.team.fitReason],
  ["next_step", (r) => r.team.nextStep],
  ["notes", (r) => r.team.notes],
  ["fathom", (r) => r.team.fathom],
];

/** A cell a spreadsheet won't execute: a leading = + - @ tab or CR is defused with a quote. */
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("+") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function callsCsv(rows: DiscoveryRecord[]): string {
  return [CSV_COLS.map(([h]) => h).join(","), ...rows.map((r) => CSV_COLS.map(([, f]) => csvCell(f(r))).join(","))].join("\n");
}
