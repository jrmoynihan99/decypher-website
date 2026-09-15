/**
 * The "all creators" total and average rows.
 *
 * Two decisions here are the whole module, and both are about not putting a
 * confidently wrong number in front of an accounting firm:
 *
 *  1. Totals are keyed BY CURRENCY and never summed across them. With US-only
 *     clients this reads as ceremony for two years — and then one creator
 *     incorporates in Canada and the aggregate silently starts adding CAD to
 *     USD. There is no warning for that, no test that fails; it just quietly
 *     stops being true. So it's structural rather than a TODO.
 *
 *  2. The benchmarks state their denominator. An average over 150 creators where
 *     8 have a broken connection is a different number depending on whether you
 *     divide by 142 or 150, and nobody looking at the tile can tell which you
 *     picked. Two things are left out of it — a connection we couldn't read, and
 *     a creator with no income in the period — and both are counted so the UI
 *     can name them. See benchmarksFor.
 *
 * Pure — no I/O, no clock.
 */

import type { CategoryKey } from "./categories";
import {
  TOTALS_KEYS,
  zeroTotals,
  type AggregateBucket,
  type CreatorFinanceRow,
  type DataStatus,
  type FinanceAggregate,
  type MoneyCents,
  type ProfitAndLossTotals,
} from "./types";

/** Data states that carry a trustworthy number. `empty` is a real zero. */
const COUNTABLE: DataStatus[] = ["ok", "empty"];

function emptyBucket(): AggregateBucket {
  return { ...zeroTotals(), count: 0, incomeByCategory: {}, expensesByCategory: {} };
}

function addCategories(
  into: Partial<Record<CategoryKey, MoneyCents>>,
  from: Partial<Record<CategoryKey, MoneyCents>>,
): void {
  for (const [key, value] of Object.entries(from) as [CategoryKey, MoneyCents][]) {
    into[key] = (into[key] ?? 0) + value;
  }
}

/** The company file's home currency. Never sum across two of these. */
const currencyOf = (row: CreatorFinanceRow) =>
  row.data?.currency || row.currency || "USD";

/** Rows carrying a figure we're willing to count — see COUNTABLE. */
const readable = (row: CreatorFinanceRow) =>
  row.connection !== "disabled" && COUNTABLE.includes(row.dataStatus) && !!row.data;

export function aggregateRows(rows: CreatorFinanceRow[]): FinanceAggregate {
  const byCurrency: Record<string, AggregateBucket> = {};
  const excluded: FinanceAggregate["excluded"] = [];

  for (const row of rows) {
    if (row.connection === "disabled") continue; // deliberately off, not a failure
    if (!readable(row) || !row.data) {
      excluded.push({
        realmId: row.realmId,
        displayName: row.displayName,
        reason: row.dataStatus,
      });
      continue;
    }

    const bucket = (byCurrency[currencyOf(row)] ??= emptyBucket());
    for (const key of TOTALS_KEYS) bucket[key] += row.data[key];
    bucket.count += 1;
    addCategories(bucket.incomeByCategory, row.data.incomeByCategory);
    addCategories(bucket.expensesByCategory, row.data.expensesByCategory);
  }

  const currencies = Object.keys(byCurrency);
  // Modal currency, not first-seen — one Canadian client shouldn't decide what
  // the headline tiles are denominated in just by sorting earlier.
  const primaryCurrency =
    currencies.sort((a, b) => byCurrency[b].count - byCurrency[a].count)[0] ?? "USD";

  return {
    byCurrency,
    primaryCurrency,
    mixedCurrency: currencies.length > 1,
    excluded,
  };
}

/** What a typical creator looks like — the two rows the roster reads against. */
export type Benchmarks = {
  average: ProfitAndLossTotals;
  median: ProfitAndLossTotals;
  /** The denominator both rows state. Never imply it. */
  count: number;
  /** In the totals, out of these two: creators showing no income at all. */
  zeroIncome: number;
};

/**
 * The average and median creator, for one currency.
 *
 * Computed from the per-creator rows rather than from the bucket, because a
 * median can't be recovered from a sum — the bucket has already thrown away
 * the distribution by the time it reaches here.
 *
 * Creators with NO INCOME in the period are excluded from both. A zero there is
 * almost never a creator who earned nothing; it's a client whose books aren't
 * done yet, or one who joined last week — and each one dilutes the average
 * everybody else is coached against. They stay in the totals (a sum is a sum)
 * and they're counted here so the UI can say how many stepped out.
 *
 * Integer cents throughout: the rounding happens once, here, rather than
 * compounding through the UI. Zeros rather than NaN when nothing qualifies.
 */
export function benchmarksFor(
  rows: CreatorFinanceRow[],
  currency: string,
): Benchmarks {
  const counted = rows
    .filter((row) => readable(row) && currencyOf(row) === currency)
    .map((row) => row.data!);
  const earning = counted.filter((t) => t.income !== 0);

  return {
    average: meanOf(earning),
    median: medianOf(earning),
    count: earning.length,
    zeroIncome: counted.length - earning.length,
  };
}

function meanOf(list: ProfitAndLossTotals[]): ProfitAndLossTotals {
  if (!list.length) return zeroTotals();
  return Object.fromEntries(
    TOTALS_KEYS.map((k) => [
      k,
      Math.round(list.reduce((sum, t) => sum + t[k], 0) / list.length),
    ]),
  ) as ProfitAndLossTotals;
}

/**
 * Column by column, not "the median creator" — there is no single creator whose
 * every figure is the middle one. Which means the lines don't add across the
 * row the way a real creator's do; the UI says so where it's rendered.
 */
function medianOf(list: ProfitAndLossTotals[]): ProfitAndLossTotals {
  if (!list.length) return zeroTotals();
  return Object.fromEntries(
    TOTALS_KEYS.map((k) => [k, middleOf(list.map((t) => t[k]))]),
  ) as ProfitAndLossTotals;
}

/** Median of one column. An even count takes the mean of the middle two. */
function middleOf(values: MoneyCents[]): MoneyCents {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** The bucket the headline tiles should show. */
export function primaryBucket(aggregate: FinanceAggregate): AggregateBucket {
  return aggregate.byCurrency[aggregate.primaryCurrency] ?? emptyBucket();
}

/** Net margin as a 0–1 ratio, or null when there's no income to divide by. */
export function netMargin(totals: ProfitAndLossTotals): number | null {
  return totals.income === 0 ? null : totals.netIncome / totals.income;
}
