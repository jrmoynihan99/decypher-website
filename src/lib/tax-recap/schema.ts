/**
 * The Tax Recap's data contract — isomorphic on purpose.
 *
 * Both sides of the wire need the field list: the extraction prompt and the
 * Firestore sanitiser on the server, the review grid and the public recap page
 * in the browser. Nothing here may import Firebase or the Anthropic SDK.
 *
 * The field map itself (which form line feeds which recap number) is
 * documented in docs/TAX-RECAP-FIELD-MAP.md; `RETURN_FIELDS` is that table as
 * code. `source` is what the extraction prompt tells Claude to read and what
 * the review grid shows staff under each number, so the two can't drift.
 */

export type FieldGroup = "income" | "federal" | "credits" | "business" | "coverage" | "state";

/**
 * Lines most returns don't have (marketplace coverage, New Jersey's own
 * lines). They're read when present, hidden in the review grid when blank
 * on both sides, and the engine uses them only when the return has them.
 */
export type ReturnField = {
  key: string;
  label: string;
  source: string;
  group: FieldGroup;
  optional?: boolean;
};

export const RETURN_FIELDS = [
  { key: "w2Income", label: "W-2 wages", source: "Form 1040 line 1z", group: "income" },
  {
    key: "businessNetIncome",
    label: "Business net income",
    source: "Schedule 1 line 3 (= Schedule C line 31)",
    group: "income",
  },
  {
    key: "scorpIncome",
    label: "S corporation income (K-1)",
    source: "Schedule E page 2, the S corporation rows (= Schedule 1 line 5 when that is all of it)",
    group: "income",
    optional: true,
  },
  {
    key: "partnershipIncome",
    label: "Partnership income (K-1)",
    source: "Schedule E page 2, the partnership rows: nonpassive income from Schedule K-1 (Form 1065) — ordinary income plus guaranteed payments",
    group: "income",
    optional: true,
  },
  {
    key: "rentalIncome",
    label: "Rental real estate income or (loss)",
    source: "Schedule E line 26, as deducted after Form 8582",
    group: "income",
    optional: true,
  },
  {
    key: "rentalProfits",
    label: "Rental properties with a profit",
    source: "Schedule E line 21: the properties with a profit, added up",
    group: "income",
    optional: true,
  },
  {
    key: "rentalLosses",
    label: "Rental properties with a loss (this year)",
    source: "Schedule E line 21: the properties with a loss, added up, as a positive number — before any limitation",
    group: "income",
    optional: true,
  },
  {
    key: "passivePriorUnallowed",
    label: "Prior years' unallowed passive losses",
    source: "Form 8582 line 1c plus line 2c, as a positive number",
    group: "income",
    optional: true,
  },
  {
    key: "rentalReps",
    label: "Real estate professional rentals (Sch E line 43)",
    source: "Schedule E line 43: the net income or (loss) from the rentals a real estate professional materially participated in",
    group: "income",
    optional: true,
  },
  { key: "totalIncome", label: "Total income", source: "Form 1040 line 9", group: "income" },
  {
    key: "qualifiedDividends",
    label: "Qualified dividends",
    source: "Form 1040 line 3a",
    group: "income",
    optional: true,
  },
  {
    key: "capitalGain",
    label: "Capital gain or (loss)",
    source: "Form 1040 line 7",
    group: "income",
    optional: true,
  },
  {
    key: "capitalGainLongTerm",
    label: "Net long-term capital gain",
    source: "Schedule D line 15, when the return has a Schedule D (line 7 is taken whole as long-term without one)",
    group: "income",
    optional: true,
  },
  { key: "agi", label: "Adjusted gross income", source: "Form 1040 line 11a", group: "income" },
  {
    key: "dependentCount",
    label: "Dependents",
    source: "Form 1040 dependents listed (count)",
    group: "income",
    optional: true,
  },
  { key: "qbiDeduction", label: "QBI deduction", source: "Form 1040 line 13a", group: "federal" },
  {
    key: "qbiIncome",
    label: "Qualified business income (8995-A)",
    source: "Form 8995-A line 2, all businesses added up",
    group: "federal",
    optional: true,
  },
  {
    key: "qbiW2Wages",
    label: "W-2 wages for QBI (8995-A)",
    source: "Form 8995-A line 4, all businesses added up",
    group: "federal",
    optional: true,
  },
  {
    key: "qbiUbia",
    label: "Qualified property for QBI (8995-A)",
    source: "Form 8995-A line 7, all businesses added up",
    group: "federal",
    optional: true,
  },
  {
    key: "qbiLossCarryforward",
    label: "QBI loss carryforward (prior year)",
    source: "Form 8995 line 3, as a positive number",
    group: "federal",
    optional: true,
  },
  {
    key: "sepDeduction",
    label: "SEP, SIMPLE and qualified plans",
    source: "Schedule 1 line 16",
    group: "federal",
    optional: true,
  },
  {
    key: "itemizedDeductions",
    label: "Itemized deductions (Schedule A)",
    source: "Schedule A line 17, when the return has a Schedule A",
    group: "federal",
    optional: true,
  },
  {
    key: "saltPaid",
    label: "State and local taxes paid (Sch A)",
    source: "Schedule A line 5d, before the cap",
    group: "federal",
    optional: true,
  },
  {
    key: "saltDeducted",
    label: "State and local taxes deducted (Sch A)",
    source: "Schedule A line 5e, after the cap",
    group: "federal",
    optional: true,
  },
  {
    key: "medicalExpenses",
    label: "Medical and dental expenses (Sch A)",
    source: "Schedule A line 1, before the 7.5% floor",
    group: "federal",
    optional: true,
  },
  { key: "taxableIncome", label: "Taxable income", source: "Form 1040 line 15", group: "federal" },
  { key: "incomeTax", label: "Income tax", source: "Form 1040 line 16", group: "federal" },
  {
    key: "seTax",
    label: "Self-employment tax",
    source: "Schedule 2 line 4 (= Schedule SE line 12)",
    group: "federal",
  },
  {
    key: "otherTaxes",
    label: "Other taxes (line 23)",
    source: "Form 1040 line 23 (= Schedule 2 line 21): SE tax and the other Schedule 2 taxes",
    group: "federal",
    optional: true,
  },
  {
    key: "federalTotalTax",
    label: "Federal total tax",
    source: "Form 1040 line 24 (= Form 8879 line 2)",
    group: "federal",
  },
  {
    key: "federalPayments",
    label: "Federal payments + credits",
    source: "Form 1040 line 33 (includes line 32)",
    group: "federal",
  },
  {
    key: "federalWithholding",
    label: "Federal withholding",
    source: "Form 1040 line 25d",
    group: "federal",
    optional: true,
  },
  {
    key: "federalRefundableCredits",
    label: "Refundable credits + other payments (line 32)",
    source: "Form 1040 line 32 (net PTC, ACTC, EIC… plus line 31)",
    group: "federal",
  },
  {
    key: "otherPayments",
    label: "Other payments (line 31)",
    source: "Form 1040 line 31 (= Schedule 3 line 15): paid with an extension, excess Social Security withheld",
    group: "federal",
    optional: true,
  },
  { key: "federalRefund", label: "Federal refund", source: "Form 1040 line 35a", group: "federal" },
  {
    key: "federalAmountOwed",
    label: "Federal amount owed",
    source: "Form 1040 line 37",
    group: "federal",
  },
  {
    key: "federalPenalty",
    label: "Federal est. tax penalty",
    source: "Form 1040 line 38",
    group: "federal",
  },
  /* ── credits and other taxes ── */
  {
    key: "childTaxCredit",
    label: "Child tax credit",
    source: "Form 1040 line 19",
    group: "credits",
    optional: true,
  },
  {
    key: "childCareCredit",
    label: "Child and dependent care credit",
    source: "Schedule 3 line 2 (= Form 2441 line 11)",
    group: "credits",
    optional: true,
  },
  {
    key: "nonrefundableCredits",
    label: "Other nonrefundable credits (line 20)",
    source: "Form 1040 line 20 (= Schedule 3 line 8)",
    group: "credits",
    optional: true,
  },
  {
    key: "niit",
    label: "Net investment income tax",
    source: "Schedule 2 line 12 (= Form 8960 line 17)",
    group: "credits",
    optional: true,
  },
  { key: "grossReceipts", label: "Gross receipts", source: "Schedule C line 1", group: "business" },
  { key: "totalExpenses", label: "Total expenses", source: "Schedule C line 28", group: "business" },
  { key: "homeOffice", label: "Home office", source: "Schedule C line 30", group: "business" },
  {
    key: "cogs",
    label: "Cost of goods sold (Sch C)",
    source: "Schedule C line 4 (= line 42)",
    group: "business",
    optional: true,
  },
  {
    key: "schCWages",
    label: "Wages paid (Sch C)",
    source: "Schedule C line 26",
    group: "business",
    optional: true,
  },
  {
    key: "schCDepreciation",
    label: "Depreciation (Sch C)",
    source: "Schedule C line 13",
    group: "business",
    optional: true,
  },
  {
    key: "stateTotalTax",
    label: "State total tax",
    source: "State return total tax after credits (CA 540NR line 74)",
    group: "state",
  },
  {
    key: "statePayments",
    label: "State payments",
    source: "State withholding + payments (CA 540NR line 88)",
    group: "state",
  },
  {
    key: "stateWithholding",
    label: "State withholding",
    source: "State income tax withheld (CA 540 line 71, 540NR line 81)",
    group: "state",
    optional: true,
  },
  { key: "stateRefund", label: "State refund", source: "CA 540NR line 125", group: "state" },
  {
    key: "stateAmountOwed",
    label: "State amount owed",
    source: "Balance due before penalties (CA 540NR line 121)",
    group: "state",
  },
  {
    key: "statePenalty",
    label: "State penalties + interest",
    source: "CA 540NR lines 122 + 123",
    group: "state",
  },
  {
    key: "stateTotalDue",
    label: "State total due",
    source: "Total due incl. penalties (CA 540NR line 124)",
    group: "state",
  },
  {
    key: "stateSourceIncome",
    label: "State-source income",
    source: "Nonresident returns only: Schedule CA (540NR) line 10, column E",
    group: "state",
    optional: true,
  },
  {
    key: "stateAdjustments",
    label: "State adjustments to federal AGI",
    source: "Additions less subtractions: CA 540 line 16 − line 14 (Schedule CA line 27, column C − column B)",
    group: "state",
    optional: true,
  },
  {
    key: "stateDeduction",
    label: "State deduction taken",
    source: "The state's standard or itemized deduction as taken (CA 540 line 18 = Schedule CA (540) Part II line 30)",
    group: "state",
    optional: true,
  },
  /* ── marketplace coverage and self-employed health insurance ── */
  {
    key: "additionalTaxes",
    label: "Additional taxes (line 17)",
    source: "Form 1040 line 17 (= Schedule 2 line 3; excess advance PTC repayment)",
    group: "federal",
    optional: true,
  },
  {
    key: "sehiDeduction",
    label: "SE health insurance deduction",
    source: "Schedule 1 line 17",
    group: "coverage",
    optional: true,
  },
  {
    key: "sehiPaid",
    label: "Health insurance premiums paid",
    source: "Form 7206 line 1",
    group: "coverage",
    optional: true,
  },
  {
    key: "medicareWages",
    label: "Medicare wages from the S corporation",
    source: "Form 7206 line 11 (= W-2 box 5 from the S corporation)",
    group: "coverage",
    optional: true,
  },
  {
    key: "ptcFamilySize",
    label: "Tax family size",
    source: "Form 8962 line 1",
    group: "coverage",
    optional: true,
  },
  {
    key: "ptcPovertyLine",
    label: "Federal poverty line",
    source: "Form 8962 line 4",
    group: "coverage",
    optional: true,
  },
  {
    key: "ptcMonths",
    label: "Months of marketplace coverage",
    source: "Form 8962: months with an amount in lines 12–23 column (a), or 12 if line 11 is used",
    group: "coverage",
    optional: true,
  },
  {
    key: "ptcPremiums",
    label: "Enrollment premiums (year)",
    source: "Form 8962 line 11(a), or lines 12–23 column (a) added up",
    group: "coverage",
    optional: true,
  },
  {
    key: "ptcSlcsp",
    label: "SLCSP premiums (year)",
    source: "Form 8962 line 11(b), or lines 12–23 column (b) added up",
    group: "coverage",
    optional: true,
  },
  {
    key: "ptcAdvance",
    label: "Advance PTC received",
    source: "Form 8962 line 25",
    group: "coverage",
    optional: true,
  },
  {
    key: "ptcAllowed",
    label: "PTC allowed",
    source: "Form 8962 line 24",
    group: "coverage",
    optional: true,
  },
  {
    key: "ptcNet",
    label: "Net PTC (refundable)",
    source: "Form 8962 line 26 (= Schedule 3 line 9)",
    group: "coverage",
    optional: true,
  },
  {
    key: "ptcRepayment",
    label: "Excess advance PTC repaid",
    source: "Form 8962 line 29 (= Schedule 2 line 1a)",
    group: "coverage",
    optional: true,
  },
  /* ── state lines some states carry (New Jersey) ── */
  {
    key: "stateBusinessIncome",
    label: "State business income",
    source: "The state's own business profit line (NJ-1040 line 18)",
    group: "state",
    optional: true,
  },
  {
    key: "stateExemptions",
    label: "State exemption amount",
    source: "NJ-1040 line 13 (total exemption amount)",
    group: "state",
    optional: true,
  },
  {
    key: "stateMedical",
    label: "State medical deduction",
    source: "NJ-1040 line 31",
    group: "state",
    optional: true,
  },
  {
    key: "stateTaxOnIncome",
    label: "State tax on income",
    source: "The state's tax line before credits and add-ons (NJ-1040 line 43; CA 540 line 31)",
    group: "state",
    optional: true,
  },
  {
    key: "stateSharedResponsibility",
    label: "State shared responsibility payment",
    source: "NJ-1040 line 53c",
    group: "state",
    optional: true,
  },
  {
    key: "uninsuredMonths",
    label: "Months without health coverage",
    source: "Schedule NJ-HCC: months not checked; or 12 minus the months on Form 8962",
    group: "state",
    optional: true,
  },
  /* ── state lines an S corporation shareholder's return carries (California) ── */
  {
    key: "stateExemptionCredits",
    label: "State exemption credits after phase-out",
    source: "CA 540 line 32",
    group: "state",
    optional: true,
  },
  {
    key: "statePteCreditAvailable",
    label: "PTE elective tax credit available",
    source: "FTB 3804-CR Part II line 3",
    group: "state",
    optional: true,
  },
  {
    key: "statePteCredit",
    label: "PTE elective tax credit claimed",
    source: "Nonrefundable, inside the state's total tax: FTB 3804-CR Part II line 4 (= CA 540 line 43/44 code 242)",
    group: "state",
    optional: true,
  },
  {
    key: "statePteCreditRefundable",
    label: "PTE tax credit, refundable (payments section)",
    source: "A refundable pass-through entity tax credit claimed with the payments (NJ-1040 line 63)",
    group: "state",
    optional: true,
  },
] as const satisfies readonly ReturnField[];

