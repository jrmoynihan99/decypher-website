import { NextResponse } from "next/server";
import { gate } from "./_gate";
import { ToolsHubError, getCatalog, saveCatalog } from "@/lib/tools-hub/store";

/**
 * The shared tool catalog. Access rules live in _gate.ts (shared with the
 * logo routes).
 *
 * PUT takes the whole catalog rather than patching a tool. The editor reorders
 * departments and moves tools between them, both of which are properties of the
 * list and not of a row; per-item writes would just reinvent the array and race
 * each other doing it. sanitizeCatalog on the other side makes a malformed body
 * degrade to something renderable instead of bricking the page.
 */

export async function GET() {
  const session = await gate(false);
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ ok: true, catalog: await getCatalog() });
}

export async function PUT(req: Request) {
  const session = await gate(true);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  try {
    const catalog = await saveCatalog(
      (body as { catalog?: unknown })?.catalog ?? body,
      session.email,
    );
    return NextResponse.json({ ok: true, catalog });
  } catch (e) {
    if (e instanceof ToolsHubError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tools-hub] couldn't save the catalog:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}
