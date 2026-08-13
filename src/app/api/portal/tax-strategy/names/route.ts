import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import {
  ToolNamesError,
  getToolNames,
  saveToolNames,
} from "@/lib/tax-strategy/names";

/**
 * Custom display names for the Tax Strategy tools. Reads need the tab
 * permission; writes are admin-only — one shared vocabulary, same posture
 * as the tools-hub catalog. PUT takes the whole map ({ names: { id: name } });
 * an id absent from the map reverts to the built-in name.
 */
async function gate(needsAdmin: boolean) {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Server missing Firebase credentials" },
      { status: 500 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  }
  if (!session.permissions.includes("tax-strategy")) {
    return NextResponse.json(
      { ok: false, message: "No access to the tax strategy tab" },
      { status: 403 },
    );
  }
  if (needsAdmin && session.role !== "admin") {
    return NextResponse.json(
      { ok: false, message: "Only admins can rename tools" },
      { status: 403 },
    );
  }
  return session;
}

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
