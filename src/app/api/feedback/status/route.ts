import { NextResponse } from "next/server";
import { parseSurveyKind } from "@/lib/feedback/links";
import { LIMITS, line, roundOf } from "@/lib/feedback/schema";
import { hasSubmitted } from "@/lib/feedback/store";

/**
 * Has this client already answered the round a link is about?
 *
 * GET ?cid=…|rid=…&s=onb|bk|tax|both&bq=2026-Q4&ty=2025 → { submitted }
 *
 * Public, like the survey. It answers with one boolean and nothing else —
 * never the response, never when — so all a guessed client ID can learn is
 * that someone answered. The survey page itself checks on the server before
 * it renders; this is for anything else that links to the survey (TaxDome,
 * the recap) and wants to know first.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const cid = line(q.get("cid"), LIMITS.clientId) || null;
  const rid = line(q.get("rid"), LIMITS.recapId) || null;
  const round = roundOf(
    parseSurveyKind(q.get("s")),
    line(q.get("bq"), LIMITS.period) || null,
    line(q.get("ty"), LIMITS.period) || null,
  );
  let submitted = false;
  try {
    submitted = await hasSubmitted(cid, rid, round);
  } catch (e) {
    // Fail open: the send itself is the real dedupe, and a 500 here would only
    // stop the survey loading.
    console.error("[feedback] status check failed:", e);
  }
  return NextResponse.json({ submitted }, { headers: { "Cache-Control": "no-store" } });
}
