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
 *
 * The same broken text layer turns up on other forms on some prints
 * (Schedule C, Form 8995 and every FTB form on one 2024 return): the page
 * renders perfectly, but the font behind the labels maps its glyphs to
 * control characters and symbols, so nothing on it can be matched or
 * excluded on wording. Such a page is kept on the second rule above — the
 * picture is what the model reads — and `pdf-prepare.ts` paints every
 * word on it out (see `isGarbledText`).
 *
 * Two trims keep the bill down without touching what is read:
 *
 *  - **A page identical to an earlier one goes.** ProSeries staples a
 *    second copy of the whole federal return behind the California one
 *    ("ATTACH FEDERAL RETURN"); its pages repeat the first copy's text
 *    layer to the character, so the first copy is enough.
 *  - **A garbled page with nothing filled in goes.** The caller can say how
 *    many amounts each page carries in the data font (`valueCounts`, from
 *    the fonts pdf-prepare.ts can see); a garbled page with none — a blank
 *    annualization schedule, a signature page — has nothing to read. The
 *    FTB's three-digit form code on every page doesn't count as an amount.
 */

/** Below this many pages, filtering isn't worth the risk. */
const MIN_PAGES_TO_FILTER = 14;
/** Total characters under this means a scan with no usable text layer. */
const MIN_TEXT_CHARS = 2000;

/** Whether a print has no text layer to speak of: a scan, or pages saved as pictures. */
export function noTextLayer(pageTexts: string[]): boolean {
  return pageTexts.reduce((sum, t) => sum + t.trim().length, 0) < MIN_TEXT_CHARS;
}
/** Fewer kept pages than this and something is wrong with the matching. */
const MIN_KEPT = 5;

/**
 * Only federal forms carry an OMB control number. That one mark separates
 * the two halves of a return, and the halves need opposite treatment: the
 * federal set is a known, fixed list of forms, so it can be filtered hard,
 * while the state form differs by state and has to be treated as unknown.
 */
const FEDERAL = /OMB No\.\s*\d{4}-\d{4}/i;

/**
 * Only a federal form's FIRST page carries the OMB number. Its later pages
 * open on the IRS running head instead — "Schedule 1 (Form 1040) 2025 Page 2",
 * "Form 8995-A (2025) Page 2", "Form 1120-S (2025) Page 4" — and without
 * this they were judged as state pages and dropped for lacking a state
 * total. That cost every return its Schedule 1 page 2 (the SE, health
 * insurance and retirement plan deductions) and a partner's return its
 * Schedule E page 2, which is the K-1 income itself.
 *
 * Both halves are required, in the head only: the form's own name with the
 * year, and "Page N". State forms number their pages "Side N" (California)
 * or carry the state's prefix ("NJ-1040", "IT-201", "Form 1040ME"), so none
 * of them matches.
 */
const FEDERAL_RUNNING_HEAD =
  /\((?:Form )?(?:1040|1065|1120-?S)\b[^)]*\)\s*\(?20\s?\d\s?\d\)?|\bForm \d{4}(?:-[A-Z]{1,2})?\s*\((?:20\d\d|Rev\.[^)]*)\)/i;
const PAGE_NUMBER = /\bPage \d\b/i;
const HEAD_CHARS = 160;

/** A federal page: page 1 by its OMB number, any later page by its running head. */
function isFederalPage(text: string): boolean {
  if (FEDERAL.test(text)) return true;
  const head = text.slice(0, HEAD_CHARS);
  return FEDERAL_RUNNING_HEAD.test(head) && PAGE_NUMBER.test(head);
}

/**
 * Which return a PDF is: the shareholder's 1040, the corporation's 1120-S
 * (with its state return), or a city's own return for the corporation (New
 * York City's NYC-3L / NYC-4S), which ProSeries prints as a separate file.
 */
