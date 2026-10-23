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
 * Two kinds of check, and only the first refuses (engine v11, 2026-10-16):
 *
 *  1. The business. The lines the recap attributes to a strategy have to
 *     hold together: a Schedule C that is gross receipts less its expenses,
 *     an 1120-S or 1065 that is receipts less deductions with a K-1 the 1040
 *     carries, Schedule SE and Form 7206 reproduced from them, the rentals'
 *     rents and expenses, a card for the year and the state. A miss here
 *     means a misread strategy line or a shape the engine doesn't model, and
 *     the derivation is refused with the line named — a wrong number on the
 *     recap is worse than no number.
 *  2. The household. Everything else on the return — the deduction, QBI,
 *     income tax, the premium and child credits, net investment income tax,
 *     the federal total, the state's lines and total, the entity's state
 *     tax — is re-run from the same inputs and compared to the print. A
 *     line the tables don't reproduce is no longer a refusal: the
 *     difference is carried across every scenario as a fixed amount (an
 *     extra deduction for age or Schedule 1-A, an earned income credit, a
 *     Schedule 2 tax, a state credit the card lacks), so the after return
 *     still reproduces to the dollar by construction and the before is the
 *     same return with the business's write-offs gone. The recap then says
 *     "projected" instead of "verified to the dollar" and names the lines
 *     (`derived.proof`). Those lines never appear on the recap as a
 *     strategy; what they change is only the bracket the business sits in,
 *     which carrying them keeps.
 *
 * The one classification the household side still makes is whose W-2 wages
 * are whose. Wages beyond the officer's pay that the return doesn't place
 * are taken as another employer's and kept on the before, with a note
 * saying how to correct it if the corporation paid them.
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
 * Several businesses and several states (engine v13, 2026-10-22): a 1040
 * can carry more than one entity return — two S corporations, a
 * partnership beside one, a partnership beside a Schedule C — and more than
 * one state return. Each entity return is its own unit, with its own
 * write-offs zeroed and its own state tax; the strategy switches act on all
 * of them at once. Each other state return is figured by its own card, as
 * a part-year or nonresident return prorated by its state-source income,
 * and fitted like the main one, so every state's before is its own.
 *
 * Pure and isomorphic: the builder derives in the browser; the Tax Tables
 * page proves a card against saved recaps; a script checks the seeds
 * (`npm run recap:check`).
 */

import { sideSummary, totalTaxesOf } from "./compute";
import {
  ENTITY_FIELDS,
  RETURN_FIELDS,
  SCH_C_LINE_KEYS,
  emptyEntityNumbers,
  emptyNumbers,
  emptyStateNumbers,
  OTHER_STATE_CREDIT_WITH_PAYMENTS,
  type DerivedBefore,
  type EntityFieldKey,
  type EntityNumbers,
  type Proof,
  type RecapAnalysis,
  type ReturnFieldKey,
  type ReturnNumbers,
  type StateNumbers,
} from "./schema";
import {
  FILING_STATUS_LABEL,
  cardFor,
  mergeTables,
  type Bracket,
  type CityRules,
  type FederalCard,
  type FilingStatus,
  type StateCard,
  type TableSet,
  type TaxTableRule,
} from "./tables";

/** Bump when a formula changes, so a stored recap says which engine made it. */
export const DERIVE_VERSION = "15";

export type DeriveMeta = {
  taxYear: number | null;
  filingStatus: string | null;
  stateCode: string | null;
  stateForm: string | null;
  /** Which return the entity filed, when one was read: tells a partnership's K-1 from an S corporation's. */
  entityForm?: "1120-S" | "1065" | null;
  /**
   * The state the entity's own return was filed in, when it was read. When
   * it isn't the household's (a client who moved while the corporation
   * still filed in the old state), the entity's tax follows that state's
   * card.
   */
  entityStateCode?: string | null;
  /** The first entity's name as read: how the notes tell it apart when there are several. */
  entityName?: string | null;
  /**
   * Lines the reader returned that the page-text cross-check found nowhere
   * on the return. When the after return doesn't reproduce, the engine
   * tries again without the optional ones among them (see `buildChecked`).
   */
  unverified?: string[];
};

/** An entity return beyond the first on the same 1040: its numbers as read, which form, and where it filed. */
export type EntityInput = {
  numbers: EntityNumbers;
  form: "1120-S" | "1065" | null;
  stateCode?: string | null;
  name?: string | null;
};

/** A state return beyond the main one, as read off the after return. */
export type OtherStateInput = { stateCode: string; stateForm: string | null; numbers: StateNumbers };

/**
 * What else is on the same 1040 (engine v13): entity returns beyond the
 * first — a second S corporation, a partnership beside it — and state
 * returns beyond the main one. Each gets its own before.
 */
export type DeriveMore = { entities?: EntityInput[]; states?: OtherStateInput[] };

/** A line the tables didn't reproduce: what the after return prints vs what they give. */
export type Mismatch = { line: string; read: number; computed: number };

