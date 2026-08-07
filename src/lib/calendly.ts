/**
 * Calendly Scheduling API — server only. CALENDLY_API_TOKEN is an org-scoped
 * credential that must never reach the browser; everything here is called from
 * route handlers, never imported into a client component.
 *
 * Payload shapes below were verified against the live API rather than the docs.
 * That matters: Calendly silently ignores unknown request fields, so a wrong
 * guess doesn't error — it books successfully with the answers dropped on the
 * floor. Don't "tidy" these shapes without re-verifying against a real booking.
 */

import { UNQUALIFIED_BAND } from "@/lib/income-bands";
import type { Answer, CallType } from "@/lib/sales/options";

const API = "https://api.calendly.com";

export type QuestionType =
  | "string"
  | "text"
  | "phone_number"
  | "single_select"
  | "multi_select";

/** A custom question as configured on the event type in Calendly. */
export interface CalendlyQuestion {
  name: string;
  type: QuestionType;
  position: number;
  enabled: boolean;
  required: boolean;
  answer_choices: string[];
  include_other: boolean;
}

export interface EventTypeInfo {
  uri: string;
  name: string;
  duration: number;
  /** Must be echoed back on booking — Calendly rejects a mismatched kind. */
  locationKind: string;
  questions: CalendlyQuestion[];
}

export interface Slot {
  startTime: string;
  inviteesRemaining: number;
}

export interface BookingResult {
  eventUri: string;
  startTime: string;
  cancelUrl: string;
  rescheduleUrl: string;
}

/* ---- the slices of Calendly's responses this module actually reads ---- */

interface EventTypeResource {
  uri: string;
  name: string;
  duration: number;
  locations?: { kind: string }[];
  custom_questions?: CalendlyQuestion[];
}

interface SlotResource {
  start_time: string;
  status: string;
  invitees_remaining: number;
}

interface InviteeResource {
  event: string;
  cancel_url: string;
  reschedule_url: string;
}

export class CalendlyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: { parameter?: string; message?: string }[] = [],
  ) {
    super(message);
    this.name = "CalendlyError";
  }
}

/* ===================== routing ===================== */

export const EVENT_TYPES = {
  /** creator-support1/creator-discovery-call-1 — the ☎️ call, under $50k. */
  unqualified: `${API}/event_types/dad6beb5-5021-4d0d-a3b2-b5e653ad48a5`,
  /** creator-support1/creator-discovery-call-1-2 — the 📞 call, $50k and up. */
  qualified: `${API}/event_types/e1c21fab-de02-49e6-b255-e104b1a0e01d`,
  /**
   * "Referral Discovery Call 📱" (creator-support1/creator-discovery-call-clone)
   * — 30 min. What the affiliate landing pages book. Jason redirected this here
   * 2026-07-24; before that it was "DeCypher Affiliate" (decypher-affiliate-1,
   * c704e39c-6243-4427-9e5d-23d6a86eff1c), which still exists in Calendly.
   *
   * Deliberately outside the income-band routing: a partner's VIP has already
   * paid for the full consultation, so banding them would demote someone under
   * $50k to the short ☎️ call. Being unbanded is the point, not an oversight.
   */
  affiliate: `${API}/event_types/58960ea7-46ed-467c-adca-2be5059234e3`,
};

/**
 * Event types a page may name by key. This indirection is a security boundary,
 * not ceremony: CALENDLY_API_TOKEN is org-scoped, so a route that accepted an
 * event-type URI straight from the browser would let anyone enumerate and book
 * into any of the org's ~41 events — interviews included. Pages send a key;
 * only names in here resolve.
 */
const BOOKABLE_BY_KEY: Record<string, string> = {
  affiliate: EVENT_TYPES.affiliate,
};

/** The event type for an allowlisted key, or null if it isn't one. */
export function eventTypeForKey(key: string): string | null {
  return BOOKABLE_BY_KEY[key] ?? null;
}

