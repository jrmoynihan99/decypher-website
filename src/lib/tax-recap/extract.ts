import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ENTITY_FIELDS,
  ENTITY_FIELD_KEYS,
  RETURN_FIELDS,
  RETURN_FIELD_KEYS,
  sanitizeEntityExtract,
  sanitizeExtract,
  type EntityExtract,
  type ReturnExtract,
} from "./schema";
import {
  remapEntityPages,
  remapPages,
  unbundleStatePenalty,
  verifyAgainstText,
  verifyEntityAgainstText,
} from "./verify";

/**
 * Read one ProSeries return PDF into the numbers the recap needs.
 *
 * The PDF goes to Claude as a document block — the rendered pages, not the
 * text layer. That's deliberate: ProSeries prints carry a broken text layer
 * on some forms (Schedule SE's labels come out as mojibake, and on some
 * prints there are no labels in the text at all), so anything that parses
 * text alone can't tell which number is which. The rendered page is
 * unambiguous.
 *
 * The text layer still earns its keep afterwards, as the check: the browser
 * pulls per-page text with pdfjs and sends it along, and every extracted
 * number is looked for on the page Claude cited. A number that isn't there
 * is flagged for the reviewer rather than silently trusted. Nothing here
 * does arithmetic — that's compute.ts, in code.
 *
 * Two readers share the machinery: the client's 1040 (with its state
 * return) and, when the business is an S corporation or a partnership, the
 * entity's 1120-S or 1065 (with its state return). Each has its own field
 * list in schema.ts and its own instructions below.
 *
 * Output is constrained with a JSON schema (structured outputs), so the
 * response always parses; the sanitisers still narrow it, because a schema
 * guarantees shape, not sense.
 */

export class TaxRecapExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxRecapExtractError";
  }
}

/**
 * Which Claude reads the returns. `AI_MODEL` overrides so the tax team can
 * trade accuracy for cost without a deploy; the default is the most accurate
 * generally available model, because a misread line costs reviewer time and
 * the difference per recap is well under a dollar. Read per call, not at
 * module load, so a changed env takes effect on the next request.
 */
export const DEFAULT_MODEL = "claude-opus-5";
export function modelName(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * How much the reader thinks before answering: `AI_EFFORT` = off, low,
 * medium or high. The Claude 5 models think unless told not to, and at the
 * API's default a read wrote 4,000–11,500 tokens of thinking — minutes of
 * waiting. With none at all (2026-10-01) reads took 10–30 seconds but filed
 * numbers on the wrong line now and then: Form 8995's QBI on the 8995-A
 * line, a nonresident column worked into the state adjustments, one
 * partner's Schedule E row as S corporation income. Low is the middle
 * ground; turn it up if a kind of return keeps misreading. Read per call,
 * like the model.
 */
export type ReadEffort = "off" | "low" | "medium" | "high";
export const DEFAULT_EFFORT: ReadEffort = "low";
export function readEffort(): ReadEffort {
  const v = process.env.AI_EFFORT?.trim().toLowerCase();
  return v === "off" || v === "low" || v === "medium" || v === "high" ? v : DEFAULT_EFFORT;
}

/**
 * Raw-byte cap on a PDF handed to the model. The builder only accepts
 * exports up to 6MB and sends a redacted, images-only copy of the kept
 * pages, which runs 2-4MB however big the original; anything over
 * DIRECT_UPLOAD_MAX_BYTES reaches here through the chunked upload
 * (lib/tax-recap/uploads.ts) rather than one request body. Scans are turned
 * away in the browser, so nothing near this size arrives any more.
 */
export const PDF_MAX_BYTES = 12 * 1024 * 1024;
/** What one request may carry. Vercel rejects bodies over ~4.5MB. */
export const DIRECT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/*
 * The schema is deliberately flat and union-free. Two API limits shaped it:
 * union/nullable properties are capped at 16 per schema, and a schema with
 * 22 nested per-field objects compiles to a grammar the API rejects as too
 * large. So the fields come back as one array of {key, value, page} with the
 * key constrained to the field list, blank lines are simply absent, and
 * unknown text is an empty string. toFieldShape() folds the array back into
 * the per-field record and the sanitiser turns the empties into nulls.
 */
function lineSchema(keys: readonly string[]) {
  return {
    type: "object",
    properties: {
      key: {
        type: "string",
        enum: [...keys],
        description: "Which line this is. See the instructions for what each key means.",
      },
      value: { type: "number", description: "Whole dollars as printed." },
      page: {
        type: "integer",
        description: "1-indexed PDF page the value was read from.",
      },
    },
    required: ["key", "value", "page"],
    additionalProperties: false,
  } as const;
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    taxpayerName: { type: "string", description: "As printed on Form 1040. Empty string if not found." },
    taxYear: { type: "integer", description: "The tax year of the return. 0 if not found." },
    filingStatus: { type: "string", description: "Empty string if not found." },
    stateCode: {
      type: "string",
      description: "Two-letter code of the state return. Empty string if there is no state return.",
    },
    stateForm: {
      type: "string",
      description: "Main state form the state figures came from, e.g. 540NR. Empty string if none.",
    },
    notes: {
      type: "string",
      description:
        "Anything the reviewer should know: forms missing, more than one state, unusual items, lines you were unsure about. Empty string if nothing.",
    },
    lines: {
      type: "array",
      description:
        "One entry per field that has a printed value. Omit fields whose line is blank. Each key at most once.",
      items: lineSchema(RETURN_FIELD_KEYS),
    },
  },
  required: ["taxpayerName", "taxYear", "filingStatus", "stateCode", "stateForm", "notes", "lines"],
  additionalProperties: false,
};

