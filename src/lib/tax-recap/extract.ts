import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { RETURN_FIELDS, RETURN_FIELD_KEYS, sanitizeExtract, type ReturnExtract } from "./schema";
import { remapPages, unbundleStatePenalty, verifyAgainstText } from "./verify";

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
 * Output is constrained with a JSON schema (structured outputs), so the
 * response always parses; sanitizeExtract still narrows it, because a schema
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
 * Raw-byte cap on a PDF handed to the model: the API takes 32MB of request,
 * and base64 inflates by a third. A scanned client copy runs 15-20MB, so
 * anything over DIRECT_UPLOAD_MAX_BYTES reaches here through the chunked
 * upload (lib/tax-recap/uploads.ts) rather than one request body.
 */
export const PDF_MAX_BYTES = 24 * 1024 * 1024;
/** What one request may carry. Vercel rejects bodies over ~4.5MB. */
export const DIRECT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/*
 * The schema is deliberately flat and union-free. Two API limits shaped it:
 * union/nullable properties are capped at 16 per schema, and a schema with
 * 22 nested per-field objects compiles to a grammar the API rejects as too
 * large. So the fields come back as one array of {key, value, page} with the
 * key constrained to the field list, blank lines are simply absent, and
 * unknown text is an empty string. toFieldShape() folds the array back into
 * the per-field record and sanitizeExtract turns the empties into nulls.
 */
