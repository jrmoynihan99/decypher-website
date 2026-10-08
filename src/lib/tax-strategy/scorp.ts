/**
 * The S-Corp Analyzer's maths and its saved-client record.
 *
 * Isomorphic on purpose: the analyzer runs `analyze()` live as the sliders
 * move, the saved-clients dashboard re-runs it on every stored record, and the
 * scorp-clients routes run `sanitizeScorpClient()` on everything that crosses
 * the wire. One copy of each means the calculator, the dashboard and the
 * stored record can never disagree about what a salary is worth. No React, no
 * Firebase, no `document` in here.
 *
 * Ported from the client team's standalone page; constants, risk bands and
 * every client-facing sentence are theirs, verbatim.
 */

import { money } from "@/lib/widget-format";

/* ─────────────────────────────── constants ─────────────────────────────── */

export const SS_RATE = 0.124;
export const MED_RATE = 0.029;
export const ADDL_MED = 0.009;
export const SE_BASE = 0.9235;
/** 2026 Social Security wage base — update per tax year. */
export const WAGE_BASE = 184500;
/** Profit above which the election is a green light. */
export const GREEN_LIGHT = 80000;

// Risk meter settings (all percentages are whole numbers)
/** Distributions at or under this % of profit = the "low distribution" case. */
export const LOW_DIST_CUTOFF = 30;
/** Low-distribution case: salary sweet spot as % of profit. */
export const SWEET_PROFIT = [30, 40] as const;
/** High-distribution case: salary sweet spot as % of distributions. */
export const SWEET_DIST = [40, 50] as const;
/** "Getting Aggressive" = this many points below the sweet spot floor. */
export const AGGR_BAND = 7;

// Salary review cadence
/** Every saved salary gets re-checked this many months after it's set. */
export const CHECK_MONTHS = 6;
/** Checks due within this many days show up in the top section. */
export const DUE_SOON_DAYS = 14;

/* ─────────────────────────────── tax maths ─────────────────────────────── */

export type BasisMode = "auto" | "profit" | "distributions";
export type RiskLevel = "low" | "medium" | "high";
export type Risk = {
  level: RiskLevel;
  tone: "pos" | "warn" | "neg";
  pill: string;
  message: string;
};

const BASIS_MODES: readonly BasisMode[] = ["auto", "profit", "distributions"];
const RISK_LEVELS: readonly RiskLevel[] = ["low", "medium", "high"];

export function seTax(profit: number): number {
  const b = Math.max(0, profit) * SE_BASE;
  return SS_RATE * Math.min(b, WAGE_BASE) + MED_RATE * b + ADDL_MED * Math.max(0, b - 200000);
}

export function payrollTax(salary: number): number {
  return (
    SS_RATE * Math.min(salary, WAGE_BASE) +
    MED_RATE * salary +
    ADDL_MED * Math.max(0, salary - 200000)
  );
}

/**
 * Loose on purpose: the calculator hands in its raw input strings, the
 * dashboard hands in stored records. Anything non-numeric reads as 0.
 */
export type ScorpInputs = {
  revenue?: unknown;
  expenses?: unknown;
  salaryPct?: unknown;
  distribution?: unknown;
  beginningBasis?: unknown;
  basisMode?: unknown;
};

const asBasisMode = (v: unknown): BasisMode =>
  BASIS_MODES.includes(v as BasisMode) ? (v as BasisMode) : "auto";

/**
 * One function computes everything for a set of inputs, so the calculator and
 * the saved-client dashboard can never disagree.
 */
