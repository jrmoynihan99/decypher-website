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
 * return) and, when the business is an S corporation, the corporation's
 * 1120-S (with its state return). Each has its own field list in schema.ts
 * and its own instructions below.
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
    entityName: { type: "string", description: "The corporation's name as printed on Form 1120-S. Empty string if not found." },
    taxYear: { type: "integer", description: "The tax year of the return. 0 if not found." },
    stateCode: {
      type: "string",
      description: "Two-letter code of the state whose S corporation return carries the corporation's own tax. Empty string if none.",
    },
    stateForm: {
      type: "string",
      description: "The state S corporation form the state figures came from, e.g. 100S. Empty string if none.",
    },
    notes: {
      type: "string",
      description:
        "Anything the reviewer should know: more than one shareholder or state, unusual items, lines you were unsure about. Empty string if nothing.",
    },
    lines: {
      type: "array",
      description:
        "One entry per field that has a printed value. Omit fields whose line is blank. Each key at most once.",
      items: lineSchema(ENTITY_FIELD_KEYS),
    },
  },
  required: ["entityName", "taxYear", "stateCode", "stateForm", "notes", "lines"],
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
- businessNetIncome: Schedule 1 line 3, which equals Schedule C line 31 (net profit or loss). If Schedule 1 is absent, use Schedule C line 31. Omit when there is no Schedule C.
- scorpIncome: Schedule 1 line 5 (rental real estate, royalties, partnerships, S corporations, trusts), which equals Schedule E page 2 line 41, when that income is an S corporation's ordinary income from a Schedule K-1 (Form 1120-S). Omit when blank.
- totalIncome: Form 1040 line 9.
- agi: Form 1040 line 11a (or line 11 on older layouts).
- dependentCount: how many dependents are listed in the Dependents block on Form 1040 page 1. Omit when none.
- qbiDeduction: Form 1040 line 13a (or 13).
- qbiIncome: Form 8995-A line 2 (qualified business income), added across the business columns. Only when the return has Form 8995-A; omit when it uses the simplified Form 8995 or has neither.
- qbiW2Wages: Form 8995-A line 4 (allocable share of W-2 wages), added across the business columns. Same condition.
- qbiUbia: Form 8995-A line 7 (allocable share of the unadjusted basis of qualified property), added across the business columns. Omit when blank.
- taxableIncome: Form 1040 line 15.
- incomeTax: Form 1040 line 16.
- childTaxCredit: Form 1040 line 19. Omit when blank.
- childCareCredit: Schedule 3 line 2 (= Form 2441 line 11), the credit for child and dependent care expenses. Omit when blank.
- nonrefundableCredits: Form 1040 line 20 (= Schedule 3 line 8). Omit when blank.
- seTax: Schedule 2 line 4, which equals Schedule SE line 12. If Schedule 2 is absent use Schedule SE line 12; if neither exists, omit.
- niit: Schedule 2 line 12 (= Form 8960 line 17), net investment income tax. Omit when blank or 0.
- federalTotalTax: Form 1040 line 24.
- federalPayments: Form 1040 line 33 (total payments — this line includes line 32).
- federalWithholding: Form 1040 line 25d (federal income tax withheld). Omit when blank.
- federalRefundableCredits: Form 1040 line 32 (total other payments and refundable credits: net premium tax credit, additional child tax credit, earned income credit, etc.). Omit when blank.
- federalRefund: Form 1040 line 35a; omit when there is no refund.
- federalAmountOwed: Form 1040 line 37; omit when there is a refund.
- federalPenalty: Form 1040 line 38 (estimated tax penalty); omit when empty.
- grossReceipts: Schedule C line 1. If there are several Schedules C, sum them and say so in notes. Omit when there is no Schedule C.
- totalExpenses: Schedule C line 28.
- homeOffice: Schedule C line 30.

State lines. The state return can be for any state; identify the main individual income tax form and report its equivalents. If there is no state return, set stateCode and stateForm to empty strings and omit every state field. If there is more than one state, sum the amounts and list the states in notes.
- stateTotalTax: the state's total tax after nonrefundable credits and before payments, including add-on taxes the state bundles in (a shared responsibility payment, use tax). Report the printed total line as printed, even where that line also bundles in the underpayment penalty (New Jersey NJ-1040 "Total Tax Due" does) — the penalty is reported separately below and unbundled afterwards. California Form 540: line 64. California Form 540NR: line 74. Report 0 when the line is printed as 0.
- statePayments: total withholding, estimated payments and refundable credits. California 540: line 93 (or line 78 if 93 is absent). California 540NR: line 88.
- stateWithholding: state income tax withheld. California 540: line 71. California 540NR: line 81. Omit when blank.
- stateRefund: refund amount; omit when there is a balance due. California 540: line 99. California 540NR: line 125.
- stateAmountOwed: balance due before penalties and interest. California 540: line 100. California 540NR: line 121.
- statePenalty: underpayment penalty plus interest and late penalties. California 540: line 112 plus line 113. California 540NR: line 122 plus line 123. Omit when none.
- stateTotalDue: total amount due including penalties. California 540: line 114. California 540NR: line 124.
- stateSourceIncome: ONLY on a nonresident or part-year state return (California Form 540NR): the state-source total income before adjustments — Schedule CA (540NR) Part II, line 10, column E ("CA Amounts"). Omit on a resident return.
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

Marketplace health coverage lines (only when Form 8962 is in the print; omit all of these otherwise):
- additionalTaxes: Form 1040 line 17 (Schedule 2 line 3), the excess advance premium tax credit repayment. Omit when blank.
- sehiDeduction: Schedule 1 line 17, self-employed health insurance deduction. Omit when blank.
- sehiPaid: Form 7206 line 1, the premiums paid. Omit when there is no Form 7206.
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