const ENTITY_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    entityName: { type: "string", description: "The entity's name as printed on Form 1120-S or Form 1065. Empty string if not found." },
    taxYear: { type: "integer", description: "The tax year of the return. 0 if not found." },
    returnForm: {
      type: "string",
      enum: ["1120-S", "1065", ""],
      description: "Which federal return this is: 1120-S for an S corporation, 1065 for a partnership. Empty string if it can't be told.",
    },
    stateCode: {
      type: "string",
      description: "Two-letter code of the state whose entity return carries the entity's own tax. Empty string if none.",
    },
    stateForm: {
      type: "string",
      description: "The state entity form the state figures came from, e.g. 100S or 568. Empty string if none.",
    },
    notes: {
      type: "string",
      description:
        "Anything the reviewer should know: more than one owner or state, unusual items, lines you were unsure about. Empty string if nothing.",
    },
    lines: {
      type: "array",
      description:
        "One entry per field that has a printed value. Omit fields whose line is blank. Each key at most once.",
      items: lineSchema(ENTITY_FIELD_KEYS),
    },
  },
  required: ["entityName", "taxYear", "returnForm", "stateCode", "stateForm", "notes", "lines"],
  additionalProperties: false,
};

/** Fold the model's `lines` array into the per-field record the rest of the code expects. */
function toFieldShape(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const p = parsed as Record<string, unknown>;
  const fields: Record<string, { value: unknown; page: unknown }> = {};
  if (Array.isArray(p.lines)) {
    for (const item of p.lines) {
      if (!item || typeof item !== "object") continue;
      const { key, value, page } = item as Record<string, unknown>;
      // First occurrence wins; a duplicated key is a model slip, not two lines.
      if (typeof key !== "string" || key in fields) continue;
      fields[key] = { value, page };
    }
  }
  return { ...p, fields };
}

const CONVENTIONS = `Conventions of these prints:
- Amounts are whole dollars printed with a trailing period, e.g. "123,038." means 123038. Report the integer.
- Report one entry in "lines" for each field below that has a printed value. A blank line is simply omitted — never report 0 for an empty line, and never compute a value that isn't printed. A line printed as "0" or "0." is a printed value: report 0. Use each key at most once.
- Losses and negative amounts appear in parentheses. Report them as negative numbers.
- Each value's "page" is the 1-indexed page of THIS PDF where you read it. Cite the page of the primary form line, not a summary that repeats it.
- Names, addresses and identifying numbers may be painted over with black boxes. That is expected; read the numbers around them.`;

