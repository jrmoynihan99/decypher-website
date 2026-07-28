/**
 * Reporting periods, and the month arithmetic that makes one API call serve all
 * of them.
 *
 * The trick this module exists to support: a profit & loss statement is made
 * entirely of FLOWS (unlike a balance sheet, which is a position at an instant).
 * So a P&L fetched with `summarize_column_by=Months` can be re-sliced to any
 * sub-range by summing the relevant month columns, and the result is EXACT —
 * not an estimate. One report call per creator therefore backs every period in
 * the selector, which is what keeps ~150 clients at ~300 API calls a night.
 *
 * What it does NOT let us derive: a different accounting basis (accrual is not a
 * function of cash), or any month outside the fetched window. Hence syncWindow()
 * below being deliberately wider than a trailing year.
 *
 * All arithmetic is UTC. The sync runs ~08:00 UTC (≈3am US Eastern), so the UTC
 * and Eastern calendar dates agree at the moment it matters; using UTC
 * throughout avoids the server's local timezone leaking into month boundaries.
 *
 * Pure — no imports, no I/O, unit-testable on its own.
 */

export const PERIOD_KEYS = [
  "ytd",
  "last-12-months",
  "this-month",
  "last-month",
  "this-quarter",
  "last-quarter",
  "last-year",
] as const;

export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  ytd: "Year to date",
  "last-12-months": "Last 12 months",
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "last-quarter": "Last quarter",
  "last-year": "Last full year",
};

export const DEFAULT_PERIOD: PeriodKey = "ytd";

const VALID = new Set<string>(PERIOD_KEYS);

/** Narrow an untrusted value (a query string, a Firestore doc) to a period key. */
export function parsePeriodKey(value: unknown): PeriodKey | null {
  return typeof value === "string" && VALID.has(value) ? (value as PeriodKey) : null;
}

/* ────────────────────────── month keys ────────────────────────── */

/** "2026-07" — the alignment key every monthly[] array is indexed by. */
export type MonthKey = string;

const pad2 = (n: number) => String(n).padStart(2, "0");

export function monthKeyOf(year: number, month1: number): MonthKey {
  return `${year}-${pad2(month1)}`;
}

/** Months since year 0 — makes month ranges plain integer arithmetic. */
function ordinal(key: MonthKey): number {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
}

function fromOrdinal(n: number): MonthKey {
  return monthKeyOf(Math.floor(n / 12), (n % 12) + 1);
}

/** Inclusive list of month keys from `start` to `end`. Empty if reversed. */
export function monthRange(start: MonthKey, end: MonthKey): MonthKey[] {
  const a = ordinal(start);
  const b = ordinal(end);
  if (b < a) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => fromOrdinal(a + i));
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07" → "Jul 2026". Fixed English, so charts don't shift with server locale. */
export function monthLabel(key: MonthKey): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTH_NAMES[(m ?? 1) - 1] ?? "?";
  return `${name} ${y}`;
}

/** "2026-07" → "Jul" — for dense chart axes where the year is in the title. */
export function monthShortLabel(key: MonthKey): string {
  const m = Number(key.split("-")[1]);
  return MONTH_NAMES[m - 1] ?? "?";
}

/** First day of a month, ISO. */
export function monthStartDate(key: MonthKey): string {
  return `${key}-01`;
}

/** Last day of a month, ISO — day 0 of the next month is the last of this one. */
export function monthEndDate(key: MonthKey): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/* ────────────────────────── periods ────────────────────────── */

export type ResolvedPeriod = {
  key: PeriodKey;
  label: string;
  startMonth: MonthKey;
  endMonth: MonthKey;
};

/**
 * `fiscalStartMonth` is 1–12, from the company file's FiscalYearStartMonth. It
 * matters: an accounting firm's "year to date" means the client's FISCAL year,
 * and quietly using January would put the wrong number in front of a client
 * whose year starts in July. Almost every creator is on a calendar year, so 1
 * is the default — but the connection carries the real value.
 */
export function resolvePeriod(
  key: PeriodKey,
  today: Date,
  fiscalStartMonth = 1,
): ResolvedPeriod {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const thisMonth = monthKeyOf(y, m);
  const nowOrd = ordinal(thisMonth);

  /** Ordinal of the first month of the fiscal year containing `thisMonth`. */
  const fiscalStartOrd = (() => {
    const startThisYear = ordinal(monthKeyOf(y, fiscalStartMonth));
    return startThisYear <= nowOrd ? startThisYear : startThisYear - 12;
  })();

  const range = (startOrd: number, endOrd: number): ResolvedPeriod => ({
    key,
    label: PERIOD_LABELS[key],
    startMonth: fromOrdinal(startOrd),
    endMonth: fromOrdinal(endOrd),
  });

  switch (key) {
    case "ytd":
      return range(fiscalStartOrd, nowOrd);
    case "last-12-months":
      return range(nowOrd - 11, nowOrd);
    case "this-month":
      return range(nowOrd, nowOrd);
    case "last-month":
      return range(nowOrd - 1, nowOrd - 1);
    case "this-quarter": {
      // Quarters run from the fiscal year start, not from January.
      const intoYear = nowOrd - fiscalStartOrd;
      const qStart = fiscalStartOrd + Math.floor(intoYear / 3) * 3;
      return range(qStart, nowOrd);
    }
    case "last-quarter": {
      const intoYear = nowOrd - fiscalStartOrd;
      const qStart = fiscalStartOrd + Math.floor(intoYear / 3) * 3 - 3;
      return range(qStart, qStart + 2);
    }
    case "last-year":
      return range(fiscalStartOrd - 12, fiscalStartOrd - 1);
  }
}

/**
 * The window a sync actually fetches — wide enough that every period above is a
 * slice of it, with no second API call.
 *
 * Binding constraint is "last full year": in July 2026 that's Jan–Dec 2025,
 * which a trailing-12-month fetch (Aug 2025 onward) would miss entirely. So we
 * start at the beginning of the PREVIOUS fiscal year: 13–24 months depending on
 * where we are in the year.
 *
 * Cost of the extra breadth is nil — ~24 columns × ~200 accounts is ~5k cells
 * against Intuit's 400k-cell response cap, in the same single request.
 */
export function syncWindow(
  today: Date,
  fiscalStartMonth = 1,
): { startDate: string; endDate: string; startMonth: MonthKey; endMonth: MonthKey } {
  const { startMonth: prevYearStart } = resolvePeriod("last-year", today, fiscalStartMonth);
  const endMonth = monthKeyOf(today.getUTCFullYear(), today.getUTCMonth() + 1);
  return {
    startMonth: prevYearStart,
    endMonth,
    startDate: monthStartDate(prevYearStart),
    endDate: monthEndDate(endMonth),
  };
}

/**
 * Indices of `months` falling inside the period, for slicing the monthly arrays.
 * Clamps rather than throwing — a client onboarded three months ago genuinely
 * has no data for "last full year", and that's an empty slice, not an error.
 */
export function sliceIndices(
  months: MonthKey[],
  period: Pick<ResolvedPeriod, "startMonth" | "endMonth">,
): { from: number; to: number } {
  const start = ordinal(period.startMonth);
  const end = ordinal(period.endMonth);
  let from = -1;
  let to = -1;
  for (let i = 0; i < months.length; i++) {
    const o = ordinal(months[i]);
    if (o >= start && o <= end) {
      if (from === -1) from = i;
      to = i;
    }
  }
  return from === -1 ? { from: 0, to: 0 } : { from, to: to + 1 };
}
