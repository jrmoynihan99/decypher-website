import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { callTypeForEventType, toInviteeRecord } from "@/lib/calendly";
import { upsertFromCalendly } from "@/lib/sales/store";

/**
 * Calendly → the sales pipeline. This is how a booked call becomes a row.
 *
 * Registered once against the organisation with scripts/calendly-webhook.mjs,
 * which prints the signing key exactly once — Calendly never shows it again.
 *
 * Coexists with whatever currently feeds the client's Airtable. Calendly scopes
 * webhook subscriptions to the OAuth client that created them, so an existing
 * Zapier or Make integration is invisible to our token and unaffected by ours;
 * both fire during the changeover, which is what makes a safe cutover possible.
 *
 * Deliberately outside /api/portal: Calendly is not signed in. The signature
 * below is the entire authentication, so it is checked before the body is
 * parsed and before anything is written.
 */

/** Calendly retries on non-2xx, so only a genuinely retryable failure may 5xx. */
const OK = NextResponse.json({ ok: true });

/**
 * Verify `Calendly-Webhook-Signature: t=<unix>,v1=<hex>`.
 *
 * The signed payload is `${t}.${rawBody}` — the RAW body, which is why this
 * route reads text() and parses afterwards. Re-serialising parsed JSON changes
 * key order and whitespace and the signature would never match again.
 *
 * The timestamp window is what stops a replay: a captured-and-resent request
 * carries a valid signature forever otherwise.
 */
const TOLERANCE_MS = 3 * 60 * 1000;

function verify(header: string | null, rawBody: string, key: string, now: number): boolean {
  if (!header) return false;

  let t: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const [k, value] = part.split("=", 2);
    if (k?.trim() === "t") t = value?.trim();
    if (k?.trim() === "v1") v1 = value?.trim();
  }
  if (!t || !v1) return false;

  const stamp = Number(t) * 1000;
  if (!Number.isFinite(stamp) || Math.abs(now - stamp) > TOLERANCE_MS) return false;

  const expected = createHmac("sha256", key).update(`${t}.${rawBody}`).digest("hex");
  // Compare as bytes of equal length; timingSafeEqual throws on a mismatch.
  if (expected.length !== v1.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(v1, "utf8"));
}

export async function POST(req: Request) {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key) {
    // Unset must not read as "no check needed" — that would make this endpoint
    // a world-writable path into the pipeline. Same posture as api/cron.
    console.error("[calendly-webhook] CALENDLY_WEBHOOK_SIGNING_KEY is not set");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const raw = await req.text();
  if (!verify(req.headers.get("calendly-webhook-signature"), raw, key, Date.now())) {
    return NextResponse.json({ ok: false, message: "Bad signature" }, { status: 401 });
  }

  let event: {
    event?: string;
    payload?: Record<string, unknown> & { scheduled_event?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    // Signed but unparseable: retrying won't help.
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const kind = event.event;
  if (kind !== "invitee.created" && kind !== "invitee.canceled") return OK;

  const payload = event.payload;
  const scheduled = payload?.scheduled_event as
    | { uri?: string; event_type?: string; name?: string; start_time?: string; status?: string }
    | undefined;
  if (!payload || !scheduled) return OK;

  // The org's other ~38 event types are client delivery, not pipeline. Dropping
  // them here is what keeps the tab clean, and a 200 tells Calendly not to retry
  // something we're ignoring on purpose.
  const callType = callTypeForEventType(scheduled.event_type);
  if (!callType) return OK;

  try {
    const invitee = toInviteeRecord(
      payload as unknown as Parameters<typeof toInviteeRecord>[0],
    );
    await upsertFromCalendly({
      inviteeId: invitee.id,
      callType,
      callName: scheduled.name ?? "",
      name: invitee.name,
      email: invitee.email,
      timezone: invitee.timezone,
      textReminderNumber: invitee.textReminderNumber,
      bookedAt: invitee.createdAt,
      scheduledAt: scheduled.start_time ?? invitee.createdAt,
      // A cancellation arrives as invitee.canceled with the invitee's own status
      // sometimes still "active", so the event kind is the authority here.
      status: kind === "invitee.canceled" ? "canceled" : invitee.status,
      rescheduled: invitee.rescheduled,
      answers: invitee.answers,
    });
  } catch (e) {
    // 500 so Calendly retries — a dropped booking is invisible until someone
    // notices a lead was never followed up.
    console.error("[calendly-webhook] couldn't record booking:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return OK;
}
