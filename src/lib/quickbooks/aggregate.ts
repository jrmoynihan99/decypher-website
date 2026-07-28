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
 *  2. The average states its denominator. An average over 150 creators where 8
 *     have a broken connection is a different number depending on whether you
 *     divide by 142 or 150, and nobody looking at the tile can tell which you
 *     picked. We include creators whose books genuinely show zero (a real $0 is
 *     a real data point) and exclude ones we simply couldn't read — counting a
 *     broken connection as $0 drags the firm's average down by a bug.
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

export function aggregateRows(rows: CreatorFinanceRow[]): FinanceAggregate {
  const byCurrency: Record<string, AggregateBucket> = {};
  const excluded: FinanceAggregate["excluded"] = [];

  for (const row of rows) {
    if (row.connection === "disabled") continue; // deliberately off, not a failure
    if (!COUNTABLE.includes(row.dataStatus) || !row.data) {
      excluded.push({
        realmId: row.realmId,
        displayName: row.displayName,
        reason: row.dataStatus,
      });
      continue;
    }

    const currency = row.data.currency || row.currency || "USD";
    const bucket = (byCurrency[currency] ??= emptyBucket());
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

/**
 * Per-creator mean for one currency bucket. Integer cents throughout, so the
 * rounding happens once, here, rather than compounding through the UI.
 * Returns zeros for an empty bucket rather than NaN.
 */
export function averageOf(bucket: AggregateBucket | undefined): ProfitAndLossTotals {
  if (!bucket?.count) return zeroTotals();
  return Object.fromEntries(
    TOTALS_KEYS.map((k) => [k, Math.round(bucket[k] / bucket.count)]),
  ) as ProfitAndLossTotals;
}

/** The bucket the headline tiles should show. */
export function primaryBucket(aggregate: FinanceAggregate): AggregateBucket {
  return aggregate.byCurrency[aggregate.primaryCurrency] ?? emptyBucket();
}

/** Net margin as a 0–1 ratio, or null when there's no income to divide by. */
export function netMargin(totals: ProfitAndLossTotals): number | null {
  return totals.income === 0 ? null : totals.netIncome / totals.income;
}
