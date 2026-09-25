/**
 * Derive the BEFORE return from the AFTER return, and split the savings by
 * strategy.
 *
 * A "before" print is the same ProSeries file with the business's write-offs
 * deleted, then recalculated: same income, same payments, same filing
 * status, same household. For a sole proprietor that means every Schedule C
 * expense and the home office at zero. For an S corporation it means every
 * deduction on the 1120-S at zero — cost of goods sold, the owner's salary,
 * the retirement plan, everything — so the K-1 is the gross receipts, with
 * no PTE election on either return. That is what the CPA's zero-write-off
 * prints do, and it's what this module computes from the after return (and,
 * for an S corporation, the entity return) plus the year's tax tables
 * (tables.ts). The after return is the only PDF the builder needs; the
 * 1120-S joins it when the 1040 carries K-1 income.
 *
 * It refuses more often than it derives, on purpose. Two kinds of gate:
 *
 *  1. Shape. The after return has to be one the engine models: one business
 *     (a Schedule C or an S corporation K-1), the standard deduction, credits
 *     it can compute, a state whose card is on the year's tables (resident,
 *     or nonresident where the card allows it; with an entity card when the
 *     business is an S corporation).
 *  2. Proof. Before deriving anything, the engine re-runs the after return
 *     from its own inputs and compares to what was read off the PDF: SE tax,
 *     the health insurance deduction, QBI, taxable income, income tax, the
 *     premium tax credit, the child tax credit, net investment income tax,
 *     federal total, the state's own lines and total, and for an S
 *     corporation the entity's tax and elective tax. Any line off by more
 *     than $2 means the return carries something the engine doesn't model —
 *     or a card is wrong — and the derivation is refused with the line named.
 *
 * A refusal isn't a failure; the builder then lets the reviewer type the
 * before column or add a before print.
 *
 * The same model, once it reproduces the after return, can run any point
 * between the before and the after. `attributeStrategies` walks from one to
 * the other switching the strategies on one at a time — write-offs, then
 * the owner's salary, then the retirement plan, then the PTE election — and
 * the drop at each step is that strategy's savings. The steps sum to the
 * headline exactly. The order is stated on the recap because it matters: a
 * deduction is worth more at a higher bracket, so what comes first gets the
 * higher rate.
 *
 * What can't be derived at all is the underpayment penalty (Form 2210 needs
 * prior-year tax and payment dates). The after return's penalty is carried
 * across as a floor, and the note says so.
 *
 * State rules are read off the state's card, not written here. The Tax
 * Tables page edits the cards; this file only interprets them.
 *
 * Pure and isomorphic: the builder derives in the browser; the Tax Tables
 * page proves a card against saved recaps; a script checks the seeds
 * (`npm run recap:check`).
 */

import { totalTaxesOf } from "./compute";
import {
  ENTITY_FIELDS,
  RETURN_FIELDS,
  emptyEntityNumbers,
  emptyNumbers,
  type DerivedBefore,
  type EntityFieldKey,
  type EntityNumbers,
  type RecapAnalysis,
  type ReturnFieldKey,
  type ReturnNumbers,
} from "./schema";
import {
  FILING_STATUS_LABEL,
  cardFor,
  mergeTables,
  type Bracket,
  type FederalCard,
  type FilingStatus,
  type StateCard,
  type TableSet,
  type TaxTableRule,
} from "./tables";

/** Bump when a formula changes, so a stored recap says which engine made it. */
export const DERIVE_VERSION = "5";

export type DeriveMeta = {
  taxYear: number | null;
  filingStatus: string | null;
  stateCode: string | null;
  stateForm: string | null;
};

/** A proof-step failure: what the after return prints vs what the tables give. */
export type Mismatch = { line: string; read: number; computed: number };

export type DeriveResult =
  | {
      ok: true;
      before: ReturnNumbers;
      /** The S corporation's before return, or null for a sole proprietor. */
      entityBefore: EntityNumbers | null;
      derived: DerivedBefore;
    }
  | {
      ok: false;
      reasons: string[];
      /** Present when the refusal came from the proof step rather than the return's shape. */
      mismatches: Mismatch[];
    };

/* ─────────────────────────────── helpers ─────────────────────────────── */

const has = (v: number | null | undefined): v is number =>
  typeof v === "number" && isFinite(v);
const n = (v: number | null | undefined) => (has(v) ? v : 0);
/** Forms round to the dollar, so identities hold within $2 (same as compute.ts). */
const TOL = 2;
const off = (x: number, y: number) => Math.abs(x - y) > TOL;
const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const label = (k: ReturnFieldKey) => RETURN_FIELDS.find((f) => f.key === k)?.label ?? k;
const entityLabel = (k: EntityFieldKey) => ENTITY_FIELDS.find((f) => f.key === k)?.label ?? k;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** ProSeries prints "Single", "Married filing jointly", …; Claude reports it as free text. */
export function parseFilingStatus(s: string | null | undefined): FilingStatus | null {
  const t = (s ?? "").toLowerCase();
  if (!t) return null;
  if (/joint/.test(t)) return "mfj";
  if (/separate/.test(t)) return "mfs";
  if (/head/.test(t)) return "hoh";
  if (/surviving|widow/.test(t)) return "qss";
  if (/single/.test(t)) return "single";
  return null;
}

/** "Form 540", "540 ", "CA 540", "NJ-1040" → "540" / "NJ1040". */
const normalizeForm = (s: string | null | undefined) =>
  (s ?? "").toUpperCase().replace(/FORM|\s|[^A-Z0-9]/g, "").replace(/^[A-Z]{2}(?=\d)/, "");

/** Tax on `income` under a progressive schedule, unrounded. */
function scheduleTax(brackets: Bracket[], income: number): number {
  let tax = 0;
  let floor = 0;
  for (const { upTo, rate } of brackets) {
    if (income <= floor) break;
    const cap = upTo ?? Infinity;
    tax += (Math.min(income, cap) - floor) * rate;
    floor = cap;
  }
  return tax;
}

/**
 * Tax as the return would print it: from the tax table (rounded to its row
 * convention) below the cut-off, from the rate schedule above it.
 */
function printedTax(brackets: Bracket[], table: TaxTableRule | null, taxable: number): number {
  if (taxable <= 0) return 0;
  if (table && taxable < table.below && table.row > 0) {
    const row = table.row;
    const at =
      table.rounding === "centred"
        ? Math.max(0, Math.ceil((taxable - row / 2) / row) * row)
        : Math.floor(taxable / row) * row + row / 2;
    return Math.round(scheduleTax(brackets, at));
  }
  return Math.round(scheduleTax(brackets, taxable));
}

/* ─────────────────────────────── federal ─────────────────────────────── */

/** The marketplace coverage figures read off Form 8962, fixed across before and after. */
type Coverage = {
  familySize: number;
  povertyLine: number;
  months: number;
  premiums: number;
  slcsp: number;
  advance: number;
};

/** Form 8995-A Part II inputs, when the return is over the QBI threshold. */
type QbiInputs = { income: number; w2Wages: number; ubia: number };

type FederalInputs = {
  /** Schedule C net profit — subject to SE tax. */
  netProfit: number;
  /** S corporation ordinary income from the K-1 — not subject to SE tax. */
  scorp: number;
  /** Form W-2 box 1. */
  w2: number;
  /** Form W-2 box 5: what Social Security and Medicare were paid on. Equal to box 1 unless read. */
  medicareWages: number;
  otherIncome: number;
  /** Schedule 1 adjustments other than the SE and health insurance deductions, carried across. */
  carried: number;
  /** Form 7206 line 1, or null when there is no such form. */
  sehiPaid: number | null;
  coverage: Coverage | null;
  /** Read off Form 8995-A when the return is over the threshold; null means the simplified Form 8995 from the business itself. */
  qbi: QbiInputs | null;
  /** Qualifying children for the child tax credit. */
  children: number;
  /** Schedule 3 line 2, taken as read (it needs earned income, so it's zero without any). */
  childCareCredit: number;
  /** The rest of Form 1040 line 20, carried across. */
  otherCredits: number;
};

type Ptc = {
  /** Household income as a whole percentage of the poverty line, as line 5 prints it. */
  pct: number;
  figure: number;
  contribution: number;
  monthly: number;
  allowed: number;
  /** Line 26: credit above the advance, refundable. */
  net: number;
  /** Line 29: advance above the credit, paid back on Schedule 2, after the cap. */
  repayment: number;
};

type Federal = {
  seEarnings: number;
  seTax: number;
  halfSe: number;
  /** Form 7206 line 14 → Schedule 1 line 17. */
  sehi: number;
  additionalMedicare: number;
  totalIncome: number;
  adjustments: number;
  agi: number;
  deduction: number;
  taxableBeforeQbi: number;
  /** What the QBI deduction was figured on (Form 8995-A line 2, or the Schedule C's QBI). */
  qbiBase: number;
  /** True when 20% of QBI, not the taxable-income limit, set the deduction. */
  qbiComponentBinds: boolean;
  qbi: number;
  taxable: number;
  incomeTax: number;
  ptc: Ptc | null;
  /** Form 1040 line 17: the excess advance credit repaid. */
  additionalTaxes: number;
  /** Form 1040 line 19. */
  childTaxCredit: number;
  /** Form 1040 line 20. */
  credits: number;
  /** Schedule 2 line 12. */
  niit: number;
  totalTax: number;
  /** Form 1040 line 32: the net premium tax credit. */
  refundable: number;
  /** Wages plus Schedule C profit: what the child-care credit needs. */
  earnedIncome: number;
};

