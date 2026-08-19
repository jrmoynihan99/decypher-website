import { NextResponse } from "next/server";
import { guard } from "../_guard";
import {
  ApplicationConfigError,
  getApplicationOptions,
  saveApplicationOptions,
} from "@/lib/applications/config";

/**
 * The tracker's editable lists — roles, fit, offer, outcome.
 *
 * PUT takes the whole config: the editor edits lists as units (reorder is a
 * property of the list, not of a row), so per-item PATCHing would just
 * reinvent the array. sanitizeApplicationOptions on the other side makes a
 * malformed body degrade to the defaults rather than brick every dropdown.
 *
 * Sits at /options next to the [id] route above it. Next resolves static
 * segments before dynamic ones, so this wins — and Firestore auto-ids are
 * 20-character strings, so no application can be shadowed by it.
 */

export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ ok: true, config: await getApplicationOptions() });
}

export async function PUT(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  try {
    const config = await saveApplicationOptions(
      (body as { config?: unknown })?.config ?? body,
      session.email,
    );
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    if (e instanceof ApplicationConfigError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[applications] couldn't save options:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}