export type ReturnKind = "individual" | "entity" | "city";

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
  // Schedule E page 1 and Form 8582: the rentals and the passive loss limit
  /income or loss from rental real estate and royalties/i,
  /passive activity loss limitations/i,
  // Schedule D: the long-term net; Schedule A (and Schedule CA's Part II): the itemized total
  /net long-term capital gain or \(loss\)/i,
  /total itemized deductions/i,
  // Schedule 8812: the children and other dependents behind line 19
  /number of qualifying children under age 17/i,
  // Form W-2 copies: whose wages, and (for the browser, not the model) whose employer
  /wages, tips, other comp/i,
];

/**
 * The entity's return: Form 1120-S or 1065 page 1 and Schedule K, the K-1
 * (which the 1040's own selection drops as a copy, but here is the source),
 * Form 1125-A and 1125-E, and the state e-file authorization (a one-page
 * summary of the state figures).
 */
const STRONG_ENTITY: RegExp[] = [
  /ordinary business income \(loss\)/i,
  /compensation of officers/i,
  /cost of goods sold/i,
  /shareholder.s share of current year income/i,
  /shareholder.s pro rata share items/i,
  /partner.s share of (current year )?income/i,
  /partners.? distributive share items/i,
  /guaranteed payments/i,
  /e-?file (return )?authorization for/i,
];

/**
 * State pages of the entity's return: the S corporation's or LLC's own
 * income and tax lines (California Form 100S sides 1 and 2, Form 568 sides
 * 1, 4 and 5, their K-1s).
 */
const STATE_ENTITY: RegExp[] = [
  /ordinary income \(loss\) from trade or business activities/i,
  /net income for tax purposes/i,
  /pass-through entity elective tax/i,
  /limited liability company fee/i,
  /annual limited liability company tax/i,
  /guaranteed payments to members/i,
];

/**
 * A city's return for the corporation (New York City Form NYC-3L): the tax
 * computation (Schedule A), entire net income (Schedule B), the business
 * allocation (Schedule H), and the S corporation attachment. Page 1 of the
 * NYC-3L prints its labels as images and only the numbers reach the text
 * layer, so a city print is sent whole unless it's long (see CITY_WHOLE_UPTO).
 */
const STRONG_CITY: RegExp[] = [
  /allocated net income/i,
  /computation and allocation of entire net income/i,
  /business allocation percentage/i,
  /calculation of federal taxable income for s corporations/i,
  /total remittance due/i,
  /federal return information/i,
  /alternative tax schedule/i,
];

/** A city print under this many pages goes whole: the schedules are few and page 1 can't be matched on wording. */
const CITY_WHOLE_UPTO = 24;

