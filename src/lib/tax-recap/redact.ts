/**
 * What to paint out of a return before any of it leaves the browser.
 *
 * Pure functions over the page text pdfjs hands back (positioned runs, each
 * with its font), so the same code runs in the builder and in
 * `npm run recap:redact-check`, which proves it against real prints. The
 * browser half — opening the PDF, rendering, painting, assembling the
 * outgoing copy — is `components/portal/tax-recap/pdf-prepare.ts`.
 *
 * Layered, and every layer only ever ADDS paint:
 *
 *  1. Identity bands. The 1040's header block, Schedule C's business name,
 *     the 1120-S name-and-address block, the K-1's entity and owner blocks
 *     are painted whole, and the values inside them become tokens painted
 *     wherever else they appear.
 *  2. Name fields. Any value printed beside or under a label with "name" in
 *     it ("Name(s) shown on return", "Your name:", "Name of proprietor",
 *     "(1) First name", "Employer's name") is painted and becomes a token —
 *     the state forms that print the client's name without the 1040's
 *     wording, and the dependents nobody listed as tokens.
 *  3. Patterns: SSNs, EINs, long digit runs, emails, phones, dates.
 *  4. Digit clusters. A form that prints an SSN one digit per box, or in
 *     three separate fields ("231" "97" "1234"), hands pdfjs one run per box,
 *     so no single run looks like an SSN. Runs set close together on a line
 *     are joined and judged as one number.
 *  5. Garbled pages (a label font with a broken character map): every word
 *     set in a data font is painted, since no wording on the page can be
 *     matched.
 *
 * Data fonts — what ProSeries prints every filled-in value with — are
 * known two ways: a font the SSN or the client's name was found in, and any
 * font shaped like the Courier ProSeries uses (pdfjs reports a monospace
 * family, every glyph advances 0.6 em). The second needs nothing learned, so
 * it holds on a state form whose own copy of the font never prints the SSN.
 * Mixed-case values ("Jane & John Doe") count as values when
 * they're set in a data font; before, only capitals did, and a client whose
 * name was typed in mixed case had nothing learned to paint.
 */

/** A rectangle in PDF user space (origin bottom-left, points). */
export type Box = { x: number; y: number; w: number; h: number };
/** One text run with its box in PDF user space, the font it is set in, and that font's family as pdfjs reports it. */
export type Run = { str: string; x: number; y: number; w: number; h: number; font: string; family?: string };
export type PageInfo = { text: string; runs: Run[]; width: number; height: number };

/** The parts of a pdfjs text item this reads. */
type TextItem = { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string };

/** One page's pdfjs text content as runs. Shared by the browser and the check script. */
export function pageFromTextContent(
  content: { items: unknown[]; styles?: Record<string, { fontFamily?: string }> },
  width: number,
  height: number,
): PageInfo {
  const runs: Run[] = [];
  for (const raw of content.items) {
    const item = raw as TextItem;
    if (typeof item.str !== "string" || !item.str.trim() || !item.transform) continue;
    const t = item.transform;
    const h = Math.hypot(t[2], t[3]) || item.height || 8;
    const font = item.fontName ?? "";
    runs.push({ str: item.str, x: t[4], y: t[5], w: item.width ?? 0, h, font, family: content.styles?.[font]?.fontFamily });
  }
  return { text: runs.map((r) => r.str).join(" "), runs, width, height };
}

/* ────────────────────────────── identity bands ────────────────────────────── */

const starts = (run: Run, label: string) =>
  run.str.replace(/\s+/g, " ").trim().toLowerCase().startsWith(label.toLowerCase());

/** Form text is mixed case with lowercase letters; ProSeries prints values in capitals — unless typed otherwise. */
export function isLabel(s: string): boolean {
  return /[a-z]/.test(s);
}

/** A value inside an identity band: anything in a data font, or capitals in any font. */
const isValue = (r: Run, dataFonts: Set<string>) => dataFonts.has(r.font) || !isLabel(r.str);

export const inBox = (r: Run, b: Box) =>
  r.x + r.w / 2 >= b.x && r.x + r.w / 2 <= b.x + b.w && r.y >= b.y && r.y <= b.y + b.h;

