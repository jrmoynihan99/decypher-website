/**
 * Which pages of a return actually need to go to the model.
 *
 * A ProSeries client copy runs 25-45 pages, and the lines the recap needs
 * live on about ten of them. The rest is cover letters, estimated-tax
 * vouchers, W-2 and 1099 copies, K-1s and worksheets — all of it billed per
 * token and none of it read. Dropping those pages is the single biggest
 * lever on both cost and wall-clock time, and on Vercel's shorter function
 * limits the time matters as much as the money.
 *
 * The selection is deterministic and free: the browser already pulls each
 * page's text with pdfjs to verify the extraction afterwards, so the same
 * text decides what to send. No model is involved in choosing.
 *
 * Two rules keep it honest:
 *
 *  - **Anchors are the field map's own printed wording.** A page earns its
 *    place by containing a line the recap reads ("This is your total tax"),
 *    not by carrying a form name in a header — form names are cited all over
 *    a return, including on pages that only reference them.
 *  - **Unsure means send it.** Every bail-out path returns the whole
 *    document. A page wrongly dropped is a number the reviewer has to type;
 *    a page wrongly kept costs a fraction of a cent.
 *
 * Deliberately NOT anchored on Schedule SE: its text layer comes out as
 * mojibake on these prints (and missing entirely on some), so it can't be
 * matched. Self-employment tax is read from Schedule 2 line 4, which is the
 * same figure and does match.
 */

/** Below this many pages, filtering isn't worth the risk. */
const MIN_PAGES_TO_FILTER = 14;
/** Total characters under this means a scan with no usable text layer. */
const MIN_TEXT_CHARS = 2000;
/** Fewer kept pages than this and something is wrong with the matching. */
const MIN_KEPT = 5;

/**
 * Only federal forms carry an OMB control number. That one mark separates
 * the two halves of a return, and the halves need opposite treatment: the
 * federal set is a known, fixed list of forms, so it can be filtered hard,
 * while the state form differs by state and has to be treated as unknown.
 */
const FEDERAL = /OMB No\.\s*\d{4}-\d{4}/i;

/** Which return a PDF is: the shareholder's 1040 or the corporation's 1120-S. */
export type ReturnKind = "individual" | "entity";

/**
 * Full printed line labels the recap actually reads. These are specific
 * enough to identify a page on their own, and the IRS wording is stable
 * across years. A federal page earns its place only by matching one of
 * these.
 */
const STRONG: RegExp[] = [
  // Form 1040, pages 1 and 2
  /this is your total income/i,
  /this is your adjusted gross income/i,
  /this is your taxable income/i,
  /this is your total tax/i,
  /these are your total payments/i,
  // Schedule 1 line 3 / Schedule 2 line 4
  /business income or \(loss\)/i,
  /self-employment tax/i,
  // Schedule C lines 1, 28, 30, 31
  /gross receipts or sales/i,
  /total expenses before expenses for business use/i,
  /expenses for business use of your home/i,
  /net profit or \(loss\)/i,
  // e-file authorisations: one-page summaries of AGI, total tax, withholding
  // and balance due. Cheap, and on a scan they are sometimes the only place a
  // figure survives a redaction box.
  /e-?file signature authorization/i,
  // Form 8962 page 1 and Form 7206: the marketplace coverage lines
  /tax family size/i,
  /health insurance coverage established under your business/i,
  // Schedule E page 2: the K-1 income; Form 8995-A: the QBI inputs
  /income or loss from partnerships and s corporations/i,
  /qualified business income deduction/i,
  // Schedule 3 and Form 2441: the credits; Form 8960: net investment income tax
  /credit for child and dependent care expenses/i,
  /net investment income tax/i,
];

/**
 * The corporation's return: Form 1120-S page 1 and Schedule K, the K-1
 * (which the 1040's own selection drops as a copy, but here is the source),
 * Form 1125-A and 1125-E.
 */
const STRONG_ENTITY: RegExp[] = [
  /ordinary business income \(loss\)/i,
  /compensation of officers/i,
  /cost of goods sold/i,
  /shareholder.s share of current year income/i,
  /shareholder.s pro rata share items/i,
  /e-?file authorization for corporations/i,
];

