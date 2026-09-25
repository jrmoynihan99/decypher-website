import {
  detectReturnKind,
  selectPages,
  selectionSummary,
  type PageSelection,
  type ReturnKind,
} from "@/lib/tax-recap/pages";

/**
 * Turn a return PDF into what actually gets sent: its per-page text, and a
 * copy trimmed to the pages the recap reads with the identity fields
 * blacked out.
 *
 * Everything runs in the browser, and both libraries are lazy-imported so a
 * staff member who never opens this tool never downloads them. pdfjs reads
 * the text (which decides which return this is, what to send, what to
 * redact, and later verifies the extraction) and renders the kept pages;
 * pdf-lib builds the outgoing PDF from those renders.
 *
 * Two steps, so that two returns dropped together can share what they learn
 * about the client: `analyzePdf` reads a file once — its kind (a 1040 or an
 * 1120-S), its pages, the identity bands and the words found in them — and
 * `preparePdf` renders the outgoing copy, painting out its own tokens plus
 * any handed in from the other return. The corporation's name learned off
 * the 1120-S is then painted out of the 1040's Schedule E, and the owner's
 * name learned off the 1040 is painted out of the K-1.
 *
 * Redaction, in two passes on every kept page:
 *
 *  1. What the return says about the client. The 1040's header block —
 *     names, SSNs, street, apartment, city, state, ZIP — is a fixed band
 *     between "Your first name" and "Foreign country name"; the business
 *     name sits under its own label on Schedule C; the 1120-S has a
 *     name-and-address block under "Number, street" and the K-1 has one
 *     for the corporation and one for the shareholder. Those bands are
 *     painted over whole, and the values found inside them become tokens
 *     that are painted out wherever else they appear (the 8879, every
 *     state page, Form 8995, the 540's four-letter name code).
 *  2. Patterns. SSNs and EINs, 9+ digit runs (routing and account numbers),
 *     emails, phone numbers, dates of birth.
 *
 * The outgoing PDF is images only — no text layer — so nothing painted over
 * survives underneath, and the page text handed to the server for the
 * cross-check is scrubbed with the same tokens. A scanned print has no text
 * to find any of this in, so it goes as it is and the builder says so.
 *
 * Nothing here is allowed to fail the read. Every error path falls back to
 * sending the original file whole, because a return that costs more to read
 * beats a return that can't be read.
 */

export type PreparedPdf = {
  /** What to upload: the redacted, trimmed copy, or the original when not filtered. */
  data: Blob;
  /** Text of the pages being sent, in send order, identity tokens scrubbed. */
  pageTexts: string[];
  /** pageMap[i] is the original 1-indexed page of sent page i + 1. */
  pageMap: number[];
  totalPages: number;
  sentPages: number;
  originalBytes: number;
  sentBytes: number;
  /** Null when the whole document is going; otherwise why it was trimmed. */
  trimmed: { pctPagesDropped: number } | null;
  /** Set when filtering was skipped, for the reviewer-facing note. */
  fallback: PageSelection["fallback"] | "slice-failed";
  /** Which return this is, from its own pages; null when it couldn't be told. */
  kind: ReturnKind | null;
  /** What the redaction found and did. */
  identity: {
    /** The client's name as printed on the 1040, read locally; never sent. */
    name: string | null;
    /** The corporation's name as printed on the 1120-S, read locally; never sent. */
    entityName: string | null;
    /** True when the outgoing pages had identity fields painted over. */
    redacted: boolean;
    boxes: number;
  };
  /** A small JPEG data URL of the first outgoing page, so staff can see what leaves. */
  preview: string | null;
};

/** One text run with its box in PDF user space (origin bottom-left, points). */
type Run = { str: string; x: number; y: number; w: number; h: number };
type PageInfo = { text: string; runs: Run[]; width: number; height: number };

/**
 * A file read once: what it is, its pages, and the identity learned from
 * them. Handed to `preparePdf`, optionally with tokens from another return.
 */
export type PdfAnalysis = {
  file: File;
  bytes: ArrayBuffer;
  /** Null when pdfjs couldn't open the file at all. */
  pages: PageInfo[] | null;
  texts: string[];
  kind: ReturnKind | null;
  name: string | null;
  entityName: string | null;
  tokens: string[];
  bands: Map<number, Box[]>;
};

/** Render scale: a letter page at 1.8 is ~1100×1430px, which the model reads well. */
const SCALE = 1.8;
const JPEG_QUALITY = 0.78;
const PREVIEW_WIDTH = 280;

/* ────────────────────────────── reading ────────────────────────────── */

async function pdfjsLib() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}