const SYSTEM = `You read US individual income tax returns printed from Intuit ProSeries and report specific line values as JSON.

${CONVENTIONS}
- The print may include a cover letter, filing instructions, estimated-tax vouchers, e-file signature forms (Form 8879), worksheets and state forms. Read the primary form lines listed below. Form 8879 line 1 (AGI) and line 2 (total tax) can be used to cross-check but cite the Form 1040 page.

Federal lines (2025 Form 1040 layout; on an older layout use the line with the same meaning):
- w2Income: Form 1040 line 1z (total wages). If line 1z is blank and line 1a has a value, use 1a.
- qualifiedDividends: Form 1040 line 3a. Omit when blank.
- capitalGain: Form 1040 line 7 (capital gain or loss; a loss as a negative number). Omit when blank.
- capitalGainLongTerm: Schedule D line 15 (net long-term capital gain or loss) when the print has a Schedule D. Omit otherwise.
- businessNetIncome: Schedule 1 line 3, which equals Schedule C line 31 (net profit or loss). If Schedule 1 is absent, use Schedule C line 31. Omit when there is no Schedule C. A Schedule C whose only purpose is to pass income through — its receipts are described as "income issued to SSN picked up on the partnership (or S corporation) return" and the same amount is deducted as other expenses, so line 31 is 0 — is NOT a business: omit every Schedule C field for it and say so in notes.
- scorpIncome: Schedule E page 2, Part II: the nonpassive income (column k) of the rows marked S (an S corporation's K-1, Form 1120-S), added up. This is Schedule 1 line 5 when the only Schedule E income is from S corporations. Omit when there is no S corporation row.
- partnershipIncome: Schedule E page 2, Part II: the nonpassive income (column k) of the rows marked P (a partnership's K-1, Form 1065), added up — that figure is the partner's ordinary income plus guaranteed payments. Omit when there is no partnership row. Never report the same Schedule E figure under both scorpIncome and partnershipIncome.
- rentalIncome: Schedule E line 26 (total rental real estate and royalty income or loss, as deducted after Form 8582; a loss as a negative number). Omit when there is no Schedule E page 1.
- rentalProfits: Schedule E line 21 for the properties showing a profit, added up across every Schedule E page 1 copy. Omit when none.
- rentalLosses: Schedule E line 21 for the properties showing a loss, added up across every copy, as a POSITIVE number — the losses before any limitation. Omit when none.
- passivePriorUnallowed: Form 8582 line 1c plus line 2c (prior years' unallowed losses), as a positive number. Omit when there is no Form 8582 or the lines are blank.
- rentalReps: Schedule E page 2 line 43 (reconciliation for real estate professionals), the net income or loss from rentals the taxpayer materially participated in; a loss as a negative number. Omit when blank — it is the sign that real estate professional status was claimed.
- totalIncome: Form 1040 line 9.
- agi: Form 1040 line 11a (or line 11 on older layouts).
- dependentCount: how many dependents are listed in the Dependents block on Form 1040 page 1. Omit when none.
- qbiDeduction: Form 1040 line 13a (or 13).
- qbiIncome: Form 8995-A line 2 (qualified business income), added across the business columns. Only when the return has Form 8995-A — its title reads "Qualified Business Income Deduction" with a Part II "Determine Your Adjusted Qualified Business Income". Form 8995 (the simplified computation, one page, title "Qualified Business Income Deduction Simplified Computation") also prints a qualified business income figure: never put that one here. Omit all three 8995-A fields when the return has Form 8995 or neither.
- qbiW2Wages: Form 8995-A line 4 (allocable share of W-2 wages), added across the business columns. Same condition.
- qbiUbia: Form 8995-A line 7 (allocable share of the unadjusted basis of qualified property), added across the business columns. Omit when blank.
- qbiLossCarryforward: Form 8995 line 3, the qualified business net loss carryforward from the prior year, as a positive number. Omit when blank or when the return uses Form 8995-A.
- sepDeduction: Schedule 1 line 16 (self-employed SEP, SIMPLE and qualified plans). Omit when blank.
- itemizedDeductions: Schedule A line 17 (total itemized deductions), when the print has a Schedule A — even if the return took the standard deduction instead. Omit when there is no Schedule A.
- saltPaid: Schedule A line 5d (state and local taxes added up, before the cap). Omit when there is no Schedule A.
- saltDeducted: Schedule A line 5e (state and local taxes after the cap). Omit when there is no Schedule A.
- medicalExpenses: Schedule A line 1 (medical and dental expenses before the floor). Report 0 when printed as 0; omit when there is no Schedule A.
- taxableIncome: Form 1040 line 15.
- incomeTax: Form 1040 line 16.
- childTaxCredit: Form 1040 line 19. Omit when blank.
- childCareCredit: Schedule 3 line 2 (= Form 2441 line 11), the credit for child and dependent care expenses. Omit when blank.
- nonrefundableCredits: Form 1040 line 20 (= Schedule 3 line 8). Omit when blank.
- seTax: Schedule 2 line 4, which equals Schedule SE line 12. If Schedule 2 is absent use Schedule SE line 12; if neither exists, omit.
- otherTaxes: Form 1040 line 23 (other taxes, including self-employment tax, from Schedule 2 line 21). Report 0 when printed as 0; omit when blank.
- niit: Schedule 2 line 12 (= Form 8960 line 17), net investment income tax. Omit when blank or 0.
- federalTotalTax: Form 1040 line 24.
- federalPayments: Form 1040 line 33 (total payments — this line includes line 32).
- federalWithholding: Form 1040 line 25d (federal income tax withheld). Omit when blank.
- federalRefundableCredits: Form 1040 line 32 (total other payments and refundable credits: net premium tax credit, additional child tax credit, earned income credit, and line 31 — this line includes line 31). Omit when blank.
- otherPayments: Form 1040 line 31, which equals Schedule 3 line 15 (amount paid with an extension, excess Social Security withheld, other payments). Omit when blank — and it usually is. Estimated tax payments are line 26, not line 31; when line 32 is blank, line 31 is blank too.
- federalRefund: Form 1040 line 35a; omit when there is no refund.
- federalAmountOwed: Form 1040 line 37; omit when there is a refund.
- federalPenalty: Form 1040 line 38 (estimated tax penalty); omit when empty.
- grossReceipts: Schedule C line 1. If there are several Schedules C, sum them and say so in notes. Omit when there is no Schedule C.
- totalExpenses: Schedule C line 28.
- homeOffice: Schedule C line 30.
- cogs: Schedule C line 4 (cost of goods sold). Omit when blank.
- schCWages: Schedule C line 26 (wages, less employment credits). Omit when blank.
- schCDepreciation: Schedule C line 13 (depreciation and section 179). Omit when blank.

State lines. The state return can be for any state; identify the main individual income tax form and report its equivalents. If there is no state return, set stateCode and stateForm to empty strings and omit every state field. If there is more than one state, sum the amounts and list the states in notes.
- stateTotalTax: the state's total tax after nonrefundable credits and before payments, including add-on taxes the state bundles in (a shared responsibility payment, use tax). Report the printed total line as printed, even where that line also bundles in the underpayment penalty (New Jersey NJ-1040 "Total Tax Due" does) — the penalty is reported separately below and unbundled afterwards. California Form 540: line 64. California Form 540NR: line 74. Report 0 when the line is printed as 0.
- statePayments: total withholding, estimated payments and refundable credits. California 540: line 93 (or line 78 if 93 is absent). California 540NR: line 88.
- stateWithholding: state income tax withheld. California 540: line 71. California 540NR: line 81. Omit when blank.
- stateRefund: refund amount; omit when there is a balance due. California 540: line 99. California 540NR: line 125.
- stateAmountOwed: balance due before penalties and interest. California 540: line 100. California 540NR: line 121.
- statePenalty: underpayment penalty plus interest and late penalties. California 540: line 112 plus line 113. California 540NR: line 122 plus line 123. Omit when none.
- stateTotalDue: total amount due including penalties. California 540: line 114. California 540NR: line 124.
- stateSourceIncome: ONLY on a nonresident or part-year state return (California Form 540NR): the state-source total income before adjustments — Schedule CA (540NR) Part II, line 10, column E ("CA Amounts"). Omit on a resident return.
- stateAdjustments: the state's net adjustment to federal AGI before its own deductions, additions less subtractions. California Form 540: line 16 minus line 14 (Schedule CA (540) Part I line 27, column C less column B). Form 540NR: Schedule CA (540NR) Part II line 27, column C less column B. Negative when the subtractions are larger. Omit when both columns are blank, and for a state that starts from its own gross income (New Jersey).
- stateDeduction: the deduction the state return took — its standard deduction or its own itemized deductions, whichever line 18 of California Form 540 shows (= Schedule CA (540) Part II line 30). Omit for states without such a line.
- stateBusinessIncome: the state's own business profit line when the state return has one (New Jersey NJ-1040 line 18, "Net profits from business"; for an S corporation shareholder, NJ-1040 line 22, "Net pro rata share of S corporation income"). Omit for California.
- stateExemptions: the state's total exemption amount when it is a deduction from income (NJ-1040 line 13). Omit for California.
- stateExemptionCredits: the state's exemption credits after any phase-out, when they are a credit off the tax (California 540 line 32). Omit for other states.
- stateMedical: the state's medical expense deduction (NJ-1040 line 31). Omit when blank.
- stateTaxOnIncome: the state's tax on taxable income before credits and add-ons (NJ-1040 line 43; California 540 line 31, 540NR line 37). Omit when blank.
- statePteCreditAvailable: FTB 3804-CR Part II line 3, the pass-through entity elective tax credit available. Omit when there is no such form.
- statePteCredit: FTB 3804-CR Part II line 4, the credit claimed on this return (it also appears on Form 540 line 43 or 44 with code 242). Omit when there is no such form.
- statePteCreditRefundable: a refundable pass-through entity tax credit claimed in the payments section of the state return, AFTER the total tax line — New Jersey NJ-1040 line 63, "Pass-Through Business Alternative Income Tax Credit". Report stateTotalTax (NJ-1040 line 54) and statePayments (line 66) as printed; this credit is taken out afterwards. Omit when there is none.
- stateSharedResponsibility: a state shared responsibility (health coverage) payment (NJ-1040 line 53c). Omit when blank.
- uninsuredMonths: on Schedule NJ-HCC, the number of months of the year with NO box checked for the taxpayer (0 if every month is checked or Part I says Yes). Omit when there is no such schedule.

Health coverage lines (sehiDeduction and sehiPaid whenever the return has them; the Form 8962 lines only when Form 8962 is in the print — omit those otherwise):
- additionalTaxes: Form 1040 line 17 (Schedule 2 line 3), the excess advance premium tax credit repayment. Omit when blank.
- sehiDeduction: Schedule 1 line 17, self-employed health insurance deduction. Omit when blank.
- sehiPaid: Form 7206 line 1, the premiums paid; with several Forms 7206 (one per spouse or business), their line 1 amounts added up. Omit when there is no Form 7206.
- medicareWages: Form 7206 line 11, the Medicare wages from an S corporation the taxpayer owns more than 2% of. Omit when blank.
- ptcFamilySize: Form 8962 line 1.
- ptcPovertyLine: Form 8962 line 4.
- ptcMonths: how many of the months on Form 8962 lines 12–23 have an amount in column (a); report 12 if the annual line 11 was used instead.
- ptcPremiums: Form 8962 line 11 column (a), or the sum of lines 12–23 column (a).
- ptcSlcsp: Form 8962 line 11 column (b), or the sum of lines 12–23 column (b).
- ptcAdvance: Form 8962 line 25.
- ptcAllowed: Form 8962 line 24.
- ptcNet: Form 8962 line 26; omit when blank.
- ptcRepayment: Form 8962 line 29; omit when blank.

Also report the taxpayer's name as printed on Form 1040, the tax year, the filing status, and the two-letter state code of the state return. Use an empty string for any text you can't determine and 0 for an unknown tax year.`;