/** The city print's vouchers (NYC-200V, NYC-400) and letters go. */
const EXCLUDE_CITY: RegExp[] = [
  /payment voucher|estimated tax by business corporations|\bNYC-200V\b|\bNYC-400\b/i,
  /instructions for filing/i,
  /\bdear\b/i,
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
 * Or this many filled-in amounts in the print's data fonts. A state page
 * that computes something carries several; a supplementary schedule one or
 * two. New York's IT-201 is the case: its label font is shifted rather than
 * garbled (so `isGarbledText` doesn't flag it) and the wording the rules
 * above look for comes out as "1<6WD[RQOLQHDPRXQW" — which is how the tax
 * computation page, the one the state total is on, was being dropped while
 * the pages either side of it got through on other rules.
 */
const STATE_VALUES_NEEDED = 3;

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
  // Massachusetts Schedule INC: every W-2 with whose it is and its employer;
  // Form 1 page 1 (the exemptions block, no closing total on it)
  /schedule 62-?wh/i,
  /taxpayer ss withheld/i,
  /total exemptions\. add items 2a through 2f/i,
  // Maryland 505 page 2 (the income columns, deduction and exemptions) and
  // the 505NR (the nonresident proration and the special nonresident tax)
  /deduction method/i,
  /special nonresident tax/i,
  /maryland income factor/i,
  // New York IT-201 page 3: the tax computation and the city tax. Its
  // section headings are the only lines of it the text layer prints legibly.
  /tax calculation, credits, and other taxes/i,
  /new york city and yonkers taxes/i,
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
/**
 * The W-2 copies stay in (a joint return's wages are read per person, and
 * the browser tells the business's W-2s from an outside employer's by
 * their EIN — see `entityW2Pages`); the K-1 and 1099 copies still go.
 */
const EXCLUDE: RegExp[] = [
  /payment voucher|\b1040-ES\b|\b540-ES\b/i,
  /instructions for filing/i,
  /\bdear\b/i,
  /schedule k-?1\b/i,
  /\bform 1099-/i,
];

/** The entity's print: vouchers and letters go; its K-1 stays (it's the source, not a copy). */
const EXCLUDE_ENTITY: RegExp[] = [
  /payment voucher|estimated tax|\b100-ES\b|\b1120-W\b|llc tax voucher|\bftb 3522\b|\bftb 3536\b/i,
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

/**
 * What a broken character map produces: control characters, the ASCII
 * symbols no form label uses, and Latin-1 / other non-ASCII outside the
 * typographic punctuation and shapes the IRS and FTB forms do print (curly
 * quotes, dashes, bullets, the ▶ arrows).
 */
const GARBLED_CHARS =
  /[\x00-\x08\x0e-\x1f\x7f-\x9f\xa1-\xff[\]^`{|}~<>@#*!+=]|[^\x00-ÿ -⁯←-⇿■-◿]/g;
/** Share of a page's non-space characters that are garbage before the page counts as garbled; clean pages run under 1%. */
const GARBLED_SHARE = 0.08;

/**
 * Whether a page's text layer is garbled: the form's own labels came out
 * as symbols (a font with a broken character map), while the filled-in
 * values, printed in another font, survive. Judged on the characters, not
 * the words, so it holds whether pdfjs hands the labels back one glyph at
 * a time or run together.
 */
export function isGarbledText(text: string): boolean {
  const body = text.replace(/\s+/g, "");
  if (body.length < 200) return false;
  const garbage = body.match(GARBLED_CHARS)?.length ?? 0;
  return garbage / body.length >= GARBLED_SHARE;
}

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

const ENTITY_TITLE = /U\.?S\.? Income Tax Return for an S Corporation|U\.?S\.? Return of Partnership Income/i;
const ENTITY_FORM = /\bForm\s*1120-?S\b|\bForm\s*1065\b|Partner.s Share of Income, Deductions/i;
const INDIVIDUAL_TITLE = /U\.?S\.? Individual Income Tax Return/i;
/**
 * A city's own return for the corporation: New York City's general
 * corporation tax (NYC-3L, NYC-4S) or unincorporated business tax (NYC-204).
 * Its attachment names "Form 1120S" as its source, which is why the federal
 * title, not the form reference, decides between a city print and the
 * 1120-S itself.
 */
const CITY_TITLE = /\bNYC-3L\b|\bNYC-4S(?:EZ)?\b|\bNYC-204\b|general corporation tax return|unincorporated business tax return|\bNYC-ATT-S-CORP\b/i;

/**
 * What the file's own name says it is, for a print whose pages can't say
 * (a scan, or a text layer scrambled throughout — see `textLayerUnusable`).
 * The firm's exports are named "<client> - <year> 1040 INDIVIDUAL TAX
 * RETURN.pdf", "<entity> - <year> 1120S S-CORP TAX RETURN.pdf", "<entity> -
 * <year> NYC TAX RETURN.pdf"; any name that carries a form number or the
 * words works. Null when the name says nothing.
 */
export function kindFromFileName(name: string): ReturnKind | null {
  const t = name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").toUpperCase();
  if (/\bNYC\b|\bCITY\b/.test(t)) return "city";
  if (/\b1120\s?S\b|\bS\s?CORP(?:ORATION)?\b|\b1065\b|\bPARTNERSHIP\b|\bK\s?1\b/.test(t)) return "entity";
  if (/\b1040\b|\bINDIVIDUAL\b|\bPERSONAL\b/.test(t)) return "individual";
  return null;
}

/** The tax year a print's name carries ("<client> - 2025 1040 …"); null when it carries none. */
export function yearFromFileName(name: string): number | null {
  const m = name.match(/(?:^|\D)(20[1-4]\d)(?!\d)/);
  const year = m ? Number(m[1]) : NaN;
  return year >= 2015 && year <= 2040 ? year : null;
}

/** The client a print's name carries — the words before " - " in the firm's exports; "" when it doesn't follow them. */
export function clientFromFileName(name: string): string {
  const i = name.indexOf(" - ");
  return i > 0 ? name.slice(0, i).trim() : "";
}

/** Which federal form an entity print's name says it is; null when it doesn't say. */
export function entityFormFromFileName(name: string): "1120-S" | "1065" | null {
  const t = name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").toUpperCase();
  if (/\b1065\b|\bPARTNERSHIP\b/.test(t)) return "1065";
  if (/\b1120\s?S\b|\bS\s?CORP(?:ORATION)?\b/.test(t)) return "1120-S";
  return null;
}

/**
 * Whether the text layer is unusable throughout: every page with text on
 * it is garbled. A print made through a generic PDF driver rather than
 * ProSeries' own export sets each page in one embedded font whose glyphs
 * are numbered by first use, with nothing mapping them back to letters —
 * labels and numbers alike come out as noise, on every page. Nothing can be
 * matched, found or painted out on such a print, so it is read like a scan.
 * A ProSeries export with a few garbled pages (a font quirk on Schedule C
 * or the FTB forms) is not this: its other pages read fine.
 */
export function textLayerUnusable(pageTexts: string[]): boolean {
  // Judged on the pages `isGarbledText` can judge (200+ characters); a
  // near-empty page (a voucher stub, a continuation sheet) says nothing.
  const withText = pageTexts.filter((t) => t.replace(/\s+/g, "").length >= 200);
  return withText.length > 0 && withText.every(isGarbledText);
}

/**
 * Which return this is, from its own pages: an entity's print opens on
 * Form 1120-S or Form 1065 (whose own page 1 may have an unreadable text
 * layer — the K-1 that follows names the form), a client's on Form 1040, a
 * city's on its own form. When none shows up in the first pages (a scan,
 * a print whose text layer is scrambled throughout), the file's name is
 * asked (`kindFromFileName`); null when it says nothing either.
 */
export function detectReturnKind(pageTexts: string[], fileName = ""): ReturnKind | null {
  const head = pageTexts.slice(0, 12).map(normalize);
  const entityTitle = head.some((t) => ENTITY_TITLE.test(t));
  const entity = entityTitle || head.some((t) => ENTITY_FORM.test(t));
  const individual = head.some((t) => INDIVIDUAL_TITLE.test(t) || /this is your total income/i.test(t));
  const city = head.some((t) => CITY_TITLE.test(t));
  if (city && !entityTitle && !individual) return "city";
  if (entity && !individual) return "entity";
  if (individual && !entity) return "individual";
  if (entity && individual) {
    // Both mentioned early (a cover letter listing both): the first primary form decides.
    for (const t of head) {
      if (ENTITY_TITLE.test(t)) return "entity";
      if (INDIVIDUAL_TITLE.test(t)) return "individual";
    }
  }
  return fileName ? kindFromFileName(fileName) : null;
}

/** Which federal return an entity's print is, from its pages, else from its file name; null when neither can tell. */
export function detectEntityForm(pageTexts: string[], fileName = ""): "1120-S" | "1065" | null {
  for (const raw of pageTexts) {
    const t = normalize(raw);
    if (/Return of Partnership Income|\bForm\s*1065\b|Partner.s Share of Income, Deductions/i.test(t)) return "1065";
    if (/Income Tax Return for an S Corporation|\bForm\s*1120-?S\b|Shareholder.s Share of Income, Deductions/i.test(t)) return "1120-S";
  }
  return fileName ? entityFormFromFileName(fileName) : null;
}

/**
 * Decide which pages of a return to send. Never returns an empty list.
 * `valueCounts[i]`, when given, is how many filled-in amounts page i + 1
 * carries in the print's data fonts; it only ever drops a garbled page, and
 * only one with zero. `filledCounts[i]`, when given, counts any number at
 * all filled in on it (a "0", a $64 credit — redact.ts `filledCounts`), and
 * a garbled page is dropped only when that is zero too: a California 540
 * side 3 on a zero-tax return carries its total tax, payments and refund
 * as zeros and small amounts, none of which `valueCounts` sees, and was
 * being dropped with the state total on it.
 */
export function selectPages(
  pageTexts: string[],
  kind: ReturnKind = "individual",
  valueCounts: number[] | null = null,
  filledCounts: number[] | null = null,
): PageSelection {
  const n = pageTexts.length;
  if (!n) return { pages: [], fallback: "no-text-layer" };

  const chars = pageTexts.reduce((sum, t) => sum + t.trim().length, 0);
  // A scan has no text to match on, so there is nothing to filter with.
  if (chars < MIN_TEXT_CHARS) return allPages(n, "no-text-layer");
  if (n < MIN_PAGES_TO_FILTER) return allPages(n, "short-document");
  if (kind === "city" && n <= CITY_WHOLE_UPTO) return allPages(n, "short-document");

  const exclude = kind === "entity" ? EXCLUDE_ENTITY : kind === "city" ? EXCLUDE_CITY : EXCLUDE;
  const strong = kind === "entity" ? STRONG_ENTITY : kind === "city" ? STRONG_CITY : STRONG;
  const stateOwn = kind === "entity" ? STATE_ENTITY : kind === "city" ? STRONG_CITY : STATE_NONRESIDENT;

  const kept: number[] = [];
  /** Text of every kept page, so a later copy of the same page is skipped. */
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const text = normalize(pageTexts[i] ?? "");
    if (text.trim().length < 40) continue;
    if (seen.has(text)) continue;
    // Nothing on a garbled page can be matched or excluded on wording, and
    // the Schedule C it most often is carries the lines the recap is built
    // from. Unsure means send it — unless the caller could see that nothing
    // is filled in on it.
    if (isGarbledText(text)) {
      if (valueCounts && valueCounts[i] === 0 && (!filledCounts || filledCounts[i] === 0)) continue;
      kept.push(i + 1);
      seen.add(text);
      continue;
    }
    const head = text.slice(0, EXCLUDE_HEAD_CHARS);
    if (exclude.some((re) => re.test(head))) continue;
    // The two halves are judged differently. A federal page belongs to a
    // known, fixed set of forms, so it has to name one of the lines the recap
    // reads. A page with no OMB number is a state form, where the anchors
    // above are useless — a state's own Schedule CA mirrors federal wording
    // line for line — so it is judged on how many closing tax-computation
    // lines it carries instead.
    const needed = isFederalPage(text)
      ? strong.some((re) => re.test(text))
      : STATE_TOTALS.filter((re) => re.test(text)).length >= STATE_TOTALS_NEEDED ||
        stateOwn.some((re) => re.test(text)) ||
        (valueCounts !== null && (valueCounts[i] ?? 0) >= STATE_VALUES_NEEDED);
    if (needed) {
      kept.push(i + 1);
      seen.add(text);
    }
  }

  // The one line the recap cannot be built without: the 1040's total tax,
  // or the entity's ordinary income (on the 1120-S or 1065, or its K-1),
  // or the city return's allocation. Not finding it means the matching
  // missed, not that the return lacks it.
  const must =
    kind === "entity"
      ? /ordinary business income \(loss\)/i
      : kind === "city"
        ? /allocated net income|business allocation percentage/i
        : /this is your total tax/i;
  const foundMust = kept.some((p) => must.test(normalize(pageTexts[p - 1] ?? "")));
  if (kept.length < MIN_KEPT || !foundMust) return allPages(n, "too-few-matches");

  return { pages: kept, fallback: null };
}

/* ─────────────────────────── whose W-2s are the business's ─────────────────────────── */

/**
 * Employer identification numbers as the prints carry them: with the dash
 * on federal forms, as nine bare digits on state forms. A nine-digit run
 * can also be a Social Security number the way a state form prints it, so
 * the SSNs found on the return (dashed or spaced, on the federal forms) are
 * taken out.
 */
const EIN_LIKE = /\b\d{2}-\d{7}\b|\b\d{9}\b/g;
const SSN_ANY = /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g;
/** The paid preparer's own number, labelled as such on every return and never the business's. */
const FIRM_EIN = /firm.?s EIN\s*(\d{2}-?\d{7})/gi;

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * A garbled label font leaves control characters and symbols between the
 * values on a row (see `isGarbledText`); the values themselves survive.
 * Dropped before any matching here, so a wage schedule with a broken font
 * reads as "333137065 5589 57000 4361 W2".
 */
const clean = (text: string) => normalize(text.replace(/[\x00-\x1f\x7f-\x9f]/g, " "));

function einsOn(text: string, exclude: Set<string>): string[] {
  const out = new Set<string>();
  for (const m of text.match(EIN_LIKE) ?? []) {
    const d = digits(m);
    if (!exclude.has(d)) out.add(d);
  }
  return [...out];
}

/** Numbers that are never the business's: every SSN on the return and the preparer's firm EIN. */
function notEntity(texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of texts) {
    const t = clean(raw);
    for (const m of t.match(SSN_ANY) ?? []) out.add(digits(m));
    for (const m of t.matchAll(FIRM_EIN)) out.add(digits(m[1]));
  }
  return out;
}

/**
 * The EIN of the client's own business, as nine digits: from the 1040's
 * Schedule E page 2 (column (d) of the partnership and S corporation rows),
 * or failing that the number the entity's own print repeats on most of its
 * pages (its running header; the preparer's number appears once). Empty
 * when neither names one.
 */
export function entityEins(individualTexts: string[], entityTexts: string[] = []): string[] {
  const exclude = notEntity([...individualTexts, ...entityTexts]);
  const out = new Set<string>();
  for (const raw of individualTexts) {
    const t = clean(raw);
    if (!/income or loss from partnerships and s corporations/i.test(t)) continue;
    for (const e of einsOn(t, exclude)) out.add(e);
  }
  if (!out.size && entityTexts.length) {
    const counts = new Map<string, number>();
    for (const raw of entityTexts) {
      for (const e of einsOn(clean(raw), exclude)) counts.set(e, (counts.get(e) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) out.add(best[0]);
  }
  return [...out];
}

/** A W-2 copy in the print: box 1's own label, or the form's title. */
const W2_COPY = /wage and tax statement|wages, tips, other comp/i;
/**
 * One row of a state wage schedule (Massachusetts Schedule INC): the
 * employer's number, a few amounts, and "W2" in the source column — all set
 * in the data font, so the row survives a garbled label font.
 */
const W2_ROW = /\b(\d{2}-?\d{7})\b((?:\s+-?[\d,]+\.?){1,6})\s+W-?2\b/g;

/** W-2s the business issued, on one page: a W-2 copy, or the rows of a wage schedule. */
export type EntityW2Page = {
  /** 1-indexed position in `pageTexts`. */
  page: number;
  /** True for a W-2 copy (one employer); false for a schedule listing several. */
  copy: boolean;
  /** Each W-2 row as printed — its amounts, and whether the business issued it. Empty for a copy. */
  rows: { amounts: string[]; ours: boolean }[];
};

/**
 * Which pages carry W-2s the business itself issued, and which rows on
 * them. A W-2 copy counts when the employer number on it is the
 * business's; a wage schedule's rows are judged one by one, so the hint
 * can quote the amounts of the business's rows and the model, which sees
 * only painted-over employer numbers, can still tell them apart.
 */
export function entityW2Pages(pageTexts: string[], eins: string[]): EntityW2Page[] {
  const out: EntityW2Page[] = [];
  if (!eins.length) return out;
  const exclude = notEntity(pageTexts);
  pageTexts.forEach((raw, i) => {
    const t = clean(raw);
    const rows = [...t.matchAll(W2_ROW)].map((m) => ({
      amounts: m[2].trim().split(/\s+/).map((a) => a.replace(/\.$/, "")),
      ours: eins.includes(digits(m[1])),
    }));
    if (rows.length) {
      if (rows.some((r) => r.ours)) out.push({ page: i + 1, copy: false, rows });
      return;
    }
    if (!W2_COPY.test(t)) return;
    const found = einsOn(t, exclude);
    if (found.length && found.every((e) => eins.includes(e))) out.push({ page: i + 1, copy: true, rows: [] });
  });
  return out;
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