/** Form 8962 lines 5–8b and 24–29 for one household income. */
function premiumTaxCredit(card: FederalCard, status: FilingStatus, magi: number, c: Coverage): Ptc {
  const t = card.ptc;
  const raw = c.povertyLine > 0 ? Math.floor((magi / c.povertyLine) * 100) : 0;
  // Line 5 prints at most one point over the cap ("if 401 or more, enter 401").
  const pct = Math.min(raw, t.capAt + 1);
  let figure = 0;
  if (raw >= t.capAt) figure = t.capFigure;
  else {
    const row = t.applicableFigure.find((r) => raw >= r.from && raw < r.to);
    if (row) figure = round4(row.start + ((raw - row.from) / (row.to - row.from)) * (row.end - row.start));
  }
  const contribution = Math.round(magi * figure);
  const monthly = Math.round(contribution / 12);
  const months = Math.max(1, Math.min(12, Math.round(c.months)));
  // The 1095-A carries whole dollars per month; the form works month by month.
  const premium = Math.round(c.premiums / months);
  const slcsp = Math.round(c.slcsp / months);
  const perMonth = Math.min(premium, Math.max(0, slcsp - monthly));
  const allowed = perMonth * months;
  const net = Math.max(0, allowed - c.advance);
  let repayment = 0;
  if (c.advance > allowed) {
    const excess = c.advance - allowed;
    const cap = t.repaymentLimit.find((r) => raw < r.below);
    const limit = cap ? (status === "single" ? cap.single : cap.other) : Infinity;
    repayment = Math.min(excess, limit);
  }
  return { pct, figure, contribution, monthly, allowed, net, repayment };
}

/**
 * Form 8995 (simplified) below the threshold; Form 8995-A above it, where
 * the deduction is capped at the W-2 wage limit (or wages plus property),
 * phased in over the range. `base` is the qualified business income; the
 * income limitation is 20% of taxable income before the deduction (net
 * capital gain is not taken out — a return with one is refused elsewhere).
 */
function qbiDeduction(
  card: FederalCard,
  status: FilingStatus,
  base: number,
  taxableBeforeQbi: number,
  w2Wages: number,
  ubia: number,
): { deduction: number; componentBinds: boolean } {
  const q = card.qbi;
  const full = Math.round(Math.max(0, base) * q.rate);
  const limit = Math.round(taxableBeforeQbi * q.rate);
  let component = full;
  const threshold = q.threshold[status];
  const range = q.phaseInRange[status];
  if (taxableBeforeQbi > threshold) {
    const wageLimit = Math.max(
      Math.round(w2Wages * q.wageLimit),
      Math.round(w2Wages * q.wageAndPropertyLimit.wages) + Math.round(ubia * q.wageAndPropertyLimit.property),
    );
    if (range <= 0 || taxableBeforeQbi >= threshold + range) {
      component = Math.min(full, wageLimit);
    } else if (full > wageLimit) {
      // Part III: the excess over the limit is reduced by the share of the range used up.
      const pct = (taxableBeforeQbi - threshold) / range;
      component = full - Math.round((full - wageLimit) * pct);
    }
  }
  return { deduction: Math.max(0, Math.min(component, limit)), componentBinds: component < limit };
}

/** Form 1040 line 19 before the tax-liability limit. */
function childTaxCredit(card: FederalCard, status: FilingStatus, agi: number, children: number): number {
  if (children <= 0) return 0;
  const c = card.childTaxCredit;
  const over = Math.max(0, agi - c.phaseOutThreshold[status]);
  const reduction = c.phaseOutStep > 0 ? Math.ceil(over / c.phaseOutStep) * c.phaseOutPer : 0;
  return Math.max(0, children * c.perChild - reduction);
}

/**
 * The federal side of the return: Schedule SE, Form 7206, Form 8959, the
 * standard deduction, Form 8995 / 8995-A, Form 8962, the tax, the child tax
 * credit, Form 8960. Rounding follows the forms line by line, which is what
 * makes the self-check exact.
 */
function federal(card: FederalCard, status: FilingStatus, i: FederalInputs): Federal {
  const se = card.selfEmployment;
  const seEarnings = i.netProfit > 0 ? Math.round(i.netProfit * se.netEarningsFactor) : 0;
  const ssRoom = Math.max(0, se.wageBase - i.medicareWages);
  const socialSecurity = Math.round(Math.min(seEarnings, ssRoom) * se.socialSecurityRate);
  const medicare = Math.round(seEarnings * se.medicareRate);
  // Schedule SE line 4c: under $400 of net earnings there is no SE tax.
  const seTax = seEarnings >= 400 ? socialSecurity + medicare : 0;
  const halfSe = Math.round(seTax / 2);

  // Form 7206: the premiums, capped at the business's profit less the SE
  // deduction — or, for a more-than-2% S corporation shareholder, at the
  // Medicare wages the premiums were run through (line 11).
  const sehiCap = i.scorp > 0 && i.netProfit <= 0 ? i.medicareWages : Math.max(0, i.netProfit - halfSe);
  const sehi = i.sehiPaid !== null ? Math.min(i.sehiPaid, sehiCap) : 0;

  const am = card.additionalMedicare;
  const additionalMedicare = Math.round(
    Math.max(0, i.medicareWages + seEarnings - am.threshold[status]) * am.rate,
  );

  const totalIncome = i.w2 + i.netProfit + i.scorp + i.otherIncome;
  const adjustments = halfSe + sehi + i.carried;
  const agi = totalIncome - adjustments;
  const deduction = card.standardDeduction[status];
  const taxableBeforeQbi = Math.max(0, agi - deduction);

  // §1.199A-3: a sole proprietor's QBI is net profit less the deductions
  // attributable to it — the SE deduction and the health insurance
  // deduction. An S corporation's comes off Form 8995-A as read.
  const qbiBase = i.qbi ? i.qbi.income : Math.max(0, i.netProfit - halfSe - sehi);
  const q = qbiDeduction(card, status, qbiBase, taxableBeforeQbi, i.qbi?.w2Wages ?? 0, i.qbi?.ubia ?? 0);
  const qbi = q.deduction;

  const taxable = Math.max(0, taxableBeforeQbi - qbi);
  const incomeTax = printedTax(card.brackets[status], card.taxTable, taxable);

  // Form 8962 works from modified AGI; with no tax-exempt interest, foreign
  // income or nontaxable Social Security that is AGI.
  const ptc = i.coverage ? premiumTaxCredit(card, status, agi, i.coverage) : null;
  const additionalTaxes = ptc?.repayment ?? 0;
  const refundable = ptc?.net ?? 0;

  // Lines 18–22: the child tax credit is limited to the tax left after the
  // other nonrefundable credits (Credit Limit Worksheet A).
  const tax18 = incomeTax + additionalTaxes;
  const credits = i.childCareCredit + i.otherCredits;
  const ctc = Math.min(childTaxCredit(card, status, agi, i.children), Math.max(0, tax18 - credits));
  const line22 = Math.max(0, tax18 - ctc - credits);

  // Form 8960: on the smaller of net investment income and AGI over the
  // threshold. Business income (Schedule C, a K-1 the owner works in) is
  // not investment income; what's left of "other income" is taken as it.
  const ni = card.netInvestmentIncomeTax;
  const niit = Math.round(
    Math.min(Math.max(0, i.otherIncome), Math.max(0, agi - ni.threshold[status])) * ni.rate,
  );

  return {
    seEarnings,
    seTax,
    halfSe,
    sehi,
    additionalMedicare,
    totalIncome,
    adjustments,
    agi,
    deduction,
    taxableBeforeQbi,
    qbiBase,
    qbiComponentBinds: q.componentBinds,
    qbi,
    taxable,
    incomeTax,
    ptc,
    additionalTaxes,
    childTaxCredit: ctc,
    credits,
    niit,
    totalTax: line22 + seTax + additionalMedicare + niit,
    refundable,
    earnedIncome: i.w2 + Math.max(0, i.netProfit),
  };
}

/* ─────────────────────────────── state ─────────────────────────────── */

type StateInputs = {
  w2: number;
  otherIncome: number;
  /** The state's own business profit line (New Jersey), or the federal one. */
  businessIncome: number;
  /** Marketplace premiums less the credit allowed: what the client actually paid. */
  netPremiums: number;
  uninsuredMonths: number;
  /** The exemption amount as printed on the after return, carried across when the card deducts it. */
  exemptionsRead: number | null;
  dependents: number;
  /** The pass-through entity elective tax credit the shareholder can claim (0 without the election). */
  pteCreditAvailable: number;
  /** Income left off the state return because the entity paid the elective tax on it (Georgia's way). */
  pteExcluded: number;
};

type State = {
  income: number;
  taxable: number;
  /** Tax on taxable income before credits and add-ons (NJ line 43, CA line 31). */
  tax: number;
  exemption: number;
  medical: number;
  local: number;
  sharedResponsibility: number;
  /** The PTE credit actually used: limited to the tax when nonrefundable, the whole share when refundable. */
  pteCredit: number;
  /** The state's printed total before a refundable PTE credit (NJ-1040 line 54). */
  grossTax: number;
  /** What the recap calls State Taxes: tax less every credit, plus add-ons. */
  netTax: number;
};

const EMPTY_STATE: State = {
  income: 0, taxable: 0, tax: 0, exemption: 0, medical: 0, local: 0, sharedResponsibility: 0, pteCredit: 0, grossTax: 0, netTax: 0,
};

/**
 * A resident state return following the card's rules: start from federal
 * AGI, federal taxable income or the state's own gross income, add back
 * what the state disallows, take the state's deduction, the exemptions as
 * a deduction or a credit (personal and dependents, each with its own
 * phase-out on federal AGI), a medical deduction if the card has one, tax
 * it the way the state's table rounds, then any surtax, the PTE credit,
 * city tax and coverage penalty.
 */