const ENTITY_SYSTEM = `You read US pass-through entity income tax returns printed from Intuit ProSeries — an S corporation's Form 1120-S or a partnership's Form 1065, with the state's own return for the entity — and report specific line values as JSON.

${CONVENTIONS}
- The print may include a cover letter, filing instructions, estimated-tax vouchers, e-file authorizations (Form 8879-CORP, 8879-PE, FTB 8453-C, FTB 8453-LLC), worksheets, statements, and one or more state returns. Read the primary form lines listed below.
- First decide which return this is (returnForm): "1120-S" for an S corporation, "1065" for a partnership. Page 1 of the federal form may have an unreadable text layer; the Schedules K-1 that follow name the form ("Schedule K-1 (Form 1065)" with "Partner's Share of Income" is a partnership).
- Several of the K-1 fields come in pairs: the owner's and a second owner's. The second owner's fields are for the case where two people on the same joint Form 1040 both hold K-1s (a married couple who are both partners). Report the first K-1 as the owner's and the second as the spouse's; with one K-1, omit the second owner's fields; with more than two owners, report the two whose K-1s go on this client's 1040 and list the others in notes.

Federal lines — Form 1120-S (2025 layout; on an older layout use the line with the same meaning):
- grossReceipts: Form 1120-S line 1a (gross receipts or sales). If line 1b has returns and allowances, report line 1c instead and say so in notes.
- cogs: Form 1120-S line 2 (cost of goods sold). Omit when blank.
- totalIncome: Form 1120-S line 6.
- officerComp: Form 1120-S line 7 (compensation of officers). Omit when blank.
- wages: Form 1120-S line 8 (salaries and wages). Omit when blank.
- taxesLicenses: Form 1120-S line 12. Omit when blank.
- pension: Form 1120-S line 17 (pension, profit-sharing, etc., plans). Omit when blank.
- employeeBenefits: Form 1120-S line 18. Omit when blank.
- otherDeductions: Form 1120-S line 20. Omit when blank.
- totalDeductions: Form 1120-S line 21.
- ordinaryIncome: Form 1120-S line 22 (ordinary business income or loss).
- k1Ordinary: Schedule K-1 (Form 1120-S) Part III box 1, ordinary business income, for the shareholder.
- ownershipPct: Schedule K-1 (Form 1120-S) item G, the shareholder's current year allocation percentage, as a plain number (100 for 100%).
- k1Ordinary2, ownershipPct2: the same two lines from the second shareholder's K-1, when a second owner is on the same 1040. Omit otherwise.
- distributions: Schedule K-1 (Form 1120-S) box 16 code D, every owner on this 1040 added up. Omit when blank.

Federal lines — Form 1065 (2025 layout):
- grossReceipts: Form 1065 line 1a. If line 1b has returns and allowances, report line 1c instead and say so in notes.
- cogs: Form 1065 line 2. Omit when blank.
- totalIncome: Form 1065 line 8.
- wages: Form 1065 line 9 (salaries and wages other than to partners). Omit when blank.
- guaranteedPayments: Form 1065 line 10 (guaranteed payments to partners). Omit when blank.
- taxesLicenses: Form 1065 line 14. Omit when blank.
- pension: Form 1065 line 18. Omit when blank.
- employeeBenefits: Form 1065 line 19. Omit when blank.
- otherDeductions: Form 1065 line 21. Omit when blank.
- totalDeductions: Form 1065 line 22.
- ordinaryIncome: Form 1065 line 23 (ordinary business income or loss).
- k1Ordinary: Schedule K-1 (Form 1065) Part III box 1 for the first partner.
- k1Guaranteed: Schedule K-1 (Form 1065) box 4c (total guaranteed payments) for the first partner. Omit when blank.
- ownershipPct: Schedule K-1 (Form 1065) item J, the partner's ending profit percentage, as a plain number (50 for 50%).
- k1Ordinary2, k1Guaranteed2, ownershipPct2: the same lines from the second partner's K-1, when a second partner is on the same 1040 (a spouse). Omit otherwise.
- distributions: Schedule K-1 (Form 1065) box 19 code A, every partner on this 1040 added up. Omit when blank.
- officerComp: omit for a partnership.

State lines: the state's own entity return — California Form 100S for an S corporation, California Form 568 for an LLC or Form 565 for a partnership, New Jersey CBT-100S with Form PTE-100; other states have an equivalent. If more than one state return is in the print, report the state where the entity's address is and list the others in notes. If there is none, set stateCode and stateForm to empty strings and omit every state field.
- stateNetIncome: the entity's net income for state tax (California 100S line 20; New Jersey: the entire net income on CBT-100S, or the total distributive proceeds on Form PTE-100 when the CBT-100S has none). For Form 568, Schedule B line 23 (ordinary income).
- stateGrossIncome: California Form 568 line 1 (total income from Schedule IW), the base of the LLC fee. Omit for other forms.
- stateAddBack: taxes based on income that were deducted federally and are added back for the state (California 100S line 2). Omit when blank.
- stateTax: the state's own tax on the entity before credits, at least the minimum (California 100S line 21; California 568: line 2 plus line 3, the LLC fee and the annual LLC tax; New Jersey CBT-100S: the minimum tax / tax due).
- pteTax: the pass-through entity elective tax (California 100S line 29 or 568 line 4, or Form 3804 line 3 when that form is in the print and the line is blank; New Jersey Form PTE-100: the total pass-through business alternative income tax). Omit when neither is printed.
- stateTotalTax: the state's total tax on the entity (California 100S line 30; 568 line 7; New Jersey CBT-100S total tax).
- statePayments: the entity's total state payments (California 100S line 36; 568 line 12). Omit when blank.
- stateAmountDue: the total amount due (California 100S line 45; 568 line 21). Report 0 when printed as 0.
- stateRefund: the refund (California 100S line 43; 568 line 19). Omit when blank.

Also report the entity's name as printed on the federal form, the tax year, which form it is, the two-letter state code and the state form. Use an empty string for any text you can't determine and 0 for an unknown tax year.`;