/**
 * Reverse of EVENT_TYPES: which of the three sales calls an event type URI is.
 *
 * This is the filter that keeps the pipeline clean. The org runs ~41 event
 * types and the majority are delivery, not sales — QBO onboarding, tax manager,
 * "Catch up w/OT". Ingestion resolves every incoming booking through here and
 * drops anything that returns null, so the Sales Flow tab only ever holds calls
 * that belong in a pipeline.
 */
const CALL_TYPE_BY_URI = new Map<string, CallType>(
  Object.entries(EVENT_TYPES).map(([key, uri]) => [uri, key as CallType]),
);

/** Which sales call this event type is, or null if it isn't one of the three. */
export function callTypeForEventType(uri: string | null | undefined): CallType | null {
  if (!uri) return null;
  // Compare on the UUID: the same event type is addressed both as a bare URI
  // and, in webhook payloads, with query strings and alternate hosts attached.
  const uuid = uri.split("?")[0].split("/").pop();
  if (!uuid) return null;
  for (const [known, type] of CALL_TYPE_BY_URI) {
    if (known.endsWith(uuid)) return type;
  }
  return null;
}

/**
 * Mirrors a rule that exists only inside the Calendly UI ("Ads Routing Form"):
 * under $50k books the ☎️ call, everyone else books 📞.
 *
 * This CANNOT be read from Calendly. GET /routing_forms returns the questions
 * but no rules, and there is no endpoint to ask Calendly to evaluate a route
 * (POST /routing_form_submissions is a 404). So if someone re-cuts the bands in
 * Calendly, this mapping will not follow — and nothing will error, the wrong
 * people will just quietly book the wrong call. They have already moved this
 * threshold once, from $100k to $50k. Re-check with:
 *
 *     node scripts/calendly-introspect.mjs
 *
 * Unknown bands fall through to the qualified call on purpose: a band we don't
 * recognise means someone edited the form, and booking a real call is a better
 * failure than a 500.
 */
export function eventTypeForBand(band: string): string {
  return band === UNQUALIFIED_BAND
    ? EVENT_TYPES.unqualified
    : EVENT_TYPES.qualified;
}

/* ===================== transport ===================== */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.CALENDLY_API_TOKEN;
  if (!token) throw new CalendlyError("CALENDLY_API_TOKEN is not set", 500);

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new CalendlyError(
      body?.message ?? body?.title ?? res.statusText,
      res.status,
      body?.details ?? [],
    );
  }
  return body as T;
}

/* ===================== reads ===================== */

/**
 * The event type plus its custom questions. Fetched per request rather than
 * baked in, so edits made in Calendly show up on the site without a deploy —
 * which is the whole point of rendering the form from this data.
 */
export async function getEventType(uri: string): Promise<EventTypeInfo> {
  const uuid = uri.split("/").pop();
  const { resource } = await api<{ resource: EventTypeResource }>(
    `/event_types/${uuid}`,
  );
  return {
    uri: resource.uri,
    name: resource.name,
    duration: resource.duration,
    locationKind: resource.locations?.[0]?.kind ?? "",
    questions: (resource.custom_questions ?? []).filter((q) => q.enabled),
  };
}

/**
 * Bookable slots over the next `days` days (Calendly rejects a start_time in
 * the past, so the horizon opens slightly ahead of now).
 *
 * The endpoint only honours a range of up to 7 days — ask for more and it
 * quietly answers as if you'd asked for a week (verified live: a 14-day
 * request and a 7-day request return identical collections). So the horizon
 * is covered in week-sized windows fetched in parallel and merged. How much
 * of the horizon has slots is then purely the event type's own scheduling
 * window, set in Calendly ("invitees can schedule N days into the future") —
 * widen it there and the picker's month arrows light up with no code change.
 * They have already re-cut that window at least once (~14 days at launch,
 * ~7 days as of 2026-07); don't assume it.
 */
