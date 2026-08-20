/**
 * How a parsed P&L's expense lines are divided for display.
 *
 * This is here rather than in the widget that renders it because of the bug it
 * was extracted to fix. The parser has always stamped every line with the
 * section QuickBooks filed it under, and quickbooks-parse-check.mjs has always
 * asserted that the operating lines sum to QuickBooks' own Expenses total — but
 * the ledger re-derived the split in the view with a filter of its own
 * ("everything that isn't cost of sales"), where no check could reach it. So
 * income tax and loan interest sat in the operating list for months while the
 * P&L panel six inches below it reported the correct figure.
 *
 * Pure, and in this directory, so the split the client actually reads is the
 * one the check script verifies.
 */

import type { LineItem, MoneyCents } from "./types";

export const sumLines = (items: LineItem[]): MoneyCents =>
  items.reduce((acc, l) => acc + l.total, 0);

export type CostSplit = {
  cogsLines: LineItem[];
  operatingLines: LineItem[];
  /** QuickBooks' Other Expenses section: tax, interest, anything below the line. */
  otherLines: LineItem[];
  personalLines: LineItem[];
  cogsTotal: MoneyCents;
  operatingTotal: MoneyCents;
  otherTotal: MoneyCents;
  personalTotal: MoneyCents;
};

/**
 * One expense array into the four kinds of cost, because only one of them is an
 * operating expense and only one of them belongs in a ratio.
 *
 * Cost of sales is netted against the revenue that produced it, in the panel
 * opposite — it isn't discretionary spend, and for a creator selling physical
 * product it's also the largest number on the page. Leaving it in the
 * denominator quietly divided every other ratio down: an accounting fee that is
 * 60% of what the business actually spends to run itself read as 20%, and had
 * to be corrected by hand before it could be said out loud on a client call.
 *
 * Below-the-line spend — QuickBooks' Other Expenses section: income tax,
 * interest, an owner's fuel — comes out for exactly the same reason. It sits
 * under Net Operating Income in the client's own P&L because it isn't the cost
 * of running the business, so it can't be inside the base that "what the
 * business spends to run itself" is a share of.
 *
 * Every one of these tests is `section`, not `category`, and that is the whole
 * point. Which costs are costs of sale, and which are below the line, is a
 * bookkeeping judgement the client's accountant already made when they placed
 * the account; a category map can only ever guess at it from Intuit's subtype
 * enum, which has no notion of where on the P&L an account sits. `CostOfLabor`
 * resolves to `contractors` and `InterestPaid` to `bank-fees` — both perfectly
 * good categories, and both of which silently promoted their line into
 * operating spend back when the test here was "not cost of sales". See
 * PnlSection in types.ts.
 *
 * Personal is the one bucket that IS category-driven, and has to be: it's an
 * override the firm sets on the mapping tab to pull owner spend out of an
 * account the bookkeeper filed as a business one. So it wins over the section,
 * from whichever section the line came.
 *
 * Anything whose section is neither cogs nor operating lands below the line
 * rather than in it. A line must never vanish (rule 4 in parse.ts), and of the
 * two places to put an unexpected one, the one that can't overstate operating
 * spend is the safe default.
 *
 * The totals are the sum of the lines actually rendered, NOT QuickBooks'
 * section summaries. The two can disagree (unapplied and uncategorised amounts
 * aren't leaf rows — rule 2 in parse.ts), and a percentage column that doesn't
 * add to 100% is indefensible in the one setting this report exists for. The
 * P&L panel still reports QuickBooks verbatim, and any disagreement between the
 * two is already surfaced as a warning.
 */
export function splitCosts(expenseLines: LineItem[]): CostSplit {
  const personalLines = expenseLines.filter((l) => l.category === "personal");
  const business = expenseLines.filter((l) => l.category !== "personal");
  const cogsLines = business.filter((l) => l.section === "cogs");
  const operatingLines = business.filter((l) => l.section === "operating");
  const otherLines = business.filter(
    (l) => l.section !== "cogs" && l.section !== "operating",
  );
  return {
    cogsLines,
    operatingLines,
    otherLines,
    personalLines,
    cogsTotal: sumLines(cogsLines),
    operatingTotal: sumLines(operatingLines),
    otherTotal: sumLines(otherLines),
    personalTotal: sumLines(personalLines),
  };
}
