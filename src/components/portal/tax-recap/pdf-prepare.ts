import {
  detectEntityForm,
  detectReturnKind,
  isGarbledText,
  noTextLayer,
  textLayerUnusable,
  selectPages,
  selectionSummary,
  type PageSelection,
  type ReturnKind,
} from "@/lib/tax-recap/pages";
import {
  imageBoxes,
  learnIdentity,
  pageFromTextContent,
  redactPage,
  type Box,
  type PageInfo,
} from "@/lib/tax-recap/redact";

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
 * What gets painted is decided in `lib/tax-recap/redact.ts` (pure, and
 * proven against real prints by `npm run recap:redact-check`): the identity
 * bands, the values under every name and address label, SSNs/EINs and other
 * patterns, numbers set a digit per box, every word in a data font on a
 * garbled page — and here, every small image (a state form's 2D barcode,
 * which encodes the whole return, and the e-signatures).
 *
 * The outgoing PDF is images only — no text layer — so nothing painted over
 * survives underneath, and the page text handed to the server for the
 * cross-check is scrubbed with the same tokens.
 *
 * NOTHING LEAVES UNREDACTED. A print whose identity can't be found — a scan
 * or a print saved as pictures (no text to find it in), a print whose text
 * layer is scrambled throughout (re-saved through another program instead
 * of downloaded from ProSeries), a print on which no name or identity block
 * could be found at all — or a copy that couldn't be rendered comes back
 * `blocked`, with the reason staff see, and the builder refuses to send it.
 * Until 2026-10 those went whole and as printed with a warning after the
 * fact; so did every print under 14 pages, whose trim was skipped and its
 * redaction with it.
 */

export type PreparedPdf = {
  /** What to upload: the redacted copy. Empty when `blocked`. */
  data: Blob;
  /** Text of the pages being sent, in send order, identity tokens scrubbed. */
  pageTexts: string[];
  /** pageMap[i] is the original 1-indexed page of sent page i + 1. */
  pageMap: number[];
  totalPages: number;
  sentPages: number;
  originalBytes: number;
  sentBytes: number;
  /** Null when every page is going; otherwise how much the trim dropped. */
  trimmed: { pctPagesDropped: number } | null;
  /** Set when trimming was skipped (every page goes, redacted), for the reviewer-facing note. */
  fallback: PageSelection["fallback"];
  /** Which return this is, from its own pages; null when it couldn't be told. */
  kind: ReturnKind | null;
  /** Original page numbers of the sent pages whose text layer is garbled (every word on them painted out). */
  garbledPages: number[];
  /** What the redaction found and did. */
  identity: {
    /** The client's name as printed on the 1040, read locally; never sent. */
    name: string | null;
    /** The corporation's name as printed on the 1120-S, read locally; never sent. */
    entityName: string | null;
    /** True when the outgoing pages had identity fields painted over (always, unless blocked). */
    redacted: boolean;
    boxes: number;
    /** True when a data font was identified, so garbled pages could have their words painted out. */
    dataFontFound: boolean;
  };
  /** Why this print can't be sent, in words for staff; null when it can. */
  blocked: string | null;
  /** A small JPEG data URL of the first outgoing page, so staff can see what leaves. */
  preview: string | null;
};

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
  /** For an entity return: which federal form it is, when its pages say. */
  entityForm: "1120-S" | "1065" | null;
  name: string | null;
  entityName: string | null;
  tokens: string[];
  /** Three-letter words of the names, painted where set in a data font. */
  shortTokens: string[];
  bands: Map<number, Box[]>;
  /** The nine digits of every SSN and EIN printed in full. */
  knownIds: string[];
  /** Per page: whether its text layer is garbled (pages.ts `isGarbledText`). */
  garbled: boolean[];
  /**
   * True when every page's text is garbled (pages.ts `textLayerUnusable`):
   * the print was re-saved through another program, and nothing on it can
   * be found or painted out. Such a print is blocked.
   */
  unreadable: boolean;
  /** The fonts the identity was printed in anywhere in the print — ProSeries' data fonts as learned. */
  valueFonts: string[];
  /** The learned data fonts plus every Courier-shaped font: what values are set in. */
  dataFonts: string[];
  /** Per page: how many filled-in amounts it carries in those fonts (identity numbers don't count). */
  valueCounts: number[];
  /** Per page: how many numbers of any size are filled in on it (redact.ts `filledCounts`). */
  filledCounts: number[];
};

