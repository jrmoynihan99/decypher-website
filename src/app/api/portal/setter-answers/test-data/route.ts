import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { DiscoveryStoreError, deletePracticeCalls } from "@/lib/discovery/store";

/** DELETE clears every practice call — `{ ok, deleted }`. Anyone with the inbox, as with feedback's test data. */
export async function DELETE() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  try {
    const deleted = await deletePracticeCalls();
    console.log(`[setter-answers] ${session.email} cleared ${deleted} practice call${deleted === 1 ? "" : "s"}`);
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    if (e instanceof DiscoveryStoreError) return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    console.error("[setter-answers] clearing practice calls failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t clear practice calls" }, { status: 500 });
  }
}