/** Per-page text and positioned runs via pdfjs. Null when the PDF can't be read at all. */
async function readPages(bytes: ArrayBuffer): Promise<PageInfo[] | null> {
  try {
    const pdfjs = await pdfjsLib();
    const task = pdfjs.getDocument({ data: bytes.slice(0) });
    const doc = await task.promise;
    const pages: PageInfo[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const runs: Run[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const t = item.transform;
        const h = Math.hypot(t[2], t[3]) || item.height || 8;
        runs.push({ str: item.str, x: t[4], y: t[5], w: item.width, h });
      }
      pages.push({
        text: runs.map((r) => r.str).join(" "),
        runs,
        width: viewport.width,
        height: viewport.height,
      });
    }
    await task.destroy();
    return pages;
  } catch {
    return null;
  }
}

/* ────────────────────────────── what to hide ────────────────────────────── */

/** A rectangle in PDF user space to paint over. */
type Box = { x: number; y: number; w: number; h: number };

const starts = (run: Run, label: string) =>
  run.str.replace(/\s+/g, " ").trim().toLowerCase().startsWith(label.toLowerCase());

/**
 * The 1040 header: everything from the "Your first name" row down to the
 * foreign-address row is identity, and nothing the recap reads is there.
 * Returns the band and the value runs inside it.
 */
function headerBand(page: PageInfo): { band: Box; values: Run[] } | null {
  const top = page.runs.find((r) => starts(r, "Your first name"));
  const bottom =
    page.runs.find((r) => starts(r, "Foreign country name")) ??
    page.runs.find((r) => starts(r, "Foreign postal code"));
  if (!top || !bottom) return null;
  const yTop = top.y + top.h * 1.6;
  const yBottom = Math.min(bottom.y, top.y) - top.h * 2.2;
  if (yTop <= yBottom) return null;
  const band: Box = { x: 0, y: yBottom, w: page.width, h: yTop - yBottom };
  const values = page.runs.filter(
    (r) => r.y > yBottom && r.y < yTop && !isLabel(r.str),
  );
  return { band, values };
}

/** Form text is mixed case with lowercase letters; ProSeries prints values in capitals. */
function isLabel(s: string): boolean {
  return /[a-z]/.test(s);
}