function state(card: StateCard, status: FilingStatus, fed: Federal, s: StateInputs): State {
  if (!card.incomeTax) return EMPTY_STATE;

  let income =
    card.base === "stateGrossIncome"
      ? s.w2 + s.businessIncome + s.otherIncome
      : card.base === "federalTaxableIncome"
        ? fed.taxable
        : fed.agi;
  if (card.addBackSeDeduction && card.base !== "stateGrossIncome") income += fed.halfSe;
  if (card.base === "federalTaxableIncome" && card.addBackQbi) income += fed.qbi;
  const mode = creditMode(card);
  if (mode === "exclusion") income = Math.max(0, income - s.pteExcluded);

  const deduction =
    card.deduction.kind === "standard"
      ? card.deduction.amount[status]
      : card.deduction.kind === "federal"
        ? fed.deduction
        : 0;

  const ex = card.exemption;
  let exemption = 0;
  if (ex.kind !== "none") {
    let reduce = 0;
    if (ex.phaseOut) {
      const over = fed.agi - ex.phaseOut.threshold[status];
      if (over > 0) reduce = Math.ceil(over / ex.phaseOut.step[status]) * ex.phaseOut.reduce;
    }
    // Each exemption shrinks on its own and stops at zero: California's
    // $153 personal credit is gone before the $475 dependent credit is.
    exemption =
      Math.max(0, ex.amount - reduce) * ex.count[status] +
      Math.max(0, ex.dependentAmount - reduce) * s.dependents;
    if (ex.kind === "deduction" && s.exemptionsRead !== null) exemption = s.exemptionsRead;
  }

  const medical = card.medical
    ? Math.max(0, s.netPremiums - Math.round(income * card.medical.floorRate)) +
      (card.medical.seHealthInsuranceFull ? fed.sehi : 0)
    : 0;

  const taxable = Math.max(
    0,
    income - deduction - (ex.kind === "deduction" ? exemption : 0) - medical,
  );
  let tax = printedTax(card.brackets[status], card.taxTable, taxable);
  if (card.surtax && taxable > card.surtax.above) {
    tax += Math.round((taxable - card.surtax.above) * card.surtax.rate);
  }
  const credit = ex.kind === "credit" ? exemption : 0;
  const afterExemption = Math.max(0, tax - credit);
  const local = card.local ? printedTax(card.local.brackets[status], card.taxTable, taxable) : 0;

  let sharedResponsibility = 0;
  const srp = card.sharedResponsibility;
  if (srp && s.uninsuredMonths > 0) {
    const byIncome = Math.round(Math.max(0, income - srp.threshold[status]) * srp.rate);
    const flat = srp.flatAdult * card.exemption.count[status];
    sharedResponsibility = Math.round((Math.max(byIncome, flat) * s.uninsuredMonths) / 12);
  }

  // A nonrefundable credit (California) comes off the tax before the
  // add-ons and stops at zero; a refundable one (New Jersey's BAIT) is
  // claimed with the payments in full, so the printed total is gross of it.
  const available = Math.max(0, s.pteCreditAvailable);
  const pteCredit = mode === "nonrefundable" ? Math.min(available, afterExemption) : mode === "refundable" ? available : 0;
  const grossTax = afterExemption + local + sharedResponsibility;

  return {
    income,
    taxable,
    tax,
    exemption,
    medical,
    local,
    sharedResponsibility,
    pteCredit,
    grossTax,
    netTax: grossTax - pteCredit,
  };
}

/**
 * A nonresident or part-year return the California way (Form 540NR): the
 * tax is figured as if resident on all income, then scaled by the
 * state-source share. Line by line — 19 total taxable income, 31 tax on it,
 * 32 state AGI (state-source income less the adjustments' share), 35 state
 * taxable income (less the standard deduction's share), 36 the resident
 * rate to four decimals, 37 the prorated tax, 38 the exemption share, 39
 * the prorated credit, 40 the result. The state-source income is a fixed
 * dollar amount: it's what was earned there, and doesn't move when the
 * write-offs come off.
 */
function nonresidentState(
  card: StateCard,
  status: FilingStatus,
  fed: Federal,
  s: StateInputs,
  stateSource: number,
): State {
  const resident = state(card, status, fed, s);
  const totalTaxable = resident.taxable;
  const tax = resident.tax;
  const share = fed.totalIncome > 0 ? stateSource / fed.totalIncome : 0;
  const stateAgi = Math.max(0, stateSource - Math.round(fed.adjustments * share));
  const deduction = card.deduction.kind === "standard" ? card.deduction.amount[status] : 0;
  const taxable = Math.max(
    0,
    stateAgi - Math.round(fed.agi > 0 ? (deduction * stateAgi) / fed.agi : 0),
  );
  const rate = totalTaxable > 0 ? round4(tax / totalTaxable) : 0;
  const stateTax = Math.round(taxable * rate);
  const pct = totalTaxable > 0 ? Math.min(1, round4(taxable / totalTaxable)) : 0;
  const exemption = card.exemption.kind === "credit" ? Math.round(resident.exemption * pct) : 0;
  const afterExemption = Math.max(0, stateTax - exemption);
  const mode = creditMode(card);
  const available = Math.max(0, s.pteCreditAvailable);
  const pteCredit = mode === "nonrefundable" ? Math.min(available, afterExemption) : mode === "refundable" ? available : 0;
  return {
    ...resident,
    income: stateAgi,
    taxable,
    tax: stateTax,
    exemption,
    local: 0,
    sharedResponsibility: 0,
    pteCredit,
    grossTax: afterExemption,
    netTax: afterExemption - pteCredit,
  };
}

/* ─────────────────────────────── the S corporation ─────────────────────────────── */

/** What the state charges the corporation itself (Form 100S, CBT-100S). */
export type EntityTax = { netIncome: number; franchise: number; pte: number; total: number };

/**
 * The corporation's own state tax by the card's rules: the rate on its net
 * income, at least the minimum for its gross receipts; and the elective
 * pass-through entity tax on the same income when it elected.
 */
export function entityTax(card: StateCard, netIncome: number, grossReceipts: number, electPte: boolean): EntityTax {
  const e = card.entity;
  if (!e) return { netIncome, franchise: 0, pte: 0, total: 0 };
  const tier = e.minimum.find((r) => r.below === null || grossReceipts < r.below) ?? e.minimum[e.minimum.length - 1];
  const minimum = tier ? tier.amount : 0;
  const franchise = Math.max(minimum, Math.round(Math.max(0, netIncome) * e.rate));
  const pte = electPte && e.pte ? Math.round(scheduleTax(e.pte.brackets, Math.max(0, netIncome))) : 0;
  return { netIncome, franchise, pte, total: franchise + pte };
}

/** How the shareholder gets the entity's elective tax back, per the card. */
const creditMode = (card: StateCard | null) => card?.entity?.pte?.credit ?? "nonrefundable";

/* ─────────────────────────────── the model ─────────────────────────────── */

/**
 * Which strategies are switched on. Everything off is the before; everything
 * on is the after. The sole-proprietor keys are expenses and homeOffice; the
 * S corporation keys are the other four.
 */
type Scenario = {
  expenses: boolean;
  homeOffice: boolean;
  writeOffs: boolean;
  salary: boolean;
  retirement: boolean;
  pte: boolean;
};

const ALL_OFF: Scenario = { expenses: false, homeOffice: false, writeOffs: false, salary: false, retirement: false, pte: false };
const ALL_ON: Scenario = { expenses: true, homeOffice: true, writeOffs: true, salary: true, retirement: true, pte: true };

/** One run of the whole return at some point between the before and the after. */
type Outcome = {
  fed: Federal;
  st: State | null;
  entity: EntityTax | null;
  numbers: ReturnNumbers;
  entityNumbers: EntityNumbers | null;
  /** Federal net of refundable credits + state + entity + the carried penalties: the recap's total. */
  total: number;
};

/**
 * Everything the engine learned from the after return once it proved it
 * could reproduce it: the fixed inputs, and `run`, which computes any
 * scenario from them.
 */
type Model = {
  shape: "soleProp" | "scorp";
  status: FilingStatus;
  card: { federal: FederalCard; state: StateCard | null };
  year: number;
  stateCode: string | null;
  run: (s: Scenario) => Outcome;
  /** The after return as the engine reproduces it. */
  after: Outcome;
  /** Fixed facts the notes and the attribution labels quote. */
  facts: {
    expenses: number;
    homeOffice: number;
    cogs: number;
    writeOffs: number;
    officerComp: number;
    healthInsurance: number;
    deferral: number;
    pension: number;
    stateAddBack: number;
    ownershipPct: number;
    coverage: Coverage | null;
    carried: number;
    stateSource: number | null;
    uninsured: number;
    uninsuredNote: string | null;
    w2Note: boolean;
    fedWithholding: number;
    stateWithholding: number;
  };
};

type ModelResult = { ok: true; model: Model } | { ok: false; reasons: string[]; mismatches: Mismatch[] };

/**
 * Prove the tables on the after return (and the entity return) and hand
 * back the model. This is the gate everything else goes through.
 */
