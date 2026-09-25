/**
 * The yearly tax tables — every figure and rule the derivation engine uses.
 *
 * One card per tax year: the federal figures plus one card per state. A
 * state card is DATA that describes the state's rules as choices (where its
 * income starts, whether it allows the SE deduction, whether the exemption
 * is a credit or a deduction, how its tax table rounds) alongside its
 * numbers (brackets, deductions, credits). derive.ts interprets the choices;
 * nothing state-specific lives in code. That is what lets the Tax Tables
 * page in the portal add or correct a state without a deploy.
 *
 * Two sources, merged by `mergeTables`: the seeds below (what ships, checked
 * against real returns — see the notes on each) and Firestore overrides
 * written by the Tax Tables page (lib/tax-recap/tables-store.ts). A stored
 * year replaces the seed for that year wholesale.
 *
 * No card is trusted on its own. derive.ts uses a card on a return only
 * after reproducing that return's own tax with it to the dollar, so a
 * mistyped bracket refuses rather than miscomputes; the Tax Tables page
 * runs the same proof against every saved recap that has a real before.
 *
 * Isomorphic on purpose — no server-only imports — because the builder
 * derives and the settings page validates in the browser.
 */

import { STATES_2025 } from "./seeds-2025-states";

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh" | "qss";

export const FILING_STATUSES: FilingStatus[] = ["single", "mfj", "mfs", "hoh", "qss"];

export const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  single: "single",
  mfj: "married filing jointly",
  mfs: "married filing separately",
  hoh: "head of household",
  qss: "qualifying surviving spouse",
};

export const FILING_STATUS_SHORT: Record<FilingStatus, string> = {
  single: "Single",
  mfj: "Joint",
  mfs: "Separate",
  hoh: "HOH",
  qss: "Surviving",
};

export type ByStatus<T> = Record<FilingStatus, T>;

/**
 * One row of a progressive schedule: income above the previous row's `upTo`
 * and up to this row's `upTo` is taxed at `rate`. The last row's `upTo` is
 * null ("and over") — null rather than Infinity so the card survives JSON.
 */
export type Bracket = { upTo: number | null; rate: number };

/**
 * How a printed tax table rounds below its cut-off. "midpoint": rows start
 * on multiples of `row` and are priced at the middle (the IRS table: $50
 * rows, 45,300–45,350 priced at 45,325). "centred": rows straddle the
 * multiples and are priced at them (the FTB table: 66,651–66,750 priced at
 * 66,700).
 */
export type TaxTableRule = { below: number; row: number; rounding: "midpoint" | "centred" };

export type FederalCard = {
  brackets: ByStatus<Bracket[]>;
  standardDeduction: ByStatus<number>;
  taxTable: TaxTableRule | null;
  selfEmployment: {
    /** Schedule SE line 4a: net profit × this is net earnings. */
    netEarningsFactor: number;
    socialSecurityRate: number;
    medicareRate: number;
    /** Combined W-2 + SE earnings subject to the Social Security portion. */
    wageBase: number;
  };
  /** Form 8959: 0.9% on wages + SE earnings over the threshold. */
  additionalMedicare: { rate: number; threshold: ByStatus<number> };
  /**
   * Form 8995 / 8995-A: 20% of the smaller of qualified business income or
   * taxable income before the deduction. Above `threshold` the W-2 wage and
   * property limits phase in over `phaseInRange` (Form 8995-A Part III), and
   * past the range the deduction is capped at the greater of `wageLimit` ×
   * W-2 wages and `wageAndPropertyLimit` (wages × 25% + property × 2.5%).
   */
  qbi: {
    rate: number;
    threshold: ByStatus<number>;
    phaseInRange: ByStatus<number>;
    wageLimit: number;
    wageAndPropertyLimit: { wages: number; property: number };
  };
  /**
   * Form 1040 line 19: the nonrefundable child tax credit. `perChild` for
   * each qualifying child, shrinking by `phaseOutPer` for every
   * `phaseOutStep` (or part) of AGI over the threshold.
   */
  childTaxCredit: {
    perChild: number;
    phaseOutThreshold: ByStatus<number>;
    phaseOutPer: number;
    phaseOutStep: number;
  };
  /** Form 8960: the rate on the smaller of net investment income and AGI over the threshold. */
  netInvestmentIncomeTax: { rate: number; threshold: ByStatus<number> };
  /**
   * Form 8962, the premium tax credit. `applicableFigure` is the share of
   * household income the family is expected to pay, by household income as
   * a percentage of the poverty line: within each row the figure runs
   * linearly from `start` at `from`% to `end` at `to`%; below the first row
   * it is 0, at or above `capAt` it is `capFigure`. `repaymentLimit` caps
   * how much excess advance credit is paid back, by the same percentage
   * (rows apply below `below`%; none above the last row).
   */
  ptc: {
    applicableFigure: { from: number; to: number; start: number; end: number }[];
    capAt: number;
    capFigure: number;
    repaymentLimit: { below: number; single: number; other: number }[];
  };
};

export type PhaseOut = { threshold: ByStatus<number>; step: ByStatus<number>; reduce: number };

