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
  "all-time",
] as const;

export type FixedPeriodKey = (typeof PERIOD_KEYS)[number];

/**
 * A specific fiscal year, e.g. "year-2024".
 *
 * Dynamic rather than enumerated because which years exist depends on how far
 * back the sync window reaches — see availableYears(), which builds the
 * selector from the months actually in the cache instead of offering a year
 * that would silently resolve to an empty slice.
 */
export type YearPeriodKey = `year-${number}`;

export type PeriodKey = FixedPeriodKey | YearPeriodKey;

export const PERIOD_LABELS: Record<FixedPeriodKey, string> = {
  ytd: "Year to date",
  "last-12-months": "Last 12 months",
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "last-quarter": "Last quarter",
  "last-year": "Last full year",
  "all-time": "All time",
};

export const DEFAULT_PERIOD: PeriodKey = "ytd";

const VALID = new Set<string>(PERIOD_KEYS);

const YEAR_RE = /^year-(\d{4})$/;

/** Sanity bounds on a year key — anything outside is a typo or an attack. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export function isYearPeriod(key: PeriodKey): key is YearPeriodKey {
  return YEAR_RE.test(key);
}

/** The calendar year a "year-YYYY" key names, or null. */
export function periodYear(key: PeriodKey): number | null {
  const m = YEAR_RE.exec(key);
  return m ? Number(m[1]) : null;
}

/** Narrow an untrusted value (a query string, a Firestore doc) to a period key. */
export function parsePeriodKey(value: unknown): PeriodKey | null {
  if (typeof value !== "string") return null;
  if (VALID.has(value)) return value as FixedPeriodKey;
  const m = YEAR_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR ? (value as YearPeriodKey) : null;
}

/** Display label for any period key, fixed or dynamic. */
export function periodLabel(key: PeriodKey): string {
  const year = periodYear(key);
  return year != null ? String(year) : (PERIOD_LABELS[key as FixedPeriodKey] ?? key);
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
    label: periodLabel(key),
    startMonth: fromOrdinal(startOrd),
    endMonth: fromOrdinal(endOrd),
  });

  /**
   * A named year is that FISCAL year — the one starting in the named calendar
   * year — for the same reason "year to date" is fiscal: an accounting firm's
   * "2024" means the client's 2024 books. With the near-universal January
   * fiscal start the two are identical anyway.
   */
  const year = periodYear(key);
  if (year != null) {
    const start = ordinal(monthKeyOf(year, fiscalStartMonth));
    return range(start, start + 11);
  }

  switch (key) {
    case "all-time":
      // Deliberately wider than any cache: sliceIndices clamps to the months
      // that actually exist, so "all time" means "everything we hold" without
      // this function needing to know what that is.
      return range(ordinal(monthKeyOf(MIN_YEAR, 1)), nowOrd);
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
    default:
      // Unreachable for a parsed key — year keys returned above, and every
      // fixed key has a case. A malformed key falls back to the default
      // period rather than throwing: a bad query string should show the
      // wrong-ish window, not 500 the whole dashboard.
      return range(fiscalStartOrd, nowOrd);
  }
}

/**
 * How many fiscal years of history a sync fetches, beyond the current one.
 *
 * Was 1 — the minimum "last full year" needs. Raised to serve per-year
 * selection and "all time", including the public lifetime-revenue stat.
 *
 * The ceiling is Intuit's 400k-cell response cap: ~72 monthly columns ×
 * ~200 accounts is ~14k cells, still in one request. The real cost is the
 * stored snapshot — every line item carries a monthly array, so ~40 lines ×
 * 72 months is ~30KB of JSON per company, comfortably under Firestore's 1MB
 * document limit. Don't raise this to 20 without re-checking that.
 *
 * NOTE: "all time" means "as far back as this reaches". A company with books
 * predating the window reports from the window's start, not from inception.
 */
export const HISTORY_YEARS = 5;

/**
 * The window a sync actually fetches — wide enough that every period above is a
 * slice of it, with no second API call.
 *
 * Starts at the beginning of the fiscal year HISTORY_YEARS back, so the year
 * selector and "all time" are arithmetic on cached months rather than fresh
 * QuickBooks traffic — the same trick that already made the period dropdown
 * free.
 */
export function syncWindow(
  today: Date,
  fiscalStartMonth = 1,
): { startDate: string; endDate: string; startMonth: MonthKey; endMonth: MonthKey } {
  const { startMonth: prevYearStart } = resolvePeriod("last-year", today, fiscalStartMonth);
  const start = fromOrdinal(ordinal(prevYearStart) - 12 * (HISTORY_YEARS - 1));
  const endMonth = monthKeyOf(today.getUTCFullYear(), today.getUTCMonth() + 1);
  return {
    startMonth: start,
    endMonth,
    startDate: monthStartDate(start),
    endDate: monthEndDate(endMonth),
  };
}

/**
 * Fiscal years the cached months can actually answer for, newest first.
 *
 * Built from real data rather than from the calendar so the selector never
 * offers a year that resolves to an empty slice. A year counts as available if
 * any of its months are present — a partial year is still worth reporting, and
 * the label makes no promise of completeness.
 */
export function availableYears(months: MonthKey[], fiscalStartMonth = 1): number[] {
  const years = new Set<number>();
  for (const key of months) {
    const [y, m] = key.split("-").map(Number);
    if (!y || !m) continue;
    // A month before the fiscal start belongs to the year that started earlier.
    years.add(m >= fiscalStartMonth ? y : y - 1);
  }
  return [...years].sort((a, b) => b - a);
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