/** Render scale: a letter page at 1.8 is ~1100×1430px, which the model reads well. */
const SCALE = 1.8;
const JPEG_QUALITY = 0.78;
const PREVIEW_WIDTH = 280;

/** Every refusal ends the same way: what staff should upload instead. */
const EXPORT_IT = "Download the return straight from ProSeries and upload that file instead.";

/**
 * Why a picked file can't be sent, before anything is read — shown on its
 * card the moment it's dropped. Null when it can be redacted.
 */
export function redactionBlock(a: PdfAnalysis): string | null {
  if (!a.pages) return "This PDF couldn't be opened, so it can't be redacted or read.";
  if (noTextLayer(a.texts)) {
    return `This PDF is a scan or a picture of the return: there's no text in it to find the client's name and SSN by, so they can't be painted out and it won't be sent. ${EXPORT_IT}`;
  }
  if (a.unreadable) {
    return `This PDF's text is scrambled on every page — it was re-saved or printed through another program (a copy downloaded from TaxDome does this), not downloaded from ProSeries — so the client's name and SSN can't be found to paint out, and it won't be sent. ${EXPORT_IT}`;
  }
  return null;
}

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
      pages.push(pageFromTextContent(await page.getTextContent(), viewport.width, viewport.height));
    }
    await task.destroy();
    return pages;
  } catch {
    return null;
  }
}

/* ────────────────────────────── rendering ────────────────────────────── */

/**
 * Render the kept pages, paint the boxes and every small image, and
 * assemble an images-only PDF. Returns null if anything in the pipeline
 * fails — and then nothing is sent.
 */
async function renderRedacted(
  bytes: ArrayBuffer,
  keep: number[],
  boxesByPage: Map<number, Box[]>,
): Promise<{ data: Blob; preview: string | null; images: number } | null> {
  try {
    const pdfjs = await pdfjsLib();
    const { PDFDocument } = await import("pdf-lib");
    const task = pdfjs.getDocument({ data: bytes.slice(0) });
    const doc = await task.promise;
    const out = await PDFDocument.create();
    const { OPS } = pdfjs;
    const imageOps = {
      save: OPS.save,
      restore: OPS.restore,
      transform: OPS.transform,
      paintFormXObjectBegin: OPS.paintFormXObjectBegin,
      paintFormXObjectEnd: OPS.paintFormXObjectEnd,
      images: [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat],
    };
    let preview: string | null = null;
    let images = 0;

    for (const p of keep) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: SCALE });
      const size = page.getViewport({ scale: 1 });
      const pictures = imageBoxes(await page.getOperatorList(), imageOps, size.width * size.height);
      images += pictures.length;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      ctx.fillStyle = "#000";
      for (const b of [...(boxesByPage.get(p) ?? []), ...pictures]) {
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
    return { data: new Blob([saved as BlobPart], { type: "application/pdf" }), preview, images };
  } catch {
    return null;
  }
}

/* ────────────────────────────── the pipeline ────────────────────────────── */

/**
 * Read a file once: its kind, pages, and the identity found on them. Cheap
 * enough to run the moment a file is picked, so the builder can say "Form
 * 1040, 44 pages" — or that it can't be sent — before anything leaves.
 */
export async function analyzePdf(file: File): Promise<PdfAnalysis> {
  const bytes = await file.arrayBuffer();
  const pages = await readPages(bytes);
  const texts = pages ? pages.map((p) => p.text) : [];
  // The pages say what the return is; when they can't (a scan, a text layer
  // scrambled throughout), the file's name is asked.
  const kind = pages ? detectReturnKind(texts, file.name) : null;
  const id = learnIdentity(pages ?? []);
  const entityForm = kind === "entity" ? detectEntityForm(texts, file.name) : null;

  return {
    file,
    bytes,
    pages,
    texts,
    kind,
    entityForm,
    name: id.name,
    entityName: id.entityName,
    tokens: id.tokens,
    shortTokens: id.shortTokens,
    bands: id.bands,
    knownIds: id.knownIds,
    garbled: texts.map(isGarbledText),
    // Scrambled throughout: nothing on this print can be found or painted out.
    unreadable: textLayerUnusable(texts),
    valueFonts: [...id.valueFonts],
    dataFonts: [...id.dataFonts],
    valueCounts: id.valueCounts,
    filledCounts: id.filledCounts,
  };
}

