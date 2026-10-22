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

// Relative, not "@/": `npm run recap:check` loads this file under plain node
// (scripts/lib/resolve-ts.mjs), which doesn't know the alias.
import { feedbackHref } from "../feedback/links";
import { PRODUCTION_ORIGIN } from "../site-url";

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

/**
 * Schedule C Part II, line by line: what the DeCyphered video's top
 * write-offs are built from (lib/decyphered/fromRecap.ts). Read when
 * printed, hidden in the grid when blank, zeroed on the before with the
 * other expenses; none of the engine's identities use them.
 */
export const SCH_C_LINE_FIELDS = [
  { key: "schCAdvertising", label: "Advertising (Sch C)", source: "Schedule C line 8", group: "business", optional: true },
  { key: "schCCarTruck", label: "Car and truck (Sch C)", source: "Schedule C line 9", group: "business", optional: true },
  { key: "schCCommissions", label: "Commissions and fees (Sch C)", source: "Schedule C line 10", group: "business", optional: true },
  { key: "schCContractLabor", label: "Contract labor (Sch C)", source: "Schedule C line 11", group: "business", optional: true },
  { key: "schCEmployeeBenefits", label: "Employee benefits (Sch C)", source: "Schedule C line 14", group: "business", optional: true },
  { key: "schCInsurance", label: "Insurance (Sch C)", source: "Schedule C line 15", group: "business", optional: true },
  { key: "schCInterest", label: "Interest (Sch C)", source: "Schedule C lines 16a + 16b", group: "business", optional: true },
  { key: "schCLegalProfessional", label: "Legal and professional (Sch C)", source: "Schedule C line 17", group: "business", optional: true },
  { key: "schCOfficeExpense", label: "Office expense (Sch C)", source: "Schedule C line 18", group: "business", optional: true },
  { key: "schCPension", label: "Pension and profit-sharing (Sch C)", source: "Schedule C line 19", group: "business", optional: true },
  { key: "schCRent", label: "Rent or lease (Sch C)", source: "Schedule C lines 20a + 20b", group: "business", optional: true },
  { key: "schCRepairs", label: "Repairs and maintenance (Sch C)", source: "Schedule C line 21", group: "business", optional: true },
  { key: "schCSupplies", label: "Supplies (Sch C)", source: "Schedule C line 22", group: "business", optional: true },
  { key: "schCTaxesLicenses", label: "Taxes and licenses (Sch C)", source: "Schedule C line 23", group: "business", optional: true },
  { key: "schCTravel", label: "Travel (Sch C)", source: "Schedule C line 24a", group: "business", optional: true },
  { key: "schCMeals", label: "Meals (Sch C)", source: "Schedule C line 24b", group: "business", optional: true },
  { key: "schCUtilities", label: "Utilities (Sch C)", source: "Schedule C line 25", group: "business", optional: true },
  { key: "schCOtherExpenses", label: "Other expenses (Sch C)", source: "Schedule C line 27a", group: "business", optional: true },
] as const satisfies readonly ReturnField[];

export const SCH_C_LINE_KEYS = SCH_C_LINE_FIELDS.map((f) => f.key);