export type ReturnFieldKey = (typeof RETURN_FIELDS)[number]["key"];

export const RETURN_FIELD_KEYS = RETURN_FIELDS.map((f) => f.key) as ReturnFieldKey[];

/** The numbers a recap is computed from — one set per return. */
export type ReturnNumbers = Record<ReturnFieldKey, number | null>;

/* ─────────────────────────── the S corporation's return ─────────────────────────── */

export type EntityFieldGroup = "income" | "deductions" | "shareholder" | "state";

export type EntityField = {
  key: string;
  label: string;
  source: string;
  group: EntityFieldGroup;
  optional?: boolean;
};

/**
 * The entity return — Form 1120-S or Form 1065 with the state's own return
 * for it — read when the client's business is an S corporation or a
 * partnership. The 1040 carries the K-1 income; this return carries what
 * the K-1 was computed from — the gross receipts and each deduction the
 * before print zeros — and the entity-level state tax the recap reports on
 * its own row. The same field list serves both forms; the 1065 lines are
 * named where they differ.
 */
export const ENTITY_FIELDS = [
  { key: "grossReceipts", label: "Gross receipts", source: "Form 1120-S line 1a / Form 1065 line 1a", group: "income" },
  { key: "cogs", label: "Cost of goods sold", source: "Form 1120-S line 2 / Form 1065 line 2", group: "income", optional: true },
  { key: "totalIncome", label: "Total income", source: "Form 1120-S line 6 / Form 1065 line 8", group: "income" },
  { key: "officerComp", label: "Compensation of officers", source: "Form 1120-S line 7", group: "deductions", optional: true },
  { key: "wages", label: "Salaries and wages", source: "Form 1120-S line 8 / Form 1065 line 9", group: "deductions", optional: true },
  { key: "guaranteedPayments", label: "Guaranteed payments to partners", source: "Form 1065 line 10 (partnerships only)", group: "deductions", optional: true },
  { key: "taxesLicenses", label: "Taxes and licenses", source: "Form 1120-S line 12 / Form 1065 line 14", group: "deductions", optional: true },
  { key: "pension", label: "Pension, profit-sharing plans", source: "Form 1120-S line 17 / Form 1065 line 18", group: "deductions", optional: true },
  { key: "employeeBenefits", label: "Employee benefit programs", source: "Form 1120-S line 18 / Form 1065 line 19", group: "deductions", optional: true },
  { key: "otherDeductions", label: "Other deductions", source: "Form 1120-S line 20 / Form 1065 line 21", group: "deductions", optional: true },
  { key: "totalDeductions", label: "Total deductions", source: "Form 1120-S line 21 / Form 1065 line 22", group: "deductions" },
  { key: "ordinaryIncome", label: "Ordinary business income", source: "Form 1120-S line 22 / Form 1065 line 23", group: "income" },
  { key: "k1Ordinary", label: "Owner's ordinary income (K-1)", source: "Schedule K-1 box 1 (1120-S or 1065) for the owner on this 1040", group: "shareholder" },
  { key: "k1Guaranteed", label: "Owner's guaranteed payments (K-1)", source: "Schedule K-1 (Form 1065) box 4c for that partner", group: "shareholder", optional: true },
  { key: "ownershipPct", label: "Owner's ownership %", source: "Schedule K-1 item G (1120-S) or item J, profit (1065)", group: "shareholder", optional: true },
  { key: "k1Ordinary2", label: "Spouse's ordinary income (K-1)", source: "Schedule K-1 box 1 for the spouse, when both spouses are partners on the same 1040", group: "shareholder", optional: true },
  { key: "k1Guaranteed2", label: "Spouse's guaranteed payments (K-1)", source: "Schedule K-1 (Form 1065) box 4c for the spouse", group: "shareholder", optional: true },
  { key: "ownershipPct2", label: "Spouse's ownership %", source: "Schedule K-1 item G (1120-S) or item J, profit (1065) for the spouse", group: "shareholder", optional: true },
  { key: "distributions", label: "Distributions", source: "Schedule K-1 box 16 code D (1120-S) / box 19 code A (1065), all owners on this 1040", group: "shareholder", optional: true },
  { key: "stateNetIncome", label: "State net income", source: "The state's S corporation net income for tax (CA 100S line 20)", group: "state", optional: true },
  { key: "stateGrossIncome", label: "State total income (LLC fee base)", source: "California Form 568 line 1 (total income from Schedule IW)", group: "state", optional: true },
  { key: "stateAddBack", label: "State taxes added back", source: "Taxes based on income deducted federally (CA 100S line 2)", group: "state", optional: true },
  { key: "stateTax", label: "State entity tax", source: "Tax before credits, at least the minimum (CA 100S line 21; Form 568 lines 2 + 3, the LLC fee and annual tax)", group: "state", optional: true },
  { key: "pteTax", label: "PTE elective tax", source: "CA 100S line 29 / Form 568 line 4, or Form 3804 line 3", group: "state", optional: true },
  { key: "stateTotalTax", label: "State total tax (entity)", source: "CA 100S line 30 / Form 568 line 7", group: "state", optional: true },
  { key: "statePayments", label: "State payments (entity)", source: "CA 100S line 36 / Form 568 line 12", group: "state", optional: true },
  { key: "stateAmountDue", label: "State amount due (entity)", source: "CA 100S line 45 / Form 568 line 21", group: "state", optional: true },
  { key: "stateRefund", label: "State refund (entity)", source: "CA 100S line 43 / Form 568 line 19", group: "state", optional: true },
] as const satisfies readonly EntityField[];

