/**
 * The Money Allocator's engine: one month of business income, split into jobs.
 *
 * Pure maths, no React — same split as lib/widget-tax.ts, so the widget file
 * stays presentational and this can be reasoned about (and one day tested) on
 * its own.
 *
 * The model has two stages and they are not the same kind of thing:
 *
 *  1. OFF THE TOP. Taxes and business ops are straight percentages of income.
 *     They come out before the owner sees anything, and they always take their
 *     full share — that's what makes them "off the top". What's left is owner
 *     pay.
 *
 *  2. A WATERFALL through owner pay. Essentials, then discretionary, then
 *     wealth, then the emergency fund, then any custom funds in the order they
 *     were added. Each takes its target if the money is there and whatever is
 *     left if it isn't, and the remainder flows to the next.
 *
 * The waterfall is the whole point of the tool. A flat "30% here, 15% there"
 * split silently under-funds everything when income dips; a waterfall says
 * plainly which bucket ran dry and by how much, which is the conversation worth
 * having on a call.
 *
 * Every bucket's share is a fraction of INCOME, not of owner pay — so the
 * percentages on screen all read against the same denominator and add up in a
 * way a creator can check in their head.
 */

/** Whole-dollar guard: an allocation is never negative. */
const c0 = (n: number): number => (n < 0 || !isFinite(n) ? 0 : n);

/** Float slack, so `6 months` doesn't read as "5.9999 months saved". */
const EPS = 1e-9;

/** Six months of bare-minimum living costs — the emergency fund's ceiling. */
export const OHCRAP_MONTHS_TARGET = 6;

/**
 * What the tool opens on. Percentages of monthly business income.
 *
 * These are starting points for a conversation, not advice — every one is
 * editable on screen. The prototype carried a second set of "after the
 * emergency fund is full" values that nothing ever read (the UI always supplies
 * the live figures), so they aren't reproduced here.
 */
export const ALLOCATOR_DEFAULTS = {
  taxPct: 0.3,
  opsPct: 0.25,
  discPct: 0.05,
  wealthPct: 0.15,
  ohCrapPct: 0.15,
} as const;

export interface CustomFund {
  id: string;
  name: string;
  /** Share of income, as a fraction. */
  pct: number;
}

export interface AllocatorInputs {
  monthlyIncome: number;
  monthlyLiving: number;
  ohCrapBalance: number;
  taxPct: number;
  opsPct: number;
  discPct: number;
  wealthPct: number;
  ohCrapPct: number;
  extras: CustomFund[];
}

/** One bucket's target and what actually reached it. */
export interface Bucket {
  target: number;
  funded: number;
}

export interface FundedExtra extends Bucket {
  id: string;
  name: string;
}

export interface AllocatorResult {
  income: number;
  living: number;
  /** Emergency-fund ceiling: six months of living costs. */
  ohCrapTarget: number;

  business: {
    taxes: number;
    ops: number;
    /** Income minus taxes and ops — everything the waterfall divides. */
    ownerPay: number;
    /** Owner pay as a fraction of income. */
    ownerPayPct: number;
  };

  essentials: Bucket;
  discretionary: Bucket;
  wealth: Bucket;
  ohCrap: Bucket;
  extras: FundedExtra[];

  /** Owner pay still unassigned once every target is met. */
  surplus: number;
  /** How far the full plan exceeds owner pay. Zero when it fits. */
  squeeze: number;
  /** Owner pay can't even cover essentials — by this much. */
  livingShort: number;

  progress: {
    /** Emergency months held after this month's contribution. */
    ohCrapMonths: number;
    /** 0–1, against the six-month target. */
    ohCrapPct: number;
    /** Long-term wealth as a fraction of income. */
    wealthPctOfIncome: number;
  };
}

export function allocate(input: AllocatorInputs): AllocatorResult {
  const income = c0(input.monthlyIncome);
  const living = c0(input.monthlyLiving);
  const balance = c0(input.ohCrapBalance);

  const taxes = c0(input.taxPct) * income;
  const ops = c0(input.opsPct) * income;
  const ownerPay = c0(income - taxes - ops);

  const ohCrapTarget = living * OHCRAP_MONTHS_TARGET;
  const shortfall = Math.max(0, ohCrapTarget - balance);

  // The waterfall. `left` is what remains as each bucket takes its turn.
  let left = ownerPay;
  const take = (target: number): Bucket => {
    const funded = Math.min(target, left);
    left = c0(left - funded);
    return { target, funded };
  };

  // Essentials is the living-expenses figure itself, not a percentage — it's a
  // bill, not a preference, which is why it's first and why it isn't tunable.
  const essentials = take(living);
  const discretionary = take(c0(input.discPct) * income);
  const wealth = take(c0(input.wealthPct) * income);
  // Never overfund past six months: the emergency target is capped by what's
  // still missing, so a full fund asks for nothing and the money flows on.
  const ohCrap = take(Math.min(c0(input.ohCrapPct) * income, shortfall));
  const extras: FundedExtra[] = input.extras.map((e) => ({
    id: e.id,
    name: e.name,
    ...take(c0(e.pct) * income),
  }));

  const buckets = [essentials, discretionary, wealth, ohCrap, ...extras];
  const totalTarget = buckets.reduce((sum, b) => sum + b.target, 0);

  const held = balance + ohCrap.funded;

  return {
    income,
    living,
    ohCrapTarget,
    business: {
      taxes,
      ops,
      ownerPay,
      ownerPayPct: income > 0 ? ownerPay / income : 0,
    },
    essentials,
    discretionary,
    wealth,
    ohCrap,
    extras,
    surplus: left,
    squeeze: c0(totalTarget - ownerPay),
    livingShort: c0(essentials.target - essentials.funded),
    progress: {
      ohCrapMonths: living > 0 ? held / living : 0,
      ohCrapPct: ohCrapTarget > 0 ? Math.min(1, held / ohCrapTarget) : 1,
      wealthPctOfIncome: income > 0 ? wealth.funded / income : 0,
    },
  };
}

export type StatusTone = "pos" | "warn" | "neg" | "mute";

/** How the emergency-fund runway reads, and how loudly. */
export function ohCrapStatus(months: number): { label: string; tone: StatusTone } {
  if (months < 1 - EPS)
    return { label: "Just getting started — under a month saved", tone: "neg" };
  if (months < OHCRAP_MONTHS_TARGET - EPS)
    return { label: "Building runway", tone: "warn" };
  return { label: "Fully funded — six months saved", tone: "pos" };
}

/** Same, for the share of income going to long-term wealth. */
export function wealthStatus(share: number): { label: string; tone: StatusTone } {
  if (share < 0.1 - EPS)
    return { label: "Below target — aim for at least 10% for future you", tone: "neg" };
  if (share < 0.15 - EPS)
    return { label: "On track — nudging toward 15%", tone: "warn" };
  return { label: "Crushing it — future you is very happy", tone: "pos" };
}

/**
 * Future value of investing `monthly` every month for `months`, compounding
 * monthly at `annualRate`. Ordinary annuity — the contribution lands at the end
 * of each period, which is what a monthly transfer actually does.
 */
export function futureValue(monthly: number, annualRate: number, months: number): number {
  const i = annualRate / 12;
  if (months <= 0) return 0;
  if (i === 0) return monthly * months;
  return monthly * ((Math.pow(1 + i, months) - 1) / i);
}
