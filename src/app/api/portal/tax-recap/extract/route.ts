import { NextResponse } from "next/server";
import { gate } from "../_gate";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  TaxRecapExtractError,
  extractReturn,
} from "@/lib/tax-recap/extract";
import {
  TaxRecapUploadError,
  assembleUpload,
  deleteUpload,
  isUploadId,
} from "@/lib/tax-recap/uploads";

/**
 * Read one return. Multipart form data:
 *   kind       "before" | "after"
 *   file       the ProSeries PDF (up to ~4MB)
 *     — or —
 *   uploadId   id of a file staged in pieces via ../upload (up to 24MB)
 *   pageTexts  optional JSON string[] — per-page text pulled by pdfjs in the
 *              browser, used to verify every extracted number against the
 *              page it was cited from
 *
 * One PDF per request rather than both at once: Vercel caps a request body
 * at ~4.5MB and even a text-based client copy can be a couple of MB. The
 * builder fires the two requests in parallel.
 *
 * `maxDuration` is a resource declaration, not a timeout switch: reading a
 * 40-page print is a minute-plus of model time, and the platform default
 * would kill it mid-read.
 */
export const maxDuration = 300;

/** Cap on the page-text payload, in characters — ~40 pages of dense text. */
const PAGE_TEXT_MAX = 600_000;

export async function POST(req: Request) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const kind = form.get("kind");
  if (kind !== "before" && kind !== "after") {
    return NextResponse.json(
      { ok: false, message: "`kind` must be before or after" },
      { status: 400 },
    );
  }

  let pageTexts: string[] | null = null;
  const rawTexts = form.get("pageTexts");
  if (typeof rawTexts === "string" && rawTexts.length <= PAGE_TEXT_MAX) {
    try {
      const parsed: unknown = JSON.parse(rawTexts);
      if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) {
        pageTexts = parsed as string[];
      }
    } catch {
      /* unverifiable, not fatal — the extraction still runs */
    }
  }

  // Either the bytes came in this request, or they were staged in pieces.
  let bytes: Buffer;
  let staged: string | null = null;
  const uploadId = form.get("uploadId");
  if (isUploadId(uploadId)) {
    try {
      bytes = (await assembleUpload(uploadId, session.uid)).bytes;
      staged = uploadId;
    } catch (e) {
      if (e instanceof TaxRecapUploadError) {
        return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
      }
      console.error("[tax-recap] assemble failed:", e);
      return NextResponse.json({ ok: false, message: "Couldn't read the upload" }, { status: 500 });
    }
  } else {
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "Expected a `file` part or an `uploadId`" },
        { status: 400 },
      );
    }
    if (file.size > DIRECT_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, message: "Files over 4MB have to be uploaded in pieces" },
        { status: 400 },
      );
    }
    bytes = Buffer.from(await file.arrayBuffer());
  }

  try {
    const result = await extractReturn(bytes, kind, pageTexts);
    return NextResponse.json({
      ok: true,
      kind,
      pages: pageTexts?.length ?? null,
      ...result,
    });
  } catch (e) {
    if (e instanceof TaxRecapExtractError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error(`[tax-recap] extract (${kind}) failed for ${session.email}:`, e);
    return NextResponse.json(
      { ok: false, message: "Couldn't read that return" },
      { status: 500 },
    );
  } finally {
    // The staged copy is PII with no further use. Gone whether or not the
    // read succeeded; a retry re-uploads.
    if (staged) await deleteUpload(staged);
  }
}
