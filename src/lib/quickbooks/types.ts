/**
 * Every shape the Creator Finances feature hands to the UI. Narrowed types of
 * our own — never raw Intuit response shapes, which are loose, locale-sensitive
 * and change without notice. The raw slices live in parse.ts and stop there.
 *
 * Isomorphic: this is what client components import, so nothing here may pull in
 * Firebase, `server-only`, or anything with a runtime dependency.
 *
 * MONEY IS INTEGER CENTS, everywhere, from the parse boundary to the formatter.
 * Firestore stores numbers as doubles, and summing 12 months × ~200 accounts ×
 * ~150 creators in floats puts $1,234,567.8899999999 in the aggregate row. In a
 * dashboard an accounting firm reads to their clients, that isn't cosmetic.
 */

import type { CategoryKey } from "./categories";
import type { PeriodKey } from "./periods";

/** Integer cents. Divide by 100 exactly once, at the formatter. */
export type MoneyCents = number;

export type AccountingBasis = "accrual" | "cash";

/** The slice of a QuickBooks Account we cache and join reports against. */
export type AccountMeta = {
  id: string;
  name: string;
  /** "Parent:Child" — what the UI should show for a sub-account. */
  fullyQualifiedName: string;
  /** Coarse type, ~15 values. Kept for display only; too blunt to aggregate on. */
  accountType: string | null;
  /** The aggregation join key. See categories.ts. */
  subType: string | null;
  /** "Revenue" | "Expense" | ... — the reliable side discriminator. */
  classification: string | null;
  active: boolean;
};

/** One account's line on the P&L, with its monthly series. */
export type LineItem = {
  /** Null is normal — uncategorised rows and rolled-up sub-accounts have no id. */
  accountId: string | null;
  /** The client's own account name, verbatim: "YouTube AdSense". */
  name: string;
  subType: string | null;
  category: CategoryKey;
  total: MoneyCents;
  /** Aligned index-for-index with ProfitAndLoss.months. */
  monthly: MoneyCents[];
};

/**
 * The seven summary figures QuickBooks emits. Not five — omitting OtherIncome
 * and OtherExpenses makes (netIncome − netOperatingIncome) an unexplained gap
 * for any creator with interest income, an asset sale or a written-off loan.
 *
 * costOfGoodsSold and grossProfit are frequently absent (a service business has
 * no COGS section at all); they arrive as 0 and grossProfit falls back to income.
 */
export type ProfitAndLossTotals = {
  income: MoneyCents;
  costOfGoodsSold: MoneyCents;
  grossProfit: MoneyCents;
  expenses: MoneyCents;
  netOperatingIncome: MoneyCents;
  otherIncome: MoneyCents;
  otherExpenses: MoneyCents;
  netIncome: MoneyCents;
};

/**
 * The same eight figures, per month. Every array is aligned index-for-index with
 * ProfitAndLoss.months.
 *
 * All eight are stored rather than the obvious three (income/expenses/net)
 * because re-slicing to a shorter period has to recompute *every* total, and
 * netIncome can't be rebuilt without otherIncome and otherExpenses. Storing the
 * full set is what makes one fetch serve every entry in the period selector.
 */
export type MonthlySeries = Record<keyof ProfitAndLossTotals, MoneyCents[]>;

export type ProfitAndLoss = ProfitAndLossTotals & {
  realmId: string;
  /** ISO 4217, the company file's home currency. Never sum across currencies. */
  currency: string;
  /** What QuickBooks REPORTED, which is not always what we asked for. */
  basis: AccountingBasis;
  startDate: string;
  endDate: string;
  /** ["2026-01", …] — the alignment key for every monthly array in this object. */
  months: string[];

  monthly: MonthlySeries;

  /** Income leaves, descending. RAW client account names — see categories.ts. */
  revenueStreams: LineItem[];
  /** Expense leaves (incl. COGS), descending. */
  expenseLines: LineItem[];

  incomeByCategory: Partial<Record<CategoryKey, MoneyCents>>;
  expensesByCategory: Partial<Record<CategoryKey, MoneyCents>>;

  /** QuickBooks returned NoReportData: a real $0, not a failure. */
  empty: boolean;
  /**
   * Parser disagreements worth surfacing — a section summary that doesn't match
   * its leaves, a basis we didn't ask for, subtypes we couldn't map. Not
   * decoration: this is how we find out the parser drifted from QuickBooks
   * without waiting for someone to file a ticket.
   */
  warnings: string[];
};