function buildModel(
  after: ReturnNumbers,
  meta: DeriveMeta,
  tables: TableSet,
  entity: EntityNumbers | null,
): ModelResult {
  const reasons: string[] = [];
  const mismatches: Mismatch[] = [];
  const refuse = (): ModelResult => ({ ok: false, reasons, mismatches });

  /* 1 · what the engine needs to exist */

  const year = meta.taxYear;
  const card = year ? cardFor(year, tables) : null;
  if (!card) {
    reasons.push(
      year
        ? `No tax tables for ${year} yet — add the year on the Tax Tables page`
        : "The tax year wasn't read from the after return",
    );
  }
  const status = parseFilingStatus(meta.filingStatus);
  if (!status) {
    reasons.push(
      meta.filingStatus
        ? `Filing status "${meta.filingStatus}" wasn't recognised`
        : "The filing status wasn't read from the after return",
    );
  }

  const scorpIncome = n(after.scorpIncome);
  const schC = has(after.businessNetIncome) && after.businessNetIncome !== 0;
  if (scorpIncome > 0 && schC) {
    reasons.push(
      "The return carries both a Schedule C and an S corporation K-1 — the engine models one business at a time",
    );
  }
  const shape: Model["shape"] = scorpIncome > 0 ? "scorp" : "soleProp";
  const required: ReturnFieldKey[] =
    shape === "scorp"
      ? ["scorpIncome", "totalIncome", "agi", "taxableIncome", "incomeTax", "federalTotalTax"]
      : ["grossReceipts", "businessNetIncome", "totalIncome", "agi", "taxableIncome", "incomeTax", "seTax", "federalTotalTax"];
  const missing = required.filter((k) => !has(after[k]));
  if (missing.length) {
    reasons.push(`These lines weren't read from the after return: ${missing.map(label).join(", ")}`);
  }
  if (shape === "scorp" && !entity) {
    reasons.push(
      "The 1040 carries S corporation income from a K-1 — add the corporation's 1120-S so the before can be computed from its gross receipts",
    );
  }
  if (shape === "scorp" && entity) {
    const need: EntityFieldKey[] = ["grossReceipts", "totalIncome", "totalDeductions", "ordinaryIncome", "k1Ordinary"];
    const miss = need.filter((k) => !has(entity[k]));
    if (miss.length) {
      reasons.push(`These lines weren't read from the 1120-S: ${miss.map(entityLabel).join(", ")}`);
    }
  }
  if (!card || !status || reasons.length) return refuse();

  const fed = card.federal;
  const statusLabel = FILING_STATUS_LABEL[status];
  const w2 = n(after.w2Income);
  const otherIncome = (after.totalIncome as number) - w2 - n(after.businessNetIncome) - scorpIncome;

  /* 2 · shape: is this a return the engine models? */

  // Sole proprietor: the Schedule C has to be gross receipts less expenses.
  const gross = shape === "soleProp" ? (after.grossReceipts as number) : 0;
  const netAfter = shape === "soleProp" ? (after.businessNetIncome as number) : 0;
  const expenses = n(after.totalExpenses);
  const homeOffice = n(after.homeOffice);
  if (shape === "soleProp" && off(gross - expenses - homeOffice, netAfter)) {
    reasons.push(
      `Schedule C net profit (${fmt(netAfter)}) isn't gross receipts − expenses − home office (${fmt(gross - expenses - homeOffice)}): cost of goods sold, returns, or other income on line 6 — zeroing the expenses wouldn't give the before`,
    );
    return refuse();
  }

  // S corporation: the 1120-S has to be gross receipts less cost of goods
  // sold less deductions, and the K-1 has to be what the 1040 reports.
  const e = entity ?? emptyEntityNumbers();
  const eGross = n(e.grossReceipts);
  const cogs = n(e.cogs);
  const officerComp = n(e.officerComp);
  const pension = n(e.pension);
  const stateAddBack = n(e.stateAddBack);
  const totalDeductions = n(e.totalDeductions);
  let ownershipPct = 1;
  if (shape === "scorp") {
    const eTotal = e.totalIncome as number;
    const ordinary = e.ordinaryIncome as number;
    const k1 = e.k1Ordinary as number;
    if (off(eGross - cogs, eTotal)) {
      reasons.push(
        `The 1120-S's total income (${fmt(eTotal)}) isn't gross receipts less cost of goods sold (${fmt(eGross - cogs)}): returns, a Form 4797 gain or other income on line 5 the engine doesn't model`,
      );
    }
    if (off(eTotal - totalDeductions, ordinary)) {
      reasons.push(
        `The 1120-S's ordinary income (${fmt(ordinary)}) isn't total income less total deductions (${fmt(eTotal - totalDeductions)})`,
      );
    }
    if (ordinary > 0 && k1 > 0) {
      ownershipPct = round4(k1 / ordinary);
      if (has(e.ownershipPct) && off(e.ownershipPct, ownershipPct * 100)) {
        reasons.push(
          `The K-1 reports ${fmt(k1)} of ${fmt(ordinary)} (${Math.round(ownershipPct * 1000) / 10}%), but item G says ${e.ownershipPct}% — separately stated items or a mid-year change the engine doesn't model`,
        );
      }
    } else if (ordinary <= 0) {
      reasons.push(`The 1120-S shows no ordinary income (${fmt(ordinary)}) — a loss year can't be run through the before`);
    }
    if (off(k1, scorpIncome)) {
      reasons.push(
        `The 1040's S corporation income (${fmt(scorpIncome)}) doesn't match the K-1's ordinary income (${fmt(k1)}) — a second K-1, a basis limitation, or a passive loss`,
      );
    }
    if (w2 > officerComp + TOL) {
      reasons.push(
        `W-2 wages on the 1040 (${fmt(w2)}) exceed the officer compensation on the 1120-S (${fmt(officerComp)}) — a W-2 from another employer the engine doesn't model`,
      );
    }
    if (totalDeductions - officerComp - pension - stateAddBack < -TOL) {
      reasons.push(
        `Officer compensation, the pension plan and the state taxes added back (${fmt(officerComp + pension + stateAddBack)}) come to more than the 1120-S's total deductions (${fmt(totalDeductions)})`,
      );
    }
    if (reasons.length) return refuse();
  }

  // Marketplace coverage, when the after return carries Form 8962.
  const coverageKeys: ReturnFieldKey[] = ["ptcFamilySize", "ptcPovertyLine", "ptcMonths", "ptcPremiums", "ptcSlcsp", "ptcAdvance"];
  const coverageRead = coverageKeys.filter((k) => has(after[k]));
  let coverage: Coverage | null = null;
  if (coverageRead.length) {
    const missingCoverage = coverageKeys.filter((k) => !has(after[k]) && k !== "ptcAdvance");
    if (missingCoverage.length) {
      reasons.push(
        `Form 8962 is on the after return but these lines weren't read: ${missingCoverage.map(label).join(", ")}`,
      );
      return refuse();
    }
    coverage = {
      familySize: after.ptcFamilySize as number,
      povertyLine: after.ptcPovertyLine as number,
      months: after.ptcMonths as number,
      premiums: after.ptcPremiums as number,
      slcsp: after.ptcSlcsp as number,
      advance: n(after.ptcAdvance),
    };
  }
  const sehiPaid = has(after.sehiPaid) ? after.sehiPaid : has(after.sehiDeduction) ? after.sehiDeduction : null;

  // The owner's pay on an S corporation: officer compensation is the cash
  // wages (Medicare wages) plus the health insurance run through payroll;
  // box 1 is that less the 401(k) deferral.
  const healthInsurance = shape === "scorp" ? n(sehiPaid) : 0;
  const medicareWagesRead = has(after.medicareWages) ? after.medicareWages : null;
  const medicareWages = shape === "scorp" ? (medicareWagesRead ?? Math.max(0, officerComp - healthInsurance)) : w2;
  const deferral = shape === "scorp" ? Math.max(0, officerComp - w2) : 0;
  if (shape === "scorp" && medicareWagesRead !== null && off(medicareWagesRead + healthInsurance, officerComp)) {
    reasons.push(
      `Officer compensation on the 1120-S (${fmt(officerComp)}) isn't the Medicare wages (${fmt(medicareWagesRead)}) plus the health insurance premiums (${fmt(healthInsurance)}) — another benefit in the owner's pay the engine doesn't model`,
    );
    return refuse();
  }

  /* 3 · proof: re-run the after return and compare, layer by layer */

  // Schedule 1 adjustments beyond the SE and health insurance deductions
  // (student loan interest, an HSA, a SEP) stay on the before as they are:
  // the CPA's before prints keep them. Those two are recomputed.
  const k1After = shape === "scorp" ? (e.k1Ordinary as number) : 0;
  const children = inferChildren(fed, status, after);
  if (children === null) {
    reasons.push(
      `The child tax credit on line 19 (${fmt(n(after.childTaxCredit))}) isn't what the ${year} tables give for any number of children at this income`,
    );
    return refuse();
  }
  const childCareCredit = n(after.childCareCredit);
  const otherCredits = Math.max(0, n(after.nonrefundableCredits) - childCareCredit);
  const qbiRead: QbiInputs | null = has(after.qbiIncome)
    ? { income: after.qbiIncome, w2Wages: n(after.qbiW2Wages), ubia: n(after.qbiUbia) }
    : null;
  const base: FederalInputs = {
    netProfit: netAfter,
    scorp: k1After,
    w2,
    medicareWages,
    otherIncome,
    carried: 0,
    sehiPaid,
    coverage,
    qbi: qbiRead,
    children,
    childCareCredit,
    otherCredits,
  };
  const seOnly = federal(fed, status, base);
  const adjustmentsRead = (after.totalIncome as number) - (after.agi as number);
  const otherAdjustments = adjustmentsRead - seOnly.halfSe - seOnly.sehi;
  if (otherAdjustments < -TOL) {
    reasons.push(
      `Adjustments to income on the after return (${fmt(adjustmentsRead)}) are less than the SE tax and health insurance deductions the tables give (${fmt(seOnly.halfSe + seOnly.sehi)}) — a second Schedule C, a K-1, or an optional method on Schedule SE`,
    );
    return refuse();
  }
  const carried = otherAdjustments > TOL ? otherAdjustments : 0;

  const inputs: FederalInputs = { ...base, carried };
  const check = federal(fed, status, inputs);
  const mismatch = (what: string, read: number, computed: number, hint: string) => {
    if (off(read, computed)) {
      reasons.push(
        `${what} on the after return reads ${fmt(read)} but the ${year} tables give ${fmt(computed)} — ${hint}`,
      );
      mismatches.push({ line: what, read, computed });
    }
  };

  mismatch(
    "Self-employment tax",
    n(after.seTax),
    check.seTax,
    shape === "scorp"
      ? "an S corporation shareholder's return shouldn't carry SE tax — a Schedule C or other self-employment income"
      : w2 > 0
        ? "W-2 Social Security wages (box 3) may differ from box 1, or there's a second Schedule C or a K-1"
        : "a second Schedule C, a K-1, or an optional method on Schedule SE",
  );
  if (has(after.sehiDeduction)) {
    mismatch(
      "The SE health insurance deduction",
      after.sehiDeduction,
      check.sehi,
      shape === "scorp"
        ? "premiums above the S corporation's Medicare wages, or a plan under another business"
        : "a SEP on the same business, or premiums the engine reads differently from Form 7206",
    );
  }
  if (reasons.length) return refuse();

  const deductionRead = (after.agi as number) - n(after.qbiDeduction) - (after.taxableIncome as number);
  if (off(deductionRead, check.deduction)) {
    reasons.push(
      `The after return's deduction (${fmt(deductionRead)}) isn't the ${year} standard deduction for ${statusLabel} (${fmt(check.deduction)}): itemized, age or blindness, or Schedule 1-A`,
    );
  }
  // Over the threshold the deduction depends on Form 8995-A's own lines.
  if (check.taxableBeforeQbi > fed.qbi.threshold[status] && !qbiRead && n(after.qbiDeduction) > 0) {
    reasons.push(
      `Taxable income is over the ${year} ${statusLabel} QBI threshold (${fmt(fed.qbi.threshold[status])}) and Form 8995-A's qualified business income and W-2 wages weren't read`,
    );
  }
  mismatch(
    "The QBI deduction",
    n(after.qbiDeduction),
    check.qbi,
    shape === "scorp"
      ? "a specified service business in the phase-in range, a loss carryforward, or REIT/PTP income"
      : "a second business, a loss carryforward, an adjustment that reduces QBI, or income above the threshold",
  );
  if (reasons.length) return refuse();

  mismatch(
    "Taxable income",
    after.taxableIncome as number,
    check.taxable,
    "something on the return the engine doesn't model",
  );
  mismatch(
    "Income tax",
    after.incomeTax as number,
    check.incomeTax,
    "capital gains or qualified dividends, a different filing status, or a tax worksheet",
  );
  if (coverage) {
    if (has(after.ptcAllowed)) {
      mismatch(
        "The premium tax credit allowed",
        after.ptcAllowed,
        check.ptc?.allowed ?? 0,
        "premiums that differ month to month, a policy shared with another return, or modified AGI above AGI",
      );
    }
    mismatch(
      "The excess advance credit repaid (line 17)",
      n(after.additionalTaxes),
      check.additionalTaxes,
      "a repayment cap the tables don't have, or another Schedule 2 addition",
    );
  } else if (n(after.additionalTaxes) > 0) {
    reasons.push(
      `The after return has ${fmt(n(after.additionalTaxes))} of additional taxes on line 17 with no Form 8962 read — a repayment or other Schedule 2 addition the engine doesn't model`,
    );
  }
  mismatch(
    "Net investment income tax",
    n(after.niit),
    check.niit,
    "investment income the engine can't tell apart from other income, or a modified AGI above AGI",
  );
  mismatch(
    "Refundable credits (line 32)",
    n(after.federalRefundableCredits),
    check.refundable,
    "an earned income credit, child credit or other refundable credit the engine doesn't compute",
  );
  mismatch(
    "Federal total tax",
    after.federalTotalTax as number,
    check.totalTax,
    "other taxes on Schedule 2 or credits on Schedule 3 the engine doesn't model",
  );
  if (reasons.length) return refuse();

  /* state, same idea, by the state's card */

  const stateCode = meta.stateCode?.toUpperCase() ?? null;
  const wantsState = has(after.stateTotalTax) || !!stateCode;
  let stateCard: StateCard | null = null;
  /** Set on a nonresident return: the state-source income, fixed across before and after. */
  let stateSource: number | null = null;
  let uninsured = n(after.uninsuredMonths);
  let uninsuredNote: string | null = null;
  const dependents = Math.max(0, Math.round(n(after.dependentCount)));
  const stateInputsFor = (
    f: Federal,
    businessIncome: number,
    pteCreditAvailable: number,
    wagesNow: number,
    pteExcluded = 0,
  ): StateInputs => ({
    w2: wagesNow,
    otherIncome,
    businessIncome,
    netPremiums: coverage ? Math.max(0, coverage.premiums - (f.ptc?.allowed ?? 0)) : 0,
    uninsuredMonths: uninsured,
    exemptionsRead: has(after.stateExemptions) ? after.stateExemptions : null,
    dependents,
    pteCreditAvailable,
    pteExcluded,
  });
  let entityCheck: EntityTax | null = null;
  /** The elective tax the corporation elected into, per the returns. */
  const electing =
    shape === "scorp" &&
    (n(e.pteTax) > 0 ||
      n(after.statePteCreditAvailable) > 0 ||
      n(after.statePteCredit) > 0 ||
      n(after.statePteCreditRefundable) > 0);
  if (wantsState) {
    const sc = stateCode ? card.states[stateCode] : undefined;
    if (!stateCode) {
      reasons.push("A state tax was read but the state wasn't identified");
    } else if (!sc) {
      reasons.push(
        `${stateCode} isn't on the ${year} tax tables yet — add its card on the Tax Tables page, or type the before column`,
      );
    } else if (!sc.incomeTax) {
      if (n(after.stateTotalTax) > 0) {
        reasons.push(
          `${sc.name}'s card says no income tax, but the after return carries ${fmt(n(after.stateTotalTax))} of state tax`,
        );
      }
      // No state tax on either side; nothing to derive for the state.
    } else {
      stateCard = sc;
      const form = normalizeForm(meta.stateForm);
      const nonresident = !!sc.nonresident && !!form && form === normalizeForm(sc.nonresident.form);
      if (form && sc.form && form !== normalizeForm(sc.form) && !nonresident) {
        reasons.push(
          sc.nonresident
            ? `${stateCode} Form ${meta.stateForm} isn't the resident Form ${sc.form} or the nonresident Form ${sc.nonresident.form} on the card`
            : `${stateCode} Form ${meta.stateForm} isn't the resident Form ${sc.form} on the card, and the card has no nonresident form — add it on the Tax Tables page`,
        );
      } else if (!has(after.stateTotalTax)) {
        reasons.push("State total tax wasn't read from the after return");
      } else if (nonresident && !has(after.stateSourceIncome)) {
        reasons.push(
          `State-source income (Schedule CA (${sc.nonresident?.form}) line 10, column E) wasn't read from the after return — it's what the nonresident tax is prorated by`,
        );
      } else if (sc.base === "stateGrossIncome" && !has(after.stateBusinessIncome)) {
        reasons.push(
          `${sc.name} works from its own business profit line, which wasn't read from the after return`,
        );
      } else if (shape === "scorp" && !sc.entity) {
        reasons.push(
          `${sc.name}'s card has no S corporation rules (the entity's own tax and elective tax) — add them on the Tax Tables page`,
        );
      } else if (shape === "scorp" && !has(e.stateNetIncome)) {
        reasons.push(`The ${sc.name} S corporation return's net income for tax wasn't read from the 1120-S print`);
      } else if (dependents > 0 && sc.exemption.kind !== "none" && sc.exemption.dependentAmount <= 0 && !has(after.stateExemptions)) {
        reasons.push(
          `The return lists ${dependents} dependent${dependents > 1 ? "s" : ""} and ${sc.name}'s card has no dependent exemption amount — add it on the Tax Tables page`,
        );
      } else {
        if (nonresident) stateSource = after.stateSourceIncome as number;
        const businessAfter = sc.base === "stateGrossIncome" ? (after.stateBusinessIncome as number) : netAfter + k1After;
        const mode = creditMode(sc);

        // The corporation's own state return, when there is one. The
        // shareholder's credit is their share of the elective tax.
        let pteAvailable = 0;
        if (shape === "scorp") {
          entityCheck = entityTax(sc, e.stateNetIncome as number, eGross, electing);
          pteAvailable = Math.round(entityCheck.pte * ownershipPct);
          if (has(e.stateTax)) {
            mismatch(`${sc.name} S corporation tax`, e.stateTax, entityCheck.franchise, `a credit, or a rate or minimum the ${sc.name} card doesn't have`);
          }
          if (has(e.pteTax)) {
            mismatch(`${sc.name} PTE elective tax`, e.pteTax, entityCheck.pte, "a shareholder who didn't consent, or a rate the card doesn't have");
          }
          if (has(after.statePteCreditAvailable)) {
            mismatch(`${sc.name} PTE elective tax credit available`, after.statePteCreditAvailable, pteAvailable, "a carryover from last year, or a second electing entity");
          }
        }

        const run = (f: Federal, biz: number, pte: number) => {
          const si = stateInputsFor(f, biz, mode === "exclusion" ? 0 : pte, w2, mode === "exclusion" && electing ? k1After : 0);
          return stateSource !== null ? nonresidentState(sc, status, f, si, stateSource) : state(sc, status, f, si);
        };
        let sCheck = run(check, businessAfter, pteAvailable);
        // The coverage schedule is the weakest line to read; when the
        // months on Form 8962 explain the payment and the read count
        // doesn't, trust the 8962.
        if (
          sc.sharedResponsibility &&
          coverage &&
          has(after.stateSharedResponsibility) &&
          off(after.stateSharedResponsibility, sCheck.sharedResponsibility)
        ) {
          const fromCoverage = Math.max(0, 12 - Math.round(coverage.months));
          if (fromCoverage !== uninsured) {
            const was = uninsured;
            uninsured = fromCoverage;
            const retry = run(check, businessAfter, pteAvailable);
            if (!off(after.stateSharedResponsibility, retry.sharedResponsibility)) {
              sCheck = retry;
              uninsuredNote = `Months without coverage taken as ${fromCoverage} (12 less the ${coverage.months} months on Form 8962); the coverage schedule read ${was}`;
            } else {
              uninsured = was;
            }
          }
        }
        if (has(after.stateTaxOnIncome)) {
          mismatch(
            `${sc.name} tax on income`,
            after.stateTaxOnIncome,
            sCheck.tax,
            `a deduction, exemption or adjustment the ${sc.name} card doesn't model`,
          );
        }
        if (has(after.stateExemptionCredits) && sc.exemption.kind === "credit") {
          mismatch(
            `${sc.name} exemption credits`,
            after.stateExemptionCredits,
            sCheck.exemption,
            "a dependent the engine didn't count, or a senior or blind exemption",
          );
        }
        if (has(after.statePteCredit) && mode === "nonrefundable") {
          mismatch(`${sc.name} PTE elective tax credit claimed`, after.statePteCredit, sCheck.pteCredit, "another credit ahead of it, or a carryover");
        }
        if (has(after.statePteCreditRefundable) || mode === "refundable") {
          mismatch(
            `${sc.name} refundable PTE tax credit`,
            n(after.statePteCreditRefundable),
            mode === "refundable" ? sCheck.pteCredit : 0,
            mode === "refundable" ? "a share of the entity's tax the card computes differently" : `the ${sc.name} card says the credit isn't refundable`,
          );
        }
        if (has(after.stateMedical) || sc.medical) {
          mismatch(
            `${sc.name} medical deduction`,
            n(after.stateMedical),
            sCheck.medical,
            "medical expenses beyond the marketplace premiums, which the return doesn't itemize",
          );
        }
        if (sc.sharedResponsibility || has(after.stateSharedResponsibility)) {
          mismatch(
            `${sc.name} shared responsibility payment`,
            n(after.stateSharedResponsibility),
            sCheck.sharedResponsibility,
            "months without coverage read differently, or a household bigger than the filer",
          );
        }
        mismatch(
          `${sc.name} total tax`,
          after.stateTotalTax,
          mode === "refundable" ? sCheck.grossTax : sCheck.netTax,
          `dependents, a credit, or an adjustment the ${sc.name} card doesn't model`,
        );
      }
    }
  }
  if (reasons.length) return refuse();

  /* 4 · the model: any scenario from the before to the after */

  const writeOffs = shape === "scorp" ? Math.max(0, totalDeductions - officerComp - pension - stateAddBack) : 0;
  const qbiRatio = k1After > 0 && qbiRead ? qbiRead.income / k1After : null;
  const paid = Math.max(0, n(after.federalPayments) - n(after.federalRefundableCredits));
  const statePaid = Math.max(0, n(after.statePayments) - n(after.statePteCreditRefundable));
  const mode = creditMode(stateCard);
  // A state with its own business-income line (New Jersey) can differ from
  // the federal figure by its own expense rules (meals in full). The gap is
  // an expense-side thing, so it scales with the share of write-offs
  // switched on: nothing on the before, all of it on the after.
  const stateBizDelta = has(after.stateBusinessIncome)
    ? after.stateBusinessIncome - (shape === "scorp" ? k1After : netAfter)
    : 0;
  const ordinaryAfter = shape === "scorp" ? (e.ordinaryIncome as number) : 0;
  // The owner's W-2 carries the withholding; without the salary there is
  // no W-2, so the before's payments are the estimates alone. That is what
  // the CPA's before prints show.
  const fedWithholding = shape === "scorp" ? Math.min(paid, n(after.federalWithholding)) : 0;
  const stateWithholding = shape === "scorp" ? Math.min(statePaid, n(after.stateWithholding)) : 0;

  const run = (s: Scenario): Outcome => {
    let fi: FederalInputs;
    let biz: number;
    /** Share of the write-offs switched on, 0 on the before and 1 on the after. */
    let fraction = 0;
    let k1 = 0;
    let ent: EntityTax | null = null;
    let entityNumbers: EntityNumbers | null = null;
    if (shape === "soleProp") {
      const profit = gross - (s.expenses ? expenses : 0) - (s.homeOffice ? homeOffice : 0);
      fi = { ...inputs, netProfit: profit };
      biz = profit;
      fraction = (gross - profit) / Math.max(1, gross - netAfter);
    } else {
      const ordinary =
        eGross -
        (s.writeOffs ? cogs + writeOffs : 0) -
        (s.salary ? officerComp : 0) -
        (s.retirement ? pension : 0) -
        (s.pte ? stateAddBack : 0);
      k1 = Math.round(ordinary * ownershipPct);
      fraction = (eGross - ordinary) / Math.max(1, eGross - ordinaryAfter);
      const comp = s.salary ? officerComp : 0;
      const hi = s.salary ? healthInsurance : 0;
      const box1 = Math.max(0, comp - (s.salary && s.retirement ? deferral : 0));
      const stateNet = ordinary + (s.pte ? stateAddBack : 0);
      ent = stateCard?.entity ? entityTax(stateCard, stateNet, eGross, s.pte && electing) : null;
      fi = {
        ...inputs,
        scorp: k1,
        w2: box1,
        medicareWages: Math.max(0, comp - hi),
        sehiPaid: s.salary ? sehiPaid : null,
        qbi: qbiRead
          ? { income: qbiRatio !== null ? Math.round(k1 * qbiRatio) : qbiRead.income, w2Wages: s.salary ? qbiRead.w2Wages : 0, ubia: qbiRead.ubia }
          : null,
        childCareCredit: s.salary ? childCareCredit : 0,
      };
      biz = k1;
      entityNumbers = {
        ...emptyEntityNumbers(),
        grossReceipts: eGross,
        cogs: s.writeOffs && cogs > 0 ? cogs : null,
        totalIncome: eGross - (s.writeOffs ? cogs : 0),
        officerComp: s.salary && comp > 0 ? comp : null,
        wages: s.writeOffs ? e.wages : null,
        taxesLicenses: s.writeOffs ? e.taxesLicenses : null,
        pension: s.retirement && pension > 0 ? pension : null,
        employeeBenefits: s.writeOffs ? e.employeeBenefits : null,
        otherDeductions: s.writeOffs ? e.otherDeductions : null,
        totalDeductions: eGross - (s.writeOffs ? cogs : 0) - ordinary,
        ordinaryIncome: ordinary,
        k1Ordinary: k1,
        ownershipPct: e.ownershipPct,
        distributions: e.distributions,
        stateNetIncome: ent ? stateNet : null,
        stateAddBack: s.pte && stateAddBack > 0 ? stateAddBack : null,
        stateTax: ent ? ent.franchise : null,
        pteTax: ent && ent.pte > 0 ? ent.pte : null,
        stateTotalTax: ent ? ent.franchise + (has(e.pteTax) ? ent.pte : 0) : null,
        statePayments: e.statePayments,
        stateAmountDue: ent ? Math.max(0, ent.franchise + (has(e.pteTax) ? ent.pte : 0) - n(e.statePayments)) : null,
        stateRefund: ent ? Math.max(0, n(e.statePayments) - ent.franchise - (has(e.pteTax) ? ent.pte : 0)) || null : null,
      };
    }
    const f = federal(fed, status, fi);
    let st: State | null = null;
    const pteShare = ent ? Math.round(ent.pte * ownershipPct) : 0;
    if (stateCard) {
      const stateBiz = biz + Math.round(stateBizDelta * Math.min(1, Math.max(0, fraction)));
      const si = stateInputsFor(
        f,
        stateBiz,
        mode === "exclusion" ? 0 : pteShare,
        fi.w2,
        mode === "exclusion" && s.pte && electing ? k1 : 0,
      );
      st = stateSource !== null ? nonresidentState(stateCard, status, f, si, stateSource) : state(stateCard, status, f, si);
    }
    const salaryOn = shape !== "scorp" || s.salary;
    const numbers = fillNumbers(
      after,
      f,
      st,
      fi,
      shape,
      stateCard,
      stateSource,
      uninsured,
      salaryOn ? paid : paid - fedWithholding,
      salaryOn ? statePaid : statePaid - stateWithholding,
      gross,
      s,
      pteShare,
    );
    const total = totalTaxesOf(numbers, entityNumbers);
    return { fed: f, st, entity: ent, numbers, entityNumbers, total };
  };

  const afterRun = run(ALL_ON);
  if (entityCheck && afterRun.entity && off(afterRun.entity.franchise, entityCheck.franchise)) {
    // The scenario rebuilds the entity's state income from the 1120-S; it
    // has to land where the 100S printed it or the waterfall is off.
    reasons.push(
      `The ${stateCard?.name} net income rebuilt from the 1120-S (${fmt(afterRun.entity.netIncome)}) isn't what the 100S prints (${fmt(entityCheck.netIncome)}) — a state adjustment beyond the taxes added back`,
    );
    return refuse();
  }

  return {
    ok: true,
    model: {
      shape,
      status,
      card: { federal: fed, state: stateCard },
      year: year as number,
      stateCode,
      run,
      after: afterRun,
      facts: {
        expenses,
        homeOffice,
        cogs,
        writeOffs,
        officerComp,
        healthInsurance,
        deferral,
        pension,
        stateAddBack,
        ownershipPct,
        coverage,
        carried,
        stateSource,
        uninsured,
        uninsuredNote,
        w2Note: shape === "soleProp" && w2 > 0,
        fedWithholding,
        stateWithholding,
      },
    },
  };
}

