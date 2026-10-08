import { NextResponse } from "next/server";
import { gate } from "../../_gate";
import {
  TaxRecapFailureError,
  deleteFailure,
  getFailure,
  updateFailure,
  type FailureStatus,
} from "@/lib/tax-recap/failures-store";

const badId = (id: string) => !id || id.length > 200 || id.includes("/");

/**
 * One failure in full — the extraction, the numbers, the meta, the
 * reasons — as JSON. With `?download=1` it comes as an attachment, which is
 * what `npm run recap:replay` takes.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ ok: false, message: "Bad failure id" }, { status: 400 });
  const failure = await getFailure(id);
  if (!failure) return NextResponse.json({ ok: false, message: "Failure not found" }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download");
  const body = JSON.stringify(failure, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(download
        ? { "Content-Disposition": `attachment; filename="tax-recap-failure-${id}.json"` }
        : {}),
    },
  });
}

/** Status (open / fixed / dismissed) and a staff note. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ ok: false, message: "Bad failure id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  const r = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const edits: { status?: FailureStatus; note?: string } = {};
  if (r.status === "open" || r.status === "fixed" || r.status === "dismissed") edits.status = r.status;
  if (typeof r.note === "string") edits.note = r.note;
  if (!Object.keys(edits).length) {
    return NextResponse.json({ ok: false, message: "Nothing to change" }, { status: 400 });
  }
  try {
    const failure = await updateFailure(id, edits, session.email);
    return NextResponse.json({ ok: true, status: failure.status, note: failure.note });
  } catch (e) {
    if (e instanceof TaxRecapFailureError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 404 });
    }
    console.error("[tax-recap] update failure failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}

/** Remove the record and any kept PDFs. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ ok: false, message: "Bad failure id" }, { status: 400 });
  try {
    await deleteFailure(id);
    console.log(`[tax-recap] ${session.email} deleted failure ${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaxRecapFailureError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 404 });
    }
    console.error("[tax-recap] delete failure failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't delete" }, { status: 500 });
  }
}