/**
 * State pages of the corporation's return: the S corporation's own income
 * and tax lines (California Form 100S sides 1 and 2, its K-1).
 */
const STATE_ENTITY: RegExp[] = [
  /ordinary income \(loss\) from trade or business activities/i,
  /net income for tax purposes/i,
  /pass-through entity elective tax/i,
];

/**
 * The tax-computation lines a state return ends on. Any one of these is far
 * too common to qualify a page by itself, but the state pages the recap
 * reads are precisely the ones that carry SEVERAL: a total tax, what was
 * paid against it, and the resulting balance or refund. A supplementary
 * schedule carries at most one.
 *
 * Kept generic on purpose. The state form differs by state and this tool has
 * to work for all of them, but they word these particular lines much the
 * same everywhere.
 */
const STATE_TOTALS: RegExp[] = [
  /\btotal tax\b/i,
  /\btotal payments\b/i,
  /amount you owe/i,
  /\btax due\b/i,
  /overpaid/i,
  /\brefund\b/i,
  /balance of tax/i,
  /\bwithholding\b/i,
  /\bpenalt(y|ies)\b/i,
  /\bunderpayment\b/i,
];

/** How many of the above a state page needs before it earns its place. */
const STATE_TOTALS_NEEDED = 2;

/**
 * State pages that earn their place on their own wording: the state-source
 * income column and proration lines of a nonresident return (Schedule CA
 * (540NR) column E, 540NR side 2), New Jersey's exemptions page and its
 * health coverage schedule. None carries a closing total, so the rule above
 * would drop them. The wording only occurs on those forms, so other returns
 * are unaffected.
 */
const STATE_NONRESIDENT: RegExp[] = [
  /income earned or received as a CA resident/i,
  /CA adjusted gross income from Schedule CA/i,
  // New Jersey: the exemptions page and the health coverage schedule
  /total exemption amount/i,
  /minimum essential health coverage/i,
  // California 540 side 2 (exemption credits, the tax, the PTE credit line)
  // and the PTE elective tax credit form itself
  /exemption credits\. enter the amount from line 11/i,
  /pass-through entity elective tax credit/i,
];

/**
 * Page types that carry nothing the recap reads, whatever else they mention.
 * A payment voucher says "amount you owe"; a cover letter recites the refund.
 *
 * Matched against the page HEADER only (see EXCLUDE_HEAD_CHARS), because a
 * form names other forms constantly and a whole-page match reads those
 * references as the page's own identity. Both bugs this caught were that
 * mistake: Schedule C and Form 1040 page 2 each point the reader at the
 * Simplified Method Worksheet, and New Jersey's return mentions Schedule K-1
 * and a payment voucher as line references. Every one of those pages is
 * required, and a whole-page exclude dropped all four.
 */
const EXCLUDE: RegExp[] = [
  /payment voucher|\b1040-ES\b|\b540-ES\b/i,
  /instructions for filing/i,
  /\bdear\b/i,
  /wage and tax statement/i,
  /schedule k-?1\b/i,
  /\bform 1099-/i,
];

/** The corporation's print: vouchers and letters go; its K-1 stays (it's the source, not a copy). */
const EXCLUDE_ENTITY: RegExp[] = [
  /payment voucher|estimated tax|\b100-ES\b|\b1120-W\b/i,
  /instructions for filing/i,
  /\bdear\b/i,
  /wage and tax statement/i,
  /\bform 1099-/i,
];

/**
 * How much of a page counts as its header. A form's own title sits in the
 * first line or two; references to other forms sit in the body.
 */
const EXCLUDE_HEAD_CHARS = 400;

export type PageSelection = {
  /** 1-indexed page numbers to send, ascending. */
  pages: number[];
  /** Set when the whole document is going: why filtering was skipped. */
  fallback: "no-text-layer" | "short-document" | "too-few-matches" | null;
};

const allPages = (n: number, fallback: PageSelection["fallback"]): PageSelection => ({
  pages: Array.from({ length: n }, (_, i) => i + 1),
  fallback,
});

/**
 * Collapse whitespace before matching. pdfjs hands back one item per text
 * run, so a printed line arrives as "This is your total\n  income" — every
 * anchor below would miss it, and the whole selection would quietly fall
 * back to sending the entire document. Normalising here rather than at the
 * call site keeps this function correct whatever it is handed.
 */
