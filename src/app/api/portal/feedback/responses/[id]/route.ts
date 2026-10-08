import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { sanitizeTeamPatch } from "@/lib/feedback/schema";
import { FeedbackStoreError, deleteTestResponse, updateResponseTeam } from "@/lib/feedback/store";

/**
 * One response.
 *
 * PATCH { [teamField]: value } → { ok, response }
 *   Team fields only — the nine roles, brand/legal name, segment, package —
 *   whitelisted by sanitizeTeamPatch. Anything else in the body (a score, the
 *   submitted date) is dropped before the store sees it: what the client said
 *   is locked.
 *
 * DELETE → { ok }
 *   Test responses only, with their follow-ups. A real response can't be
 *   deleted from the portal.
 */

const badId = (id: string) => !id || id.length > 200 || id.includes("/");

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ ok: false, message: "Bad response id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  const patch = sanitizeTeamPatch(body);
  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, message: "No editable fields in the request" }, { status: 400 });
  }

  try {
    const response = await updateResponseTeam(id, patch, session.email);
    return NextResponse.json({ ok: true, response });
  } catch (e) {
    if (e instanceof FeedbackStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[feedback] team update failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t save" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ ok: false, message: "Bad response id" }, { status: 400 });

  try {
    await deleteTestResponse(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FeedbackStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[feedback] delete failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t delete" }, { status: 500 });
  }
}