export async function getAvailableTimes(
  eventTypeUri: string,
  days = 60,
): Promise<Slot[]> {
  const WEEK = 7 * 86_400_000;
  const from = Date.now() + 60_000;
  const to = from + days * 86_400_000;

  const windows: { start: string; end: string }[] = [];
  for (let t = from; t < to; t += WEEK) {
    windows.push({
      start: new Date(t).toISOString(),
      end: new Date(Math.min(t + WEEK, to)).toISOString(),
    });
  }

  // One flaky window shouldn't blank the whole picker: keep what resolved,
  // fail only when nothing did. A missing mid-horizon week shows as "no times
  // that week", which self-heals on the next load.
  const results = await Promise.allSettled(
    windows.map((w) =>
      api<{ collection: SlotResource[] }>(
        `/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}` +
          `&start_time=${encodeURIComponent(w.start)}&end_time=${encodeURIComponent(w.end)}`,
      ),
    ),
  );
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  if (!fulfilled.length && results.length) {
    throw (results[0] as PromiseRejectedResult).reason;
  }
  if (fulfilled.length < results.length) {
    console.warn(
      `[calendly] ${results.length - fulfilled.length}/${results.length} availability windows failed — showing partial availability`,
    );
  }

  // Windows meet at exact boundary instants, so a slot can land in two
  // responses — dedupe by start. ISO-Z strings sort chronologically.
  const seen = new Set<string>();
  const slots: Slot[] = [];
  for (const r of fulfilled) {
    for (const s of r.value.collection) {
      if (s.status !== "available" || seen.has(s.start_time)) continue;
      seen.add(s.start_time);
      slots.push({
        startTime: s.start_time,
        inviteesRemaining: s.invitees_remaining,
      });
    }
  }
  return slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/* ===================== pipeline ingestion ===================== */

/**
 * Reads below exist for the Sales Flow tab, which needs the opposite direction
 * of travel from the rest of this module: not "offer times and book one", but
 * "tell me every call that was booked". They're used by the backfill script and
 * by the webhook receiver.
 */

export interface ScheduledEvent {
  uri: string;
  eventTypeUri: string;
  /** The event name as it was when booked — retired names survive on old rows. */
  name: string;
  startTime: string;
  status: "active" | "canceled";
}

export interface InviteeRecord {
  uri: string;
  /** Invitee UUID — the pipeline document id. Stable across re-sync. */
  id: string;
  eventUri: string;
  name: string;
  email: string;
  timezone: string | null;
  /** When they booked, which is what the pipeline sorts and reports on. */
  createdAt: string;
  status: "active" | "canceled";
  rescheduled: boolean;
  /** Calendly's own SMS field — the most reliable phone number on the record. */
  textReminderNumber: string | null;
  answers: Answer[];
}

interface ScheduledEventResource {
  uri: string;
  event_type: string;
  name: string;
  start_time: string;
  status: string;
}

interface FullInviteeResource {
  uri: string;
  event: string;
  name: string;
  email: string;
  timezone: string | null;
  created_at: string;
  status: string;
  rescheduled: boolean;
  text_reminder_number: string | null;
  questions_and_answers?: Answer[];
}

/** The organisation the token belongs to — required to list scheduled events. */
export async function getOrganizationUri(): Promise<string> {
  const { resource } = await api<{ resource: { current_organization: string } }>(
    "/users/me",
  );
  return resource.current_organization;
}

function toScheduledEvent(r: ScheduledEventResource): ScheduledEvent {
  return {
    uri: r.uri,
    eventTypeUri: r.event_type,
    name: r.name,
    startTime: r.start_time,
    status: r.status === "canceled" ? "canceled" : "active",
  };
}

export function toInviteeRecord(r: FullInviteeResource): InviteeRecord {
  return {
    uri: r.uri,
    id: r.uri.split("?")[0].split("/").pop()!,
    eventUri: r.event,
    name: r.name ?? "",
    email: r.email ?? "",
    timezone: r.timezone ?? null,
    createdAt: r.created_at,
    status: r.status === "canceled" ? "canceled" : "active",
    rescheduled: Boolean(r.rescheduled),
    textReminderNumber: r.text_reminder_number ?? null,
    answers: r.questions_and_answers ?? [],
  };
}

/**
 * One page of the org's scheduled events, oldest first.
 *
 * There is no event_type filter on this endpoint — the org runs ~41 event types
 * and the majority are delivery, not sales — so callers page through everything
 * and drop what `callTypeForEventType` doesn't recognise. Oldest-first because
 * a backfill that resumes should resume from a stable point; new bookings
 * appended at the end don't shift the pages already read.
 */
export async function listScheduledEvents(opts: {
  organization: string;
  minStartTime?: string;
  maxStartTime?: string;
  /** Pass the previous call's `nextPage` back verbatim. */
  nextPage?: string | null;
  count?: number;
}): Promise<{ events: ScheduledEvent[]; nextPage: string | null }> {
  let path: string;
  if (opts.nextPage) {
    // Calendly's next_page is a fully-formed absolute URL and must be used as
    // given. Rebuilding the query around `pagination.next_page_token` returns
    // 400 "page_token is invalid" — verified live, don't re-derive it.
    path = opts.nextPage.replace(API, "");
  } else {
    const qs = new URLSearchParams({
      organization: opts.organization,
      count: String(opts.count ?? 100),
      sort: "start_time:asc",
    });
    if (opts.minStartTime) qs.set("min_start_time", opts.minStartTime);
    if (opts.maxStartTime) qs.set("max_start_time", opts.maxStartTime);
    path = `/scheduled_events?${qs}`;
  }

  const body = await api<{
    collection: ScheduledEventResource[];
    pagination: { next_page: string | null };
  }>(path);

  return {
    events: body.collection.map(toScheduledEvent),
    nextPage: body.pagination?.next_page ?? null,
  };
}

/**
 * Everyone on a scheduled event. These are 1:1 calls, so this is almost always
 * a single invitee — but it's a collection in the API and a group event would
 * silently lose people if we only read the first.
 */
export async function listInvitees(eventUri: string): Promise<InviteeRecord[]> {
  const uuid = eventUri.split("?")[0].split("/").pop();
  const body = await api<{ collection: FullInviteeResource[] }>(
    `/scheduled_events/${uuid}/invitees?count=100`,
  );
  return body.collection.map(toInviteeRecord);
}

/* ===================== write ===================== */

export interface CreateBookingInput {
  eventTypeUri: string;
  /** Must exactly match a slot from getAvailableTimes, UTC with trailing Z. */
  startTime: string;
  name: string;
  email: string;
  /** IANA zone, e.g. "America/New_York". */
  timezone: string;
  locationKind: string;
  answers: { question: string; answer: string; position: number }[];
  /** Digits-only E.164 for Calendly's SMS reminders. Unverified — see note. */
  textReminderNumber?: string;
}

/**
 * Creates a real booking on the host's calendar.
 *
 * `location` is top-level (NOT nested under `event`, despite what the
 * validation error path suggests) and its `kind` must match the kind configured
 * on the event type or Calendly rejects with invalid_location_choice.
 *
 * `textReminderNumber` is passed on a read-shape hunch — invitees expose the
 * field, but it wasn't confirmed to persist on write. If SMS reminders matter,
 * verify it lands before relying on it.
 */
export async function createBooking(
  input: CreateBookingInput,
): Promise<BookingResult> {
  const { resource } = await api<{ resource: InviteeResource }>(
    "/invitees",
    {
      method: "POST",
      body: JSON.stringify({
        event_type: input.eventTypeUri,
        start_time: input.startTime,
        invitee: {
          name: input.name,
          email: input.email,
          timezone: input.timezone,
        },
        location: { kind: input.locationKind },
        questions_and_answers: input.answers,
        ...(input.textReminderNumber
          ? { text_reminder_number: input.textReminderNumber }
          : {}),
      }),
    },
  );
  return {
    eventUri: resource.event,
    startTime: input.startTime,
    cancelUrl: resource.cancel_url,
    rescheduleUrl: resource.reschedule_url,
  };
}