/**
 * The 1040 header: everything from the "Your first name" row down to the
 * foreign-address row is identity, and nothing the recap reads is there.
 * Returns the band and the value runs inside it.
 */
export function headerBand(page: PageInfo, dataFonts: Set<string> = new Set()): { band: Box; values: Run[] } | null {
  const top = page.runs.find((r) => starts(r, "Your first name"));
  const bottom =
    page.runs.find((r) => starts(r, "Foreign country name")) ??
    page.runs.find((r) => starts(r, "Foreign postal code"));
  if (!top || !bottom) return null;
  const yTop = top.y + top.h * 1.6;
  const yBottom = Math.min(bottom.y, top.y) - top.h * 2.2;
  if (yTop <= yBottom) return null;
  const band: Box = { x: 0, y: yBottom, w: page.width, h: yTop - yBottom };
  const values = page.runs.filter((r) => r.y > yBottom && r.y < yTop && isValue(r, dataFonts));
  return { band, values };
}

/** Schedule C's "Business name" box: the label and the value printed under it. */
export function businessNameBand(page: PageInfo, dataFonts: Set<string> = new Set()): { band: Box; values: Run[] } | null {
  const label = page.runs.find((r) => starts(r, "Business name."));
  if (!label) return null;
  const band: Box = { x: label.x - 4, y: label.y - label.h * 2.4, w: label.w * 1.8 + 8, h: label.h * 3.2 };
  const values = page.runs.filter(
    (r) => inBox(r, band) && r !== label && isValue(r, dataFonts) && !/^[\d\s]+$/.test(r.str),
  );
  return { band, values };
}

/**
 * The 1120-S's name-and-address block: the "Name", "Number, street" and
 * "City or town" rows at the top of page 1. The corporation's name is
 * printed in mixed case here, so every run in the band that isn't one of
 * the form's own labels counts as a value.
 */
const ENTITY_BLOCK_LABELS = ["name", "number, street", "city or town", "type", "or", "print"];

export function entityHeaderBand(page: PageInfo): { band: Box; values: Run[] } | null {
  const street = page.runs.find((r) => starts(r, "Number, street, and room"));
  const city = page.runs.find((r) => starts(r, "City or town, state or province"));
  if (!street || !city) return null;
  const yTop = street.y + street.h * 3.4;
  const yBottom = city.y - city.h * 2.6;
  if (yTop <= yBottom) return null;
  const x0 = Math.min(street.x, city.x) - 6;
  const band: Box = { x: x0, y: yBottom, w: Math.max(street.w, city.w) * 1.1 + 12, h: yTop - yBottom };
  const values = page.runs.filter(
    (r) => inBox(r, band) && !ENTITY_BLOCK_LABELS.some((l) => starts(r, l)),
  );
  return { band, values };
}

/**
 * Schedule K-1: the entity's block under item B and the owner's under F —
 * the corporation's and shareholder's on an 1120-S K-1, the partnership's
 * and partner's on a 1065 K-1. Values are printed on the lines below each
 * label. `entity` marks the entity's block, whose top row is its name.
 */
export function k1Bands(page: PageInfo, dataFonts: Set<string> = new Set()): { band: Box; values: Run[]; entity: boolean }[] {
  const out: { band: Box; values: Run[]; entity: boolean }[] = [];
  const labels: [Run | undefined, boolean][] = [
    [page.runs.find((r) => starts(r, "Corporation’s name, address") || starts(r, "Corporation's name, address")), true],
    [page.runs.find((r) => starts(r, "Partnership’s name, address") || starts(r, "Partnership's name, address")), true],
    [page.runs.find((r) => starts(r, "Shareholder’s name, address") || starts(r, "Shareholder's name, address")), false],
    [page.runs.find((r) => starts(r, "Name, address, city, state, and ZIP code for partner")), false],
  ];
  for (const [label, entity] of labels) {
    if (!label) continue;
    const band: Box = { x: label.x - 6, y: label.y - label.h * 5.4, w: Math.max(label.w * 1.6, 220), h: label.h * 5.2 };
    const values = page.runs.filter((r) => inBox(r, band) && r !== label && isValue(r, dataFonts));
    out.push({ band, values, entity });
  }
  return out;
}