/** Which federal return the entity filed. */
export type EntityForm = "1120-S" | "1065";

export function parseEntityForm(v: unknown): EntityForm | null {
  if (typeof v !== "string") return null;
  const t = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t.includes("1120S")) return "1120-S";
  if (t.includes("1065")) return "1065";
  return null;
}

export type EntityFieldKey = (typeof ENTITY_FIELDS)[number]["key"];

export const ENTITY_FIELD_KEYS = ENTITY_FIELDS.map((f) => f.key) as EntityFieldKey[];

export type EntityNumbers = Record<EntityFieldKey, number | null>;

export type EntityExtract = {
  entityName: string | null;
  taxYear: number | null;
  /** "1120-S" or "1065" — which return the entity filed. */
  returnForm: EntityForm | null;
  stateCode: string | null;
  stateForm: string | null;
  notes: string | null;
  fields: Record<EntityFieldKey, ExtractedValue>;
};

/**
 * One extracted figure with its provenance. `page` is the 1-indexed PDF page
 * Claude read it from; `verified` records whether that number literally
 * appears in the pdfjs text of that page (null when no page text was
 * available to check against).
 */
export type ExtractedValue = {
  value: number | null;
  page: number | null;
  verified: boolean | null;
};

export type ReturnExtract = {
  taxpayerName: string | null;
  taxYear: number | null;
  filingStatus: string | null;
  /** Two-letter code of the state return, or null when there isn't one. */
  stateCode: string | null;
  /** e.g. "540NR" — the main state form the state figures came from. */
  stateForm: string | null;
  notes: string | null;
  fields: Record<ReturnFieldKey, ExtractedValue>;
};

