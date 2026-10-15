import { NextResponse } from "next/server";
import { guard, actorName } from "./_guard";
import { activeStaffNames } from "@/lib/firebase/users";
import { listCalls } from "@/lib/discovery/store";

/**
 * Every saved discovery call, for the Setter Answers tab's Refresh — the page
 * reads the same thing on the server for first paint — plus the staff
 * roster's names for the advisor dropdowns.
 *
 * GET → { ok, calls, advisors }
 */
export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const me = actorName(session);
  try {
    const [calls, advisors] = await Promise.all([
      listCalls(),
      activeStaffNames(me).catch((e) => {
        console.error("[setter-answers] couldn't list staff names:", e);
        return [me];
      }),
    ]);
    return NextResponse.json({ ok: true, calls, advisors });
  } catch (e) {
    console.error("[setter-answers] couldn't list calls:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t load the calls" }, { status: 500 });
  }
}