/**
 * How many qualifying children the child tax credit on line 19 implies.
 * The count isn't read reliably off the dependents block, but the credit
 * is a known function of it: the smallest count that reproduces the line
 * (or zero when there is none). Null when no count does.
 */
function inferChildren(card: FederalCard, status: FilingStatus, after: ReturnNumbers): number | null {
  const read = n(after.childTaxCredit);
  if (read <= 0) return 0;
  const agi = n(after.agi);
  const limit = Math.max(0, n(after.incomeTax) + n(after.additionalTaxes) - n(after.nonrefundableCredits));
  for (let k = 1; k <= 10; k++) {
    if (!off(Math.min(childTaxCredit(card, status, agi, k), limit), read)) return k;
  }
  return null;
}

/** Lay a run out as the lines of a return, the way the review grid shows them. */
function fillNumbers(
  after: ReturnNumbers,
  b: Federal,
  sBefore: State | null,
  fi: FederalInputs,
  shape: Model["shape"],
  stateCard: StateCard | null,
  stateSource: number | null,
  uninsured: number,
  paid: number,
  statePaid: number,
  gross: number,
  s: Scenario,
  /** The shareholder's share of the entity's elective tax in this scenario. */
  pteShare: number,
): ReturnNumbers {
  const mode = creditMode(stateCard);
  const out = emptyNumbers();
  out.w2Income = fi.w2 > 0 ? fi.w2 : shape === "scorp" ? null : after.w2Income;
  out.businessNetIncome = shape === "soleProp" ? fi.netProfit : null;
  out.scorpIncome = shape === "scorp" ? fi.scorp : null;
  out.totalIncome = b.totalIncome;
  out.agi = b.agi;
  out.dependentCount = after.dependentCount;
  out.qbiDeduction = b.qbi > 0 ? b.qbi : null;
  out.qbiIncome = fi.qbi ? fi.qbi.income : null;
  out.qbiW2Wages = fi.qbi && fi.qbi.w2Wages > 0 ? fi.qbi.w2Wages : null;
  out.qbiUbia = fi.qbi && fi.qbi.ubia > 0 ? fi.qbi.ubia : null;
  out.taxableIncome = b.taxable;
  out.incomeTax = b.incomeTax;
  out.seTax = b.seTax > 0 ? b.seTax : null;
  out.additionalTaxes = b.additionalTaxes > 0 ? b.additionalTaxes : null;
  out.childTaxCredit = b.childTaxCredit > 0 ? b.childTaxCredit : null;
  out.childCareCredit = fi.childCareCredit > 0 ? fi.childCareCredit : null;
  out.nonrefundableCredits = b.credits > 0 ? b.credits : null;
  out.niit = b.niit > 0 ? b.niit : null;
  out.federalTotalTax = b.totalTax;
  out.federalRefundableCredits = b.refundable > 0 ? b.refundable : null;
  // Line 33 is withholding and estimates plus the refundable credits; the
  // money actually sent in stays the same, the credit is the run's own.
  out.federalPayments = paid + b.refundable;
  out.federalWithholding = shape === "scorp" ? (fi.w2 > 0 ? after.federalWithholding : null) : after.federalWithholding;
  out.federalPenalty = after.federalPenalty;
  const fedBalance = b.totalTax - (paid + b.refundable) + n(after.federalPenalty);
  if (fedBalance >= 0) {
    out.federalAmountOwed = fedBalance;
    out.federalRefund = null;
  } else {
    out.federalAmountOwed = null;
    out.federalRefund = -fedBalance;
  }
  if (shape === "soleProp") {
    out.grossReceipts = gross;
    out.totalExpenses = s.expenses ? after.totalExpenses : null;
    out.homeOffice = s.homeOffice ? after.homeOffice : null;
  }
  out.sehiDeduction = b.sehi > 0 ? b.sehi : null;
  out.sehiPaid = fi.sehiPaid;
  out.medicareWages = shape === "scorp" && fi.medicareWages > 0 ? fi.medicareWages : null;
  if (fi.coverage && b.ptc) {
    out.ptcFamilySize = after.ptcFamilySize;
    out.ptcPovertyLine = after.ptcPovertyLine;
    out.ptcMonths = after.ptcMonths;
    out.ptcPremiums = after.ptcPremiums;
    out.ptcSlcsp = after.ptcSlcsp;
    out.ptcAdvance = after.ptcAdvance;
    out.ptcAllowed = b.ptc.allowed;
    out.ptcNet = b.ptc.net > 0 ? b.ptc.net : null;
    out.ptcRepayment = b.ptc.repayment > 0 ? b.ptc.repayment : null;
  }
  if (stateCard && sBefore) {
    out.stateSourceIncome = stateSource;
    out.stateBusinessIncome = has(after.stateBusinessIncome) ? (shape === "soleProp" ? fi.netProfit : fi.scorp) : null;
    out.stateExemptions = after.stateExemptions;
    out.stateMedical = stateCard.medical ? sBefore.medical : null;
    out.stateTaxOnIncome = has(after.stateTaxOnIncome) ? sBefore.tax : null;
    out.stateExemptionCredits = stateCard.exemption.kind === "credit" && has(after.stateExemptionCredits) ? sBefore.exemption : null;
    out.statePteCreditAvailable = pteShare > 0 && mode !== "exclusion" ? pteShare : null;
    // A nonrefundable credit sits inside the state's total; a refundable one
    // is printed with the payments, so the total stays gross of it and the
    // credit rides in the payments line, as the return prints them.
    out.statePteCredit = mode === "nonrefundable" && sBefore.pteCredit > 0 ? sBefore.pteCredit : null;
    out.statePteCreditRefundable = mode === "refundable" && sBefore.pteCredit > 0 ? sBefore.pteCredit : null;
    out.stateSharedResponsibility = stateCard.sharedResponsibility ? sBefore.sharedResponsibility : null;
    out.uninsuredMonths = stateCard.sharedResponsibility ? uninsured : after.uninsuredMonths;
    out.stateTotalTax = mode === "refundable" ? sBefore.grossTax : sBefore.netTax;
    out.statePayments = has(after.statePayments) ? statePaid + (mode === "refundable" ? sBefore.pteCredit : 0) : null;
    out.stateWithholding = shape === "scorp" ? (fi.w2 > 0 ? after.stateWithholding : null) : after.stateWithholding;
    out.statePenalty = after.statePenalty;
    const balance = sBefore.netTax - statePaid;
    if (balance >= 0) {
      out.stateAmountOwed = balance;
      out.stateTotalDue = balance + n(after.statePenalty);
      out.stateRefund = null;
    } else {
      out.stateAmountOwed = null;
      out.stateTotalDue = null;
      out.stateRefund = -balance;
    }
  }
  return out;
}