/**
 * One thing the client does next. A step is a plain line, a link, or a line
 * with a couple of choices under it (the survey: one form for tax-only
 * clients, another for bookkeeping + tax).
 */
export type RecapNextStep = {
  label: string;
  href: string | null;
  options?: { label: string; href: string }[];
};

/**
 * Provenance of a before column that was computed rather than read: the
 * engine version (lib/tax-recap/derive.ts) and what it wants the reviewer to
 * know. Stored with the recap so the audit trail says where the numbers came
 * from when there is no before PDF.
 */
export type DerivedBefore = { version: string; notes: string[] };

/**
 * What the engine says about the saved numbers beyond the before column:
 * the savings split by strategy (a waterfall from the before to the after,
 * summing exactly to the headline) and, for an S corporation, the
 * self-employment tax the structure avoided, which sits outside the before/
 * after comparison the way the CPA's recaps show it.
 */
export type RecapAnalysis = {
  version: string;
  attribution: { label: string; savings: number; note: string }[];
  scorpSavings: { amount: number; note: string } | null;
  /**
   * What the dependents are worth on each side: the return re-run without
   * them (no child credits, single instead of head of household). Shown
   * beside the savings, never added to them — the kids are on both sides.
   */
  kids: { dependents: number; before: number; after: number; note: string } | null;
  notes: string[];
};