export function analyze(inp: ScorpInputs) {
  const revenue = Number(inp.revenue) || 0;
  const expenses = Number(inp.expenses) || 0;
  const salaryPct = Number(inp.salaryPct) || 0;
  const distribution = Number(inp.distribution) || 0;
  const beginningBasis = Number(inp.beginningBasis) || 0;
  const basisMode = asBasisMode(inp.basisMode);
  const profit = Math.max(0, revenue - expenses);
  const greenLight = profit > GREEN_LIGHT;
  const salary = Math.min(Math.round((profit * (salaryPct / 100)) / 5000) * 5000, WAGE_BASE);
  const before = seTax(profit);
  const after = payrollTax(salary);
  const savings = Math.max(0, before - after);
  const distPct = profit > 0 ? Math.round((distribution / profit) * 100) : 0;

  // Low distributions (<= 30% of profit): salary is measured against profit, sweet spot 30–40%.
  // High distributions (> 30% of profit): salary is measured against distributions, sweet spot 40–50%.
  // A salary at or above the SS wage base is always treated as conservative.
  const belowThreshold = !greenLight;
  const autoLowDist = distribution <= profit * (LOW_DIST_CUTOFF / 100);
  const lowDist = basisMode === "auto" ? autoLowDist : basisMode === "profit";
  const basis = lowDist ? profit : distribution;
  const basisLabel = lowDist ? "net income" : "distributions";
  const [sweetLow, sweetHigh] = lowDist ? SWEET_PROFIT : SWEET_DIST;
  const ratioPct = Math.round((salary / Math.max(basis, 1)) * 1000) / 10;
  const targetText = `${sweetLow}–${sweetHigh}% of ${basisLabel}`;
  const atCap = salary >= WAGE_BASE;
  let risk: Risk | null = null;
  if (!belowThreshold) {
    if (atCap || ratioPct >= sweetLow) {
      risk = {
        level: "low",
        tone: "pos",
        pill: "Conservative",
        message: "Likely defendable if you document your role and hours.",
      };
    } else if (ratioPct >= sweetLow - AGGR_BAND) {
      risk = {
        level: "medium",
        tone: "warn",
        pill: "Getting Aggressive",
        message: "Leaning on distributions — make sure you have a documented salary study.",
      };
    } else {
      risk = {
        level: "high",
        tone: "neg",
        pill: "Aggressive",
        message: "IRS could reclassify some distributions as wages. Talk to a tax pro.",
      };
    }
  }

  // Employer half of payroll tax (6.2% SS up to the wage base + 1.45% Medicare); deductible to the S corp.
  const employerPayrollTax = Math.round(
    (SS_RATE / 2) * Math.min(salary, WAGE_BASE) + (MED_RATE / 2) * salary,
  );
  const profitAfterPayroll = profit - salary - employerPayrollTax;
  const availableToDistribute = profitAfterPayroll + beginningBasis;
  const overDistributing = distribution > availableToDistribute;
  const excessOverBasis = Math.round(distribution - availableToDistribute);
  const retained = Math.round(profitAfterPayroll - distribution);

  return {
    revenue,
    expenses,
    salaryPct,
    distribution,
    beginningBasis,
    basisMode,
    profit,
    greenLight,
    salary,
    before,
    after,
    savings,
    distPct,
    belowThreshold,
    autoLowDist,
    lowDist,
    basisLabel,
    ratioPct,
    targetText,
    risk,
    employerPayrollTax,
    profitAfterPayroll,
    overDistributing,
    excessOverBasis,
    retained,
  };
}

export type ScorpAnalysis = ReturnType<typeof analyze>;

/* ───────────────────────────────── dates ───────────────────────────────── */

// Stored as local YYYY-MM-DD strings so a check date never shifts by timezone.

export const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayISO = (): string => iso(new Date());

export const parseISO = (s: string): Date => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Same day n months on, clamped to the month's last day (Aug 31 + 6 → Feb 28). */
export const addMonths = (s: string, n: number): string => {
  const d = parseISO(s);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last));
  return iso(t);
};

export const daysUntil = (s: string): number =>
  Math.round((parseISO(s).getTime() - parseISO(todayISO()).getTime()) / 86400000);