/* ─────────────────────────────── the derivation ─────────────────────────────── */

export function deriveBefore(
  after: ReturnNumbers,
  meta: DeriveMeta,
  tables: TableSet = mergeTables({}),
  entity: EntityNumbers | null = null,
): DeriveResult {
  const built = buildModel(after, meta, tables, entity);
  if (!built.ok) return built;
  const m = built.model;
  const fed = m.card.federal;
  const stateCard = m.card.state;
  const year = m.year;
  const statusLabel = FILING_STATUS_LABEL[m.status];
  const { facts } = m;

  /* derive: same return, everything the CPA zeros at zero */

  const b = m.run(ALL_OFF);
  const qbiThreshold = fed.qbi.threshold[m.status];
  if (m.shape === "soleProp" && b.fed.taxableBeforeQbi > qbiThreshold && !has(after.qbiIncome)) {
    return {
      ok: false,
      reasons: [
        `Taxable income before the QBI deduction would be ${fmt(b.fed.taxableBeforeQbi)}, over the ${year} ${statusLabel} threshold of ${fmt(qbiThreshold)}: the deduction phases out there against W-2 wages and property the engine doesn't have`,
      ],
      mismatches: [],
    };
  }
  if (m.shape === "scorp") {
    const range = fed.qbi.phaseInRange[m.status];
    if (
      b.fed.taxableBeforeQbi > qbiThreshold &&
      b.fed.taxableBeforeQbi < qbiThreshold + range &&
      b.fed.qbi > 0
    ) {
      return {
        ok: false,
        reasons: [
          `Taxable income before the QBI deduction on the before (${fmt(b.fed.taxableBeforeQbi)}) falls inside the ${year} phase-in range, where a specified service business is reduced by a share the engine doesn't have`,
        ],
        mismatches: [],
      };
    }
  }

  /* what the reviewer should know */

  const stateName = stateCard?.name;
  const notes: string[] = [];
  if (m.shape === "soleProp") {
    notes.push(
      `Derived from the after return: Schedule C expenses (${fmt(facts.expenses)}) and home office (${fmt(facts.homeOffice)}) set to zero and the ${year} federal${stateName ? ` and ${stateName}` : ""} tables re-run (engine v${DERIVE_VERSION})`,
    );
  } else {
    notes.push(
      `Derived from the two after returns: every deduction on the 1120-S set to zero — cost of goods sold (${fmt(facts.cogs)}), write-offs (${fmt(facts.writeOffs)}), the owner's ${fmt(facts.officerComp)} of pay, the ${fmt(facts.pension)} retirement plan, the ${fmt(facts.stateAddBack)} of state taxes — so the K-1 is the gross receipts, with no PTE election; the ${year} federal${stateName ? `, ${stateName} and ${stateName} S corporation` : ""} tables re-run (engine v${DERIVE_VERSION})`,
    );
  }
  notes.push(
    `Check passed: the same tables reproduce the after return's ${m.shape === "scorp" ? "" : "SE tax, "}QBI, income tax${facts.coverage ? ", premium tax credit" : ""}${n(after.childTaxCredit) > 0 ? ", child tax credit" : ""} and federal total${stateName ? ` and ${stateName} tax` : ""}${m.shape === "scorp" && stateName ? `, and the corporation's ${stateName} tax` : ""} to the dollar`,
  );
  if (m.shape === "scorp" && facts.ownershipPct < 1) {
    notes.push(`The shareholder owns ${Math.round(facts.ownershipPct * 1000) / 10}% of the corporation, so the K-1 on each side is that share of the ordinary income`);
  }
  if (facts.coverage && b.fed.ptc) {
    const a = m.after.fed.ptc;
    notes.push(
      `Marketplace coverage: household income goes from ${a?.pct ?? 0}% of the poverty line (credit ${fmt(a?.allowed ?? 0)} against ${fmt(facts.coverage.advance)} advanced) to ${b.fed.ptc.pct}% on the before (credit ${fmt(b.fed.ptc.allowed)}), so ${
        b.fed.ptc.repayment > 0
          ? `${fmt(b.fed.ptc.repayment)} of the advance is repaid on line 17`
          : b.fed.ptc.net > 0
            ? `${fmt(b.fed.ptc.net)} is still refundable`
            : "the advance is exactly used"
      }`,
    );
    if (b.fed.sehi !== m.after.fed.sehi) {
      notes.push(`SE health insurance deduction ${fmt(m.after.fed.sehi)} → ${fmt(b.fed.sehi)} (${m.shape === "scorp" ? "no wages to run the premiums through" : "capped by the business's profit"})`);
    }
  }
  if (m.shape === "scorp" && n(after.childCareCredit) > 0) {
    notes.push(`The ${fmt(n(after.childCareCredit))} child and dependent care credit needs earned income, which the before has none of, so it drops off`);
  }
  if (n(after.childTaxCredit) > 0 && b.fed.childTaxCredit !== m.after.fed.childTaxCredit) {
    notes.push(`Child tax credit ${fmt(m.after.fed.childTaxCredit)} → ${fmt(b.fed.childTaxCredit)} as it phases out on the higher income`);
  }
  if (facts.carried > 0) {
    notes.push(
      `Adjustments to income other than the SE and health insurance deductions (${fmt(facts.carried)}: student loan interest, an HSA, a SEP or similar) carried over unchanged, as a before print keeps them`,
    );
  }
  if (stateCard && facts.stateSource !== null) {
    notes.push(
      `${stateCard.name} part-year/nonresident (Form ${stateCard.nonresident?.form}): tax figured as a resident on all income, then prorated by the ${stateCard.name}-source share — ${fmt(facts.stateSource)} of ${fmt(b.fed.totalIncome)} on the before`,
    );
  }
  if (stateCard && b.st && stateCard.sharedResponsibility && b.st.sharedResponsibility > 0) {
    notes.push(
      `${stateCard.name} shared responsibility payment for ${facts.uninsured} uninsured months: ${fmt(b.st.sharedResponsibility)} on the before (${fmt(n(after.stateSharedResponsibility))} on the after), counted in State Taxes as the recap does`,
    );
  }
  if (facts.uninsuredNote) notes.push(facts.uninsuredNote);
  if (m.shape === "scorp" && (facts.fedWithholding > 0 || facts.stateWithholding > 0)) {
    notes.push(
      `The owner's W-2 withholding (${[
        facts.fedWithholding > 0 ? `${fmt(facts.fedWithholding)} federal` : "",
        facts.stateWithholding > 0 ? `${fmt(facts.stateWithholding)} state` : "",
      ]
        .filter(Boolean)
        .join(", ")}) leaves with the salary, so the before's payments are the estimates alone`,
    );
  } else if (m.shape === "scorp" && n(after.w2Income) > 0 && !has(after.federalWithholding)) {
    notes.push("Federal withholding (line 25d) wasn't read, so the before keeps the after's payments; a before print would drop the W-2's withholding");
  }
  if (m.shape === "scorp" && m.after.st && m.after.st.pteCredit > 0 && stateCard) {
    const refundable = creditMode(stateCard) === "refundable";
    notes.push(
      `PTE election: the corporation's ${fmt(m.after.entity?.pte ?? 0)} elective tax comes back as a ${fmt(m.after.st.pteCredit)} ${refundable ? "refundable " : ""}credit on the ${stateCard.name} return${!refundable && (m.after.entity?.pte ?? 0) > m.after.st.pteCredit ? ` (${fmt((m.after.entity?.pte ?? 0) - m.after.st.pteCredit)} carries forward)` : ""}; the before has no election, so its ${stateCard.name} tax is paid on the personal return and the corporation owes only the ${fmt(b.entity?.franchise ?? 0)} ${stateCard.entity?.rate ? "franchise" : "minimum"} tax`,
    );
  }
  const fedPen = n(after.federalPenalty);
  const statePen = n(after.statePenalty);
  if (fedPen > 0 || statePen > 0) {
    notes.push(
      `Underpayment penalties can't be derived; the after return's ${[
        fedPen > 0 ? `${fmt(fedPen)} federal` : "",
        statePen > 0 ? `${fmt(statePen)} state` : "",
      ]
        .filter(Boolean)
        .join(" and ")} penalty is carried over as a floor — the real before penalty would be at least that`,
    );
  } else {
    notes.push("No underpayment penalty on the after return, so none on the before either");
  }
  if (facts.w2Note) {
    notes.push(
      `W-2 wages (${fmt(n(after.w2Income))}) counted against the Social Security wage base as box 1; check Schedule SE if box 3 differs`,
    );
    if (b.fed.qbiComponentBinds) {
      notes.push(
        "QBI was figured as net profit less the SE tax and health insurance deductions, per the regulations; a ProSeries zero-write-offs print may skip that subtraction and show a larger QBI deduction",
      );
    }
  }
  if (!stateCard) {
    notes.push(
      m.stateCode
        ? `${m.stateCode} has no income tax, so there's no state tax on either side`
        : "No state return, so no state tax on either side",
    );
  } else if (!stateCard.proven) {
    notes.push(
      `${stateCard.name}'s card is seeded from the state's published figures and hasn't been proven on a client return before this one — the check above is that proof; if this recap looks right, mark the card proven on the Tax Tables page`,
    );
  }

  return {
    ok: true,
    before: b.numbers,
    entityBefore: b.entityNumbers,
    derived: { version: DERIVE_VERSION, notes },
  };
}