/** What staff submit to create or update a recap. */
export type RecapInput = {
  clientName: string;
  taxYear: number;
  priorYearIncome: number | null;
  stateCode: string | null;
  before: ReturnNumbers;
  after: ReturnNumbers;
  /** The S corporation's return on each side; null for a sole proprietor. */
  entityBefore: EntityNumbers | null;
  entityAfter: EntityNumbers | null;
  strategies: string[];
  nextSteps: RecapNextStep[];
  /** The raw extraction, kept as the audit trail for the numbers above. */
  extraction: {
    before: ReturnExtract | null;
    after: ReturnExtract | null;
    entity: EntityExtract | null;
  };
  /** Set when `before` was derived from the after return; `extraction.before` is then null. */
  derivedBefore: DerivedBefore | null;
  analysis: RecapAnalysis | null;
};

export type RecapDoc = RecapInput & {
  id: string;
  /** Unguessable URL segment for the client-facing page. */
  token: string;
  /** Switched on to kill the public link without losing the record. */
  revoked: boolean;
  createdAt: string | null;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string;
};

export const DEFAULT_STRATEGIES = [
  "Proactive bookkeeping to unlock more tax strategies (proactive vs reactive)",
  "S-corp election — no self-employment tax on distributions",
  "Retirement investing (Solo 401k / SEP IRA)",
  "Bonus: quarterly estimated tax payments",
];

