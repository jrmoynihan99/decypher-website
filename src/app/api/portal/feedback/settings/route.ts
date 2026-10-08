import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { FeedbackStoreError, getSettings, saveSettings } from "@/lib/feedback/store";

/**
 * Team & setup: the dropdown list per role, the founder on at-risk
 * follow-ups, the survey's base URL.
 *
 * GET → { ok, settings }
 * PUT { settings } (or the settings object bare) → { ok, settings }
 *
 * PUT takes the whole object, like the sales options: lists are edited as
 * lists. sanitizeSettings on the way in means a malformed body degrades to
 * the defaults rather than bricking every dropdown.
 */

export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json({ ok: true, settings: await getSettings() });
  } catch (e) {
    console.error("[feedback] couldn't read settings:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t load settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  try {
    const settings = await saveSettings((body as { settings?: unknown })?.settings ?? body, session.email);
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    if (e instanceof FeedbackStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[feedback] couldn't save settings:", e);
    return NextResponse.json({ ok: false, message: "Couldn’t save settings" }, { status: 500 });
  }
}
