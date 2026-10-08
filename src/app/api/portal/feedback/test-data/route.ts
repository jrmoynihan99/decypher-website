import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { deleteTestData } from "@/lib/feedback/store";

/**
 * Clear every test response (staff previews of the survey) and every test
 * follow-up. Real responses are untouched — the query is `is_test == true`.
 *
 * DELETE → { ok, responses, tasks }  (how many of each went)
 */
export async function DELETE() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  try {
    const counts = await deleteTestData();
    return NextResponse.json({ ok: true, ...counts });
  } catch (e) {
    console.error("[feedback] clearing test data failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t clear test data" }, { status: 500 });
  }
}