export const ROAST_CALL_URL = "https://calendly.com/decypher-onboarding/decypher-roast";
export const SURVEY_TAX_ONLY_URL = "https://airtable.com/appMShCmmffsGuMbk/pagI4VCy5uheBp8l6/form";
export const SURVEY_BOOKKEEPING_TAX_URL = "https://airtable.com/appMShCmmffsGuMbk/pagobOu1R1lH1vmwx/form";

export const DEFAULT_NEXT_STEPS: RecapNextStep[] = [
  { label: "Sign the return", href: null },
  { label: "Book a roast call with OT", href: ROAST_CALL_URL },
  {
    label: "Fill out the survey before your call",
    href: null,
    options: [
      { label: "Tax only", href: SURVEY_TAX_ONLY_URL },
      { label: "Bookkeeping & Tax", href: SURVEY_BOOKKEEPING_TAX_URL },
    ],
  },
];

/**
 * ProSeries prints names in capitals ("PROSPER CHIU"). The recap addresses
 * the client by first name, so an all-caps name is title-cased; anything
 * with mixed case already is left exactly as typed.
 */
export function displayName(name: string): string {
  const t = name.trim();
  if (!t || t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/* ─────────────────────────────── sanitisers ─────────────────────────────── */

const MAX_MONEY = 1_000_000_000;

/**
 * Whole dollars, or null for anything that isn't a finite number. Null,
 * undefined and "" are null, not 0 — a blank line on a return is not a zero,
 * and the recap has to be able to tell the two apart.
 */
export function asMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/[^\d.-]/g, "")) : Number(v);
  if (!isFinite(n) || Math.abs(n) > MAX_MONEY) return null;
  return Math.round(n);
}