function userPrompt(kind: "before" | "after" | "entity"): string {
  if (kind === "entity") {
    return `This is the entity's return (Form 1120-S or Form 1065, with its state return) for the client's business, as filed. Read the lines described in your instructions from this PDF and return the JSON.`;
  }
  return kind === "before"
    ? `This is the BEFORE return: the same client's return prepared with income only and no deductions or strategies applied. Read the lines described in your instructions from this PDF and return the JSON.`
    : `This is the AFTER return: the client's final return with every deduction and strategy applied. Read the lines described in your instructions from this PDF and return the JSON.`;
}

/* ─────────────────────────────── the call ───────────────────────────────── */

/** What a read cost and how long it took, with the model and effort it ran at. */
export type ReadUsage = {
  inputTokens: number;
  outputTokens: number;
  model: string;
  effort: ReadEffort;
  seconds: number;
};

export type ExtractResult = {
  extract: ReturnExtract;
  /** Reviewer-facing notes: unverified numbers, Claude's own notes. */
  warnings: string[];
  usage: ReadUsage;
};

export type EntityExtractResult = {
  extract: EntityExtract;
  warnings: string[];
  usage: ReadUsage;
};

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new TaxRecapExtractError(
      "ANTHROPIC_API_KEY is not set — add it to .env.local (and Vercel) to read returns",
    );
  }
  // Constructed lazily so a build without the key still succeeds, and so a
  // rotated key surfaces as a 500 on the request that needed it.
  if (!client) client = new Anthropic();
  return client;
}

