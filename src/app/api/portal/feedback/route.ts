import { NextResponse } from "next/server";
import { guard } from "./_guard";
import { listResponses, listTasks } from "@/lib/feedback/store";

/**
 * Every response and follow-up, for the Client Feedback tab's Refresh. The
 * page reads the same thing on the server for first paint.
 *
 * GET → { ok, responses, tasks }
 */
export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  try {
    const [responses, tasks] = await Promise.all([listResponses(), listTasks()]);
    return NextResponse.json({ ok: true, responses, tasks });
  } catch (e) {
    console.error("[feedback] couldn't list responses:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t load feedback" }, { status: 500 });
  }
}
