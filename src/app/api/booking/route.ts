import { NextRequest, NextResponse } from "next/server";
import {
  CalendlyError,
  createBooking,
  eventTypeForBand,
  eventTypeForKey,
  getAvailableTimes,
  getEventType,
} from "@/lib/calendly";

/**
 * The booking flow's server side. Everything Calendly happens here — the API
 * token is org-scoped and would be a full-org credential in the browser.
 *
 * GET  ?band=<income band> | ?event=<key>  → event type, its questions, its slots
 * POST                                     → creates the booking, returns reschedule/cancel
 *
 * Two ways in, and a caller sends exactly one:
 *
 *   band   — /schedule. The income band picks the event type (see
 *            eventTypeForBand; that rule mirrors a Calendly routing form the
 *            API can't read).
 *   event  — the affiliate pages. A fixed call, no income gate, named by an
 *            allowlisted key. Never a URI: see BOOKABLE_BY_KEY in lib/calendly.
 *
 * Questions come from Calendly on every request, so the client's edits land
 * without a deploy.
 */

export const dynamic = "force-dynamic";

/** Resolves a request to one event type, or explains why it can't. */
function resolveEventType(
  band: string | null | undefined,
  event: string | null | undefined,
): { uri: string } | { error: string } {
  if (event) {
    const uri = eventTypeForKey(event);
    return uri ? { uri } : { error: `Unknown event: ${event}` };
  }
  if (band) return { uri: eventTypeForBand(band) };
  return { error: "band or event is required" };
}

export async function GET(req: NextRequest) {
  const resolved = resolveEventType(
    req.nextUrl.searchParams.get("band"),
    req.nextUrl.searchParams.get("event"),
  );
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  try {
    const { uri } = resolved;
    const [eventType, slots] = await Promise.all([
      getEventType(uri),
      getAvailableTimes(uri),
    ]);
    return NextResponse.json({
      eventType: {
        name: eventType.name,
        duration: eventType.duration,
      },
      questions: eventType.questions,
      slots,
    });
  } catch (e) {
    return errorResponse(e, "Couldn't load available times.");
  }
}

interface BookingRequest {
  band?: string;
  event?: string;
  name?: string;
  email?: string;
  timezone?: string;
  startTime?: string;
  answers?: { question: string; answer: string; position: number }[];
  textReminderNumber?: string;
}

export async function POST(req: NextRequest) {
  let body: BookingRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const {
    band,
    event,
    name,
    email,
    timezone,
    startTime,
    answers,
    textReminderNumber,
  } = body;

  if (!name || !email || !timezone || !startTime) {
    const missing = (["name", "email", "timezone", "startTime"] as const).filter(
      (k) => !body[k],
    );
    return NextResponse.json(
      { error: `Missing: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const resolved = resolveEventType(band, event);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  try {
    const { uri } = resolved;
    // Re-read the event type rather than trusting the client for locationKind:
    // a mismatched kind is rejected by Calendly, and this is one round trip.
    const eventType = await getEventType(uri);

    const booking = await createBooking({
      eventTypeUri: uri,
      startTime,
      name,
      email,
      timezone,
      locationKind: eventType.locationKind,
      answers: Array.isArray(answers) ? answers : [],
      textReminderNumber,
    });

    return NextResponse.json({
      booking,
      eventType: { name: eventType.name, duration: eventType.duration },
    });
  } catch (e) {
    return errorResponse(e, "Couldn't complete your booking.");
  }
}

/**
 * Calendly's 4xx bodies are developer-facing, so they don't go to the visitor.
 * Two cases are worth translating rather than swallowing.
 */
function errorResponse(e: unknown, fallback: string) {
  if (e instanceof CalendlyError) {
    console.error(`[booking] Calendly ${e.status}: ${e.message}`, e.details);

    // A slot lost between load and submit — a normal race on a busy calendar,
    // not the visitor's fault. The client only ever posts times it got from
    // GET, so a start_time complaint here means the slot went away.
    if (e.details.some((d) => d.parameter === "start_time")) {
      return NextResponse.json(
        {
          error: "That time was just booked by someone else. Pick another.",
          code: "slot_taken",
        },
        { status: 409 },
      );
    }

    // Calendly enforces its own required questions. Reaching this means our
    // renderer let a required one through — most likely a question type it
    // doesn't know about, which it degrades to a text field.
    if (/required questions/i.test(e.message)) {
      return NextResponse.json(
        { error: "Please answer all required questions.", code: "answers" },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: fallback }, { status: 502 });
  }

  console.error("[booking] unexpected", e);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