export type StateCard = {
  name: string;
  /** false for Texas, Florida, … — the card exists so the list is complete. */
  incomeTax: boolean;
  /** The resident form. A different form on the return (540NR) is refused. */
  form: string;
  /**
   * Where the state's taxable income starts. "stateGrossIncome" is the New
   * Jersey way: the state's own business profit line plus wages, with none
   * of the federal adjustments.
   */
  base: "federalAgi" | "federalTaxableIncome" | "stateGrossIncome";
  /** States that disallow the federal SE-tax deduction (New Jersey, Pennsylvania) add it back. */
  addBackSeDeduction: boolean;
  /** For a federal-taxable-income base: states decoupled from §199A add the QBI deduction back. */
  addBackQbi: boolean;
  deduction:
    | { kind: "standard"; amount: ByStatus<number> }
    | { kind: "federal" }
    | { kind: "none" };
  exemption: {
    /** "credit" comes off the tax (California); "deduction" comes off income (New Jersey). */
    kind: "none" | "credit" | "deduction";
    amount: number;
    count: ByStatus<number>;
    /** The same kind of exemption for each dependent (California's $475 credit). 0 when the state has none. */
    dependentAmount: number;
    /**
     * Shrinks by `reduce` per `step` (or part) of federal AGI over the
     * threshold, per exemption — each exemption floors at zero on its own.
     */
    phaseOut: PhaseOut | null;
  };
  /**
   * What the state charges an S corporation itself, on the entity's return.
   * Null means the engine can't derive a return for an S corporation in
   * this state.
   */
  entity: EntityRules | null;
  /**
   * Whether the card has reproduced a real client return to the dollar.
   * Every seed starts false except the ones checked against the sample
   * pairings; the Tax Tables page flips it once a client of that state has
   * gone through cleanly. Never trusted on its own — the engine still proves
   * a card on each return before using it.
   */
  proven: boolean;
  /** Where the figures came from and what the card doesn't model, for the person editing it. */
  note: string;
  brackets: ByStatus<Bracket[]>;
  taxTable: TaxTableRule | null;
  /** A surtax on taxable income above a floor (California's Mental Health Services Tax). */
  surtax: { rate: number; above: number } | null;
  /** A city tax on the same taxable income (New York City). */
  local: { name: string; brackets: ByStatus<Bracket[]> } | null;
  /**
   * The state's nonresident / part-year form, if the state prorates the way
   * California does: tax figured as a resident on all income, then scaled by
   * the state-source share of AGI, with the exemption credit scaled the same
   * way. Null means a nonresident return is refused.
   */
  nonresident: { form: string } | null;
  /**
   * A medical-expense deduction the New Jersey way: health premiums the
   * client actually paid (marketplace premiums less the credit allowed)
   * above `floorRate` of gross income, plus the self-employed health
   * insurance deduction in full when `seHealthInsuranceFull`.
   */
  medical: { floorRate: number; seHealthInsuranceFull: boolean } | null;
  /**
   * A state health-coverage penalty (New Jersey's shared responsibility
   * payment): the greater of `rate` × income over `threshold` and
   * `flatAdult` per adult, prorated by the months without coverage. It is
   * part of the state's total tax on the recap.
   */
  sharedResponsibility: { rate: number; threshold: ByStatus<number>; flatAdult: number } | null;
};

/**
 * A state's rules for the S corporation's own return.
 *
 *  - `rate` on the state's net income (California's 1.5%); 0 where the
 *    state charges only a minimum (New Jersey, New York).
 *  - `minimum`: the floor. One row is a flat minimum (California's $800);
 *    several are tiers by the corporation's gross receipts (New Jersey's
 *    $375 to $1,500) — the first row whose `below` the receipts are under
 *    applies, and the last row's `below` is null ("and over").
 *  - `pte`: the elective pass-through entity tax, graduated on the entity's
 *    income (one bracket = a flat rate: California's 9.3%), and how it comes
 *    back to the shareholder: a nonrefundable credit limited to their tax
 *    (California, FTB 3804-CR), a refundable credit in the payments section
 *    (New Jersey's BAIT, New York), or an exclusion of the income from the
 *    shareholder's state return instead of a credit (Georgia). Null where
 *    the state has no such tax.
 */
export type EntityRules = {
  form: string;
  rate: number;
  minimum: { below: number | null; amount: number }[];
  pte: { brackets: Bracket[]; credit: "nonrefundable" | "refundable" | "exclusion" } | null;
};

export type YearCard = { federal: FederalCard; states: Record<string, StateCard> };

/* ──────────────────────────────── the states ──────────────────────────────── */

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** States with no tax on wages or business income. */
const NO_INCOME_TAX = ["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"];

const same = <T,>(v: T): ByStatus<T> => ({ single: v, mfj: v, mfs: v, hoh: v, qss: v });
const b = (rows: [number | null, number][]): Bracket[] => rows.map(([upTo, rate]) => ({ upTo, rate }));

/** A state card for a state with no income tax. */
export function noIncomeTaxCard(code: string): StateCard {
  return {
    name: US_STATES[code] ?? code,
    incomeTax: false,
    form: "",
    base: "federalAgi",
    addBackSeDeduction: false,
    addBackQbi: false,
    deduction: { kind: "none" },
    exemption: { kind: "none", amount: 0, count: same(0), dependentAmount: 0, phaseOut: null },
    brackets: same(b([[null, 0]])),
    taxTable: null,
    surtax: null,
    local: null,
    nonresident: null,
    medical: null,
    sharedResponsibility: null,
    entity: null,
    proven: true,
    note: "No tax on wages or business income.",
  };
}

