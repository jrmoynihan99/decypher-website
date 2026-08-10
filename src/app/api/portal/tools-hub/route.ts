import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { ToolsHubError, getCatalog, saveCatalog } from "@/lib/tools-hub/store";

/**
 * The shared tool catalog.
 *
 * Two different gates, and the split is the point: everyone with the tab may
 * READ the catalog, but only an admin may write it. The catalog is one document
 * that the whole team's page renders from, so a typo in it is everyone's typo —
 * the same reason the Staff tab is admin-only.
 *
 * PUT takes the whole catalog rather than patching a tool. The editor reorders
 * departments and moves tools between them, both of which are properties of the
 * list and not of a row; per-item writes would just reinvent the array and race
 * each other doing it. sanitizeCatalog on the other side makes a malformed body
 * degrade to something renderable instead of bricking the page.
 *
 * No route handler trusts that the page did the check — these are reachable
 * directly over HTTP.
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
  if (!session.permissions.includes("tools-hub")) {
    return NextResponse.json(
      { ok: false, message: "No access to the tools hub" },
      { status: 403 },
    );
  }
  if (needsAdmin && session.role !== "admin") {
    return NextResponse.json(
      { ok: false, message: "Only admins can edit the tool catalog" },
      { status: 403 },
    );
  }
  return session;
}

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