/* ────────────────────────────── name fields ────────────────────────────── */

/**
 * A label heading a person's or business's name or address: "Name(s) shown
 * on return", "Your name:", "Employer's name", "(1) First name", "Home
 * address", "Physical address of each property", "City, town, or post office".
 */
const NAME_LABEL = /\bnames?\b|\bname\(s\)|\baddress\b|\bcity\b|\bpost office\b/i;
/** A column header ("(a) Name", "(1) First name"): its values run down several rows. */
const COLUMN_HEADER = /^\s*\(?[a-z0-9]\)\s|^\s*(first|last) name\b/i;
/** Labels with those words that head no name: instructions, check boxes, other forms' references, city taxes. */
const NOT_A_NAME_FIELD =
  /name change|changed your name|address change|if your name|business name\.|enter the name|name of state|state name|^\s*name of (the )?(foreign )?country|new york city|city of new york|yonkers|city tax|city resident|city income/i;

/**
 * Values printed beside or under a name label: on the same line to its
 * right, or on the lines just below it (a column header's whole column).
 * Only runs in a data font with two letters or more — a column's "P"/"S"
 * marks, the X's and the amounts stay.
 */
export function nameFieldRuns(page: PageInfo, dataFonts: Set<string>): Run[] {
  if (!dataFonts.size) return [];
  const out = new Set<Run>();
  const candidates = page.runs.filter((r) => dataFonts.has(r.font) && /[A-Za-z].*[A-Za-z]/.test(r.str) && !isAmount(r.str));
  if (!candidates.length) return [];
  for (const label of page.runs) {
    if (dataFonts.has(label.font)) continue;
    const s = label.str.replace(/\s+/g, " ").trim();
    if (s.length > 90 || !NAME_LABEL.test(s) || NOT_A_NAME_FIELD.test(s)) continue;
    const rows = COLUMN_HEADER.test(s) ? 7 : 2.4;
    for (const r of candidates) {
      const right = Math.abs(r.y - label.y) <= label.h * 0.7 && r.x >= label.x + label.w - 4 && r.x <= label.x + label.w + 320;
      const below =
        r.y < label.y - label.h * 0.3 &&
        r.y >= label.y - label.h * rows - 2 &&
        r.x + r.w >= label.x - 14 &&
        r.x <= label.x + Math.max(label.w, 240);
      if (right || below) out.add(r);
    }
  }
  return [...out];
}

/* ────────────────────────────── tokens ────────────────────────────── */

/**
 * Words worth scrubbing everywhere, from the values found in the identity
 * bands. Short and generic ones (state codes, "BLVD", "LLC") would paint
 * over form text, so they're left out; the address still loses its numbers
 * and its distinctive words.
 */
const GENERIC = new Set([
  "LLC", "INC", "CORP", "BLVD", "STREET", "AVE", "AVENUE", "ROAD", "DRIVE", "LANE", "COURT",
  "PLACE", "WAY", "APT", "UNIT", "SUITE", "STE", "BLDG", "NORTH", "SOUTH", "EAST", "WEST",
  "NONE", "SAME", "USA",
  // Form words a name field's column can hold beside the names
  "STMT", "STATEMENT", "ATTACHED", "SINGLE", "MARRIED", "JOINT", "JOINTLY", "SEPARATELY",
  "TAXPAYER", "SPOUSE", "BOTH", "CORPORATION", "PARTNERSHIP", "TOTAL", "TOTALS", "OTHER",
  "SCHEDULE", "FORM", "LINE", "PAGE", "DAUGHTER", "STEPSON", "STEPDAUGHTER", "CHILD", "PARENT",
  "MOTHER", "FATHER", "SISTER", "BROTHER", "GRANDCHILD", "NEPHEW", "NIECE",
]);

