/**
 * Every number on the recap page, derived from the two returns.
 *
 * Pure and isomorphic: the review grid previews with it in the browser and
 * the public page renders with it on the server, from the same stored
 * numbers. The LLM never does arithmetic — it reads lines; this adds them.
 *
 * Formulas follow docs/TAX-RECAP-FIELD-MAP.md. Three conventions, each
 * checked against a real recap:
 *  - Federal Taxes is total tax (line 24) net of refundable credits (line
 *    32): a credit lowers the client's tax, it isn't money they paid. What
 *    they paid is line 33 minus line 32 — withholding and estimates only.
 *  - State Taxes is the state's tax before payments and WITHOUT underpayment
 *    penalties or interest; Penalties get their own row. Some state totals
 *    bundle the penalty in (NJ-1040 "Total Tax Due"); extraction unbundles
 *    it, and validateNumbers flags it if a hand-typed figure still has it.
 *  - "This year's income" is gross receipts plus W-2 wages — what the client
 *    actually earned, before any write-off.
 * On the filing page, Owed = what's due now + what was already paid: the
 * whole year's bill including any penalty, which is how the recaps show it.
 */

import type { RecapInput, ReturnNumbers } from "./schema";

const n = (v: number | null | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);
const has = (v: number | null | undefined): v is number =>
  typeof v === "number" && isFinite(v);

export type RecapSide = {
  w2Income: number;
  businessNetIncome: number;
  otherIncome: number;
  grossIncome: number;
  federalTaxes: number;
  stateTaxes: number;
  penalties: number;
  totalTaxes: number;
};

export function sideSummary(r: ReturnNumbers): RecapSide {
  const w2 = n(r.w2Income);
  const biz = n(r.businessNetIncome);
  // Total income falls back to the parts when line 9 wasn't read, so a
  // half-extracted return still previews instead of showing $0 everywhere.
  const gross = has(r.totalIncome) ? r.totalIncome : w2 + biz;
  const federal = n(r.federalTotalTax) - n(r.federalRefundableCredits);
  const state = n(r.stateTotalTax);
  const penalties = n(r.federalPenalty) + n(r.statePenalty);
  return {
    w2Income: w2,
    businessNetIncome: biz,
    otherIncome: gross - w2 - biz,
    grossIncome: gross,
    federalTaxes: federal,
    stateTaxes: state,
    penalties,
    totalTaxes: federal + state + penalties,
  };
}

export type FilingLine = {
  /** The whole year's bill: due + paid. */
  owed: number;
  /** Withholding and estimated payments actually sent in. */
  paid: number;
  /** Positive = balance due, negative = refund. */
  due: number;
};

function filingLine(
  paid: number,
  refund: number | null,
  balanceDue: number | null,
  /** Fallback when the return's own balance line wasn't read. */
  taxLessPayments: number,
): FilingLine {
  // Prefer the return's own balance line — it already carries the penalty
  // and the rounding; the subtraction is only the fallback.
  const due = has(refund) && refund > 0 ? -refund : has(balanceDue) ? balanceDue : taxLessPayments;
  return { owed: due + paid, paid, due };
}

export type RecapComputed = {
  before: RecapSide;
  after: RecapSide;
  savings: number;
  /** Exact decompositions of `savings` — no counterfactual involved. */
  breakdown: {
    deductionsFound: number;
    seTaxSaved: number;
    incomeTaxSaved: number;
    stateSaved: number;
    penaltiesSaved: number;
  };
  filing: {
    federal: FilingLine;
    state: FilingLine;
    /** Sum of the two `due` figures — the "Total" box on the filing page. */
    total: number;
  };
  currentYearIncome: number;
  priorYearIncome: number | null;
};

export function computeRecap(
  input: Pick<RecapInput, "before" | "after" | "priorYearIncome">,
): RecapComputed {
  const before = sideSummary(input.before);
  const after = sideSummary(input.after);
  const a = input.after;
  const b = input.before;

  // Line 33 bundles refundable credits in with payments; only the payments
  // count as "paid" — the credit already lowered the tax figure above.
  const fedPaid = Math.max(0, n(a.federalPayments) - n(a.federalRefundableCredits));
  const federal = filingLine(
    fedPaid,
    a.federalRefund,
    a.federalAmountOwed,
    after.federalTaxes - fedPaid + n(a.federalPenalty),
  );
  // stateTotalDue is the figure the client actually pays (includes penalty),
  // so it wins over the pre-penalty balance when both were read.
  const statePaid = n(a.statePayments);
  const state = filingLine(
    statePaid,
    a.stateRefund,
    has(a.stateTotalDue) ? a.stateTotalDue : a.stateAmountOwed,
    after.stateTaxes - statePaid + n(a.statePenalty),
  );

  const income = has(a.grossReceipts) ? a.grossReceipts : has(b.grossReceipts) ? b.grossReceipts : before.businessNetIncome;

  return {
    before,
    after,
    savings: before.totalTaxes - after.totalTaxes,
    breakdown: {
      deductionsFound: before.businessNetIncome - after.businessNetIncome,
      seTaxSaved: n(b.seTax) - n(a.seTax),
      incomeTaxSaved: n(b.incomeTax) - n(a.incomeTax),
      stateSaved: before.stateTaxes - after.stateTaxes,
      penaltiesSaved: before.penalties - after.penalties,
    },
    filing: { federal, state, total: federal.due + state.due },
    currentYearIncome: income + n(a.w2Income ?? b.w2Income),
    priorYearIncome: input.priorYearIncome,
  };
}

/* ─────────────────────────────── validation ─────────────────────────────── */

export type Warning = { side: "before" | "after" | "both"; message: string };