/** A blank card for a state being added on the Tax Tables page. */
export function blankStateCard(code: string): StateCard {
  return {
    ...noIncomeTaxCard(code),
    incomeTax: true,
    form: "",
    deduction: { kind: "standard", amount: same(0) },
    exemption: {
      kind: "none",
      amount: 0,
      count: { single: 1, mfs: 1, hoh: 1, mfj: 2, qss: 2 },
      dependentAmount: 0,
      phaseOut: null,
    },
    brackets: same(b([[null, 0.05]])),
    proven: false,
    note: "",
  };
}

/* ─────────────────────────────────── 2025 ─────────────────────────────────── */

/**
 * Federal: Rev. Proc. 2024-40 for the brackets and thresholds; the 2025 Act
 * (OBBBA) for the standard deduction, which is what the 2025 Form 1040
 * prints in its margin ($15,750 / $31,500 / $23,625). Wage base: SSA 2025.
 * Checked on Voloshchakevych's before and after returns to the dollar.
 */
const FEDERAL_2025: FederalCard = {
  brackets: {
    single: b([[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [626350, 0.35], [null, 0.37]]),
    mfj: b([[23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24], [501050, 0.32], [751600, 0.35], [null, 0.37]]),
    qss: b([[23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24], [501050, 0.32], [751600, 0.35], [null, 0.37]]),
    mfs: b([[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [375800, 0.35], [null, 0.37]]),
    hoh: b([[17000, 0.10], [64850, 0.12], [103350, 0.22], [197300, 0.24], [250500, 0.32], [626350, 0.35], [null, 0.37]]),
  },
  standardDeduction: { single: 15750, mfj: 31500, qss: 31500, mfs: 15750, hoh: 23625 },
  taxTable: { below: 100000, row: 50, rounding: "midpoint" },
  selfEmployment: {
    netEarningsFactor: 0.9235,
    socialSecurityRate: 0.124,
    medicareRate: 0.029,
    wageBase: 176100,
  },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, hoh: 200000, qss: 200000, mfj: 250000, mfs: 125000 },
  },
  // Form 8995-A (2025): the $50,000 / $100,000 phase-in range printed on
  // Part III, and the 50% / 25% + 2.5% limits of Part II. Checked on
  // Wilson's returns: $386,732 of QBI against $63,116 of W-2 wages gives the
  // printed $31,558.
  qbi: {
    rate: 0.2,
    threshold: { single: 197300, mfs: 197300, hoh: 197300, mfj: 394600, qss: 394600 },
    phaseInRange: { single: 50000, mfs: 50000, hoh: 50000, mfj: 100000, qss: 100000 },
    wageLimit: 0.5,
    wageAndPropertyLimit: { wages: 0.25, property: 0.025 },
  },
  // The 2025 Act's $2,200 credit; $50 off per $1,000 (or part) of AGI over
  // $200,000 ($400,000 joint), Schedule 8812.
  childTaxCredit: {
    perChild: 2200,
    phaseOutThreshold: { single: 200000, mfs: 200000, hoh: 200000, mfj: 400000, qss: 400000 },
    phaseOutPer: 50,
    phaseOutStep: 1000,
  },
  netInvestmentIncomeTax: {
    rate: 0.038,
    threshold: { single: 200000, hoh: 200000, mfs: 125000, mfj: 250000, qss: 250000 },
  },
  /**
   * Form 8962 for 2025 (the enhanced schedule that runs through 2025) and
   * the 2025 repayment caps from the instructions. Checked on Mahony's
   * returns: 209% of the poverty line on the after (figure 0.0236, credit
   * $1,914 against $948 advanced), 401% on the before (0.0850, no credit,
   * the $948 repaid in full).
   */
  ptc: {
    applicableFigure: [
      { from: 150, to: 200, start: 0, end: 0.02 },
      { from: 200, to: 250, start: 0.02, end: 0.04 },
      { from: 250, to: 300, start: 0.04, end: 0.06 },
      { from: 300, to: 400, start: 0.06, end: 0.085 },
    ],
    capAt: 400,
    capFigure: 0.085,
    repaymentLimit: [
      { below: 200, single: 375, other: 750 },
      { below: 300, single: 975, other: 1950 },
      { below: 400, single: 1625, other: 3250 },
    ],
  },
};

/**
 * California, Form 540: the FTB's "2025 California Tax Rate Schedules"
 * (Schedules X, Y, Z as printed) and the 2025 Form 540 for the standard
 * deduction ($5,706 / $11,412), the $153 exemption credit and the AGI
 * thresholds on line 32. Checked on Voloshchakevych's returns to the dollar.
 */