function checkPdf(pdf: Buffer) {
  if (!pdf.length) throw new TaxRecapExtractError("Empty PDF");
  if (pdf.length > PDF_MAX_BYTES) {
    throw new TaxRecapExtractError("PDF must be under 24MB");
  }
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new TaxRecapExtractError("That file isn't a PDF");
  }
}

/** One structured read of a PDF: the parsed JSON (folded to fields) and the usage. */
async function readPdf(
  pdf: Buffer,
  kind: "before" | "after" | "entity",
  system: string,
  schema: Record<string, unknown>,
): Promise<{ parsed: unknown; usage: ReadUsage }> {
  const label = kind === "entity" ? "entity return" : `${kind} return`;
  // Streamed so a long read (a 40-page client copy takes a while) can't trip
  // an idle-connection timeout somewhere between here and the API.
  const model = modelName();
  const effort = readEffort();
  const started = Date.now();
  const read = async (): Promise<Anthropic.Message> => {
    const stream = anthropic().messages.stream({
      model,
      // Thinking counts against this, so there's room for a "high" read.
      max_tokens: 32000,
      ...(effort === "off" ? { thinking: { type: "disabled" as const } } : {}),
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdf.toString("base64"),
              },
              title: label,
            },
            { type: "text", text: userPrompt(kind) },
          ],
        },
      ],
      output_config: {
        format: { type: "json_schema", schema },
        ...(effort === "off" ? {} : { effort }),
      },
    });
    try {
      return await stream.finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        throw new TaxRecapExtractError("Anthropic rejected the API key");
      }
      if (e instanceof Anthropic.RateLimitError) {
        throw new TaxRecapExtractError("Anthropic rate limit hit — try again in a minute");
      }
      if (e instanceof Anthropic.BadRequestError) {
        throw new TaxRecapExtractError(`Anthropic rejected the request: ${e.message}`);
      }
      if (e instanceof Anthropic.APIError) {
        throw new TaxRecapExtractError(`Anthropic error ${e.status ?? ""}: ${e.message}`);
      }
      throw e;
    }
  };

  let message = await read();
  if (message.stop_reason === "max_tokens") {
    // A hard scan occasionally sends the model into a loop. One more try is
    // usually all it takes, and it beats handing the reader a dead end.
    console.warn(`[tax-recap] ${kind} read hit the output limit; retrying once`);
    message = await read();
  }

  if (message.stop_reason === "refusal") {
    throw new TaxRecapExtractError(
      `The model declined to read this PDF${
        message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ""
      }`,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new TaxRecapExtractError("The extraction ran past its output limit twice — try again");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TaxRecapExtractError("The model's answer wasn't valid JSON");
  }
  return {
    parsed: toFieldShape(parsed),
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      model,
      effort,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    },
  };
}

