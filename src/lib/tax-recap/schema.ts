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

export type FieldGroup = "income" | "federal" | "business" | "state";

export const RETURN_FIELDS = [
  { key: "w2Income", label: "W-2 wages", source: "Form 1040 line 1z", group: "income" },
  {
    key: "businessNetIncome",
    label: "Business net income",
    source: "Schedule 1 line 3 (= Schedule C line 31)",
    group: "income",
  },
  { key: "totalIncome", label: "Total income", source: "Form 1040 line 9", group: "income" },
  { key: "agi", label: "Adjusted gross income", source: "Form 1040 line 11a", group: "income" },
  { key: "qbiDeduction", label: "QBI deduction", source: "Form 1040 line 13a", group: "federal" },
  { key: "taxableIncome", label: "Taxable income", source: "Form 1040 line 15", group: "federal" },
  { key: "incomeTax", label: "Income tax", source: "Form 1040 line 16", group: "federal" },
  {
    key: "seTax",
    label: "Self-employment tax",
    source: "Schedule 2 line 4 (= Schedule SE line 12)",
    group: "federal",
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
    key: "federalRefundableCredits",
    label: "Refundable credits",
    source: "Form 1040 line 32 (net PTC, ACTC, EIC…)",
    group: "federal",
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
  { key: "grossReceipts", label: "Gross receipts", source: "Schedule C line 1", group: "business" },
  { key: "totalExpenses", label: "Total expenses", source: "Schedule C line 28", group: "business" },
  { key: "homeOffice", label: "Home office", source: "Schedule C line 30", group: "business" },
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
] as const;

export type ReturnFieldKey = (typeof RETURN_FIELDS)[number]["key"];

export const RETURN_FIELD_KEYS = RETURN_FIELDS.map((f) => f.key) as ReturnFieldKey[];

/** The numbers a recap is computed from — one set per return. */
export type ReturnNumbers = Record<ReturnFieldKey, number | null>;

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

export type RecapNextStep = { label: string; href: string | null };

/** What staff submit to create or update a recap. */
export type RecapInput = {
  clientName: string;
  taxYear: number;
  priorYearIncome: number | null;
  stateCode: string | null;
  before: ReturnNumbers;
  after: ReturnNumbers;
  strategies: string[];
  nextSteps: RecapNextStep[];
  /** The raw extraction, kept as the audit trail for the numbers above. */
  extraction: { before: ReturnExtract | null; after: ReturnExtract | null };
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

export const DEFAULT_NEXT_STEPS: RecapNextStep[] = [
  { label: "Sign the return", href: null },
  { label: "Book a roast call with OT", href: null },
  { label: "Fill out the survey before your call", href: null },
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

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};

export function sanitizeExtract(raw: unknown): ReturnExtract | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rawFields = (r.fields && typeof r.fields === "object" ? r.fields : {}) as Record<
    string,
    unknown
  >;
  const fields = Object.fromEntries(
    RETURN_FIELD_KEYS.map((key) => {
      const f = (rawFields[key] && typeof rawFields[key] === "object" ? rawFields[key] : {}) as Record<
        string,
        unknown
      >;
      // A field the model omitted (blank on the return) arrives as {} and
      // lands as value null — the same shape a stored document uses.
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
  ) as Record<ReturnFieldKey, ExtractedValue>;

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
      return { label, href: asHref(r.href) };
    })
    .filter((s): s is RecapNextStep => s !== null)
    .slice(0, 8);
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
    strategies: sanitizeStrategies(r.strategies),
    nextSteps: sanitizeNextSteps(r.nextSteps),
    extraction: {
      before: sanitizeExtract(extraction.before),
      after: sanitizeExtract(extraction.after),
    },
  };
}