const CALIFORNIA_2025: StateCard = {
  name: "California",
  incomeTax: true,
  form: "540",
  base: "federalAgi",
  addBackSeDeduction: false,
  addBackQbi: false,
  deduction: { kind: "standard", amount: { single: 5706, mfs: 5706, mfj: 11412, hoh: 11412, qss: 11412 } },
  // The $475 dependent credit phases out the same way, each credit on its
  // own: Wilson's $153 + $475 come out as $0 + $145 at $515,124 of AGI.
  exemption: {
    kind: "credit",
    amount: 153,
    count: { single: 1, mfs: 1, hoh: 1, mfj: 2, qss: 2 },
    dependentAmount: 475,
    phaseOut: {
      threshold: { single: 252203, mfs: 252203, hoh: 378310, mfj: 504411, qss: 504411 },
      step: { single: 2500, mfs: 1250, hoh: 2500, mfj: 2500, qss: 2500 },
      reduce: 6,
    },
  },
  brackets: {
    single: b([[11079, 0.01], [26264, 0.02], [41452, 0.04], [57542, 0.06], [72724, 0.08], [371479, 0.093], [445771, 0.103], [742953, 0.113], [null, 0.123]]),
    mfs: b([[11079, 0.01], [26264, 0.02], [41452, 0.04], [57542, 0.06], [72724, 0.08], [371479, 0.093], [445771, 0.103], [742953, 0.113], [null, 0.123]]),
    mfj: b([[22158, 0.01], [52528, 0.02], [82904, 0.04], [115084, 0.06], [145448, 0.08], [742958, 0.093], [891542, 0.103], [1485906, 0.113], [null, 0.123]]),
    qss: b([[22158, 0.01], [52528, 0.02], [82904, 0.04], [115084, 0.06], [145448, 0.08], [742958, 0.093], [891542, 0.103], [1485906, 0.113], [null, 0.123]]),
    hoh: b([[22173, 0.01], [52530, 0.02], [67716, 0.04], [83805, 0.06], [98990, 0.08], [505208, 0.093], [606251, 0.103], [1010417, 0.113], [null, 0.123]]),
  },
  taxTable: { below: 100000, row: 100, rounding: "centred" },
  surtax: { rate: 0.01, above: 1000000 },
  local: null,
  // Checked on Chiu's 540NR (Texas resident, California-source income): both
  // the before (848) and the after (336) reproduce to the dollar.
  nonresident: { form: "540NR" },
  medical: null,
  sharedResponsibility: null,
  // Form 100S: 1.5% of net income, $800 minimum franchise tax; the elective
  // pass-through entity tax at 9.3% (Form 3804), credited on the 540 via
  // FTB 3804-CR, nonrefundable with a carryover. Checked on LaLaNation89's
  // returns: $511,924 → $7,679 and $47,609; the zero-write-offs print's
  // $836,958 → $12,554.
  entity: {
    form: "100S",
    rate: 0.015,
    minimum: [{ below: null, amount: 800 }],
    pte: { brackets: b([[null, 0.093]]), credit: "nonrefundable" },
  },
  proven: true,
  note: "2025 FTB rate schedules and Form 540. Proven on three client returns (a 540, a 540NR, and an S corporation with Form 100S and the PTE election).",
};

/**
 * New Jersey, Form NJ-1040. Rates are statutory and unindexed. Gross income
 * is the state's own business profit (NJ allows meals in full, so it can
 * differ from Schedule C) with no federal adjustments; the $1,000 personal
 * exemption is a deduction; health premiums actually paid count as medical
 * expenses above 2% of gross income and the SE health insurance deduction
 * counts in full; the tax table under $100,000 prices $50 rows at the
 * midpoint; the shared responsibility payment is the greater of 2.5% of
 * income over the filing threshold and $695 per adult, prorated by
 * uninsured months. Checked on Mahony's returns: after $500 tax + $348
 * payment, before $2,230 + $749. Not modeled yet: the property-tax
 * deduction from rent (neither print used it), senior/blind/veteran
 * exemptions, the bronze-plan cap on the payment.
 */
