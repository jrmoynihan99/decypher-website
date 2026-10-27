import { NextResponse } from "next/server";
import { gate } from "../../../_gate";
import {
  FAILURE_CHUNK_BYTES,
  FAILURE_FILE_MAX_BYTES,
  MAX_ORIGINALS,
  TaxRecapFailureError,
  getFailure,
  keepOriginalChunks,
  readOriginal,
} from "@/lib/tax-recap/failures-store";
import { storedZip } from "@/lib/zip";

const badId = (id: string) => !id || id.length > 200 || id.includes("/");

/**
 * Keep one of the files staff dropped, unchanged, with a refused return, in
 * pieces. Multipart, the same protocol as ../file:
 *   index      the file's place among the ones dropped (0, 1, …)
 *   total      how many pieces the whole file is
 *   size       the file's byte length
 *   name       the file name
 *   chunk-<n>  one or more pieces, each ≤ FAILURE_CHUNK_BYTES
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
  const index = Number(form.get("index"));
  if (!Number.isInteger(index) || index < 0 || index >= MAX_ORIGINALS) {
    return NextResponse.json({ ok: false, message: "Bad file index" }, { status: 400 });
  }
  const total = Number(form.get("total"));
  const size = Number(form.get("size"));
  if (!Number.isInteger(total) || total < 1 || total > Math.ceil(FAILURE_FILE_MAX_BYTES / FAILURE_CHUNK_BYTES)) {
    return NextResponse.json({ ok: false, message: "Bad piece count" }, { status: 400 });
  }
  if (!Number.isInteger(size) || size < 1 || size > FAILURE_FILE_MAX_BYTES) {
    return NextResponse.json({ ok: false, message: "PDF must be under 48MB" }, { status: 400 });
  }
  const rawName = form.get("name");
  const name = typeof rawName === "string" && rawName.trim() ? rawName.slice(0, 200) : `file-${index + 1}.pdf`;

  const parts: { index: number; bytes: Buffer }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("chunk-") || !(value instanceof File)) continue;
    const n = Number(key.slice("chunk-".length));
    if (!Number.isInteger(n) || n < 0 || n >= total) {
      return NextResponse.json({ ok: false, message: `Bad piece index ${key}` }, { status: 400 });
    }
    if (value.size < 1 || value.size > FAILURE_CHUNK_BYTES) {
      return NextResponse.json({ ok: false, message: `Piece ${n} is the wrong size` }, { status: 400 });
    }
    parts.push({ index: n, bytes: Buffer.from(await value.arrayBuffer()) });
  }
  if (!parts.length) return NextResponse.json({ ok: false, message: "No pieces in the request" }, { status: 400 });

  try {
    await keepOriginalChunks(id, index, { total, size, name }, parts, session.email);
    return NextResponse.json({ ok: true, received: parts.length });
  } catch (e) {
    if (e instanceof TaxRecapFailureError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-recap] keep original failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't store that piece" }, { status: 500 });
  }
}

const safeName = (s: string) => s.replace(/[^\w.() -]+/g, "_").trim();

/**
 * Download the originals: every one as a zip, or ?index=n for one file.
 * Streamed, so a 20MB scan isn't held to Vercel's 4.5MB response cap.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ ok: false, message: "Bad failure id" }, { status: 400 });
  const failure = await getFailure(id);
  if (!failure) return NextResponse.json({ ok: false, message: "Failure not found" }, { status: 404 });
  if (!failure.originals.length) {
    return NextResponse.json({ ok: false, message: "No original files were kept with this refusal" }, { status: 404 });
  }

  const one = new URL(req.url).searchParams.get("index");
  const headers = (fileName: string, type: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "private, no-store",
  });

  if (one !== null) {
    try {
      const file = await readOriginal(id, Number(one));
      if (!file) return NextResponse.json({ ok: false, message: "No such file" }, { status: 404 });
      const bytes = file.bytes;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 1 << 20) controller.enqueue(new Uint8Array(bytes.subarray(i, i + (1 << 20))));
          controller.close();
        },
      });
      return new Response(stream, { headers: headers(safeName(file.name) || "return.pdf", "application/pdf") });
    } catch (e) {
      if (e instanceof TaxRecapFailureError) return NextResponse.json({ ok: false, message: e.message }, { status: 409 });
      console.error("[tax-recap] read original failed:", e);
      return NextResponse.json({ ok: false, message: "Couldn't read the file" }, { status: 500 });
    }
  }

  // Each file is read and checked before the response starts, so a missing
  // piece is an error the browser sees rather than a broken zip.
  const files: { name: string; bytes: Buffer }[] = [];
  try {
    for (const o of failure.originals) {
      const file = await readOriginal(id, o.index);
      if (file) files.push(file);
    }
  } catch (e) {
    if (e instanceof TaxRecapFailureError) return NextResponse.json({ ok: false, message: e.message }, { status: 409 });
    console.error("[tax-recap] read originals failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't read the files" }, { status: 500 });
  }
  if (!files.length) return NextResponse.json({ ok: false, message: "No original files left" }, { status: 404 });

  const zip = storedZip();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of files) for (const part of zip.entry(f.name, f.bytes)) controller.enqueue(new Uint8Array(part));
      controller.enqueue(new Uint8Array(zip.end()));
      controller.close();
    },
  });
  const label = safeName(`${failure.clientName || "Refused return"} ${failure.meta.taxYear ?? ""}`.trim()) || "refused-return";
  console.log(`[tax-recap] ${session.email} downloaded ${files.length} original file(s) of failure ${id}`);
  return new Response(stream, { headers: headers(`${label} - original files.zip`, "application/zip") });
}
