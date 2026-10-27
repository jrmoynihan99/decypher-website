import "server-only";
import { cache } from "react";
import { listRecapFacts, type RecapFact } from "./store";

/**
 * The marketing aggregate: every saved recap, added up for the home page's
 * proof section (components/home/TaxSavingsStrip) and the `{{taxSavings}}`
 * stat token (lib/quickbooks/public-stats.ts). Read once per render (React
 * cache) and served from the ISR'd page; the recap routes revalidate "/" on
 * every save, so the figures move the day a recap is built.
 *
 * The rules, so each number means one thing:
 *
 *  - The total is every recap's `savings`, revoked links and loss years
 *    included. The number is real whether or not the client's page is live.
 *  - "This year" is the latest tax year with at least MIN_YEAR_RECAPS recaps
 *    (a year with two recaps isn't a distribution), else the latest year.
 *  - The bands count CLIENTS, not recaps: a client's recaps in the year are
 *    summed first. A client who saved nothing (or lost) is in no band, and
 *    the year's figures are the banded clients' — so the bars and the amount
 *    above them agree.
 *  - "First year" is each client's earliest recap with us, across all years.
 *  - Medians use recaps with a positive before bill and positive savings.
 *  - The examples come from the middle of the year's range (25th–90th
 *    percentile), rounded, so no client is recognisable from the page.
 *
 * Nothing here carries a name. `listRecapFacts` reduces each client to a
 * key on the server, and the summary holds counts and sums only.
 */

/** Below this many recaps the public section doesn't render at all. */
export const MIN_RECAPS = 5;
/** A tax year needs this many recaps to be "this year" on the page. */
const MIN_YEAR_RECAPS = 10;
export const BAND_EDGES = [10_000, 50_000, 100_000] as const;
export const BAND_LABELS = ["Under $10K", "$10K – $50K", "$50K – $100K", "Over $100K"] as const;

export type TaxSavingsExample = {
  /** Rounded to the nearest $1,000. */
  income: number;
  /** The before return's total tax, rounded to the nearest $100. */
  before: number;
  /** `before` less the savings. */
  after: number;
  /** Rounded to the nearest $100. */
  savings: number;
  /** Savings as a whole-number share of the before bill. */
  pct: number;
};

export type TaxSavingsSummary = {
  totalSavings: number;
  recapCount: number;
  clientCount: number;
  firstTaxYear: number;
  lastTaxYear: number;
  year: {
    taxYear: number;
    /** Clients in a band: saved something that year. */
    clients: number;
    /** Those clients' savings, summed. */
    savings: number;
    bands: { label: string; count: number }[];
  };
  /** First-year savings for clients who saved something in their first year; null when nobody has yet. */
  typical: { median: number; average: number; clients: number } | null;
  /** Median share of the before bill that went away, in whole percent. */
  pctCut: number | null;
  /** Up to three, from the middle of this year's range. */
  examples: TaxSavingsExample[];
  updatedAt: string | null;
};

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const roundTo = (v: number, to: number) => Math.round(v / to) * to;
const bandOf = (v: number) => (v < BAND_EDGES[0] ? 0 : v < BAND_EDGES[1] ? 1 : v < BAND_EDGES[2] ? 2 : 3);

/** Pure, so `npm run recap:check`-style scripts and tests can feed it fixtures. */
export function summarizeRecaps(facts: RecapFact[]): TaxSavingsSummary | null {
  if (facts.length < MIN_RECAPS) return null;
  const years = facts.map((f) => f.taxYear).filter((y) => y > 0);
  if (!years.length) return null;

  const totalSavings = facts.reduce((s, f) => s + f.savings, 0);
  const clientCount = new Set(facts.map((f) => f.clientKey)).size;

  // this year: the latest with enough recaps to be a distribution
  const perYear = new Map<number, number>();
  for (const y of years) perYear.set(y, (perYear.get(y) ?? 0) + 1);
  const full = [...perYear].filter(([, n]) => n >= MIN_YEAR_RECAPS).map(([y]) => y);
  const taxYear = full.length ? Math.max(...full) : Math.max(...years);

  // the bands, per client
  const perClient = new Map<string, number>();
  for (const f of facts) {
    if (f.taxYear !== taxYear) continue;
    perClient.set(f.clientKey, (perClient.get(f.clientKey) ?? 0) + f.savings);
  }
  const counts = [0, 0, 0, 0];
  let yearSavings = 0;
  let yearClients = 0;
  for (const v of perClient.values()) {
    if (v <= 0) continue;
    yearClients++;
    yearSavings += v;
    counts[bandOf(v)]++;
  }

  // first year with us
  const first = new Map<string, RecapFact>();
  for (const f of facts) {
    const cur = first.get(f.clientKey);
    if (!cur || f.taxYear < cur.taxYear) first.set(f.clientKey, f);
  }
  const firstSavings = [...first.values()].map((f) => f.savings).filter((v) => v > 0);
  const typical = firstSavings.length
    ? {
        median: Math.round(median(firstSavings)),
        average: Math.round(firstSavings.reduce((s, v) => s + v, 0) / firstSavings.length),
        clients: firstSavings.length,
      }
    : null;

  const ratios = facts.filter((f) => f.totalBefore > 0 && f.savings > 0).map((f) => f.savings / f.totalBefore);
  const pctCut = ratios.length ? Math.round(median(ratios) * 100) : null;

  // examples: three from the middle of this year's range, low to high
  const pool = facts
    .filter((f) => f.taxYear === taxYear && f.savings > 0 && f.totalBefore > 0 && f.income > 0)
    .sort((a, b) => a.savings - b.savings);
  const mid = pool.slice(Math.floor(pool.length * 0.25), Math.ceil(pool.length * 0.9));
  const picks = new Set<RecapFact>();
  for (const p of mid.length >= 3 ? [0.2, 0.5, 0.8] : [0, 0.5, 1]) {
    const f = mid[Math.min(mid.length - 1, Math.floor(p * mid.length))];
    if (f) picks.add(f);
  }
  const examples: TaxSavingsExample[] = [...picks].map((f) => {
    const before = roundTo(f.totalBefore, 100);
    const savings = roundTo(f.savings, 100);
    return {
      income: roundTo(f.income, 1000),
      before,
      after: Math.max(0, before - savings),
      savings,
      pct: Math.round((f.savings / f.totalBefore) * 100),
    };
  });

  const updatedAt = facts.reduce<string | null>(
    (m, f) => (f.updatedAt && (!m || f.updatedAt > m) ? f.updatedAt : m),
    null,
  );

  return {
    totalSavings: Math.round(totalSavings),
    recapCount: facts.length,
    clientCount,
    firstTaxYear: Math.min(...years),
    lastTaxYear: Math.max(...years),
    year: {
      taxYear,
      clients: yearClients,
      savings: Math.round(yearSavings),
      bands: BAND_LABELS.map((label, i) => ({ label, count: counts[i] })),
    },
    typical,
    pctCut,
    examples,
    updatedAt,
  };
}

/**
 * The summary for this render, or null when the recaps can't be read or
 * there aren't enough yet — the section is dropped rather than drawn around
 * a guess, the same posture as the revenue graph.
 */
export const taxSavingsSummary = cache(async (): Promise<TaxSavingsSummary | null> => {
  try {
    return summarizeRecaps(await listRecapFacts());
  } catch (e) {
    console.error("[public-stats] couldn't read tax recaps:", e);
    return null;
  }
});