/* ─────────────────────────────── attribution ─────────────────────────────── */

/**
 * Split the savings by strategy: walk from the before to the after switching
 * one strategy on at a time, re-running the whole return each step. The
 * drop at each step is that strategy's savings; the steps sum to the
 * headline exactly (any rounding between the engine's after and the return
 * as read lands in the last step). For an S corporation the SE tax the
 * structure avoids is estimated separately — it isn't on the path from the
 * before to the after, since both are S corporation returns.
 */
export function attributeStrategies(
  after: ReturnNumbers,
  meta: DeriveMeta,
  tables: TableSet = mergeTables({}),
  entity: EntityNumbers | null = null,
): RecapAnalysis | null {
  const built = buildModel(after, meta, tables, entity);
  if (!built.ok) return null;
  const m = built.model;
  const { facts } = m;
  const stateName = m.card.state?.name ?? "state";

  type Step = { key: keyof Scenario; label: string; note: string; skip: boolean };
  const steps: Step[] =
    m.shape === "soleProp"
      ? [
          {
            key: "expenses",
            label: "Bookkeeping: business write-offs",
            note: `${fmt(facts.expenses)} of Schedule C expenses found and deducted`,
            skip: facts.expenses <= 0,
          },
          {
            key: "homeOffice",
            label: "Home office",
            note: `${fmt(facts.homeOffice)} for the business use of the home (Form 8829)`,
            skip: facts.homeOffice <= 0,
          },
        ]
      : [
          {
            key: "writeOffs",
            label: "Bookkeeping: business write-offs",
            note: `${fmt(facts.cogs + facts.writeOffs)} deducted on the 1120-S${facts.cogs > 0 ? ` (${fmt(facts.cogs)} of it cost of goods sold)` : ""}, before the owner's pay, the retirement plan and state taxes`,
            skip: facts.cogs + facts.writeOffs <= 0,
          },
          {
            key: "salary",
            label: "Owner salary through the S corporation",
            note: `${fmt(facts.officerComp)} of officer pay${facts.healthInsurance > 0 ? ` (${fmt(facts.healthInsurance)} of it health insurance, deducted again on the 1040)` : ""}: the W-2 wages that unlock the QBI deduction${n(after.childCareCredit) > 0 ? " and the child-care credit" : ""}`,
            skip: facts.officerComp <= 0,
          },
          {
            key: "retirement",
            label: "Solo 401(k)",
            note: `${fmt(facts.deferral)} deferred from the owner's wages and ${fmt(facts.pension)} contributed by the corporation`,
            skip: facts.deferral + facts.pension <= 0,
          },
          {
            key: "pte",
            label: "Pass-through entity elective tax",
            note: `${fmt(m.after.entity?.pte ?? 0)} paid by the corporation and deducted federally (${fmt(facts.stateAddBack)} this year), ${
              creditMode(m.card.state) === "exclusion"
                ? `with the income left off the ${stateName} return`
                : `credited back on the ${stateName} return (${fmt(m.after.st?.pteCredit ?? 0)})`
            }`,
            skip: !(m.after.entity && m.after.entity.pte > 0),
          },
        ];

  const scenario: Scenario = { ...ALL_OFF };
  let previous = m.run(scenario).total;
  const attribution: RecapAnalysis["attribution"] = [];
  for (const step of steps) {
    if (step.skip) continue;
    scenario[step.key] = true;
    const now = m.run(scenario).total;
    attribution.push({ label: step.label, savings: previous - now, note: step.note });
    previous = now;
  }
  // The recap's headline is before − after as READ; the engine's after
  // agrees within rounding. Whatever is left lands on the last step so the
  // split adds up to the number on the page.
  const readAfterTotal = totalTaxesOf(after, entity);
  const residual = previous - readAfterTotal;
  if (attribution.length && residual !== 0) {
    attribution[attribution.length - 1].savings += residual;
  }

  const notes: string[] = [
    `Savings split by switching each strategy on in this order and re-running the whole return; a deduction is worth more at a higher bracket, so the order matters and the first steps get the higher rate (engine v${DERIVE_VERSION})`,
  ];
  if (residual !== 0) notes.push(`${fmt(Math.abs(residual))} of rounding between the engine and the return as printed is included in the last step`);

  // The SE tax the K-1 income would carry on a Schedule C — Schedule SE
  // with the whole wage base (a sole proprietor has no W-2) plus the
  // additional Medicare tax over the threshold. Gross of the payroll tax the
  // corporation paid on the salary: as a sole proprietor that pay would have
  // been profit under SE tax too, so this understates rather than overstates.
  let scorpSavings: RecapAnalysis["scorpSavings"] = null;
  if (m.shape === "scorp") {
    const k1 = n(after.scorpIncome);
    const se = m.card.federal.selfEmployment;
    const am = m.card.federal.additionalMedicare;
    const earnings = Math.round(k1 * se.netEarningsFactor);
    const seTax =
      earnings >= 400
        ? Math.round(Math.min(earnings, se.wageBase) * se.socialSecurityRate) + Math.round(earnings * se.medicareRate)
        : 0;
    const extra = Math.round(Math.max(0, earnings - am.threshold[m.status]) * am.rate);
    scorpSavings = {
      amount: seTax + extra,
      note: `Estimated: the Schedule SE tax${extra > 0 ? " and additional Medicare tax" : ""} that ${fmt(k1)} of ordinary income would carry as self-employment earnings on a Schedule C. As K-1 income from the S corporation it carries none`,
    };
  }

  return { version: DERIVE_VERSION, attribution, scorpSavings, notes };
}