/** "Apr 8, 2027", or "—" for no date. */
export const fmtDate = (s: string | null | undefined): string =>
  s
    ? parseISO(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

/** An epoch-ms stamp as a short date. */
export const fmtStamp = (ms: number): string =>
  ms
    ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

/** Today as the summary sheet dates itself: "October 8, 2026". */
export const longToday = (): string =>
  new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/* ─────────────────────────────── the record ─────────────────────────────── */

export type HistoryType = "set" | "check" | "tweak" | "update" | "notified";
const HISTORY_TYPES: readonly HistoryType[] = ["set", "check", "tweak", "update", "notified"];

export type HistoryEntry = {
  type: HistoryType;
  /** Local YYYY-MM-DD. */
  on: string;
  /** Epoch ms. */
  at: number;
  /** Staff display name; "" when unknown. */
  by: string;
  salary: number;
  distribution: number;
  /** tweak / update only. */
  fromSalary?: number;
  fromDistribution?: number;
};

/** The plain-language note drafted when a tweak changes the salary. */
export type ClientNotice = {
  status: "pending" | "sent";
  createdOn: string;
  fromSalary: number;
  salary: number;
  fromDistribution: number;
  distribution: number;
  message: string;
  sentOn: string | null;
  sentBy: string | null;
};

/**
 * One saved client. Who-did-what fields hold staff display names, not ids —
 * the portal has no profile lookup to resolve ids against, and a name is what
 * the dashboard shows.
 */
export type ScorpClient = {
  id: string;
  firstName: string;
  lastName: string;
  bizName: string;
  /** Local YYYY-MM-DD, or "" when the call isn't scheduled. */
  callDate: string;
  notes: string;
  beginningBasis: number;
  revenue: number;
  expenses: number;
  salaryPct: number;
  distribution: number;
  basisMode: BasisMode;
  /** The salary as decided. Can drift from analyze(record).salary — readOf() says so. */
  salary: number;
  /** Denormalised at save time; the dashboard recomputes from the inputs. */
  profit: number;
  savings: number;
  riskLevel: RiskLevel | null;
  salarySetOn: string;
  nextCheckOn: string;
  lastCheckOn: string | null;
  history: HistoryEntry[];
  clientNotice: ClientNotice | null;
  createdAt: number;
  createdBy: string;
  /** Stamped by the server on every write. */
  updatedAt: number;
  updatedBy: string;
  savedAt: number;
};

export const SCORP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** "c" + time + noise — the original's id shape, and inside SCORP_ID_RE. */
export const newScorpId = (): string =>
  "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const clientName = (c: { firstName?: string; lastName?: string; bizName?: string }) =>
  [c.firstName, c.lastName].filter(Boolean).join(" ") || c.bizName || "Unnamed client";

/* ─────────────────────────────── narrowing ─────────────────────────────── */

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_AMOUNT = 1e12;
const MAX_NAME = 120;
const MAX_NOTES = 5000;
const MAX_MESSAGE = 5000;
const MAX_HISTORY = 200;

const finite = (v: unknown): number | null => {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const amount = (v: unknown): number => Math.min(Math.max(finite(v) ?? 0, 0), MAX_AMOUNT);
const stamp = (v: unknown): number => {
  const n = finite(v);
  return n != null && n > 0 && n < 8.64e15 ? Math.round(n) : 0;
};
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const isoDate = (v: unknown): string | null =>
  typeof v === "string" && DATE_RE.test(v) ? v : null;
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function sanitizeHistoryEntry(raw: unknown): HistoryEntry | null {
  if (!isObj(raw) || !HISTORY_TYPES.includes(raw.type as HistoryType)) return null;
  const at = stamp(raw.at);
  const out: HistoryEntry = {
    type: raw.type as HistoryType,
    on: isoDate(raw.on) ?? (at ? iso(new Date(at)) : ""),
    at,
    by: text(raw.by, MAX_NAME),
    salary: amount(raw.salary),
    distribution: amount(raw.distribution),
  };
  // Only set when present: Firestore rejects `undefined`, and set/check
  // entries have no "from" side.
  if (finite(raw.fromSalary) != null) out.fromSalary = amount(raw.fromSalary);
  if (finite(raw.fromDistribution) != null) out.fromDistribution = amount(raw.fromDistribution);
  return out;
}

function sanitizeNotice(raw: unknown): ClientNotice | null {
  if (!isObj(raw) || (raw.status !== "pending" && raw.status !== "sent")) return null;
  return {
    status: raw.status,
    createdOn: isoDate(raw.createdOn) ?? "",
    fromSalary: amount(raw.fromSalary),
    salary: amount(raw.salary),
    fromDistribution: amount(raw.fromDistribution),
    distribution: amount(raw.distribution),
    message: text(raw.message, MAX_MESSAGE),
    sentOn: isoDate(raw.sentOn),
    sentBy: typeof raw.sentBy === "string" ? raw.sentBy.slice(0, MAX_NAME) : null,
  };
}

/** A record whose review fields may still be missing — see normalize(). */
export type ScorpClientDraft = Omit<ScorpClient, "salary" | "salarySetOn" | "nextCheckOn"> & {
  salary: number | null;
  salarySetOn: string | null;
  nextCheckOn: string | null;
};

/**
 * Fill review fields on records saved before the review workflow existed (or
 * imported from a backup of the browser-only version).
 */
export function normalize(c: ScorpClientDraft): ScorpClient {
  const savedDay = c.savedAt ? iso(new Date(c.savedAt)) : todayISO();
  const salarySetOn = c.salarySetOn || savedDay;
  const now = Date.now();
  return {
    ...c,
    salary: c.salary != null ? c.salary : analyze(c).salary,
    salarySetOn,
    nextCheckOn: c.nextCheckOn || addMonths(salarySetOn, CHECK_MONTHS),
    lastCheckOn: c.lastCheckOn || null,
    createdAt: c.createdAt || c.savedAt || now,
    updatedAt: c.updatedAt || c.savedAt || now,
  };
}

/**
 * Narrow untrusted input — a request body, a backup file, a Firestore doc
 * written by an older version — to a ScorpClient, then normalize it. Unknown
 * keys are dropped, strings capped, amounts finite and non-negative, dates
 * strict YYYY-MM-DD, history kept to its newest 200 known-type entries.
 * Null when it isn't an object or its id isn't a safe document id.
 */
export function sanitizeScorpClient(raw: unknown): ScorpClient | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!SCORP_ID_RE.test(id)) return null;

  const inputs = {
    revenue: amount(raw.revenue),
    expenses: amount(raw.expenses),
    salaryPct: Math.min(100, amount(raw.salaryPct)),
    distribution: amount(raw.distribution),
    beginningBasis: amount(raw.beginningBasis),
    basisMode: asBasisMode(raw.basisMode),
  };
  const a = analyze(inputs);

  return normalize({
    id,
    firstName: text(raw.firstName, MAX_NAME),
    lastName: text(raw.lastName, MAX_NAME),
    bizName: text(raw.bizName, MAX_NAME),
    callDate: isoDate(raw.callDate) ?? "",
    notes: text(raw.notes, MAX_NOTES),
    ...inputs,
    salary: finite(raw.salary) != null ? amount(raw.salary) : null,
    profit: finite(raw.profit) != null ? amount(raw.profit) : a.profit,
    savings: finite(raw.savings) != null ? amount(raw.savings) : Math.round(a.savings),
    riskLevel: RISK_LEVELS.includes(raw.riskLevel as RiskLevel) ? (raw.riskLevel as RiskLevel) : null,
    salarySetOn: isoDate(raw.salarySetOn),
    nextCheckOn: isoDate(raw.nextCheckOn),
    lastCheckOn: isoDate(raw.lastCheckOn),
    history: Array.isArray(raw.history)
      ? raw.history
          .slice(-MAX_HISTORY)
          .map(sanitizeHistoryEntry)
          .filter((h): h is HistoryEntry => h !== null)
      : [],
    clientNotice: sanitizeNotice(raw.clientNotice),
    createdAt: stamp(raw.createdAt),
    createdBy: text(raw.createdBy, MAX_NAME),
    updatedAt: stamp(raw.updatedAt),
    updatedBy: text(raw.updatedBy, MAX_NAME),
    savedAt: stamp(raw.savedAt),
  });
}