const noTextWarning = (pageTexts: string[] | null) =>
  pageTexts
    ? "This PDF is a scan with no text layer, so nothing could be cross-checked — read the numbers off the pages yourself"
    : "No page text was available, so nothing could be cross-checked against the PDF";

export async function extractReturn(
  pdf: Buffer,
  kind: "before" | "after",
  pageTexts: string[] | null,
  /** Original page number of each sent page, when the return was trimmed. */
  pageMap: number[] | null = null,
): Promise<ExtractResult> {
  checkPdf(pdf);
  const { parsed, usage } = await readPdf(pdf, kind, SYSTEM, OUTPUT_SCHEMA);
  const raw = sanitizeExtract(parsed);
  if (!raw) throw new TaxRecapExtractError("The model's answer didn't match the schema");

  const verified = verifyAgainstText(raw, pageTexts);
  const unbundled = unbundleStatePenalty(verified.extract);
  // Verification runs against the pages as sent; the page numbers are only
  // translated back afterwards, once nothing else needs to index into them.
  const extract = remapPages(unbundled.extract, pageMap);
  const { unverified, noText } = verified;

  const warnings: string[] = [...unbundled.notes];
  if (unverified.length) {
    const labels = unverified.map((k) => RETURN_FIELDS.find((f) => f.key === k)?.label ?? k);
    warnings.push(`Couldn't find these numbers in the PDF text, check them by hand: ${labels.join(", ")}`);
  }
  if (noText) warnings.push(noTextWarning(pageTexts));
  if (extract.notes) warnings.push(`Reader notes: ${extract.notes}`);

  console.log(
    `[tax-recap] read ${kind} return with ${usage.model} (effort ${usage.effort}) in ${usage.seconds}s: ` +
      `${pageTexts?.length ?? "?"} pages sent, ${usage.inputTokens} in / ${usage.outputTokens} out, ${unverified.length} unverified`,
  );

  return { extract, warnings, usage };
}