/** Schedule C's "Business name" box: the label and the value printed under it. */
function businessNameBand(page: PageInfo): { band: Box; values: Run[] } | null {
  const label = page.runs.find((r) => starts(r, "Business name."));
  if (!label) return null;
  const band: Box = { x: label.x - 4, y: label.y - label.h * 2.4, w: label.w * 1.8 + 8, h: label.h * 3.2 };
  const values = page.runs.filter(
    (r) => inBox(r, band) && !isLabel(r.str) && !/^[\d\s]+$/.test(r.str),
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

function entityHeaderBand(page: PageInfo): { band: Box; values: Run[] } | null {
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
 * Schedule K-1 (1120-S): the corporation's block under item B and the
 * shareholder's under F1. Values are printed on the lines below each label.
 */
function k1Bands(page: PageInfo): { band: Box; values: Run[] }[] {
  const out: { band: Box; values: Run[] }[] = [];
  const labels = [
    page.runs.find((r) => starts(r, "Corporation’s name, address") || starts(r, "Corporation's name, address")),
    page.runs.find((r) => starts(r, "Shareholder’s name, address") || starts(r, "Shareholder's name, address")),
  ];
  for (const label of labels) {
    if (!label) continue;
    const band: Box = { x: label.x - 6, y: label.y - label.h * 5.4, w: Math.max(label.w * 1.6, 220), h: label.h * 5.2 };
    const values = page.runs.filter((r) => inBox(r, band) && !isLabel(r.str));
    out.push({ band, values });
  }
  return out;
}

const inBox = (r: Run, b: Box) =>
  r.x + r.w / 2 >= b.x && r.x + r.w / 2 <= b.x + b.w && r.y >= b.y && r.y <= b.y + b.h;

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
]);

function tokensOf(values: Run[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    for (const word of v.str.toUpperCase().split(/[^A-Z0-9']+/)) {
      const w = word.replace(/'/g, "");
      if (w.length >= 4 && !GENERIC.has(w)) out.add(w);
    }
  }
  return [...out];
}

/** SSNs in the three ways ProSeries prints them, EINs, long digit runs, emails, phones, dates. */
const PATTERNS: RegExp[] = [
  /\b\d{3}[- ]\d{2}[- ]\d{4}\b/,
  /\b\d{2}-\d{7}\b/,
  /\b\d{9,}\b/,
  /\S+@\S+\.\S+/,
  /\(?\d{3}\)?[- ]?\d{3}-\d{4}/,
  /\b\d{2}[-/]\d{2}[-/]\d{4}\b/,
  /\b(?:X ?){9,}\b/,
];

function matchesPattern(s: string): boolean {
  return PATTERNS.some((re) => re.test(s));
}

function matchesToken(s: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const words = s.toUpperCase().split(/[^A-Z0-9']+/).map((w) => w.replace(/'/g, ""));
  return words.some((w) => w.length >= 4 && tokens.includes(w));
}

/** Everything to paint on one page, given the tokens learned from the whole document. */
function boxesFor(page: PageInfo, tokens: string[], bands: Box[]): Box[] {
  const boxes: Box[] = [...bands];
  for (const r of page.runs) {
    if (matchesPattern(r.str) || matchesToken(r.str, tokens)) {
      boxes.push({ x: r.x - 2, y: r.y - r.h * 0.3, w: r.w + 4, h: r.h * 1.4 });
    }
  }
  return boxes;
}

function scrubText(text: string, tokens: string[]): string {
  let out = text;
  for (const re of PATTERNS) out = out.replace(new RegExp(re.source, "g"), "■");
  if (tokens.length) {
    const re = new RegExp(`\\b(?:${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
    out = out.replace(re, "■");
  }
  return out;
}

/* ────────────────────────────── rendering ────────────────────────────── */

/**
 * Render the kept pages, paint the boxes, and assemble an images-only PDF.
 * Returns null if anything in the pipeline fails.
 */
async function renderRedacted(
  bytes: ArrayBuffer,
  keep: number[],
  boxesByPage: Map<number, Box[]>,
): Promise<{ data: Blob; preview: string | null } | null> {
  try {
    const pdfjs = await pdfjsLib();
    const { PDFDocument } = await import("pdf-lib");
    const task = pdfjs.getDocument({ data: bytes.slice(0) });
    const doc = await task.promise;
    const out = await PDFDocument.create();
    let preview: string | null = null;

    for (const p of keep) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      ctx.fillStyle = "#000";
      for (const b of boxesByPage.get(p) ?? []) {
        // PDF space is bottom-up; the viewport maps a corner to canvas pixels.
        const [x0, y0] = viewport.convertToViewportPoint(b.x, b.y + b.h);
        const [x1, y1] = viewport.convertToViewportPoint(b.x + b.w, b.y);
        ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
      );
      if (!blob) throw new Error("no jpeg");
      const jpg = await out.embedJpg(await blob.arrayBuffer());
      const size = page.getViewport({ scale: 1 });
      const pdfPage = out.addPage([size.width, size.height]);
      pdfPage.drawImage(jpg, { x: 0, y: 0, width: size.width, height: size.height });

      if (preview === null) {
        const thumb = document.createElement("canvas");
        thumb.width = PREVIEW_WIDTH;
        thumb.height = Math.round((canvas.height / canvas.width) * PREVIEW_WIDTH);
        thumb.getContext("2d")?.drawImage(canvas, 0, 0, thumb.width, thumb.height);
        preview = thumb.toDataURL("image/jpeg", 0.7);
      }
      canvas.width = 0;
      canvas.height = 0;
    }
    await task.destroy();
    const saved = await out.save();
    return { data: new Blob([saved as BlobPart], { type: "application/pdf" }), preview };
  } catch {
    return null;
  }
}

/** A new PDF holding only `pages` (1-indexed), unredacted — the fallback. */
async function slice(bytes: ArrayBuffer, pages: number[]): Promise<Blob | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const copied = await out.copyPages(
      src,
      pages.map((p) => p - 1),
    );
    for (const page of copied) out.addPage(page);
    const saved = await out.save();
    return new Blob([saved as BlobPart], { type: "application/pdf" });
  } catch {
    return null;
  }
}

/* ────────────────────────────── the pipeline ────────────────────────────── */

/**
 * Read a file once: its kind, pages, and the identity found on them. Cheap
 * enough to run the moment a file is picked, so the builder can say "Form
 * 1040, 44 pages" before anything is sent.
 */
export async function analyzePdf(file: File): Promise<PdfAnalysis> {
  const bytes = await file.arrayBuffer();
  const pages = await readPages(bytes);
  const texts = pages ? pages.map((p) => p.text) : [];
  const kind = pages ? detectReturnKind(texts) : null;

  let name: string | null = null;
  let entityName: string | null = null;
  const tokens = new Set<string>();
  const bands = new Map<number, Box[]>();
  const addBand = (p: number, b: Box) => bands.set(p, [...(bands.get(p) ?? []), b]);

  // Learn the identity from the 1040 header, Schedule C, the 1120-S block
  // and the K-1, wherever they are in the document (not only among the
  // kept pages).
  for (let i = 0; i < (pages?.length ?? 0); i++) {
    const page = (pages as PageInfo[])[i];
    const header = headerBand(page);
    if (header) {
      addBand(i + 1, header.band);
      for (const t of tokensOf(header.values)) tokens.add(t);
      if (name === null) {
        // The top row of the band is the name row; the runs on it, left to
        // right, are first name and last name.
        const rowY = Math.max(...header.values.map((v) => v.y));
        const row = header.values
          .filter((v) => Math.abs(v.y - rowY) < 3 && /^[A-Z][A-Z .'-]*$/.test(v.str.trim()))
          .sort((a, b) => a.x - b.x)
          .map((v) => v.str.trim());
        if (row.length) name = row.join(" ");
      }
    }
    const business = businessNameBand(page);
    if (business) {
      addBand(i + 1, business.band);
      for (const t of tokensOf(business.values)) tokens.add(t);
    }
    const entity = entityHeaderBand(page);
    if (entity) {
      addBand(i + 1, entity.band);
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
    for (const k1 of k1Bands(page)) {
      addBand(i + 1, k1.band);
      for (const t of tokensOf(k1.values)) tokens.add(t);
    }
  }
  // The 540's header prints the first four letters of the surname as a code.
  const last = name?.split(" ").pop();
  if (last && last.length >= 4) tokens.add(last.slice(0, 4).toUpperCase());

  return { file, bytes, pages, texts, kind, name, entityName, tokens: [...tokens], bands };
}

/**
 * Build the outgoing copy. Takes a file or an analysis already made;
 * `extraTokens` are words learned from another return dropped alongside,
 * painted out of this one too. `kind` overrides the detected kind (a scan
 * that couldn't be told apart is read as whatever the builder says it is).
 */
export async function preparePdf(
  input: File | PdfAnalysis,
  opts: { kind?: ReturnKind; extraTokens?: string[] } = {},
): Promise<PreparedPdf> {
  const a = input instanceof File ? await analyzePdf(input) : input;
  const file = a.file;
  const kind = opts.kind ?? a.kind;
  const noIdentity = { name: a.name, entityName: a.entityName, redacted: false, boxes: 0 };
  const whole = (fallback: PreparedPdf["fallback"], pageTexts: string[]): PreparedPdf => ({
    data: file,
    pageTexts,
    pageMap: pageTexts.map((_, i) => i + 1),
    totalPages: pageTexts.length,
    sentPages: pageTexts.length,
    originalBytes: file.size,
    sentBytes: file.size,
    trimmed: null,
    fallback,
    kind,
    identity: noIdentity,
    preview: null,
  });

  if (!a.pages) return whole("no-text-layer", []);
  const texts = a.texts;

  const selection = selectPages(texts, kind ?? "individual");
  if (selection.fallback) return whole(selection.fallback, texts);

  const tokenList = [...new Set([...a.tokens, ...(opts.extraTokens ?? [])])];

  const boxesByPage = new Map<number, Box[]>();
  let boxes = 0;
  for (const p of selection.pages) {
    const list = boxesFor(a.pages[p - 1], tokenList, a.bands.get(p) ?? []);
    boxesByPage.set(p, list);
    boxes += list.length;
  }

  const rendered = await renderRedacted(a.bytes, selection.pages, boxesByPage);
  const summary = selectionSummary(selection, texts);
  const base = {
    pageMap: selection.pages,
    totalPages: texts.length,
    sentPages: selection.pages.length,
    originalBytes: file.size,
    trimmed: { pctPagesDropped: Math.round((1 - summary.kept / summary.total) * 100) },
    kind,
  };

  if (rendered) {
    return {
      ...base,
      data: rendered.data,
      pageTexts: selection.pages.map((p) => scrubText(texts[p - 1] ?? "", tokenList)),
      sentBytes: rendered.data.size,
      fallback: null,
      identity: { name: a.name, entityName: a.entityName, redacted: true, boxes },
      preview: rendered.preview,
    };
  }

  // Rendering failed (an odd PDF, a browser without canvas): fall back to
  // the trimmed but unredacted copy rather than not reading at all.
  const data = await slice(a.bytes, selection.pages);
  if (!data) return whole("slice-failed", texts);
  return {
    ...base,
    data,
    pageTexts: selection.pages.map((p) => texts[p - 1] ?? ""),
    sentBytes: data.size,
    fallback: null,
    identity: { name: a.name, entityName: a.entityName, redacted: false, boxes: 0 },
    preview: null,
  };
}