const NEW_JERSEY_2025: StateCard = {
  name: "New Jersey",
  incomeTax: true,
  form: "NJ-1040",
  base: "stateGrossIncome",
  addBackSeDeduction: true,
  addBackQbi: false,
  deduction: { kind: "none" },
  exemption: {
    kind: "deduction",
    amount: 1000,
    count: { single: 1, mfs: 1, hoh: 1, mfj: 2, qss: 2 },
    dependentAmount: 1500,
    phaseOut: null,
  },
  brackets: {
    single: b([[20000, 0.014], [35000, 0.0175], [40000, 0.035], [75000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [null, 0.1075]]),
    mfs: b([[20000, 0.014], [35000, 0.0175], [40000, 0.035], [75000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [null, 0.1075]]),
    mfj: b([[20000, 0.014], [50000, 0.0175], [70000, 0.0245], [80000, 0.035], [150000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [null, 0.1075]]),
    hoh: b([[20000, 0.014], [50000, 0.0175], [70000, 0.0245], [80000, 0.035], [150000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [null, 0.1075]]),
    qss: b([[20000, 0.014], [50000, 0.0175], [70000, 0.0245], [80000, 0.035], [150000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [null, 0.1075]]),
  },
  taxTable: { below: 100000, row: 50, rounding: "midpoint" },
  surtax: null,
  local: null,
  nonresident: null,
  medical: { floorRate: 0.02, seHealthInsuranceFull: true },
  sharedResponsibility: {
    rate: 0.025,
    threshold: { single: 10000, mfs: 10000, hoh: 20000, mfj: 20000, qss: 20000 },
    flatAdult: 695,
  },
  // CBT-100S: a New Jersey S corporation pays only the minimum tax, tiered
  // by its New Jersey gross receipts (Division of Taxation, Corporation
  // Business Tax overview); income not subject to federal corporate tax
  // carries no state tax. The elective Business Alternative Income Tax
  // (P.L. 2021, c.419, tax years 2022 on) is graduated on the entity's
  // distributive proceeds and comes back to the shareholder as a
  // REFUNDABLE credit on the NJ-1040 (Division of Taxation, BAIT page).
  // Statutory figures, NOT yet proven against a real NJ S corporation
  // pairing — the engine refuses if a return's own tax doesn't reproduce.
  entity: {
    form: "CBT-100S",
    rate: 0,
    minimum: [
      { below: 100000, amount: 375 },
      { below: 250000, amount: 562.5 },
      { below: 500000, amount: 750 },
      { below: 1000000, amount: 1125 },
      { below: null, amount: 1500 },
    ],
    pte: {
      // Three brackets for 2022 on (the 9.12% tier was dropped): 5.675% to
      // $250,000, 6.52% to $1,000,000, 10.9% over — nj.gov/treasury/taxation/baitpte.
      brackets: b([[250000, 0.05675], [1000000, 0.0652], [null, 0.109]]),
      credit: "refundable",
    },
  },
  proven: true,
  note: "NJ-1040 proven on a sole proprietor with marketplace coverage. The S corporation side (CBT-100S minimum tax tiers, BAIT schedule, refundable credit on line 63) is the Division of Taxation's published figures and not yet proven on a client. Not modeled: the property-tax deduction, senior/blind/veteran exemptions, the bronze-plan cap on the shared responsibility payment.",
};

/* ─────────────────────────────────── seeds ─────────────────────────────────── */

const SEEDS: Record<number, YearCard> = {
  2025: {
    federal: FEDERAL_2025,
    states: {
      // Every other state, from its 2025 published figures, unproven until
      // a client of that state runs through (seeds-2025-states.ts).
      ...STATES_2025,
      CA: CALIFORNIA_2025,
      NJ: NEW_JERSEY_2025,
      ...Object.fromEntries(NO_INCOME_TAX.map((code) => [code, noIncomeTaxCard(code)])),
    },
  },
};

export const SEED_YEARS = Object.keys(SEEDS).map(Number).sort();

export function seedFor(taxYear: number): YearCard | null {
  return SEEDS[taxYear] ?? null;
}

export type TableSet = Record<number, YearCard>;

/** Seeds with any stored year laid over them. */
export function mergeTables(stored: TableSet): TableSet {
  return { ...SEEDS, ...stored };
}

export function cardFor(taxYear: number, tables: TableSet = SEEDS): YearCard | null {
  return tables[taxYear] ?? null;
}

/* ─────────────────────────────── sanitise + validate ─────────────────────────────── */

const num = (v: unknown): number => {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return typeof v === "boolean" || v === null || v === undefined || v === "" ? NaN : x;
};
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : num(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

function byStatus<T>(raw: unknown, each: (v: unknown) => T): ByStatus<T> {
  const r = obj(raw);
  return Object.fromEntries(FILING_STATUSES.map((s) => [s, each(r[s])])) as ByStatus<T>;
}

function brackets(raw: unknown): Bracket[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((row) => {
    const r = obj(row);
    return { upTo: numOrNull(r.upTo), rate: num(r.rate) };
  });
}

function taxTable(raw: unknown): TaxTableRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = obj(raw);
  return {
    below: num(r.below),
    row: num(r.row),
    rounding: r.rounding === "centred" ? "centred" : "midpoint",
  };
}

function phaseOut(raw: unknown): PhaseOut | null {
  if (!raw || typeof raw !== "object") return null;
  const r = obj(raw);
  return { threshold: byStatus(r.threshold, num), step: byStatus(r.step, num), reduce: num(r.reduce) };
}

/**
 * A number, or the fallback when the stored card predates the field. Cards
 * saved before a rule was added come back without it; the seed's value (or
 * a zero) stands in rather than a NaN that fails validation and stops every
 * recap of that year.
 */
const numOr = (v: unknown, fallback: number): number => (v === undefined ? fallback : num(v));

/**
 * Narrow one state's card. `fallback` is the seed's card for the same state
 * and year, if any, used for fields a stored card doesn't have yet.
 */
export function sanitizeStateCard(raw: unknown, code: string, fallback?: StateCard | null): StateCard {
  const r = obj(raw);
  const ded = obj(r.deduction);
  const ex = obj(r.exemption);
  const local = obj(r.local);
  const surtax = obj(r.surtax);
  const nonresident = obj(r.nonresident);
  const medical = obj(r.medical);
  const srp = obj(r.sharedResponsibility);
  const entity = obj(r.entity);
  return {
    name: str(r.name, 40) || US_STATES[code] || code,
    incomeTax: r.incomeTax !== false,
    form: str(r.form, 20),
    base:
      r.base === "federalTaxableIncome"
        ? "federalTaxableIncome"
        : r.base === "stateGrossIncome"
          ? "stateGrossIncome"
          : "federalAgi",
    addBackSeDeduction: r.addBackSeDeduction === true,
    addBackQbi: r.addBackQbi === true,
    deduction:
      ded.kind === "federal"
        ? { kind: "federal" }
        : ded.kind === "none"
          ? { kind: "none" }
          : { kind: "standard", amount: byStatus(ded.amount, num) },
    exemption: {
      kind: ex.kind === "credit" ? "credit" : ex.kind === "deduction" ? "deduction" : "none",
      amount: num(ex.amount),
      count: byStatus(ex.count, num),
      dependentAmount: numOr(ex.dependentAmount, fallback?.exemption.dependentAmount ?? 0),
      phaseOut: phaseOut(ex.phaseOut),
    },
    brackets: byStatus(r.brackets, brackets),
    taxTable: taxTable(r.taxTable),
    surtax: r.surtax && typeof r.surtax === "object" ? { rate: num(surtax.rate), above: num(surtax.above) } : null,
    local:
      r.local && typeof r.local === "object"
        ? { name: str(local.name, 40), brackets: byStatus(local.brackets, brackets) }
        : null,
    nonresident:
      r.nonresident && typeof r.nonresident === "object" && str(nonresident.form, 20)
        ? { form: str(nonresident.form, 20) }
        : null,
    medical:
      r.medical && typeof r.medical === "object"
        ? { floorRate: num(medical.floorRate), seHealthInsuranceFull: medical.seHealthInsuranceFull !== false }
        : null,
    sharedResponsibility:
      r.sharedResponsibility && typeof r.sharedResponsibility === "object"
        ? { rate: num(srp.rate), threshold: byStatus(srp.threshold, num), flatAdult: num(srp.flatAdult) }
        : null,
    entity:
      r.entity === undefined
        ? (fallback?.entity ?? null)
        : r.entity && typeof r.entity === "object"
          ? entityRules(entity)
          : null,
    proven: typeof r.proven === "boolean" ? r.proven : (fallback?.proven ?? false),
    note: r.note === undefined ? (fallback?.note ?? "") : str(r.note, 1200),
  };
}

/**
 * Narrow the S corporation rules. A card saved with the first shape (a flat
 * `minimum` and a flat `pteRate`) is read as one minimum row and one PTE
 * bracket with a nonrefundable credit — what that shape meant.
 */
function entityRules(e: Record<string, unknown>): EntityRules {
  const minimum = Array.isArray(e.minimum)
    ? e.minimum.slice(0, 12).map((row) => {
        const r = obj(row);
        return { below: numOrNull(r.below), amount: num(r.amount) };
      })
    : [{ below: null, amount: numOr(e.minimum, 0) }];
  let pte: EntityRules["pte"] = null;
  if (e.pte && typeof e.pte === "object") {
    const p = obj(e.pte);
    pte = {
      brackets: brackets(p.brackets),
      credit: p.credit === "refundable" ? "refundable" : p.credit === "exclusion" ? "exclusion" : "nonrefundable",
    };
  } else if (e.pte === undefined && num(e.pteRate) > 0) {
    pte = { brackets: [{ upTo: null, rate: num(e.pteRate) }], credit: "nonrefundable" };
  }
  return { form: str(e.form, 20), rate: num(e.rate), minimum, pte };
}

const ZERO_BY_STATUS: ByStatus<number> = { single: 0, mfj: 0, mfs: 0, hoh: 0, qss: 0 };

/** Narrow the federal card; `fallback` (the seed) fills fields a stored card predates. */
export function sanitizeFederalCard(raw: unknown, fallback?: FederalCard | null): FederalCard {
  const r = obj(raw);
  const se = obj(r.selfEmployment);
  const am = obj(r.additionalMedicare);
  const qbi = obj(r.qbi);
  const ptc = obj(r.ptc);
  const ctc = obj(r.childTaxCredit);
  const niit = obj(r.netInvestmentIncomeTax);
  const wpl = obj(qbi.wageAndPropertyLimit);
  const fq = fallback?.qbi;
  return {
    brackets: byStatus(r.brackets, brackets),
    standardDeduction: byStatus(r.standardDeduction, num),
    taxTable: taxTable(r.taxTable),
    selfEmployment: {
      netEarningsFactor: num(se.netEarningsFactor),
      socialSecurityRate: num(se.socialSecurityRate),
      medicareRate: num(se.medicareRate),
      wageBase: num(se.wageBase),
    },
    additionalMedicare: { rate: num(am.rate), threshold: byStatus(am.threshold, num) },
    qbi: {
      rate: num(qbi.rate),
      threshold: byStatus(qbi.threshold, num),
      phaseInRange:
        qbi.phaseInRange === undefined
          ? (fq?.phaseInRange ?? ZERO_BY_STATUS)
          : byStatus(qbi.phaseInRange, num),
      wageLimit: numOr(qbi.wageLimit, fq?.wageLimit ?? 0.5),
      wageAndPropertyLimit: {
        wages: numOr(wpl.wages, fq?.wageAndPropertyLimit.wages ?? 0.25),
        property: numOr(wpl.property, fq?.wageAndPropertyLimit.property ?? 0.025),
      },
    },
    childTaxCredit:
      r.childTaxCredit === undefined && fallback
        ? fallback.childTaxCredit
        : {
            perChild: numOr(ctc.perChild, 0),
            phaseOutThreshold:
              ctc.phaseOutThreshold === undefined ? ZERO_BY_STATUS : byStatus(ctc.phaseOutThreshold, num),
            phaseOutPer: numOr(ctc.phaseOutPer, 0),
            phaseOutStep: numOr(ctc.phaseOutStep, 1000),
          },
    netInvestmentIncomeTax:
      r.netInvestmentIncomeTax === undefined && fallback
        ? fallback.netInvestmentIncomeTax
        : {
            rate: numOr(niit.rate, 0),
            threshold: niit.threshold === undefined ? ZERO_BY_STATUS : byStatus(niit.threshold, num),
          },
    ptc: {
      applicableFigure: (Array.isArray(ptc.applicableFigure) ? ptc.applicableFigure : [])
        .slice(0, 12)
        .map((row) => {
          const o = obj(row);
          return { from: num(o.from), to: num(o.to), start: num(o.start), end: num(o.end) };
        }),
      capAt: num(ptc.capAt),
      capFigure: num(ptc.capFigure),
      repaymentLimit: (Array.isArray(ptc.repaymentLimit) ? ptc.repaymentLimit : [])
        .slice(0, 12)
        .map((row) => {
          const o = obj(row);
          return { below: num(o.below), single: num(o.single), other: num(o.other) };
        }),
    },
  };
}

/**
 * Narrow untrusted JSON into a card. Shape only — `validateYearCard` judges
 * the numbers. `fallback` is the seed for the same year: a card saved
 * before a rule existed takes the seed's value for it.
 */
export function sanitizeYearCard(raw: unknown, fallback?: YearCard | null): YearCard {
  const r = obj(raw);
  const states: Record<string, StateCard> = {};
  for (const [code, card] of Object.entries(obj(r.states))) {
    const c = code.toUpperCase();
    if (/^[A-Z]{2}$/.test(c) && c in US_STATES) {
      states[c] = sanitizeStateCard(card, c, fallback?.states[c] ?? null);
    }
  }
  return { federal: sanitizeFederalCard(r.federal, fallback?.federal ?? null), states };
}

const fin = (v: number) => typeof v === "number" && isFinite(v);

function validateBrackets(rows: ByStatus<Bracket[]>, where: string, out: string[]) {
  for (const s of FILING_STATUSES) {
    const list = rows[s];
    const w = `${where}, ${FILING_STATUS_LABEL[s]}`;
    if (!list.length) {
      out.push(`${w}: no bracket rows`);
      continue;
    }
    let prev = 0;
    list.forEach((row, i) => {
      const last = i === list.length - 1;
      if (!fin(row.rate) || row.rate < 0 || row.rate >= 1) out.push(`${w}, row ${i + 1}: rate must be a percentage`);
      if (last) {
        if (row.upTo !== null) out.push(`${w}: the last row must be "and over"`);
      } else if (row.upTo === null || !fin(row.upTo)) {
        out.push(`${w}, row ${i + 1}: needs an "up to" amount`);
      } else if (row.upTo <= prev) {
        out.push(`${w}, row ${i + 1}: "up to" must be higher than the row above`);
      } else {
        prev = row.upTo;
      }
    });
  }
}

function validateByStatus(v: ByStatus<number>, where: string, out: string[], min = 0) {
  for (const s of FILING_STATUSES) {
    if (!fin(v[s]) || v[s] < min) out.push(`${where}, ${FILING_STATUS_LABEL[s]}: needs a number`);
  }
}

function validateTaxTable(t: TaxTableRule | null, where: string, out: string[]) {
  if (!t) return;
  if (!fin(t.below) || t.below < 0) out.push(`${where} tax table: "use below" needs a number`);
  if (!fin(t.row) || t.row <= 0) out.push(`${where} tax table: row width must be positive`);
}

/** Everything that would make the engine compute nonsense. Empty means usable. */
export function validateYearCard(card: YearCard): string[] {
  const out: string[] = [];
  const f = card.federal;
  validateBrackets(f.brackets, "Federal brackets", out);
  validateByStatus(f.standardDeduction, "Federal standard deduction", out);
  validateTaxTable(f.taxTable, "Federal", out);
  const se = f.selfEmployment;
  if (!fin(se.netEarningsFactor) || se.netEarningsFactor <= 0 || se.netEarningsFactor > 1) out.push("SE net earnings factor must be a percentage (92.35%)");
  if (!fin(se.socialSecurityRate) || se.socialSecurityRate <= 0 || se.socialSecurityRate >= 1) out.push("Social Security rate must be a percentage");
  if (!fin(se.medicareRate) || se.medicareRate <= 0 || se.medicareRate >= 1) out.push("Medicare rate must be a percentage");
  if (!fin(se.wageBase) || se.wageBase <= 0) out.push("Social Security wage base needs a number");
  if (!fin(f.additionalMedicare.rate) || f.additionalMedicare.rate < 0 || f.additionalMedicare.rate >= 1) out.push("Additional Medicare rate must be a percentage");
  validateByStatus(f.additionalMedicare.threshold, "Additional Medicare threshold", out, 1);
  if (!fin(f.qbi.rate) || f.qbi.rate < 0 || f.qbi.rate >= 1) out.push("QBI rate must be a percentage");
  validateByStatus(f.qbi.threshold, "QBI threshold", out, 1);
  validateByStatus(f.qbi.phaseInRange, "QBI phase-in range", out, 1);
  if (!fin(f.qbi.wageLimit) || f.qbi.wageLimit < 0 || f.qbi.wageLimit >= 1) out.push("QBI W-2 wage limit must be a percentage");
  const wpl = f.qbi.wageAndPropertyLimit;
  if (!fin(wpl.wages) || wpl.wages < 0 || wpl.wages >= 1 || !fin(wpl.property) || wpl.property < 0 || wpl.property >= 1) {
    out.push("QBI wage-and-property limit needs two percentages");
  }
  const ctc = f.childTaxCredit;
  if (!fin(ctc.perChild) || ctc.perChild < 0) out.push("Child tax credit per child needs a number");
  validateByStatus(ctc.phaseOutThreshold, "Child tax credit phase-out threshold", out);
  if (!fin(ctc.phaseOutPer) || ctc.phaseOutPer < 0) out.push("Child tax credit phase-out amount needs a number");
  if (!fin(ctc.phaseOutStep) || ctc.phaseOutStep <= 0) out.push("Child tax credit phase-out step must be positive");
  const niit = f.netInvestmentIncomeTax;
  if (!fin(niit.rate) || niit.rate < 0 || niit.rate >= 1) out.push("Net investment income tax rate must be a percentage");
  validateByStatus(niit.threshold, "Net investment income tax threshold", out);
  let prevTo = 0;
  f.ptc.applicableFigure.forEach((row, i) => {
    const w = `Premium tax credit figure, row ${i + 1}`;
    if (!fin(row.from) || !fin(row.to) || row.to <= row.from || row.from < prevTo) out.push(`${w}: the percentage range must be in order`);
    if (!fin(row.start) || !fin(row.end) || row.start < 0 || row.end < 0 || row.start >= 1 || row.end >= 1) out.push(`${w}: the figures must be percentages`);
    prevTo = fin(row.to) ? row.to : prevTo;
  });
  if (!fin(f.ptc.capAt) || f.ptc.capAt <= 0) out.push("Premium tax credit: the cap percentage needs a number");
  if (!fin(f.ptc.capFigure) || f.ptc.capFigure < 0 || f.ptc.capFigure >= 1) out.push("Premium tax credit: the cap figure must be a percentage");
  let prevBelow = 0;
  f.ptc.repaymentLimit.forEach((row, i) => {
    const w = `Premium tax credit repayment cap, row ${i + 1}`;
    if (!fin(row.below) || row.below <= prevBelow) out.push(`${w}: "below" must be higher than the row above`);
    if (!fin(row.single) || row.single < 0 || !fin(row.other) || row.other < 0) out.push(`${w}: needs both amounts`);
    prevBelow = fin(row.below) ? row.below : prevBelow;
  });

  for (const [code, s] of Object.entries(card.states)) {
    if (!s.incomeTax) continue;
    const where = s.name || code;
    validateBrackets(s.brackets, `${where} brackets`, out);
    if (s.deduction.kind === "standard") validateByStatus(s.deduction.amount, `${where} standard deduction`, out);
    if (s.exemption.kind !== "none") {
      if (!fin(s.exemption.amount) || s.exemption.amount < 0) out.push(`${where} exemption amount needs a number`);
      if (!fin(s.exemption.dependentAmount) || s.exemption.dependentAmount < 0) out.push(`${where} dependent exemption amount needs a number`);
      validateByStatus(s.exemption.count, `${where} exemptions`, out);
      const p = s.exemption.phaseOut;
      if (p) {
        validateByStatus(p.threshold, `${where} exemption phase-out threshold`, out, 1);
        validateByStatus(p.step, `${where} exemption phase-out step`, out, 1);
        if (!fin(p.reduce) || p.reduce < 0) out.push(`${where} exemption phase-out reduction needs a number`);
      }
    }
    validateTaxTable(s.taxTable, where, out);
    if (s.surtax && (!fin(s.surtax.rate) || s.surtax.rate < 0 || s.surtax.rate >= 1 || !fin(s.surtax.above) || s.surtax.above < 0)) {
      out.push(`${where} surtax needs a rate and a floor`);
    }
    if (s.local) validateBrackets(s.local.brackets, `${where} ${s.local.name || "local"} brackets`, out);
    if (s.medical && (!fin(s.medical.floorRate) || s.medical.floorRate < 0 || s.medical.floorRate >= 1)) {
      out.push(`${where} medical deduction: the floor must be a percentage`);
    }
    if (s.sharedResponsibility) {
      const p = s.sharedResponsibility;
      if (!fin(p.rate) || p.rate < 0 || p.rate >= 1) out.push(`${where} shared responsibility rate must be a percentage`);
      validateByStatus(p.threshold, `${where} shared responsibility threshold`, out);
      if (!fin(p.flatAdult) || p.flatAdult < 0) out.push(`${where} shared responsibility flat amount needs a number`);
    }
    if (s.entity) {
      const e = s.entity;
      if (!e.form.trim()) out.push(`${where} S corporation form needs a name (e.g. 100S)`);
      if (!fin(e.rate) || e.rate < 0 || e.rate >= 1) out.push(`${where} S corporation tax rate must be a percentage`);
      if (!e.minimum.length) out.push(`${where} S corporation minimum tax needs at least one row`);
      let prevBelow = 0;
      e.minimum.forEach((row, i) => {
        const last = i === e.minimum.length - 1;
        if (!fin(row.amount) || row.amount < 0) out.push(`${where} minimum tax, row ${i + 1}: needs an amount`);
        if (last) {
          if (row.below !== null) out.push(`${where} minimum tax: the last row must be "and over"`);
        } else if (row.below === null || !fin(row.below) || row.below <= prevBelow) {
          out.push(`${where} minimum tax, row ${i + 1}: "receipts below" must be higher than the row above`);
        } else {
          prevBelow = row.below;
        }
      });
      if (e.pte) {
        const rows = { single: e.pte.brackets, mfj: e.pte.brackets, mfs: e.pte.brackets, hoh: e.pte.brackets, qss: e.pte.brackets };
        validateBrackets(rows, `${where} PTE elective tax`, out);
      }
    }
  }
  return out;
}