/**
 * Build the outgoing copy. Takes a file or an analysis already made;
 * `extraTokens` are words learned from another return dropped alongside,
 * painted out of this one too. `kind` overrides the detected kind (a print
 * that couldn't be told apart is read as whatever the builder says it is).
 * `onlyPages` sends just those pages (1-indexed, as printed) instead of the
 * selection — the Schedule 1 re-read — redacted the same way.
 */
export async function preparePdf(
  input: File | PdfAnalysis,
  opts: { kind?: ReturnKind; extraTokens?: string[]; extraShortTokens?: string[]; onlyPages?: number[] } = {},
): Promise<PreparedPdf> {
  const a = input instanceof File ? await analyzePdf(input) : input;
  const file = a.file;
  const kind = opts.kind ?? a.kind;
  const dataFontFound = a.dataFonts.length > 0;
  const refuse = (blocked: string): PreparedPdf => ({
    data: new Blob([], { type: "application/pdf" }),
    pageTexts: [],
    pageMap: [],
    totalPages: a.texts.length,
    sentPages: 0,
    originalBytes: file.size,
    sentBytes: 0,
    trimmed: null,
    fallback: null,
    kind,
    garbledPages: [],
    identity: { name: a.name, entityName: a.entityName, redacted: false, boxes: 0, dataFontFound },
    blocked,
    preview: null,
  });

  const unsendable = redactionBlock(a);
  if (unsendable || !a.pages) return refuse(unsendable ?? "This PDF couldn't be opened.");
  const texts = a.texts;
  const tokenList = [...new Set([...a.tokens, ...(opts.extraTokens ?? [])])];
  const shortTokens = [...new Set([...a.shortTokens, ...(opts.extraShortTokens ?? [])])];
  // Nothing about the client was found to paint: no identity block, no
  // name under a name label, nothing handed over from another return.
  if (!tokenList.length && !a.bands.size) {
    return refuse(
      `The client's name and identity block couldn't be found on this print, so there's nothing to paint them out by, and it won't be sent. ${EXPORT_IT}`,
    );
  }

  // The amount counts mean something once a data font is known; with none,
  // every garbled page is sent. A selection that falls back sends every
  // page — redacted all the same.
  const selection = selectPages(
    texts,
    kind ?? "individual",
    dataFontFound ? a.valueCounts : null,
    dataFontFound ? a.filledCounts : null,
  );
  const only = (opts.onlyPages ?? []).filter((p) => Number.isInteger(p) && p >= 1 && p <= texts.length);
  const pages = only.length ? [...new Set(only)].sort((x, y) => x - y) : selection.fallback ? texts.map((_, i) => i + 1) : selection.pages;
  const dataFonts = new Set(a.dataFonts);

  const boxesByPage = new Map<number, Box[]>();
  const textByPage = new Map<number, string>();
  let boxes = 0;
  for (const p of pages) {
    const r = redactPage(a.pages[p - 1], {
      tokens: tokenList,
      shortTokens,
      bands: a.bands.get(p) ?? [],
      garbled: a.garbled[p - 1],
      dataFonts,
      knownIds: a.knownIds,
    });
    boxesByPage.set(p, r.boxes);
    textByPage.set(p, r.text);
    boxes += r.boxes.length;
  }

  const rendered = await renderRedacted(a.bytes, pages, boxesByPage);
  if (!rendered) {
    return refuse("The redacted copy couldn't be made in this browser, so nothing was sent. Try again, or in Chrome.");
  }
  const summary = selectionSummary({ pages, fallback: selection.fallback }, texts);
  return {
    data: rendered.data,
    pageTexts: pages.map((p) => textByPage.get(p) ?? ""),
    pageMap: pages,
    totalPages: texts.length,
    sentPages: pages.length,
    originalBytes: file.size,
    sentBytes: rendered.data.size,
    trimmed: selection.fallback ? null : { pctPagesDropped: Math.round((1 - summary.kept / summary.total) * 100) },
    fallback: selection.fallback,
    kind,
    garbledPages: pages.filter((p) => a.garbled[p - 1]),
    identity: { name: a.name, entityName: a.entityName, redacted: true, boxes: boxes + rendered.images, dataFontFound },
    blocked: null,
    preview: rendered.preview,
  };
}
