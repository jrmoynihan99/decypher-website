import { NextResponse } from "next/server";
import { markReviewClicked } from "@/lib/feedback/store";

/**
 * The promoter screen's Google review button was tapped. Sent with
 * `keepalive` as the review opens in a new tab, so it's fire-and-forget from
 * the page's side.
 *
 * POST → { ok }  (ok:false when there was nothing to flip)
 *
 * The one field a public caller can write after a send, and only false →
 * true on a response that was shown the ask (lib/feedback/store). The id is a
 * random survey id the client already holds.
 */

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ok = false;
  try {
    ok = await markReviewClicked(id);
  } catch (e) {
    console.error("[feedback] couldn't record a review click:", e);
  }
  return NextResponse.json({ ok });
}