/* ──────────────────────────────── wording ──────────────────────────────── */

/** Plain-language note to the client when their salary changes. Self-service: no reply needed. */
export function buildNotice(
  c: { firstName?: string; bizName?: string },
  fromSalary: number,
  toSalary: number,
  fromDist: number,
  toDist: number,
): string {
  const first = (c.firstName || "").trim() || "there";
  const biz = (c.bizName || "").trim() || "your business";
  const dir = toSalary > fromSalary ? "increasing" : toSalary < fromSalary ? "lowering" : "keeping";
  const salaryLine =
    toSalary === fromSalary
      ? `Your salary stays at ${money(toSalary)} a year (about ${money(toSalary / 12)} a month).`
      : `We're ${dir} your salary from ${money(fromSalary)} to ${money(toSalary)} a year — about ${money(toSalary / 12)} a month.`;
  const distLine =
    toDist !== fromDist
      ? `Your planned distributions for the year are now ${money(toDist)} (previously ${money(fromDist)}).`
      : `Your planned distributions stay at ${money(toDist)} for the year.`;
  return [
    `Hi ${first},`,
    ``,
    `We just finished the 6-month salary review for ${biz}. Based on how the business is doing this year, here's the update:`,
    ``,
    salaryLine,
    distLine,
    ``,
    `This keeps your pay in line with what the IRS expects for your role while protecting your S corp tax savings. The new salary takes effect with your next payroll run.`,
    ``,
    `— The DeCypher team`,
  ].join("\n");
}