export const RETURN_FIELDS = [
  { key: "w2Income", label: "W-2 wages", source: "Form 1040 line 1z", group: "income" },
  /* ── whose W-2s, and who paid them: what the before does with wages depends on it ── */
  {
    key: "w2Taxpayer",
    label: "W-2 wages, taxpayer",
    source: "Box 1 of every W-2 for the first person named on the 1040, added up (W-2 copies in the print, or a state wage schedule such as Massachusetts Schedule INC)",
    group: "income",
    optional: true,
  },
  {
    key: "w2Spouse",
    label: "W-2 wages, spouse",
    source: "Box 1 of every W-2 for the spouse, added up",
    group: "income",
    optional: true,
  },
  {
    key: "w2TaxpayerEntity",
    label: "W-2 wages from the business, taxpayer",
    source: "The part of the taxpayer's W-2 wages paid by the client's own S corporation or partnership (the business on Schedule E page 2) — the officer's pay, or a salary inside the entity's line 8",
    group: "income",
    optional: true,
  },
  {
    key: "w2SpouseEntity",
    label: "W-2 wages from the business, spouse",
    source: "The part of the spouse's W-2 wages paid by the client's own S corporation or partnership — a spouse on the business's payroll",
    group: "income",
    optional: true,
  },
  {
    key: "dependentOfAnother",
    label: "Claimed as someone's dependent",
    source: "Form 1040 line 12a, 'Someone can claim: You as a dependent' — 1 when checked; the standard deduction is then limited to earned income plus a small amount",
    group: "income",
    optional: true,
  },
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
    key: "rentalRents",
    label: "Rents received (Sch E line 23a)",
    source: "Schedule E line 23a: every rental property's rents (line 3) added up — the before's rental income, with the expenses zeroed",
    group: "income",
    optional: true,
  },
  {
    key: "rentalExpenses",
    label: "Rental expenses (Sch E line 23e)",
    source: "Schedule E line 23e: every rental property's total expenses (line 20), depreciation included — zeroed on the before",
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
  {
    key: "qualifyingChildren",
    label: "Children for the child tax credit",
    source: "Schedule 8812 line 4: qualifying children under 17 with a Social Security number",
    group: "income",
    optional: true,
  },
  {
    key: "otherDependents",
    label: "Other dependents (credit for other dependents)",
    source: "Schedule 8812 line 6: dependents 17 and over, or without the required Social Security number",
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
    key: "iraDeduction",
    label: "IRA deduction",
    source: "Schedule 1 line 20 — off on the before, like the SEP: a contribution DeCypher set up",
    group: "federal",
    optional: true,
  },
  {
    key: "hsaDeduction",
    label: "HSA deduction",
    source: "Schedule 1 line 13 (Form 8889) — off on the before, like the SEP",
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
    key: "seSsWages",
    label: "Social Security wages on Schedule SE",
    source: "Schedule SE line 8a (W-2 boxes 3 and 7) — what uses up the Schedule C's wage base, which can differ from box 1",
    group: "federal",
    optional: true,
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
  ...SCH_C_LINE_FIELDS,
  {
    key: "stateTotalTax",
    label: "State total tax",
    source: "State return total tax after credits (CA 540NR line 74; NY IT-201 line 61, state and city taxes together)",
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
    source: "Nonresident returns only: Schedule CA (540NR) line 10, column E; Maryland Form 505NR line 8 (Maryland income)",
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
  {
    key: "stateSourceBusinessIncome",
    label: "State-source business income",
    source: "Part-year and nonresident returns only: the business income inside the state-source income — the state column's Schedule C line plus its S corporation and partnership income",
    group: "state",
    optional: true,
  },
  {
    key: "stateOtherStateCredit",
    label: "Credit for tax paid to other states",
    source: "A resident return's credit for income tax paid to another state (CA Schedule S, NY Form IT-112-R, VA Schedule OSC, PA Schedule G-L), as claimed",
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
    source: "NJ-1040 line 13 (total exemption amount); Massachusetts Form 1 line 2g",
    group: "state",
    optional: true,
  },
  {
    key: "stateWageDeduction",
    label: "State deduction for Social Security / Medicare paid",
    source: "Massachusetts Form 1 lines 11a + 11b (FICA, railroad or government retirement contributions, up to $2,000 per person)",
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
    source: "The state's tax line before credits and add-ons (NJ-1040 line 43; CA 540 line 31; NY IT-201 line 39)",
    group: "state",
    optional: true,
  },
  {
    key: "stateLocalTax",
    label: "City resident tax (on the state return)",
    source: "A city income tax the state return carries for a city resident: New York IT-201 line 54 (NYC resident tax after NYC credits). Omit for a non-resident of the city and for other states",
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

/* ─────────────────────────── a second state return ─────────────────────────── */

/**
 * The lines read from each state return beyond the main one: a part-year
 * return in the state the client moved from, a nonresident return where
 * income was earned. The main state's lines stay on the 1040's own record
 * (`stateTotalTax` and the rest); each other state gets these, under the
 * same keys, and its own before. The recap shows every state's taxes on
 * its own row, so no state's savings are left out.
 */
export const OTHER_STATE_FIELD_KEYS = [
  "stateTotalTax",
  "stateTaxOnIncome",
  "stateSourceIncome",
  "stateSourceBusinessIncome",
  "stateAdjustments",
  "stateDeduction",
  "stateExemptions",
  "stateExemptionCredits",
  "stateLocalTax",
  "stateOtherStateCredit",
  "statePayments",
  "stateWithholding",
  "stateRefund",
  "stateAmountOwed",
  "statePenalty",
  "stateTotalDue",
] as const satisfies readonly ReturnFieldKey[];

export type OtherStateFieldKey = (typeof OTHER_STATE_FIELD_KEYS)[number];

export type StateNumbers = Record<OtherStateFieldKey, number | null>;

/**
 * States whose resident return claims the credit for tax paid to another
 * state with the payments, after the total tax line — Virginia's 760
 * (line 24, Schedule OSC) and Pennsylvania's PA-40 (line 22) — rather
 * than inside the tax. The recap nets it out of the tax and the payments
 * both, the way it does a refundable credit.
 */
export const OTHER_STATE_CREDIT_WITH_PAYMENTS: ReadonlySet<string> = new Set(["VA", "PA"]);

/** One more state return as read: which state, which form, its lines with their pages. */
export type OtherStateExtract = {
  stateCode: string;
  stateForm: string | null;
  fields: Record<OtherStateFieldKey, ExtractedValue>;
};

/** One more state return on the recap: its lines on each side. */
export type RecapOtherState = {
  stateCode: string;
  stateForm: string | null;
  before: StateNumbers;
  after: StateNumbers;
};

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
  { key: "otherIncome", label: "Other income (sale gains, other)", source: "Form 1120-S lines 4 + 5 (net gain from Form 4797, other income) / Form 1065 lines 4–7 — kept as it is on the before", group: "income", optional: true },
  { key: "totalIncome", label: "Total income", source: "Form 1120-S line 6 / Form 1065 line 8", group: "income" },
  { key: "officerComp", label: "Compensation of officers", source: "Form 1120-S line 7", group: "deductions", optional: true },
  { key: "wages", label: "Salaries and wages", source: "Form 1120-S line 8 / Form 1065 line 9", group: "deductions", optional: true },
  { key: "guaranteedPayments", label: "Guaranteed payments to partners", source: "Form 1065 line 10 (partnerships only)", group: "deductions", optional: true },
  /* ── the entity's other expense lines: the DeCyphered video's top write-offs, zeroed on the before ── */
  { key: "repairs", label: "Repairs and maintenance", source: "Form 1120-S line 9 / Form 1065 line 11", group: "deductions", optional: true },
  { key: "rents", label: "Rents", source: "Form 1120-S line 11 / Form 1065 line 13", group: "deductions", optional: true },
  { key: "taxesLicenses", label: "Taxes and licenses", source: "Form 1120-S line 12 / Form 1065 line 14", group: "deductions", optional: true },
  { key: "interest", label: "Interest", source: "Form 1120-S line 13 / Form 1065 line 15", group: "deductions", optional: true },
  { key: "depreciation", label: "Depreciation", source: "Form 1120-S line 14 / Form 1065 line 16c", group: "deductions", optional: true },
  { key: "advertising", label: "Advertising", source: "Form 1120-S line 16 (a partnership's sits in its other deductions)", group: "deductions", optional: true },
  { key: "pension", label: "Pension, profit-sharing plans", source: "Form 1120-S line 17 / Form 1065 line 18", group: "deductions", optional: true },
  { key: "employeeBenefits", label: "Employee benefit programs", source: "Form 1120-S line 18 / Form 1065 line 19", group: "deductions", optional: true },
  { key: "otherDeductions", label: "Other deductions", source: "Form 1120-S line 20 / Form 1065 line 21", group: "deductions", optional: true },
  { key: "totalDeductions", label: "Total deductions", source: "Form 1120-S line 21 / Form 1065 line 22", group: "deductions" },
  { key: "ordinaryIncome", label: "Ordinary business income", source: "Form 1120-S line 22 / Form 1065 line 23", group: "income" },
  { key: "k1Ordinary", label: "Owner's ordinary income (K-1)", source: "Schedule K-1 box 1 (1120-S or 1065) for the owner on this 1040", group: "shareholder" },
  { key: "k1Section179", label: "Owner's section 179 deduction (K-1)", source: "Schedule K-1 box 11 (1120-S) or box 12 (1065), as a positive number — Schedule E nets it off the ordinary income (column (j)); zeroed on the before with the other write-offs", group: "shareholder", optional: true },
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
  /* ── a city's own return for the corporation (New York City Form NYC-3L), dropped as a third file ── */
  { key: "cityNetIncome", label: "City allocated net income", source: "NYC-3L Schedule A line 1 (net income allocated to New York City, from Schedule B line 26)", group: "state", optional: true },
  { key: "cityAllocationPct", label: "City business allocation %", source: "NYC-3L Schedule H line 7, as a plain number with its decimals (54.21 for 54.21%)", group: "state", optional: true },
  { key: "cityReceipts", label: "City receipts (minimum tax base)", source: "NYC-3L Schedule A line 4, the New York City gross receipts the fixed-dollar minimum is set by", group: "state", optional: true },
  { key: "cityTax", label: "City corporation tax", source: "NYC-3L Schedule A line 11 (net tax after credits; line 6 is the tax before them)", group: "state", optional: true },
  { key: "cityPayments", label: "City payments (entity)", source: "NYC-3L Schedule A line 14 (prepayments)", group: "state", optional: true },
  { key: "cityAmountDue", label: "City amount due (entity)", source: "NYC-3L Schedule A line 21 (total remittance due)", group: "state", optional: true },
] as const satisfies readonly EntityField[];

/** Entity lines read from a city's own return rather than the 1120-S: what the city reader is asked for. */
export const CITY_FIELD_KEYS = ["cityNetIncome", "cityAllocationPct", "cityReceipts", "cityTax", "cityPayments", "cityAmountDue"] as const satisfies readonly EntityFieldKey[];

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
 * A second (third…) entity return on the same 1040: another S corporation
 * or partnership the client owns a share of. The first entity stays in
 * `entityBefore` / `entityAfter`; each further one carries its own form,
 * state and both sides here, so every business keeps its own before.
 */
export type RecapOtherEntity = {
  form: EntityForm | null;
  name: string | null;
  /** The state its own return was filed in. */
  stateCode: string | null;
  before: EntityNumbers | null;
  after: EntityNumbers | null;
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
  /** Every other state return in the print, each with its own lines (engine v13 reader on). */
  otherStates?: OtherStateExtract[];
};

/**
 * One thing the client does next. A step is a plain line, a link, or a line
 * with a couple of choices under it (the survey: one for tax-only clients,
 * another for bookkeeping + tax). Survey links, in-house or the legacy
 * Airtable forms, are personalised at render time — see recapSurveyHref.
 */
export type RecapNextStep = {
  label: string;
  href: string | null;
  options?: { label: string; href: string }[];
};

/** One line of the after return the engine's tables didn't reproduce: as printed vs as figured. */
export type ProofLine = { line: string; read: number; computed: number };

/**
 * How the after return was reproduced before the before was derived.
 * Verified: every line the engine checks came out as printed. Projected
 * (engine v11 on): `residuals` are the household lines that didn't, each
 * carried across both sides as a fixed amount — the savings still come from
 * the business's own lines. Absent on recaps saved by earlier engines,
 * which refused rather than carry.
 */
export type Proof = { verified: boolean; residuals: ProofLine[] };

/**
 * Provenance of a before column that was computed rather than read: the
 * engine version (lib/tax-recap/derive.ts), what it wants the reviewer to
 * know, and how well the after return reproduced. Stored with the recap so
 * the audit trail says where the numbers came from when there is no before
 * PDF.
 */
export type DerivedBefore = { version: string; notes: string[]; proof?: Proof };

/**
 * What the engine says about the saved numbers beyond the before column:
 * the savings split by strategy (a waterfall from the before to the after,
 * summing exactly to the headline) and, for an S corporation, the
 * self-employment tax the structure avoided, which sits outside the before/
 * after comparison the way the CPA's recaps show it.
 */
export type RecapAnalysis = {
  version: string;
  /**
   * `key` names the step for code that reads the split (the DeCyphered
   * video maps it to a strategy kind): the Scenario switch, "kids", or
   * "guaranteedPayments". Recaps saved before keys existed have none.
   */
  attribution: { key?: string; label: string; savings: number; note: string }[];
  scorpSavings: { amount: number; note: string } | null;
  /**
   * What the dependents are worth on each side: the return re-run without
   * them (no child credits, single instead of head of household).
   *
   * `inBefore` (engine v8 on): the recap's before doesn't claim them. The
   * before side's worth, split by the recap's rows, is added to the before
   * column (`computeRecap`) and is the first step of `attribution`, so the
   * split still adds up to before − after. Null on recaps saved earlier,
   * whose before claims the kids and shows them beside the savings — and
   * when they're worth nothing at the before's income.
   */
  kids: {
    dependents: number;
    before: number;
    after: number;
    note: string;
    inBefore: { federal: number; state: number; note: string } | null;
  } | null;
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
  /** Entity returns beyond the first, each with its own before. Absent on recaps saved before there could be several. */
  otherEntities?: RecapOtherEntity[];
  /** State returns beyond the main one (`stateCode`), each with its own before. Absent on recaps saved before. */
  otherStates?: RecapOtherState[];
  strategies: string[];
  nextSteps: RecapNextStep[];
  /** The raw extraction, kept as the audit trail for the numbers above. */
  extraction: {
    before: ReturnExtract | null;
    after: ReturnExtract | null;
    entity: EntityExtract | null;
    /** A city's own return for the corporation (NYC-3L), read as a third file; its lines are merged into `entityAfter`. */
    city?: EntityExtract | null;
    /** The reads of the entity returns beyond the first, in `otherEntities` order. */
    otherEntities?: EntityExtract[];
  };
  /** Set when `before` was derived from the after return; `extraction.before` is then null. */
  derivedBefore: DerivedBefore | null;
  analysis: RecapAnalysis | null;
};

/** The two cuts of the DeCyphered video: with dollar amounts, and percentages only. */
export const VIDEO_VARIANTS = ["dollars", "percent"] as const;
export type VideoVariant = (typeof VIDEO_VARIANTS)[number];

/**
 * The client's DeCyphered video, rendered in the builder when the recap is
 * saved (lib/decyphered) and stored privately in Cloud Storage. `hash` is
 * of the figures it was made from: when the recap's numbers change and the
 * video wasn't re-rendered, the hashes differ and the page doesn't offer it.
 */
export type RecapVideo = {
  hash: string;
  variants: VideoVariant[];
  renderedAt: string;
};

export function sanitizeVideo(raw: unknown): RecapVideo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const hash = text(r.hash, 64);
  const variants = (Array.isArray(r.variants) ? r.variants : []).filter((v): v is VideoVariant =>
    (VIDEO_VARIANTS as readonly unknown[]).includes(v),
  );
  if (!hash || !variants.length) return null;
  return { hash, variants, renderedAt: text(r.renderedAt, 40) ?? "" };
}

export type RecapDoc = RecapInput & {
  id: string;
  /** Set by the builder once the video is uploaded; never part of a save. */
  video: RecapVideo | null;
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
/**
 * The in-house feedback survey (lib/feedback/links). Stored bare: the recap
 * page and PDF fill in the client's name, tax year and recap id when they
 * render it (recapSurveyHref), so a renamed client or a re-saved year never
 * leaves a stale name baked into the link. The host only has to be absolute
 * for sanitizeNextSteps — the rewrite matches on the path, and the page
 * links relative to wherever it's served.
 */
export const SURVEY_TAX_ONLY_URL = feedbackHref({ kind: "tax", origin: PRODUCTION_ORIGIN });
export const SURVEY_BOOKKEEPING_TAX_URL = feedbackHref({ kind: "both", origin: PRODUCTION_ORIGIN });

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
 * ProSeries prints names in capitals ("CLIENT B"). The recap addresses
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

/**
 * The few entity lines that are percentages, not dollars: an ownership
 * share, a city's business allocation. Kept to two decimals — rounding
 * 54.21% to 54% would move the city's allocated income by thousands.
 */
const PERCENT_KEYS = new Set<string>(["ownershipPct", "ownershipPct2", "cityAllocationPct"]);
export function asPercent(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/[^\d.-]/g, "")) : Number(v);
  if (!isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}
/** Dollars, or a percentage for the keys that are one. */
const asLine = (key: string, v: unknown): number | null => (PERCENT_KEYS.has(key) ? asPercent(v) : asMoney(v));

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
      out[key] = asLine(key, r[key]);
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
  const stateCode = asStateCode(r.stateCode);
  const otherStates = (Array.isArray(r.otherStates) ? r.otherStates : [])
    .map((s): OtherStateExtract | null => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const code = asStateCode(o.stateCode);
      // The main state again, or a state with nothing read, isn't another return.
      if (!code || code === stateCode) return null;
      const stateFields = sanitizeFieldValues(o.fields, [...OTHER_STATE_FIELD_KEYS]);
      if (!OTHER_STATE_FIELD_KEYS.some((k) => stateFields[k].value !== null)) return null;
      return { stateCode: code, stateForm: text(o.stateForm, 40), fields: stateFields };
    })
    .filter((s): s is OtherStateExtract => s !== null)
    .filter((s, i, all) => all.findIndex((t) => t.stateCode === s.stateCode) === i)
    .slice(0, MAX_OTHER_STATES);
  return {
    taxpayerName: text(r.taxpayerName, 120),
    taxYear: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    filingStatus: text(r.filingStatus, 60),
    stateCode,
    stateForm: text(r.stateForm, 40),
    notes: text(r.notes, 2000),
    fields,
    ...(otherStates.length ? { otherStates } : {}),
  };
}