const LINE_SCHEMA = {
  type: "object",
  properties: {
    key: {
      type: "string",
      enum: [...RETURN_FIELD_KEYS],
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
      items: LINE_SCHEMA,
    },
  },
  required: ["taxpayerName", "taxYear", "filingStatus", "stateCode", "stateForm", "notes", "lines"],
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

const SYSTEM = `You read US individual income tax returns printed from Intuit ProSeries and report specific line values as JSON.

Conventions of these prints:
- Amounts are whole dollars printed with a trailing period, e.g. "123,038." means 123038. Report the integer.
- Report one entry in "lines" for each field below that has a printed value. A blank line is simply omitted — never report 0 for an empty line, and never compute a value that isn't printed. Use each key at most once.
- Losses and negative amounts appear in parentheses. Report them as negative numbers.
- Each value's "page" is the 1-indexed page of THIS PDF where you read it. Cite the page of the primary form line, not a summary that repeats it.
- The print may include a cover letter, filing instructions, estimated-tax vouchers, e-file signature forms (Form 8879), worksheets and state forms. Read the primary form lines listed below. Form 8879 line 1 (AGI) and line 2 (total tax) can be used to cross-check but cite the Form 1040 page.

Federal lines (2025 Form 1040 layout; on an older layout use the line with the same meaning):
- w2Income: Form 1040 line 1z (total wages). If line 1z is blank and line 1a has a value, use 1a.
- businessNetIncome: Schedule 1 line 3, which equals Schedule C line 31 (net profit or loss). If Schedule 1 is absent, use Schedule C line 31.
- totalIncome: Form 1040 line 9.
- agi: Form 1040 line 11a (or line 11 on older layouts).
- qbiDeduction: Form 1040 line 13a (or 13).
- taxableIncome: Form 1040 line 15.
- incomeTax: Form 1040 line 16.
- seTax: Schedule 2 line 4, which equals Schedule SE line 12. If Schedule 2 is absent use Schedule SE line 12; if neither exists, omit.
- federalTotalTax: Form 1040 line 24.
- federalPayments: Form 1040 line 33 (total payments — this line includes line 32).
- federalRefundableCredits: Form 1040 line 32 (total other payments and refundable credits: net premium tax credit, additional child tax credit, earned income credit, etc.). Omit when blank.
- federalRefund: Form 1040 line 35a; omit when there is no refund.
- federalAmountOwed: Form 1040 line 37; omit when there is a refund.
- federalPenalty: Form 1040 line 38 (estimated tax penalty); omit when empty.
- grossReceipts: Schedule C line 1. If there are several Schedules C, sum them and say so in notes.
- totalExpenses: Schedule C line 28.
- homeOffice: Schedule C line 30.

State lines. The state return can be for any state; identify the main individual income tax form and report its equivalents. If there is no state return, set stateCode and stateForm to empty strings and omit every state field. If there is more than one state, sum the amounts and list the states in notes.
- stateTotalTax: the state's total tax after nonrefundable credits and before payments, including add-on taxes the state bundles in (a shared responsibility payment, use tax). Report the printed total line as printed, even where that line also bundles in the underpayment penalty (New Jersey NJ-1040 "Total Tax Due" does) — the penalty is reported separately below and unbundled afterwards. California Form 540NR: line 74.
- statePayments: total withholding, estimated payments and refundable credits. California 540NR: line 88.
- stateRefund: refund amount; omit when there is a balance due. California 540NR: line 125.
- stateAmountOwed: balance due before penalties and interest. California 540NR: line 121.
- statePenalty: underpayment penalty plus interest and late penalties. California 540NR: line 122 plus line 123. Omit when none.
- stateTotalDue: total amount due including penalties. California 540NR: line 124.

Also report the taxpayer's name as printed on Form 1040, the tax year, the filing status, and the two-letter state code of the state return. Use an empty string for any text you can't determine and 0 for an unknown tax year.`;

function userPrompt(kind: "before" | "after"): string {
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

export async function extractReturn(
  pdf: Buffer,
  kind: "before" | "after",
  pageTexts: string[] | null,
  /** Original page number of each sent page, when the return was trimmed. */
  pageMap: number[] | null = null,
): Promise<ExtractResult> {
  if (!pdf.length) throw new TaxRecapExtractError("Empty PDF");
  if (pdf.length > PDF_MAX_BYTES) {
    throw new TaxRecapExtractError("PDF must be under 24MB");
  }
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new TaxRecapExtractError("That file isn't a PDF");
  }

  const label = `${kind} return`;

  // Streamed so a long read (a 40-page client copy takes a while) can't trip
  // an idle-connection timeout somewhere between here and the API.
  const model = modelName();
  const stream = anthropic().messages.stream({
    model,
    max_tokens: 16000,
    system: SYSTEM,
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
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
  });

  let message: Anthropic.Message;
  try {
    message = await stream.finalMessage();
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

  if (message.stop_reason === "refusal") {
    throw new TaxRecapExtractError(
      `The model declined to read this PDF${
        message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ""
      }`,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new TaxRecapExtractError("The extraction ran past its output limit — try again");
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
  const raw = sanitizeExtract(toFieldShape(parsed));
  if (!raw) throw new TaxRecapExtractError("The model's answer didn't match the schema");

  const verified = verifyAgainstText(raw, pageTexts);
  const unbundled = unbundleStatePenalty(verified.extract);
  // Verification runs against the pages as sent; the page numbers are only
  // translated back afterwards, once nothing else needs to index into them.
  const extract = remapPages(unbundled.extract, pageMap);
  const notes = unbundled.notes;
  const { unverified, noText } = verified;

  const warnings: string[] = [...notes];
  if (unverified.length) {
    const labels = unverified.map(
      (k) => RETURN_FIELDS.find((f) => f.key === k)?.label ?? k,
    );
    warnings.push(
      `Couldn't find these numbers in the PDF text, check them by hand: ${labels.join(", ")}`,
    );
  }
  if (noText) {
    warnings.push(
      pageTexts
        ? "This PDF is a scan with no text layer, so nothing could be cross-checked — read the numbers off the pages yourself"
        : "No page text was available, so nothing could be cross-checked against the PDF",
    );
  }
  if (extract.notes) warnings.push(`Reader notes: ${extract.notes}`);

  console.log(
    `[tax-recap] read ${kind} return with ${model}: ${pageTexts?.length ?? "?"} pages sent, ` +
      `${message.usage.input_tokens} in / ${message.usage.output_tokens} out, ${unverified.length} unverified`,
  );

  return {
    extract,
    warnings,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
