import { selectPages, selectionSummary, type PageSelection } from "@/lib/tax-recap/pages";

/**
 * Turn a return PDF into what actually gets sent: its per-page text, and a
 * copy trimmed to the pages the recap reads.
 *
 * Both halves run in the browser, and both libraries are lazy-imported so a
 * staff member who never opens this tool never downloads them. pdfjs reads
 * the text (which decides the selection and later verifies the extraction);
 * pdf-lib builds the trimmed copy.
 *
 * Doing it here rather than on the server is what makes the upload smaller
 * too, which usually keeps a return under the request-body cap and out of
 * the chunked path entirely.
 *
 * Nothing here is allowed to fail the read. Every error path falls back to
 * sending the original file whole, because a return that costs more to read
 * beats a return that can't be read.
 */

export type PreparedPdf = {
  /** What to upload: the trimmed copy, or the original when not filtered. */
  data: Blob;
  /** Text of the pages being sent, in send order. */
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
};

/** Per-page text via pdfjs. Null when the PDF can't be read at all. */
async function pageTextsOf(bytes: ArrayBuffer): Promise<string[] | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    // The buffer is transferred to the worker, so hand over a copy — the
    // slicing step below still needs the original bytes.
    const task = pdfjs.getDocument({ data: bytes.slice(0) });
    const doc = await task.promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    await task.destroy();
    return pages;
  } catch {
    return null;
  }
}

/** A new PDF holding only `pages` (1-indexed), or null if it can't be built. */
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

export async function preparePdf(file: File): Promise<PreparedPdf> {
  const bytes = await file.arrayBuffer();
  const whole = (
    fallback: PreparedPdf["fallback"],
    pageTexts: string[],
  ): PreparedPdf => ({
    data: file,
    pageTexts,
    pageMap: pageTexts.map((_, i) => i + 1),
    totalPages: pageTexts.length,
    sentPages: pageTexts.length,
    originalBytes: file.size,
    sentBytes: file.size,
    trimmed: null,
    fallback,
  });

  const texts = await pageTextsOf(bytes);
  if (!texts) return whole("no-text-layer", []);

  const selection = selectPages(texts);
  if (selection.fallback) return whole(selection.fallback, texts);

  const data = await slice(bytes, selection.pages);
  if (!data) return whole("slice-failed", texts);

  const summary = selectionSummary(selection, texts);
  return {
    data,
    pageTexts: selection.pages.map((p) => texts[p - 1] ?? ""),
    pageMap: selection.pages,
    totalPages: texts.length,
    sentPages: selection.pages.length,
    originalBytes: file.size,
    sentBytes: data.size,
    trimmed: {
      pctPagesDropped: Math.round((1 - summary.kept / summary.total) * 100),
    },
    fallback: null,
  };
}
