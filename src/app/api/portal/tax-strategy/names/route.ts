import { NextResponse } from "next/server";
import {
  ToolNamesError,
  getToolNames,
  saveToolNames,
} from "@/lib/tax-strategy/names";
import { gate } from "../_gate";

/**
 * Custom display names for the Tax Strategy tools. Reads need the tab
 * permission; writes are admin-only — one shared vocabulary, same posture
 * as the tools-hub catalog. PUT takes the whole map ({ names: { id: name } });
 * an id absent from the map reverts to the built-in name.
 */

export async function GET() {
  const session = await gate(false);
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ ok: true, names: await getToolNames() });
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
    const names = await saveToolNames(
      (body as { names?: unknown })?.names ?? body,
      session.email,
    );
    return NextResponse.json({ ok: true, names });
  } catch (e) {
    if (e instanceof ToolNamesError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-strategy] couldn't save tool names:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}
