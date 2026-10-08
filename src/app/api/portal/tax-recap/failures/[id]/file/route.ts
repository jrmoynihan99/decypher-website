import { NextResponse } from "next/server";
import { gate } from "../../../_gate";
import {
  FAILURE_CHUNK_BYTES,
  FAILURE_FILE_MAX_BYTES,
  TaxRecapFailureError,
  isFailureFileKind,
  keepFileChunks,
  readKeptFile,
} from "@/lib/tax-recap/failures-store";

const badId = (id: string) => !id || id.length > 200 || id.includes("/");

/**
 * Keep a redacted return with a failure, in pieces. Multipart, the same
 * protocol as ../../upload:
 *   kind       after | entity | before
 *   total      how many pieces the whole file is
 *   size       the file's byte length
 *   name       the file name
 *   pages      pages in the kept copy (optional)
 *   chunk-<n>  one or more pieces, each ≤ FAILURE_CHUNK_BYTES
 *
 * What arrives is the copy that left the browser for the reader — trimmed
 * and painted over — never the original, and it is swept after KEEP_DAYS.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ ok: false, message: "Bad failure id" }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Expected multipart form data" }, { status: 400 });
  }
  const kind = form.get("kind");
  if (!isFailureFileKind(kind)) {
    return NextResponse.json({ ok: false, message: "`kind` must be after, entity or before" }, { status: 400 });
  }
  const total = Number(form.get("total"));
  const size = Number(form.get("size"));
  if (!Number.isInteger(total) || total < 1 || total > Math.ceil(FAILURE_FILE_MAX_BYTES / FAILURE_CHUNK_BYTES)) {
    return NextResponse.json({ ok: false, message: "Bad piece count" }, { status: 400 });
  }
  if (!Number.isInteger(size) || size < 1 || size > FAILURE_FILE_MAX_BYTES) {
    return NextResponse.json({ ok: false, message: "PDF must be under 24MB" }, { status: 400 });
  }
  const rawName = form.get("name");
  const name = typeof rawName === "string" ? rawName.slice(0, 200) : `${kind}.pdf`;
  const rawPages = Number(form.get("pages"));
  const pages = Number.isInteger(rawPages) && rawPages > 0 ? rawPages : null;

  const parts: { index: number; bytes: Buffer }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("chunk-") || !(value instanceof File)) continue;
    const index = Number(key.slice("chunk-".length));
    if (!Number.isInteger(index) || index < 0 || index >= total) {
      return NextResponse.json({ ok: false, message: `Bad piece index ${key}` }, { status: 400 });
    }
    if (value.size < 1 || value.size > FAILURE_CHUNK_BYTES) {
      return NextResponse.json({ ok: false, message: `Piece ${index} is the wrong size` }, { status: 400 });
    }
    parts.push({ index, bytes: Buffer.from(await value.arrayBuffer()) });
  }
  if (!parts.length) return NextResponse.json({ ok: false, message: "No pieces in the request" }, { status: 400 });

  try {
    const kept = await keepFileChunks(id, kind, { total, size, name, pages }, parts, session.email);
    return NextResponse.json({ ok: true, received: parts.length, expiresAt: kept.expiresAt });
  } catch (e) {
    if (e instanceof TaxRecapFailureError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-recap] keep file failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't store that piece" }, { status: 500 });
  }
}

/** Download a kept copy: ?kind=after | entity | before. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ ok: false, message: "Bad failure id" }, { status: 400 });
  const kind = new URL(req.url).searchParams.get("kind");
  if (!isFailureFileKind(kind)) {
    return NextResponse.json({ ok: false, message: "`kind` must be after, entity or before" }, { status: 400 });
  }
  try {
    const file = await readKeptFile(id, kind);
    if (!file) return NextResponse.json({ ok: false, message: "No kept copy — it was never kept, or has expired" }, { status: 404 });
    const safe = file.name.replace(/[^\w.() -]+/g, "_");
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safe || `${kind}.pdf`}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof TaxRecapFailureError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 409 });
    }
    console.error("[tax-recap] read kept file failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't read the kept copy" }, { status: 500 });
  }
}