/** Can we still talk to QuickBooks for this company? */
export type ConnectionStatus = "connected" | "reconnect-required" | "error" | "disabled";

/** Do we have numbers for it? Orthogonal to the above — see CreatorFinanceRow. */
export type DataStatus = "ok" | "empty" | "error" | "never";

/**
 * One creator's row on the dashboard.
 *
 * The two status axes are deliberately separate rather than one enum. The state
 * that forces it is `reconnect-required` + `ok`: the connection is broken but we
 * still hold last-good numbers, and the firm needs to see both at once. A single
 * status would make us choose between hiding usable figures and hiding a broken
 * connection.
 */
export type CreatorFinanceRow = {
  realmId: string;
  creatorId: string;
  /** Firm-editable; defaults to the QuickBooks company name. */
  displayName: string;
  companyName: string;
  currency: string;

  connection: ConnectionStatus;
  /** Human, written server-side, naming the fix — never a raw "invalid_grant". */
  connectionMessage: string;
  connectionCheckedAt: string | null;

  dataStatus: DataStatus;
  dataMessage: string;
  data: ProfitAndLoss | null;

  lastSyncedAt: string | null;
  /** Computed server-side so the UI never does date maths to count stale rows. */
  stale: boolean;
};

/**
 * The aggregate and average rows.
 *
 * Totals are keyed BY CURRENCY and never summed across them. With US-only
 * clients this looks like ceremony for two years, and then one creator
 * incorporates in Canada and the aggregate silently adds CAD to USD. It has to
 * be structural, not a TODO.
 */
export type AggregateBucket = ProfitAndLossTotals & {
  /** The denominator. Render it — "average of 142 creators" — never imply it. */
  count: number;
  incomeByCategory: Partial<Record<CategoryKey, MoneyCents>>;
  expensesByCategory: Partial<Record<CategoryKey, MoneyCents>>;
};

export type FinanceAggregate = {
  byCurrency: Record<string, AggregateBucket>;
  primaryCurrency: string;
  mixedCurrency: boolean;
  /** Left out of the totals, with the reason, so the UI can say why. */
  excluded: { realmId: string; displayName: string; reason: DataStatus }[];
};

export type FinancesPayload = {
  period: PeriodKey;
  basis: AccountingBasis;
  rows: CreatorFinanceRow[];
  aggregate: FinanceAggregate;
  /**
   * Fiscal years the cache can actually answer for, newest first. Computed
   * server-side from the union of every snapshot's months so the period
   * selector can't offer a year that resolves to an empty slice.
   */
  years: number[];
};

/** Canonical order — iterate this rather than Object.keys, which isn't ordered. */
export const TOTALS_KEYS = [
  "income",
  "costOfGoodsSold",
  "grossProfit",
  "expenses",
  "netOperatingIncome",
  "otherIncome",
  "otherExpenses",
  "netIncome",
] as const satisfies readonly (keyof ProfitAndLossTotals)[];

export function zeroTotals(): ProfitAndLossTotals {
  return {
    income: 0,
    costOfGoodsSold: 0,
    grossProfit: 0,
    expenses: 0,
    netOperatingIncome: 0,
    otherIncome: 0,
    otherExpenses: 0,
    netIncome: 0,
  };
}

export function zeroMonthly(length: number): MonthlySeries {
  return Object.fromEntries(
    TOTALS_KEYS.map((k) => [k, new Array<MoneyCents>(length).fill(0)]),
  ) as MonthlySeries;
}