/** The corporation's return: Form 1120-S, its K-1, and the state S corporation return. */
export async function extractEntityReturn(
  pdf: Buffer,
  pageTexts: string[] | null,
  pageMap: number[] | null = null,
): Promise<EntityExtractResult> {
  checkPdf(pdf);
  const { parsed, usage } = await readPdf(pdf, "entity", ENTITY_SYSTEM, ENTITY_OUTPUT_SCHEMA);
  const raw = sanitizeEntityExtract(parsed);
  if (!raw) throw new TaxRecapExtractError("The model's answer didn't match the schema");

  const verified = verifyEntityAgainstText(raw, pageTexts);
  const extract = remapEntityPages(verified.extract, pageMap);
  const { unverified, noText } = verified;

  const warnings: string[] = [];
  const formName = extract.returnForm ?? "entity return";
  if (unverified.length) {
    const labels = unverified.map((k) => ENTITY_FIELDS.find((f) => f.key === k)?.label ?? k);
    warnings.push(`Couldn't find these numbers in the ${formName} text, check them by hand: ${labels.join(", ")}`);
  }
  if (noText) warnings.push(noTextWarning(pageTexts));
  if (extract.notes) warnings.push(`Reader notes (${formName}): ${extract.notes}`);

  console.log(
    `[tax-recap] read entity return with ${usage.model} (effort ${usage.effort}) in ${usage.seconds}s: ` +
      `${pageTexts?.length ?? "?"} pages sent, ${usage.inputTokens} in / ${usage.outputTokens} out, ${unverified.length} unverified`,
  );

  return { extract, warnings, usage };
}