export function emptyNumbers(): ReturnNumbers {
  return Object.fromEntries(RETURN_FIELD_KEYS.map((k) => [k, null])) as ReturnNumbers;
}

export function sanitizeNumbers(raw: unknown): ReturnNumbers {
  const out = emptyNumbers();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const key of RETURN_FIELD_KEYS) {
    if (key in r) out[key] = asMoney(r[key]);
  }
  return out;
}

export function emptyEntityNumbers(): EntityNumbers {
  return Object.fromEntries(ENTITY_FIELD_KEYS.map((k) => [k, null])) as EntityNumbers;
}

/** Null when there's nothing there at all — a sole proprietor has no entity return. */
export function sanitizeEntityNumbers(raw: unknown): EntityNumbers | null {
  if (!raw || typeof raw !== "object") return null;
  const out = emptyEntityNumbers();
  const r = raw as Record<string, unknown>;
  let any = false;
  for (const key of ENTITY_FIELD_KEYS) {
    if (key in r) {
      out[key] = asMoney(r[key]);
      if (out[key] !== null) any = true;
    }
  }
  return any ? out : null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};

export function sanitizeExtract(raw: unknown): ReturnExtract | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // A field the model omitted (blank on the return) arrives as {} and lands
  // as value null — the same shape a stored document uses.
  const fields = sanitizeFieldValues(r.fields, RETURN_FIELD_KEYS);

  const year = Number(r.taxYear);
  const stateCode = text(r.stateCode, 2)?.toUpperCase() ?? null;
  return {
    taxpayerName: text(r.taxpayerName, 120),
    taxYear: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    filingStatus: text(r.filingStatus, 60),
    stateCode: stateCode && /^[A-Z]{2}$/.test(stateCode) ? stateCode : null,
    stateForm: text(r.stateForm, 40),
    notes: text(r.notes, 2000),
    fields,
  };
}

/** Flatten an extraction to the editable numbers the recap is computed from. */
export function numbersFromExtract(extract: ReturnExtract | null): ReturnNumbers {
  const out = emptyNumbers();
  if (!extract) return out;
  for (const key of RETURN_FIELD_KEYS) out[key] = extract.fields[key]?.value ?? null;
  return out;
}

function sanitizeFieldValues<K extends string>(rawFields: unknown, keys: K[]): Record<K, ExtractedValue> {
  const rf = (rawFields && typeof rawFields === "object" ? rawFields : {}) as Record<string, unknown>;
  return Object.fromEntries(
    keys.map((key) => {
      const f = (rf[key] && typeof rf[key] === "object" ? rf[key] : {}) as Record<string, unknown>;
      const page = Number(f.page);
      return [
        key,
        {
          value: asMoney(f.value),
          page: Number.isInteger(page) && page > 0 && page < 10_000 ? page : null,
          verified: typeof f.verified === "boolean" ? f.verified : null,
        } satisfies ExtractedValue,
      ];
    }),
  ) as Record<K, ExtractedValue>;
}

export function sanitizeEntityExtract(raw: unknown): EntityExtract | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const year = Number(r.taxYear);
  const stateCode = text(r.stateCode, 2)?.toUpperCase() ?? null;
  return {
    entityName: text(r.entityName, 120),
    taxYear: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    returnForm: parseEntityForm(r.returnForm),
    stateCode: stateCode && /^[A-Z]{2}$/.test(stateCode) ? stateCode : null,
    stateForm: text(r.stateForm, 40),
    notes: text(r.notes, 2000),
    fields: sanitizeFieldValues(r.fields, ENTITY_FIELD_KEYS),
  };
}

export function numbersFromEntityExtract(extract: EntityExtract | null): EntityNumbers {
  const out = emptyEntityNumbers();
  if (!extract) return out;
  for (const key of ENTITY_FIELD_KEYS) out[key] = extract.fields[key]?.value ?? null;
  return out;
}

