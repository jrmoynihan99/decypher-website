import { NextResponse } from "next/server";
import { guard } from "../../_guard";
import { FeedbackStoreError, setTaskStatus } from "@/lib/feedback/store";

/**
 * Mark a follow-up done, or reopen it.
 *
 * PATCH { status: "open" | "done" } → { ok, task }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (!id || id.length > 200 || id.includes("/")) {
    return NextResponse.json({ ok: false, message: "Bad task id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  const status = (body as { status?: unknown } | null)?.status;
  if (status !== "open" && status !== "done") {
    return NextResponse.json({ ok: false, message: "Status must be open or done" }, { status: 400 });
  }

  try {
    const task = await setTaskStatus(id, status, session.email);
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    if (e instanceof FeedbackStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[feedback] task update failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t update the follow-up" }, { status: 500 });
  }
}