/** Rounding on the forms is to the dollar, so identities hold within $2. */
const TOL = 2;
const off = (x: number, y: number) => Math.abs(x - y) > TOL;
const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/** Arithmetic identities within one return. Any failure means "look again". */
export function validateNumbers(r: ReturnNumbers, side: "before" | "after"): Warning[] {
  const w: Warning[] = [];
  const add = (message: string) => w.push({ side, message });

  if (!has(r.federalTotalTax)) add("Federal total tax (1040 line 24) wasn't read");
  if (!has(r.totalIncome) && !has(r.businessNetIncome) && !has(r.w2Income)) {
    add("No income lines were read");
  }

  if (has(r.federalTotalTax) && has(r.incomeTax) && has(r.seTax)) {
    const gap = r.federalTotalTax - (r.incomeTax + r.seTax);
    if (Math.abs(gap) > TOL) {
      // Not necessarily wrong: Schedule 2 carries other taxes (a premium tax
      // credit repayment is the common one) and Schedule 3 credits, neither
      // of which is read. Worth a glance, not an alarm.
      add(
        `Federal total tax is ${fmt(Math.abs(gap))} ${gap > 0 ? "more" : "less"} than income tax + SE tax — usually other Schedule 2 taxes (e.g. premium tax credit repayment) or credits; check if unexpected`,
      );
    }
  }
  if (has(r.taxableIncome) && has(r.agi) && r.taxableIncome > r.agi + TOL) {
    add("Taxable income is larger than AGI");
  }
  if (has(r.totalIncome)) {
    const parts = n(r.w2Income) + n(r.businessNetIncome);
    if (r.totalIncome + TOL < parts) {
      add(`Total income ${fmt(r.totalIncome)} is less than W-2 + business income ${fmt(parts)}`);
    }
  }
  if (has(r.federalAmountOwed) && has(r.federalTotalTax)) {
    const expected = r.federalTotalTax - n(r.federalPayments) + n(r.federalPenalty);
    if (off(r.federalAmountOwed, expected)) {
      const gap = r.federalAmountOwed - expected;
      add(
        `Federal amount owed ${fmt(r.federalAmountOwed)} ≠ total tax − payments + penalty ${fmt(expected)}` +
          (!has(r.federalPenalty) && gap > 0
            ? ` — the ${fmt(gap)} gap may be an estimated tax penalty on line 38 that wasn't read`
            : ""),
      );
    }
  }
  if (has(r.federalRefund) && has(r.federalTotalTax) && has(r.federalPayments)) {
    const expected = r.federalPayments - r.federalTotalTax - n(r.federalPenalty);
    if (off(r.federalRefund, expected)) {
      add(`Federal refund ${fmt(r.federalRefund)} ≠ payments − total tax − penalty ${fmt(expected)}`);
    }
  }
  if (has(r.federalRefundableCredits) && has(r.federalPayments) && r.federalRefundableCredits > r.federalPayments + TOL) {
    add("Refundable credits (line 32) exceed total payments (line 33), which includes them");
  }
  if (
    has(r.stateTotalTax) &&
    has(r.stateTotalDue) &&
    n(r.statePenalty) > 0 &&
    !off(r.stateTotalDue, r.stateTotalTax - n(r.statePayments))
  ) {
    add(
      `State total tax ${fmt(r.stateTotalTax)} looks like it includes the ${fmt(n(r.statePenalty))} penalty — the recap would count it twice`,
    );
  }
  if (has(r.businessNetIncome) && has(r.grossReceipts)) {
    const expected = r.grossReceipts - n(r.totalExpenses) - n(r.homeOffice);
    if (off(r.businessNetIncome, expected)) {
      add(
        `Schedule C net profit ${fmt(r.businessNetIncome)} ≠ gross receipts − expenses − home office ${fmt(expected)} (COGS, returns or other income may explain it)`,
      );
    }
  }
  if (has(r.stateTotalDue) && has(r.stateAmountOwed)) {
    if (off(r.stateTotalDue, r.stateAmountOwed + n(r.statePenalty))) {
      add(
        `State total due ${fmt(r.stateTotalDue)} ≠ amount owed + penalties ${fmt(r.stateAmountOwed + n(r.statePenalty))}`,
      );
    }
  }
  return w;
}

/**
 * Cross-checks between the two returns. They come from the same ProSeries
 * file with the income untouched, so anything income-side that differs is a
 * sign the wrong file was uploaded on one side.
 */
export function crossValidate(before: ReturnNumbers, after: ReturnNumbers): Warning[] {
  const w: Warning[] = [];
  const add = (message: string) => w.push({ side: "both", message });

  if (has(before.grossReceipts) && has(after.grossReceipts) && off(before.grossReceipts, after.grossReceipts)) {
    add(
      `Gross receipts differ: ${fmt(before.grossReceipts)} before vs ${fmt(after.grossReceipts)} after — the before return should carry the same income`,
    );
  }
  if (has(before.w2Income) && has(after.w2Income) && off(before.w2Income, after.w2Income)) {
    add("W-2 wages differ between the two returns");
  }
  if (
    has(before.federalPayments) &&
    has(after.federalPayments) &&
    off(before.federalPayments, after.federalPayments)
  ) {
    add("Federal payments differ between the two returns");
  }
  const b = sideSummary(before);
  const a = sideSummary(after);
  if (a.totalTaxes > b.totalTaxes + TOL) {
    add(
      `The after return owes more (${fmt(a.totalTaxes)}) than the before (${fmt(b.totalTaxes)}) — are the files swapped?`,
    );
  }
  return w;
}

export function validateAll(before: ReturnNumbers, after: ReturnNumbers): Warning[] {
  return [
    ...validateNumbers(before, "before"),
    ...validateNumbers(after, "after"),
    ...crossValidate(before, after),
  ];
}