export function sanitizeAnalysis(raw: unknown): RecapAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const version = text(r.version, 40);
  if (!version) return null;
  const attribution = (Array.isArray(r.attribution) ? r.attribution : [])
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const label = text(o.label, 120);
      const savings = asMoney(o.savings);
      if (!label || savings === null) return null;
      return { label, savings, note: text(o.note, 400) ?? "" };
    })
    .filter((s): s is { label: string; savings: number; note: string } => s !== null)
    .slice(0, 12);
  const sc = (r.scorpSavings && typeof r.scorpSavings === "object" ? r.scorpSavings : null) as Record<
    string,
    unknown
  > | null;
  const amount = sc ? asMoney(sc.amount) : null;
  const notes = Array.isArray(r.notes)
    ? r.notes.map((s) => (typeof s === "string" ? s.trim().slice(0, 400) : "")).filter(Boolean).slice(0, 12)
    : [];
  // Recaps saved before the kids figure existed have none.
  const k = (r.kids && typeof r.kids === "object" ? r.kids : null) as Record<string, unknown> | null;
  const kidsBefore = k ? asMoney(k.before) : null;
  const kidsAfter = k ? asMoney(k.after) : null;
  const kidsCount = k ? asMoney(k.dependents) : null;
  return {
    version,
    attribution,
    scorpSavings: sc && amount !== null ? { amount, note: text(sc.note, 400) ?? "" } : null,
    kids:
      k && kidsBefore !== null && kidsAfter !== null
        ? {
            dependents: Math.max(0, Math.min(20, Math.round(kidsCount ?? 0))),
            before: Math.max(0, kidsBefore),
            after: Math.max(0, kidsAfter),
            note: text(k.note, 400) ?? "",
          }
        : null,
    notes,
  };
}

function asHref(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const url = new URL(v.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function sanitizeStrategies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => (typeof s === "string" ? s.trim().slice(0, 240) : ""))
    .filter(Boolean)
    .slice(0, 12);
}

export function sanitizeNextSteps(raw: unknown): RecapNextStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const r = s as Record<string, unknown>;
      const label = text(r.label, 120);
      if (!label) return null;
      const options = Array.isArray(r.options)
        ? r.options
            .map((o) => {
              if (!o || typeof o !== "object") return null;
              const q = o as Record<string, unknown>;
              const oLabel = text(q.label, 60);
              const oHref = asHref(q.href);
              return oLabel && oHref ? { label: oLabel, href: oHref } : null;
            })
            .filter((o): o is { label: string; href: string } => o !== null)
            .slice(0, 4)
        : [];
      const step: RecapNextStep = { label, href: asHref(r.href) };
      if (options.length) step.options = options;
      return step;
    })
    .filter((s): s is RecapNextStep => s !== null)
    .slice(0, 8);
}

export function sanitizeDerivedBefore(raw: unknown): DerivedBefore | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const version = text(r.version, 40);
  if (!version) return null;
  const notes = Array.isArray(r.notes)
    ? r.notes
        .map((s) => (typeof s === "string" ? s.trim().slice(0, 400) : ""))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  return { version, notes };
}

export class RecapInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecapInputError";
  }
}

/**
 * Narrow an untrusted body into a full RecapInput. Throws RecapInputError on
 * the two things the recap can't render without: a client name and a year.
 */
export function sanitizeRecapInput(raw: unknown): RecapInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clientName = text(r.clientName, 80);
  if (!clientName) throw new RecapInputError("A client name is required");
  const taxYear = Number(r.taxYear);
  if (!Number.isInteger(taxYear) || taxYear < 2015 || taxYear > 2040) {
    throw new RecapInputError("Tax year must be a four-digit year");
  }
  const extraction = (r.extraction && typeof r.extraction === "object" ? r.extraction : {}) as Record<
    string,
    unknown
  >;
  const stateCode = text(r.stateCode, 2)?.toUpperCase() ?? null;
  return {
    clientName,
    taxYear,
    priorYearIncome: asMoney(r.priorYearIncome),
    stateCode: stateCode && /^[A-Z]{2}$/.test(stateCode) ? stateCode : null,
    before: sanitizeNumbers(r.before),
    after: sanitizeNumbers(r.after),
    entityBefore: sanitizeEntityNumbers(r.entityBefore),
    entityAfter: sanitizeEntityNumbers(r.entityAfter),
    strategies: sanitizeStrategies(r.strategies),
    nextSteps: sanitizeNextSteps(r.nextSteps),
    extraction: {
      before: sanitizeExtract(extraction.before),
      after: sanitizeExtract(extraction.after),
      entity: sanitizeEntityExtract(extraction.entity),
    },
    derivedBefore: sanitizeDerivedBefore(r.derivedBefore),
    analysis: sanitizeAnalysis(r.analysis),
  };
}