export function tokensOf(values: Run[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    for (const word of v.str.toUpperCase().split(/[^A-Z0-9']+/)) {
      const w = word.replace(/'/g, "");
      if (w.length >= 4 && !GENERIC.has(w)) out.add(w);
    }
  }
  return [...out];
}

/** Three-letter words a name or a business's name carries that are also everyday words. */
const SHORT_COMMON = new Set(["AND", "THE", "LLC", "INC", "DBA", "CPA", "LLP", "LTD", "CO", "MRS", "MR", "DR", "JR", "SR", "III", "FOR", "OF"]);

/**
 * Three-letter words from the names themselves ("VAN" of "CHRIS VAN MEDIA",
 * "LEE", "KIM"): too short to paint wherever they appear, since form text is
 * full of them, so they're matched only against filled-in values.
 */
export function shortTokensOf(values: Run[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    for (const w of v.str.toUpperCase().split(/[^A-Z]+/)) if (w.length === 3 && !SHORT_COMMON.has(w)) out.add(w);
  }
  return [...out];
}

/** Restricted Damerau (optimal string alignment) distance, capped: is it at most 1? */
function withinOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff: number[] = [];
    for (let i = 0; i < a.length && diff.length <= 2; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    // One swap of neighbours ("JOHNSTEON" / "JOHNSTOEN").
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

/**
 * Whether a run carries a token. Exact on every word. With `fuzzy` — asked
 * for a filled-in value, never for form text — a long name (six letters or
 * more) also matches one typo away, since a state form can carry the
 * surname spelled as it was typed there. (Not on labels: "CAROLINE" would
 * paint North Carolina's name off its own forms.)
 */
export function matchesToken(s: string, tokens: string[], fuzzy = false): boolean {
  if (!tokens.length) return false;
  const words = s.toUpperCase().split(/[^A-Z0-9']+/).map((w) => w.replace(/'/g, ""));
  for (const w of words) {
    if (w.length < 4) continue;
    if (tokens.includes(w)) return true;
    if (fuzzy && w.length >= 6 && /^[A-Z]+$/.test(w)) {
      for (const t of tokens) if (t.length >= 6 && /^[A-Z]+$/.test(t) && withinOne(w, t)) return true;
    }
  }
  return false;
}

/* ────────────────────────────── patterns ────────────────────────────── */

/** SSNs in the three ways ProSeries prints them, EINs, long digit runs (and the one-digit-per-box way city forms print them), emails, phones, dates. */
export const PATTERNS: RegExp[] = [
  /\b\d{3}[- ]\d{2}[- ]\d{4}\b/,
  /\b\d{2}-\d{7}\b/,
  /\b\d{9,}\b/,
  /\b\d(?: \d){8}\b/,
  /\S+@\S+\.\S+/,
  /\(?\d{3}\)?[- ]?\d{3}-\d{4}/,
  /\b\d{2}[-/]\d{2}[-/]\d{4}\b/,
  /\b(?:X ?){9,}\b/,
];

export function matchesPattern(s: string): boolean {
  return PATTERNS.some((re) => re.test(s));
}

/** The SSN and EIN patterns alone: what marks a run's font as a data font. */
export const IDENTITY_NUMBERS = PATTERNS.slice(0, 2);

/**
 * A filled-in amount: digits with at most commas, a period and parentheses,
 * four digits or more. Three digits or fewer is the FTB's form code ("175")
 * or a line number; an SSN, EIN, phone or bank number is identity, not an
 * amount, and is excluded by the patterns.
 */
export function isAmount(s: string): boolean {
  const t = s.trim();
  return /^\(?-?\$?\d[\d,]*\.?\)?$/.test(t) && t.replace(/\D/g, "").length >= 4 && !matchesPattern(t);
}

/* ────────────────────────────── digit clusters ────────────────────────────── */

/** Characters a number set across boxes can carry between its digits. */
const DIGITISH = /^[\d\s,\-–—|./]+$/;
/** A dollar amount as ProSeries prints one: thousands commas, optional cents. */
const MONEY = /^\(?\$?-?\d{1,3}(,\d{3})+(\.\d{0,2})?\)?$/;

/**
 * The shapes an identity number takes once its boxes are joined, by the
 * lengths of its digit groups: an SSN 3-2-4, an EIN 2-7, either run
 * together, a phone 3-3-4, or one digit per box. A state form's amount and
 * its cents ("418904 00") is 6-2 and stays.
 */
function identityShape(groups: number[], digits: number): boolean {
  const key = groups.join("-");
  if (digits === 9 && ["3-2-4", "2-7", "9"].includes(key)) return true;
  if (digits === 10 && key === "3-3-4") return true;
  if (digits >= 9 && groups.every((g) => g === 1)) return true;
  return digits >= 10 && groups.length === 1;
}

/**
 * Runs set close together on one line that read as one identity number:
 * an SSN printed a digit per box, or in separate fields. `known` are the
 * nine-digit numbers learned from the identity bands; their first five
 * digits on their own ("231 97" with the last four in another field), and
 * any five or more of their digits in a row (the e-file PIN the 8879 sets
 * from the SSN's last five), are painted too.
 *
 * Only runs in a data font are joined: a garbled label font can hand back
 * its glyphs as stray digits, one per run, and a line of them would read as
 * a number set a digit per box.
 */
export function digitClusterRuns(page: PageInfo, known: string[] = [], dataFonts: Set<string> | null = null): Run[] {
  const lines = new Map<number, Run[]>();
  for (const r of page.runs) {
    if (!DIGITISH.test(r.str) || !/\d/.test(r.str)) continue;
    if (dataFonts?.size && !dataFonts.has(r.font)) continue;
    const key = Math.round(r.y / 2);
    const line = lines.get(key) ?? lines.get(key - 1) ?? lines.get(key + 1);
    if (line) line.push(r);
    else lines.set(key, [r]);
  }
  const firstFives = new Set(known.map((k) => k.slice(0, 5)));
  const out: Run[] = [];
  for (const line of lines.values()) {
    line.sort((a, b) => a.x - b.x);
    let cluster: Run[] = [];
    const flush = () => {
      if (cluster.length > 1) {
        const text = cluster.map((r) => r.str.trim()).join(" ");
        const compact = text.replace(/\s+/g, "");
        if (!MONEY.test(compact)) {
          const groups = text.split(/[^\d]+/).filter(Boolean).map((g) => g.length);
          const digits = text.replace(/\D/g, "");
          const shaped = identityShape(groups, digits.length);
          const knownWhole = known.some((k) => digits.includes(k));
          const knownPart =
            (groups.join("-") === "3-2" && firstFives.has(digits)) ||
            (digits.length >= 5 && groups.every((g) => g === 1) && known.some((k) => k.includes(digits)));
          if (shaped || knownWhole || knownPart) out.push(...cluster);
        }
      }
      cluster = [];
    };
    for (const r of line) {
      const prev = cluster[cluster.length - 1];
      if (prev) {
        const charW = prev.str.length ? prev.w / prev.str.length : prev.h * 0.6;
        const gap = r.x - (prev.x + prev.w);
        // A digit per box sits a box apart, and an SSN's dashes are boxes
        // of their own (an empty one between the groups on Illinois' forms).
        const comb = prev.str.trim().length === 1 && r.str.trim().length === 1;
        if (gap > (comb ? Math.max(30, charW * 8) : Math.max(6, charW * 2.6))) flush();
      }
      cluster.push(r);
    }
    flush();
  }
  return out;
}

/** The nine digits of every SSN and EIN printed in the given runs. */
export function identityDigits(runs: Run[]): string[] {
  const out = new Set<string>();
  for (const r of runs) {
    for (const re of [/\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, /\b\d{2}-\d{7}\b/g, /\b\d{9}\b/g]) {
      for (const m of r.str.matchAll(re)) out.add(m[0].replace(/\D/g, ""));
    }
  }
  return [...out];
}

/* ────────────────────────────── data fonts ────────────────────────────── */

/** Courier's advance as a share of the font size: 0.6 em, give or take rounding. */
const MONO_MIN = 0.55;
const MONO_MAX = 0.66;
const MONO_SPREAD = 0.03;

/**
 * Fonts shaped like ProSeries' data font: pdfjs says monospace, and every
 * run of three or more glyphs advances 0.6 em per glyph. A broken label
 * font can report monospace too, but its glyphs come back as one control
 * character each with almost no width, which this rejects.
 */
export function monospaceDataFonts(pages: PageInfo[]): Set<string> {
  const ratios = new Map<string, number[]>();
  for (const page of pages) {
    for (const r of page.runs) {
      if (r.family !== "monospace" || r.str.length < 3 || !(r.h > 0)) continue;
      const list = ratios.get(r.font) ?? [];
      list.push(r.w / (r.str.length * r.h));
      ratios.set(r.font, list);
    }
  }
  const out = new Set<string>();
  for (const [font, list] of ratios) {
    list.sort((a, b) => a - b);
    const med = list[Math.floor(list.length / 2)];
    const spread = list[Math.floor(list.length * 0.9)] - list[Math.floor(list.length * 0.1)];
    if (med >= MONO_MIN && med <= MONO_MAX && spread <= MONO_SPREAD) out.add(font);
  }
  return out;
}

/* ────────────────────────────── learning the identity ────────────────────────────── */

export type Identity = {
  name: string | null;
  entityName: string | null;
  tokens: string[];
  /** Three-letter words of the names, matched only against values (`shortTokensOf`). */
  shortTokens: string[];
  /** Per 1-indexed page: the identity bands to paint whole. */
  bands: Map<number, Box[]>;
  /** The nine digits of each SSN and EIN in the identity bands. */
  knownIds: string[];
  /** Fonts the SSN or the client's name was printed in — ProSeries' data fonts as learned. */
  valueFonts: Set<string>;
  /** Learned data fonts plus every Courier-shaped font: what a value is set in. */
  dataFonts: Set<string>;
  /** Per page: how many filled-in amounts it carries in a data font. */
  valueCounts: number[];
  /**
   * Per page: how many numbers of any size it carries in a data font — a
   * "0", a $64 credit — less identity numbers and the form codes printed at
   * the same spot on every page (the FTB's "175"). Zero means nothing on the
   * page is filled in.
   */
  filledCounts: number[];
};

const NUMERIC = /^\(?-?\$?\d[\d,]*\.?\d*\)?$/;

/** Numbers printed at the same spot on three pages or more: a form's own code, not a value. */
function formCodes(pages: PageInfo[], dataFonts: Set<string>): Set<string> {
  const seen = new Map<string, number>();
  for (const page of pages) {
    const keys = new Set<string>();
    for (const r of page.runs) {
      if (!dataFonts.has(r.font) || !NUMERIC.test(r.str.trim()) || r.str.replace(/\D/g, "").length > 3) continue;
      keys.add(`${r.str.trim()}@${Math.round(r.x / 2)}:${Math.round(r.y / 2)}`);
    }
    for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n >= 3).map(([k]) => k));
}

/**
 * Learn who the return is about, from every page (not only the ones that
 * will be sent): the identity bands and the words in them, the name fields,
 * the identity numbers, and the fonts values are printed in.
 */
export function learnIdentity(pages: PageInfo[]): Identity {
  const shaped = monospaceDataFonts(pages);
  let name: string | null = null;
  let entityName: string | null = null;
  const tokens = new Set<string>();
  const bands = new Map<number, Box[]>();
  const bandValues: Run[] = [];
  const addBand = (p: number, b: Box) => bands.set(p, [...(bands.get(p) ?? []), b]);

  // Learn the identity from the 1040 header, Schedule C, the 1120-S block
  // and the K-1, wherever they are in the document.
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const header = headerBand(page, shaped);
    if (header) {
      addBand(i + 1, header.band);
      bandValues.push(...header.values);
      for (const t of tokensOf(header.values)) tokens.add(t);
      if (name === null) {
        // The top row of the band is the name row; the runs on it, left to
        // right, are first name and last name.
        const rowY = Math.max(...header.values.map((v) => v.y));
        const row = header.values
          .filter((v) => Math.abs(v.y - rowY) < 3 && /^[A-Za-z][A-Za-z .'&-]*$/.test(v.str.trim()))
          .sort((a, b) => a.x - b.x)
          .map((v) => v.str.trim());
        if (row.length) name = row.join(" ");
      }
    }
    const business = businessNameBand(page, shaped);
    if (business) {
      addBand(i + 1, business.band);
      bandValues.push(...business.values);
      for (const t of tokensOf(business.values)) tokens.add(t);
    }
    const entity = entityHeaderBand(page);
    if (entity) {
      addBand(i + 1, entity.band);
      bandValues.push(...entity.values);
      for (const t of tokensOf(entity.values)) tokens.add(t);
      if (entityName === null && entity.values.length) {
        // The name row is the top one in the block.
        const rowY = Math.max(...entity.values.map((v) => v.y));
        const row = entity.values
          .filter((v) => Math.abs(v.y - rowY) < 3)
          .sort((a, b) => a.x - b.x)
          .map((v) => v.str.trim());
        if (row.length) entityName = row.join(" ");
      }
    }
    for (const k1 of k1Bands(page, shaped)) {
      addBand(i + 1, k1.band);
      bandValues.push(...k1.values);
      for (const t of tokensOf(k1.values)) tokens.add(t);
      // A 1065's page 1 often has an unreadable text layer, so the entity's
      // name is taken off its K-1 when the header band couldn't give it.
      if (k1.entity && entityName === null && k1.values.length) {
        const rowY = Math.max(...k1.values.map((v) => v.y));
        const row = k1.values
          .filter((v) => Math.abs(v.y - rowY) < 3 && /[A-Z]/.test(v.str))
          .sort((a, b) => a.x - b.x)
          .map((v) => v.str.trim());
        if (row.length) entityName = row.join(" ");
      }
    }
  }
  // The 540's header prints the first four letters of the surname as a code.
  const last = name?.split(" ").pop();
  if (last && last.length >= 4) tokens.add(last.slice(0, 4).toUpperCase());

  // The fonts the SSN or the client's name are set in, anywhere in the
  // print, are the data fonts: what ProSeries prints every filled-in value
  // with. On a garbled page that is what tells a value from a label.
  const tokenList = [...tokens];
  const valueFonts = new Set<string>();
  for (const page of pages) {
    for (const r of page.runs) {
      if (IDENTITY_NUMBERS.some((re) => re.test(r.str)) || matchesToken(r.str, tokenList)) valueFonts.add(r.font);
    }
  }
  const dataFonts = new Set([...valueFonts, ...shaped]);

  // Names printed beside a name label anywhere in the print: the state
  // forms', the dependents', the K-1 shareholder's on a print whose block
  // wasn't found. They join the tokens so every other copy goes too.
  const named: Run[] = [];
  for (const page of pages) named.push(...nameFieldRuns(page, dataFonts));
  for (const t of tokensOf(named)) tokens.add(t);
  const shortTokens = shortTokensOf([...bandValues.filter((r) => dataFonts.has(r.font) || !isLabel(r.str)), ...named]);

  const valueCounts = pages.map((page) =>
    page.runs.reduce((count, r) => count + (dataFonts.has(r.font) && isAmount(r.str) ? 1 : 0), 0),
  );
  const codes = formCodes(pages, dataFonts);
  const filledCounts = pages.map((page) =>
    page.runs.reduce((count, r) => {
      const s = r.str.trim();
      const filled =
        dataFonts.has(r.font) &&
        NUMERIC.test(s) &&
        !matchesPattern(s) &&
        !codes.has(`${s}@${Math.round(r.x / 2)}:${Math.round(r.y / 2)}`);
      return count + (filled ? 1 : 0);
    }, 0),
  );
  return {
    name,
    entityName,
    tokens: [...tokens],
    shortTokens,
    bands,
    // Every SSN and EIN printed in full anywhere: the household's, the
    // dependents', the business's and its employers'.
    knownIds: identityDigits([...bandValues, ...pages.flatMap((p) => p.runs)]),
    valueFonts,
    dataFonts,
    valueCounts,
    filledCounts,
  };
}

/* ────────────────────────────── one page ────────────────────────────── */

export type RedactContext = {
  tokens: string[];
  /** Three-letter name words, painted only where set in a data font. */
  shortTokens?: string[];
  bands: Box[];
  garbled: boolean;
  dataFonts: Set<string>;
  knownIds: string[];
};

/** A run's box, padded. A run whose transform claims a giant size (a scan line's hidden text) is boxed at a sane height. */
const paint = (r: Run): Box => {
  const h = Math.min(r.h, 40);
  return { x: r.x - 2, y: r.y - h * 0.3, w: r.w + 4, h: h * 1.4 };
};

function matchesShort(r: Run, short: string[] | undefined, dataFonts: Set<string>): boolean {
  if (!short?.length || !dataFonts.has(r.font)) return false;
  return r.str.toUpperCase().split(/[^A-Z]+/).some((w) => w.length === 3 && short.includes(w));
}

/**
 * Everything to paint on one page, and the page text to send for the
 * cross-check with the same things taken out. On an ordinary page that is
 * the identity bands, the name fields, any run matching a pattern or a
 * token, and the digit clusters. On a garbled page every word set in a data
 * font goes too: the labels are in the broken font and can't be read, so
 * nothing alphabetic on the page can be told safe, while the numbers — all
 * the model needs — stay.
 */
export function redactPage(page: PageInfo, ctx: RedactContext): { boxes: Box[]; text: string } {
  const boxes: Box[] = [...ctx.bands];
  const hidden = new Set<Run>([...nameFieldRuns(page, ctx.dataFonts), ...digitClusterRuns(page, ctx.knownIds, ctx.dataFonts)]);
  const kept: string[] = [];
  for (const r of page.runs) {
    const identity =
      hidden.has(r) ||
      matchesPattern(r.str) ||
      matchesToken(r.str, ctx.tokens, ctx.dataFonts.has(r.font)) ||
      matchesShort(r, ctx.shortTokens, ctx.dataFonts);
    const word = ctx.garbled && ctx.dataFonts.has(r.font) && /[A-Za-z].*[A-Za-z]/.test(r.str);
    if (identity || word) {
      boxes.push(paint(r));
    } else {
      kept.push(r.str);
    }
  }
  // An ordinary page's text keeps its shape for the cross-check, with what
  // was painted marked where it stood; a garbled page's is its numbers.
  const text = ctx.garbled ? kept.join(" ") : hidden.size ? page.runs.map((r) => (hidden.has(r) ? "■" : r.str)).join(" ") : page.text;
  return { boxes, text: scrubText(text, ctx.tokens) };
}

export function scrubText(text: string, tokens: string[]): string {
  let out = text;
  for (const re of PATTERNS) out = out.replace(new RegExp(re.source, "g"), "■");
  if (tokens.length) {
    const re = new RegExp(`\\b(?:${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
    out = out.replace(re, "■");
  }
  return out;
}

/* ────────────────────────────── images ────────────────────────────── */

/**
 * Images drawn on a page — a state form's 2D barcode (which encodes the
 * whole return, SSN included), the e-signature on the 1040 and 8879, a
 * logo — are painted over whole. None carries a figure the recap reads;
 * the figures are text. An image covering most of the page is a scanned
 * attachment, not a mark, and is left (the page it sits on has no text to
 * check anyway).
 */
export const IMAGE_MAX_SHARE = 0.5;

/** The box an image drawn with transform `m` (the unit square mapped into user space) covers. */
export function imageBox(m: number[]): Box {
  const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]];
  const ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x: x - 1, y: y - 1, w: Math.max(...xs) - x + 2, h: Math.max(...ys) - y + 2 };
}

/** pdfjs operator codes the image walk needs; passed in so this module stays free of pdfjs. */
export type ImageOps = {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  images: number[];
};

const multiply = (m: number[], n: number[]) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** The boxes of the images a page's operator list draws, smaller than `IMAGE_MAX_SHARE` of the page. */
export function imageBoxes(
  list: { fnArray: number[]; argsArray: unknown[][] },
  ops: ImageOps,
  pageArea: number,
): Box[] {
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const out: Box[] = [];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === ops.transform) ctm = multiply(ctm, args as number[]);
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0];
      if (Array.isArray(m) && m.length === 6) ctm = multiply(ctm, m as number[]);
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (ops.images.includes(fn)) {
      const b = imageBox(ctm);
      if (b.w * b.h < pageArea * IMAGE_MAX_SHARE) out.push(b);
    }
  }
  return out;
}
