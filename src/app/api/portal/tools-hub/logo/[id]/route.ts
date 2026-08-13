import { NextResponse } from "next/server";
import { gate } from "../../_gate";
import { getLogo } from "@/lib/tools-hub/store";

/**
 * Serve an uploaded tool logo. Read access mirrors the catalog: any session
 * with the tools-hub permission — the browser sends the session cookie with
 * same-origin <img> requests, so the cards just work.
 *
 * The CSP + nosniff headers are the SVG hardening: an <img> never runs an
 * SVG's scripts, but a direct navigation would, and admin-uploaded or not,
 * an image route shouldn't be a script host.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await gate(false);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!/^[a-zA-Z0-9-]{8,60}$/.test(id)) {
    return NextResponse.json({ ok: false, message: "Bad logo id" }, { status: 400 });
  }

  const logo = await getLogo(id);
  if (!logo) {
    return NextResponse.json({ ok: false, message: "No such logo" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      "Content-Length": String(logo.data.length),
      // Content-addressed: an id's bytes never change, so let the browser keep
      // them. `private` — it's behind a session, a shared cache mustn't hold it.
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "Content-Disposition": "inline",
    },
  });
}
