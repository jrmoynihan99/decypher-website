import type { RecapData, TaxFigures } from "./types";
import {
  BRAND, RATE_METHOD, LINE_GROUPS, OTHER_EXPENSE_RULES, OTHER_BUCKET,
  STRATEGIES, PERSONALITIES, MAX_STRATEGIES_SHOWN, TOP_WRITEOFFS_SHOWN,
} from "./config";

/**
 * The advisor's figures → recap step, as he wrote it: code owns every
 * number, rounds it once into a `display` string, and the video only ever
 * prints those strings. Changes from the kit are marked CHANGED.
 */

const round100 = (n: number) => Math.round(n / 100) * 100;
const floor100 = (n: number) => Math.floor(n / 100) * 100;
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (n: number) => Math.round(n) + "%";
const cents = (n: number) => Math.round(n) + "¢";
const oneDecimal = (n: number) => Math.round(n * 10) / 10;

export class RecapInputError extends Error {}

/** Groups Schedule C lines into creator-friendly buckets and returns them largest first. */
export function groupWriteoffs(sc: TaxFigures["schedule_c"]) {
  const buckets = new Map<string, number>();
  const add = (bucket: string, amt: number) => buckets.set(bucket, (buckets.get(bucket) ?? 0) + amt);
  for (const [line, amt] of Object.entries(sc.lines)) {
    if (!amt) continue;
    const bucket = LINE_GROUPS[line];
    if (!bucket) throw new RecapInputError(`Unknown Schedule C line "${line}". Add it to LINE_GROUPS in config.ts.`);
    add(bucket, amt);
  }
  for (const { description, amount } of sc.other_expenses) {
    if (!amount) continue;
    const rule = OTHER_EXPENSE_RULES.find(([re]) => re.test(description));
    add(rule ? rule[1] : OTHER_BUCKET, amount);
  }
  return [...buckets.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function buildRecap(f: TaxFigures): RecapData {
  // --- Reconcile before anything is shown: the waterfall must add up to the headline savings.
  // CHANGED: plus the savings outside before − after (an S corporation's SE tax avoided).
  const saved = f.totals.tax_before - f.totals.tax_after + (f.totals.outside_savings ?? 0);
  const strategySum = f.strategies.reduce((s, x) => s + x.amount, 0);
  if (saved <= 0) throw new RecapInputError("tax_after must be lower than tax_before.");
  if (strategySum !== saved)
    throw new RecapInputError(`Strategy savings (${strategySum}) don't add up to the headline savings (${saved}).`);
  for (const s of f.strategies)
    if (!STRATEGIES[s.kind]) throw new RecapInputError(`Unknown strategy kind "${s.kind}". Add it to STRATEGIES in config.ts.`);

  // --- Effective tax rates (see RATE_METHOD in config.ts)
  // CHANGED: "cents_per_dollar", one base for both sides, printed as cents
  let prior: number, current: number;
  if (RATE_METHOD === "cents_per_dollar") {
    prior = (f.totals.tax_before / f.totals.total_income_before) * 100;
    current = (f.totals.tax_after / f.totals.total_income_before) * 100;
  } else if (RATE_METHOD === "headline_income") {
    const base = f.totals.headline_income;
    if (!base) throw new RecapInputError("RATE_METHOD headline_income needs totals.headline_income.");
    prior = (f.totals.tax_before / base) * 100;
    current = (f.totals.tax_after / base) * 100;
  } else {
    prior = (f.totals.tax_before / f.totals.total_income_before) * 100;
    current = (f.totals.tax_after / f.totals.total_income_after) * 100;
  }

  // --- Top write-offs (the catch-all bucket is never featured)
  const top = groupWriteoffs(f.schedule_c).filter((w) => w.name !== OTHER_BUCKET).slice(0, TOP_WRITEOFFS_SHOWN);

  // --- Strategies, biggest savings first; personality from the group that saved the most.
  // CHANGED: hidden kinds (the dependents) count in the total but are never named or scored.
  const shown = f.strategies.filter((s) => !STRATEGIES[s.kind].hidden);
  const ordered = [...shown].sort((a, b) => b.amount - a.amount);
  const strategies_implemented = [...new Set(ordered.map((s) => STRATEGIES[s.kind].label))].slice(0, MAX_STRATEGIES_SHOWN);
  const byGroup = new Map<string, number>();
  for (const s of shown) {
    const g = STRATEGIES[s.kind].group;
    byGroup.set(g, (byGroup.get(g) ?? 0) + s.amount);
  }
  const topGroup = [...byGroup.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "writeoffs";
  const tax_personality = PERSONALITIES[topGroup];

  const fun =
    f.fun_writeoff_example?.trim() ||
    (f.schedule_c.business_miles ? `${f.schedule_c.business_miles.toLocaleString("en-US")} business miles` : undefined);

  const income = f.schedule_c.gross_receipts;
  return {
    creator_name: f.creator.name,
    creator_handle: f.creator.handle,
    tax_year: f.tax_year,
    creator_income: income,
    prior_effective_tax_rate: oneDecimal(prior),
    current_effective_tax_rate: oneDecimal(current),
    estimated_tax_savings: saved,
    top_writeoff_categories: top,
    fun_writeoff_example: fun,
    strategies_implemented,
    tax_personality,
    share_dollar_amounts: f.share_dollar_amounts,
    referral_link: f.referral_link,
    brand_handle: BRAND.handle,
    brand_name: BRAND.name,
    display: {
      creator_income: usd(round100(income)),
      daily_income: usd(floor100(income / 365)), // "over $X a day" – floored so it's never overstated
      estimated_tax_savings: usd(round100(saved)),
      // CHANGED: the cut is of the before plus anything saved outside it, so it can't pass 100%
      tax_bill_cut_pct: pct((saved / (f.totals.tax_before + (f.totals.outside_savings ?? 0))) * 100),
      prior_rate: RATE_METHOD === "cents_per_dollar" ? cents(prior) : pct(prior),
      current_rate: RATE_METHOD === "cents_per_dollar" ? cents(current) : pct(current),
      writeoffs: top.map((w) => usd(round100(w.amount))),
    },
  };
}

/**
 * Cents of every dollar brought in that went to tax, rounded the way the
 * video prints it: `base` is the BEFORE return's total income on both
 * sides. The recap page and the PDF print this too.
 */
export const centsPerDollar = (tax: number, base: number) => (base > 0 ? Math.round((tax / base) * 100) : null);