/* ─────────────────────────────── proving a card ─────────────────────────────── */

/** A saved recap whose before was read from a real PDF: the engine's test case. */
export type ProofPairing = {
  id: string;
  clientName: string;
  taxYear: number;
  meta: DeriveMeta;
  before: ReturnNumbers;
  after: ReturnNumbers;
  entity: EntityNumbers | null;
};

export type ProofResult =
  | { id: string; clientName: string; outcome: "match" }
  | { id: string; clientName: string; outcome: "mismatch"; diffs: { line: string; derived: number | null; read: number | null }[] }
  | { id: string; clientName: string; outcome: "refused"; reasons: string[] };

/** The lines a derived before is judged on — the ones that carry tax. */
const PROOF_LINES: ReturnFieldKey[] = [
  "agi",
  "qbiDeduction",
  "taxableIncome",
  "incomeTax",
  "seTax",
  "additionalTaxes",
  "childTaxCredit",
  "niit",
  "federalTotalTax",
  "federalRefundableCredits",
  "stateTotalTax",
];

/**
 * Run the engine on every real pairing with the given tables and report
 * whether each before came out as printed. The Tax Tables page runs this on
 * the draft card as it's edited, so a wrong number shows up next to the
 * client it would have got wrong.
 */
export function proveTables(pairings: ProofPairing[], tables: TableSet): ProofResult[] {
  return pairings.map((p) => {
    const r = deriveBefore(p.after, p.meta, tables, p.entity);
    if (!r.ok) {
      // The proof step refusing IS the finding: the tables don't reproduce
      // this return's own tax, and the line says by how much.
      if (r.mismatches.length) {
        return {
          id: p.id,
          clientName: p.clientName,
          outcome: "mismatch",
          diffs: r.mismatches.map((m) => ({ line: `${m.line} (after return)`, derived: m.computed, read: m.read })),
        };
      }
      return { id: p.id, clientName: p.clientName, outcome: "refused", reasons: r.reasons };
    }
    const diffs = PROOF_LINES.flatMap((k) => {
      const derived = r.before[k];
      const read = p.before[k];
      if (n(derived) === n(read) || !off(n(derived), n(read))) return [];
      return [{ line: label(k), derived, read }];
    });
    return diffs.length
      ? { id: p.id, clientName: p.clientName, outcome: "mismatch", diffs }
      : { id: p.id, clientName: p.clientName, outcome: "match" };
  });
}
