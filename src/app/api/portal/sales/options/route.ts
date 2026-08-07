import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { SalesConfigError, getOptionsConfig, saveOptionsConfig } from "@/lib/sales/config";

/**
 * The editable dropdown lists. PUT takes the whole config — the editor edits
 * lists as units (reorder is a property of the list, not of a row), so
 * per-item PATCHing would just reinvent the array. sanitizeConfig on the
 * other side makes a malformed body degrade to the defaults rather than
 * brick every dropdown.
 */

export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ ok: true, config: await getOptionsConfig() });
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
    const config = await saveOptionsConfig(
      (body as { config?: unknown })?.config ?? body,
      session.email,
    );
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    if (e instanceof SalesConfigError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[sales] couldn't save options:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}