const normalize = (text: string) => text.replace(/\s+/g, " ");

/**
 * Which return this is, from its own pages: an S corporation's print opens
 * on Form 1120-S, a client's on Form 1040. Null when neither shows up in
 * the first pages (a scan, or something else entirely).
 */
export function detectReturnKind(pageTexts: string[]): ReturnKind | null {
  const head = pageTexts.slice(0, 12).map(normalize);
  const entity = head.some((t) => /U\.?S\.? Income Tax Return for an S Corporation/i.test(t) || /\bForm\s*1120-?S\b/i.test(t));
  const individual = head.some((t) => /U\.?S\.? Individual Income Tax Return/i.test(t) || /this is your total income/i.test(t));
  if (entity && !individual) return "entity";
  if (individual && !entity) return "individual";
  if (entity && individual) {
    // Both mentioned early (a cover letter listing both): the first primary form decides.
    for (const t of head) {
      if (/U\.?S\.? Income Tax Return for an S Corporation/i.test(t)) return "entity";
      if (/U\.?S\.? Individual Income Tax Return/i.test(t)) return "individual";
    }
  }
  return null;
}

/** Decide which pages of a return to send. Never returns an empty list. */
export function selectPages(pageTexts: string[], kind: ReturnKind = "individual"): PageSelection {
  const n = pageTexts.length;
  if (!n) return { pages: [], fallback: "no-text-layer" };

  const chars = pageTexts.reduce((sum, t) => sum + t.trim().length, 0);
  // A scan has no text to match on, so there is nothing to filter with.
  if (chars < MIN_TEXT_CHARS) return allPages(n, "no-text-layer");
  if (n < MIN_PAGES_TO_FILTER) return allPages(n, "short-document");

  const exclude = kind === "entity" ? EXCLUDE_ENTITY : EXCLUDE;
  const strong = kind === "entity" ? STRONG_ENTITY : STRONG;
  const stateOwn = kind === "entity" ? STATE_ENTITY : STATE_NONRESIDENT;

  const kept: number[] = [];
  for (let i = 0; i < n; i++) {
    const text = normalize(pageTexts[i] ?? "");
    if (text.trim().length < 40) continue;
    const head = text.slice(0, EXCLUDE_HEAD_CHARS);
    if (exclude.some((re) => re.test(head))) continue;
    // The two halves are judged differently. A federal page belongs to a
    // known, fixed set of forms, so it has to name one of the lines the recap
    // reads. A page with no OMB number is a state form, where the anchors
    // above are useless — a state's own Schedule CA mirrors federal wording
    // line for line — so it is judged on how many closing tax-computation
    // lines it carries instead.
    const needed = FEDERAL.test(text)
      ? strong.some((re) => re.test(text))
      : STATE_TOTALS.filter((re) => re.test(text)).length >= STATE_TOTALS_NEEDED ||
        stateOwn.some((re) => re.test(text));
    if (needed) kept.push(i + 1);
  }

  // The one line the recap cannot be built without: the 1040's total tax,
  // or the 1120-S's ordinary income. Not finding it means the matching
  // missed, not that the return lacks it.
  const must = kind === "entity" ? /ordinary business income \(loss\)/i : /this is your total tax/i;
  const foundMust = kept.some((p) => must.test(normalize(pageTexts[p - 1] ?? "")));
  if (kept.length < MIN_KEPT || !foundMust) return allPages(n, "too-few-matches");

  return { pages: kept, fallback: null };
}

/** How much of the document a selection drops, for the log line and the UI. */
export function selectionSummary(
  selection: PageSelection,
  pageTexts: string[],
): { kept: number; total: number; charsKept: number; charsTotal: number; pctDropped: number } {
  const charsTotal = pageTexts.reduce((s, t) => s + t.length, 0) || 1;
  const charsKept = selection.pages.reduce((s, p) => s + (pageTexts[p - 1]?.length ?? 0), 0);
  return {
    kept: selection.pages.length,
    total: pageTexts.length,
    charsKept,
    charsTotal,
    pctDropped: Math.round((1 - charsKept / charsTotal) * 100),
  };
}