/** One-paragraph read of the account, so the team can decide check vs. tweak at a glance. */
export function readOf(c: ScorpClient, x: ScorpAnalysis): string {
  const parts: string[] = [];
  if (x.belowThreshold || !x.risk) {
    parts.push(
      `Profit of ${money(x.profit)} is under the ${money(GREEN_LIGHT)} green-light line, so the S corp may not be paying for itself right now.`,
    );
  } else {
    parts.push(
      `Salary of ${money(c.salary)} is ${x.risk.pill.toLowerCase()} at ${x.ratioPct}% of ${x.basisLabel} (target ${x.targetText}).`,
    );
  }
  if (x.salary !== c.salary) {
    parts.push(
      `Today's numbers point to ${money(x.salary)} instead — the saved salary and the saved inputs don't match.`,
    );
  }
  parts.push(
    x.overDistributing
      ? `Distributions of ${money(x.distribution)} run ${money(x.excessOverBasis)} past basis, so the excess may be taxable.`
      : x.retained >= 0
        ? `Distributions of ${money(x.distribution)} are covered by profit, leaving ${money(x.retained)} in the business.`
        : `Distributions of ${money(x.distribution)} are covered, with ${money(-x.retained)} coming from beginning basis.`,
  );
  parts.push(`Saves about ${money(x.savings)} a year in self-employment tax.`);
  return parts.join(" ");
}

export function historyLabel(h: HistoryEntry): string {
  const by = h.by ? ` by ${h.by}` : "";
  const fromSalary = h.fromSalary ?? 0;
  const fromDist = h.fromDistribution ?? 0;
  if (h.type === "set") return `Salary set at ${money(h.salary)}, distributions ${money(h.distribution)}${by}`;
  if (h.type === "check") return `6-month check complete — salary kept at ${money(h.salary)}${by}`;
  if (h.type === "tweak") {
    return `Salary tweaked ${money(fromSalary)} → ${money(h.salary)}, distributions ${money(fromDist)} → ${money(h.distribution)}${by}`;
  }
  if (h.type === "update") {
    return `Salary updated ${money(fromSalary)} → ${money(h.salary)}, distributions ${money(fromDist)} → ${money(h.distribution)}${by}`;
  }
  if (h.type === "notified") return `Client notified of salary change${by}`;
  return h.type;
}

/** How far off a check is, for the pill and the table. */
export function dueLabel(c: { nextCheckOn: string }): {
  text: string;
  tone: "neg" | "warn" | "mute";
} {
  const d = daysUntil(c.nextCheckOn);
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} overdue`, tone: "neg" };
  if (d === 0) return { text: "Due today", tone: "warn" };
  if (d <= DUE_SOON_DAYS) return { text: `Due in ${d} day${d === 1 ? "" : "s"}`, tone: "warn" };
  return { text: `In ${d} days`, tone: "mute" };
}

const byNextCheck = (x: ScorpClient, y: ScorpClient) =>
  x.nextCheckOn < y.nextCheckOn ? -1 : x.nextCheckOn > y.nextCheckOn ? 1 : 0;

/** The review queues: notes to send, checks due, and what's next after them. */
export function reviewQueues(clients: ScorpClient[]) {
  const pending = clients.filter((c) => c.clientNotice?.status === "pending");
  const due = clients
    .filter((c) => daysUntil(c.nextCheckOn) <= DUE_SOON_DAYS)
    .sort(byNextCheck);
  const nextUp =
    clients.filter((c) => daysUntil(c.nextCheckOn) > DUE_SOON_DAYS).sort(byNextCheck)[0] ?? null;
  const overdue = due.filter((c) => daysUntil(c.nextCheckOn) < 0).length;
  return {
    pending,
    due,
    nextUp,
    overdue,
    dueSoon: due.length - overdue,
    attention: pending.length + due.length,
  };
}

export type ReviewQueues = ReturnType<typeof reviewQueues>;
