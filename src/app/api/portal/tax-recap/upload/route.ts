import { NextResponse } from "next/server";
import { gate } from "../_gate";
import {
  TaxRecapUploadError,
  UPLOAD_CHUNK_BYTES,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_CHUNKS,
  isUploadId,
  saveUploadChunks,
  sweepStaleUploads,
} from "@/lib/tax-recap/uploads";

/**
 * One batch of pieces of an oversized PDF. Multipart:
 *   uploadId   v4 UUID the browser minted for this file
 *   total      how many pieces the whole file is
 *   size       the file's byte length
 *   name       the file name (for the log line)
 *   chunk-<n>  one or more pieces, each ≤ UPLOAD_CHUNK_BYTES
 *
 * The extract route takes the same uploadId in place of `file`, reassembles
 * the pieces, and deletes them.
 */
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

  const uploadId = form.get("uploadId");
  if (!isUploadId(uploadId)) {
    return NextResponse.json({ ok: false, message: "Bad upload id" }, { status: 400 });
  }
  const total = Number(form.get("total"));
  const size = Number(form.get("size"));
  if (!Number.isInteger(total) || total < 1 || total > UPLOAD_MAX_CHUNKS) {
    return NextResponse.json({ ok: false, message: "Bad piece count" }, { status: 400 });
  }
  if (!Number.isInteger(size) || size < 1 || size > UPLOAD_MAX_BYTES) {
    return NextResponse.json({ ok: false, message: "PDF must be under 24MB" }, { status: 400 });
  }
  const rawName = form.get("name");
  const name = typeof rawName === "string" ? rawName.slice(0, 200) : "";

  const parts: { index: number; bytes: Buffer }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("chunk-") || !(value instanceof File)) continue;
    const index = Number(key.slice("chunk-".length));
    if (!Number.isInteger(index) || index < 0 || index >= total) {
      return NextResponse.json({ ok: false, message: `Bad piece index ${key}` }, { status: 400 });
    }
    if (value.size < 1 || value.size > UPLOAD_CHUNK_BYTES) {
      return NextResponse.json({ ok: false, message: `Piece ${index} is the wrong size` }, { status: 400 });
    }
    parts.push({ index, bytes: Buffer.from(await value.arrayBuffer()) });
  }
  if (!parts.length) {
    return NextResponse.json({ ok: false, message: "No pieces in the request" }, { status: 400 });
  }

  try {
    // The first batch of a file is a good moment to clear out old leftovers.
    if (parts.some((p) => p.index === 0)) await sweepStaleUploads();
    await saveUploadChunks(uploadId, session.uid, { total, size, name }, parts);
    return NextResponse.json({ ok: true, received: parts.length });
  } catch (e) {
    if (e instanceof TaxRecapUploadError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-recap] chunk upload failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't store that piece" }, { status: 500 });
  }
}
