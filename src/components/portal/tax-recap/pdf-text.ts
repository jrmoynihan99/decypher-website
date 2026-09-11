/**
 * Per-page text of a PDF, pulled in the browser with pdfjs.
 *
 * This is the verification half of the extraction: the server asks Claude to
 * read the rendered pages, then checks each number it reports against the
 * text of the page it cited. Doing the text pull here rather than on the
 * server keeps pdfjs (and its worker) out of the serverless bundle — the same
 * lazy-import pattern as lib/resume-autofill.ts, for the same reason.
 *
 * Returns null when the PDF can't be read (encrypted, scanned, corrupt): the
 * extraction still runs, it just can't be cross-checked, and the builder says
 * so.
 */
export async function pdfPageTexts(file: File): Promise<string[] | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();

    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await task.promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
    }
    await task.destroy();
    return pages;
  } catch {
    return null;
  }
}