export type DeriveResult =
  | {
      ok: true;
      before: ReturnNumbers;
      /** The S corporation's before return, or null for a sole proprietor. */
      entityBefore: EntityNumbers | null;
      /** Each further entity return's before, in `DeriveMore.entities` order. */
      otherEntitiesBefore: EntityNumbers[];
      /** Each further state return's before, in `DeriveMore.states` order. */
      otherStatesBefore: StateNumbers[];
      derived: DerivedBefore;
      /**
       * After-return lines the return's own figures prove were misread, with
       * the value they should have (engine v14: line 32's estimated payments
       * moved to line 31). Empty almost always. The builder writes them into
       * its after column, so the recap's after side is figured the way the
       * before was; the notes say why.
       */
      afterFixes: Partial<ReturnNumbers>;
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

/**
 * One form under the names it goes by, after `normalizeForm`: Delaware
 * renamed its 200-01 / 200-02 to PIT-RES / PIT-NON; Virginia's
 * computer-generated 760 prints as "760CG" (its part-year 760PY as
 * "760PYCG" on some prints).
 */
const FORM_ALIASES: Record<string, string> = {
  PITRES: "20001",
  PITNON: "20002",
  "760CG": "760",
  "760PYCG": "760PY",
};

/**
 * "Form 540", "540 ", "CA 540", "NJ-1040" → "540" / "NJ1040". Leading zeros
 * go ("DR 0104" is Colorado's "104"), and so does the amended return's "X"
 * (IT-201-X, 500X, 540X): an amended return is the same form with the
 * corrected figures, computed the same way.
 */
const normalizeForm = (s: string | null | undefined) => {
  const f = (s ?? "")
    .toUpperCase()
    .replace(/FORM|\s|[^A-Z0-9]/g, "")
    .replace(/^[A-Z]{2}(?=\d)/, "")
    .replace(/^0+(?=\d)/, "")
    .replace(/(?<=\d)X$/, "");
  return FORM_ALIASES[f] ?? f;
};

/** Which return an entity filed: as read, or by its lines when the reader couldn't tell (guaranteed payments are a partnership's). */
const formOfEntity = (form: "1120-S" | "1065" | null, e: EntityNumbers): "1120-S" | "1065" =>
  form ?? (n(e.guaranteedPayments) > 0 || n(e.k1Guaranteed) > 0 ? "1065" : "1120-S");

/** How the reasons and notes name one of several entity returns. */
const entityName = (name: string | null, form: "1120-S" | "1065", i: number) => (name ? `${name} (${form})` : `entity return ${i + 1} (${form})`);

/** Where a nonresident form prints the state-source income the proration uses, for a refusal that names the line. */
function sourceLine(stateCode: string, sc: StateCard): string {
  const form = sc.nonresident?.form ?? "";
  if (sc.nonresident?.method === "maryland") return `Form ${form}NR line 8, the Maryland income`;
  if (stateCode === "NY") return `Form ${form} line 17, the New York State amount column`;
  if (stateCode === "VA") return `Form ${form}'s Schedule of Income, line 4, the "While VA Resident" column`;
  if (stateCode === "AZ") return `Form ${form} line 23, the Arizona column`;
  if (stateCode === "CA") return `Schedule CA (${form}) line 10, column E`;
  return `Form ${form}'s state-source total income, before adjustments`;
}

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
 * A state tax with a benefit recapture (New York's IT-201 line 39 over
 * $107,650 of AGI), worksheet by worksheet. The first slice (worksheets 1,
 * 7, 12): taxable income at the flat rate of the bracket just above
 * `agiFrom`, less the schedule's tax, times the share of `range` AGI is
 * over `agiFrom` (four places), added to the schedule's tax — the flat
 * figure outright once AGI is past the range. Each later slice (worksheets
 * 2–5, 8–10, 13–15): the schedule's tax, plus the recapture already taken
 * at the bracket below (the "recapture base amount"), plus the next
 * bracket's share of it (the "incremental benefit") times the AGI share.
 * Both amounts are the brackets' own: base = the bracket below's top × its
 * rate less the schedule's tax there; incremental = that top × this rate
 * less the same tax, less the base. Over `flatAbove` the top rate applies
 * to everything.
 */
function recapturedTax(
  brackets: Bracket[],
  table: TaxTableRule | null,
  taxable: number,
  agi: number,
  r: NonNullable<StateCard["recapture"]>,
): number {
  const plain = printedTax(brackets, table, taxable);
  if (taxable <= 0 || agi <= r.agiFrom || !brackets.length) return plain;
  if (agi > r.flatAbove) return Math.round(taxable * brackets[brackets.length - 1].rate);
  /** The bracket a figure falls in: the first whose top it doesn't pass. */
  const bracketOf = (x: number) => {
    const k = brackets.findIndex((b) => b.upTo === null || x <= b.upTo);
    return k < 0 ? brackets.length - 1 : k;
  };
  const first = brackets.findIndex((b) => b.upTo === null || r.agiFrom < b.upTo);
  if (first < 0) return plain;
  const k = Math.max(first, bracketOf(taxable));
  const share = (from: number) => round4(Math.min(r.range, Math.max(0, agi - from)) / r.range);
  if (k === first) {
    const flat = Math.round(taxable * brackets[first].rate);
    if (agi >= r.agiFrom + r.range) return flat;
    return plain + Math.round((flat - plain) * share(r.agiFrom));
  }
  const top = brackets[k - 1].upTo as number;
  const below = scheduleTax(brackets, top);
  const base = Math.round(top * brackets[k - 1].rate - below);
  const incremental = Math.round(top * brackets[k].rate - below) - base;
  return plain + base + Math.round(incremental * share(top));
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
 * payments (both subject to SE tax, each person on their own Schedule SE),
 * the health premiums the partnership paid for them, and their own W-2
 * wages, which use up their Social Security wage base. `person` is who on
 * the 1040 it is (0 the taxpayer, 1 the spouse): a Schedule C of the same
 * person's goes on the same Schedule SE.
 */
type Partner = { person: 0 | 1; ordinary: number; guaranteed: number; premiums: number; wages: number };

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
  /** False when lines 23a and 23e weren't read: the rentals' net is then carried as filed, not zeroed. */
  expensesRead: boolean;
  /**
   * No $25,000 special allowance: Form 8582 lists the rentals with "all
   * other passive activities" (no active participation), so a passive loss
   * only offsets passive income. Set when line 26 as printed only
   * reproduces that way.
   */
  noAllowance?: boolean;
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

/**
 * Amounts on the after return the tables didn't reproduce, each carried
 * across every scenario as a fixed amount at the line where the form puts
 * it. Zero everywhere on a return that reproduces outright. Placing them on
 * their own line rather than on the total matters downstream: an extra
 * deduction is worth more at the before's bracket, a Schedule 2 tax raises
 * the ceiling the child tax credit is limited to.
 */
type Extras = {
  /** Line 12 beyond the standard deduction or the Schedule A total: age or blindness, Schedule 1-A, a dependent filer's limit (line 12a unread). */
  deduction: number;
  /** Line 13 beyond Form 8995's figure: REIT dividends, a specified service business in the phase-in range. */
  qbi: number;
  /** Line 16 beyond the brackets and the capital gain worksheet: another tax worksheet. */
  incomeTax: number;
  /** Form 8962 line 24 beyond the tables: premiums that differ month to month, a shared policy. */
  ptcAllowed: number;
  /** Line 17 beyond the excess advance credit repaid: alternative minimum tax, other Schedule 2 Part I. */
  additionalTaxes: number;
  /** Line 19 beyond what the dependents read give. */
  childTaxCredit: number;
  /** Form 8960 beyond the tables once net investment income is settled. */
  niit: number;
  /** Line 32 beyond the net premium tax credit, the earned income credit and the additional child tax credit: the American opportunity credit's refundable part, other refundable credits. */
  refundable: number;
  /** Line 24 beyond everything above: other Schedule 2 Part II taxes, Schedule 3 credits the engine doesn't model. */
  otherTaxes: number;
};

const NO_EXTRAS: Extras = {
  deduction: 0, qbi: 0, incomeTax: 0, ptcAllowed: 0, additionalTaxes: 0, childTaxCredit: 0, niit: 0, refundable: 0, otherTaxes: 0,
};

type FederalInputs = {
  /** Schedule C net profit — subject to SE tax. */
  netProfit: number;
  /** Whose Schedule C it is (0 the taxpayer, 1 the spouse): a partnership share of the same person's is on the same Schedule SE. */
  schCOwner: 0 | 1;
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
  /**
   * Net investment income for Form 8960, when the return itself says what
   * it is (from the tax as printed against AGI over the threshold). Null
   * means the engine's assumption: other income and the rentals' net.
   */
  nii: number | null;
  /**
   * Form 8995-A's wage and property limits when the form wasn't printed
   * (the after return is under the threshold, the before over it): the
   * business's own W-2 wages, and qualified property as $0.
   */
  qbiLimit: { w2Wages: number; ubia: number } | null;
  /** Lines the tables didn't reproduce, carried across as fixed amounts. */
  extra: Extras;
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
  /** Each person's Schedule SE tax (taxpayer, spouse): Social Security and Medicare paid as self-employment tax, which Massachusetts' wage deduction counts. */
  seTaxByPerson: [number, number];
  /** Each person's Schedule SE net earnings (line 6): what they've used of the wage base and the additional Medicare threshold. */
  seEarningsByPerson: [number, number];
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
  /** Form 1040 line 27: the earned income credit (0 when the year's figures aren't on the card). */
  eic: number;
  /** Form 1040 line 28: the additional child tax credit. */
  actc: number;
  /** Form 1040 line 32: the net premium tax credit, the two above, and any refundable credit carried across. */
  refundable: number;
  /** Wages plus Schedule C profit: what the child-care credit needs. */
  earnedIncome: number;
  /** Earned income the dependents' standard deduction worksheet counts: wages and Schedule C profit less the SE deduction. */
  dependentEarned: number;
};

/** Form 8962 lines 5–8b and 24–29 for one household income. `extraAllowed` is line 24 beyond the tables, carried across. */
function premiumTaxCredit(card: FederalCard, status: FilingStatus, magi: number, c: Coverage, extraAllowed = 0): Ptc {
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
  const allowed = Math.max(0, perMonth * months + extraAllowed);
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
 * Form 1040 line 27, the earned income credit, priced the way the EIC Table
 * prices it: at the middle of the $50 row the income falls in. The credit
 * on earned income, or — when AGI is over the phase-out start and isn't the
 * same figure — the smaller of that and the credit on AGI (EIC Worksheet A
 * lines 2–6). Null on the card means the year's figures aren't there.
 */
function earnedIncomeCredit(
  card: FederalCard,
  status: FilingStatus,
  earned: number,
  agi: number,
  children: number,
  investment: number,
  claimedAsDependent: boolean,
): number {
  const t = card.earnedIncomeCredit;
  if (!t || status === "mfs" || claimedAsDependent || earned <= 0 || investment > t.investmentLimit) return 0;
  const row = t.rows[Math.min(t.rows.length - 1, Math.max(0, children))];
  if (!row) return 0;
  const start = status === "mfj" ? row.phaseOutJoint : row.phaseOutStart;
  const at = (x: number) => {
    const mid = Math.floor(x / 50) * 50 + 25;
    return Math.max(0, Math.round(row.rate * Math.min(mid, row.earnedAmount) - row.phaseOutRate * Math.max(0, mid - start)));
  };
  const onEarned = at(earned);
  return agi < start || Math.round(agi) === Math.round(earned) ? onEarned : Math.min(onEarned, at(Math.max(0, agi)));
}

/**
 * Schedule 8812 Part II, the additional child tax credit: the children's
 * credit the tax didn't use (line 16a, `unused`), up to the refundable
 * amount per child (16b), and no more than 15% of earned income over
 * $2,500 (line 20) — or, with three or more children, the Social Security
 * and Medicare taxes paid less the earned income credit when that's more
 * (Part II-B).
 */
function additionalChildTaxCredit(
  card: FederalCard,
  children: number,
  unused: number,
  earned: number,
  ficaPaid: number,
  eic: number,
): number {
  if (children <= 0 || unused <= 0) return 0;
  const a = card.additionalChildTaxCredit;
  const line17 = Math.min(unused, children * a.perChild);
  const line20 = Math.round(Math.max(0, earned - a.earnedAbove) * a.rate);
  if (children < 3 || line20 >= line17) return Math.min(line17, line20);
  return Math.min(line17, Math.max(line20, Math.max(0, ficaPaid - eic)));
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
 * Split one schedule's SE deduction between the businesses on it, by their
 * share of its earnings — what §1.199A-3 counts as attributable to each.
 * A business at a loss gets none (it lowered the earnings, it didn't add
 * to them); the shares add up to the whole, the largest taking the rounding.
 */
function splitHalf(half: number, parts: number[]): number[] {
  const weights = parts.map((p) => Math.max(0, p));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return parts.map(() => 0);
  const out = weights.map((w) => Math.round((half * w) / total));
  const largest = weights.indexOf(Math.max(...weights));
  out[largest] += half - out.reduce((s, v) => s + v, 0);
  return out;
}

/**
 * Every Schedule SE on the return: one per person. A person's Schedule C
 * and their partnership shares (ordinary income plus guaranteed payments)
 * go on the same schedule — line 3 adds them before the 92.35% — so a
 * partnership loss lowers the Schedule C's SE tax. Each schedule's SE
 * deduction is then split back to the businesses on it (`splitHalf`):
 * `schCHalf` is the Schedule C's part, `partnerHalf[k]` partner k's.
 */
function seSchedules(card: FederalCard, i: FederalInputs) {
  // A Schedule C alone (or nothing at all): one schedule, as a sole
  // proprietor's always was.
  if (i.partners.length === 0) {
    const u = scheduleSe(card, i.netProfit, i.seWages);
    return { units: [{ ...u, person: i.schCOwner }], schCHalf: u.half, partnerHalf: [] as number[] };
  }
  const people: { person: 0 | 1; parts: number[]; partnerIdx: number[]; schC: boolean; wages: number }[] = [];
  const of = (person: 0 | 1, wages: number) => {
    let p = people.find((x) => x.person === person);
    if (!p) people.push((p = { person, parts: [], partnerIdx: [], schC: false, wages }));
    return p;
  };
  i.partners.forEach((p, k) => {
    const who = of(p.person, p.wages);
    who.wages = Math.max(who.wages, p.wages);
    who.parts.push(p.ordinary + p.guaranteed);
    who.partnerIdx.push(k);
  });
  if (i.netProfit !== 0) {
    const who = of(i.schCOwner, i.seWages);
    // The Schedule C filer's wage base is what `seWages` says it is.
    who.wages = i.seWages;
    who.parts.push(i.netProfit);
    who.schC = true;
  }
  const partnerHalf = i.partners.map(() => 0);
  let schCHalf = 0;
  const units = people.map((p) => {
    const u = scheduleSe(card, p.parts.reduce((s, v) => s + v, 0), p.wages);
    // With one business on the schedule it takes the whole deduction.
    const shares = p.parts.length === 1 ? [u.half] : splitHalf(u.half, p.parts);
    p.partnerIdx.forEach((k, j) => (partnerHalf[k] = shares[j]));
    if (p.schC) schCHalf = shares[shares.length - 1];
    return { ...u, person: p.person };
  });
  return { units, schCHalf, partnerHalf };
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
  // Schedule SE: one per person, the Schedule C and that person's
  // partnership shares together (`seSchedules`), and the deduction is the
  // sum of each schedule's own rounded half.
  const { units, schCHalf, partnerHalf } = seSchedules(card, i);
  const seEarnings = units.reduce((s, u) => s + u.earnings, 0);
  const seTax = units.reduce((s, u) => s + u.tax, 0);
  const halfSe = units.reduce((s, u) => s + u.half, 0);
  const seTaxByPerson: [number, number] = [0, 0];
  const seEarningsByPerson: [number, number] = [0, 0];
  for (const u of units) {
    seTaxByPerson[u.person] += u.tax;
    seEarningsByPerson[u.person] += u.earnings;
  }

  // Form 7206: the premiums, capped at the business's profit less the SE
  // and retirement plan deductions — or, for a more-than-2% S corporation
  // shareholder, at the Medicare wages the premiums were run through (line
  // 11). A partner's are capped at their own share less their own half.
  // With a Schedule C beside a partnership, the premiums are the
  // partnership's when it paid them as guaranteed payments, the Schedule
  // C's otherwise.
  let sehi = 0;
  const viaPartners = i.partners.length > 0 && (i.partners.some((p) => p.premiums > 0) || (i.netProfit === 0 && i.scorp === 0));
  const viaScorp = !viaPartners && i.scorp !== 0 && (i.netProfit <= 0 || i.scorpMedicareWages > 0);
  if (viaPartners) {
    const bases = i.partners.map((p) => p.ordinary + p.guaranteed);
    const total = bases.reduce((s, b) => s + Math.max(0, b), 0);
    i.partners.forEach((p, k) => {
      const sepShare = total > 0 ? Math.round((i.sep * Math.max(0, bases[k])) / total) : 0;
      sehi += Math.min(p.premiums, Math.max(0, bases[k] - partnerHalf[k] - sepShare));
    });
  } else {
    // A more-than-2% shareholder's plan is the corporation's (capped at the
    // Medicare wages on Form 7206 line 11); with a Schedule C beside the
    // corporation and no such wages read, the plan is the Schedule C's.
    const sehiCap = viaScorp ? i.scorpMedicareWages : Math.max(0, i.netProfit - schCHalf - i.sep);
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
    const passiveNet = passive1d >= 0 ? passive1d : Math.max(passive1d, r.noAllowance ? 0 : -passiveAllowance);
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
  // Line 12 beyond either figure (age or blindness, Schedule 1-A, a
  // dependent filer's limit the engine wasn't told about) rides along.
  const deduction = Math.max(0, (itemizes ? itemizedTotal : standard) + i.extra.deduction);
  const taxableBeforeQbi = Math.max(0, agi - deduction);

  // §1.199A-3: a sole proprietor's QBI is net profit less the deductions
  // attributable to it — the SE deduction, the health insurance deduction
  // and the retirement plan deduction. A partner's is their ordinary share
  // less the part of their SE deduction that belongs to it (the guaranteed
  // payments carry the rest, and the premiums). An S corporation
  // shareholder's over the threshold comes off Form 8995-A as read; under
  // it (Form 8995) it's the K-1's ordinary income less the health insurance
  // deduction the wages carried (Client H: $180,200 → $36,040). Form 8995 line
  // 3 nets a prior year's loss carryforward off it first, and a rental
  // counted as a business adds its net.
  // With a Schedule C beside a partnership the businesses add up the same
  // way (Form 8995 line 1 lists each): the partners' ordinary shares less
  // their part of the SE deduction, the Schedule C less its own part, the
  // health insurance and the retirement plan, and an S corporation's K-1.
  let qbiBase: number;
  const partnerQbi = () =>
    i.partners.reduce((s, p, k) => {
      const base = p.ordinary + p.guaranteed;
      const share = base > 0 ? Math.round((partnerHalf[k] * p.ordinary) / base) : 0;
      return s + p.ordinary - share;
    }, 0);
  if (i.qbi) qbiBase = i.qbi.income;
  else if (i.partners.length > 0 && i.netProfit === 0 && i.scorp === 0) {
    qbiBase = partnerQbi();
  } else if (i.partners.length > 0) {
    qbiBase =
      partnerQbi() +
      (i.netProfit !== 0 ? i.netProfit - schCHalf - (viaPartners || viaScorp ? 0 : sehi) - i.sep : 0) +
      (i.scorp - (viaScorp ? sehi : 0)) -
      i.qbiCarryforward;
  } else if (i.scorp !== 0) {
    // The K-1 less the shareholder's health insurance deduction — and, with
    // a Schedule C beside the corporation, its profit net of its own SE
    // deduction and retirement plan. A loss on either side nets against the
    // other (Form 8995 adds the businesses up): a 2025 return's $38,480 K-1
    // and $11,544 Schedule C loss give the printed $5,387 (engine v14; the
    // loss used to be left out).
    qbiBase = i.scorp - sehi - i.qbiCarryforward + (i.netProfit > 0 ? i.netProfit - halfSe - i.sep : i.netProfit);
  } else qbiBase = i.netProfit - halfSe - sehi - i.sep - i.qbiCarryforward;
  if (i.rental?.qbi) qbiBase += rentalDeducted;
  qbiBase = Math.max(0, qbiBase);
  const netCapitalGain = Math.max(0, Math.min(i.preferential, taxableBeforeQbi));
  // Over the threshold the wage and property limits come off Form 8995-A
  // when it was read, else from the business's own lines (`qbiLimit`).
  const q = qbiDeduction(
    card,
    status,
    qbiBase,
    taxableBeforeQbi,
    netCapitalGain,
    i.qbi?.w2Wages ?? i.qbiLimit?.w2Wages ?? 0,
    i.qbi?.ubia ?? i.qbiLimit?.ubia ?? 0,
  );
  const qbi = Math.max(0, q.deduction + i.extra.qbi);

  const taxable = Math.max(0, taxableBeforeQbi - qbi);
  const incomeTax = Math.max(0, taxOnIncome(card, status, taxable, i.preferential) + i.extra.incomeTax);

  // Form 8962 works from modified AGI; with no tax-exempt interest, foreign
  // income or nontaxable Social Security that is AGI.
  const ptc = i.coverage ? premiumTaxCredit(card, status, agi, i.coverage, i.extra.ptcAllowed) : null;
  const additionalTaxes = Math.max(0, (ptc?.repayment ?? 0) + i.extra.additionalTaxes);

  // Lines 18–22: the child tax credit is limited to the tax left after the
  // other nonrefundable credits (Credit Limit Worksheet A).
  const tax18 = incomeTax + additionalTaxes;
  const credits = i.childCareCredit + i.otherCredits;
  const ctcFull = childTaxCredit(card, status, agi, i.children, i.others);
  const ctc = Math.max(0, Math.min(ctcFull, Math.max(0, tax18 - credits)) + i.extra.childTaxCredit);
  const line22 = Math.max(0, tax18 - ctc - credits);

  // Lines 27 and 28 (engine v14): the earned income credit and the
  // additional child tax credit, figured on this scenario's income — the
  // before's higher income shrinks both, and without the dependents the
  // child credit's refundable part goes with the rest of it. Earned income
  // is the wages and the self-employment profit less the SE deduction (a
  // Schedule C loss counts against it); an S corporation's K-1 isn't
  // earned income. Other income stands in for investment income, which
  // only matters at the EIC's limit.
  const earned = Math.max(0, i.w2 + i.netProfit + partnerIncome - halfSe);
  const eic = earnedIncomeCredit(card, status, earned, agi, i.children, Math.max(0, i.otherIncome), i.claimedAsDependent);
  const se = card.selfEmployment;
  /** Schedule 8812 line 23: the Social Security and Medicare taxes withheld from the wages, plus the SE deduction. */
  const ficaPaid =
    Math.round((Math.min(i.w2, se.wageBase) * se.socialSecurityRate) / 2) + Math.round((i.medicareWages * se.medicareRate) / 2) + halfSe;
  const actc = additionalChildTaxCredit(card, i.children, Math.max(0, ctcFull - ctc), earned, ficaPaid, eic);
  const refundable = Math.max(0, (ptc?.net ?? 0) + eic + actc + i.extra.refundable);

  // Form 8960: on the smaller of net investment income and AGI over the
  // threshold. Business income (Schedule C, a K-1 the owner works in) is
  // not investment income; what's left of "other income" is taken as it,
  // and the rentals' net as deducted goes in with it, as the software
  // files it (a loss there wipes the rest out) — unless the return itself
  // said how much of it is investment income (`nii`).
  const ni = card.netInvestmentIncomeTax;
  const niiBase = i.nii !== null ? i.nii : i.otherIncome + rentalDeducted;
  const niit = Math.max(
    0,
    Math.round(Math.min(Math.max(0, niiBase), Math.max(0, agi - ni.threshold[status])) * ni.rate) + i.extra.niit,
  );

  return {
    seEarnings,
    seTax,
    seTaxByPerson,
    seEarningsByPerson,
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
    totalTax: Math.max(0, line22 + seTax + additionalMedicare + niit + i.extra.otherTaxes),
    eic,
    actc,
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
  /** The filer lives in the city whose tax the card carries (New York City): the return's city tax line was read. */
  localResident: boolean;
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
  /** A resident return's credit for the tax paid to other states, inside `netTax` (engine v13; 0 unless the credit was read). */
  otherStateCredit: number;
};

const EMPTY_STATE: State = {
  income: 0, taxable: 0, wageDeduction: 0, tax: 0, exemption: 0, medical: 0, local: 0, sharedResponsibility: 0, pteCredit: 0, nonresidentTax: 0, grossTax: 0, netTax: 0, otherStateCredit: 0,
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
  // with it. A self-employed person's Schedule SE tax is Social Security
  // and Medicare paid too (engine v14: a 2025 return with $8,423 of wages
  // and $35,459 of SE tax prints the full $2,000).
  const wd = card.wageDeduction;
  const wageDeduction = wd
    ? s.wagesByPerson.reduce(
        (t, w, k) => t + Math.min(wd.cap, Math.round(Math.max(0, w) * wd.rate) + (fed.seTaxByPerson[k] ?? 0)),
        0,
      )
    : 0;

  const taxable = Math.max(
    0,
    income - deduction - (ex.kind === "deduction" ? exemption : 0) - medical - wageDeduction,
  );
  // New York's recapture works from the state's own AGI (IT-201 line 33;
  // on IT-203 the federal-column figure, which this is as a resident).
  let tax = card.recapture
    ? recapturedTax(card.brackets[status], card.taxTable, taxable, income, card.recapture)
    : printedTax(card.brackets[status], card.taxTable, taxable);
  if (card.surtax && taxable > card.surtax.above) {
    tax += Math.round((taxable - card.surtax.above) * card.surtax.rate);
  }
  const credit = ex.kind === "credit" ? exemption : 0;
  // A state earned income credit as a share of the federal one (Delaware's
  // 20%), no more than the tax left: it goes where the federal credit goes.
  const eitc = card.earnedIncomeCredit ? Math.min(Math.max(0, tax - credit), Math.round(fed.eic * card.earnedIncomeCredit.share)) : 0;
  const afterExemption = Math.max(0, tax - credit - eitc);
  // A city's resident tax on the same taxable income, for a city resident only.
  const local = card.local && s.localResident ? printedTax(card.local.brackets[status], card.taxTable, taxable) : 0;

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
    otherStateCredit: 0,
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
  const mode = creditMode(card);
  const available = Math.max(0, s.pteCreditAvailable);

  // New York's IT-203, line by line: 44 the tax on all income as a resident
  // (with the recapture, on the federal column's AGI), 45 the income
  // percentage — the New York column's AGI over the federal column's, four
  // places — and 46 their product. The deduction and the dependent
  // exemptions are inside line 44 once; prorating taxable income instead
  // would count the exemptions out of the share a second time.
  // South Carolina's Schedule NR ("taxable"): the same percentage of the
  // deductions and exemptions comes off the state's share of income, and
  // that taxable income is taxed on the schedule — its 0% and 3% bands
  // count in full (a 2025 return: $4,941 printed, the proration of the tax
  // gives $5,196, this $4,851; the rest is the state tax added back).
  const method = card.nonresident?.method;
  if (method === "income" || method === "taxable") {
    /** AGI as a resident: the state's own figure, or federal AGI with the state's adjustments where the card starts lower (federal taxable income). */
    const agiAsResident = card.base === "stateGrossIncome" ? resident.income : fed.agi + s.carriedAdjustment;
    const pct = agiAsResident > 0 ? Math.min(1, round4(stateAgi / agiAsResident)) : 0;
    const taxable = Math.round(totalTaxable * pct);
    const stateTax =
      method === "income"
        ? Math.round(tax * pct)
        : Math.max(0, printedTax(card.brackets[status], card.taxTable, taxable) - (card.exemption.kind === "credit" ? Math.round(resident.exemption * pct) : 0));
    const local = card.local && s.localResident ? printedTax(card.local.brackets[status], card.taxTable, taxable) : 0;
    const pteCredit = mode === "nonrefundable" ? Math.min(available, stateTax) : mode === "refundable" ? available : 0;
    return {
      ...resident,
      income: stateAgi,
      taxable,
      tax: stateTax,
      residentTax: tax,
      exemption: 0,
      local,
      sharedResponsibility: 0,
      pteCredit,
      grossTax: stateTax + local,
      netTax: stateTax + local - pteCredit,
    };
  }

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
  // A part-year city resident's tax (New York IT-203 line 51, Form
  // IT-360.1): the city's rates on the city-resident period's income,
  // taken as the state's taxable share — what was earned while living
  // there — so it grows with that share on the before; the rest is fitted.
  const local = card.local && s.localResident ? printedTax(card.local.brackets[status], card.taxTable, taxable) : 0;
  const pteCredit = mode === "nonrefundable" ? Math.min(available, afterExemption) : mode === "refundable" ? available : 0;
  return {
    ...resident,
    income: stateAgi,
    taxable,
    tax: stateTax,
    residentTax: tax,
    exemption,
    local,
    sharedResponsibility: 0,
    pteCredit,
    grossTax: afterExemption + local,
    netTax: afterExemption + local - pteCredit,
  };
}

/**
 * A state total the card didn't reproduce, carried across as a fixed
 * amount on the printed total (a credit the card lacks, a local tax, an
 * adjustment). On both the gross and net figures, since either is the
 * state's total depending on how the PTE credit is claimed.
 */
function stateWithExtra(st: State, extraTax: number): State {
  if (!extraTax) return st;
  return { ...st, grossTax: Math.max(0, st.grossTax + extraTax), netTax: Math.max(0, st.netTax + extraTax) };
}

/* ─────────────────────────────── the S corporation ─────────────────────────────── */

/** What the state charges the corporation itself (Form 100S, CBT-100S), and a city when it files its own return (NYC-3L). */
export type EntityTax = { netIncome: number; franchise: number; pte: number; city: number; total: number };

/**
 * What a city's corporation tax is figured on: the entity's net income
 * (federal taxable income before NOL — the 1120-S's ordinary income) and
 * the return's own business allocation percentage, which is a fact of the
 * year; `adjust` carries any difference between the allocated figure as
 * printed and income × allocation (a city adjustment); `receipts` are the
 * city's, for the minimum.
 */
type CityBase = { base: number; allocation: number; adjust: number; receipts: number };

/** The entity's tax, elective tax and city tax beyond the card's figures, carried across. */
function entityWithExtra(t: EntityTax, extra: { franchise: number; pte: number; city: number }): EntityTax {
  if (!extra.franchise && !extra.pte && !extra.city) return t;
  const franchise = Math.max(0, t.franchise + extra.franchise);
  const pte = Math.max(0, t.pte + extra.pte);
  const city = Math.max(0, t.city + extra.city);
  return { ...t, franchise, pte, city, total: franchise + pte + city };
}

/** New York City's general corporation tax: the rate on the allocated net income, at least the minimum for the city receipts. */
function cityTaxOf(rules: CityRules, c: CityBase): number {
  const allocated = Math.round(c.base * c.allocation) + c.adjust;
  const tier = rules.minimum.find((r) => r.below === null || c.receipts < r.below) ?? rules.minimum[rules.minimum.length - 1];
  const minimum = tier ? tier.amount : 0;
  return Math.max(minimum, Math.round(Math.max(0, allocated) * rules.rate));
}

/**
 * The corporation's own state tax by the card's rules: the rate on its net
 * income, at least the minimum for its gross receipts; the elective
 * pass-through entity tax on the same income when it elected; and the
 * city's tax when the card has city rules and the return the allocation.
 */
export function entityTax(card: StateCard, netIncome: number, grossReceipts: number, electPte: boolean, city: CityBase | null = null): EntityTax {
  const e = card.entity;
  if (!e) return { netIncome, franchise: 0, pte: 0, city: 0, total: 0 };
  const tier = e.minimum.find((r) => r.below === null || grossReceipts < r.below) ?? e.minimum[e.minimum.length - 1];
  const minimum = tier ? tier.amount : 0;
  const franchise = Math.max(minimum, Math.round(Math.max(0, netIncome) * e.rate));
  const pte = electPte && e.pte ? Math.round(scheduleTax(e.pte.brackets, Math.max(0, netIncome))) : 0;
  const cityTax = e.city && city ? cityTaxOf(e.city, city) : 0;
  return { netIncome, franchise, pte, city: cityTax, total: franchise + pte + cityTax };
}

/**
 * What the state charges the partnership or LLC itself (Form 568): the
 * annual tax plus the fee for its total income, and the elective tax on the
 * partners' income when it elected (the same election as the S corporation's).
 */
export function partnershipTax(card: StateCard, grossIncome: number, netIncome: number, electPte: boolean): EntityTax {
  const p = card.partnership;
  if (!p) return { netIncome, franchise: 0, pte: 0, city: 0, total: 0 };
  const tier = p.fee.find((r) => r.below === null || grossIncome < r.below) ?? p.fee[p.fee.length - 1];
  const franchise = p.annualTax + (tier ? tier.amount : 0);
  const pte = electPte && card.entity?.pte ? Math.round(scheduleTax(card.entity.pte.brackets, Math.max(0, netIncome))) : 0;
  return { netIncome, franchise, pte, city: 0, total: franchise + pte };
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
  /** The first entity return's own tax. */
  entity: EntityTax | null;
  /** Every entity return's own tax, in unit order. */
  entities: (EntityTax | null)[];
  /** The shareholder's or partners' share of the entity's elective tax: the credit available on the state return. */
  pteShare: number;
  numbers: ReturnNumbers;
  entityNumbers: EntityNumbers | null;
  /** The entity returns beyond the first, in `DeriveMore.entities` order. */
  otherEntityNumbers: EntityNumbers[];
  /** The state returns beyond the main one: as figured, and as lines. */
  otherSt: State[];
  otherStateNumbers: StateNumbers[];
  /** Federal net of refundable credits + state + entity + the carried penalties: the recap's total. */
  total: number;
};

/**
 * One entity return on the 1040 — an S corporation's 1120-S or a
 * partnership's 1065 — with what the before needs from it. A 1040 with one
 * entity return has one unit, as it always did; a client with several
 * businesses has one per return, each with its own write-offs zeroed and
 * its own state tax.
 */
type Unit = {
  form: "1120-S" | "1065";
  /** How the reasons and notes name it: "1120-S", or with the entity's name when there are several. */
  label: string;
  e: EntityNumbers;
  /** The state its own return was filed in, when that was read. */
  stateCode: string | null;
  gross: number;
  /** A sale's gain (Form 4797) and other income: not a write-off, the same on every scenario. */
  other: number;
  income: number;
  cogs: number;
  officerComp: number;
  pension: number;
  stateAddBack: number;
  totalDeductions: number;
  guaranteed: number;
  /** Everything else deducted on the return, zeroed with the write-offs. */
  writeOffs: number;
  /** The K-1's section 179 deduction, zeroed with the write-offs. */
  section179: number;
  /** An S corporation owner's share of the ordinary income. */
  ownershipPct: number;
  /** A partnership's: each partner's on this 1040, with their K-1s. */
  shares: number[];
  partners: Partner[];
  /** What Schedule E carries for it on the after. */
  k1After: number;
  ordinaryAfter: number;
  /* The state side, set once the card is known. */
  card: StateCard | null;
  electing: boolean;
  /** The LLC fee's base (Form 568 line 1) and the elective tax's (the partners' income). */
  feeBase: number;
  pteBase: number;
  /** The state's adjustments to the corporation's net income beyond the taxes added back, carried across. */
  stateNetAdj: number;
  cityRules: CityRules | null;
  cityIn: CityBase | null;
  /** Its own tax beyond the card's figures, fitted on the after and carried. */
  extra: { franchise: number; pte: number; city: number };
};

/**
 * A state return beyond the main one: its card, whether it's figured as a
 * part-year / nonresident return (and on what state-source income), and
 * what its total carries beyond the card, fitted on the after.
 */
type OtherState = {
  code: string;
  form: string | null;
  card: StateCard;
  read: StateNumbers;
  /** The state-source income on the after; null on a resident return. */
  source: number | null;
  /** The business income inside it, when read: it grows with the business on the before. */
  sourceBusiness: number | null;
  extra: number;
};

/**
 * Everything the engine learned from the after return once it proved it
 * could reproduce it: the fixed inputs, and `run`, which computes any
 * scenario from them.
 */
type Model = {
  shape: "soleProp" | "scorp" | "partnership";
  /** Which kinds of business the return carries; more than one with a Schedule C beside a partnership, or several entity returns. */
  kinds: { schC: boolean; scorp: boolean; partnership: boolean };
  status: FilingStatus;
  card: { federal: FederalCard; state: StateCard | null };
  year: number;
  stateCode: string | null;
  /** The entity returns, as modeled. */
  units: Unit[];
  /** The state returns beyond the main one, as modeled. */
  otherStates: OtherState[];
  run: (s: Scenario) => Outcome;
  /** The after return as the engine reproduces it. */
  after: Outcome;
  /**
   * Lines of the after return the tables didn't reproduce on their own,
   * each carried across as a fixed amount (see `Extras`). Empty means the
   * return reproduced outright: "verified to the dollar".
   */
  residuals: Mismatch[];
  /** What the engine assumed or set aside to get there, for the reviewer. */
  softNotes: string[];
  /** After-return lines the return's own figures prove misread, as they should be (see `DeriveResult.afterFixes`). */
  afterFixes: Partial<ReturnNumbers>;
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
    /** Schedule C line 31 on the after: the side business beside an S corporation (0 when there is none; a sole proprietor's is `expenses` and co.). */
    schCNet: number;
    /** Whose Schedule C it is (0 the taxpayer, 1 the spouse), as the SE tax as printed settled it. */
    schCOwner: 0 | 1;
    /** A Schedule C with no expenses beside the corporation: a payroll cleanup, the owners' pay run through it — and whether it's the officer's pay or pay among the write-offs. */
    payrollSchC: { amount: number; asSalary: boolean } | null;
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
    /** The corporation's city return (NYC-3L): the city, and its allocation of the net income. */
    city: { name: string; allocation: number; receipts: number } | null;
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
  // A K-1 alone says nothing about Schedule SE (a partner's SE comes from the
  // K-1's box 14). A Schedule C of its own beside an S corporation's K-1 —
  // modeled since v11 — is judged like any Schedule C: at a loss, or under
  // the floor, it carries no SE tax (a 2025 return: −$11,544 beside a
  // $38,480 K-1, line 23 blank).
  const schCOwn = has(r.businessNetIncome) && r.businessNetIncome !== 0;
  if (has(r.seTax) || n(r.partnershipIncome) > 0 || (n(r.scorpIncome) > 0 && !schCOwn)) return { numbers: r, seTaxNote: null };
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
 * Wages above the officer's pay that the lines don't place used to refuse
 * the derivation. They are now taken as another employer's and kept on the
 * before — the usual case, a spouse who works elsewhere — with a note
 * saying how to correct it when the corporation paid them (a spouse on its
 * payroll, whose wages leave with the write-offs). Optional W-2 lines that
 * contradict line 1z are set aside the same way, never refused on.
 */
function splitWages(
  after: ReturnNumbers,
  shape: Model["shape"],
  officerComp: number,
  /** Form 1120-S line 8: what the business paid everyone else. */
  entityWages: number,
  w2: number,
): { wages: Wages; notes: string[] } {
  const notes: string[] = [];
  let t = has(after.w2Taxpayer) ? after.w2Taxpayer : null;
  let s = has(after.w2Spouse) ? after.w2Spouse : null;
  let tE = has(after.w2TaxpayerEntity) ? after.w2TaxpayerEntity : null;
  let sE = has(after.w2SpouseEntity) ? after.w2SpouseEntity : null;

  if ((t !== null || s !== null) && off(n(t) + n(s), w2)) {
    notes.push(
      `The W-2 lines read (${fmt(n(t))} the taxpayer's, ${fmt(n(s))} the spouse's) don't add up to line 1z (${fmt(w2)}), so they're set aside and the wages are placed as line 1z alone allows`,
    );
    t = s = tE = sE = null;
  }
  if ((tE !== null && t !== null && tE > t + TOL) || (sE !== null && s !== null && sE > s + TOL)) {
    notes.push("A W-2 from the business was read as more than that person's W-2 wages altogether, so the two \"from the business\" lines are set aside");
    tE = sE = null;
  }
  const perPerson = t !== null || s !== null;

  if (shape !== "scorp") {
    // A sole proprietor's or a partner's wages are all from elsewhere; who
    // earned them matters only for the wage base (decided by the SE tax,
    // further down) and a per-person state deduction.
    const outside: [number, number] = perPerson ? [n(t), n(s)] : [w2, 0];
    return { wages: { officer: 0, officerBox1: 0, employeeEntity: 0, outside, read: perPerson }, notes };
  }

  /**
   * The business's own W-2s weren't read (or were set aside): the officer's
   * is taken as the officer's pay, and anything line 1z carries beyond it
   * as another employer's.
   */
  const unplaced = (): { wages: Wages; notes: string[] } => {
    if (w2 <= officerComp + TOL) {
      // The one W-2 is the officer's, as the engine always assumed.
      const officer: 0 | 1 = perPerson && n(t) <= 0 && n(s) > 0 ? 1 : 0;
      return { wages: { officer, officerBox1: w2, employeeEntity: 0, outside: [0, 0], read: perPerson }, notes };
    }
    const beyond = w2 - officerComp;
    // The officer is whoever has at least the officer's pay in their W-2s
    // (the taxpayer when both do, or when the lines weren't read).
    const persons: [number, number] = perPerson ? [n(t), n(s)] : [w2, 0];
    const officer: 0 | 1 = persons[0] + TOL >= officerComp ? 0 : persons[1] + TOL >= officerComp ? 1 : 0;
    const officerBox1 = Math.min(officerComp, persons[officer]);
    const outside: [number, number] = [persons[0], persons[1]];
    outside[officer] = Math.max(0, persons[officer] - officerBox1);
    notes.push(
      `The 1040 carries ${fmt(w2)} of W-2 wages${perPerson ? ` (${fmt(n(t))} the taxpayer's, ${fmt(n(s))} the spouse's)` : ""}, ${fmt(beyond)} more than the officer's pay on the 1120-S (${fmt(officerComp)}). The ${fmt(beyond)} is taken as wages from another employer and stays on the before.${
        entityWages > 0
          ? ` If the corporation paid any of it (a spouse on its payroll, inside the ${fmt(entityWages)} of salaries on line 8), type what it paid each person in the two "W-2 wages from the business" lines of the after column (show all lines) and recompute the before column — those wages then leave with the write-offs`
          : ""
      }`,
    );
    // With the per-person lines read, the grid can still show whose W-2 is
    // whose in each scenario (`read`); only who paid them was assumed.
    return { wages: { officer, officerBox1, employeeEntity: 0, outside, read: perPerson }, notes };
  };

  if (tE === null && sE === null) return unplaced();

  const entity: [number, number] = [n(tE), n(sE)];
  const entityTotal = entity[0] + entity[1];
  // Without the per-person totals, whatever line 1z carries beyond the
  // business's W-2s is taken as the taxpayer's from another employer.
  const all: [number, number] = perPerson ? [n(t), n(s)] : [entity[0] + Math.max(0, w2 - entityTotal), entity[1]];
  if (entityTotal > w2 + TOL) {
    notes.push(`The W-2s from the business (${fmt(entityTotal)}) come to more than line 1z (${fmt(w2)}), so those two lines are set aside`);
    return unplaced();
  }
  // The officer's W-2 is the one at or under officer compensation (box 1 is
  // the pay less any 401(k) deferral); the closer, the surer.
  let officer: 0 | 1 = 0;
  let officerBox1 = 0;
  if (officerComp > 0) {
    const fits = ([0, 1] as const).filter((k) => entity[k] > 0 && entity[k] <= officerComp + TOL);
    if (!fits.length) {
      notes.push(
        `The 1120-S pays ${fmt(officerComp)} of officer compensation, but no W-2 from the business on the 1040 (${fmt(entity[0])} the taxpayer's, ${fmt(entity[1])} the spouse's) is at or under it, so those two lines are set aside`,
      );
      return unplaced();
    }
    officer = fits.length === 1 ? fits[0] : officerComp - entity[0] <= officerComp - entity[1] ? 0 : 1;
    officerBox1 = entity[officer];
  }
  const employeeEntity = entityTotal - officerBox1;
  if (employeeEntity > entityWages + TOL) {
    notes.push(
      `The business's W-2s beyond the officer's (${fmt(employeeEntity)}) are more than the 1120-S deducts as salaries and wages on line 8 (${fmt(entityWages)}), so those two lines are set aside`,
    );
    return unplaced();
  }
  const outside: [number, number] = [Math.max(0, all[0] - entity[0]), Math.max(0, all[1] - entity[1])];
  return { wages: { officer, officerBox1, employeeEntity, outside, read: true }, notes };
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
  more: DeriveMore = {},
): ModelResult {
  /** The entity returns beyond the first. With none, everything below runs as it did for one business. */
  const moreEntities = entity ? (more.entities ?? []) : [];
  const several = moreEntities.length > 0;
  const reasons: string[] = [];
  const mismatches: Mismatch[] = [];
  const refuse = (): ModelResult => ({ ok: false, reasons, mismatches });
  /** Household lines the tables didn't reproduce, carried across (see `Extras`). */
  const residuals: Mismatch[] = [];
  /** What was assumed or set aside along the way, for the reviewer. */
  const softNotes: string[] = [];
  /** After-return lines the return's own figures prove misread, with what they should be: the builder corrects its after column with them. */
  const afterFixes: Partial<ReturnNumbers> = {};

  /* 1 · what the engine needs to exist */

  const year = meta.taxYear;
  const card = year ? cardFor(year, tables) : null;
  const implied = impliedLines(afterRead, card?.federal ?? null);
  let after = implied.numbers;
  // Line 21 read as line 20: the credits line taken with the child tax
  // credit already in it (line 21 = 19 + 20), so the credit would count
  // twice. The return's own arithmetic tells which line was read: line 24
  // is line 18 less line 21 (never below zero) plus line 23.
  {
    const ctc = n(after.childTaxCredit);
    const credits = n(after.nonrefundableCredits);
    if (ctc > 0 && credits >= ctc && has(after.incomeTax) && has(after.otherTaxes) && has(after.federalTotalTax)) {
      const line18 = after.incomeTax + n(after.additionalTaxes);
      const asLine20 = Math.max(0, line18 - ctc - credits) + after.otherTaxes;
      const asLine21 = Math.max(0, line18 - credits) + after.otherTaxes;
      if (off(asLine20, after.federalTotalTax) && !off(asLine21, after.federalTotalTax)) {
        after = { ...after, nonrefundableCredits: credits - ctc > 0 ? credits - ctc : null };
        softNotes.push(
          `The nonrefundable credits were read as ${fmt(credits)}, which is line 21 — the child tax credit (${fmt(ctc)}) plus line 20; line 20 is taken as ${fmt(credits - ctc)} so the credit isn't counted twice`,
        );
      }
    }
  }
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

  // The state's total tax line left blank — Ohio prints nothing on line 13
  // when the tax is $0 — but the payments and the refund or balance due
  // were read: the total is what the payments come to less the refund, plus
  // what's still owed. Said, and only when it comes out at zero or more.
  if (!has(after.stateTotalTax) && has(after.statePayments) && (has(after.stateRefund) || has(after.stateAmountOwed))) {
    const total = after.statePayments - n(after.stateRefund) + n(after.stateAmountOwed);
    if (total >= 0) {
      softNotes.push(
        `The state's total tax line wasn't read (it prints blank when the tax is $0); payments of ${fmt(after.statePayments)}${
          has(after.stateRefund) ? ` less the ${fmt(after.stateRefund)} refund` : ""
        }${has(after.stateAmountOwed) ? ` plus the ${fmt(after.stateAmountOwed)} still owed` : ""} put it at ${fmt(total)}`,
      );
      after = { ...after, stateTotalTax: total };
    }
  }

  // The K-1 income: an S corporation's or a partnership's. The reader can
  // put the Schedule E total on either line; the entity's own form, when
  // one was read, settles which it is.
  let scorpIncome = n(after.scorpIncome);
  let partnershipIncome = n(after.partnershipIncome);
  let k1Note: string | null = null;
  let s179Note: string | null = null;
  /** The entity returns beyond the first, as reconciled below. */
  let otherNumbers = moreEntities.map((x) => x.numbers);

  // A partnership's K-1 taken for rental income: Schedule E line 26 read
  // as exactly the K-1 (a loss, here, in column (i)) with no rental
  // property behind it and no K-1 line read — one 2025 return's −$4,233.
  // It's the partnership's.
  if (
    entity &&
    meta.entityForm === "1065" &&
    !several &&
    scorpIncome === 0 &&
    partnershipIncome === 0 &&
    has(after.rentalIncome) &&
    after.rentalIncome !== 0 &&
    !off(after.rentalIncome, n(entity.k1Ordinary) + n(entity.k1Guaranteed)) &&
    !has(after.rentalProfits) &&
    !has(after.rentalLosses) &&
    !has(after.rentalRents) &&
    !has(after.rentalExpenses)
  ) {
    softNotes.push(
      `Rental income was read as ${fmt(after.rentalIncome)}, which is the partnership's K-1, with no rental property behind it; it's the partnership's income (Schedule E Part II), not a rental`,
    );
    partnershipIncome = after.rentalIncome;
    after = { ...after, rentalIncome: null };
  }

  if (!several) {
  // Misreads the numbers themselves give away (engine v12). Each is fixed
  // only when the return's own figures prove it, and says so.
  const k1One = n(entity?.k1Ordinary);
  // A corporation at a loss runs through the before like any year (the
  // team's call, 2026-10-22): every deduction zeroed, so the K-1 is the
  // gross receipts. Schedule E prints the loss in column (i) without a
  // minus sign, so the 1040's line can read as the same amount positive.
  if (entity && meta.entityForm !== "1065" && k1One < 0 && scorpIncome > 0 && !off(scorpIncome, -k1One)) {
    softNotes.push(`Schedule E's S corporation line was read as ${fmt(scorpIncome)}; the K-1 is a ${fmt(-k1One)} loss, which column (i) prints without a sign — taken as ${fmt(k1One)}`);
    scorpIncome = k1One;
  } else if (entity && meta.entityForm === "1065" && k1One < 0 && partnershipIncome > 0 && !off(partnershipIncome, -k1One - n(entity.k1Ordinary2))) {
    softNotes.push(`Schedule E's partnership line was read as ${fmt(partnershipIncome)}; the K-1 is a loss, which column (i) prints without a sign — taken as ${fmt(-partnershipIncome)}`);
    partnershipIncome = -partnershipIncome;
  }
  // One K-1 put on both lines: the same amount as S corporation income and
  // as partnership income, with one entity whose K-1 is that amount.
  if (
    entity &&
    scorpIncome > 0 &&
    !off(scorpIncome, partnershipIncome) &&
    (!off(k1One, scorpIncome) || !off(k1One + n(entity.k1Ordinary2), scorpIncome))
  ) {
    softNotes.push(`Schedule E's one K-1 (${fmt(scorpIncome)}) was read as both S corporation and partnership income; it's counted once, as the ${meta.entityForm === "1065" ? "partnership's" : "corporation's"}`);
    if (meta.entityForm === "1065") scorpIncome = 0;
    else partnershipIncome = 0;
  }
  // Both spouses own the corporation: two K-1s from it on a joint return,
  // which Schedule E carries together. The household's share is the two
  // shares together (the partnership path below already adds a spouse's).
  if (
    entity &&
    meta.entityForm !== "1065" &&
    status === "mfj" &&
    has(entity.k1Ordinary2) &&
    k1One > 0 &&
    off(k1One - n(entity.k1Section179), scorpIncome + partnershipIncome) &&
    !off(k1One + entity.k1Ordinary2 - n(entity.k1Section179), scorpIncome + partnershipIncome)
  ) {
    const both = k1One + entity.k1Ordinary2;
    softNotes.push(
      `Both spouses hold K-1s from the corporation (${fmt(k1One)} and ${fmt(entity.k1Ordinary2)}); Schedule E carries the two together, so the household's share is ${fmt(both)}${
        has(entity.ownershipPct) && has(entity.ownershipPct2) ? ` (${entity.ownershipPct + entity.ownershipPct2}%)` : ""
      }`,
    );
    entity = {
      ...entity,
      k1Ordinary: both,
      ownershipPct: has(entity.ownershipPct) && has(entity.ownershipPct2) ? entity.ownershipPct + entity.ownershipPct2 : entity.ownershipPct,
      k1Ordinary2: null,
      ownershipPct2: null,
    };
  }
  // The reader can also split the rows between the two lines (Client E: one
  // partner's row as S corporation income, the other's as partnership
  // income), so with one entity attached both lines are its income. The
  // K-1 reconciliation further down refuses if the sum doesn't match the
  // entity's own K-1s — a genuine second K-1 still can't slip through.
  if (meta.entityForm === "1065" && scorpIncome !== 0) {
    k1Note =
      partnershipIncome !== 0
        ? `Schedule E's K-1 rows were read partly as S corporation income (${fmt(scorpIncome)}) and partly as partnership income (${fmt(partnershipIncome)}) — the entity return is a Form 1065, so all ${fmt(scorpIncome + partnershipIncome)} is the partnership's`
        : `The ${fmt(scorpIncome)} read as S corporation income is the partnership's K-1 income — the entity return is a Form 1065`;
    partnershipIncome += scorpIncome;
    scorpIncome = 0;
  } else if (meta.entityForm === "1120-S" && partnershipIncome !== 0) {
    k1Note =
      scorpIncome !== 0
        ? `Schedule E's K-1 rows were read partly as partnership income (${fmt(partnershipIncome)}) and partly as S corporation income (${fmt(scorpIncome)}) — the entity return is a Form 1120-S, so all ${fmt(scorpIncome + partnershipIncome)} is the corporation's`
        : `The ${fmt(partnershipIncome)} read as partnership income is the S corporation's K-1 income — the entity return is a Form 1120-S`;
    scorpIncome += partnershipIncome;
    partnershipIncome = 0;
  }
  // Schedule E nets the K-1's section 179 deduction (box 11, column (j))
  // off the ordinary income; a reader that took column (k) alone is
  // reconciled here, before the income is split up.
  if (entity && scorpIncome > 0) {
    const k1 = n(entity.k1Ordinary);
    const s179 = n(entity.k1Section179);
    if (s179 > 0 && !off(k1, scorpIncome) && off(k1 - s179, scorpIncome)) {
      s179Note = `Schedule E's S corporation income was read as the K-1's ${fmt(k1)} of ordinary income; its ${fmt(s179)} section 179 deduction (column (j)) nets it to ${fmt(k1 - s179)}, which is what Schedule 1 carries`;
      scorpIncome = k1 - s179;
    }
  }
  // The 1040 wins (the team's call, 2026-10-22): when a sole owner's K-1
  // on the 1120-S isn't what Schedule E carries, the 1040 is what the tax
  // was figured on, so the corporation's figures are taken from it. The
  // difference sits in the officer's pay when the 1040's W-2 says so (an
  // 1120-S printed before the payroll was final — Case 26's $42,280 of pay
  // against a $40,000 W-2, the $2,280 on the K-1 instead), and in the
  // write-offs otherwise.
  if (
    entity &&
    meta.entityForm === "1120-S" &&
    scorpIncome !== 0 &&
    !has(entity.k1Ordinary2) &&
    has(entity.k1Ordinary) &&
    has(entity.ordinaryIncome) &&
    !off(entity.k1Ordinary, entity.ordinaryIncome)
  ) {
    const s179 = n(entity.k1Section179);
    const implied = scorpIncome + s179;
    const diff = implied - entity.k1Ordinary;
    if (off(implied, entity.k1Ordinary)) {
      const pay = n(entity.officerComp);
      const w2Read = n(after.w2Income);
      const intoPay = pay > 0 && pay - diff >= 0 && !off(pay - diff, w2Read);
      const other = n(entity.otherDeductions);
      if (intoPay || other - diff >= 0) {
        softNotes.push(
          `The 1120-S's K-1 (${fmt(entity.k1Ordinary)}) isn't what the 1040's Schedule E carries (${fmt(implied)}${s179 ? ` before its ${fmt(s179)} section 179 deduction` : ""}); the 1040 is what the tax was figured on, so the corporation's figures are taken from it — the ${fmt(Math.abs(diff))} ${
            intoPay ? `comes off the officer's pay (${fmt(pay)} → ${fmt(pay - diff)}, the W-2 on the 1040)` : `comes off its other deductions`
          }`,
        );
        entity = {
          ...entity,
          k1Ordinary: implied,
          ordinaryIncome: entity.ordinaryIncome + diff,
          totalDeductions: n(entity.totalDeductions) - diff,
          ...(intoPay ? { officerComp: pay - diff } : { otherDeductions: other - diff }),
        };
      }
    }
  }
  } else if (entity) {
    // Several entity returns: Schedule E's two K-1 lines are every K-1
    // added up, the S corporations' on one and the partnerships' on the
    // other. Each return's own form says which line its K-1 belongs on.
    const forms = [formOfEntity(meta.entityForm ?? null, entity), ...moreEntities.map((x) => formOfEntity(x.form, x.numbers))];
    let all = [entity, ...otherNumbers];
    const names = [meta.entityName ?? null, ...moreEntities.map((x) => x.name ?? null)].map((name, i) => entityName(name, forms[i], i));
    // A second owner's K-1 is on this 1040 only when it's a joint return.
    if (status !== "mfj") {
      all = all.map((x, i) => {
        if (!has(x.k1Ordinary2)) return x;
        softNotes.push(`${names[i]}'s second K-1 (${fmt(x.k1Ordinary2)}) isn't on this ${status ? FILING_STATUS_LABEL[status] : ""} return — it's another owner's`);
        return { ...x, k1Ordinary2: null, k1Guaranteed2: null, ownershipPct2: null };
      });
    }
    const k1Of = (x: EntityNumbers, form: "1120-S" | "1065") =>
      form === "1120-S"
        ? n(x.k1Ordinary) + n(x.k1Ordinary2) - n(x.k1Section179)
        : n(x.k1Ordinary) + n(x.k1Guaranteed) + n(x.k1Ordinary2) + n(x.k1Guaranteed2);
    const want = (form: "1120-S" | "1065") => all.reduce((s, x, i) => s + (forms[i] === form ? k1Of(x, form) : 0), 0);
    // A second K-1 that isn't on Schedule E is another owner's (the reader
    // reports two when the entity has two owners).
    if (off(want("1120-S") + want("1065"), scorpIncome + partnershipIncome)) {
      for (let i = 0; i < all.length; i++) {
        if (!has(all[i].k1Ordinary2)) continue;
        const without = { ...all[i], k1Ordinary2: null, k1Guaranteed2: null, ownershipPct2: null };
        const trial = all.map((x, j) => (j === i ? without : x));
        const total = trial.reduce((s, x, j) => s + k1Of(x, forms[j]), 0);
        if (!off(total, scorpIncome + partnershipIncome)) {
          softNotes.push(`${names[i]}'s second K-1 (${fmt(n(all[i].k1Ordinary2))}) isn't on this 1040's Schedule E — it's another owner's`);
          all = trial;
          break;
        }
      }
    }
    // Both spouses holding K-1s from one corporation: Schedule E carries them together.
    all = all.map((x, i) =>
      forms[i] === "1120-S" && has(x.k1Ordinary2)
        ? {
            ...x,
            k1Ordinary: n(x.k1Ordinary) + x.k1Ordinary2,
            ownershipPct: has(x.ownershipPct) && has(x.ownershipPct2) ? x.ownershipPct + x.ownershipPct2 : x.ownershipPct,
            k1Ordinary2: null,
            ownershipPct2: null,
          }
        : x,
    );
    const wantS = want("1120-S");
    const wantP = want("1065");
    if (!off(wantS + wantP, scorpIncome + partnershipIncome)) {
      if (off(wantS, scorpIncome) || off(wantP, partnershipIncome)) {
        k1Note = `Schedule E's K-1 rows were read as ${fmt(scorpIncome)} of S corporation income and ${fmt(partnershipIncome)} of partnership income; by the entity returns' own forms it's ${fmt(wantS)} from the corporations and ${fmt(wantP)} from the partnerships`;
      }
      scorpIncome = wantS;
      partnershipIncome = wantP;
    } else {
      reasons.push(
        `The K-1s on the ${all.length} entity returns (${all.map((x, i) => `${names[i]} ${fmt(k1Of(x, forms[i]))}`).join(", ")}) add up to ${fmt(wantS + wantP)}, but Schedule E carries ${fmt(scorpIncome + partnershipIncome)} — another K-1 whose return wasn't added, a basis limitation, or a passive loss`,
      );
    }
    entity = all[0];
    otherNumbers = all.slice(1);
  }
  after = { ...after, scorpIncome: scorpIncome !== 0 ? scorpIncome : null, partnershipIncome: partnershipIncome !== 0 ? partnershipIncome : null };
  if (!several && scorpIncome !== 0 && partnershipIncome !== 0) {
    reasons.push(
      "The return carries both an S corporation K-1 and a partnership K-1, and only one entity return was added — add the other entity's return (1120-S or 1065) so each business gets its own before",
    );
  }
  const k1Income = scorpIncome + partnershipIncome;

  // A Schedule C that only passes through income reported under the
  // owner's SSN and picked up on the entity's return nets to zero — the
  // receipts and the same amount of "other expenses" — and isn't a
  // business of its own.
  let nomineeNote: string | null = null;
  const schCGross = n(after.grossReceipts);
  if (
    k1Income !== 0 &&
    schCGross > 0 &&
    n(after.businessNetIncome) === 0 &&
    !off(schCGross - n(after.cogs) - n(after.totalExpenses) - n(after.homeOffice), 0)
  ) {
    after = { ...after, businessNetIncome: null, grossReceipts: null, cogs: null, totalExpenses: null, homeOffice: null, schCWages: null, schCDepreciation: null };
    for (const k of SCH_C_LINE_KEYS) after[k] = null;
    nomineeNote = `A Schedule C with ${fmt(schCGross)} of receipts netted to $0 is income issued under the owner's SSN and picked up on the entity's return — not a business of its own, so it's left out`;
  }

  // A Schedule C with a profit or loss of its own. Alongside an S
  // corporation (engine v11: a side business under the owner's SSN next
  // to the corporation) or a partnership (v13: a sole proprietor who is
  // also a partner) it is modeled as a business of its own — its expenses
  // zeroed on the before like a sole proprietor's, its Schedule SE figured
  // with the same person's partnership share and against the W-2 wages
  // that stay.
  const schC = has(after.businessNetIncome) && after.businessNetIncome !== 0;
  /** Each entity return's form, in input order: the first, then the others. */
  const unitForms = several ? [formOfEntity(meta.entityForm ?? null, entity as EntityNumbers), ...moreEntities.map((x, i) => formOfEntity(x.form, otherNumbers[i]))] : [];
  // With no K-1 income read but the entity's return attached and no Schedule
  // C with a profit or loss of its own, the business is the entity's: asking for Schedule C lines
  // would point the reviewer at the wrong page (the nominee Schedule Cs on a
  // partner's return are left out by design). The required list below then
  // names the K-1 line that's missing. Several entity returns are an S
  // corporation's shape when any of them is one.
  const shape: Model["shape"] = several
    ? unitForms.includes("1120-S")
      ? "scorp"
      : "partnership"
    : partnershipIncome !== 0
      ? "partnership"
      : scorpIncome !== 0
        ? "scorp"
        : entity && !schC
          ? meta.entityForm === "1065"
            ? "partnership"
            : meta.entityForm === "1120-S"
              ? "scorp"
              : "soleProp"
          : "soleProp";
  const kinds: Model["kinds"] = {
    scorp: several ? unitForms.includes("1120-S") : shape === "scorp",
    partnership: several ? unitForms.includes("1065") : shape === "partnership",
    schC: false,
  };
  kinds.schC = shape === "soleProp" || (schC && (kinds.scorp || kinds.partnership));
  const required: ReturnFieldKey[] =
    shape === "scorp"
      ? [
          "scorpIncome",
          "totalIncome",
          "agi",
          "taxableIncome",
          "incomeTax",
          "federalTotalTax",
          // The side business's own lines, when there is one.
          ...(schC ? (["grossReceipts", "businessNetIncome", "seTax"] as ReturnFieldKey[]) : []),
          ...(kinds.partnership && !schC ? (["seTax"] as ReturnFieldKey[]) : []),
        ]
      : shape === "partnership"
        ? [
            "partnershipIncome",
            "totalIncome",
            "agi",
            "taxableIncome",
            "incomeTax",
            "seTax",
            "federalTotalTax",
            ...(schC ? (["grossReceipts", "businessNetIncome"] as ReturnFieldKey[]) : []),
          ]
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
  if (shape === "partnership" && !entity) {
    reasons.push(
      "The 1040 carries partnership income from a K-1 — add the partnership's 1065 so the before can be computed from its gross receipts",
    );
  }
  /** The entity returns the before is figured from, each with how the reasons name it. */
  const unitInputs: { e: EntityNumbers; form: "1120-S" | "1065"; name: string; stateCode: string | null }[] = several
    ? [entity as EntityNumbers, ...otherNumbers].map((x, i) => ({
        e: x,
        form: unitForms[i],
        name: entityName(i === 0 ? (meta.entityName ?? null) : (moreEntities[i - 1].name ?? null), unitForms[i], i),
        stateCode: i === 0 ? (meta.entityStateCode ?? null) : (moreEntities[i - 1].stateCode ?? null),
      }))
    : shape !== "soleProp" && entity
      ? [{ e: entity, form: shape === "partnership" ? "1065" : "1120-S", name: shape === "partnership" ? "1065" : "1120-S", stateCode: meta.entityStateCode ?? null }]
      : [];
  for (const ui of unitInputs) {
    const need: EntityFieldKey[] = ["grossReceipts", "totalIncome", "totalDeductions", "ordinaryIncome", "k1Ordinary"];
    const miss = need.filter((k) => !has(ui.e[k]));
    if (miss.length) {
      reasons.push(`These lines weren't read from the ${ui.name}: ${miss.map(entityLabel).join(", ")}`);
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

  // The Schedule C — the sole proprietor's business, or the side business
  // next to an S corporation or a partnership — has to be gross receipts
  // less expenses.
  const hasSchC = kinds.schC;
  const gross = hasSchC ? n(after.grossReceipts) : 0;
  const netAfter = hasSchC ? n(after.businessNetIncome) : 0;
  // Line 28 blank (no expenses) with line 29 or 31 taken for it: the
  // "expenses" read are the net profit itself, and the receipts already
  // equal that profit. The expenses are $0.
  if (
    hasSchC &&
    n(after.totalExpenses) > 0 &&
    !off(n(after.totalExpenses), netAfter) &&
    !off(gross - n(after.cogs) - n(after.homeOffice), netAfter)
  ) {
    softNotes.push(
      `Schedule C's total expenses were read as ${fmt(n(after.totalExpenses))}, which is its net profit (line 29 or 31); line 28 is blank, so the expenses are $0`,
    );
    after = { ...after, totalExpenses: 0 };
  }
  const expenses = n(after.totalExpenses);
  const homeOffice = n(after.homeOffice);
  // Cost of goods sold on a Schedule C is purchases and materials — a
  // write-off like the rest, zeroed on the before with the expenses.
  const schCogs = hasSchC ? n(after.cogs) : 0;
  if (hasSchC && off(gross - schCogs - expenses - homeOffice, netAfter)) {
    reasons.push(
      `Schedule C net profit (${fmt(netAfter)}) isn't gross receipts − cost of goods sold − expenses − home office (${fmt(gross - schCogs - expenses - homeOffice)}): returns and allowances, or other income on line 6 — zeroing the expenses wouldn't give the before`,
    );
    return refuse();
  }

  // Each entity return, one unit each. With several, each reason names the
  // return; with one, the 1040's own K-1 line is checked against it here
  // (with several, the K-1s were reconciled together above).
  const unitBase = (ui: (typeof unitInputs)[number]) => {
    const e = ui.e;
    const gross = n(e.grossReceipts);
    // A sale's gain (Form 4797) and other income on the entity's return:
    // not a write-off, so the same on every scenario, inside the ordinary
    // income. Receipts-based measures (minimum taxes, a city's receipts)
    // stay on the gross receipts alone.
    const other = n(e.otherIncome);
    return {
      form: ui.form,
      label: ui.name,
      e,
      stateCode: ui.stateCode,
      gross,
      other,
      income: gross + other,
      cogs: n(e.cogs),
      officerComp: n(e.officerComp),
      pension: n(e.pension),
      stateAddBack: n(e.stateAddBack),
      totalDeductions: n(e.totalDeductions),
      guaranteed: n(e.guaranteedPayments),
      ordinaryAfter: n(e.ordinaryIncome),
      card: null,
      electing: false,
      feeBase: 0,
      pteBase: 0,
      stateNetAdj: 0,
      cityRules: null,
      cityIn: null,
      extra: { franchise: 0, pte: 0, city: 0 },
    };
  };
  /** A reason about one unit: as it always read with one entity return, named with several. */
  const unitReason = (ui: (typeof unitInputs)[number], message: string) => reasons.push(several ? `${ui.name}: ${message}` : message);

  // S corporation: the 1120-S has to be gross receipts less cost of goods
  // sold less deductions, and the K-1 has to be what the 1040 reports.
  const scorpUnit = (ui: (typeof unitInputs)[number]): Unit => {
    const u = unitBase(ui);
    const e = ui.e;
    const { gross: eGross, other: eOther, cogs, officerComp, pension, stateAddBack, totalDeductions } = u;
    let ownershipPct = 1;
    const eTotal = e.totalIncome as number;
    const ordinary = e.ordinaryIncome as number;
    const k1 = e.k1Ordinary as number;
    if (off(eGross - cogs + eOther, eTotal)) {
      unitReason(
        ui,
        `The 1120-S's total income (${fmt(eTotal)}) isn't gross receipts less cost of goods sold${eOther ? " plus its other income" : ""} (${fmt(eGross - cogs + eOther)}): returns and allowances, or a Form 4797 gain or other income on lines 4–5 that wasn't read`,
      );
    }
    if (off(eTotal - totalDeductions, ordinary)) {
      unitReason(ui, `The 1120-S's ordinary income (${fmt(ordinary)}) isn't total income less total deductions (${fmt(eTotal - totalDeductions)})`);
    }
    // The owner's share: the K-1's part of the ordinary income — a loss as
    // much as a profit (a loss year runs through the before like any other,
    // the team's call 2026-10-22) — or item G's percentage when the year
    // came out at nothing.
    if (ordinary !== 0 && k1 !== 0 && Math.sign(ordinary) === Math.sign(k1)) {
      ownershipPct = round4(k1 / ordinary);
      if (has(e.ownershipPct) && off(e.ownershipPct, ownershipPct * 100)) {
        unitReason(
          ui,
          `The K-1 reports ${fmt(k1)} of ${fmt(ordinary)} (${Math.round(ownershipPct * 1000) / 10}%), but item G says ${e.ownershipPct}% — separately stated items or a mid-year change the engine doesn't model`,
        );
      }
    } else if (ordinary === 0 || k1 === 0) {
      ownershipPct = has(e.ownershipPct) ? e.ownershipPct / 100 : 1;
    } else {
      unitReason(ui, `The K-1 (${fmt(k1)}) and the 1120-S's ordinary income (${fmt(ordinary)}) have opposite signs — one of the two misread`);
    }
    // Schedule E carries the K-1's ordinary income less its section 179
    // deduction (box 11, column (j)); a read of column (k) alone was
    // reconciled above.
    const s179 = n(e.k1Section179);
    if (!several && off(k1 - s179, scorpIncome)) {
      reasons.push(
        `The 1040's S corporation income (${fmt(scorpIncome)}) doesn't match the K-1's ordinary income (${fmt(k1)})${s179 > 0 ? ` less its ${fmt(s179)} section 179 deduction (${fmt(k1 - s179)})` : ""} — a second K-1, a basis limitation, or a passive loss`,
      );
    }
    if (totalDeductions - officerComp - pension - stateAddBack < -TOL) {
      unitReason(
        ui,
        `Officer compensation, the pension plan and the state taxes added back (${fmt(officerComp + pension + stateAddBack)}) come to more than the 1120-S's total deductions (${fmt(totalDeductions)})`,
      );
    }
    return {
      ...u,
      writeOffs: Math.max(0, totalDeductions - officerComp - pension - stateAddBack),
      section179: s179,
      ownershipPct,
      shares: [],
      partners: [],
      k1After: k1 - s179,
    };
  };

  // Partnership: the 1065 has to be gross receipts less cost of goods sold
  // less deductions, and the K-1s on this 1040 — the owner's, and the
  // spouse's when both are partners — have to add up to what Schedule E
  // reports, each at its share of the ordinary income.
  const partnershipUnit = (ui: (typeof unitInputs)[number]): Unit => {
    const u = unitBase(ui);
    const e = ui.e;
    const { gross: eGross, other: eOther, cogs, totalDeductions, guaranteed } = u;
    const partners: Partner[] = [];
    const shares: number[] = [];
    const eTotal = e.totalIncome as number;
    const ordinary = e.ordinaryIncome as number;
    if (off(eGross - cogs + eOther, eTotal)) {
      unitReason(
        ui,
        `The 1065's total income (${fmt(eTotal)}) isn't gross receipts less cost of goods sold${eOther ? " plus its other income" : ""} (${fmt(eGross - cogs + eOther)}): returns and allowances, or income from another partnership, a Form 4797 gain or other income on lines 4–7 that wasn't read`,
      );
    }
    if (off(eTotal - totalDeductions, ordinary)) {
      unitReason(ui, `The 1065's ordinary income (${fmt(ordinary)}) isn't total income less total deductions (${fmt(eTotal - totalDeductions)})`);
    }
    if (guaranteed > totalDeductions + TOL) {
      unitReason(ui, `Guaranteed payments (${fmt(guaranteed)}) come to more than the 1065's total deductions (${fmt(totalDeductions)})`);
    }
    let k1s = [
      { ordinary: n(e.k1Ordinary), guaranteed: n(e.k1Guaranteed), pct: has(e.ownershipPct) ? e.ownershipPct / 100 : null },
      ...(has(e.k1Ordinary2)
        ? [{ ordinary: e.k1Ordinary2, guaranteed: n(e.k1Guaranteed2), pct: has(e.ownershipPct2) ? e.ownershipPct2 / 100 : null }]
        : []),
    ];
    let k1Sum = k1s.reduce((s, k) => s + k.ordinary + k.guaranteed, 0);
    // The reader reports a second K-1 when the partnership has two owners;
    // when only the first is on this 1040's Schedule E, the second is
    // another partner's (one partnership's 60/40 split, the 40% not on the
    // return).
    if (!several && k1s.length > 1 && off(k1Sum, partnershipIncome) && !off(k1s[0].ordinary + k1s[0].guaranteed, partnershipIncome)) {
      softNotes.push(
        `The 1065's second K-1 (${fmt(k1s[1].ordinary)}${k1s[1].pct !== null ? `, ${Math.round(k1s[1].pct * 1000) / 10}%` : ""}) isn't on this 1040's Schedule E, which carries the first alone — it's another partner's`,
      );
      k1s = [k1s[0]];
      k1Sum = k1s[0].ordinary + k1s[0].guaranteed;
    }
    if (!several && off(k1Sum, partnershipIncome)) {
      reasons.push(
        `The 1040's partnership income (${fmt(partnershipIncome)}) doesn't match the K-1s' ordinary income and guaranteed payments (${fmt(k1Sum)}) — another K-1, a basis limitation, or a passive loss`,
      );
    }
    const gpOnReturn = k1s.reduce((s, k) => s + k.guaranteed, 0);
    if (gpOnReturn > guaranteed + TOL) {
      unitReason(ui, `The K-1s' guaranteed payments (${fmt(gpOnReturn)}) are more than the 1065 deducts on line 10 (${fmt(guaranteed)})`);
    }
    k1s.forEach((k, i) => {
      const pct = k.pct ?? (ordinary !== 0 ? round4(k.ordinary / ordinary) : 0);
      if (ordinary !== 0 && off(k.ordinary, Math.round(ordinary * pct))) {
        unitReason(
          ui,
          `A K-1 reports ${fmt(k.ordinary)} of the 1065's ${fmt(ordinary)}, but its profit share is ${Math.round(pct * 1000) / 10}% (${fmt(Math.round(ordinary * pct))}) — a special allocation or a mid-year change the engine doesn't model`,
        );
      }
      shares.push(pct);
      // The first K-1 is the taxpayer's, the second the spouse's.
      partners.push({ person: i === 0 ? 0 : 1, ordinary: k.ordinary, guaranteed: k.guaranteed, premiums: 0, wages: 0 });
    });
    if (shares.reduce((s, p) => s + p, 0) > 1.001) {
      unitReason(ui, "The partners' profit shares on this return add up to more than 100%");
    }
    return {
      ...u,
      writeOffs: Math.max(0, totalDeductions - guaranteed),
      section179: 0,
      ownershipPct: 1,
      shares,
      partners,
      // With one entity return, what the 1040's line carries for it.
      k1After: several ? k1Sum : partnershipIncome,
    };
  };

  const units: Unit[] = [];
  for (const ui of unitInputs) {
    units.push(ui.form === "1120-S" ? scorpUnit(ui) : partnershipUnit(ui));
    // One entity return: refused on its own reasons, as it always was.
    if (!several && reasons.length) return refuse();
  }
  if (reasons.length) return refuse();
  const scorpUnits = units.filter((u) => u.form === "1120-S");
  const partnershipUnits = units.filter((u) => u.form === "1065");
  const sum = (list: Unit[], f: (u: Unit) => number) => list.reduce((s, u) => s + f(u), 0);
  // The household's figures, every entity return together (with one, its own).
  const cogs = sum(units, (u) => u.cogs);
  const officerComp = sum(scorpUnits, (u) => u.officerComp);
  const pension = sum(units, (u) => u.pension);
  const stateAddBack = sum(units, (u) => u.stateAddBack);
  const guaranteed = sum(partnershipUnits, (u) => u.guaranteed);
  /** Wages the S corporations paid others (1120-S line 8) and the partnerships paid (1065 line 9). */
  const scorpWages = sum(scorpUnits, (u) => n(u.e.wages));
  const partnershipWages = sum(partnershipUnits, (u) => n(u.e.wages));
  // Each partnership's partners, the household's all together; the
  // spouse's K-1 (the second on a return) is person 1.
  let partners: Partner[] = partnershipUnits.flatMap((u) => u.partners);
  /** The first S corporation's owner share, for the notes; with several, each unit has its own. */
  const ownershipPct = scorpUnits[0]?.ownershipPct ?? 1;

  // A Schedule C with receipts and no expenses at all is never a business
  // of its own (the tax team's rule, 2026-10-22): it's only filed for an S
  // corporation's payroll cleanup — the owners' pay the corporation
  // deducted without running payroll, put through a Schedule C so its
  // Social Security and Medicare tax gets paid. Beside the corporation it
  // leaves with that deduction on the before (officer compensation when
  // that covers it, the other deductions it was booked among otherwise).
  // With no corporation it's a misread.
  const payrollSchC = hasSchC && gross > 0 && expenses === 0 && schCogs === 0 && homeOffice === 0 && !off(netAfter, gross);
  if (payrollSchC && !kinds.scorp) {
    reasons.push(
      `The Schedule C has ${fmt(gross)} of receipts and no expenses. The tax team only files one like that for an S corporation's payroll cleanup (the owners' pay run through a Schedule C) — add the corporation's 1120-S so its before is figured with it, or check that the Schedule C's expenses (line 28) were read`,
    );
    return refuse();
  }
  /**
   * The payroll cleanup is the officer's pay when the officer compensation
   * not already on a W-2 covers it: what Form 7206 line 11 (the officer's
   * Medicare wages from the corporation, plus the premiums) or the
   * business's own W-2 lines put on a W-2 doesn't count. When neither was
   * read, the officer compensation alone decides (one 2025 return: $65,000
   * of officer pay, a $65,000 Schedule C). Otherwise it's pay booked among
   * the other deductions — a spouse's (another 2025 return: the officer's
   * pay all on the W-2, the spouse's $55,283 on a Schedule C).
   */
  const officerOnW2 = has(after.medicareWages)
    ? after.medicareWages + (has(after.sehiPaid) ? after.sehiPaid : n(after.sehiDeduction))
    : has(after.w2TaxpayerEntity) || has(after.w2SpouseEntity)
      ? n(after.w2TaxpayerEntity) + n(after.w2SpouseEntity)
      : 0;
  const payrollAsSalary = payrollSchC && Math.max(0, officerComp - officerOnW2) + TOL >= netAfter;
  /** Officer pay that went on a W-2: all of it, less what the cleanup ran through the Schedule C. */
  const officerCompW2 = payrollAsSalary ? Math.max(0, officerComp - netAfter) : officerComp;

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
  // payments — that is how the partnership paid them. With a Schedule C
  // beside it and no guaranteed payments, they're the Schedule C's.
  const gpOnReturn = partners.reduce((s, p) => s + p.guaranteed, 0);
  const premiumsViaPartners = shape === "partnership" && (!hasSchC || gpOnReturn > 0);
  const partnerPremiums = premiumsViaPartners ? n(sehiPaid) : 0;
  if (premiumsViaPartners) {
    partners = partners.map((p) => ({
      ...p,
      premiums: gpOnReturn > 0 ? Math.round((partnerPremiums * p.guaranteed) / gpOnReturn) : Math.round(partnerPremiums / partners.length),
    }));
  }

  // Whose W-2s are whose and who paid them.
  // With all the officer's pay run through the payroll cleanup's Schedule
  // C, every W-2 on the 1040 is another employer's.
  const allOutside = payrollAsSalary && officerCompW2 <= TOL;
  const split = allOutside ? splitWages(after, "soleProp", 0, 0, w2) : splitWages(after, shape, officerCompW2, scorpWages, w2);
  let wages = split.wages;
  softNotes.push(...split.notes);
  if (payrollSchC) {
    softNotes.push(
      `The ${fmt(netAfter)} Schedule C has no expenses: it's the owners' pay the corporation deducted ${
        payrollAsSalary
          ? `as officer compensation (${fmt(officerComp)})`
          : officerOnW2 > 0 && officerComp > 0
            ? `among its other deductions (the officer's ${fmt(officerComp)} is on the W-2 — a spouse's pay, most likely)`
            : `among its other deductions (its officer compensation is only ${fmt(officerComp)})`
      }, run through a Schedule C for a payroll cleanup, so it pays the self-employment tax on the after and leaves with that deduction on the before${
        allOutside && w2 > 0 ? `. The ${fmt(w2)} of W-2 wages are another employer's` : ""
      }`,
    );
  }
  const outsideWages = wages.outside[0] + wages.outside[1];

  // The owner's pay on an S corporation: officer compensation is the cash
  // wages (Medicare wages) plus the health insurance run through payroll;
  // box 1 is that less the 401(k) deferral.
  const healthInsurance = shape === "scorp" ? n(sehiPaid) : 0;
  const medicareWagesRead = has(after.medicareWages) ? after.medicareWages : null;
  // (What went on a W-2: the payroll cleanup's part of the pay never did.)
  const officerMedicare = shape === "scorp" ? (medicareWagesRead ?? Math.max(0, officerCompW2 - healthInsurance)) : 0;
  const deferral = shape === "scorp" ? Math.max(0, officerCompW2 - wages.officerBox1) : 0;
  /**
   * Officer pay that is neither Medicare wages nor the health premiums: a
   * 2% shareholder's HSA contribution, group-term life or similar fringe
   * benefit, which the corporation deducts as officer pay and the W-2
   * keeps out of box 5. Carried with the salary (Client K: $263), so the
   * owner's Medicare wages in every scenario are as the W-2 has them.
   */
  const otherOfficerPay = shape === "scorp" && medicareWagesRead !== null ? officerCompW2 - medicareWagesRead - healthInsurance : 0;
  if (shape === "scorp" && medicareWagesRead !== null && off(medicareWagesRead + healthInsurance, officerCompW2)) {
    residuals.push({ line: "Officer compensation (1120-S line 7)", read: officerCompW2, computed: (medicareWagesRead as number) + healthInsurance });
    softNotes.push(
      `Officer compensation on the 1120-S (${fmt(officerComp)}) is ${fmt(Math.abs(otherOfficerPay))} ${otherOfficerPay > 0 ? "more" : "less"} than the Medicare wages (${fmt(medicareWagesRead)}) plus the health insurance premiums (${fmt(healthInsurance)}) — ${
        otherOfficerPay > 0
          ? "another benefit in the owner's pay (an HSA contribution, group-term life or similar), carried with the salary and, like the premiums, outside the Medicare wages"
          : "part of the Medicare wages isn't officer pay (a bonus booked elsewhere, or box 5 read off another W-2); the Medicare wages as read are used"
      }`,
    );
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
  const section179 = sum(scorpUnits, (u) => u.section179);
  /** Every K-1 on Schedule E, as the after carries them; and the S corporations' alone. */
  const k1After = sum(units, (u) => u.k1After);
  const scorpK1After = sum(scorpUnits, (u) => u.k1After);
  // When no mix of dependents gives the credit on line 19, the counts as
  // listed stand and the difference on line 19 is carried across below.
  const dependentsInferred = inferDependents(fed, status, after);
  const { children, others } = dependentsInferred ?? {
    children: has(after.qualifyingChildren)
      ? Math.max(0, Math.round(after.qualifyingChildren))
      : Math.max(0, Math.round(n(after.dependentCount))),
    others: has(after.otherDependents) ? Math.max(0, Math.round(after.otherDependents)) : 0,
  };
  if (dependentsInferred === null) {
    softNotes.push(
      `The credit on line 19 (${fmt(n(after.childTaxCredit))}) isn't what the ${year} tables give for any mix of qualifying children (${fmt(fed.childTaxCredit.perChild)} each) and other dependents (${fmt(fed.childTaxCredit.perOtherDependent)} each) at this income, so the dependents as listed (${children} ${children === 1 ? "child" : "children"}, ${others} other) are used and the difference on line 19 is carried across`,
    );
  }
  const childCareCredit = n(after.childCareCredit);
  const otherCredits = Math.max(0, n(after.nonrefundableCredits) - childCareCredit);
  const qbiRead: QbiInputs | null = has(after.qbiIncome)
    ? { income: after.qbiIncome, w2Wages: n(after.qbiW2Wages), ubia: n(after.qbiUbia) }
    : null;
  // Line 32 bundles line 31 (an extension payment, excess Social Security
  // withheld) in with the refundable credits; only the credits are credits.
  let otherPayments = n(after.otherPayments);
  let refundableRead = Math.max(0, n(after.federalRefundableCredits) - otherPayments);
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
  // loss, as its sign says. The properties' own net is line 23a less 23e
  // when both were read — line 26 is after Form 8582, where prior years'
  // suspended losses can swallow a profit (a 2025 return: an $8,428
  // profit, line 26 $0), so it's the better figure to fill in from.
  let rental: Rental | null = null;
  if (hasRental) {
    const ownNet = has(after.rentalRents) && has(after.rentalExpenses) ? after.rentalRents - after.rentalExpenses : null;
    const knownNet = ownNet ?? rentalReadNet;
    const profits = has(after.rentalProfits)
      ? after.rentalProfits
      : Math.max(0, has(after.rentalLosses) && ownNet !== null ? ownNet + after.rentalLosses : knownNet + n(after.rentalLosses));
    const losses = has(after.rentalLosses) ? after.rentalLosses : Math.max(0, n(after.rentalProfits) - knownNet);
    // The before zeroes the rental expenses, so it needs the rents. Line
    // 23a less line 23e is the properties' net (line 21 added up): either
    // line gives the other, and with both read they have to agree.
    const net = profits - losses;
    const rentsRead = has(after.rentalRents) ? after.rentalRents : null;
    const expensesLine = has(after.rentalExpenses) ? after.rentalExpenses : null;
    if (rentsRead === null && expensesLine === null) {
      // Without the rents the expenses can't be zeroed, so the rentals go
      // across as filed and the split has no rental step — said, not refused.
      softNotes.push(
        `Schedule E lines 23a (the rents) and 23e (the expenses) weren't read, so the rentals' ${fmt(net)} net is carried to the before as filed rather than the expenses zeroed like the Schedule C's. Read the two lines and recompute the before column to credit the rental bookkeeping`,
      );
      rental = { profits, losses, prior: n(after.passivePriorUnallowed), reps: n(after.rentalReps) !== 0, qbi: true, rents: Math.max(0, net), expenses: 0, expensesRead: false };
    } else {
      const rents = rentsRead ?? net + (expensesLine as number);
      const rentalExpenses = expensesLine ?? rents - net;
      if (off(rents - rentalExpenses, net)) {
        reasons.push(
          `Schedule E's rents (${fmt(rents)}, line 23a) less its expenses (${fmt(rentalExpenses)}, line 23e) aren't the properties' net as read (${fmt(net)}, line 21) — a royalty property, or one of the lines misread`,
        );
        return refuse();
      }
      rental = { profits, losses, prior: n(after.passivePriorUnallowed), reps: n(after.rentalReps) !== 0, qbi: true, rents, expenses: rentalExpenses, expensesRead: true };
    }
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

  // Form 8995-A's limits when the form wasn't printed (the after return is
  // under the threshold; the before may not be): the business's own W-2
  // wages — Schedule C line 26, the 1120-S's lines 7 and 8, the 1065's
  // line 9 — and qualified property as $0, since no line of the return
  // gives its basis.
  const qbiLimitAfter = qbiRead
    ? null
    : {
        w2Wages:
          shape === "soleProp"
            ? n(after.schCWages)
            : officerComp + scorpWages + partnershipWages + (shape === "partnership" && hasSchC ? n(after.schCWages) : 0),
        ubia: 0,
      };

  let base: FederalInputs = {
    nii: null,
    qbiLimit: qbiLimitAfter,
    extra: NO_EXTRAS,
    netProfit: netAfter,
    schCOwner: 0,
    // The Schedule C's wage base is used up by the W-2 wages — the sole
    // proprietor's, or the shareholder's (the officer's own and any other
    // employer's) when the Schedule C sits next to the corporation.
    seWages: hasSchC ? w2 : 0,
    // A partnership's K-1 income rides in with the partners, not here.
    scorp: scorpK1After,
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

  // One spouse's Schedule SE read for the total: Schedule 2 line 4 adds up
  // every Schedule SE on the return, and line 23 carries it with the NIIT
  // and the additional Medicare tax. When line 23 less those is the SE tax
  // the tables give and the line read isn't, line 23 is right. (First, so
  // the wage readings below never work from the one schedule.)
  {
    const firstPass = federal(fed, status, base);
    if (has(after.seTax) && off(after.seTax, firstPass.seTax) && has(after.otherTaxes)) {
      const fromLine23 = after.otherTaxes - n(after.niit) - firstPass.additionalMedicare;
      if (!off(fromLine23, firstPass.seTax)) {
        softNotes.push(
          `Self-employment tax was read as ${fmt(after.seTax)} — one Schedule SE; line 23 (${fmt(after.otherTaxes)}) less the other Schedule 2 taxes gives ${fmt(fromLine23)}, every Schedule SE together, which is what the return's total tax is built from`,
        );
        after = { ...after, seTax: fromLine23 };
      }
    }
  }

  // Whose W-2 is it? On a joint return the wages may be the spouse's, in
  // which case they don't use up the Schedule C filer's wage base; with a
  // partnership they may be one partner's. The SE tax as printed says:
  // the first reading that reproduces it is taken.
  let seWagesNote: string | null = null;
  const joint = status === "mfj" || status === "qss";
  // A Schedule C beside a partnership: is the sole proprietor the partner
  // (one Schedule SE with both on it), and whose are the W-2 wages?
  const schCWithPartners = hasSchC && partners.length > 0;
  if (schCWithPartners && has(after.seTax) && (w2 > 0 || joint)) {
    const partnerWages = (k: number, wagesNow: number) => partners.map((p, j) => (j === k ? { ...p, wages: wagesNow } : p));
    const candidates: { inputs: FederalInputs; note: string | null }[] = [
      { inputs: base, note: null },
      ...(joint && w2 > 0
        ? [
            {
              inputs: { ...base, seWages: 0 },
              note: `The ${fmt(w2)} of W-2 wages are taken as the spouse's: the SE tax as printed only reproduces with the Schedule C filer's whole Social Security wage base`,
            },
          ]
        : []),
      ...(joint
        ? [
            {
              inputs: { ...base, schCOwner: 1 as const },
              note: `The Schedule C is taken as the spouse's, on a Schedule SE of its own apart from the partner's: the SE tax as printed only reproduces that way`,
            },
            ...(w2 > 0
              ? [
                  {
                    inputs: { ...base, schCOwner: 1 as const, seWages: 0, partners: partnerWages(0, w2) },
                    note: `The Schedule C is taken as the spouse's and the ${fmt(w2)} of W-2 wages as the partner's, each on a Schedule SE of their own: the SE tax as printed only reproduces that way`,
                  },
                ]
              : []),
          ]
        : []),
    ];
    const fits = candidates.filter((c) => !off(federal(fed, status, c.inputs).seTax, after.seTax as number));
    const hit = fits[0];
    if (hit) {
      base = hit.inputs;
      seWagesNote = hit.note;
      partners = base.partners;
      // Under the wage base on the after, the SE tax can't say whose the
      // W-2 is; with the write-offs gone the before's earnings can reach it,
      // and then it matters. Said, with how to settle it.
      const wageBase = fed.selfEmployment.wageBase;
      const beforeEarnings = (gross + sum(partnershipUnits, (u) => u.income * (u.shares[0] ?? 0))) * fed.selfEmployment.netEarningsFactor;
      if (fits.length > 1 && w2 > 0 && !wages.read && beforeEarnings > wageBase - w2) {
        softNotes.push(
          `The SE tax as printed doesn't say whose the ${fmt(w2)} of W-2 wages are (it reproduces either way), and on the before it matters: the Schedule C filer's own wages leave less of the ${fmt(wageBase)} Social Security wage base. They're taken as the Schedule C filer's; if they're the spouse's, type the W-2 lines (taxpayer's and spouse's) in the after column and recompute the before column`,
        );
      }
      if (!wages.read && w2 > 0) {
        // Whose the W-2 is: the Schedule C filer's unless the reading says otherwise.
        const holder = base.seWages > 0 ? base.schCOwner : partners.some((p) => p.wages > 0) ? 0 : 1 - base.schCOwner;
        wages = { ...wages, outside: holder === 1 ? [0, w2] : [w2, 0] };
      }
    }
  } else if (w2 > 0 && has(after.seTax) && (shape === "partnership" || (several && kinds.partnership) || (joint && shape === "soleProp"))) {
    const candidates: { inputs: FederalInputs; note: string | null }[] =
      partners.length > 0
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
        const spouses = partners.length > 0 ? partners.findIndex((p) => p.wages > 0) === 1 : base.seWages === 0;
        wages = { ...wages, outside: spouses ? [0, w2] : [w2, 0] };
      }
    }
  }

  // What uses up the Schedule C's Social Security wage base is W-2 box 3
  // (Schedule SE line 8a), not box 1: a 401(k) deferral is in box 3 and
  // not box 1, an S corporation owner's health premiums the other way. Read
  // off Schedule SE when the reader had it; otherwise solved from the SE tax
  // as printed, the way `inferNii` solves the NIIT — taken only when it
  // reproduces that tax to the dollar. On the before, the difference goes
  // with the officer's pay when there is one (the deferral is on the
  // officer's W-2), and stays otherwise.
  let ssExtra = 0;
  if (hasSchC && partners.length === 0 && w2 > 0 && has(after.seTax) && !seWagesNote && off(federal(fed, status, base).seTax, after.seTax)) {
    const se = fed.selfEmployment;
    const earnings = netAfter > 0 ? Math.round(netAfter * se.netEarningsFactor) : 0;
    const solved = Math.round(se.wageBase - (after.seTax - Math.round(earnings * se.medicareRate)) / se.socialSecurityRate);
    // A solved figure has to be one a W-2 can print: box 3 runs above box 1
    // only by elective deferrals (under $35,000 a year with the catch-ups)
    // and below it by the likes of an S corporation owner's premiums. An SE
    // tax that would need more is something else — a partnership's SE loss
    // on the same Schedule SE (one 2025 return would "need" $111,253 against
    // $42,025) — and is left to refuse.
    const plausible = (t: number) => has(after.seSsWages) || (t - base.seWages <= 35000 && base.seWages - t <= Math.min(base.seWages, 30000));
    const tries = has(after.seSsWages) ? [after.seSsWages] : [0, -1, 1, -2, 2, -3, 3].map((d) => solved + d);
    const hit = tries.find(
      (t) => t >= 0 && t <= se.wageBase && plausible(t) && !off(federal(fed, status, { ...base, seWages: t }).seTax, after.seTax as number),
    );
    if (hit !== undefined) {
      ssExtra = hit - base.seWages;
      base = { ...base, seWages: hit };
      softNotes.push(`${fmt(hit)} of W-2 Social Security wages (box 3, Schedule SE line 8a${has(after.seSsWages) ? "" : ", worked out from the SE tax as printed"}) use up the Schedule C's wage base, not the ${fmt(w2)} of box 1 wages${
        shape === "scorp" && officerComp > 0 ? `; the ${fmt(Math.abs(ssExtra))} difference goes with the officer's pay on the before` : ""
      }`);
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
  // The $25,000 special allowance is for rentals the owner actively
  // participates in (Form 8582 Part I line 1). Listed with "all other
  // passive activities" (line 2), a passive loss only offsets passive
  // income, with no allowance. Line 26 as printed says which.
  if (rental && !rental.reps && off(rentalReadNet, check.rentalDeducted)) {
    const alt: FederalInputs = { ...inputs, rental: { ...rental, noAllowance: true } };
    const altCheck = federal(fed, status, alt);
    if (!off(rentalReadNet, altCheck.rentalDeducted)) {
      rental = alt.rental;
      base = { ...base, rental };
      inputs = alt;
      check = altCheck;
      softNotes.push(
        "Schedule E line 26 only reproduces with no $25,000 special allowance: Form 8582 lists the rentals with all other passive activities, so a passive loss only offsets passive income — the same on the before",
      );
    }
  }
  /** A business line off: the derivation is refused with the line named. */
  const hard = (what: string, read: number, computed: number, hint: string) => {
    if (off(read, computed)) {
      reasons.push(
        `${what} on the after return reads ${fmt(read)} but the ${year} tables give ${fmt(computed)} — ${hint}`,
      );
      mismatches.push({ line: what, read, computed });
    }
  };
  /**
   * A household line off: recorded, explained, and carried across as a
   * fixed amount by the caller. Returns the difference (0 when the line
   * reproduces).
   */
  const soft = (what: string, read: number, computed: number, hint: string): number => {
    if (!off(read, computed)) return 0;
    residuals.push({ line: what, read, computed });
    softNotes.push(
      `${what} on the after return reads ${fmt(read)} but the ${year} tables give ${fmt(computed)} — ${hint}. The ${fmt(Math.abs(read - computed))} ${read > computed ? "more" : "less"} is carried across to the before as it is`,
    );
    return read - computed;
  };

  hard(
    "Self-employment tax",
    n(after.seTax),
    check.seTax,
    schCWithPartners
      ? "the Schedule C and the partnership share are figured on one Schedule SE for the same person, or on one each; a limited partner's share isn't subject to SE tax, and Social Security wages (box 3) may differ from box 1"
      : shape === "scorp" && kinds.partnership
        ? "the partnership share on its partner's Schedule SE: a limited partner's share isn't subject to SE tax, or the W-2 wages belong to another person"
      : shape === "scorp"
      ? hasSchC
        ? "the Schedule C beside the corporation is figured against the W-2 wages on line 1z; Social Security wages (box 3) may differ, or there's a second Schedule C"
        : "an S corporation shareholder's return shouldn't carry SE tax — a Schedule C or other self-employment income"
      : shape === "partnership"
        ? "a partner whose share isn't subject to SE tax (a limited partner), a Schedule C, or an optional method on Schedule SE"
        : w2 > 0
          ? "W-2 Social Security wages (box 3) may differ from box 1, or there's a second Schedule C or a K-1"
          : "a second Schedule C, a K-1, or an optional method on Schedule SE",
  );
  if (rental) {
    hard(
      "Rental real estate income or loss (Schedule E line 26)",
      rentalReadNet,
      check.rentalDeducted,
      rental.reps
        ? "a rental the real estate professional didn't materially participate in, or a prior-year loss allowed this year"
        : "a loss allowed under a rule the engine doesn't model (active participation, a disposition, or a prior-year loss freed up)",
    );
  }
  if (has(after.sehiDeduction)) {
    hard(
      "The SE health insurance deduction",
      after.sehiDeduction,
      check.sehi,
      shape === "scorp"
        ? "premiums above the S corporation's Medicare wages, or a plan under another business"
        : "a SEP on the same business, or premiums the engine reads differently from Form 7206",
    );
  }
  if (reasons.length) return refuse();

  // The fit. Each household line the tables don't reproduce becomes a
  // fixed amount on that line (`Extras`), and the return is re-run so the
  // next line is judged with the earlier ones in place. The order is the
  // form's: deduction, QBI, taxable income, tax, the premium credit, line
  // 17, the child credit, NIIT, refundable credits, the total. Once
  // through, the after return reproduces to the dollar by construction.
  const extra: Extras = { ...NO_EXTRAS };
  const refit = () => {
    inputs = { ...inputs, extra: { ...extra } };
    check = federal(fed, status, inputs);
  };

  const deductionRead = (after.agi as number) - n(after.qbiDeduction) - (after.taxableIncome as number);
  // Taxable income printed as $0 is a floor, not a figure: AGI less QBI is
  // then only the most the deduction could have used, and any deduction at
  // least that large is what the return shows. (A 2024 return: AGI −$614,
  // so "−$614" would have been carried as the deduction, raising the before's
  // tax by $15,214 of income.)
  const flooredAtZero = after.taxableIncome === 0 && check.taxable === 0 && check.deduction >= deductionRead - TOL;
  if (!flooredAtZero && off(deductionRead, check.deduction)) {
    const standardLabel = claimedAsDependent
      ? `the ${year} dependent's standard deduction (${fmt(check.deduction)}: earned income plus ${fmt(fed.dependentStandardDeduction.earnedPlus)}, at least ${fmt(fed.dependentStandardDeduction.minimum)})`
      : `the ${year} standard deduction for ${statusLabel} (${fmt(fed.standardDeduction[status])})`;
    extra.deduction = soft(
      "The deduction (line 12)",
      deductionRead,
      check.deduction,
      itemized
        ? `neither ${standardLabel} nor the Schedule A total as read (${fmt(check.itemizedTotal)}): age or blindness, or Schedule 1-A`
        : `not ${standardLabel}: itemized (Schedule A wasn't read), age or blindness, Schedule 1-A${claimedAsDependent ? "" : ", or a filer someone else claims (line 12a, not read)"}`,
    );
    refit();
  }
  // Over the threshold without Form 8995-A, the limits come from the
  // business's own wage lines (`qbiLimitAfter`); say so.
  if (check.taxableBeforeQbi > fed.qbi.threshold[status] && !qbiRead && n(after.qbiDeduction) > 0) {
    softNotes.push(
      `Taxable income is over the ${year} ${statusLabel} QBI threshold (${fmt(fed.qbi.threshold[status])}) and Form 8995-A wasn't read, so the W-2 wage limit is figured from the business's own wages (${fmt(qbiLimitAfter?.w2Wages ?? 0)}) with qualified property as $0`,
    );
  }
  extra.qbi = soft(
    "The QBI deduction",
    n(after.qbiDeduction),
    check.qbi,
    shape === "scorp"
      ? "a specified service business in the phase-in range, a loss carryforward, or REIT/PTP income"
      : "a second business, a loss carryforward, an adjustment that reduces QBI, or income above the threshold",
  );
  if (extra.qbi) refit();
  // Taxable income is AGI less the deduction and QBI, so it holds now; a
  // miss means a line the engine reads as something else, carried on the
  // deduction (more taxable income is less deduction).
  const taxableDiff = soft("Taxable income", after.taxableIncome as number, check.taxable, "something on the return the engine doesn't model");
  if (taxableDiff) {
    extra.deduction -= taxableDiff;
    refit();
  }
  extra.incomeTax = soft(
    "Income tax",
    after.incomeTax as number,
    check.incomeTax,
    "capital gains or qualified dividends, a different filing status, or a tax worksheet",
  );
  if (extra.incomeTax) refit();
  if (coverage && has(after.ptcAllowed)) {
    extra.ptcAllowed = soft(
      "The premium tax credit allowed",
      after.ptcAllowed,
      check.ptc?.allowed ?? 0,
      "premiums that differ month to month, a policy shared with another return, or modified AGI above AGI",
    );
    if (extra.ptcAllowed) refit();
  }
  extra.additionalTaxes = soft(
    coverage ? "The excess advance credit repaid (line 17)" : "Additional taxes (line 17)",
    n(after.additionalTaxes),
    check.additionalTaxes,
    coverage
      ? "a repayment cap the tables don't have, or another Schedule 2 addition"
      : "a repayment with no Form 8962 read, alternative minimum tax, or another Schedule 2 addition the engine doesn't model",
  );
  if (extra.additionalTaxes) refit();
  extra.childTaxCredit = soft(
    "The child tax credit (line 19)",
    n(after.childTaxCredit),
    check.childTaxCredit,
    "a dependent the engine didn't count, or the credit limit worksheet",
  );
  if (extra.childTaxCredit) refit();
  // Form 8960: when the tax as printed says how much of other income is
  // investment income, take that; only what it can't explain is carried.
  if (off(n(after.niit), check.niit)) {
    const nii = inferNii(fed, status, n(after.niit), check.agi);
    if (nii !== null) {
      inputs = { ...inputs, nii };
      refit();
      if (off(n(after.niit), check.niit)) {
        inputs = { ...inputs, nii: null };
        refit();
      } else {
        softNotes.push(
          nii > 0
            ? `Net investment income taken as ${fmt(nii)} (Form 8960, from the tax as printed): the rest of the ${fmt(otherIncome)} of other income isn't investment income`
            : `No net investment income: AGI is over the ${fmt(fed.netInvestmentIncomeTax.threshold[status])} threshold with no net investment income tax, so none of the ${fmt(otherIncome)} of other income is investment income`,
        );
      }
    }
  }
  extra.niit = soft(
    "Net investment income tax",
    n(after.niit),
    check.niit,
    "investment income the engine can't tell apart from other income, or a modified AGI above AGI",
  );
  if (extra.niit) refit();
  // Line 32 more than this return's credits can come to (engine v14): the
  // earned income credit, the additional child tax credit and the net
  // premium credit as figured, plus up to $1,000 a person of the American
  // opportunity credit's refundable part under its income limit ($90,000,
  // $180,000 joint; none married filing separately). The rest is money
  // paid in, not a credit — estimated payments (line 26) or an extension
  // payment (line 31) read onto line 32. A 2023 return: $29,334 of
  // "credits" at $135,898 of AGI, single, no dependents — line 33 less the
  // withholding. It's moved to line 31, a payment on both sides; the after
  // column takes the same fix (`afterFixes`) so its taxes aren't $29,334 low.
  {
    const aotcRoom = status !== "mfs" && check.agi < (status === "mfj" ? 180000 : 90000) ? 1000 * ((status === "mfj" ? 2 : 1) + children + others) : 0;
    const unexplained = refundableRead - check.refundable;
    if (unexplained > aotcRoom + TOL) {
      softNotes.push(
        `Line 32 was read as ${fmt(n(after.federalRefundableCredits))}, but at this income the refundable credits come to ${fmt(check.refundable)} (the earned income credit, the additional child tax credit and the premium tax credit)${
          aotcRoom > 0 ? `, ${fmt(aotcRoom)} more at most with the American opportunity credit` : ""
        }. The other ${fmt(unexplained)} is money paid in — estimated payments (line 26) or a payment with an extension (line 31) — so it's taken as line 31: a payment on both sides, not a credit off the tax`,
      );
      otherPayments += unexplained;
      refundableRead -= unexplained;
      after = { ...after, otherPayments };
      afterFixes.otherPayments = otherPayments;
    }
  }
  extra.refundable = soft(
    `Refundable credits (line 32${otherPayments > 0 ? " less the other payments on line 31" : ""})`,
    refundableRead,
    check.refundable,
    "an American opportunity credit or another refundable credit the engine doesn't compute, or an earned income credit on a child the dependents read don't show",
  );
  if (extra.refundable) refit();
  extra.otherTaxes = soft(
    "Federal total tax",
    after.federalTotalTax as number,
    check.totalTax,
    "other taxes on Schedule 2 or credits on Schedule 3 the engine doesn't model",
  );
  if (extra.otherTaxes) refit();
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
  // A city resident's tax on the state return (New York City on the IT-201):
  // the line being read is what says the filer lives there.
  let localResident = n(after.stateLocalTax) > 0;
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
    localResident,
  });
  /** Each person's FICA wages on the after return: the officer's Medicare wages, the other's pay from the business, and everyone's outside wages. */
  const afterWagesByPerson = wagesByPersonFor(wages, shape === "scorp" ? officerMedicare : 0, wages.employeeEntity);
  // The elective tax each entity elected into, per the returns. With one
  // entity return, the 1040's PTE credit lines say so too; with several,
  // the entity's own elective tax line does (or, when none was read on
  // any of them, the 1040's lines for every one).
  const creditLines =
    n(after.statePteCreditAvailable) > 0 || n(after.statePteCredit) > 0 || n(after.statePteCreditRefundable) > 0;
  const noneRead = units.every((u) => !has(u.e.pteTax));
  for (const u of units) {
    u.electing = n(u.e.pteTax) > 0 || ((!several || noneRead) && creditLines);
    /** The LLC fee is on the entity's total income (Form 568 line 1), not its profit. */
    u.feeBase = has(u.e.stateGrossIncome) ? u.e.stateGrossIncome : u.gross;
    /** The partners' income the elective tax would be on: the state's figure when read, else the 1065's. */
    u.pteBase = has(u.e.stateNetIncome) ? u.e.stateNetIncome : n(u.e.ordinaryIncome);
  }
  /** The household's share of an entity's elective tax: an owner's percentage, or the partners' on this return. */
  const pteShareOf = (u: Unit) => (u.form === "1065" ? u.shares.reduce((s, p) => s + p, 0) : u.ownershipPct);
  /** The K-1 income an electing entity's state leaves off the owner's return (Georgia's way). */
  const electingK1 = sum(units.filter((u) => u.electing), (u) => u.k1After);
  /** Set on a part-year or nonresident return: the business income inside the state-source income, which grows with the business on the before. */
  let stateSourceBusiness: number | null = null;
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
      for (const u of units) {
        const own = u.stateCode && u.stateCode !== stateCode ? card.states[u.stateCode] : undefined;
        u.card = own && (own.entity || own.partnership) ? own : sc;
        if (u.card !== sc) {
          softNotes.push(
            several
              ? `${u.label} filed its own return in ${u.card.name}, not ${sc.name}, so its own state tax follows ${u.card.name}'s rules`
              : `The entity filed its own return in ${u.card.name}, not ${sc.name}, so its own state tax follows ${u.card.name}'s rules`,
          );
        }
      }
      const form = normalizeForm(meta.stateForm);
      /** The card's part-year return is the resident form with a schedule (South Carolina's Schedule NR). */
      const partYearSchedule = sc.nonresident?.schedule ?? null;
      const onCardNonresident = !!sc.nonresident && !partYearSchedule && !!form && form === normalizeForm(sc.nonresident.form);
      // A part-year or nonresident form the card doesn't name (most states'
      // cards carry the resident form alone), with its state-source income
      // read: figured the way most states figure one — tax as a resident
      // on all income, prorated by the state's share.
      const residentForm = !form || !sc.form || form === normalizeForm(sc.form);
      const genericNonresident = !residentForm && !onCardNonresident && has(after.stateSourceIncome);
      // A part-year or nonresident schedule on the resident form itself
      // (South Carolina's SC1040 with Schedule NR; North Carolina's Schedule
      // PN, Colorado's DR 0104PN): a card that names the schedule, and a
      // state-source income read below the return's total income. Only
      // where the card names one: a source line read off a full-year return
      // elsewhere (a District of Columbia D-40) stays a resident return.
      const scheduleNonresident =
        residentForm &&
        !!partYearSchedule &&
        has(after.stateSourceIncome) &&
        after.stateSourceIncome < (has(after.totalIncome) ? after.totalIncome : n(after.agi)) - TOL;
      const nonresident = onCardNonresident || genericNonresident || scheduleNonresident;
      const unitWithout = (want: (u: Unit, c: StateCard) => boolean) => units.find((u) => u.card && want(u, u.card));
      const noScorpRules = unitWithout((u, c) => u.form === "1120-S" && !c.entity);
      const noPartnershipRules = unitWithout((u, c) => u.form === "1065" && !c.partnership);
      const noPteRule = unitWithout((u, c) => u.form === "1065" && u.electing && !c.entity?.pte);
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
          `State-source income (${sourceLine(stateCode, sc)}) wasn't read from the after return — it's what the nonresident tax is prorated by`,
        );
      } else if (noScorpRules) {
        reasons.push(
          `${noScorpRules.card?.name}'s card has no S corporation rules (the entity's own tax and elective tax) — add them on the Tax Tables page`,
        );
      } else if (noPteRule) {
        reasons.push(`The partnership elected the pass-through entity tax, which ${noPteRule.card?.name}'s card has no rule for — add it on the Tax Tables page`);
      } else if (dependents > 0 && sc.exemption.kind !== "none" && sc.exemption.dependentAmount <= 0 && !has(after.stateExemptions)) {
        reasons.push(
          `The return lists ${dependents} dependent${dependents > 1 ? "s" : ""} and ${sc.name}'s card has no dependent exemption amount — add it on the Tax Tables page`,
        );
      } else {
        if (nonresident) {
          stateSource = after.stateSourceIncome as number;
          stateSourceBusiness = has(after.stateSourceBusinessIncome) ? after.stateSourceBusinessIncome : null;
        }
        if (noPartnershipRules) {
          // What a partnership pays its state itself is a fee on its
          // receipts (an annual tax, a filing fee), which the write-offs
          // don't change; without the card's rules it's carried as read.
          softNotes.push(
            `${noPartnershipRules.card?.name}'s card has no partnership rules (what the partnership or LLC itself pays the state), so ${several ? `${noPartnershipRules.label}'s` : "the partnership's"} own ${noPartnershipRules.card?.name} tax${has(noPartnershipRules.e.stateTax) ? ` (${fmt(noPartnershipRules.e.stateTax)})` : ""} is carried across as read — it's set by the receipts, which the before doesn't change. Add the rules on the Tax Tables page to have it figured`,
          );
        }
        if (genericNonresident) {
          softNotes.push(
            `${sc.name} Form ${meta.stateForm} is a part-year or nonresident return the ${sc.name} card doesn't name; it's figured the way most states figure one — the tax as a resident on all income, prorated by the ${fmt(stateSource ?? 0)} of ${sc.name}-source income — and fitted to the return as printed`,
          );
        }
        if (scheduleNonresident) {
          softNotes.push(
            `${sc.name} Form ${meta.stateForm ?? sc.form} carries a part-year or nonresident schedule (${partYearSchedule}): ${fmt(stateSource ?? 0)} of its income is ${sc.name}'s, less than the return's total. It's figured the way most states figure one — the tax as a resident on all income, prorated by that share — and fitted to the return as printed`,
          );
        }
        // A state that charges the corporation only a minimum (Massachusetts
        // under $6M of receipts, New Jersey) needs no net income figure;
        // one that taxes net income does, and the 1120-S's own stands in
        // when the state print's wasn't read.
        for (const u of units) {
          if (u.form === "1120-S" && u.card && !has(u.e.stateNetIncome) && (u.card.entity?.rate ?? 0) > 0) {
            softNotes.push(
              `${several ? `${u.label}: the` : "The"} ${u.card.name} S corporation return's net income for tax wasn't read from the 1120-S print; the 1120-S's ordinary income plus the state taxes added back (${fmt(n(u.e.ordinaryIncome) + u.stateAddBack)}) stands in for it`,
            );
          }
        }
        // A state that starts from its own business line (New Jersey, with
        // its own expense rules; Massachusetts, where the line is the federal
        // figure) uses that line when read, and the federal figure when not —
        // the total-tax check below says whether that was right.
        const businessAfter = sc.base === "stateGrossIncome" && has(after.stateBusinessIncome) ? after.stateBusinessIncome : netAfter + k1After;
        const mode = creditMode(sc);

        // The entity's own state return, when there is one. The owner's
        // credit is their share of the elective tax — as printed when it
        // was read, so the state's own lines below are judged with the
        // credit the return actually took. The entity's totals themselves
        // are fitted further down, once the model can rebuild them.
        let pteFromUnits = 0;
        for (const u of units) {
          if (!u.card) continue;
          const t =
            u.form === "1120-S"
              ? entityTax(u.card, has(u.e.stateNetIncome) ? u.e.stateNetIncome : n(u.e.ordinaryIncome) + u.stateAddBack, u.gross, u.electing)
              : partnershipTax(u.card, u.feeBase, u.pteBase, u.electing);
          pteFromUnits += Math.round(t.pte * pteShareOf(u));
        }
        const pteAvailable = units.length ? (has(after.statePteCreditAvailable) ? after.statePteCreditAvailable : pteFromUnits) : 0;

        const run = (f: Federal, biz: number, pte: number) => {
          const si = stateInputsFor(f, biz, mode === "exclusion" ? 0 : pte, w2, afterWagesByPerson, mode === "exclusion" ? electingK1 : 0);
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
        // reader takes either (Client B: 1,301 one read, 381 the next), and the
        // engine figures both, so either one proves the card.
        // The state's own lines, each recorded when off. They explain the
        // total's difference, which is what gets carried (fitted below).
        const asResident =
          has(after.stateTaxOnIncome) && sCheck.residentTax !== undefined && !off(after.stateTaxOnIncome, sCheck.residentTax);
        if (has(after.stateTaxOnIncome) && !asResident) {
          soft(
            `${sc.name} tax on income`,
            after.stateTaxOnIncome,
            sCheck.tax,
            `a deduction, exemption or adjustment the ${sc.name} card doesn't model`,
          );
        }
        if (has(after.stateExemptionCredits) && sc.exemption.kind === "credit") {
          soft(
            `${sc.name} exemption credits`,
            after.stateExemptionCredits,
            sCheck.exemption,
            "a dependent the engine didn't count, or a senior or blind exemption",
          );
        }
        if (has(after.stateLocalTax)) {
          soft(
            `${sc.local?.name ?? "City"} resident tax`,
            after.stateLocalTax,
            sCheck.local,
            sc.local
              ? "a city credit, a part-year city residency, or city brackets the card doesn't have"
              : `a city tax ${sc.name}'s card has no brackets for — carried across as it is, not re-figured on the before`,
          );
        }
        if (has(after.statePteCredit) && mode === "nonrefundable") {
          soft(`${sc.name} PTE elective tax credit claimed`, after.statePteCredit, sCheck.pteCredit, "another credit ahead of it, or a carryover");
        }
        if (has(after.statePteCreditRefundable) || mode === "refundable") {
          soft(
            `${sc.name} refundable PTE tax credit`,
            n(after.statePteCreditRefundable),
            mode === "refundable" ? sCheck.pteCredit : 0,
            mode === "refundable" ? "a share of the entity's tax the card computes differently" : `the ${sc.name} card says the credit isn't refundable`,
          );
        }
        if (has(after.stateMedical) || sc.medical) {
          soft(
            `${sc.name} medical deduction`,
            n(after.stateMedical),
            sCheck.medical,
            "medical expenses beyond the marketplace premiums, which the return doesn't itemize",
          );
        }
        if (has(after.stateWageDeduction)) {
          soft(
            `${sc.name} Social Security / Medicare deduction`,
            after.stateWageDeduction,
            sCheck.wageDeduction,
            wages.read
              ? "retirement contributions beyond the FICA tax, or a W-2's wages read on the wrong person"
              : "a joint return whose W-2 lines (taxpayer's and spouse's) weren't read, so each person's cap can't be applied",
          );
        }
        if (sc.sharedResponsibility || has(after.stateSharedResponsibility)) {
          soft(
            `${sc.name} shared responsibility payment`,
            n(after.stateSharedResponsibility),
            sCheck.sharedResponsibility,
            "months without coverage read differently, or a household bigger than the filer",
          );
        }
      }
    }
  }

  // Every other state return (engine v13): a part-year return in the state
  // the client moved from, a nonresident return where income was earned.
  // Each is figured by its own card — prorated by its state-source income,
  // as a part-year or nonresident return is — and its total fitted like
  // the main state's, so its before is its own.
  const otherStates: OtherState[] = [];
  for (const o of more.states ?? []) {
    const code = o.stateCode.toUpperCase();
    const sc = card.states[code];
    const r = o.numbers;
    if (!sc) {
      reasons.push(`${code} isn't on the ${year} tax tables yet — add its card on the Tax Tables page, or type the before column`);
      continue;
    }
    if (!sc.incomeTax) {
      if (n(r.stateTotalTax) > 0) reasons.push(`${sc.name}'s card says no income tax, but the after return carries ${fmt(n(r.stateTotalTax))} of ${sc.name} tax`);
      continue;
    }
    if (!has(r.stateTotalTax)) {
      reasons.push(`${sc.name} total tax wasn't read from the after return (its ${o.stateForm ?? "state"} return)`);
      continue;
    }
    const form = normalizeForm(o.stateForm);
    const residentForm = !form || !sc.form || form === normalizeForm(sc.form);
    // A return in a second state is a part-year or nonresident one, prorated
    // by what was earned there; read as a resident form without a source
    // line, it's figured as a resident return.
    if (!residentForm && !has(r.stateSourceIncome)) {
      reasons.push(`${sc.name}-source income wasn't read from its ${o.stateForm ?? "state"} return — it's what a part-year or nonresident tax is prorated by`);
      continue;
    }
    otherStates.push({
      code,
      form: o.stateForm,
      card: sc,
      read: r,
      source: has(r.stateSourceIncome) ? r.stateSourceIncome : null,
      sourceBusiness: has(r.stateSourceIncome) && has(r.stateSourceBusinessIncome) ? r.stateSourceBusinessIncome : null,
      extra: 0,
    });
  }
  if (reasons.length) return refuse();

  /* 4 · the model: any scenario from the before to the after */

  const writeOffs = sum(units, (u) => u.writeOffs);
  const qbiRatio = k1After > 0 && qbiRead ? qbiRead.income / k1After : null;
  const paid = Math.max(0, n(after.federalPayments) - refundableRead);
  /** Virginia and Pennsylvania claim the credit for other states' tax with the payments; it isn't money paid. */
  const creditWithPayments = !!stateCode && OTHER_STATE_CREDIT_WITH_PAYMENTS.has(stateCode);
  const statePaid = Math.max(
    0,
    n(after.statePayments) - n(after.statePteCreditRefundable) - (creditWithPayments ? n(after.stateOtherStateCredit) : 0),
  );
  const mode = creditMode(stateCard);
  // A state with its own business-income line (New Jersey) can differ from
  // the federal figure by its own expense rules (meals in full). The gap is
  // an expense-side thing, so it scales with the share of write-offs
  // switched on: nothing on the before, all of it on the after.
  const stateBizDelta = has(after.stateBusinessIncome)
    ? after.stateBusinessIncome - (shape === "scorp" ? k1After : netAfter)
    : 0;
  for (const u of scorpUnits) {
    const c = u.card;
    const e = u.e;
    const ordinaryAfter = u.ordinaryAfter;
    const named = (s: string) => (several ? `${u.label}: ${s}` : s);
    // The state's own adjustments to the corporation's net income beyond the
    // taxes added back (Form 100S: depreciation differences, a section 179
    // limit) — a fact of the year, carried across, and said when it's there.
    // Only where the state taxes net income: a state charging a minimum alone
    // (Massachusetts under $6M of receipts) prints no income measure at all.
    u.stateNetAdj = c && (c.entity?.rate ?? 0) > 0 && has(e.stateNetIncome) ? e.stateNetIncome - (ordinaryAfter + u.stateAddBack) : 0;
    if (stateCard && off(u.stateNetAdj, 0)) {
      residuals.push({ line: named(`${(c ?? stateCard).name} S corporation net income for tax`), read: e.stateNetIncome as number, computed: ordinaryAfter + u.stateAddBack });
      softNotes.push(
        named(
          `The ${(c ?? stateCard).name} S corporation return's net income for tax (${fmt(e.stateNetIncome as number)}) is ${fmt(Math.abs(u.stateNetAdj))} ${u.stateNetAdj > 0 ? "more" : "less"} than the 1120-S's ordinary income plus the state taxes added back (${fmt(ordinaryAfter + u.stateAddBack)}) — a state adjustment beyond those (depreciation, a section 179 limit), carried across to the before as it is`,
        ),
      );
    }
    // The corporation's city return (New York City's NYC-3L): its tax is the
    // card's rate on the net income allocated to the city by the return's own
    // business allocation percentage, a fact of the year carried across. The
    // allocated figure as printed may carry a city adjustment; that rides
    // along too. A city tax read with no rules or no allocation to figure it
    // from is carried across whole (fitted further down).
    u.cityRules = c?.entity?.city ?? null;
    u.cityIn =
      u.cityRules && has(e.cityAllocationPct) && e.cityAllocationPct > 0
        ? {
            base: ordinaryAfter,
            allocation: e.cityAllocationPct / 100,
            adjust: 0,
            receipts: has(e.cityReceipts) ? e.cityReceipts : Math.round(u.gross * (e.cityAllocationPct / 100)),
          }
        : null;
    if (u.cityIn && has(e.cityNetIncome)) {
      const allocated = Math.round(ordinaryAfter * u.cityIn.allocation);
      if (off(e.cityNetIncome, allocated)) {
        u.cityIn.adjust = e.cityNetIncome - allocated;
        residuals.push({ line: named(`${u.cityRules?.name} allocated net income`), read: e.cityNetIncome, computed: allocated });
        softNotes.push(
          named(
            `${u.cityRules?.name}'s allocated net income (${fmt(e.cityNetIncome)}) is ${fmt(Math.abs(u.cityIn.adjust))} ${u.cityIn.adjust > 0 ? "more" : "less"} than the 1120-S's ordinary income at the ${e.cityAllocationPct}% business allocation (${fmt(allocated)}) — a city adjustment, carried across to the before as it is`,
          ),
        );
      }
    }
    if (has(e.cityTax) && !u.cityIn) {
      softNotes.push(
        named(
          `A city corporation tax (${fmt(e.cityTax)}) was read, but ${
            u.cityRules ? "the business allocation percentage wasn't" : `${stateCard?.name ?? "the state"}'s card has no city tax rules`
          }, so it's carried across to the before as it is rather than re-figured on the before's income`,
        ),
      );
    }
  }
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

  // The entity's and the state's totals beyond the cards, fitted below
  // once `run` exists to rebuild them, and read by every run after that.
  let pteCreditExtra = 0;
  let stateExtra = 0;
  /** The main state's credit for tax paid to the other states beyond the formula, fitted when the credit was read. */
  let otherCreditExtra = 0;
  const otherCreditRead = has(after.stateOtherStateCredit) && otherStates.length > 0 ? after.stateOtherStateCredit : null;
  /** Where each partnership's partners sit in the household's list. */
  const partnerOffsets = partnershipUnits.map((_, j) => sum(partnershipUnits.slice(0, j), (u) => u.partners.length));
  /** The business income on the after (Schedule C and every K-1): what a state's source business income is a share of. */
  const bizAfterAll = netAfter + k1After;
  /** A part-year or nonresident state's source income in a scenario: its business part grows with the business. */
  const scaleSource = (source: number | null, sourceBusiness: number | null, bizNow: number) => {
    if (source === null || sourceBusiness === null || bizAfterAll === 0) return { source, business: sourceBusiness };
    const ratio = Math.min(1, Math.max(0, sourceBusiness / bizAfterAll));
    const business = Math.round(bizNow * ratio);
    return { source: source - sourceBusiness + business, business };
  };
  /** The state's dependent exemptions and a deduction that was the status's standard one, gone without the dependents. */
  const withoutKids = (si: StateInputs, c: StateCard): StateInputs => {
    // The state's dependent exemptions go; an exemption deduction carried
    // as read loses the dependents' share; and a state deduction that was
    // just the standard deduction for the status (California's head of
    // household amount) becomes the single one.
    const ex = c.exemption;
    const dd = c.deduction;
    return {
      ...si,
      dependents: 0,
      exemptionsRead:
        si.exemptionsRead !== null && ex.kind === "deduction" ? Math.max(0, si.exemptionsRead - dependents * ex.dependentAmount) : si.exemptionsRead,
      deductionRead: si.deductionRead !== null && dd.kind === "standard" && si.deductionRead === dd.amount[status] ? null : si.deductionRead,
    };
  };

  /** One entity return in one scenario: its ordinary income, the household's K-1 from it, its own tax and its lines. */
  const unitRun = (u: Unit, j: number, s: Scenario) => {
    const e = u.e;
    if (u.form === "1065") {
      // The 1065 with its deductions switched on or off: the write-offs,
      // and the guaranteed payments (the partners' health premiums, which
      // come back as the health insurance deduction on the 1040). Each
      // partner's K-1 is their share of what's left.
      const ordinary = u.income - (s.writeOffs ? u.cogs + u.writeOffs : 0) - (s.healthInsurance ? u.guaranteed : 0);
      const ords = allocate(ordinary, u.shares);
      const offset = partnerOffsets[partnershipUnits.indexOf(u)];
      const ps: Partner[] = partners.slice(offset, offset + u.partners.length).map((p, k) => ({
        ...p,
        ordinary: ords[k],
        guaranteed: s.healthInsurance ? p.guaranteed : 0,
        premiums: s.healthInsurance ? p.premiums : 0,
      }));
      const k1 = ps.reduce((t, p) => t + p.ordinary + p.guaranteed, 0);
      // The state's own adjustment to the partnership's income, carried.
      const stateNet = has(e.stateNetIncome) ? ordinary + ((e.stateNetIncome as number) - u.ordinaryAfter) : ordinary;
      // A card without partnership rules: what the partnership pays its
      // state is a fee on its receipts, the same on every scenario, so it's
      // carried as read (the elective tax still needs the card's rule).
      const ent = u.card?.partnership
        ? entityWithExtra(partnershipTax(u.card, u.feeBase, stateNet, s.pte && u.electing), u.extra)
        : u.card
          ? { netIncome: stateNet, franchise: n(e.stateTax), pte: 0, city: n(e.cityTax), total: n(e.stateTax) + n(e.cityTax) }
          : null;
      const numbers: EntityNumbers = {
        ...emptyEntityNumbers(),
        grossReceipts: u.gross,
        cogs: s.writeOffs && u.cogs > 0 ? u.cogs : null,
        otherIncome: u.other ? u.other : null,
        totalIncome: u.income - (s.writeOffs ? u.cogs : 0),
        wages: s.writeOffs ? e.wages : null,
        repairs: s.writeOffs ? e.repairs : null,
        rents: s.writeOffs ? e.rents : null,
        interest: s.writeOffs ? e.interest : null,
        depreciation: s.writeOffs ? e.depreciation : null,
        advertising: s.writeOffs ? e.advertising : null,
        guaranteedPayments: s.healthInsurance && u.guaranteed > 0 ? u.guaranteed : null,
        taxesLicenses: s.writeOffs ? e.taxesLicenses : null,
        pension: s.writeOffs ? e.pension : null,
        employeeBenefits: s.writeOffs ? e.employeeBenefits : null,
        otherDeductions: s.writeOffs ? e.otherDeductions : null,
        totalDeductions: u.income - (s.writeOffs ? u.cogs : 0) - ordinary,
        ordinaryIncome: ordinary,
        k1Ordinary: ords[0] ?? null,
        k1Guaranteed: ps[0] && ps[0].guaranteed > 0 ? ps[0].guaranteed : null,
        ownershipPct: e.ownershipPct,
        k1Ordinary2: ords.length > 1 ? ords[1] : null,
        k1Guaranteed2: ps[1] && ps[1].guaranteed > 0 ? ps[1].guaranteed : null,
        ownershipPct2: ords.length > 1 ? e.ownershipPct2 : null,
        distributions: e.distributions,
        stateGrossIncome: has(e.stateGrossIncome) ? u.feeBase : null,
        stateNetIncome: has(e.stateNetIncome) ? stateNet : null,
        // Carried as read when the card has no partnership rules.
        ...(u.card && !u.card.partnership ? { cityNetIncome: e.cityNetIncome, cityTax: e.cityTax, cityAmountDue: e.cityAmountDue, cityPayments: e.cityPayments } : {}),
        stateTax: ent && (u.card?.partnership || has(e.stateTax)) ? ent.franchise : null,
        pteTax: ent && ent.pte > 0 ? ent.pte : null,
        stateTotalTax: ent ? ent.franchise + (has(e.pteTax) ? ent.pte : 0) : null,
        statePayments: e.statePayments,
        stateAmountDue: ent ? Math.max(0, ent.franchise + (has(e.pteTax) ? ent.pte : 0) - n(e.statePayments)) : null,
        stateRefund: ent ? Math.max(0, n(e.statePayments) - ent.franchise - (has(e.pteTax) ? ent.pte : 0)) || null : null,
      };
      return { ordinary, k1, ps, ent, numbers, j };
    }
    const ordinary =
      u.income -
      (s.writeOffs ? u.cogs + u.writeOffs : 0) -
      (s.salary ? u.officerComp : 0) -
      (s.retirement ? u.pension : 0) -
      (s.pte ? u.stateAddBack : 0);
    // The K-1's section 179 deduction goes with the write-offs: box 1
    // stays gross of it, Schedule E nets it.
    const k1Gross = Math.round(ordinary * u.ownershipPct);
    const k1 = k1Gross - (s.writeOffs ? u.section179 : 0);
    const comp = s.salary ? u.officerComp : 0;
    const stateNet = ordinary + (s.pte ? u.stateAddBack : 0) + u.stateNetAdj;
    // The city's tax follows the ordinary income of the scenario at the
    // return's own allocation.
    const ent = u.card?.entity
      ? entityWithExtra(entityTax(u.card, stateNet, u.gross, s.pte && u.electing, u.cityIn ? { ...u.cityIn, base: ordinary } : null), u.extra)
      : null;
    const numbers: EntityNumbers = {
      ...emptyEntityNumbers(),
      grossReceipts: u.gross,
      cogs: s.writeOffs && u.cogs > 0 ? u.cogs : null,
      otherIncome: u.other ? u.other : null,
      totalIncome: u.income - (s.writeOffs ? u.cogs : 0),
      officerComp: s.salary && comp > 0 ? comp : null,
      wages: s.writeOffs ? e.wages : null,
      repairs: s.writeOffs ? e.repairs : null,
      rents: s.writeOffs ? e.rents : null,
      interest: s.writeOffs ? e.interest : null,
      depreciation: s.writeOffs ? e.depreciation : null,
      advertising: s.writeOffs ? e.advertising : null,
      taxesLicenses: s.writeOffs ? e.taxesLicenses : null,
      pension: s.retirement && u.pension > 0 ? u.pension : null,
      employeeBenefits: s.writeOffs ? e.employeeBenefits : null,
      otherDeductions: s.writeOffs ? e.otherDeductions : null,
      totalDeductions: u.income - (s.writeOffs ? u.cogs : 0) - ordinary,
      ordinaryIncome: ordinary,
      k1Ordinary: k1Gross,
      k1Section179: s.writeOffs && u.section179 > 0 ? u.section179 : null,
      ownershipPct: e.ownershipPct,
      distributions: e.distributions,
      stateNetIncome: ent ? stateNet : null,
      stateAddBack: s.pte && u.stateAddBack > 0 ? u.stateAddBack : null,
      stateTax: ent ? ent.franchise : null,
      pteTax: ent && ent.pte > 0 ? ent.pte : null,
      stateTotalTax: ent ? ent.franchise + (has(e.pteTax) ? ent.pte : 0) : null,
      statePayments: e.statePayments,
      stateAmountDue: ent ? Math.max(0, ent.franchise + (has(e.pteTax) ? ent.pte : 0) - n(e.statePayments)) : null,
      stateRefund: ent ? Math.max(0, n(e.statePayments) - ent.franchise - (has(e.pteTax) ? ent.pte : 0)) || null : null,
      // The city's return, when there is one: the allocation and receipts
      // are facts of the year; the allocated income and tax follow the scenario.
      cityNetIncome: u.cityIn ? Math.round(ordinary * u.cityIn.allocation) + u.cityIn.adjust : e.cityNetIncome,
      cityAllocationPct: e.cityAllocationPct,
      cityReceipts: e.cityReceipts,
      cityTax: ent && (u.cityIn || has(e.cityTax)) ? ent.city : null,
      cityPayments: e.cityPayments,
      cityAmountDue: ent && (u.cityIn || has(e.cityTax)) ? Math.max(0, ent.city - n(e.cityPayments)) : null,
    };
    return { ordinary, k1, ps: [] as Partner[], ent, numbers, j };
  };

  const run = (s: Scenario): Outcome => {
    let fi: FederalInputs;
    /** Each person's FICA wages in this scenario, and the W-2 lines as the grid shows them. */
    let wagesByPerson = afterWagesByPerson;
    let w2Lines: W2Lines | null = null;
    /** Withholding that left with the W-2s switched off. */
    let fedWithheldOff = 0;
    let stateWithheldOff = 0;
    // The Schedule C, when there is one: its expenses go with the Schedule
    // C switches, its Schedule SE against this scenario's W-2s. A payroll
    // cleanup's goes whole with the pay it stands for.
    const schCProfit = payrollSchC
      ? (payrollAsSalary ? s.salary : s.writeOffs)
        ? netAfter
        : 0
      : hasSchC
        ? gross - (s.expenses ? schCogs + expenses : 0) - (s.homeOffice ? homeOffice : 0)
        : 0;
    const outcomes = units.map((u, j) => unitRun(u, j, s));
    const k1 = outcomes.reduce((t, o) => t + o.k1, 0);
    const scorpK1 = outcomes.reduce((t, o, j) => t + (units[j].form === "1120-S" ? o.k1 : 0), 0);
    let ps = outcomes.flatMap((o) => o.ps);
    /** Share of the write-offs switched on, 0 on the before and 1 on the after. */
    const fraction =
      shape === "soleProp"
        ? (gross - schCProfit) / Math.max(1, gross - netAfter)
        : (sum(units, (u) => u.income) - outcomes.reduce((t, o) => t + o.ordinary, 0)) / Math.max(1, sum(units, (u) => u.income - u.ordinaryAfter));
    /** The business income the state starts from: the Schedule C beside a partnership counts too. */
    const biz = shape === "soleProp" ? schCProfit : k1 + (shape === "partnership" && hasSchC ? schCProfit : 0);
    if (shape === "soleProp") {
      // Without Form 8995-A, the wage limit is the Schedule C's own wages,
      // which leave with the expenses.
      fi = { ...inputs, netProfit: schCProfit, qbiLimit: qbiRead ? null : { w2Wages: s.expenses ? n(after.schCWages) : 0, ubia: 0 } };
    } else if (shape === "partnership") {
      fi = {
        ...inputs,
        partners: ps,
        netProfit: hasSchC ? schCProfit : inputs.netProfit,
        // The premiums the partnership paid go with the guaranteed payments.
        sehiPaid: premiumsViaPartners ? (s.healthInsurance ? sehiPaid : null) : inputs.sehiPaid,
        // Over the threshold, Form 8995-A's QBI scales with the K-1 and the
        // partnership's W-2 wages leave with the write-offs.
        qbi: qbiRead
          ? { income: qbiRatio !== null ? Math.round(k1 * qbiRatio) : qbiRead.income, w2Wages: s.writeOffs ? qbiRead.w2Wages : 0, ubia: qbiRead.ubia }
          : null,
        qbiLimit: qbiRead ? null : { w2Wages: (s.writeOffs ? partnershipWages : 0) + (hasSchC && s.expenses ? n(after.schCWages) : 0), ubia: 0 },
      };
    } else {
      // The officer's W-2: the pay less any the payroll cleanup ran through the Schedule C.
      const comp = s.salary ? officerCompW2 : 0;
      const hi = s.salary ? healthInsurance : 0;
      const box1 = Math.max(0, comp - (s.salary && s.retirement ? deferral : 0));
      /** The owner's Medicare wages: the pay less the premiums and any other fringe benefit in it. */
      const officerMed = s.salary ? Math.max(0, comp - hi - otherOfficerPay) : 0;
      // Wages the business paid anyone else sit inside the write-offs: off
      // with them, the W-2 income goes too. Other employers' wages stay.
      const employee = s.writeOffs ? wages.employeeEntity : 0;
      wagesByPerson = wagesByPersonFor(wages, officerMed, employee);
      w2Lines = wages.read ? w2LinesFor(wages, box1, employee) : null;
      fedWithheldOff = (s.salary ? 0 : fedWithholding.officer) + (s.writeOffs ? 0 : fedWithholding.employee);
      stateWithheldOff = (s.salary ? 0 : stateWithholding.officer) + (s.writeOffs ? 0 : stateWithholding.employee);
      // A partner's wage base beside the corporation is used up by their
      // own W-2s in this scenario: the officer's pay leaves with the salary.
      ps = ps.map((p) => (p.wages > 0 ? { ...p, wages: wagesByPerson[p.person] } : p));
      fi = {
        ...inputs,
        scorp: scorpK1,
        partners: ps,
        netProfit: schCProfit,
        seWages: hasSchC ? box1 + employee + outsideWages + (officerComp > 0 ? (s.salary ? ssExtra : 0) : ssExtra) : 0,
        w2: box1 + employee + outsideWages,
        medicareWages: officerMed + employee + outsideWages,
        scorpMedicareWages: officerMed,
        sehiPaid: s.salary ? sehiPaid : null,
        qbi: qbiRead
          ? { income: qbiRatio !== null ? Math.round(k1 * qbiRatio) : qbiRead.income, w2Wages: s.salary ? qbiRead.w2Wages : 0, ubia: qbiRead.ubia }
          : null,
        // Without Form 8995-A: the officer's pay goes with the salary, the
        // other wages with the write-offs, the Schedule C's with its expenses.
        qbiLimit: qbiRead
          ? null
          : {
              w2Wages: (s.salary ? officerComp : 0) + (s.writeOffs ? scorpWages + partnershipWages : 0) + (hasSchC && s.expenses ? n(after.schCWages) : 0),
              ubia: 0,
            },
        childCareCredit: s.salary ? childCareCredit : 0,
      };
    }
    // A real estate professional's rentals are nonpassive only with the
    // status switched on; off, the losses go through Form 8582's allowance.
    // What the client saved into a SEP, an IRA or an HSA, and a sole
    // proprietor's health insurance deduction: things DeCypher set up or
    // caught, so off on the before (the tax team's call, 2026-10-05).
    if (!s.retirement) fi = { ...fi, sep: 0, carried: Math.max(0, fi.carried - ira - hsa) };
    if (hasSchC && shape !== "scorp" && !premiumsViaPartners && !s.healthInsurance) fi = { ...fi, sehiPaid: null };
    // Without the rental expenses every property nets its rents: profits
    // are the rents and there are no losses (earlier years' suspended
    // losses still come off on Form 8582).
    if (rental) {
      const r = s.rentalExpenses || !rental.expensesRead ? rental : { ...rental, profits: rental.rents, losses: 0 };
      fi = { ...fi, rental: { ...r, reps: rental.reps && s.reps } };
    }
    // Without the dependents: no child tax credit, no child-care credit, and
    // no qualifying person for head of household.
    const runStatus = s.noKids ? statusWithoutDependents(status) : status;
    if (s.noKids) fi = { ...fi, children: 0, others: 0, childCareCredit: 0, extra: { ...fi.extra, childTaxCredit: 0 } };
    const f = federal(fed, runStatus, fi);
    let st: State | null = null;
    // The credit available beyond the share (a carryover) is carried across.
    const pteShare = Math.max(
      0,
      outcomes.reduce((t, o, j) => t + (o.ent ? Math.round(o.ent.pte * pteShareOf(units[j])) : 0), 0) + pteCreditExtra,
    );
    /** An electing entity's K-1, left off the owner's return where the state excludes it. */
    const excluded = s.pte ? outcomes.reduce((t, o, j) => t + (units[j].electing ? o.k1 : 0), 0) : 0;
    /** The business income in this scenario, for a part-year state's source share. */
    const bizNow = schCProfit + k1;
    /** Each other state return in this scenario (engine v13), before the main state, whose credit for them depends on their tax. */
    const otherSt = otherStates.map((o) => {
      let si = stateInputsFor(f, biz, 0, fi.w2, wagesByPerson, 0);
      const adjustment = n(o.read.stateAdjustments);
      si = {
        ...si,
        carriedAdjustment: adjustment,
        deductionRead: has(o.read.stateDeduction) ? o.read.stateDeduction : null,
        exemptionsRead: has(o.read.stateExemptions) ? o.read.stateExemptions : null,
        uninsuredMonths: 0,
        localResident: false,
      };
      if (!s.retirement && hsa > 0 && adjustment > 0) si = { ...si, carriedAdjustment: adjustment - Math.min(hsa, adjustment) };
      if (s.noKids) si = withoutKids(si, o.card);
      const { source } = scaleSource(o.source, o.sourceBusiness, bizNow);
      return stateWithExtra(source !== null ? nonresidentState(o.card, runStatus, f, si, source) : state(o.card, runStatus, f, si), o.extra);
    });
    const mainSource = scaleSource(stateSource, stateSourceBusiness, bizNow);
    if (stateCard) {
      const stateBiz = biz + Math.round(stateBizDelta * Math.min(1, Math.max(0, fraction)));
      let si = stateInputsFor(f, stateBiz, mode === "exclusion" ? 0 : pteShare, fi.w2, wagesByPerson, mode === "exclusion" ? excluded : 0);
      // A state that doesn't allow the HSA deduction adds it back
      // (California's Schedule CA): with the HSA off, so is the add-back.
      if (!s.retirement && hsa > 0 && stateAdjustments > 0) {
        si = { ...si, carriedAdjustment: si.carriedAdjustment - Math.min(hsa, stateAdjustments) };
      }
      if (s.noKids) si = withoutKids(si, stateCard);
      st = mainSource.source !== null ? nonresidentState(stateCard, runStatus, f, si, mainSource.source) : state(stateCard, runStatus, f, si);
      // A resident return's credit for the tax paid to the other states:
      // the smaller of that tax and the resident tax on the share of income
      // they taxed — so it grows with their tax on the before.
      if (otherCreditRead !== null && mainSource.source === null) {
        const othersTax = otherSt.reduce((t, x) => t + x.netTax, 0);
        const othersSource = otherStates.reduce((t, o) => t + n(scaleSource(o.source, o.sourceBusiness, bizNow).source), 0);
        const ratio = st.income > 0 ? Math.min(1, othersSource / st.income) : 0;
        const credit = Math.max(0, Math.min(othersTax, Math.round(st.netTax * ratio)) + otherCreditExtra);
        st = { ...st, otherStateCredit: credit, grossTax: Math.max(0, st.grossTax - credit), netTax: Math.max(0, st.netTax - credit) };
      }
      st = stateWithExtra(st, stateExtra);
    }
    const numbers = fillNumbers(
      after,
      f,
      st,
      fi,
      shape,
      kinds,
      stateCard,
      { ...mainSource, creditModeled: otherCreditRead !== null && mainSource.source === null, creditWithPayments },
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
    const otherStateNumbers = otherStates.map((o, i) =>
      fillStateNumbers(o.read, otherSt[i], o.card, scaleSource(o.source, o.sourceBusiness, bizNow)),
    );
    const entityNumbers = outcomes[0]?.numbers ?? null;
    const otherEntityNumbers = outcomes.slice(1).map((o) => o.numbers);
    const total = totalTaxesOf(numbers, entityNumbers, { states: otherStateNumbers, entities: otherEntityNumbers, mainState: stateCode });
    return {
      fed: f,
      st,
      entity: outcomes[0]?.ent ?? null,
      entities: outcomes.map((o) => o.ent),
      pteShare,
      numbers,
      entityNumbers,
      otherEntityNumbers,
      otherSt,
      otherStateNumbers,
      total,
    };
  };

  /* 5 · fit the entity's and the state's totals, as the model rebuilds them */

  // The scenario rebuilds the entity's state income from the federal
  // return and the state its tax from the card; what the prints carry
  // beyond that (an adjustment, a credit, a carryover) is carried across.
  let afterRun = run(ALL_ON);
  if (stateCard && afterRun.entity && shape !== "soleProp") {
    for (const [j, u] of units.entries()) {
      const t = afterRun.entities[j];
      if (!t) continue;
      const c = u.card ?? stateCard;
      const e = u.e;
      const named = (s: string) => (several ? `${u.label}: ${s}` : s);
      if (has(e.stateTax)) {
        u.extra.franchise = soft(
          named(`${c.name} ${u.form === "1120-S" ? "S corporation tax" : "partnership tax and fee"}`),
          e.stateTax,
          t.franchise,
          u.form === "1120-S"
            ? `a state adjustment beyond the taxes added back, a credit, or a rate or minimum the ${c.name} card doesn't have`
            : `a fee tier or annual tax the ${c.name} card doesn't have`,
        );
      } else if (t.franchise !== 0) {
        // Not read off the entity's print: the after is taken as printed —
        // none — and the before carries only what the write-offs change,
        // so a line the reader missed can't show up as savings.
        u.extra.franchise = -t.franchise;
        softNotes.push(
          named(
            `The ${c.name} ${u.form === "1120-S" ? "S corporation tax" : "partnership tax and fee"} wasn't read from the entity's print; the ${fmt(t.franchise)} the card gives is left off both sides, so only what the write-offs change in it shows on the before`,
          ),
        );
      }
      if (has(e.pteTax)) {
        u.extra.pte = soft(
          named(`${stateCard.name} PTE elective tax`),
          e.pteTax,
          t.pte,
          `a ${u.form === "1120-S" ? "shareholder" : "partner"} who didn't consent, or a rate the card doesn't have`,
        );
      }
      if (u.extra.franchise || u.extra.pte) afterRun = run(ALL_ON);
      if (has(e.cityTax)) {
        u.extra.city = soft(
          named(`${u.cityRules?.name ?? "City"} corporation tax`),
          e.cityTax,
          afterRun.entities[j]?.city ?? 0,
          u.cityRules
            ? "the capital-base or alternative tax, a credit, or a minimum the card doesn't have"
            : `a city tax ${stateCard.name}'s card has no rules for — carried across, not re-figured on the before`,
        );
        if (u.extra.city) afterRun = run(ALL_ON);
      }
    }
    if (has(after.statePteCreditAvailable)) {
      const who = shape === "scorp" ? "S corporation" : "partnership";
      pteCreditExtra = soft(
        `${stateCard.name} PTE elective tax credit available`,
        after.statePteCreditAvailable,
        afterRun.pteShare,
        `a carryover from last year, or a second electing ${who}`,
      );
      if (pteCreditExtra) afterRun = run(ALL_ON);
    }
  }
  // Each other state's own lines and total, the way the main state's are.
  for (const [i, o] of otherStates.entries()) {
    const chk = afterRun.otherSt[i];
    const name = o.card.name;
    if (has(o.read.stateTaxOnIncome)) {
      const asResident = chk.residentTax !== undefined && !off(o.read.stateTaxOnIncome, chk.residentTax);
      if (!asResident) soft(`${name} tax on income`, o.read.stateTaxOnIncome, chk.tax, `a deduction, exemption or adjustment the ${name} card doesn't model`);
    }
    if (has(o.read.stateExemptionCredits) && o.card.exemption.kind === "credit") {
      soft(`${name} exemption credits`, o.read.stateExemptionCredits, chk.exemption, "a dependent the engine didn't count, or a senior or blind exemption");
    }
    o.extra = soft(
      `${name} total tax`,
      o.read.stateTotalTax as number,
      chk.netTax,
      `a credit, a local tax or an adjustment the ${name} card doesn't model${o.source !== null && !o.card.nonresident ? `, or ${name}'s own part-year rules (its card names no part-year form, so it's prorated the usual way)` : ""}`,
    );
    if (o.extra) afterRun = run(ALL_ON);
  }
  // The main state's credit for the tax paid to them, when it was read.
  if (stateCard && afterRun.st && otherCreditRead !== null && stateSource === null) {
    otherCreditExtra = soft(
      `${stateCard.name} credit for tax paid to other states`,
      otherCreditRead,
      afterRun.st.otherStateCredit,
      "the credit's own limits by income class, or a state the credit doesn't cover",
    );
    if (otherCreditExtra) afterRun = run(ALL_ON);
  }
  /** The main state's total as the return prints it: gross of a refundable PTE credit, and of a credit for other states' tax claimed with the payments (the figured one; one only read is already outside the figure). */
  const printedStateTotal = (o: Outcome) =>
    o.st ? (creditMode(stateCard) === "refundable" ? o.st.grossTax : o.st.netTax) + (creditWithPayments ? o.st.otherStateCredit : 0) : 0;
  // The state's total read off a line before the credits (Delaware's
  // PIT-RES line 26 — a 2024 return: $28,469 read, while its $7,000 of
  // payments and $20,919 still owed settle against $27,919): when the
  // payments, the refund and the balance due add up to what the card gives
  // and not to the line read, the line read was another one. Taken as the
  // settled figure, on the after column too (`afterFixes`).
  if (stateCard && afterRun.st && has(after.stateTotalTax) && has(after.statePayments) && (has(after.stateRefund) || has(after.stateAmountOwed))) {
    const settled = after.statePayments - n(after.stateRefund) + n(after.stateAmountOwed);
    const figured = printedStateTotal(afterRun);
    if (off(after.stateTotalTax, figured) && off(after.stateTotalTax, settled) && !off(settled, figured)) {
      softNotes.push(
        `The ${stateCard.name} total was read as ${fmt(after.stateTotalTax)}, but the return's ${fmt(after.statePayments)} of payments${
          has(after.stateRefund) ? ` less its ${fmt(after.stateRefund)} refund` : ""
        }${has(after.stateAmountOwed) ? ` and ${fmt(after.stateAmountOwed)} still owed` : ""} settle against ${fmt(settled)}, which is what the ${stateCard.name} tables give: a line before the credits was read, so the total is taken as ${fmt(settled)}`,
      );
      after = { ...after, stateTotalTax: settled };
      afterFixes.stateTotalTax = settled;
    }
  }
  // A city resident whose city lines weren't read (a print without the
  // IT-201's page 3: line 61 read, lines 47–54 not): when the total only
  // adds up with the city's tax on the same income, the filer lives there
  // (a 2025 return: $43,949 = $28,147 New York + $15,802 New York City).
  if (
    stateCard?.local &&
    !localResident &&
    !has(after.stateLocalTax) &&
    afterRun.st &&
    has(after.stateTotalTax) &&
    off(after.stateTotalTax, printedStateTotal(afterRun))
  ) {
    localResident = true;
    const withCity = run(ALL_ON);
    if (withCity.st && !off(after.stateTotalTax, printedStateTotal(withCity))) {
      afterRun = withCity;
      softNotes.push(
        `${stateCard.local.name}'s resident tax wasn't read, but the ${stateCard.name} total (${fmt(after.stateTotalTax)}) is ${stateCard.name}'s tax plus the city's on the same income (${fmt(withCity.st.local)}) to the dollar, so the filer is taken as a ${stateCard.local.name} resident on both sides`,
      );
    } else localResident = false;
  }
  if (stateCard && afterRun.st && has(after.stateTotalTax)) {
    stateExtra = soft(
      `${stateCard.name} total tax`,
      after.stateTotalTax,
      printedStateTotal(afterRun),
      `dependents, a credit, or an adjustment the ${stateCard.name} card doesn't model${
        stateCard.wageDeduction && !wages.read && w2 > 0 && (status === "mfj" || status === "qss")
          ? `; the per-person Social Security / Medicare deduction was figured on one person's wages because the W-2 lines (taxpayer's and spouse's) weren't read`
          : ""
      }`,
    );
    if (stateExtra) afterRun = run(ALL_ON);
  }

  return {
    ok: true,
    model: {
      shape,
      kinds,
      status,
      card: { federal: fed, state: stateCard },
      year: year as number,
      stateCode,
      units,
      otherStates,
      run,
      after: afterRun,
      residuals,
      softNotes,
      afterFixes,
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
        schCNet: shape !== "soleProp" ? netAfter : 0,
        schCOwner: base.schCOwner,
        payrollSchC: payrollSchC ? { amount: netAfter, asSalary: payrollAsSalary } : null,
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
        city: (() => {
          const u = scorpUnits.find((x) => x.cityIn && x.cityRules);
          return u?.cityIn && u.cityRules ? { name: u.cityRules.name, allocation: u.cityIn.allocation, receipts: u.cityIn.receipts } : null;
        })(),
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

/**
 * What Form 8960 says net investment income is, from the tax as printed:
 * the tax over the rate, when AGI is over the threshold and the tax isn't
 * capped by the excess. Zero when AGI is over the threshold and there is
 * no tax. Null when the return can't say — AGI under the threshold, or the
 * tax is on the excess and the income could be anything above it.
 */
function inferNii(card: FederalCard, status: FilingStatus, niitRead: number, agi: number): number | null {
  const ni = card.netInvestmentIncomeTax;
  const over = agi - ni.threshold[status];
  if (over <= 0 || ni.rate <= 0) return null;
  if (niitRead <= 0) return 0;
  const base = Math.round(niitRead / ni.rate);
  return base < over - Math.ceil(TOL / ni.rate) ? base : null;
}

/** Lay a run out as the lines of a return, the way the review grid shows them. */
function fillNumbers(
  after: ReturnNumbers,
  b: Federal,
  sBefore: State | null,
  fi: FederalInputs,
  shape: Model["shape"],
  kinds: Model["kinds"],
  stateCard: StateCard | null,
  /**
   * A part-year or nonresident main state's source income in this
   * scenario and the business part of it; whether the credit for other
   * states' tax was figured, and whether the state claims it with the
   * payments (Virginia, Pennsylvania).
   */
  source: { source: number | null; business: number | null; creditModeled: boolean; creditWithPayments: boolean },
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
  // A sole proprietor's Schedule C, or the side business beside an entity.
  out.businessNetIncome = shape === "soleProp" ? fi.netProfit : fi.netProfit !== 0 ? fi.netProfit : null;
  out.scorpIncome = kinds.scorp ? fi.scorp : null;
  out.partnershipIncome = kinds.partnership ? fi.partners.reduce((s, p) => s + p.ordinary + p.guaranteed, 0) : null;
  if (fi.rental) {
    out.rentalIncome = b.rentalDeducted;
    // On the after these are the lines as read; with the rental expenses
    // zeroed every property nets its rents.
    const asFiled = s.rentalExpenses || !fi.rental.expensesRead;
    out.rentalProfits = asFiled ? after.rentalProfits : fi.rental.profits > 0 ? fi.rental.profits : null;
    out.rentalLosses = asFiled ? after.rentalLosses : null;
    out.rentalRents = fi.rental.expensesRead && fi.rental.rents > 0 ? fi.rental.rents : null;
    out.rentalExpenses = s.rentalExpenses && fi.rental.expensesRead && fi.rental.expenses > 0 ? fi.rental.expenses : null;
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
  // (A payroll cleanup's Schedule C that left with its pay leaves no Schedule C behind.)
  if (shape === "soleProp" || (kinds.schC && gross > 0 && fi.netProfit !== 0)) {
    out.grossReceipts = gross;
    out.cogs = s.expenses ? after.cogs : null;
    out.totalExpenses = s.expenses ? after.totalExpenses : null;
    out.schCWages = s.expenses ? after.schCWages : null;
    out.schCDepreciation = s.expenses ? after.schCDepreciation : null;
    out.homeOffice = s.homeOffice ? after.homeOffice : null;
    // the Part II lines go with the expenses (the video's write-offs; no identity reads them)
    for (const k of SCH_C_LINE_KEYS) out[k] = s.expenses ? after[k] : null;
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
    out.stateSourceIncome = source.source;
    out.stateSourceBusinessIncome = has(after.stateSourceBusinessIncome) && source.source !== null ? source.business : null;
    out.stateAdjustments = after.stateAdjustments;
    out.stateDeduction = after.stateDeduction;
    // With more than one kind of business (a Schedule C beside a
    // partnership, several entities) the state's business line is all of them.
    const mixed = kinds.partnership && (kinds.scorp || kinds.schC);
    out.stateBusinessIncome = has(after.stateBusinessIncome)
      ? mixed
        ? fi.netProfit + n(out.partnershipIncome) + n(out.scorpIncome)
        : shape === "soleProp"
          ? fi.netProfit
          : shape === "partnership"
            ? out.partnershipIncome
            : fi.scorp
      : null;
    // Figured from the other states' tax when they were read, else carried.
    out.stateOtherStateCredit = has(after.stateOtherStateCredit) ? (source.creditModeled ? sBefore.otherStateCredit : after.stateOtherStateCredit) : null;
    out.stateExemptions = after.stateExemptions;
    out.stateMedical = stateCard.medical ? sBefore.medical : null;
    out.stateWageDeduction = stateCard.wageDeduction || has(after.stateWageDeduction) ? orNull(sBefore.wageDeduction) : null;
    out.stateTaxOnIncome = has(after.stateTaxOnIncome) ? sBefore.tax : null;
    // The city's resident tax follows the scenario where the card has its
    // brackets; a city tax the card can't figure rides along as read.
    // Taken from the total when the line wasn't read, it's shown all the same.
    out.stateLocalTax = has(after.stateLocalTax) ? (stateCard.local ? sBefore.local : after.stateLocalTax) : sBefore.local > 0 ? sBefore.local : null;
    out.stateExemptionCredits = stateCard.exemption.kind === "credit" && has(after.stateExemptionCredits) ? sBefore.exemption : null;
    out.statePteCreditAvailable = pteShare > 0 && mode !== "exclusion" ? pteShare : null;
    // A nonrefundable credit sits inside the state's total; a refundable one
    // is printed with the payments, so the total stays gross of it and the
    // credit rides in the payments line, as the return prints them.
    out.statePteCredit = mode === "nonrefundable" && sBefore.pteCredit > 0 ? sBefore.pteCredit : null;
    out.statePteCreditRefundable = mode === "refundable" && sBefore.pteCredit > 0 ? sBefore.pteCredit : null;
    out.stateSharedResponsibility = stateCard.sharedResponsibility ? sBefore.sharedResponsibility : null;
    out.uninsuredMonths = stateCard.sharedResponsibility ? uninsured : after.uninsuredMonths;
    // A credit for other states' tax claimed with the payments is printed
    // there and outside the total; the balance is the tax net of it either way.
    const figuredWithPayments = source.creditWithPayments && source.creditModeled ? sBefore.otherStateCredit : 0;
    const creditInPayments = source.creditWithPayments ? (source.creditModeled ? sBefore.otherStateCredit : n(after.stateOtherStateCredit)) : 0;
    out.stateTotalTax = (mode === "refundable" ? sBefore.grossTax : sBefore.netTax) + figuredWithPayments;
    out.statePayments = has(after.statePayments) ? statePaid + (mode === "refundable" ? sBefore.pteCredit : 0) + creditInPayments : null;
    out.stateWithholding = withholding.state !== null ? orNull(withholding.state) : after.stateWithholding;
    out.statePenalty = after.statePenalty;
    const balance = sBefore.netTax + figuredWithPayments - creditInPayments - statePaid;
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

/**
 * Another state's return in a run, laid out as its lines: what moves (the
 * tax, the source income when the business is part of it) and what's
 * carried as read (the payments, its adjustments, its local tax inside the
 * total). The balance is the run's tax against the same payments.
 */
function fillStateNumbers(read: StateNumbers, st: State, sc: StateCard, source: { source: number | null; business: number | null }): StateNumbers {
  const out = emptyStateNumbers();
  out.stateSourceIncome = source.source;
  out.stateSourceBusinessIncome = has(read.stateSourceBusinessIncome) ? source.business : null;
  out.stateAdjustments = read.stateAdjustments;
  out.stateDeduction = read.stateDeduction;
  out.stateExemptions = read.stateExemptions;
  out.stateExemptionCredits = sc.exemption.kind === "credit" && has(read.stateExemptionCredits) ? st.exemption : null;
  out.stateTaxOnIncome = has(read.stateTaxOnIncome) ? st.tax : null;
  out.stateLocalTax = read.stateLocalTax;
  out.stateOtherStateCredit = read.stateOtherStateCredit;
  out.stateTotalTax = st.netTax;
  out.statePayments = read.statePayments;
  out.stateWithholding = read.stateWithholding;
  out.statePenalty = read.statePenalty;
  const balance = st.netTax - n(read.statePayments);
  if (balance >= 0) {
    out.stateAmountOwed = balance;
    out.stateTotalDue = balance + n(read.statePenalty);
  } else {
    out.stateRefund = -balance;
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
 *    QBI at the after's (Client A: $72,396, the before $2,949 too high).
 *  - Line 31 is inside line 32, so it can't be more than line 32 (Client A:
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
  // income exactly, with none of the rental lines behind it (Client E).
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
  // Schedule E line 26 read as $0 with no rental lines behind it (Client K): a return with no rental properties, the line filled in for
  // Schedule 1 line 5 or page 2's K-1 total. Not a rental.
  if (
    has(out.rentalIncome) &&
    out.rentalIncome === 0 &&
    !has(after.rentalProfits) &&
    !has(after.rentalLosses) &&
    !has(after.rentalRents) &&
    !has(after.rentalExpenses) &&
    !n(after.rentalReps) &&
    !n(after.passivePriorUnallowed)
  ) {
    out = { ...out, rentalIncome: null };
    notes.push("Rental real estate income read as $0 with no rental lines behind it — taken as no rental properties");
  }
  // The standard deduction on line 12 taken for a Schedule A total (Client B: no
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
 * Build the model, and when the after return doesn't reproduce outright,
 * try once more without the optional lines the reader returned that aren't
 * printed anywhere on the return (`meta.unverified`). A number the page
 * doesn't carry is the reader's own arithmetic — Client B's "state adjustments"
 * of −$36,602 were worked out from the nonresident column — and if the
 * return reproduces better without it, it was wrong. Nothing is dropped
 * unless dropping it derives where the first try refused, or carries fewer
 * lines across.
 */
function buildChecked(
  afterRead: ReturnNumbers,
  meta: DeriveMeta,
  tables: TableSet,
  entity: EntityNumbers | null,
  more: DeriveMore = {},
): { built: ModelResult; after: ReturnNumbers; notes: string[] } {
  const screened = screenReads(afterRead, meta, tables);
  const notes = [...screened.notes];
  const first = buildModel(screened.after, meta, tables, entity, more);
  const carried = (r: ModelResult) => (r.ok ? r.model.residuals.length : Infinity);
  if (carried(first) === 0) return { built: first, after: screened.after, notes };
  const suspects = (meta.unverified ?? []).filter(
    (k): k is ReturnFieldKey => OPTIONAL_FIELDS.has(k) && has(screened.after[k as ReturnFieldKey]),
  );
  if (!suspects.length) return { built: first, after: screened.after, notes };
  const without: ReturnNumbers = { ...screened.after };
  for (const k of suspects) without[k] = null;
  const retry = buildModel(without, meta, tables, entity, more);
  // Dropping lines is only evidence when it settles the matter: the return
  // derives where it refused, or reproduces to the dollar. Fewer lines
  // carried because fewer lines were checked proves nothing.
  const decisive = (!first.ok && retry.ok) || (retry.ok && carried(retry) === 0);
  if (!decisive) return { built: first, after: screened.after, notes };
  notes.push(
    `${suspects.map((k) => `${label(k)} (${fmt(n(screened.after[k]))})`).join(", ")} set aside: not printed anywhere on the return, and the after return ${
      carried(retry) === 0 ? "reproduces to the dollar" : "derives"
    } without ${suspects.length > 1 ? "them" : "it"}`,
  );
  return { built: retry, after: without, notes };
}

export function deriveBefore(
  afterRead: ReturnNumbers,
  meta: DeriveMeta,
  tables: TableSet = mergeTables({}),
  entity: EntityNumbers | null = null,
  more: DeriveMore = {},
): DeriveResult {
  const { built, after, notes: screenNotes } = buildChecked(afterRead, meta, tables, entity, more);
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
    // The wages the business pays are a write-off, zeroed on the before
    // with the rest, so the before's wage limit is zero whatever the after
    // paid; the wages count at the steps of the split where the write-offs
    // are on (`qbiLimit`), with qualified property as $0 throughout.
    const wagesPaid =
      m.shape === "soleProp"
        ? n(after.schCWages)
        : m.units.reduce((s, u) => s + (u.form === "1065" ? n(u.e.wages) : 0), 0) + (m.kinds.schC ? n(after.schCWages) : 0);
    const depreciation = m.shape === "soleProp" ? n(after.schCDepreciation) : 0;
    const where = m.shape === "soleProp" ? "Schedule C" : m.kinds.schC ? "the 1065 and Schedule C" : m.units.length > 1 ? "the 1065s" : "the 1065";
    earlyNotes.push(
      `Taxable income before the QBI deduction on the before (${fmt(b.fed.taxableBeforeQbi)}) is over the ${year} ${statusLabel} threshold (${fmt(qbiThreshold)}); with the write-offs gone ${where} ${/ and |1065s/.test(where) ? "pay" : "pays"} no wages, so the W-2 wage limit is zero and the deduction is ${fmt(b.fed.qbi)}${b.fed.qbi > 0 ? " inside the phase-in range" : ""}.${
        wagesPaid > 0
          ? ` The ${fmt(wagesPaid)} of wages ${where} does pay count toward the limit at the steps of the split where the write-offs are on, with qualified property as $0.`
          : ""
      }${
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
  // isn't modeled; past the threshold the deduction is carried as read,
  // which leaves the before's state tax a little low.
  if (
    stateCard &&
    facts.stateDeduction !== null &&
    stateCard.deduction.kind === "standard" &&
    facts.stateDeduction > stateCard.deduction.amount[m.status] &&
    stateCard.exemption.phaseOut &&
    b.fed.agi > stateCard.exemption.phaseOut.threshold[m.status]
  ) {
    earlyNotes.push(
      `${stateCard.name}'s itemized deductions (${fmt(facts.stateDeduction)}) phase down above ${fmt(stateCard.exemption.phaseOut.threshold[m.status])} of federal AGI, which the before's ${fmt(b.fed.agi)} crosses. The phase-down isn't modeled and the deduction is carried as read, so the before's ${stateCard.name} tax is if anything understated`,
    );
  }
  if (m.shape === "scorp") {
    const range = fed.qbi.phaseInRange[m.status];
    if (
      b.fed.taxableBeforeQbi > qbiThreshold &&
      b.fed.taxableBeforeQbi < qbiThreshold + range &&
      b.fed.qbi > 0
    ) {
      earlyNotes.push(
        `Taxable income before the QBI deduction on the before (${fmt(b.fed.taxableBeforeQbi)}) falls inside the ${year} phase-in range. The deduction (${fmt(b.fed.qbi)}) is figured as for an ordinary business; a specified service business (consulting, health, law, performing arts, financial services) would get less there, so for one the before's tax would be higher and the savings larger`,
      );
    }
  }

  /* what the reviewer should know */

  const stateName = stateCard?.name;
  /** The other states' tables, re-run too. */
  const alsoStates = m.otherStates.length ? `, ${m.otherStates.map((o) => o.card.name).join(", ")}` : "";
  const notes: string[] = [];
  const rentalBit = facts.rental
    ? facts.rental.expensesRead
      ? `, the rentals' ${fmt(facts.rental.expenses)} of expenses zeroed${facts.rental.reps ? " and the rentals treated as passive" : ""}`
      : `, the rentals carried as filed${facts.rental.reps ? " but treated as passive" : ""}`
    : "";
  const schCWriteOffs = facts.expenses + facts.schCogs + facts.homeOffice;
  /** The Schedule C beside the entity returns, when there is one. */
  const besideBit = (beside: string) =>
    facts.payrollSchC
      ? `; the ${fmt(facts.payrollSchC.amount)} Schedule C with no expenses is the owners' pay run through it for a payroll cleanup, and leaves with the ${facts.payrollSchC.asSalary ? "officer's pay" : "write-offs it was deducted among"}`
      : facts.schCNet !== 0
      ? schCWriteOffs > 0
        ? `; the ${fmt(facts.schCNet)} Schedule C beside ${beside} has its ${fmt(schCWriteOffs)} of expenses zeroed too, and its self-employment tax re-figured`
        : `; the ${fmt(facts.schCNet)} Schedule C beside ${beside} carries no expenses to zero, and its self-employment tax is re-figured`
      : "";
  if (m.units.length > 1) {
    // Several businesses: each entity return's own before.
    const parts = m.units.map((u) =>
      u.form === "1120-S"
        ? `${u.label}: cost of goods sold (${fmt(u.cogs)}), write-offs (${fmt(u.writeOffs)})${u.section179 > 0 ? `, the ${fmt(u.section179)} section 179 deduction` : ""}, the owner's ${fmt(u.officerComp)} of pay, the ${fmt(u.pension)} retirement plan and the ${fmt(u.stateAddBack)} of state taxes`
        : `${u.label}: ${u.cogs > 0 ? `cost of goods sold (${fmt(u.cogs)}), ` : ""}write-offs (${fmt(u.writeOffs)}) and the ${fmt(u.guaranteed)} of guaranteed payments`,
    );
    notes.push(
      `Derived from the ${m.units.length + 1} after returns: every deduction on each entity return set to zero, each on its own — ${parts.join("; ")} — so each K-1 is its share of that business's gross receipts, with no PTE election${rentalBit}${besideBit("them")}; the ${year} federal${stateName ? `, ${stateName}${alsoStates} and each entity's state` : ""} tables re-run (engine v${DERIVE_VERSION})`,
    );
  } else if (m.shape === "soleProp") {
    notes.push(
      `Derived from the after return: Schedule C expenses (${fmt(facts.expenses)})${facts.schCogs > 0 ? `, cost of goods sold (${fmt(facts.schCogs)})` : ""} and home office (${fmt(facts.homeOffice)}) set to zero${rentalBit} and the ${year} federal${stateName ? (alsoStates ? `, ${stateName}${alsoStates}` : ` and ${stateName}`) : ""} tables re-run (engine v${DERIVE_VERSION})`,
    );
  } else if (m.shape === "partnership") {
    notes.push(
      `Derived from the two after returns: every deduction on the 1065 set to zero — ${facts.cogs > 0 ? `cost of goods sold (${fmt(facts.cogs)}), ` : ""}write-offs (${fmt(facts.writeOffs)}) and the ${fmt(facts.guaranteedPayments)} of guaranteed payments${facts.partnerPremiums > 0 ? " (the partners' health premiums)" : ""} — so the K-1s are the gross receipts${rentalBit}${besideBit("the partnership")}; the ${year} federal${stateName ? (m.units[0]?.card?.partnership ? `, ${stateName}${alsoStates} and ${stateName} partnership` : alsoStates ? `, ${stateName}${alsoStates}` : ` and ${stateName}`) : ""} tables re-run (engine v${DERIVE_VERSION})`,
    );
  } else {
    const w = facts.wages;
    const other = w.officer === 0 ? "spouse" : "taxpayer";
    const outside = w.outside[0] + w.outside[1];
    const schCBit = facts.payrollSchC
      ? `; the ${fmt(facts.payrollSchC.amount)} Schedule C with no expenses is the owners' pay run through it for a payroll cleanup, and leaves with the ${facts.payrollSchC.asSalary ? "officer's pay" : "write-offs it was deducted among"}`
      : facts.schCNet !== 0
        ? schCWriteOffs > 0
          ? `; the ${fmt(facts.schCNet)} Schedule C beside the corporation has its ${fmt(schCWriteOffs)} of expenses zeroed too, and its self-employment tax re-figured against the W-2 wages that stay`
          : `; the ${fmt(facts.schCNet)} Schedule C beside the corporation carries no expenses to zero, and its self-employment tax is re-figured against the W-2 wages that stay (${fmt(b.fed.seTax)} on the before)`
        : "";
    notes.push(
      `Derived from the two after returns: every deduction on the 1120-S set to zero — cost of goods sold (${fmt(facts.cogs)}), write-offs (${fmt(facts.writeOffs)}${w.employeeEntity > 0 ? `, including the ${fmt(w.employeeEntity)} of wages the corporation paid the ${other}, whose W-2 goes with them` : ""})${facts.section179 > 0 ? `, the ${fmt(facts.section179)} section 179 deduction on the K-1` : ""}, the owner's ${fmt(facts.officerComp)} of pay, the ${fmt(facts.pension)} retirement plan, the ${fmt(facts.stateAddBack)} of state taxes — so the K-1 is the gross receipts, with no PTE election${rentalBit}${outside > 0 ? `; the ${fmt(outside)} of W-2 wages from another employer stay as they are` : ""}${schCBit}; the ${year} federal${stateName ? `, ${stateName}${alsoStates} and ${stateName} S corporation` : ""} tables re-run (engine v${DERIVE_VERSION})`,
    );
  }
  if (facts.s179Note) notes.push(facts.s179Note);
  if (facts.claimedAsDependent) {
    notes.push(
      `Someone else claims the filer (line 12a), so the standard deduction on both sides is the dependent's: earned income plus ${fmt(fed.dependentStandardDeduction.earnedPlus)}, at least ${fmt(fed.dependentStandardDeduction.minimum)} and at most the regular ${fmt(fed.standardDeduction[m.status])} — ${fmt(b.fed.deduction)} on the before`,
    );
  }
  const proof: Proof = { verified: m.residuals.length === 0, residuals: m.residuals };
  if (proof.verified) {
    notes.push(
      `Verified to the dollar: the same tables reproduce the after return's ${m.shape === "scorp" ? "" : "SE tax, "}${facts.rental ? "rental loss allowed, " : ""}QBI, ${facts.itemized ? "itemized deductions, " : ""}income tax${facts.coverage ? ", premium tax credit" : ""}${n(after.childTaxCredit) > 0 ? ", child tax credit" : ""} and federal total${stateName ? ` and ${stateName} tax` : ""}${m.shape !== "soleProp" && stateName ? `, and the ${m.shape === "scorp" ? "corporation" : "partnership"}'s ${stateName} tax` : ""}`,
    );
  } else {
    const count = m.residuals.length;
    notes.push(
      `Projected: the business's own lines reproduce, but ${count === 1 ? "one line" : `${count} lines`} of the after return ${count === 1 ? "isn't" : "aren't"} what the tables give on their own — ${m.residuals
        .map((r) => `${r.line.replace(/^The /, "")} ${fmt(r.read)} vs ${fmt(r.computed)}`)
        .join("; ")}. Each is carried across to the before as a fixed amount, so the after still reproduces exactly and the savings come from the business's lines alone. The notes below say what each could be; check them if the recap looks off`,
    );
  }
  notes.push(...m.softNotes);
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
  if (facts.rental && facts.rental.expensesRead) {
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
  if (m.units.length > 1) {
    for (const u of m.units) {
      if (u.form === "1120-S" && u.ownershipPct < 1) {
        notes.push(`${u.label}: the shareholder owns ${Math.round(u.ownershipPct * 1000) / 10}%, so its K-1 on each side is that share of its ordinary income`);
      }
    }
  } else if (m.shape === "scorp" && facts.ownershipPct < 1) {
    notes.push(`The shareholder owns ${Math.round(facts.ownershipPct * 1000) / 10}% of the corporation, so the K-1 on each side is that share of the ordinary income`);
  }
  if (facts.city && stateCard?.entity?.city) {
    const c = facts.city;
    const rules = stateCard.entity.city;
    notes.push(
      `${c.name}: the corporation's own ${rules.form} tax at ${Math.round(rules.rate * 10000) / 100}% of the net income allocated to the city at the return's ${Math.round(c.allocation * 10000) / 100}% business allocation — ${fmt(m.after.entity?.city ?? 0)} on the after, ${fmt(b.entity?.city ?? 0)} on the before, counted with the corporation's state tax. The fixed-dollar minimum is modeled; the capital-base and alternative taxes aren't (the income tax is the largest on any profitable year)`,
    );
  }
  if (stateCard?.local && (n(after.stateLocalTax) > 0 || (m.after.st?.local ?? 0) > 0)) {
    notes.push(
      facts.stateSource !== null
        ? `${stateCard.local.name} part-year resident tax: the city's rates on the ${stateCard.name} share of taxable income — ${fmt(m.after.st?.local ?? 0)} on the after, ${fmt(b.st?.local ?? 0)} on the before, inside the state's total on both sides; the difference from the ${fmt(n(after.stateLocalTax))} printed (the city-resident period's own income) is carried across`
        : `${stateCard.local.name} resident tax on the ${stateCard.form}: ${fmt(m.after.st?.local ?? 0)} on the after, ${fmt(b.st?.local ?? 0)} on the before, inside the state's total on both sides`,
    );
  }
  if (m.after.fed.eic > 0 || b.fed.eic > 0) {
    notes.push(`Earned income credit ${fmt(m.after.fed.eic)} → ${fmt(b.fed.eic)} on the before's income (line 27, by the ${year} EIC table)`);
  }
  if (m.after.fed.actc > 0 || b.fed.actc > 0) {
    notes.push(
      `Additional child tax credit (the child credit's refundable part, Schedule 8812) ${fmt(m.after.fed.actc)} → ${fmt(b.fed.actc)}: on the before's higher tax more of the credit is used against the tax and less is refunded`,
    );
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
  // A line 32 taken as payments says so in its own note.
  if (facts.otherPayments > 0 && m.afterFixes.otherPayments === undefined) {
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
        : `${stateCard.name} part-year/nonresident (Form ${stateCard.nonresident?.form ?? meta.stateForm ?? "?"}${stateCard.nonresident?.schedule ? ` with ${stateCard.nonresident.schedule}` : ""}): tax figured as a resident on all income, then prorated by the ${stateCard.name}-source share — ${fmt(n(b.numbers.stateSourceIncome))} of ${fmt(b.fed.totalIncome)} on the before${
            n(b.numbers.stateSourceIncome) !== facts.stateSource ? ` (${fmt(facts.stateSource)} on the after: the business income in it grows with the write-offs gone)` : ""
          }`,
    );
  }
  // Every other state's return, figured on its own (engine v13).
  m.otherStates.forEach((o, i) => {
    const bs = b.otherSt[i];
    const as = m.after.otherSt[i];
    const src = b.otherStateNumbers[i].stateSourceIncome;
    notes.push(
      o.source !== null
        ? `${o.card.name} (Form ${o.form ?? "?"}), part-year or nonresident: the tax as a resident on all income, prorated by the ${o.card.name}-source income — ${fmt(o.source)} on the after${
            o.sourceBusiness !== null && src !== null && src !== o.source ? `, ${fmt(src)} on the before as the business income in it grows with the write-offs gone` : ", the same on the before"
          }. ${fmt(as.netTax)} on the after, ${fmt(bs.netTax)} on the before, on its own row of the recap`
        : `${o.card.name} (Form ${o.form ?? "?"}) figured as a resident return: ${fmt(as.netTax)} on the after, ${fmt(bs.netTax)} on the before, on its own row of the recap`,
    );
  });
  if (stateCard && m.otherStates.length && b.st && m.after.st) {
    notes.push(
      m.after.st.otherStateCredit > 0 || b.st.otherStateCredit > 0
        ? `${stateCard.name}'s credit for the tax paid to ${m.otherStates.map((o) => o.card.name).join(" and ")}: ${fmt(m.after.st.otherStateCredit)} on the after, ${fmt(b.st.otherStateCredit)} on the before — the smaller of that tax and ${stateCard.name}'s own tax on the share of income they taxed`
        : has(after.stateOtherStateCredit)
          ? `${stateCard.name}'s credit for tax paid to other states (${fmt(after.stateOtherStateCredit)}) carried across as read`
          : `${stateCard.name}'s return carries no credit for tax paid to ${m.otherStates.map((o) => o.card.name).join(" and ")} that was read; if it claims one, it's inside the ${stateCard.name} total carried across`,
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
    otherEntitiesBefore: b.otherEntityNumbers,
    otherStatesBefore: b.otherStateNumbers,
    derived: { version: DERIVE_VERSION, notes, proof },
    afterFixes: m.afterFixes,
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
  more: DeriveMore = {},
): RecapAnalysis | null {
  const { built, after } = buildChecked(afterRead, meta, tables, entity, more);
  if (!built.ok) return null;
  const m = built.model;
  const { facts } = m;
  const stateName = m.card.state?.name ?? "state";

  /** A note can quote the total the step started from — what the year would have cost without it. `id` names the step when it isn't the switch's own name. */
  type Step = { key: keyof Scenario; id?: string; label: string; note: string | ((previousTotal: number) => string); skip: boolean };
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
  const several = m.units.length > 1;
  /** The Schedule C beside the entity returns (engine v11 beside a corporation, v13 beside a partnership). */
  const beside = several ? "the entity returns" : m.shape === "partnership" ? "the partnership" : "the corporation";
  const schCSteps: Step[] = [
    {
      key: "expenses",
      label: "Bookkeeping: Schedule C write-offs",
      note: `${fmt(facts.expenses + facts.schCogs)} of expenses found and deducted on the Schedule C beside ${beside}${facts.schCogs > 0 ? ` (${fmt(facts.schCogs)} of it cost of goods sold)` : ""}`,
      skip: facts.expenses + facts.schCogs <= 0,
    },
    {
      key: "homeOffice",
      label: "Home office",
      note: `${fmt(facts.homeOffice)} for the business use of the home (Form 8829)`,
      skip: facts.homeOffice <= 0,
    },
  ];
  const guaranteedStep: Step = {
    key: "healthInsurance",
    id: facts.partnerPremiums > 0 ? "healthInsurance" : "guaranteedPayments",
    label: facts.partnerPremiums > 0 ? "Health insurance through the partnership" : "Guaranteed payments to the partners",
    note:
      facts.partnerPremiums > 0
        ? `${fmt(facts.guaranteedPayments)} of premiums paid by the partnership as guaranteed payments and deducted on the 1040 as self-employed health insurance`
        : `${fmt(facts.guaranteedPayments)} of guaranteed payments deducted by the partnership`,
    skip: facts.guaranteedPayments <= 0,
  };
  // A partnership with a Schedule C beside it: the Schedule C's steps
  // first, then the 1065's; the premiums go with the guaranteed payments
  // when the partnership paid them, with the Schedule C's otherwise.
  const mixedPartnership: Step[] = [
    ...schCSteps,
    {
      key: "writeOffs",
      label: "Bookkeeping: business write-offs",
      note: `${fmt(facts.cogs + facts.writeOffs)} deducted on the 1065${several ? "s" : ""}${facts.cogs > 0 ? ` (${fmt(facts.cogs)} of it cost of goods sold)` : ""}, before the partners' guaranteed payments`,
      skip: facts.cogs + facts.writeOffs <= 0,
    },
    facts.guaranteedPayments > 0 ? guaranteedStep : healthStep,
    retirementStep,
    rentalStep,
    repsStep,
  ];
  const steps: Step[] =
    m.shape === "partnership" && (m.kinds.schC || several)
      ? mixedPartnership
      : m.shape === "soleProp"
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
          // The side business beside the corporation, when there is one.
          ...schCSteps,
          {
            key: "writeOffs",
            label: "Bookkeeping: business write-offs",
            note: `${fmt(facts.cogs + facts.writeOffs + facts.section179)} deducted on the ${several ? "entity returns" : "1120-S"}${facts.cogs > 0 ? ` (${fmt(facts.cogs)} of it cost of goods sold)` : ""}${
              facts.section179 > 0 ? ` and the K-1 (${fmt(facts.section179)} of section 179)` : ""
            }${
              facts.wages.employeeEntity > 0
                ? `, including ${fmt(facts.wages.employeeEntity)} of wages paid to the ${facts.wages.officer === 0 ? "spouse" : "taxpayer"}, which come back as W-2 income`
                : ""
            }${
              facts.payrollSchC && !facts.payrollSchC.asSalary
                ? `, including the owners' ${fmt(facts.payrollSchC.amount)} of pay, which comes back on a Schedule C for a payroll cleanup and pays its self-employment tax there`
                : ""
            }, before the owner's pay, the retirement plan and state taxes`,
            skip: facts.cogs + facts.writeOffs + facts.section179 <= 0,
          },
          // A partnership beside the corporation: its guaranteed payments.
          ...(m.kinds.partnership ? [guaranteedStep] : []),
          {
            key: "salary",
            label: "Owner salary through the S corporation",
            note: facts.payrollSchC?.asSalary
              ? `${fmt(facts.officerComp)} of officer pay, ${fmt(facts.payrollSchC.amount)} of it run through a Schedule C for a payroll cleanup (its self-employment tax paid there): the wages that unlock the QBI deduction`
              : `${fmt(facts.officerComp)} of officer pay${facts.healthInsurance > 0 ? ` (${fmt(facts.healthInsurance)} of it health insurance, deducted again on the 1040)` : ""}: the W-2 wages that unlock the QBI deduction${n(after.childCareCredit) > 0 ? " and the child-care credit" : ""}`,
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
      key: step.id ?? (step.key === "healthInsurance" && facts.partnerPremiums <= 0 ? "guaranteedPayments" : step.key),
      label: step.label,
      savings: previous - now,
      note: typeof step.note === "function" ? step.note(previous) : step.note,
    });
    previous = now;
  }
  // The recap's headline is before − after as READ; the engine's after
  // agrees within rounding. Whatever is left lands on the last step so the
  // split adds up to the number on the page. A line the engine proved
  // misread (`afterFixes`) is read as the builder writes it into the after
  // column, or its whole amount would land on the last step.
  const readAfterTotal = totalTaxesOf({ ...after, ...m.afterFixes }, entity, {
    states: (more.states ?? []).map((s) => s.numbers),
    entities: entity ? (more.entities ?? []).map((x) => x.numbers) : [],
    mainState: m.stateCode,
  });
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
  // plus the additional Medicare tax over the threshold — on top of what the
  // year has without the S corporation: another business's self-employment
  // earnings (a Schedule C or a partnership share beside it) and other
  // employers' wages use up the Social Security wage base and the threshold
  // first (engine v15; before, a Schedule C past the wage base had the K-1
  // charged Social Security a second time). The owner's own pay from the
  // corporation doesn't, on a W-2 or a payroll cleanup's Schedule C: as a
  // sole proprietor that pay would have been profit under SE tax too, so
  // this understates rather than overstates.
  let scorpSavings: RecapAnalysis["scorpSavings"] = null;
  if (m.shape === "scorp") {
    const k1 = n(after.scorpIncome);
    const se = m.card.federal.selfEmployment;
    const am = m.card.federal.additionalMedicare;
    const owner = facts.wages.officer;
    const cleanup = facts.payrollSchC ? Math.round(Math.max(0, facts.payrollSchC.amount) * se.netEarningsFactor) : 0;
    const otherSe = m.after.fed.seEarningsByPerson.map((v, k) => Math.max(0, v - (k === facts.schCOwner ? cleanup : 0)));
    // On a joint return whose W-2 lines weren't read, line 1z doesn't say
    // whose the other employer's wages are, and here it matters. The owner
    // with two W-2s over the wage base has Social Security withheld twice,
    // and the return claims the excess back (Schedule 3 line 11, inside
    // lines 31 and 32): the wages are the owner's only when it does. Short
    // of that they're the spouse's, the usual case (Client N: $178,897 that
    // as the owner's would have meant $2,653 back, against $177 on line 32).
    const outsideAll = facts.wages.outside[0] + facts.wages.outside[1];
    const joint = m.status === "mfj" || m.status === "qss";
    const guessed = joint && !facts.wages.read && outsideAll > 0;
    const ssRate = se.socialSecurityRate / 2;
    const excessIfOwner = Math.round(Math.max(0, facts.wages.officerBox1 + outsideAll - se.wageBase) * ssRate);
    const claimed = has(after.otherPayments) ? after.otherPayments : n(after.federalRefundableCredits);
    const ownerOutside = !guessed ? facts.wages.outside[owner] : excessIfOwner > 0 && claimed + TOL >= excessIfOwner ? outsideAll : 0;
    const usedBase = Math.min(se.wageBase, ownerOutside + otherSe[owner]);
    const floor = Math.max(0, am.threshold[m.status] - facts.wages.outside[0] - facts.wages.outside[1] - otherSe[0] - otherSe[1]);
    const earnings = Math.round(k1 * se.netEarningsFactor);
    const seTax =
      earnings >= 400
        ? Math.round(Math.min(earnings, se.wageBase - usedBase) * se.socialSecurityRate) + Math.round(earnings * se.medicareRate)
        : 0;
    const extra = Math.round(Math.max(0, earnings - floor) * am.rate);
    const from = [
      m.kinds.schC && !facts.payrollSchC ? "the Schedule C" : "",
      m.kinds.partnership ? "the partnership" : "",
    ].filter(Boolean).join(" and ");
    const used = [
      otherSe[owner] > 0 ? `${fmt(otherSe[owner])} of self-employment earnings from ${from || "another business"} beside it` : "",
      ownerOutside > 0 ? `${fmt(ownerOutside)} of W-2 wages from another employer` : "",
    ].filter(Boolean).join(" and ");
    const stacked =
      usedBase <= 0 || earnings < 400
        ? ""
        : usedBase >= se.wageBase
          ? `, on top of ${used}, which already reach the ${fmt(se.wageBase)} Social Security wage base, so only the Medicare part applies`
          : `, on top of ${used}, which use ${fmt(usedBase)} of the ${fmt(se.wageBase)} Social Security wage base`;
    scorpSavings = {
      amount: seTax + extra,
      note: `Estimated: the Schedule SE tax${extra > 0 ? " and additional Medicare tax" : ""} that ${fmt(k1)} of ordinary income would carry as self-employment earnings on a Schedule C${stacked}. As K-1 income from the S corporation it carries none`,
    };
    if (guessed && earnings >= 400) {
      notes.push(
        ownerOutside > 0
          ? `The S corporation line takes the ${fmt(outsideAll)} of W-2 wages from another employer as the owner's: with the owner's pay they cross the ${fmt(se.wageBase)} Social Security wage base, and the return claims the ${fmt(excessIfOwner)} of excess Social Security withheld that gives`
          : excessIfOwner > 0
            ? `The S corporation line takes the ${fmt(outsideAll)} of W-2 wages from another employer as the spouse's: as the owner's, with the owner's pay, they'd cross the ${fmt(se.wageBase)} Social Security wage base and the return would claim ${fmt(excessIfOwner)} of excess Social Security withheld, but it claims ${fmt(claimed)}`
            : `The S corporation line takes the ${fmt(outsideAll)} of W-2 wages from another employer as the spouse's (the W-2 lines weren't read and nothing on the return says otherwise); if they're the owner's, type the W-2 lines (taxpayer's and spouse's) in the after column and recompute — the line goes down`,
      );
    }
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
  const stateTax = (x: Outcome) => (x.st ? x.st.netTax : 0) + x.otherSt.reduce((t, o) => t + o.netTax, 0);
  const stateName = m.otherStates.length ? "State" : (m.card.state?.name ?? "State");
  const pieces = ({ with: w, without: wo }: (typeof sides)[number], worth: number) => {
    // The child credit with its refundable part (line 28), and the earned
    // income credit the children raise (line 27).
    const ctc = w.fed.childTaxCredit + w.fed.actc - (wo.fed.childTaxCredit + wo.fed.actc);
    const eic = w.fed.eic - wo.fed.eic;
    const care = w.fed.credits - wo.fed.credits;
    const stateDiff = stateTax(wo) - stateTax(w);
    const filing = worth - stateDiff - ctc - eic - care;
    const parts: string[] = [];
    if (ctc > 0) parts.push(`Child tax credit ${fmt(ctc)}`);
    if (eic > 0) parts.push(`Earned income credit ${fmt(eic)}`);
    if (care > 0) parts.push(`Child and dependent care credit ${fmt(care)}`);
    if (headOfHousehold && filing > 0) parts.push(`Head of household instead of single ${fmt(filing)}`);
    else if (filing > 0) parts.push(`Other federal ${fmt(filing)}`);
    if (stateDiff > 0) parts.push(`${stateName} tax ${fmt(stateDiff)}`);
    return parts.join(" · ");
  };
  // The before's share by the recap's own rows, so the before column can
  // carry it: federal (net of refundable credits) and state.
  const row = (x: Outcome) =>
    sideSummary(x.numbers, x.entityNumbers, { states: x.otherStateNumbers, entities: x.otherEntityNumbers, mainState: m.stateCode });
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
      // A business line the tables don't reproduce IS the finding, and the
      // line says by how much.
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
    // A household line carried across is a finding too (engine v11 on):
    // on a known pairing it means the card, not the return, is off.
    const carried = (r.derived.proof?.residuals ?? []).map((m) => ({ line: `${m.line} (after return)`, derived: m.computed, read: m.read }));
    const diffs = [
      ...carried,
      ...PROOF_LINES.flatMap((k) => {
        const derived = r.before[k];
        const read = p.before[k];
        if (n(derived) === n(read) || !off(n(derived), n(read))) return [];
        return [{ line: label(k), derived, read }];
      }),
    ];
    return diffs.length
      ? { id: p.id, clientName: p.clientName, outcome: "mismatch", diffs }
      : { id: p.id, clientName: p.clientName, outcome: "match" };
  });
}
