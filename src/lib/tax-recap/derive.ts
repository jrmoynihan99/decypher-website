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

import { sideSummary, totalTaxesOf } from "./compute";
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
export const DERIVE_VERSION = "10";

export type DeriveMeta = {
  taxYear: number | null;
  filingStatus: string | null;
  stateCode: string | null;
  stateForm: string | null;
  /** Which return the entity filed, when one was read: tells a partnership's K-1 from an S corporation's. */
  entityForm?: "1120-S" | "1065" | null;
  /**
   * Lines the reader returned that the page-text cross-check found nowhere
   * on the return. When the after return doesn't reproduce, the engine
   * tries again without the optional ones among them (see `buildChecked`).
   */
  unverified?: string[];
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

/**
 * Form 1040 line 16: the brackets, or the Qualified Dividends and Capital
 * Gain Tax Worksheet when the return has qualified dividends or a net
 * long-term gain. The worksheet taxes the ordinary slice by the table and
 * the preferential slice at 0%, the middle rate and the top rate by where
 * it sits in taxable income, then takes the smaller of that and the plain
 * bracket tax, line by line in whole dollars.
 */
function taxOnIncome(card: FederalCard, status: FilingStatus, taxable: number, preferential: number): number {
  const regular = printedTax(card.brackets[status], card.taxTable, taxable);
  const pref = Math.max(0, Math.min(preferential, taxable));
  if (pref <= 0) return regular;
  const cg = card.capitalGains;
  const ordinary = taxable - pref;
  const zeroTop = cg.zeroRateBelow[status];
  const midTop = cg.topRateAbove[status];
  const atZero = Math.max(0, Math.min(taxable, zeroTop) - ordinary);
  const atMid = Math.max(0, Math.min(taxable, midTop) - Math.max(ordinary, zeroTop));
  const atTop = Math.max(0, pref - atZero - atMid);
  const worksheet =
    printedTax(card.brackets[status], card.taxTable, ordinary) + Math.round(atMid * cg.rate) + Math.round(atTop * cg.topRate);
  return Math.min(worksheet, regular);
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

/**
 * One partner on the return — a partnership's owner, or both spouses when
 * both are partners: their share of the ordinary income, their guaranteed
 * payments (both subject to SE tax, each partner on their own Schedule SE),
 * the health premiums the partnership paid for them, and their own W-2
 * wages, which use up their Social Security wage base.
 */
type Partner = { ordinary: number; guaranteed: number; premiums: number; wages: number };

/**
 * Schedule E Part I. The properties with a profit and the ones with a loss
 * (Form 8582 lines 1a and 1b), prior years' unallowed losses (1c), whether
 * the return treats the rentals as nonpassive — a real estate professional
 * who materially participates, Schedule E line 43 — and whether their net
 * counts as qualified business income (Form 8995 lists them).
 */
type Rental = {
  profits: number;
  losses: number;
  prior: number;
  reps: boolean;
  qbi: boolean;
  /** Schedule E line 23a: every property's rents. With the expenses zeroed (the before), each property nets its rents. */
  rents: number;
  /** Schedule E line 23e: every property's expenses, depreciation included — zeroed on the before, like the Schedule C's. */
  expenses: number;
};

/**
 * Schedule A as read: the total, the state and local taxes before and after
 * the cap, and the medical expenses before the floor. The before recomputes
 * the two income-dependent pieces — the SALT cap at the before's modified
 * AGI, the medical floor at its AGI — and takes the larger of the result and
 * the standard deduction.
 */
type Itemized = { total: number; saltPaid: number; saltDeducted: number; medical: number; medicalDeducted: number };

/**
 * Whose W-2 wages are whose, and who paid them. The before treats the
 * three kinds differently: the officer's pay leaves with the salary
 * strategy, wages the business paid anyone else on the return (a spouse on
 * its payroll, inside the entity's line 8) leave with the write-offs they
 * sit in — and the W-2 income with them — and wages from another employer
 * stay. Persons are indexed as the 1040 lists them: 0 the taxpayer, 1 the
 * spouse.
 */
type Wages = {
  /** Which person is the business's officer. */
  officer: 0 | 1;
  /** Box 1 of the officer's W-2 from the business: officer compensation less any 401(k) deferral. */
  officerBox1: number;
  /** Box 1 wages the business paid the other person on the return. */
  employeeEntity: number;
  /** Wages from other employers, per person. */
  outside: [number, number];
  /** True when the split was read off the return's W-2 lines rather than assumed. */
  read: boolean;
};

/** The W-2 lines of one scenario, laid out the way the review grid shows them. */
type W2Lines = { taxpayer: number; spouse: number; taxpayerEntity: number; spouseEntity: number };

type FederalInputs = {
  /** Schedule C net profit — subject to SE tax. */
  netProfit: number;
  /** The Schedule C filer's own W-2 Social Security wages: what's used up of the wage base. 0 when the W-2 on a joint return is the spouse's. */
  seWages: number;
  /** S corporation ordinary income from the K-1 — not subject to SE tax. */
  scorp: number;
  /** The partners on this return, when the business is a partnership. */
  partners: Partner[];
  /** Form W-2 box 1, every W-2 on the return. */
  w2: number;
  /** Form W-2 box 5, every W-2 on the return: what the additional Medicare tax counts. Equal to box 1 unless read. */
  medicareWages: number;
  /** The owner's Medicare wages from the S corporation alone (Form 7206 line 11): the cap on the health insurance deduction. */
  scorpMedicareWages: number;
  /** Form 1040 line 12a: someone can claim the filer, so the standard deduction is the dependent's limited one. */
  claimedAsDependent: boolean;
  otherIncome: number;
  rental: Rental | null;
  /** Schedule 1 adjustments other than the SE, health insurance and retirement plan deductions, carried across. */
  carried: number;
  /** Schedule 1 line 16: SEP, SIMPLE and qualified plans — carried across; it reduces the Schedule C's QBI and the health insurance cap. */
  sep: number;
  /** Form 7206 line 1, or null when there is no such form. */
  sehiPaid: number | null;
  coverage: Coverage | null;
  /** Read off Form 8995-A when the return is over the threshold; null means the simplified Form 8995 from the business itself. */
  qbi: QbiInputs | null;
  /** Form 8995 line 3: the prior year's QBI loss carryforward, taken off the Schedule C's QBI. 0 with Form 8995-A, whose line 2 is net of it. */
  qbiCarryforward: number;
  /** Qualified dividends plus net long-term gain (1040 line 3a, Schedule D line 15): taxed by the capital gains worksheet, fixed across before and after. */
  preferential: number;
  itemized: Itemized | null;
  /** Qualifying children for the child tax credit. */
  children: number;
  /** Other dependents (Schedule 8812 line 6): the $500 credit, phased out with the children's. */
  others: number;
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
  /** Schedule E line 26: the rentals' net as deducted, after the passive loss limit. */
  rentalDeducted: number;
  /** Form 8582 line 6: modified AGI, what the special allowance is figured on. */
  magi: number;
  /** Form 8582 line 9: the special allowance the before could use. */
  passiveAllowance: number;
  totalIncome: number;
  adjustments: number;
  agi: number;
  deduction: number;
  /** True when Schedule A beat the standard deduction. */
  itemizes: boolean;
  /** Schedule A line 17 as recomputed at this income (0 without a Schedule A). */
  itemizedTotal: number;
  /** Schedule A line 5e as recomputed. */
  saltDeducted: number;
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
  /** Earned income the dependents' standard deduction worksheet counts: wages and Schedule C profit less the SE deduction. */
  dependentEarned: number;
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
 * income limitation is 20% of taxable income before the deduction less the
 * net capital gain (Form 8995 lines 11–14).
 */
function qbiDeduction(
  card: FederalCard,
  status: FilingStatus,
  base: number,
  taxableBeforeQbi: number,
  netCapitalGain: number,
  w2Wages: number,
  ubia: number,
): { deduction: number; componentBinds: boolean } {
  const q = card.qbi;
  const full = Math.round(Math.max(0, base) * q.rate);
  const limit = Math.round(Math.max(0, taxableBeforeQbi - netCapitalGain) * q.rate);
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

/**
 * Form 1040 line 19 before the tax-liability limit: the child tax credit
 * and the credit for other dependents (Schedule 8812 lines 5 and 7), phased
 * out together on line 11.
 */
function childTaxCredit(card: FederalCard, status: FilingStatus, agi: number, children: number, others = 0): number {
  if (children <= 0 && others <= 0) return 0;
  const c = card.childTaxCredit;
  const over = Math.max(0, agi - c.phaseOutThreshold[status]);
  const reduction = c.phaseOutStep > 0 ? Math.ceil(over / c.phaseOutStep) * c.phaseOutPer : 0;
  return Math.max(0, children * c.perChild + others * c.perOtherDependent - reduction);
}

/**
 * One Schedule SE: a sole proprietor's, or each partner's own. The Social
 * Security part stops at what's left of the wage base after that person's
 * own W-2 wages; under $400 of net earnings there is no tax at all.
 */
function scheduleSe(card: FederalCard, profit: number, wages: number) {
  const se = card.selfEmployment;
  const earnings = profit > 0 ? Math.round(profit * se.netEarningsFactor) : 0;
  const ssRoom = Math.max(0, se.wageBase - wages);
  const socialSecurity = Math.round(Math.min(earnings, ssRoom) * se.socialSecurityRate);
  const medicare = Math.round(earnings * se.medicareRate);
  const tax = earnings >= 400 ? socialSecurity + medicare : 0;
  return { earnings, tax, half: Math.round(tax / 2) };
}

/**
 * Schedule A line 5e at a given modified AGI: the year's cap, phased down
 * above the threshold to the floor, against the taxes actually paid.
 */
function saltCap(card: FederalCard, status: FilingStatus, magi: number): number {
  const s = card.salt;
  let cap = s.cap[status];
  if (s.phaseDownAbove) {
    const over = Math.max(0, magi - s.phaseDownAbove[status]);
    cap = Math.max(s.floor[status], cap - Math.round(over * s.phaseDownRate));
  }
  return cap;
}

/**
 * The federal side of the return: Schedule SE, Form 7206, Form 8959, Form
 * 8582, Schedule A or the standard deduction, Form 8995 / 8995-A, Form
 * 8962, the tax, the child tax credit, Form 8960. Rounding follows the
 * forms line by line, which is what makes the self-check exact.
 */
function federal(card: FederalCard, status: FilingStatus, i: FederalInputs): Federal {
  // Schedule SE: the sole proprietor's, or one per partner. Each partner's
  // earnings are their ordinary share plus their guaranteed payments, and
  // the deduction is the sum of each schedule's own rounded half.
  const units =
    i.partners.length > 0
      ? i.partners.map((p) => scheduleSe(card, p.ordinary + p.guaranteed, p.wages))
      : [scheduleSe(card, i.netProfit, i.seWages)];
  const seEarnings = units.reduce((s, u) => s + u.earnings, 0);
  const seTax = units.reduce((s, u) => s + u.tax, 0);
  const halfSe = units.reduce((s, u) => s + u.half, 0);

  // Form 7206: the premiums, capped at the business's profit less the SE
  // and retirement plan deductions — or, for a more-than-2% S corporation
  // shareholder, at the Medicare wages the premiums were run through (line
  // 11). A partner's are capped at their own share less their own half.
  let sehi = 0;
  if (i.partners.length > 0) {
    const bases = i.partners.map((p) => p.ordinary + p.guaranteed);
    const total = bases.reduce((s, b) => s + Math.max(0, b), 0);
    i.partners.forEach((p, k) => {
      const sepShare = total > 0 ? Math.round((i.sep * Math.max(0, bases[k])) / total) : 0;
      sehi += Math.min(p.premiums, Math.max(0, bases[k] - units[k].half - sepShare));
    });
  } else {
    const sehiCap = i.scorp > 0 && i.netProfit <= 0 ? i.scorpMedicareWages : Math.max(0, i.netProfit - halfSe - i.sep);
    sehi = i.sehiPaid !== null ? Math.min(i.sehiPaid, sehiCap) : 0;
  }

  const am = card.additionalMedicare;
  const additionalMedicare = Math.round(
    Math.max(0, i.medicareWages + seEarnings - am.threshold[status]) * am.rate,
  );

  const partnerIncome = i.partners.reduce((s, p) => s + p.ordinary + p.guaranteed, 0);
  const incomeBeforeRental = i.w2 + i.netProfit + i.scorp + partnerIncome + i.otherIncome;

  // Form 8582. A real estate professional's rentals are nonpassive and
  // deducted in full; anyone else's net loss is allowed only up to the
  // special allowance, which phases out on modified AGI — AGI figured
  // without the rentals, the SE deduction and the retirement adjustments
  // (the instructions' list; the IRA and student loan pieces of `carried`
  // are left in, which only matters inside the phase-out range).
  const magi = incomeBeforeRental - sehi - i.sep;
  const pa = card.passiveAllowance;
  const passiveAllowance = Math.max(0, Math.min(pa.amount, pa.amount - Math.round(Math.max(0, magi - pa.magiAbove) * pa.rate)));
  let rentalDeducted = 0;
  if (i.rental) {
    const r = i.rental;
    const nonpassive = r.reps ? r.profits - r.losses : 0;
    const passive1d = (r.reps ? 0 : r.profits - r.losses) - r.prior;
    const passiveNet = passive1d >= 0 ? passive1d : Math.max(passive1d, -passiveAllowance);
    rentalDeducted = nonpassive + passiveNet;
  }

  const totalIncome = incomeBeforeRental + rentalDeducted;
  const adjustments = halfSe + sehi + i.sep + i.carried;
  const agi = totalIncome - adjustments;

  // Schedule A, re-figured at this income: the SALT cap at modified AGI
  // (the 2025 Act's phase-down), the medical floor at AGI; the rest of
  // the schedule is fixed. The larger of that and the standard deduction.
  // Someone else's dependent: the Standard Deduction Worksheet for
  // Dependents — the greater of the minimum and earned income (wages and
  // Schedule C profit less the SE deduction) plus a small amount, never
  // more than the regular deduction.
  let standard = card.standardDeduction[status];
  const dependentEarned = i.w2 + i.netProfit - halfSe;
  if (i.claimedAsDependent) {
    const d = card.dependentStandardDeduction;
    standard = Math.min(standard, Math.max(d.minimum, dependentEarned + d.earnedPlus));
  }
  let itemizedTotal = 0;
  let saltDeducted = 0;
  if (i.itemized) {
    const it = i.itemized;
    saltDeducted = Math.min(it.saltPaid, saltCap(card, status, agi));
    const medicalDeducted = Math.max(0, it.medical - Math.round(agi * 0.075));
    itemizedTotal = Math.max(0, it.total - it.saltDeducted - it.medicalDeducted + saltDeducted + medicalDeducted);
  }
  const itemizes = itemizedTotal > standard;
  const deduction = itemizes ? itemizedTotal : standard;
  const taxableBeforeQbi = Math.max(0, agi - deduction);

  // §1.199A-3: a sole proprietor's QBI is net profit less the deductions
  // attributable to it — the SE deduction, the health insurance deduction
  // and the retirement plan deduction. A partner's is their ordinary share
  // less the part of their SE deduction that belongs to it (the guaranteed
  // payments carry the rest, and the premiums). An S corporation
  // shareholder's over the threshold comes off Form 8995-A as read; under
  // it (Form 8995) it's the K-1's ordinary income less the health insurance
  // deduction the wages carried (Brandt: $180,200 → $36,040). Form 8995 line
  // 3 nets a prior year's loss carryforward off it first, and a rental
  // counted as a business adds its net.
  let qbiBase: number;
  if (i.qbi) qbiBase = i.qbi.income;
  else if (i.partners.length > 0) {
    qbiBase = i.partners.reduce((s, p, k) => {
      const base = p.ordinary + p.guaranteed;
      const share = base > 0 ? Math.round((units[k].half * p.ordinary) / base) : 0;
      return s + p.ordinary - share;
    }, 0);
  } else if (i.scorp > 0 && i.netProfit <= 0) qbiBase = i.scorp - sehi - i.qbiCarryforward;
  else qbiBase = i.netProfit - halfSe - sehi - i.sep - i.qbiCarryforward;
  if (i.rental?.qbi) qbiBase += rentalDeducted;
  qbiBase = Math.max(0, qbiBase);
  const netCapitalGain = Math.max(0, Math.min(i.preferential, taxableBeforeQbi));
  const q = qbiDeduction(card, status, qbiBase, taxableBeforeQbi, netCapitalGain, i.qbi?.w2Wages ?? 0, i.qbi?.ubia ?? 0);
  const qbi = q.deduction;

  const taxable = Math.max(0, taxableBeforeQbi - qbi);
  const incomeTax = taxOnIncome(card, status, taxable, i.preferential);

  // Form 8962 works from modified AGI; with no tax-exempt interest, foreign
  // income or nontaxable Social Security that is AGI.
  const ptc = i.coverage ? premiumTaxCredit(card, status, agi, i.coverage) : null;
  const additionalTaxes = ptc?.repayment ?? 0;
  const refundable = ptc?.net ?? 0;

  // Lines 18–22: the child tax credit is limited to the tax left after the
  // other nonrefundable credits (Credit Limit Worksheet A).
  const tax18 = incomeTax + additionalTaxes;
  const credits = i.childCareCredit + i.otherCredits;
  const ctc = Math.min(childTaxCredit(card, status, agi, i.children, i.others), Math.max(0, tax18 - credits));
  const line22 = Math.max(0, tax18 - ctc - credits);

  // Form 8960: on the smaller of net investment income and AGI over the
  // threshold. Business income (Schedule C, a K-1 the owner works in) is
  // not investment income; what's left of "other income" is taken as it,
  // and the rentals' net as deducted goes in with it, as the software
  // files it (a loss there wipes the rest out).
  const ni = card.netInvestmentIncomeTax;
  const niit = Math.round(
    Math.min(Math.max(0, i.otherIncome + rentalDeducted), Math.max(0, agi - ni.threshold[status])) * ni.rate,
  );

  return {
    seEarnings,
    seTax,
    halfSe,
    sehi,
    additionalMedicare,
    rentalDeducted,
    magi,
    passiveAllowance,
    totalIncome,
    adjustments,
    agi,
    deduction,
    itemizes,
    itemizedTotal,
    saltDeducted,
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
    earnedIncome: i.w2 + Math.max(0, i.netProfit) + i.partners.reduce((s, p) => s + Math.max(0, p.ordinary + p.guaranteed), 0),
    dependentEarned,
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
  /** The state's own net adjustment to federal AGI (Schedule CA columns B and C), a fact of the year carried across. */
  carriedAdjustment: number;
  /** The state's deduction as read (its itemized deductions, when they beat its standard deduction), carried across. */
  deductionRead: number | null;
  /** Each person's wages in this scenario (the FICA base for a per-person wage deduction). */
  wagesByPerson: number[];
  /** Form 1040 line 12a: someone else claims the filer. */
  claimedAsDependent: boolean;
};

/**
 * The state's standard deduction for this filer: the card's amount (or
 * Maryland's share of `income`, between its floor and cap), or for someone
 * else's dependent the state's own dependent worksheet when the card has
 * one (California's is the federal one).
 */
function standardDeductionFor(card: StateCard, status: FilingStatus, fed: Federal, s: StateInputs, income: number): number {
  const d = card.deduction;
  if (d.kind === "percent") return Math.min(d.max[status], Math.max(d.min[status], Math.round(Math.max(0, income) * d.rate)));
  if (d.kind !== "standard") return 0;
  const regular = d.amount[status];
  const rule = card.dependentFiler?.standardDeduction;
  if (!s.claimedAsDependent || !rule) return regular;
  return Math.min(regular, Math.max(rule.minimum, fed.dependentEarned + rule.earnedPlus));
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

type State = {
  income: number;
  taxable: number;
  /** The per-person Social Security / Medicare deduction (Massachusetts lines 11a + 11b), 0 for states without one. */
  wageDeduction: number;
  /** Tax on taxable income before credits and add-ons (NJ line 43, CA line 31). */
  tax: number;
  /** Nonresident only: the tax on all income as if a resident (540NR line 31), before the proration that gives `tax` (line 37). */
  residentTax?: number;
  exemption: number;
  medical: number;
  local: number;
  sharedResponsibility: number;
  /** The PTE credit actually used: limited to the tax when nonrefundable, the whole share when refundable. */
  pteCredit: number;
  /** Maryland's special nonresident tax (Form 505 line 32b), charged in place of the county tax; 0 elsewhere. */
  nonresidentTax: number;
  /** The state's printed total before a refundable PTE credit (NJ-1040 line 54). */
  grossTax: number;
  /** What the recap calls State Taxes: tax less every credit, plus add-ons. */
  netTax: number;
};

const EMPTY_STATE: State = {
  income: 0, taxable: 0, wageDeduction: 0, tax: 0, exemption: 0, medical: 0, local: 0, sharedResponsibility: 0, pteCredit: 0, nonresidentTax: 0, grossTax: 0, netTax: 0,
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
  if (card.base !== "stateGrossIncome") income += s.carriedAdjustment;
  const mode = creditMode(card);
  if (mode === "exclusion") income = Math.max(0, income - s.pteExcluded);

  // The state's standard deduction, or its own itemized deductions as read
  // when they beat it (California keeps the property tax and mortgage
  // interest without the federal cap and drops the state income tax; the
  // figure is fixed across before and after).
  const deduction =
    card.deduction.kind === "standard" || card.deduction.kind === "percent"
      ? Math.max(standardDeductionFor(card, status, fed, s, income), s.deductionRead ?? 0)
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
    // Someone else's dependent gets no personal exemption where the card
    // says so (California's line 7).
    const personal = s.claimedAsDependent && card.dependentFiler?.noPersonalExemption ? 0 : ex.count[status];
    // Each exemption shrinks on its own and stops at zero: California's
    // $153 personal credit is gone before the $475 dependent credit is.
    exemption =
      Math.max(0, ex.amount - reduce) * personal +
      Math.max(0, ex.dependentAmount - reduce) * s.dependents;
    // A fixed exemption as printed (New Jersey's) is carried; one that
    // phases down on income (Maryland's) is re-figured at each income.
    if (ex.kind === "deduction" && s.exemptionsRead !== null && !ex.phaseOut) exemption = s.exemptionsRead;
  }

  const medical = card.medical
    ? Math.max(0, s.netPremiums - Math.round(income * card.medical.floorRate)) +
      (card.medical.seHealthInsuranceFull ? fed.sehi : 0)
    : 0;

  // Massachusetts lines 11a/11b: the Social Security and Medicare tax each
  // person paid on their own wages, capped per person — so whose wages are
  // whose matters, and a W-2 that leaves on the before takes its deduction
  // with it.
  const wd = card.wageDeduction;
  const wageDeduction = wd
    ? s.wagesByPerson.reduce((t, w) => t + Math.min(wd.cap, Math.round(Math.max(0, w) * wd.rate)), 0)
    : 0;

  const taxable = Math.max(
    0,
    income - deduction - (ex.kind === "deduction" ? exemption : 0) - medical - wageDeduction,
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
    wageDeduction,
    tax,
    exemption,
    medical,
    local,
    sharedResponsibility,
    pteCredit,
    nonresidentTax: 0,
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

  // Maryland's Form 505NR, line by line: 1 taxable net income as if a
  // resident, 2 the tax on it; 8 the Maryland income (fixed: what was
  // earned there), 9 its share of federal AGI to six places; 10 the
  // deduction (15% of the Maryland income, between the floor and cap) and
  // 12 the exemptions, each scaled by that share; 13 Maryland taxable net
  // income; 15 its share of line 1; 16 the resident tax at that share; 17
  // the special nonresident tax on line 13 in place of the county tax.
  if (card.nonresident?.method === "maryland") {
    const factor = fed.agi > 0 ? Math.min(1, round6(stateSource / fed.agi)) : 1;
    const deduction = Math.round(standardDeductionFor(card, status, fed, s, stateSource) * factor);
    const net = Math.max(0, stateSource - deduction);
    const exemption = Math.round(resident.exemption * factor);
    const taxable = Math.max(0, net - exemption);
    const share = totalTaxable > 0 ? Math.min(1, round6(taxable / totalTaxable)) : 0;
    const stateTax = Math.round(tax * share);
    const special = Math.round(taxable * (card.nonresident.specialRate ?? 0));
    const mode = creditMode(card);
    const available = Math.max(0, s.pteCreditAvailable);
    const pteCredit = mode === "nonrefundable" ? Math.min(available, stateTax) : mode === "refundable" ? available : 0;
    return {
      ...resident,
      income: stateSource,
      taxable,
      tax: stateTax,
      residentTax: tax,
      exemption,
      local: 0,
      sharedResponsibility: 0,
      pteCredit,
      nonresidentTax: special,
      grossTax: stateTax + special,
      netTax: stateTax + special - pteCredit,
    };
  }

  const share = fed.totalIncome > 0 ? stateSource / fed.totalIncome : 0;
  const stateAgi = Math.max(0, stateSource - Math.round(fed.adjustments * share));
  const deduction = standardDeductionFor(card, status, fed, s, fed.agi);
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
    residentTax: tax,
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

/**
 * What the state charges the partnership or LLC itself (Form 568): the
 * annual tax plus the fee for its total income, and the elective tax on the
 * partners' income when it elected (the same election as the S corporation's).
 */
export function partnershipTax(card: StateCard, grossIncome: number, netIncome: number, electPte: boolean): EntityTax {
  const p = card.partnership;
  if (!p) return { netIncome, franchise: 0, pte: 0, total: 0 };
  const tier = p.fee.find((r) => r.below === null || grossIncome < r.below) ?? p.fee[p.fee.length - 1];
  const franchise = p.annualTax + (tier ? tier.amount : 0);
  const pte = electPte && card.entity?.pte ? Math.round(scheduleTax(card.entity.pte.brackets, Math.max(0, netIncome))) : 0;
  return { netIncome, franchise, pte, total: franchise + pte };
}

/** How the shareholder gets the entity's elective tax back, per the card. */
const creditMode = (card: StateCard | null) => card?.entity?.pte?.credit ?? "nonrefundable";

/**
 * Split an amount by the partners' shares so the pieces add up: each gets
 * its rounded share and, when the partners on this return own the whole
 * partnership, the last one takes the rounding.
 */
function allocate(total: number, shares: number[]): number[] {
  const out = shares.map((p) => Math.round(total * p));
  const whole = Math.abs(shares.reduce((s, p) => s + p, 0) - 1) < 0.001;
  if (whole && out.length) out[out.length - 1] = total - out.slice(0, -1).reduce((s, v) => s + v, 0);
  return out;
}

/* ─────────────────────────────── the model ─────────────────────────────── */

/**
 * Which strategies are switched on. Everything off is the before; everything
 * on is the after. The sole-proprietor keys are expenses and homeOffice; the
 * S corporation keys are writeOffs, salary, retirement and pte; the
 * partnership keys are writeOffs and healthInsurance; reps (the rentals
 * treated as nonpassive by a real estate professional) applies to any shape.
 *
 * The tax team's call (2026-10-05): what the client saves into a SEP, an IRA
 * or an HSA (Schedule 1 lines 16, 20, 13) is something DeCypher set up, so
 * `retirement` switches it on for every shape; and a sole proprietor's
 * self-employed health insurance deduction is something DeCypher caught, so
 * `healthInsurance` switches it on for the sole proprietor too.
 */
type Scenario = {
  expenses: boolean;
  homeOffice: boolean;
  writeOffs: boolean;
  salary: boolean;
  retirement: boolean;
  pte: boolean;
  healthInsurance: boolean;
  /**
   * The rental properties' expenses (Schedule E line 20: mortgage interest,
   * depreciation, repairs, taxes). Off, each property nets its rents — the
   * tax team's convention for the zero-write-off before (2026-10-02):
   * rental costs are write-offs found, like the Schedule C's.
   */
  rentalExpenses: boolean;
  reps: boolean;
  /**
   * The same return without its dependents: no child tax credit, no
   * child-care credit, single instead of head of household, no state
   * dependent exemptions. The recap's before is figured this way (see
   * kidsValue); the CPA's before prints, and so `deriveBefore`, keep them.
   */
  noKids?: boolean;
};

/**
 * The filing status once the dependents are gone. Head of household and
 * qualifying surviving spouse both need a qualifying person; without one
 * the filer is single. A joint or separate return stays as it is.
 */
const statusWithoutDependents = (s: FilingStatus): FilingStatus => (s === "hoh" || s === "qss" ? "single" : s);

const ALL_OFF: Scenario = { expenses: false, homeOffice: false, writeOffs: false, salary: false, retirement: false, pte: false, healthInsurance: false, rentalExpenses: false, reps: false };
const ALL_ON: Scenario = { expenses: true, homeOffice: true, writeOffs: true, salary: true, retirement: true, pte: true, healthInsurance: true, rentalExpenses: true, reps: true };

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
  shape: "soleProp" | "scorp" | "partnership";
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
    /** Whose wages are whose and who paid them. */
    wages: Wages;
    /** The K-1's section 179 deduction (box 11), zeroed on the before with the write-offs. */
    section179: number;
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
    /** Schedule C line 4, zeroed with the expenses. */
    schCogs: number;
    /** Line 31: paid with an extension, excess Social Security withheld — payments, not credits. */
    otherPayments: number;
    /** Qualified dividends plus net long-term gain, taxed by the worksheet. */
    preferential: number;
    qbiCarryforward: number;
    stateAdjustments: number;
    /** Set when SE tax was taken as zero from a blank line. */
    seTaxNote: string | null;
    /** Form 1065 line 10, zeroed on the before with the other deductions. */
    guaranteedPayments: number;
    /** The partners' health premiums the partnership paid (Form 7206 line 1, all partners). */
    partnerPremiums: number;
    rental: Rental | null;
    /** Set when the W-2 on a joint return turned out to be the other spouse's, or a partner's. */
    seWagesNote: string | null;
    /** Set when a pass-through Schedule C was left out. */
    nomineeNote: string | null;
    /** Set when the reader's two K-1 lines were reconciled by the entity's form. */
    k1Note: string | null;
    /** Set when Schedule E's S corporation income was reconciled with the K-1's section 179 deduction. */
    s179Note: string | null;
    /** Schedule A as read, when the after return itemizes. */
    itemized: Itemized | null;
    /** The state's own deduction as read, when it beats the state's standard deduction. */
    stateDeduction: number | null;
    /** Schedule 1 lines 16, 20 and 13 as read: switched off on the before. */
    sep: number;
    ira: number;
    hsa: number;
    /** Dependents on the return: the count read, or the qualifying children and other dependents the credit on line 19 implies when that's more. */
    dependents: number;
    /** Schedule 3 line 2 as read. */
    childCareCredit: number;
    /** Form 1040 line 12a: the filer is someone else's dependent. */
    claimedAsDependent: boolean;
  };
};

type ModelResult = { ok: true; model: Model } | { ok: false; reasons: string[]; mismatches: Mismatch[] };

/** Schedule SE line 4c: under this much net earnings there is no SE tax, and no schedule. */
const SE_FLOOR = 400;

/**
 * Lines a return leaves blank because the form that would carry them wasn't
 * printed. ProSeries prints Schedule 2 and Schedule SE only when there is
 * something on them: a Schedule C at a loss, or at a profit under the $400
 * floor of net earnings, carries no SE tax and line 23 prints as 0. Blank
 * there is a zero, not a line that wasn't read. Either sign is enough: line
 * 23 read as 0, or a profit under the floor.
 */
function impliedLines(r: ReturnNumbers, fed: FederalCard | null): { numbers: ReturnNumbers; seTaxNote: string | null } {
  if (has(r.seTax) || n(r.scorpIncome) > 0 || n(r.partnershipIncome) > 0) return { numbers: r, seTaxNote: null };
  const factor = fed?.selfEmployment.netEarningsFactor ?? 0.9235;
  const line23Zero = has(r.otherTaxes) && r.otherTaxes === 0;
  const underFloor = has(r.businessNetIncome) && r.businessNetIncome * factor < SE_FLOOR;
  if (!line23Zero && !underFloor) return { numbers: r, seTaxNote: null };
  return {
    numbers: { ...r, seTax: 0 },
    seTaxNote: `Self-employment tax taken as $0 on the after return: ${
      line23Zero ? "line 23 prints 0" : `Schedule C net profit (${fmt(n(r.businessNetIncome))}) is under the $400 floor of net earnings`
    } and no Schedule SE was printed`,
  };
}

/**
 * Whose W-2s are whose, and who paid them — from the return's W-2 lines
 * when the reader could tell (W-2 copies in the print, a state wage schedule
 * such as Massachusetts Schedule INC, with the business's own W-2s pointed
 * out by the browser from their EIN), and otherwise from the one assumption
 * the engine used to make: that the only W-2 on the 1040 is the officer's.
 *
 * Refuses, with the lines to type named, when wages above the officer's pay
 * can't be placed: the before can't zero a spouse's wages from the business
 * and keep an outside employer's without knowing which they are.
 */
function splitWages(
  after: ReturnNumbers,
  shape: Model["shape"],
  officerComp: number,
  /** Form 1120-S line 8: what the business paid everyone else. */
  entityWages: number,
  w2: number,
): { wages: Wages; reasons: string[] } {
  const reasons: string[] = [];
  const t = has(after.w2Taxpayer) ? after.w2Taxpayer : null;
  const s = has(after.w2Spouse) ? after.w2Spouse : null;
  const tE = has(after.w2TaxpayerEntity) ? after.w2TaxpayerEntity : null;
  const sE = has(after.w2SpouseEntity) ? after.w2SpouseEntity : null;
  const perPerson = t !== null || s !== null;
  const entityRead = tE !== null || sE !== null;
  const none: Wages = { officer: 0, officerBox1: 0, employeeEntity: 0, outside: [w2, 0], read: false };

  if (perPerson && off(n(t) + n(s), w2)) {
    reasons.push(
      `The W-2 lines read (${fmt(n(t))} the taxpayer's, ${fmt(n(s))} the spouse's) don't add up to line 1z (${fmt(w2)})`,
    );
    return { wages: none, reasons };
  }
  if ((tE !== null && t !== null && tE > t + TOL) || (sE !== null && s !== null && sE > s + TOL)) {
    reasons.push("A W-2 from the business was read as more than that person's W-2 wages altogether");
    return { wages: none, reasons };
  }

  if (shape !== "scorp") {
    // A sole proprietor's or a partner's wages are all from elsewhere; who
    // earned them matters only for the wage base (decided by the SE tax,
    // further down) and a per-person state deduction.
    const outside: [number, number] = perPerson ? [n(t), n(s)] : [w2, 0];
    return { wages: { officer: 0, officerBox1: 0, employeeEntity: 0, outside, read: perPerson }, reasons };
  }

  if (!entityRead) {
    if (w2 <= officerComp + TOL) {
      // The one W-2 is the officer's, as the engine always assumed.
      const officer: 0 | 1 = perPerson && n(t) <= 0 && n(s) > 0 ? 1 : 0;
      return { wages: { officer, officerBox1: w2, employeeEntity: 0, outside: [0, 0], read: perPerson }, reasons };
    }
    const beyond = w2 - officerComp;
    reasons.push(
      `The 1040 carries ${fmt(w2)} of W-2 wages${perPerson ? ` (${fmt(n(t))} the taxpayer's, ${fmt(n(s))} the spouse's)` : ""}, ${fmt(beyond)} more than the officer's pay on the 1120-S (${fmt(officerComp)}). The engine can't tell whether the corporation paid the rest (a spouse on its payroll, inside the ${fmt(entityWages)} of salaries on line 8) or another employer did — the before zeroes the first and keeps the second. Type what the corporation paid each person in the two "W-2 wages from the business" lines of the after column (show all lines; ${fmt(w2)} between them if it paid all of it, ${fmt(officerComp)} if only the officer) and recompute the before column`,
    );
    return { wages: none, reasons };
  }

  const entity: [number, number] = [n(tE), n(sE)];
  const entityTotal = entity[0] + entity[1];
  // Without the per-person totals, whatever line 1z carries beyond the
  // business's W-2s is taken as the taxpayer's from another employer.
  const all: [number, number] = perPerson ? [n(t), n(s)] : [entity[0] + Math.max(0, w2 - entityTotal), entity[1]];
  if (entityTotal > w2 + TOL) {
    reasons.push(`The W-2s from the business (${fmt(entityTotal)}) come to more than line 1z (${fmt(w2)})`);
    return { wages: none, reasons };
  }
  // The officer's W-2 is the one at or under officer compensation (box 1 is
  // the pay less any 401(k) deferral); the closer, the surer.
  let officer: 0 | 1 = 0;
  let officerBox1 = 0;
  if (officerComp > 0) {
    const fits = ([0, 1] as const).filter((k) => entity[k] > 0 && entity[k] <= officerComp + TOL);
    if (!fits.length) {
      reasons.push(
        `The 1120-S pays ${fmt(officerComp)} of officer compensation, but no W-2 from the business on the 1040 (${fmt(entity[0])} the taxpayer's, ${fmt(entity[1])} the spouse's) is at or under it`,
      );
      return { wages: none, reasons };
    }
    officer = fits.length === 1 ? fits[0] : officerComp - entity[0] <= officerComp - entity[1] ? 0 : 1;
    officerBox1 = entity[officer];
  }
  const employeeEntity = entityTotal - officerBox1;
  if (employeeEntity > entityWages + TOL) {
    reasons.push(
      `The business's W-2s beyond the officer's (${fmt(employeeEntity)}) are more than the 1120-S deducts as salaries and wages on line 8 (${fmt(entityWages)})`,
    );
    return { wages: none, reasons };
  }
  const outside: [number, number] = [Math.max(0, all[0] - entity[0]), Math.max(0, all[1] - entity[1])];
  return { wages: { officer, officerBox1, employeeEntity, outside, read: true }, reasons };
}

/**
 * Prove the tables on the after return (and the entity return) and hand
 * back the model. This is the gate everything else goes through.
 */
function buildModel(
  afterRead: ReturnNumbers,
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
  const implied = impliedLines(afterRead, card?.federal ?? null);
  let after = implied.numbers;
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

  // The K-1 income: an S corporation's or a partnership's. The reader can
  // put the Schedule E total on either line; the entity's own form, when
  // one was read, settles which it is.
  let scorpIncome = n(after.scorpIncome);
  let partnershipIncome = n(after.partnershipIncome);
  let k1Note: string | null = null;
  // The reader can also split the rows between the two lines (Singh: one
  // partner's row as S corporation income, the other's as partnership
  // income), so with one entity attached both lines are its income. The
  // K-1 reconciliation further down refuses if the sum doesn't match the
  // entity's own K-1s — a genuine second K-1 still can't slip through.
  if (meta.entityForm === "1065" && scorpIncome > 0) {
    k1Note =
      partnershipIncome > 0
        ? `Schedule E's K-1 rows were read partly as S corporation income (${fmt(scorpIncome)}) and partly as partnership income (${fmt(partnershipIncome)}) — the entity return is a Form 1065, so all ${fmt(scorpIncome + partnershipIncome)} is the partnership's`
        : `The ${fmt(scorpIncome)} read as S corporation income is the partnership's K-1 income — the entity return is a Form 1065`;
    partnershipIncome += scorpIncome;
    scorpIncome = 0;
  } else if (meta.entityForm === "1120-S" && partnershipIncome > 0) {
    k1Note =
      scorpIncome > 0
        ? `Schedule E's K-1 rows were read partly as partnership income (${fmt(partnershipIncome)}) and partly as S corporation income (${fmt(scorpIncome)}) — the entity return is a Form 1120-S, so all ${fmt(scorpIncome + partnershipIncome)} is the corporation's`
        : `The ${fmt(partnershipIncome)} read as partnership income is the S corporation's K-1 income — the entity return is a Form 1120-S`;
    scorpIncome += partnershipIncome;
    partnershipIncome = 0;
  }
  // Schedule E nets the K-1's section 179 deduction (box 11, column (j))
  // off the ordinary income; a reader that took column (k) alone is
  // reconciled here, before the income is split up.
  let s179Note: string | null = null;
  if (entity && scorpIncome > 0) {
    const k1 = n(entity.k1Ordinary);
    const s179 = n(entity.k1Section179);
    if (s179 > 0 && !off(k1, scorpIncome) && off(k1 - s179, scorpIncome)) {
      s179Note = `Schedule E's S corporation income was read as the K-1's ${fmt(k1)} of ordinary income; its ${fmt(s179)} section 179 deduction (column (j)) nets it to ${fmt(k1 - s179)}, which is what Schedule 1 carries`;
      scorpIncome = k1 - s179;
    }
  }
  after = { ...after, scorpIncome: scorpIncome > 0 ? scorpIncome : null, partnershipIncome: partnershipIncome > 0 ? partnershipIncome : null };
  if (scorpIncome > 0 && partnershipIncome > 0) {
    reasons.push("The return carries both an S corporation K-1 and a partnership K-1 — the engine models one business at a time");
  }
  const k1Income = scorpIncome + partnershipIncome;

  // A Schedule C that only passes through income reported under the
  // owner's SSN and picked up on the entity's return nets to zero — the
  // receipts and the same amount of "other expenses" — and isn't a
  // business of its own.
  let nomineeNote: string | null = null;
  const schCGross = n(after.grossReceipts);
  if (
    k1Income > 0 &&
    schCGross > 0 &&
    n(after.businessNetIncome) === 0 &&
    !off(schCGross - n(after.cogs) - n(after.totalExpenses) - n(after.homeOffice), 0)
  ) {
    after = { ...after, businessNetIncome: null, grossReceipts: null, cogs: null, totalExpenses: null, homeOffice: null, schCWages: null, schCDepreciation: null };
    nomineeNote = `A Schedule C with ${fmt(schCGross)} of receipts netted to $0 is income issued under the owner's SSN and picked up on the entity's return — not a business of its own, so it's left out`;
  }

  const schC = has(after.businessNetIncome) && after.businessNetIncome !== 0;
  if (k1Income > 0 && schC) {
    reasons.push(
      "The return carries both a Schedule C and a K-1 — the engine models one business at a time",
    );
  }
  // With no K-1 income read but the entity's return attached and no Schedule
  // C with a profit or loss of its own, the business is the entity's: asking for Schedule C lines
  // would point the reviewer at the wrong page (the nominee Schedule Cs on a
  // partner's return are left out by design). The required list below then
  // names the K-1 line that's missing.
  const shape: Model["shape"] =
    partnershipIncome > 0
      ? "partnership"
      : scorpIncome > 0
        ? "scorp"
        : entity && !schC
          ? meta.entityForm === "1065"
            ? "partnership"
            : meta.entityForm === "1120-S"
              ? "scorp"
              : "soleProp"
          : "soleProp";
  const required: ReturnFieldKey[] =
    shape === "scorp"
      ? ["scorpIncome", "totalIncome", "agi", "taxableIncome", "incomeTax", "federalTotalTax"]
      : shape === "partnership"
        ? ["partnershipIncome", "totalIncome", "agi", "taxableIncome", "incomeTax", "seTax", "federalTotalTax"]
        : ["grossReceipts", "businessNetIncome", "totalIncome", "agi", "taxableIncome", "incomeTax", "seTax", "federalTotalTax"];
  const missing = required.filter((k) => !has(after[k]));
  if (missing.length) {
    reasons.push(`These lines weren't read from the after return: ${missing.map(label).join(", ")}`);
  }
  const entityName = shape === "partnership" ? "1065" : "1120-S";
  if (shape === "scorp" && !entity) {
    reasons.push(
      "The 1040 carries S corporation income from a K-1 — add the corporation's 1120-S so the before can be computed from its gross receipts",
    );
  }
  if (shape === "partnership" && !entity) {
    reasons.push(
      "The 1040 carries partnership income from a K-1 — add the partnership's 1065 so the before can be computed from its gross receipts",
    );
  }
  if (shape !== "soleProp" && entity) {
    const need: EntityFieldKey[] = ["grossReceipts", "totalIncome", "totalDeductions", "ordinaryIncome", "k1Ordinary"];
    const miss = need.filter((k) => !has(entity[k]));
    if (miss.length) {
      reasons.push(`These lines weren't read from the ${entityName}: ${miss.map(entityLabel).join(", ")}`);
    }
  }
  if (status === "mfs" && (n(after.rentalLosses) > 0 || n(after.passivePriorUnallowed) > 0)) {
    reasons.push("Rental losses on a married-filing-separately return follow Form 8582's separate rules, which the engine doesn't model");
  }
  if (!card || !status || reasons.length) return refuse();

  const fed = card.federal;
  const statusLabel = FILING_STATUS_LABEL[status];
  const w2 = n(after.w2Income);
  // Schedule E Part I as read: the rentals' net as deducted comes out of
  // "other income" and is modeled on its own (Form 8582).
  const rentalReadNet = n(after.rentalIncome);
  const hasRental = has(after.rentalIncome) || n(after.rentalLosses) > 0 || n(after.rentalProfits) > 0;
  const otherIncome = (after.totalIncome as number) - w2 - n(after.businessNetIncome) - k1Income - rentalReadNet;

  /* 2 · shape: is this a return the engine models? */

  // Sole proprietor: the Schedule C has to be gross receipts less expenses.
  const gross = shape === "soleProp" ? (after.grossReceipts as number) : 0;
  const netAfter = shape === "soleProp" ? (after.businessNetIncome as number) : 0;
  const expenses = n(after.totalExpenses);
  const homeOffice = n(after.homeOffice);
  // Cost of goods sold on a Schedule C is purchases and materials — a
  // write-off like the rest, zeroed on the before with the expenses.
  const schCogs = shape === "soleProp" ? n(after.cogs) : 0;
  if (shape === "soleProp" && off(gross - schCogs - expenses - homeOffice, netAfter)) {
    reasons.push(
      `Schedule C net profit (${fmt(netAfter)}) isn't gross receipts − cost of goods sold − expenses − home office (${fmt(gross - schCogs - expenses - homeOffice)}): returns and allowances, or other income on line 6 — zeroing the expenses wouldn't give the before`,
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
    // Schedule E carries the K-1's ordinary income less its section 179
    // deduction (box 11, column (j)); a read of column (k) alone was
    // reconciled above.
    const s179 = n(e.k1Section179);
    if (off(k1 - s179, scorpIncome)) {
      reasons.push(
        `The 1040's S corporation income (${fmt(scorpIncome)}) doesn't match the K-1's ordinary income (${fmt(k1)})${s179 > 0 ? ` less its ${fmt(s179)} section 179 deduction (${fmt(k1 - s179)})` : ""} — a second K-1, a basis limitation, or a passive loss`,
      );
    }
    if (totalDeductions - officerComp - pension - stateAddBack < -TOL) {
      reasons.push(
        `Officer compensation, the pension plan and the state taxes added back (${fmt(officerComp + pension + stateAddBack)}) come to more than the 1120-S's total deductions (${fmt(totalDeductions)})`,
      );
    }
    if (reasons.length) return refuse();
  }

  // Partnership: the 1065 has to be gross receipts less cost of goods sold
  // less deductions, and the K-1s on this 1040 — the owner's, and the
  // spouse's when both are partners — have to add up to what Schedule E
  // reports, each at its share of the ordinary income.
  const guaranteed = n(e.guaranteedPayments);
  let partners: Partner[] = [];
  const shares: number[] = [];
  if (shape === "partnership") {
    const eTotal = e.totalIncome as number;
    const ordinary = e.ordinaryIncome as number;
    if (off(eGross - cogs, eTotal)) {
      reasons.push(
        `The 1065's total income (${fmt(eTotal)}) isn't gross receipts less cost of goods sold (${fmt(eGross - cogs)}): returns, income from another partnership, a Form 4797 gain or other income the engine doesn't model`,
      );
    }
    if (off(eTotal - totalDeductions, ordinary)) {
      reasons.push(`The 1065's ordinary income (${fmt(ordinary)}) isn't total income less total deductions (${fmt(eTotal - totalDeductions)})`);
    }
    if (ordinary <= 0) {
      reasons.push(`The 1065 shows no ordinary income (${fmt(ordinary)}) — a loss year can't be run through the before`);
    }
    if (guaranteed > totalDeductions + TOL) {
      reasons.push(`Guaranteed payments (${fmt(guaranteed)}) come to more than the 1065's total deductions (${fmt(totalDeductions)})`);
    }
    const k1s = [
      { ordinary: n(e.k1Ordinary), guaranteed: n(e.k1Guaranteed), pct: has(e.ownershipPct) ? e.ownershipPct / 100 : null },
      ...(has(e.k1Ordinary2)
        ? [{ ordinary: e.k1Ordinary2, guaranteed: n(e.k1Guaranteed2), pct: has(e.ownershipPct2) ? e.ownershipPct2 / 100 : null }]
        : []),
    ];
    const k1Sum = k1s.reduce((s, k) => s + k.ordinary + k.guaranteed, 0);
    if (off(k1Sum, partnershipIncome)) {
      reasons.push(
        `The 1040's partnership income (${fmt(partnershipIncome)}) doesn't match the K-1s' ordinary income and guaranteed payments (${fmt(k1Sum)}) — another K-1, a basis limitation, or a passive loss`,
      );
    }
    const gpOnReturn = k1s.reduce((s, k) => s + k.guaranteed, 0);
    if (gpOnReturn > guaranteed + TOL) {
      reasons.push(`The K-1s' guaranteed payments (${fmt(gpOnReturn)}) are more than the 1065 deducts on line 10 (${fmt(guaranteed)})`);
    }
    for (const k of k1s) {
      const pct = k.pct ?? (ordinary > 0 ? round4(k.ordinary / ordinary) : 0);
      if (ordinary > 0 && off(k.ordinary, Math.round(ordinary * pct))) {
        reasons.push(
          `A K-1 reports ${fmt(k.ordinary)} of the 1065's ${fmt(ordinary)}, but its profit share is ${Math.round(pct * 1000) / 10}% (${fmt(Math.round(ordinary * pct))}) — a special allocation or a mid-year change the engine doesn't model`,
        );
      }
      shares.push(pct);
      partners.push({ ordinary: k.ordinary, guaranteed: k.guaranteed, premiums: 0, wages: 0 });
    }
    if (shares.reduce((s, p) => s + p, 0) > 1.001) {
      reasons.push("The partners' profit shares on this return add up to more than 100%");
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

  // A partnership's health premiums (Form 7206 line 1, every partner's
  // form added up) are split between the partners by their guaranteed
  // payments — that is how the partnership paid them.
  const partnerPremiums = shape === "partnership" ? n(sehiPaid) : 0;
  if (shape === "partnership") {
    const gpOnReturn = partners.reduce((s, p) => s + p.guaranteed, 0);
    partners = partners.map((p) => ({
      ...p,
      premiums: gpOnReturn > 0 ? Math.round((partnerPremiums * p.guaranteed) / gpOnReturn) : Math.round(partnerPremiums / partners.length),
    }));
  }

  // Whose W-2s are whose and who paid them.
  const split = splitWages(after, shape, officerComp, n(e.wages), w2);
  let wages = split.wages;
  if (split.reasons.length) {
    reasons.push(...split.reasons);
    return refuse();
  }
  const outsideWages = wages.outside[0] + wages.outside[1];

  // The owner's pay on an S corporation: officer compensation is the cash
  // wages (Medicare wages) plus the health insurance run through payroll;
  // box 1 is that less the 401(k) deferral.
  const healthInsurance = shape === "scorp" ? n(sehiPaid) : 0;
  const medicareWagesRead = has(after.medicareWages) ? after.medicareWages : null;
  const officerMedicare = shape === "scorp" ? (medicareWagesRead ?? Math.max(0, officerComp - healthInsurance)) : 0;
  const deferral = shape === "scorp" ? Math.max(0, officerComp - wages.officerBox1) : 0;
  if (shape === "scorp" && medicareWagesRead !== null && off(medicareWagesRead + healthInsurance, officerComp)) {
    reasons.push(
      `Officer compensation on the 1120-S (${fmt(officerComp)}) isn't the Medicare wages (${fmt(medicareWagesRead)}) plus the health insurance premiums (${fmt(healthInsurance)}) — another benefit in the owner's pay the engine doesn't model`,
    );
    return refuse();
  }
  // Form 8959 counts every W-2's Medicare wages; the health insurance
  // deduction is capped at the owner's from the S corporation alone.
  const medicareWages = shape === "scorp" ? officerMedicare + wages.employeeEntity + outsideWages : w2;
  const claimedAsDependent = n(after.dependentOfAnother) > 0;

  /* 3 · proof: re-run the after return and compare, layer by layer */

  // Schedule 1 adjustments beyond the SE and health insurance deductions
  // (student loan interest, an HSA, a SEP) stay on the before as they are:
  // the CPA's before prints keep them. Those two are recomputed.
  /** The K-1's section 179 deduction: a write-off of the entity's, outside line 21, zeroed on the before with the rest. */
  const section179 = shape === "scorp" ? n(e.k1Section179) : 0;
  const k1After = shape === "scorp" ? (e.k1Ordinary as number) - section179 : shape === "partnership" ? partnershipIncome : 0;
  const dependentsInferred = inferDependents(fed, status, after);
  if (dependentsInferred === null) {
    reasons.push(
      `The credit on line 19 (${fmt(n(after.childTaxCredit))}) isn't what the ${year} tables give for any mix of qualifying children (${fmt(fed.childTaxCredit.perChild)} each) and other dependents (${fmt(fed.childTaxCredit.perOtherDependent)} each) at this income`,
    );
    return refuse();
  }
  const { children, others } = dependentsInferred;
  const childCareCredit = n(after.childCareCredit);
  const otherCredits = Math.max(0, n(after.nonrefundableCredits) - childCareCredit);
  const qbiRead: QbiInputs | null = has(after.qbiIncome)
    ? { income: after.qbiIncome, w2Wages: n(after.qbiW2Wages), ubia: n(after.qbiUbia) }
    : null;
  // Line 32 bundles line 31 (an extension payment, excess Social Security
  // withheld) in with the refundable credits; only the credits are credits.
  const otherPayments = n(after.otherPayments);
  const refundableRead = Math.max(0, n(after.federalRefundableCredits) - otherPayments);
  // Qualified dividends and a net long-term gain are taxed by the worksheet
  // on both sides; a loss on line 7 is already inside other income. With a
  // Schedule D, only its long-term net is preferential.
  const longTerm = has(after.capitalGainLongTerm) ? Math.min(after.capitalGainLongTerm, n(after.capitalGain)) : n(after.capitalGain);
  const preferential = Math.max(0, n(after.qualifiedDividends)) + Math.max(0, longTerm);
  const qbiCarryforward = qbiRead ? 0 : Math.max(0, n(after.qbiLossCarryforward));
  const sep = Math.max(0, n(after.sepDeduction));
  // Schedule 1 lines 20 and 13: part of the "other" adjustments as read,
  // taken back out of them when the before switches retirement off.
  const ira = Math.max(0, n(after.iraDeduction));
  const hsa = Math.max(0, n(after.hsaDeduction));

  // Schedule E Part I. When only the net was read, it's all profit or all
  // loss, as its sign says.
  let rental: Rental | null = null;
  if (hasRental) {
    const profits = has(after.rentalProfits) ? after.rentalProfits : Math.max(0, rentalReadNet + n(after.rentalLosses));
    const losses = has(after.rentalLosses) ? after.rentalLosses : Math.max(0, n(after.rentalProfits) - rentalReadNet);
    // The before zeroes the rental expenses, so it needs the rents. Line
    // 23a less line 23e is the properties' net (line 21 added up): either
    // line gives the other, and with both read they have to agree.
    const net = profits - losses;
    const rentsRead = has(after.rentalRents) ? after.rentalRents : null;
    const expensesRead = has(after.rentalExpenses) ? after.rentalExpenses : null;
    if (rentsRead === null && expensesRead === null) {
      reasons.push(
        "Schedule E line 23a (the rents) wasn't read — the before zeroes the rental expenses, so it needs the rents the properties brought in",
      );
      return refuse();
    }
    const rents = rentsRead ?? net + (expensesRead as number);
    const rentalExpenses = expensesRead ?? rents - net;
    if (off(rents - rentalExpenses, net)) {
      reasons.push(
        `Schedule E's rents (${fmt(rents)}, line 23a) less its expenses (${fmt(rentalExpenses)}, line 23e) aren't the properties' net as read (${fmt(net)}, line 21) — a royalty property, or one of the lines misread`,
      );
      return refuse();
    }
    rental = { profits, losses, prior: n(after.passivePriorUnallowed), reps: n(after.rentalReps) !== 0, qbi: true, rents, expenses: rentalExpenses };
  }

  // Schedule A as read; the medical piece inside the total is at the after's AGI.
  const itemized: Itemized | null = has(after.itemizedDeductions)
    ? {
        total: after.itemizedDeductions,
        saltPaid: n(after.saltPaid),
        saltDeducted: has(after.saltDeducted) ? after.saltDeducted : n(after.saltPaid),
        medical: n(after.medicalExpenses),
        medicalDeducted: Math.max(0, n(after.medicalExpenses) - Math.round((after.agi as number) * 0.075)),
      }
    : null;

  let base: FederalInputs = {
    netProfit: netAfter,
    seWages: shape === "soleProp" ? w2 : 0,
    // A partnership's K-1 income rides in with the partners, not here.
    scorp: shape === "scorp" ? k1After : 0,
    partners,
    w2,
    medicareWages,
    scorpMedicareWages: officerMedicare,
    claimedAsDependent,
    otherIncome,
    rental,
    carried: 0,
    sep,
    sehiPaid,
    coverage,
    qbi: qbiRead,
    qbiCarryforward,
    preferential,
    itemized,
    children,
    others,
    childCareCredit,
    otherCredits,
  };

  // Whose W-2 is it? On a joint return the wages may be the spouse's, in
  // which case they don't use up the Schedule C filer's wage base; with a
  // partnership they may be one partner's. The SE tax as printed says:
  // the first reading that reproduces it is taken.
  let seWagesNote: string | null = null;
  if (w2 > 0 && has(after.seTax) && (shape === "partnership" || ((status === "mfj" || status === "qss") && shape === "soleProp"))) {
    const candidates: { inputs: FederalInputs; note: string | null }[] =
      shape === "partnership"
        ? [
            { inputs: base, note: null },
            ...partners.map((_, k) => ({
              inputs: { ...base, partners: partners.map((p, j) => (j === k ? { ...p, wages: w2 } : p)) },
              note: `The ${fmt(w2)} of W-2 wages are taken as ${k === 0 ? "the owner's" : "the spouse's"}, since the SE tax as printed only reproduces with that partner's Social Security wage base used up by them`,
            })),
          ]
        : [
            { inputs: base, note: null },
            {
              inputs: { ...base, seWages: 0 },
              note: `The ${fmt(w2)} of W-2 wages are taken as the spouse's: the SE tax as printed only reproduces with the Schedule C filer's whole Social Security wage base`,
            },
          ];
    const hit = candidates.find((c) => !off(federal(fed, status, c.inputs).seTax, after.seTax as number));
    if (hit) {
      base = hit.inputs;
      seWagesNote = hit.note;
      partners = base.partners;
      // Whose the wages turned out to be, for a per-person state deduction,
      // unless the W-2 lines already said.
      if (!wages.read) {
        const spouses = shape === "partnership" ? partners.findIndex((p) => p.wages > 0) === 1 : base.seWages === 0;
        wages = { ...wages, outside: spouses ? [0, w2] : [w2, 0] };
      }
    }
  }

  const seOnly = federal(fed, status, base);
  const adjustmentsRead = (after.totalIncome as number) - (after.agi as number);
  const otherAdjustments = adjustmentsRead - seOnly.halfSe - seOnly.sehi - sep;
  if (otherAdjustments < -TOL) {
    reasons.push(
      `Adjustments to income on the after return (${fmt(adjustmentsRead)}) are less than the SE tax, health insurance and retirement plan deductions the tables give (${fmt(seOnly.halfSe + seOnly.sehi + sep)}) — a second Schedule C, a K-1, or an optional method on Schedule SE`,
    );
    return refuse();
  }
  const carried = otherAdjustments > TOL ? otherAdjustments : 0;
  if (ira + hsa > carried + TOL) {
    reasons.push(
      `The IRA (${fmt(ira)}) and HSA (${fmt(hsa)}) deductions read are more than the adjustments left after the SE tax, health insurance and retirement plan deductions (${fmt(carried)}) — one of the Schedule 1 lines misread`,
    );
    return refuse();
  }

  let inputs: FederalInputs = { ...base, carried };
  let check = federal(fed, status, inputs);
  // Whether the rentals count as qualified business income is the
  // preparer's call (Form 8995 lists them or not); the QBI deduction as
  // printed says which.
  if (rental && off(n(after.qbiDeduction), check.qbi)) {
    const alt: FederalInputs = { ...inputs, rental: { ...rental, qbi: false } };
    const altCheck = federal(fed, status, alt);
    if (!off(n(after.qbiDeduction), altCheck.qbi)) {
      rental = alt.rental;
      base = { ...base, rental };
      inputs = alt;
      check = altCheck;
    }
  }
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
      : shape === "partnership"
        ? "a partner whose share isn't subject to SE tax (a limited partner), a Schedule C, or an optional method on Schedule SE"
        : w2 > 0
          ? "W-2 Social Security wages (box 3) may differ from box 1, or there's a second Schedule C or a K-1"
          : "a second Schedule C, a K-1, or an optional method on Schedule SE",
  );
  if (rental) {
    mismatch(
      "Rental real estate income or loss (Schedule E line 26)",
      rentalReadNet,
      check.rentalDeducted,
      rental.reps
        ? "a rental the real estate professional didn't materially participate in, or a prior-year loss allowed this year"
        : "a loss allowed under a rule the engine doesn't model (active participation, a disposition, or a prior-year loss freed up)",
    );
  }
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
    const standardLabel = claimedAsDependent
      ? `the ${year} dependent's standard deduction (${fmt(check.deduction)}: earned income plus ${fmt(fed.dependentStandardDeduction.earnedPlus)}, at least ${fmt(fed.dependentStandardDeduction.minimum)})`
      : `the ${year} standard deduction for ${statusLabel} (${fmt(fed.standardDeduction[status])})`;
    reasons.push(
      itemized
        ? `The after return's deduction (${fmt(deductionRead)}) isn't ${standardLabel} or the Schedule A total as read (${fmt(check.itemizedTotal)}): age or blindness, or Schedule 1-A`
        : `The after return's deduction (${fmt(deductionRead)}) isn't ${standardLabel}: itemized (Schedule A wasn't read), age or blindness, Schedule 1-A${claimedAsDependent ? "" : ", or a filer someone else claims (line 12a, not read)"}`,
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
    `Refundable credits (line 32${otherPayments > 0 ? " less the other payments on line 31" : ""})`,
    refundableRead,
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
  // The state's own adjustments to federal AGI (an HSA contribution added
  // back, a state refund taken out) are facts of the year, carried across.
  const stateAdjustments = n(after.stateAdjustments);
  const stateDeduction = has(after.stateDeduction) ? after.stateDeduction : null;
  const stateInputsFor = (
    f: Federal,
    businessIncome: number,
    pteCreditAvailable: number,
    wagesNow: number,
    wagesByPerson: number[],
    pteExcluded = 0,
  ): StateInputs => ({
    w2: wagesNow,
    otherIncome: otherIncome + f.rentalDeducted,
    businessIncome,
    carriedAdjustment: stateAdjustments,
    deductionRead: stateDeduction,
    netPremiums: coverage ? Math.max(0, coverage.premiums - (f.ptc?.allowed ?? 0)) : 0,
    uninsuredMonths: uninsured,
    exemptionsRead: has(after.stateExemptions) ? after.stateExemptions : null,
    dependents,
    pteCreditAvailable,
    pteExcluded,
    wagesByPerson,
    claimedAsDependent,
  });
  /** Each person's FICA wages on the after return: the officer's Medicare wages, the other's pay from the business, and everyone's outside wages. */
  const afterWagesByPerson = wagesByPersonFor(wages, shape === "scorp" ? officerMedicare : 0, wages.employeeEntity);
  let entityCheck: EntityTax | null = null;
  /** The elective tax the entity elected into, per the returns. */
  const electing =
    shape !== "soleProp" &&
    (n(e.pteTax) > 0 ||
      n(after.statePteCreditAvailable) > 0 ||
      n(after.statePteCredit) > 0 ||
      n(after.statePteCreditRefundable) > 0);
  /** The LLC fee is on the entity's total income (Form 568 line 1), not its profit. */
  const feeBase = has(e.stateGrossIncome) ? e.stateGrossIncome : eGross;
  /** The partners' income the elective tax would be on: the state's figure when read, else the 1065's. */
  const pteBase = has(e.stateNetIncome) ? e.stateNetIncome : n(e.ordinaryIncome);
  const sharesTotal = shares.reduce((s, p) => s + p, 0);
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
          `State-source income (${
            sc.nonresident?.method === "maryland" ? `Form ${sc.nonresident.form}NR line 8, the Maryland income` : `Schedule CA (${sc.nonresident?.form}) line 10, column E`
          }) wasn't read from the after return — it's what the nonresident tax is prorated by`,
        );
      } else if (shape === "scorp" && !sc.entity) {
        reasons.push(
          `${sc.name}'s card has no S corporation rules (the entity's own tax and elective tax) — add them on the Tax Tables page`,
        );
      } else if (shape === "scorp" && !has(e.stateNetIncome) && (sc.entity?.rate ?? 0) > 0) {
        // A state that charges the corporation only a minimum (Massachusetts
        // under $6M of receipts, New Jersey) needs no net income figure.
        reasons.push(`The ${sc.name} S corporation return's net income for tax wasn't read from the 1120-S print`);
      } else if (shape === "partnership" && !sc.partnership) {
        reasons.push(
          `${sc.name}'s card has no partnership rules (what the partnership or LLC itself pays the state: an annual tax, a fee by total income) — add them on the Tax Tables page`,
        );
      } else if (shape === "partnership" && electing && !sc.entity?.pte) {
        reasons.push(`The partnership elected the pass-through entity tax, which ${sc.name}'s card has no rule for — add it on the Tax Tables page`);
      } else if (dependents > 0 && sc.exemption.kind !== "none" && sc.exemption.dependentAmount <= 0 && !has(after.stateExemptions)) {
        reasons.push(
          `The return lists ${dependents} dependent${dependents > 1 ? "s" : ""} and ${sc.name}'s card has no dependent exemption amount — add it on the Tax Tables page`,
        );
      } else {
        if (nonresident) stateSource = after.stateSourceIncome as number;
        // A state that starts from its own business line (New Jersey, with
        // its own expense rules; Massachusetts, where the line is the federal
        // figure) uses that line when read, and the federal figure when not —
        // the total-tax check below says whether that was right.
        const businessAfter = sc.base === "stateGrossIncome" && has(after.stateBusinessIncome) ? after.stateBusinessIncome : netAfter + k1After;
        const mode = creditMode(sc);

        // The entity's own state return, when there is one. The owner's
        // credit is their share of the elective tax.
        let pteAvailable = 0;
        if (shape === "scorp") {
          entityCheck = entityTax(sc, has(e.stateNetIncome) ? e.stateNetIncome : n(e.ordinaryIncome) + stateAddBack, eGross, electing);
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
        } else if (shape === "partnership") {
          entityCheck = partnershipTax(sc, feeBase, pteBase, electing);
          pteAvailable = Math.round(entityCheck.pte * sharesTotal);
          if (has(e.stateTax)) {
            mismatch(`${sc.name} partnership tax and fee`, e.stateTax, entityCheck.franchise, `a fee tier or annual tax the ${sc.name} card doesn't have`);
          }
          if (has(e.pteTax)) {
            mismatch(`${sc.name} PTE elective tax`, e.pteTax, entityCheck.pte, "a partner who didn't consent, or a rate the card doesn't have");
          }
          if (has(after.statePteCreditAvailable)) {
            mismatch(`${sc.name} PTE elective tax credit available`, after.statePteCreditAvailable, pteAvailable, "a carryover from last year, or a second electing entity");
          }
        }

        const run = (f: Federal, biz: number, pte: number) => {
          const si = stateInputsFor(f, biz, mode === "exclusion" ? 0 : pte, w2, afterWagesByPerson, mode === "exclusion" && electing ? k1After : 0);
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
        // A nonresident return prints two taxes on income: line 31's on all
        // income as if a resident, and line 37's California share of it. The
        // reader takes either (Chiu: 1,301 one read, 381 the next), and the
        // engine figures both, so either one proves the card.
        const asResident =
          has(after.stateTaxOnIncome) && sCheck.residentTax !== undefined && !off(after.stateTaxOnIncome, sCheck.residentTax);
        if (has(after.stateTaxOnIncome) && !asResident) {
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
        if (has(after.stateWageDeduction)) {
          mismatch(
            `${sc.name} Social Security / Medicare deduction`,
            after.stateWageDeduction,
            sCheck.wageDeduction,
            wages.read
              ? "retirement contributions beyond the FICA tax, or a W-2's wages read on the wrong person"
              : "a joint return whose W-2 lines (taxpayer's and spouse's) weren't read, so each person's cap can't be applied",
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
          `dependents, a credit, or an adjustment the ${sc.name} card doesn't model${
            sc.wageDeduction && !wages.read && w2 > 0 && (status === "mfj" || status === "qss")
              ? `; the per-person Social Security / Medicare deduction was figured on one person's wages because the W-2 lines (taxpayer's and spouse's) weren't read`
              : ""
          }`,
        );
      }
    }
  }
  if (reasons.length) return refuse();

  /* 4 · the model: any scenario from the before to the after */

  const writeOffs =
    shape === "scorp"
      ? Math.max(0, totalDeductions - officerComp - pension - stateAddBack)
      : shape === "partnership"
        ? Math.max(0, totalDeductions - guaranteed)
        : 0;
  const qbiRatio = k1After > 0 && qbiRead ? qbiRead.income / k1After : null;
  const paid = Math.max(0, n(after.federalPayments) - refundableRead);
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
  // A W-2 from the business carries withholding; without the pay there is
  // no W-2, so the before's payments are the estimates (and any outside
  // employer's withholding) alone. That is what the CPA's before prints
  // show. The return doesn't say how much was withheld on which W-2, so
  // the withholding is split by box 1 wages.
  const share = (total: number, part: number) => (w2 > 0 && part > 0 ? Math.round((total * part) / w2) : 0);
  const fedWithholdingRead = shape === "scorp" ? Math.min(paid, n(after.federalWithholding)) : 0;
  const stateWithholdingRead = shape === "scorp" ? Math.min(statePaid, n(after.stateWithholding)) : 0;
  const fedWithholding = { officer: share(fedWithholdingRead, wages.officerBox1), employee: share(fedWithholdingRead, wages.employeeEntity) };
  const stateWithholding = { officer: share(stateWithholdingRead, wages.officerBox1), employee: share(stateWithholdingRead, wages.employeeEntity) };

  const run = (s: Scenario): Outcome => {
    let fi: FederalInputs;
    let biz: number;
    /** Share of the write-offs switched on, 0 on the before and 1 on the after. */
    let fraction = 0;
    let k1 = 0;
    let ent: EntityTax | null = null;
    let entityNumbers: EntityNumbers | null = null;
    /** Each person's FICA wages in this scenario, and the W-2 lines as the grid shows them. */
    let wagesByPerson = afterWagesByPerson;
    let w2Lines: W2Lines | null = null;
    /** Withholding that left with the W-2s switched off. */
    let fedWithheldOff = 0;
    let stateWithheldOff = 0;
    if (shape === "soleProp") {
      const profit = gross - (s.expenses ? schCogs + expenses : 0) - (s.homeOffice ? homeOffice : 0);
      fi = { ...inputs, netProfit: profit };
      biz = profit;
      fraction = (gross - profit) / Math.max(1, gross - netAfter);
    } else if (shape === "partnership") {
      // The 1065 with its deductions switched on or off: the write-offs,
      // and the guaranteed payments (the partners' health premiums, which
      // come back as the health insurance deduction on the 1040). Each
      // partner's K-1 is their share of what's left.
      const ordinary = eGross - (s.writeOffs ? cogs + writeOffs : 0) - (s.healthInsurance ? guaranteed : 0);
      const ords = allocate(ordinary, shares);
      const ps: Partner[] = partners.map((p, k) => ({
        ...p,
        ordinary: ords[k],
        guaranteed: s.healthInsurance ? p.guaranteed : 0,
        premiums: s.healthInsurance ? p.premiums : 0,
      }));
      k1 = ps.reduce((sum, p) => sum + p.ordinary + p.guaranteed, 0);
      fraction = (eGross - ordinary) / Math.max(1, eGross - ordinaryAfter);
      const stateNet = has(e.stateNetIncome) ? ordinary + ((e.stateNetIncome as number) - ordinaryAfter) : ordinary;
      ent = stateCard?.partnership ? partnershipTax(stateCard, feeBase, stateNet, s.pte && electing) : null;
      fi = {
        ...inputs,
        partners: ps,
        sehiPaid: s.healthInsurance ? sehiPaid : null,
        // Over the threshold, Form 8995-A's QBI scales with the K-1 and the
        // partnership's W-2 wages leave with the write-offs.
        qbi: qbiRead
          ? { income: qbiRatio !== null ? Math.round(k1 * qbiRatio) : qbiRead.income, w2Wages: s.writeOffs ? qbiRead.w2Wages : 0, ubia: qbiRead.ubia }
          : null,
      };
      biz = k1;
      entityNumbers = {
        ...emptyEntityNumbers(),
        grossReceipts: eGross,
        cogs: s.writeOffs && cogs > 0 ? cogs : null,
        totalIncome: eGross - (s.writeOffs ? cogs : 0),
        wages: s.writeOffs ? e.wages : null,
        guaranteedPayments: s.healthInsurance && guaranteed > 0 ? guaranteed : null,
        taxesLicenses: s.writeOffs ? e.taxesLicenses : null,
        pension: s.writeOffs ? e.pension : null,
        employeeBenefits: s.writeOffs ? e.employeeBenefits : null,
        otherDeductions: s.writeOffs ? e.otherDeductions : null,
        totalDeductions: eGross - (s.writeOffs ? cogs : 0) - ordinary,
        ordinaryIncome: ordinary,
        k1Ordinary: ords[0] ?? null,
        k1Guaranteed: ps[0] && ps[0].guaranteed > 0 ? ps[0].guaranteed : null,
        ownershipPct: e.ownershipPct,
        k1Ordinary2: ords.length > 1 ? ords[1] : null,
        k1Guaranteed2: ps[1] && ps[1].guaranteed > 0 ? ps[1].guaranteed : null,
        ownershipPct2: e.ownershipPct2,
        distributions: e.distributions,
        stateGrossIncome: has(e.stateGrossIncome) ? feeBase : null,
        stateNetIncome: has(e.stateNetIncome) ? stateNet : null,
        stateTax: ent ? ent.franchise : null,
        pteTax: ent && ent.pte > 0 ? ent.pte : null,
        stateTotalTax: ent ? ent.franchise + (has(e.pteTax) ? ent.pte : 0) : null,
        statePayments: e.statePayments,
        stateAmountDue: ent ? Math.max(0, ent.franchise + (has(e.pteTax) ? ent.pte : 0) - n(e.statePayments)) : null,
        stateRefund: ent ? Math.max(0, n(e.statePayments) - ent.franchise - (has(e.pteTax) ? ent.pte : 0)) || null : null,
      };
    } else {
      const ordinary =
        eGross -
        (s.writeOffs ? cogs + writeOffs : 0) -
        (s.salary ? officerComp : 0) -
        (s.retirement ? pension : 0) -
        (s.pte ? stateAddBack : 0);
      // The K-1's section 179 deduction goes with the write-offs: box 1
      // stays gross of it, Schedule E nets it.
      const k1Gross = Math.round(ordinary * ownershipPct);
      k1 = k1Gross - (s.writeOffs ? section179 : 0);
      fraction = (eGross - ordinary) / Math.max(1, eGross - ordinaryAfter);
      const comp = s.salary ? officerComp : 0;
      const hi = s.salary ? healthInsurance : 0;
      const box1 = Math.max(0, comp - (s.salary && s.retirement ? deferral : 0));
      // Wages the business paid anyone else sit inside the write-offs: off
      // with them, the W-2 income goes too. Other employers' wages stay.
      const employee = s.writeOffs ? wages.employeeEntity : 0;
      wagesByPerson = wagesByPersonFor(wages, Math.max(0, comp - hi), employee);
      w2Lines = wages.read ? w2LinesFor(wages, box1, employee) : null;
      fedWithheldOff = (s.salary ? 0 : fedWithholding.officer) + (s.writeOffs ? 0 : fedWithholding.employee);
      stateWithheldOff = (s.salary ? 0 : stateWithholding.officer) + (s.writeOffs ? 0 : stateWithholding.employee);
      const stateNet = ordinary + (s.pte ? stateAddBack : 0);
      ent = stateCard?.entity ? entityTax(stateCard, stateNet, eGross, s.pte && electing) : null;
      fi = {
        ...inputs,
        scorp: k1,
        w2: box1 + employee + outsideWages,
        medicareWages: Math.max(0, comp - hi) + employee + outsideWages,
        scorpMedicareWages: Math.max(0, comp - hi),
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
        k1Ordinary: k1Gross,
        k1Section179: s.writeOffs && section179 > 0 ? section179 : null,
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
    // A real estate professional's rentals are nonpassive only with the
    // status switched on; off, the losses go through Form 8582's allowance.
    // What the client saved into a SEP, an IRA or an HSA, and a sole
    // proprietor's health insurance deduction: things DeCypher set up or
    // caught, so off on the before (the tax team's call, 2026-10-05).
    if (!s.retirement) fi = { ...fi, sep: 0, carried: Math.max(0, fi.carried - ira - hsa) };
    if (shape === "soleProp" && !s.healthInsurance) fi = { ...fi, sehiPaid: null };
    // Without the rental expenses every property nets its rents: profits
    // are the rents and there are no losses (earlier years' suspended
    // losses still come off on Form 8582).
    if (rental) {
      const r = s.rentalExpenses ? rental : { ...rental, profits: rental.rents, losses: 0 };
      fi = { ...fi, rental: { ...r, reps: rental.reps && s.reps } };
    }
    // Without the dependents: no child tax credit, no child-care credit, and
    // no qualifying person for head of household.
    const runStatus = s.noKids ? statusWithoutDependents(status) : status;
    if (s.noKids) fi = { ...fi, children: 0, others: 0, childCareCredit: 0 };
    const f = federal(fed, runStatus, fi);
    let st: State | null = null;
    const pteShare = ent ? Math.round(ent.pte * (shape === "partnership" ? sharesTotal : ownershipPct)) : 0;
    if (stateCard) {
      const stateBiz = biz + Math.round(stateBizDelta * Math.min(1, Math.max(0, fraction)));
      let si = stateInputsFor(
        f,
        stateBiz,
        mode === "exclusion" ? 0 : pteShare,
        fi.w2,
        wagesByPerson,
        mode === "exclusion" && s.pte && electing ? k1 : 0,
      );
      // A state that doesn't allow the HSA deduction adds it back
      // (California's Schedule CA): with the HSA off, so is the add-back.
      if (!s.retirement && hsa > 0 && stateAdjustments > 0) {
        si = { ...si, carriedAdjustment: si.carriedAdjustment - Math.min(hsa, stateAdjustments) };
      }
      if (s.noKids) {
        // The state's dependent exemptions go; an exemption deduction carried
        // as read loses the dependents' share; and a state deduction that was
        // just the standard deduction for the status (California's head of
        // household amount) becomes the single one.
        const ex = stateCard.exemption;
        const dd = stateCard.deduction;
        si = {
          ...si,
          dependents: 0,
          exemptionsRead:
            si.exemptionsRead !== null && ex.kind === "deduction"
              ? Math.max(0, si.exemptionsRead - dependents * ex.dependentAmount)
              : si.exemptionsRead,
          deductionRead:
            si.deductionRead !== null && dd.kind === "standard" && si.deductionRead === dd.amount[status]
              ? null
              : si.deductionRead,
        };
      }
      st = stateSource !== null ? nonresidentState(stateCard, runStatus, f, si, stateSource) : state(stateCard, runStatus, f, si);
    }
    const numbers = fillNumbers(
      after,
      f,
      st,
      fi,
      shape,
      stateCard,
      stateSource,
      uninsured,
      paid - fedWithheldOff,
      statePaid - stateWithheldOff,
      gross,
      s,
      pteShare,
      {
        federal: shape === "scorp" ? Math.max(0, n(after.federalWithholding) - fedWithheldOff) : null,
        state: shape === "scorp" ? Math.max(0, n(after.stateWithholding) - stateWithheldOff) : null,
      },
      w2Lines,
    );
    const total = totalTaxesOf(numbers, entityNumbers);
    return { fed: f, st, entity: ent, numbers, entityNumbers, total };
  };

  const afterRun = run(ALL_ON);
  if (entityCheck && afterRun.entity && off(afterRun.entity.franchise, entityCheck.franchise)) {
    // The scenario rebuilds the entity's state income from the federal
    // return; it has to land where the state return printed it or the
    // waterfall is off.
    reasons.push(
      `The ${stateCard?.name} net income rebuilt from the ${entityName} (${fmt(afterRun.entity.netIncome)}) isn't what the state return prints (${fmt(entityCheck.netIncome)}) — a state adjustment beyond the taxes added back`,
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
        wages,
        section179,
        pension,
        stateAddBack,
        ownershipPct,
        coverage,
        carried,
        stateSource,
        uninsured,
        uninsuredNote,
        w2Note: shape === "soleProp" && w2 > 0,
        fedWithholding: fedWithholding.officer + fedWithholding.employee,
        stateWithholding: stateWithholding.officer + stateWithholding.employee,
        schCogs,
        otherPayments,
        preferential,
        qbiCarryforward,
        stateAdjustments,
        seTaxNote: implied.seTaxNote,
        guaranteedPayments: guaranteed,
        partnerPremiums,
        rental,
        seWagesNote,
        nomineeNote,
        k1Note,
        s179Note,
        itemized,
        stateDeduction,
        dependents: Math.max(dependents, children + others),
        childCareCredit,
        sep,
        ira,
        hsa,
        claimedAsDependent,
      },
    },
  };
}

/** Each person's FICA wages: the officer's Medicare wages, the other's pay from the business, and everyone's outside wages. */
function wagesByPersonFor(w: Wages, officerMedicare: number, employeeEntity: number): [number, number] {
  const out: [number, number] = [w.outside[0], w.outside[1]];
  out[w.officer] += officerMedicare;
  out[1 - w.officer] += employeeEntity;
  return out;
}

/** The W-2 lines of a scenario as the review grid shows them. */
function w2LinesFor(w: Wages, officerBox1: number, employeeEntity: number): W2Lines {
  const entity: [number, number] = [0, 0];
  entity[w.officer] = officerBox1;
  entity[1 - w.officer] = employeeEntity;
  return {
    taxpayer: w.outside[0] + entity[0],
    spouse: w.outside[1] + entity[1],
    taxpayerEntity: entity[0],
    spouseEntity: entity[1],
  };
}

/**
 * How many qualifying children and other dependents the credit on line 19
 * implies. Schedule 8812's own counts (lines 4 and 6) are taken when read
 * and they reproduce the line; otherwise the credit is a known function of
 * the two counts, and the mix that reproduces it is taken — the one that
 * matches the dependents listed, then the one with the fewest "other"
 * dependents. Null when no mix does.
 */
function inferDependents(card: FederalCard, status: FilingStatus, after: ReturnNumbers): { children: number; others: number } | null {
  const read = n(after.childTaxCredit);
  const kidsRead = has(after.qualifyingChildren) ? Math.max(0, Math.round(after.qualifyingChildren)) : null;
  const othersRead = has(after.otherDependents) ? Math.max(0, Math.round(after.otherDependents)) : null;
  if (read <= 0) return { children: kidsRead ?? 0, others: othersRead ?? 0 };
  const agi = n(after.agi);
  const limit = Math.max(0, n(after.incomeTax) + n(after.additionalTaxes) - n(after.nonrefundableCredits));
  const fits = (k: number, o: number) => !off(Math.min(childTaxCredit(card, status, agi, k, o), limit), read);
  if ((kidsRead ?? 0) + (othersRead ?? 0) > 0 && fits(kidsRead ?? 0, othersRead ?? 0)) {
    return { children: kidsRead ?? 0, others: othersRead ?? 0 };
  }
  const listed = Math.max(0, Math.round(n(after.dependentCount)));
  const lexLess = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };
  let best: { k: number; o: number; score: number[] } | null = null;
  for (let k = 0; k <= 10; k++) {
    for (let o = 0; o <= 10; o++) {
      if (k + o === 0 || !fits(k, o)) continue;
      const score = [listed > 0 && k + o === listed ? 0 : 1, o, k + o];
      if (!best || lexLess(score, best.score)) best = { k, o, score };
    }
  }
  return best ? { children: best.k, others: best.o } : null;
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
  /** What's still withheld once the W-2s switched off took theirs; null means the after's own figure. */
  withholding: { federal: number | null; state: number | null },
  /** The W-2 lines of this scenario, when the return's were read; null carries the after's. */
  w2Lines: W2Lines | null,
): ReturnNumbers {
  const mode = creditMode(stateCard);
  const out = emptyNumbers();
  out.w2Income = fi.w2 > 0 ? fi.w2 : shape === "scorp" ? null : after.w2Income;
  const orNull = (v: number) => (v > 0 ? v : null);
  out.w2Taxpayer = w2Lines ? orNull(w2Lines.taxpayer) : after.w2Taxpayer;
  out.w2Spouse = w2Lines ? orNull(w2Lines.spouse) : after.w2Spouse;
  out.w2TaxpayerEntity = w2Lines ? orNull(w2Lines.taxpayerEntity) : after.w2TaxpayerEntity;
  out.w2SpouseEntity = w2Lines ? orNull(w2Lines.spouseEntity) : after.w2SpouseEntity;
  out.dependentOfAnother = after.dependentOfAnother;
  out.qualifyingChildren = s.noKids ? null : after.qualifyingChildren;
  out.otherDependents = s.noKids ? null : after.otherDependents;
  out.businessNetIncome = shape === "soleProp" ? fi.netProfit : null;
  out.scorpIncome = shape === "scorp" ? fi.scorp : null;
  out.partnershipIncome = shape === "partnership" ? fi.partners.reduce((s, p) => s + p.ordinary + p.guaranteed, 0) : null;
  if (fi.rental) {
    out.rentalIncome = b.rentalDeducted;
    // On the after these are the lines as read; with the rental expenses
    // zeroed every property nets its rents.
    out.rentalProfits = s.rentalExpenses ? after.rentalProfits : fi.rental.profits > 0 ? fi.rental.profits : null;
    out.rentalLosses = s.rentalExpenses ? after.rentalLosses : null;
    out.rentalRents = fi.rental.rents > 0 ? fi.rental.rents : null;
    out.rentalExpenses = s.rentalExpenses && fi.rental.expenses > 0 ? fi.rental.expenses : null;
    out.passivePriorUnallowed = after.passivePriorUnallowed;
    out.rentalReps = fi.rental.reps ? (has(after.rentalReps) ? after.rentalReps : fi.rental.profits - fi.rental.losses) : null;
  }
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
  // Line 23 is the SE tax, the additional Medicare tax and the NIIT.
  const line23 = b.seTax + b.additionalMedicare + b.niit;
  out.otherTaxes = line23 > 0 ? line23 : has(after.otherTaxes) ? 0 : null;
  // Line 32 as printed carries line 31 inside it; `paid` already has line
  // 31 in it, since only the credits were taken out of the payments.
  const otherPayments = n(after.otherPayments);
  out.otherPayments = after.otherPayments;
  out.federalRefundableCredits = b.refundable + otherPayments > 0 ? b.refundable + otherPayments : null;
  // Line 33 is withholding and estimates plus the refundable credits; the
  // money actually sent in stays the same, the credit is the run's own.
  out.federalPayments = paid + b.refundable;
  out.federalWithholding = withholding.federal !== null ? orNull(withholding.federal) : after.federalWithholding;
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
    out.cogs = s.expenses ? after.cogs : null;
    out.totalExpenses = s.expenses ? after.totalExpenses : null;
    out.schCWages = s.expenses ? after.schCWages : null;
    out.schCDepreciation = s.expenses ? after.schCDepreciation : null;
    out.homeOffice = s.homeOffice ? after.homeOffice : null;
  }
  out.qualifiedDividends = after.qualifiedDividends;
  out.capitalGain = after.capitalGain;
  out.capitalGainLongTerm = after.capitalGainLongTerm;
  out.qbiLossCarryforward = fi.qbi ? null : after.qbiLossCarryforward;
  out.sepDeduction = fi.sep > 0 ? fi.sep : null;
  out.iraDeduction = s.retirement ? after.iraDeduction : null;
  out.hsaDeduction = s.retirement ? after.hsaDeduction : null;
  // Schedule A travels with the return; the before's total is re-figured
  // at its income, and the standard deduction wins when it's larger.
  if (fi.itemized) {
    out.itemizedDeductions = b.itemizedTotal;
    out.saltPaid = after.saltPaid;
    out.saltDeducted = b.saltDeducted;
    out.medicalExpenses = after.medicalExpenses;
  }
  out.sehiDeduction = b.sehi > 0 ? b.sehi : null;
  out.sehiPaid = fi.sehiPaid;
  out.medicareWages = shape === "scorp" && fi.scorpMedicareWages > 0 ? fi.scorpMedicareWages : null;
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
    out.stateAdjustments = after.stateAdjustments;
    out.stateDeduction = after.stateDeduction;
    out.stateBusinessIncome = has(after.stateBusinessIncome)
      ? shape === "soleProp"
        ? fi.netProfit
        : shape === "partnership"
          ? out.partnershipIncome
          : fi.scorp
      : null;
    out.stateExemptions = after.stateExemptions;
    out.stateMedical = stateCard.medical ? sBefore.medical : null;
    out.stateWageDeduction = stateCard.wageDeduction || has(after.stateWageDeduction) ? orNull(sBefore.wageDeduction) : null;
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
    out.stateWithholding = withholding.state !== null ? orNull(withholding.state) : after.stateWithholding;
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

/**
 * Lines the reader returned that the return itself rules out, set aside
 * before anything is computed. Reading a printed number is the easy part;
 * knowing which line it belongs to is the judgement a fast read sometimes
 * gets wrong, and each of these changed a result:
 *
 *  - Form 8995-A's QBI, wages and property exist only above the threshold.
 *    Below it the return files Form 8995, whose "qualified business income"
 *    is a different line; taken as an 8995-A input it froze the before's
 *    QBI at the after's (Inha: $72,396, the before $2,949 too high).
 *  - Line 31 is inside line 32, so it can't be more than line 32 (Inha:
 *    the $9,600 of estimated payments read as line 31, line 32 blank).
 */
function screenReads(
  after: ReturnNumbers,
  meta: DeriveMeta,
  tables: TableSet,
): { after: ReturnNumbers; notes: string[] } {
  const notes: string[] = [];
  let out = after;
  const card = meta.taxYear ? cardFor(meta.taxYear, tables) : null;
  const status = parseFilingStatus(meta.filingStatus);
  const formA = has(after.qbiIncome) || has(after.qbiW2Wages) || has(after.qbiUbia);
  if (card && status && formA && has(after.taxableIncome)) {
    const beforeQbi = after.taxableIncome + n(after.qbiDeduction);
    const threshold = card.federal.qbi.threshold[status];
    if (beforeQbi <= threshold) {
      out = { ...out, qbiIncome: null, qbiW2Wages: null, qbiUbia: null };
      notes.push(
        `Form 8995-A lines read off the return${has(after.qbiIncome) ? ` (qualified business income ${fmt(after.qbiIncome)})` : ""} set aside: taxable income before the QBI deduction (${fmt(beforeQbi)}) is under the ${meta.taxYear} threshold of ${fmt(threshold)}, so the return figures QBI on Form 8995 and so does the engine`,
      );
    }
  }
  if (has(after.otherPayments) && after.otherPayments > n(after.federalRefundableCredits) + 1) {
    out = { ...out, otherPayments: null };
    notes.push(
      `Line 31 read as ${fmt(after.otherPayments)} with line 32 at ${fmt(n(after.federalRefundableCredits))} — line 32 includes line 31, so that read is set aside`,
    );
  }
  // Schedule E line 41 (both parts' total) taken for line 26 (rentals only):
  // on a partner's return with no rental properties it repeats the K-1
  // income exactly, with none of the rental lines behind it (Singh).
  const k1Total = n(after.scorpIncome) + n(after.partnershipIncome);
  if (
    has(after.rentalIncome) &&
    k1Total > 0 &&
    Math.abs(after.rentalIncome - k1Total) <= 1 &&
    !has(after.rentalProfits) &&
    !has(after.rentalLosses) &&
    !n(after.rentalReps) &&
    !n(after.passivePriorUnallowed)
  ) {
    out = { ...out, rentalIncome: null };
    notes.push(
      `Rental real estate income read as ${fmt(after.rentalIncome)}, which is the K-1 income again (Schedule E's total, line 41) with no rental properties behind it — left out`,
    );
  }
  // The standard deduction on line 12 taken for a Schedule A total (Chiu: no
  // Schedule A, $15,750 read as itemized): none of Schedule A's own lines
  // came with it, and it's exactly the standard deduction.
  if (
    card &&
    status &&
    has(after.itemizedDeductions) &&
    after.itemizedDeductions === card.federal.standardDeduction[status] &&
    !has(after.saltPaid) &&
    !has(after.saltDeducted) &&
    !n(after.medicalExpenses)
  ) {
    out = { ...out, itemizedDeductions: null };
    notes.push(
      `Itemized deductions read as ${fmt(after.itemizedDeductions)}, which is the standard deduction, with no Schedule A lines behind it — taken as the standard deduction`,
    );
  }
  return { after: out, notes };
}

const OPTIONAL_FIELDS = new Set<string>(
  RETURN_FIELDS.filter((f) => "optional" in f && f.optional).map((f) => f.key),
);

/**
 * Build the model, and when the after return doesn't reproduce, try once
 * more without the optional lines the reader returned that aren't printed
 * anywhere on the return (`meta.unverified`). A number the page doesn't
 * carry is the reader's own arithmetic — Chiu's "state adjustments" of
 * −$36,602 were worked out from the nonresident column — and if the return
 * reproduces to the dollar without it, it was wrong. Nothing is dropped
 * unless dropping it makes the check pass.
 */
function buildChecked(
  afterRead: ReturnNumbers,
  meta: DeriveMeta,
  tables: TableSet,
  entity: EntityNumbers | null,
): { built: ModelResult; after: ReturnNumbers; notes: string[] } {
  const screened = screenReads(afterRead, meta, tables);
  const notes = [...screened.notes];
  const first = buildModel(screened.after, meta, tables, entity);
  if (first.ok) return { built: first, after: screened.after, notes };
  const suspects = (meta.unverified ?? []).filter(
    (k): k is ReturnFieldKey => OPTIONAL_FIELDS.has(k) && has(screened.after[k as ReturnFieldKey]),
  );
  if (!suspects.length) return { built: first, after: screened.after, notes };
  const without: ReturnNumbers = { ...screened.after };
  for (const k of suspects) without[k] = null;
  const retry = buildModel(without, meta, tables, entity);
  if (!retry.ok) return { built: first, after: screened.after, notes };
  notes.push(
    `${suspects.map((k) => `${label(k)} (${fmt(n(screened.after[k]))})`).join(", ")} set aside: not printed anywhere on the return, and the after return reproduces to the dollar without ${suspects.length > 1 ? "them" : "it"}`,
  );
  return { built: retry, after: without, notes };
}

export function deriveBefore(
  afterRead: ReturnNumbers,
  meta: DeriveMeta,
  tables: TableSet = mergeTables({}),
  entity: EntityNumbers | null = null,
): DeriveResult {
  const { built, after, notes: screenNotes } = buildChecked(afterRead, meta, tables, entity);
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
  /** Notes the before's own figuring adds, ahead of the reviewer notes below. */
  const earlyNotes: string[] = [];
  if ((m.shape === "soleProp" || m.shape === "partnership") && b.fed.taxableBeforeQbi > qbiThreshold && !has(after.qbiIncome)) {
    // Over the threshold the deduction is capped by the business's W-2
    // wages and depreciable property. A business paying no wages has a
    // wage limit of zero, which the engine can figure; wages mean Form
    // 8995-A inputs it doesn't have. Depreciation on the Schedule C means
    // some qualified property — the limit is 2.5% of its unadjusted basis,
    // a few dollars of deduction for a camera or a laptop — so it's noted
    // rather than refused.
    const wagesPaid = m.shape === "soleProp" ? n(after.schCWages) : n(entity?.wages);
    const depreciation = m.shape === "soleProp" ? n(after.schCDepreciation) : 0;
    const where = m.shape === "soleProp" ? "Schedule C" : "the 1065";
    if (wagesPaid > 0) {
      return {
        ok: false,
        reasons: [
          `Taxable income before the QBI deduction would be ${fmt(b.fed.taxableBeforeQbi)}, over the ${year} ${statusLabel} threshold of ${fmt(qbiThreshold)}: the deduction phases out there against the ${fmt(wagesPaid)} of W-2 wages ${where} pays and property the engine doesn't have`,
        ],
        mismatches: [],
      };
    }
    earlyNotes.push(
      `Taxable income before the QBI deduction on the before (${fmt(b.fed.taxableBeforeQbi)}) is over the ${year} ${statusLabel} threshold (${fmt(qbiThreshold)}); ${where} pays no wages, so the W-2 wage limit is zero and the deduction is ${fmt(b.fed.qbi)}${b.fed.qbi > 0 ? " inside the phase-in range" : ""}.${
        depreciation > 0
          ? ` Schedule C claims ${fmt(depreciation)} of depreciation, so there is some qualified property: 2.5% of its basis would add a little to the before's deduction (a few dollars of tax), which isn't modeled`
          : " Section 179 property from an earlier year would add 2.5% of its basis"
      }`,
    );
    // Rentals counted as QBI are limited the same way, and a rental always
    // has property: 2.5% of the buildings' original cost (UBIA), which no
    // line of the return prints. Say how much is at stake rather than guess.
    const r = facts.rental;
    if (r?.qbi && b.fed.rentalDeducted > 0) {
      const most = Math.round(b.fed.rentalDeducted * fed.qbi.rate);
      earlyNotes.push(
        `The rentals' ${fmt(b.fed.rentalDeducted)} on the before is qualified business income too. Over the threshold its deduction is capped at 2.5% of the properties' original cost (UBIA), which isn't printed on the return, so it's taken as $0 here. With enough property cost it could be up to ${fmt(most)}, about ${fmt(Math.round(most * 0.35))} less tax on the before. ProSeries' zero-write-off print shows it on Form 8995-A`,
      );
    }
  }
  // A state that phases its itemized deductions down on income (California)
  // isn't modeled; the before's AGI has to stay under the threshold.
  if (
    stateCard &&
    facts.stateDeduction !== null &&
    stateCard.deduction.kind === "standard" &&
    facts.stateDeduction > stateCard.deduction.amount[m.status] &&
    stateCard.exemption.phaseOut &&
    b.fed.agi > stateCard.exemption.phaseOut.threshold[m.status]
  ) {
    return {
      ok: false,
      reasons: [
        `${stateCard.name}'s itemized deductions phase down above ${fmt(stateCard.exemption.phaseOut.threshold[m.status])} of federal AGI, which the before's ${fmt(b.fed.agi)} crosses — not modeled`,
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
  const rentalBit = facts.rental
    ? `, the rentals' ${fmt(facts.rental.expenses)} of expenses zeroed${facts.rental.reps ? " and the rentals treated as passive" : ""}`
    : "";
  if (m.shape === "soleProp") {
    notes.push(
      `Derived from the after return: Schedule C expenses (${fmt(facts.expenses)})${facts.schCogs > 0 ? `, cost of goods sold (${fmt(facts.schCogs)})` : ""} and home office (${fmt(facts.homeOffice)}) set to zero${rentalBit} and the ${year} federal${stateName ? ` and ${stateName}` : ""} tables re-run (engine v${DERIVE_VERSION})`,
    );
  } else if (m.shape === "partnership") {
    notes.push(
      `Derived from the two after returns: every deduction on the 1065 set to zero — ${facts.cogs > 0 ? `cost of goods sold (${fmt(facts.cogs)}), ` : ""}write-offs (${fmt(facts.writeOffs)}) and the ${fmt(facts.guaranteedPayments)} of guaranteed payments${facts.partnerPremiums > 0 ? " (the partners' health premiums)" : ""} — so the K-1s are the gross receipts${rentalBit}; the ${year} federal${stateName ? `, ${stateName} and ${stateName} partnership` : ""} tables re-run (engine v${DERIVE_VERSION})`,
    );
  } else {
    const w = facts.wages;
    const other = w.officer === 0 ? "spouse" : "taxpayer";
    const outside = w.outside[0] + w.outside[1];
    notes.push(
      `Derived from the two after returns: every deduction on the 1120-S set to zero — cost of goods sold (${fmt(facts.cogs)}), write-offs (${fmt(facts.writeOffs)}${w.employeeEntity > 0 ? `, including the ${fmt(w.employeeEntity)} of wages the corporation paid the ${other}, whose W-2 goes with them` : ""})${facts.section179 > 0 ? `, the ${fmt(facts.section179)} section 179 deduction on the K-1` : ""}, the owner's ${fmt(facts.officerComp)} of pay, the ${fmt(facts.pension)} retirement plan, the ${fmt(facts.stateAddBack)} of state taxes — so the K-1 is the gross receipts, with no PTE election${rentalBit}${outside > 0 ? `; the ${fmt(outside)} of W-2 wages from another employer stay as they are` : ""}; the ${year} federal${stateName ? `, ${stateName} and ${stateName} S corporation` : ""} tables re-run (engine v${DERIVE_VERSION})`,
    );
  }
  if (facts.s179Note) notes.push(facts.s179Note);
  if (facts.claimedAsDependent) {
    notes.push(
      `Someone else claims the filer (line 12a), so the standard deduction on both sides is the dependent's: earned income plus ${fmt(fed.dependentStandardDeduction.earnedPlus)}, at least ${fmt(fed.dependentStandardDeduction.minimum)} and at most the regular ${fmt(fed.standardDeduction[m.status])} — ${fmt(b.fed.deduction)} on the before`,
    );
  }
  notes.push(
    `Check passed: the same tables reproduce the after return's ${m.shape === "scorp" ? "" : "SE tax, "}${facts.rental ? "rental loss allowed, " : ""}QBI, ${facts.itemized ? "itemized deductions, " : ""}income tax${facts.coverage ? ", premium tax credit" : ""}${n(after.childTaxCredit) > 0 ? ", child tax credit" : ""} and federal total${stateName ? ` and ${stateName} tax` : ""}${m.shape !== "soleProp" && stateName ? `, and the ${m.shape === "scorp" ? "corporation" : "partnership"}'s ${stateName} tax` : ""} to the dollar`,
  );
  notes.push(...screenNotes);
  notes.push(...earlyNotes);
  if (facts.k1Note) notes.push(facts.k1Note);
  if (facts.nomineeNote) notes.push(facts.nomineeNote);
  if (facts.seWagesNote) notes.push(facts.seWagesNote);
  if (m.shape === "partnership" && facts.partnerPremiums > 0) {
    notes.push(
      `Health insurance through the partnership: ${fmt(facts.partnerPremiums)} of premiums paid as guaranteed payments and deducted again as the self-employed health insurance deduction; the before has no guaranteed payments, so the deduction (${fmt(m.after.fed.sehi)}) drops off`,
    );
  }
  if (facts.rental) {
    // The tax team's convention (2026-10-02): rental costs are write-offs
    // found, zeroed on the before like the Schedule C's.
    const r = facts.rental;
    const afterNet = m.after.fed.rentalDeducted;
    notes.push(
      `Rentals: ${fmt(r.rents)} of rents and ${fmt(r.expenses)} of expenses (Schedule E lines 23a and 23e, depreciation included), ${afterNet < 0 ? `a ${fmt(-afterNet)} loss deducted on the after${r.reps ? " in full by a real estate professional" : " after Form 8582"}` : `${fmt(afterNet)} taxed on the after`}. The before zeroes the expenses like the Schedule C's, so each property nets its rents${r.reps ? " and, with no real estate professional status, the rentals are passive" : ""}: ${fmt(b.fed.rentalDeducted)} taxed on the before${r.prior > 0 ? `, after ${fmt(r.prior)} of earlier years' suspended losses (Form 8582) come off` : ""}`,
    );
    if (!r.qbi) notes.push("The rentals aren't counted as qualified business income, as the after return's Form 8995 shows");
  }
  if (facts.itemized) {
    notes.push(
      `Schedule A: ${fmt(facts.itemized.total)} on the after return. Re-figured at the before's income, the state and local taxes deducted are ${fmt(b.fed.saltDeducted)} (the cap phases down over $500,000 of modified AGI) and the total is ${fmt(b.fed.itemizedTotal)}, ${b.fed.itemizes ? "still more than" : "less than"} the ${fmt(fed.standardDeduction[m.status])} standard deduction, so the before ${b.fed.itemizes ? "itemizes" : "takes the standard deduction"}`,
    );
  }
  if (stateCard && facts.stateDeduction !== null && stateCard.deduction.kind === "standard" && facts.stateDeduction > stateCard.deduction.amount[m.status]) {
    notes.push(`${stateCard.name} itemized deductions (${fmt(facts.stateDeduction)}) carried over unchanged — the state keeps the property tax and mortgage interest without the federal cap`);
  }
  // The tax team's call (2026-10-05): retirement and HSA contributions and a
  // sole proprietor's health insurance deduction are DeCypher's to claim.
  {
    const off: string[] = [];
    if (facts.sep > 0) off.push(`the ${fmt(facts.sep)} SEP or solo 401(k) deduction`);
    if (facts.ira > 0) off.push(`the ${fmt(facts.ira)} IRA deduction`);
    if (facts.hsa > 0) off.push(`the ${fmt(facts.hsa)} HSA deduction`);
    if (m.shape === "soleProp" && m.after.fed.sehi > 0) off.push(`the ${fmt(m.after.fed.sehi)} self-employed health insurance deduction`);
    if (off.length) {
      notes.push(
        `Not claimed on the before, as contributions and deductions DeCypher set up or caught: ${off.join(", ")}${
          facts.hsa > 0 && facts.stateAdjustments > 0 && stateCard
            ? `. ${stateCard.name}'s add-back of the HSA goes with it (${fmt(Math.min(facts.hsa, facts.stateAdjustments))} of its +${fmt(facts.stateAdjustments)} adjustment)`
            : ""
        }`,
      );
    }
  }
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
    if (b.fed.sehi !== m.after.fed.sehi && m.shape !== "soleProp") {
      notes.push(`SE health insurance deduction ${fmt(m.after.fed.sehi)} → ${fmt(b.fed.sehi)} (${m.shape === "scorp" ? "no wages to run the premiums through" : "capped by the business's profit"})`);
    }
  }
  if (m.shape === "scorp" && n(after.childCareCredit) > 0) {
    notes.push(`The ${fmt(n(after.childCareCredit))} child and dependent care credit needs earned income, which the before has none of, so it drops off`);
  }
  if (n(after.childTaxCredit) > 0 && b.fed.childTaxCredit !== m.after.fed.childTaxCredit) {
    notes.push(`Child tax credit ${fmt(m.after.fed.childTaxCredit)} → ${fmt(b.fed.childTaxCredit)} as it phases out on the higher income`);
  }
  {
    // What's left of the "other" adjustments once the IRA and HSA come out:
    // student loan interest, educator expenses and the like stay as filed.
    const kept = Math.max(0, facts.carried - facts.ira - facts.hsa);
    if (kept > 0) {
      notes.push(
        `Other adjustments to income (${fmt(kept)}: student loan interest, educator expenses or similar) carried over unchanged, as a before print keeps them${
          facts.ira + facts.hsa === 0 ? ". If any of it is an IRA or HSA deduction, read Schedule 1 lines 20 and 13 so the before can leave it off" : ""
        }`,
      );
    }
  }
  if (facts.seTaxNote) notes.push(facts.seTaxNote);
  if (facts.otherPayments > 0) {
    notes.push(
      `${fmt(facts.otherPayments)} on line 31 (paid with an extension, or excess Social Security withheld) is a payment, not a credit: it stays in the before's payments and out of its Federal Taxes`,
    );
  }
  if (facts.preferential > 0) {
    notes.push(
      `Qualified dividends and long-term gains (${fmt(facts.preferential)}) taxed by the Qualified Dividends and Capital Gain Tax Worksheet on both sides, and taken out of taxable income for the QBI limit`,
    );
  }
  if (facts.qbiCarryforward > 0) {
    notes.push(`The prior year's QBI loss carryforward (${fmt(facts.qbiCarryforward)}, Form 8995 line 3) comes off the business's QBI on both sides`);
  }
  if (stateCard && facts.stateAdjustments !== 0) {
    notes.push(
      `${stateCard.name} adjustments to federal AGI (${facts.stateAdjustments > 0 ? "+" : "−"}${fmt(Math.abs(facts.stateAdjustments))}: Schedule CA columns B and C — an HSA contribution, a state refund or similar) carried over unchanged`,
    );
  }
  if (stateCard && facts.stateSource !== null) {
    notes.push(
      stateCard.nonresident?.method === "maryland"
        ? `${stateCard.name} nonresident (Form ${stateCard.nonresident.form} with ${stateCard.nonresident.form}NR): the deduction and exemptions scaled by the ${stateCard.name} share of federal AGI, the resident tax on all income scaled by the share of taxable income that is ${stateCard.name}'s, plus the ${Math.round((stateCard.nonresident.specialRate ?? 0) * 10000) / 100}% special nonresident tax — ${fmt(facts.stateSource)} of ${stateCard.name}-source income on both sides (${fmt(b.st?.tax ?? 0)} + ${fmt(b.st?.nonresidentTax ?? 0)} on the before)`
        : `${stateCard.name} part-year/nonresident (Form ${stateCard.nonresident?.form}): tax figured as a resident on all income, then prorated by the ${stateCard.name}-source share — ${fmt(facts.stateSource)} of ${fmt(b.fed.totalIncome)} on the before`,
    );
  }
  if (stateCard && b.st && stateCard.sharedResponsibility && b.st.sharedResponsibility > 0) {
    notes.push(
      `${stateCard.name} shared responsibility payment for ${facts.uninsured} uninsured months: ${fmt(b.st.sharedResponsibility)} on the before (${fmt(n(after.stateSharedResponsibility))} on the after), counted in State Taxes as the recap does`,
    );
  }
  if (facts.uninsuredNote) notes.push(facts.uninsuredNote);
  if (m.shape === "scorp" && (facts.fedWithholding > 0 || facts.stateWithholding > 0)) {
    const w = facts.wages;
    const outside = w.outside[0] + w.outside[1];
    notes.push(
      `The withholding on the W-2s from the corporation (${[
        facts.fedWithholding > 0 ? `${fmt(facts.fedWithholding)} federal` : "",
        facts.stateWithholding > 0 ? `${fmt(facts.stateWithholding)} state` : "",
      ]
        .filter(Boolean)
        .join(", ")}${w.employeeEntity > 0 ? ", split between the two W-2s by their wages" : ""}) leaves with the pay, so the before's payments are the estimates${outside > 0 ? " and the other employer's withholding" : ""} alone`,
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
    if (!facts.seWagesNote) {
      notes.push(
        `W-2 wages (${fmt(n(after.w2Income))}) counted against the Social Security wage base as box 1; check Schedule SE if box 3 differs`,
      );
    }
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
  afterRead: ReturnNumbers,
  meta: DeriveMeta,
  tables: TableSet = mergeTables({}),
  entity: EntityNumbers | null = null,
): RecapAnalysis | null {
  const { built, after } = buildChecked(afterRead, meta, tables, entity);
  if (!built.ok) return null;
  const m = built.model;
  const { facts } = m;
  const stateName = m.card.state?.name ?? "state";

  /** A note can quote the total the step started from — what the year would have cost without it. */
  type Step = { key: keyof Scenario; label: string; note: string | ((previousTotal: number) => string); skip: boolean };
  const rental = facts.rental;
  const repsStep: Step = {
    key: "reps",
    label: "Real estate professional status",
    note: (previous) =>
      `The rentals' ${fmt(rental?.losses ?? 0)} of losses deducted in full as nonpassive instead of suspended under the passive loss rules. Without it, this year's total would have been ${fmt(previous)}`,
    skip: !rental?.reps,
  };
  // The rental expenses come before real estate professional status: the
  // status only matters once the properties show a loss.
  const rentalStep: Step = {
    key: "rentalExpenses",
    label: "Bookkeeping: rental expenses",
    note: `${fmt(rental?.expenses ?? 0)} of rental property expenses (mortgage interest, depreciation, repairs, taxes) deducted on Schedule E against ${fmt(rental?.rents ?? 0)} of rents`,
    skip: !rental || rental.expenses <= 0,
  };
  // What the client saved into a SEP, an IRA or an HSA (Schedule 1 lines
  // 16, 20, 13), and a sole proprietor's health insurance deduction.
  const personal = [
    facts.sep > 0 ? `${fmt(facts.sep)} into a SEP or solo 401(k)` : "",
    facts.ira > 0 ? `${fmt(facts.ira)} into an IRA` : "",
    facts.hsa > 0 ? `${fmt(facts.hsa)} into an HSA` : "",
  ].filter(Boolean);
  const personalTotal = facts.sep + facts.ira + facts.hsa;
  const retirementLabel =
    facts.hsa > 0 && facts.sep + facts.ira > 0 ? "Retirement and HSA contributions" : facts.hsa > 0 ? "HSA contributions" : "Retirement contributions";
  const retirementStep: Step = {
    key: "retirement",
    label: retirementLabel,
    note: `${personal.join(", ")}, deducted on Schedule 1`,
    skip: personalTotal <= 0,
  };
  const healthStep: Step = {
    key: "healthInsurance",
    label: "Self-employed health insurance",
    note: `${fmt(m.after.fed.sehi)} of health insurance premiums deducted on Schedule 1 (Form 7206)`,
    skip: m.after.fed.sehi <= 0,
  };
  const steps: Step[] =
    m.shape === "soleProp"
      ? [
          {
            key: "expenses",
            label: "Bookkeeping: business write-offs",
            note: `${fmt(facts.expenses + facts.schCogs)} of Schedule C expenses found and deducted${facts.schCogs > 0 ? ` (${fmt(facts.schCogs)} of it as cost of goods sold)` : ""}`,
            skip: facts.expenses + facts.schCogs <= 0,
          },
          {
            key: "homeOffice",
            label: "Home office",
            note: `${fmt(facts.homeOffice)} for the business use of the home (Form 8829)`,
            skip: facts.homeOffice <= 0,
          },
          rentalStep,
          retirementStep,
          healthStep,
          repsStep,
        ]
      : m.shape === "partnership"
        ? [
            {
              key: "writeOffs",
              label: "Bookkeeping: business write-offs",
              note: `${fmt(facts.cogs + facts.writeOffs)} deducted on the 1065${facts.cogs > 0 ? ` (${fmt(facts.cogs)} of it cost of goods sold)` : ""}, before the partners' guaranteed payments`,
              skip: facts.cogs + facts.writeOffs <= 0,
            },
            {
              key: "healthInsurance",
              label: facts.partnerPremiums > 0 ? "Health insurance through the partnership" : "Guaranteed payments to the partners",
              note:
                facts.partnerPremiums > 0
                  ? `${fmt(facts.guaranteedPayments)} of premiums paid by the partnership as guaranteed payments and deducted on the 1040 as self-employed health insurance`
                  : `${fmt(facts.guaranteedPayments)} of guaranteed payments deducted by the partnership`,
              skip: facts.guaranteedPayments <= 0,
            },
            retirementStep,
            rentalStep,
            repsStep,
          ]
        : [
          {
            key: "writeOffs",
            label: "Bookkeeping: business write-offs",
            note: `${fmt(facts.cogs + facts.writeOffs + facts.section179)} deducted on the 1120-S${facts.cogs > 0 ? ` (${fmt(facts.cogs)} of it cost of goods sold)` : ""}${
              facts.section179 > 0 ? ` and the K-1 (${fmt(facts.section179)} of section 179)` : ""
            }${
              facts.wages.employeeEntity > 0
                ? `, including ${fmt(facts.wages.employeeEntity)} of wages paid to the ${facts.wages.officer === 0 ? "spouse" : "taxpayer"}, which come back as W-2 income`
                : ""
            }, before the owner's pay, the retirement plan and state taxes`,
            skip: facts.cogs + facts.writeOffs + facts.section179 <= 0,
          },
          {
            key: "salary",
            label: "Owner salary through the S corporation",
            note: `${fmt(facts.officerComp)} of officer pay${facts.healthInsurance > 0 ? ` (${fmt(facts.healthInsurance)} of it health insurance, deducted again on the 1040)` : ""}: the W-2 wages that unlock the QBI deduction${n(after.childCareCredit) > 0 ? " and the child-care credit" : ""}`,
            skip: facts.officerComp <= 0,
          },
          {
            key: "retirement",
            label: personalTotal > 0 ? "Solo 401(k) and other retirement contributions" : "Solo 401(k)",
            note: `${fmt(facts.deferral)} deferred from the owner's wages and ${fmt(facts.pension)} contributed by the corporation${personal.length ? `; ${personal.join(", ")} on Schedule 1` : ""}`,
            skip: facts.deferral + facts.pension + personalTotal <= 0,
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
          rentalStep,
          repsStep,
        ];

  // The before doesn't claim the dependents (the team's call, 2026-10-05):
  // the walk starts without them and they come back as its first step,
  // worth what they are at the before's income, so every strategy after
  // them keeps the value it had.
  const kids = kidsValue(m);
  const kidsFirst = kids.value?.inBefore ?? null;
  const scenario: Scenario = { ...ALL_OFF, noKids: kidsFirst !== null };
  let previous = m.run(scenario).total;
  const attribution: RecapAnalysis["attribution"] = [];
  if (kids.value && kidsFirst) {
    scenario.noKids = false;
    const now = m.run(scenario).total;
    attribution.push({ key: "kids", label: kidsLabel(kids.value.dependents), savings: previous - now, note: kidsFirst.note });
    previous = now;
  }
  const threshold = m.card.federal.qbi.threshold[m.status];
  let overThreshold = false;
  for (const step of steps) {
    if (step.skip) continue;
    scenario[step.key] = true;
    const run = m.run(scenario);
    const now = run.total;
    if (run.fed.taxableBeforeQbi > threshold && !has(after.qbiIncome)) overThreshold = true;
    attribution.push({
      key: step.key === "healthInsurance" && facts.partnerPremiums <= 0 ? "guaranteedPayments" : step.key,
      label: step.label,
      savings: previous - now,
      note: typeof step.note === "function" ? step.note(previous) : step.note,
    });
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
  if (overThreshold) {
    notes.push(
      `At some steps taxable income before the QBI deduction is over the ${fmt(threshold)} threshold, where the deduction phases down against W-2 wages and property the business has none of (or a little, if the Schedule C claims depreciation), so those steps use a limit of zero`,
    );
  }

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

  if (kids.note) notes.push(kids.note);

  return { version: DERIVE_VERSION, attribution, scorpSavings, kids: kids.value, notes };
}

/** The kids' line in the strategy split. */
const kidsLabel = (count: number) =>
  count === 1 ? "Claiming your dependent" : count > 1 ? `Claiming your ${count} dependents` : "Claiming your dependents";

/**
 * What the dependents are worth: the before and the after each re-run
 * without them, everything else as filed. The recap's before is the one
 * without them (`inBefore`, the before side's share added to its federal
 * and state rows) and they're the first step of the strategy split. Null
 * when the return has none, when they change nothing at this income, or
 * when the return has a premium tax credit that depends on household size
 * (the poverty line for a smaller household isn't on the tables).
 */
function kidsValue(m: Model): { value: RecapAnalysis["kids"]; note: string | null } {
  const { facts } = m;
  const count = facts.dependents;
  const headOfHousehold = statusWithoutDependents(m.status) !== m.status;
  if (count <= 0 && facts.childCareCredit <= 0) return { value: null, note: null };
  const sides = [ALL_OFF, ALL_ON].map((s) => ({ with: m.run(s), without: m.run({ ...s, noKids: true }) }));
  const capAt = m.card.federal.ptc.capAt;
  if (sides.some(({ with: w }) => w.fed.ptc && (w.fed.ptc.allowed > 0 || w.fed.ptc.pct < capAt))) {
    return {
      value: null,
      note: "What the dependents are worth isn't shown: the premium tax credit on Form 8962 is figured on household size, and the poverty line for a smaller household isn't on the tables",
    };
  }
  const [before, after] = sides.map(({ with: w, without }) => without.total - w.total);
  if (before <= 0 && after <= 0) {
    return {
      value: null,
      note: `The ${count === 1 ? "dependent" : `${count} dependents`} on the return don't change the tax at this income: the child tax credit has phased out${headOfHousehold ? "" : " and there's no filing status riding on them"}`,
    };
  }
  // The pieces on one side: the two credits, what head of household is
  // worth federally, and the state's share.
  const stateTax = (x: Outcome) => (x.st ? x.st.netTax : 0);
  const stateName = m.card.state?.name ?? "State";
  const pieces = ({ with: w, without: wo }: (typeof sides)[number], worth: number) => {
    const ctc = w.fed.childTaxCredit - wo.fed.childTaxCredit;
    const care = w.fed.credits - wo.fed.credits;
    const stateDiff = stateTax(wo) - stateTax(w);
    const filing = worth - stateDiff - ctc - care;
    const parts: string[] = [];
    if (ctc > 0) parts.push(`Child tax credit ${fmt(ctc)}`);
    if (care > 0) parts.push(`Child and dependent care credit ${fmt(care)}`);
    if (headOfHousehold && filing > 0) parts.push(`Head of household instead of single ${fmt(filing)}`);
    else if (filing > 0) parts.push(`Other federal ${fmt(filing)}`);
    if (stateDiff > 0) parts.push(`${stateName} tax ${fmt(stateDiff)}`);
    return parts.join(" · ");
  };
  // The before's share by the recap's own rows, so the before column can
  // carry it: federal (net of refundable credits) and state.
  const row = (x: Outcome) => sideSummary(x.numbers, x.entityNumbers);
  const bw = row(sides[0].with);
  const bwo = row(sides[0].without);
  const federal = bwo.federalTaxes - bw.federalTaxes;
  return {
    value: {
      dependents: count,
      before: Math.max(0, before),
      after: Math.max(0, after),
      note: pieces(sides[1], after),
      inBefore: before > 0 ? { federal, state: before - federal, note: pieces(sides[0], before) } : null,
    },
    note: null,
  };
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