const ENTITY_SYSTEM = `You read US S corporation income tax returns (Form 1120-S with the state's S corporation return) printed from Intuit ProSeries and report specific line values as JSON.

${CONVENTIONS}
- The print may include a cover letter, filing instructions, estimated-tax vouchers, e-file authorizations (Form 8879-CORP, FTB 8453-C), worksheets, statements, and one or more state returns. Read the primary form lines listed below.

Federal lines (2025 Form 1120-S layout; on an older layout use the line with the same meaning):
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
- k1Ordinary: Schedule K-1 (Form 1120-S) Part III box 1, ordinary business income, for the shareholder. If there is more than one K-1, report the largest share and list the others in notes.
- ownershipPct: Schedule K-1 (Form 1120-S) item G, the shareholder's current year allocation percentage, as a plain number (100 for 100%).
- distributions: Schedule K-1 (Form 1120-S) box 16 code D. Omit when blank.

State lines: the state's own S corporation return (California Form 100S, New Jersey CBT-100S with Form PTE-100; other states have an equivalent). If more than one state return is in the print, report the state where the corporation's address is and list the others in notes. If there is none, set stateCode and stateForm to empty strings and omit every state field.
- stateNetIncome: the corporation's net income for state tax (California 100S line 20; New Jersey: the entire net income on CBT-100S, or the total distributive proceeds on Form PTE-100 when the CBT-100S has none).
- stateAddBack: taxes based on income that were deducted federally and are added back for the state (California 100S line 2). Omit when blank.
- stateTax: the state's own tax on the corporation before credits, at least the minimum franchise tax (California 100S line 21; New Jersey CBT-100S: the minimum tax / tax due).
- pteTax: the pass-through entity elective tax (California 100S line 29, or Form 3804 line 3 when that form is in the print and line 29 is blank; New Jersey Form PTE-100: the total pass-through business alternative income tax). Omit when neither is printed.
- stateTotalTax: the state's total tax on the corporation (California 100S line 30; New Jersey CBT-100S total tax).
- statePayments: the corporation's total state payments (California 100S line 36). Omit when blank.
- stateAmountDue: the total amount due (California 100S line 45). Report 0 when printed as 0.
- stateRefund: the refund (California 100S line 43). Omit when blank.

Also report the corporation's name as printed on Form 1120-S, the tax year, the two-letter state code and the state form. Use an empty string for any text you can't determine and 0 for an unknown tax year.`;

function userPrompt(kind: "before" | "after" | "entity"): string {
  if (kind === "entity") {
    return `This is the S corporation's return (Form 1120-S and its state return) for the client's business, as filed. Read the lines described in your instructions from this PDF and return the JSON.`;
  }
  return kind === "before"
    ? `This is the BEFORE return: the same client's return prepared with income only and no deductions or strategies applied. Read the lines described in your instructions from this PDF and return the JSON.`
    : `This is the AFTER return: the client's final return with every deduction and strategy applied. Read the lines described in your instructions from this PDF and return the JSON.`;
}

/* ─────────────────────────────── the call ───────────────────────────────── */

export type ExtractResult = {
  extract: ReturnExtract;
  /** Reviewer-facing notes: unverified numbers, Claude's own notes. */
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number };
};

export type EntityExtractResult = {
  extract: EntityExtract;
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number };
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
): Promise<{ parsed: unknown; usage: Anthropic.Message["usage"]; model: string }> {
  const label = kind === "entity" ? "S corporation return" : `${kind} return`;
  // Streamed so a long read (a 40-page client copy takes a while) can't trip
  // an idle-connection timeout somewhere between here and the API.
  const model = modelName();
  const read = async (): Promise<Anthropic.Message> => {
    const stream = anthropic().messages.stream({
      model,
      max_tokens: 16000,
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
  return { parsed: toFieldShape(parsed), usage: message.usage, model };
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
  const { parsed, usage, model } = await readPdf(pdf, kind, SYSTEM, OUTPUT_SCHEMA);
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
    `[tax-recap] read ${kind} return with ${model}: ${pageTexts?.length ?? "?"} pages sent, ` +
      `${usage.input_tokens} in / ${usage.output_tokens} out, ${unverified.length} unverified`,
  );

  return {
    extract,
    warnings,
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
  };
}

/** The corporation's return: Form 1120-S, its K-1, and the state S corporation return. */
export async function extractEntityReturn(
  pdf: Buffer,
  pageTexts: string[] | null,
  pageMap: number[] | null = null,
): Promise<EntityExtractResult> {
  checkPdf(pdf);
  const { parsed, usage, model } = await readPdf(pdf, "entity", ENTITY_SYSTEM, ENTITY_OUTPUT_SCHEMA);
  const raw = sanitizeEntityExtract(parsed);
  if (!raw) throw new TaxRecapExtractError("The model's answer didn't match the schema");

  const verified = verifyEntityAgainstText(raw, pageTexts);
  const extract = remapEntityPages(verified.extract, pageMap);
  const { unverified, noText } = verified;

  const warnings: string[] = [];
  if (unverified.length) {
    const labels = unverified.map((k) => ENTITY_FIELDS.find((f) => f.key === k)?.label ?? k);
    warnings.push(`Couldn't find these numbers in the 1120-S text, check them by hand: ${labels.join(", ")}`);
  }
  if (noText) warnings.push(noTextWarning(pageTexts));
  if (extract.notes) warnings.push(`Reader notes (1120-S): ${extract.notes}`);

  console.log(
    `[tax-recap] read entity return with ${model}: ${pageTexts?.length ?? "?"} pages sent, ` +
      `${usage.input_tokens} in / ${usage.output_tokens} out, ${unverified.length} unverified`,
  );

  return {
    extract,
    warnings,
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
  };
}