/** How many state returns beyond the main one a recap carries. */
export const MAX_OTHER_STATES = 4;
/** How many entity returns beyond the first a recap carries. */
export const MAX_OTHER_ENTITIES = 5;

const asStateCode = (v: unknown): string | null => {
  const code = text(v, 2)?.toUpperCase() ?? null;
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
};

export function emptyStateNumbers(): StateNumbers {
  return Object.fromEntries(OTHER_STATE_FIELD_KEYS.map((k) => [k, null])) as StateNumbers;
}

export function sanitizeStateNumbers(raw: unknown): StateNumbers {
  const out = emptyStateNumbers();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const key of OTHER_STATE_FIELD_KEYS) {
    if (key in r) out[key] = asMoney(r[key]);
  }
  return out;
}

/** An other state's lines as read, flattened to the editable numbers. */
export function stateNumbersFromExtract(extract: OtherStateExtract): StateNumbers {
  const out = emptyStateNumbers();
  for (const key of OTHER_STATE_FIELD_KEYS) out[key] = extract.fields[key]?.value ?? null;
  return out;
}

export function sanitizeOtherStates(raw: unknown): RecapOtherState[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s): RecapOtherState | null => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const code = asStateCode(o.stateCode);
      if (!code) return null;
      return { stateCode: code, stateForm: text(o.stateForm, 40), before: sanitizeStateNumbers(o.before), after: sanitizeStateNumbers(o.after) };
    })
    .filter((s): s is RecapOtherState => s !== null)
    .slice(0, MAX_OTHER_STATES);
}

export function sanitizeOtherEntities(raw: unknown): RecapOtherEntity[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s): RecapOtherEntity | null => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const before = sanitizeEntityNumbers(o.before);
      const after = sanitizeEntityNumbers(o.after);
      if (!before && !after) return null;
      return { form: parseEntityForm(o.form), name: text(o.name, 120), stateCode: asStateCode(o.stateCode), before, after };
    })
    .filter((s): s is RecapOtherEntity => s !== null)
    .slice(0, MAX_OTHER_ENTITIES);
}

export function sanitizeEntityExtracts(raw: unknown): EntityExtract[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => sanitizeEntityExtract(e))
    .filter((e): e is EntityExtract => e !== null)
    .slice(0, MAX_OTHER_ENTITIES);
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
          value: asLine(key, f.value),
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
      const key = text(o.key, 40);
      return { ...(key ? { key } : {}), label, savings, note: text(o.note, 400) ?? "" };
    })
    .filter((s): s is RecapAnalysis["attribution"][number] => s !== null)
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
  const ib = (k?.inBefore && typeof k.inBefore === "object" ? k.inBefore : null) as Record<string, unknown> | null;
  const ibFederal = ib ? asMoney(ib.federal) : null;
  const ibState = ib ? asMoney(ib.state) : null;
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
            inBefore:
              ib && ibFederal !== null && ibState !== null
                ? { federal: ibFederal, state: ibState, note: text(ib.note, 400) ?? "" }
                : null,
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
  // The v11 engine's notes run longer (one per line carried), so the caps
  // are roomier than the analysis notes'.
  const notes = Array.isArray(r.notes)
    ? r.notes
        .map((s) => (typeof s === "string" ? s.trim().slice(0, 700) : ""))
        .filter(Boolean)
        .slice(0, 30)
    : [];
  const p = (r.proof && typeof r.proof === "object" ? r.proof : null) as Record<string, unknown> | null;
  const proof: Proof | undefined = p
    ? {
        verified: p.verified === true,
        residuals: (Array.isArray(p.residuals) ? p.residuals : [])
          .map((m) => {
            const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
            const line = text(o.line, 160);
            const read = asMoney(o.read);
            const computed = asMoney(o.computed);
            return line && read !== null && computed !== null ? { line, read, computed } : null;
          })
          .filter((m): m is ProofLine => m !== null)
          .slice(0, 30),
      }
    : undefined;
  return proof ? { version, notes, proof } : { version, notes };
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
    otherEntities: sanitizeOtherEntities(r.otherEntities),
    otherStates: sanitizeOtherStates(r.otherStates),
    strategies: sanitizeStrategies(r.strategies),
    nextSteps: sanitizeNextSteps(r.nextSteps),
    extraction: {
      before: sanitizeExtract(extraction.before),
      after: sanitizeExtract(extraction.after),
      entity: sanitizeEntityExtract(extraction.entity),
      city: sanitizeEntityExtract(extraction.city),
      otherEntities: sanitizeEntityExtracts(extraction.otherEntities),
    },
    derivedBefore: sanitizeDerivedBefore(r.derivedBefore),
    analysis: sanitizeAnalysis(r.analysis),
  };
}
