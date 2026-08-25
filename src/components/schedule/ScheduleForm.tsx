"use client";

import { useState } from "react";
import {
  FieldError,
  PhoneInput,
  Select,
  TextInput,
  fieldLabelCls,
} from "@/components/estimator/fields";
import CalendlyQuestions, {
  type Answers,
  isUnanswered,
  toCalendlyAnswer,
} from "@/components/schedule/CalendlyQuestions";
import TimePicker, { BROWSER_TZ } from "@/components/schedule/TimePicker";
import type { CalendlyQuestion } from "@/lib/calendly";
import { INCOME_BANDS } from "@/lib/income-bands";

/**
 * Books a real Calendly call, mirroring the flow the live site runs today:
 *
 *   1. name / income / phone   — the "Ads Routing Form"; income picks the call
 *   2. pick a time             — live availability for the routed event type
 *   3. email + the questions   — the event type's own custom questions
 *
 * Steps 2 and 3 are driven entirely by whatever Calendly returns for the routed
 * event type, so the client's edits to their questions land here without a
 * deploy. The one thing that can't follow is which event type an income band
 * routes to — see eventTypeForBand in lib/calendly.ts.
 *
 * Pass `eventKey` to book a FIXED event instead (the affiliate pages do). That
 * drops step 1's income question entirely rather than just ignoring it: the
 * partner already paid for the call, so there's nothing to qualify, and asking
 * a question whose answer changes nothing is a step toward the exit on a page
 * whose promise is "takes 30 seconds".
 */

export interface Booking {
  name: string;
  email: string;
  startTime: string;
  eventName: string;
  rescheduleUrl: string;
  cancelUrl: string;
}

interface Loaded {
  eventType: { name: string; duration: number };
  questions: CalendlyQuestion[];
  slots: { startTime: string; inviteesRemaining: number }[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Recording consent, shown on the last step of every booking this form drives —
 * /schedule and every affiliate page alike, because both mount this component.
 *
 * Held as data rather than JSX so the wording is editable in one place without
 * touching markup, and so the apostrophes and em-dashes stay typographic.
 *
 * Deliberately in full rather than a "see our terms" link: the second point is
 * a licence to publish someone's likeness, and burying that behind a click is
 * how consent stops meaning anything. It sits at the end of step 3, directly
 * above the button that acts on it — the last thing read before booking.
 */
const CONSENT_POINTS = [
  "Calls may be recorded and transcribed for training, quality assurance, and internal documentation.",
  "We may use portions of recorded calls — including audio, video, or transcript excerpts — in educational, promotional, or marketing materials. Where we do, we anonymize the content: names, handles, business names, and identifying financial details are removed or altered.",
  "You may opt out during the call. Let us know at any point while we\u2019re on the call and we\u2019ll flag the recording so it\u2019s excluded from any content use. Opting out has no effect on your call, your pricing, or your service.",
];

/**
 * The shared btnPrimaryCls is w-full by design — right for a lone CTA, wrong
 * for a row, where two of them fight for the same width and the second lands
 * off-panel. These are the same look at row scale.
 */
const navBase =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border px-5 py-3 font-display text-[14px] font-semibold transition-[transform,filter] duration-150 active:translate-y-px disabled:cursor-default disabled:opacity-40";
const navPrimary = `${navBase} flex-1 border-transparent bg-grad text-white hover:brightness-[1.07]`;
const navGhost = `${navBase} flex-none border-white/15 bg-transparent text-fog hover:border-mist`;

export default function ScheduleForm({
  onBooked,
  eventKey,
}: {
  onBooked: (booking: Booking) => void;
  /** Allowlisted key (see BOOKABLE_BY_KEY). Set = fixed event, no income step. */
  eventKey?: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const banded = !eventKey;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [band, setBand] = useState("");
  const [email, setEmail] = useState("");

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});

  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [qErrors, setQErrors] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const clearErr = (k: string) =>
    setErrors((e) => (e[k] ? { ...e, [k]: false } : e));

  /** Whichever of the route's two entry points this form is using. */
  const routeQuery = () =>
    eventKey
      ? `event=${encodeURIComponent(eventKey)}`
      : `band=${encodeURIComponent(band)}`;

  /* ---- step 1 → load the routed event type's times + questions ---- */
  const submitStep1 = async () => {
    const errs: Record<string, boolean> = {};
    if (!name.trim()) errs.name = true;
    if (banded && !band) errs.band = true;
    if (phone.replace(/\D/g, "").length !== 10) errs.phone = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/booking?${routeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load times.");

      setLoaded(data);
      // The callback-number question asks for what we just collected — carry it
      // over rather than making them type it twice. Income can't be carried the
      // same way: the routing bands and the question's bands don't line up.
      const phoneQ = data.questions.find(
        (q: CalendlyQuestion) => q.type === "phone_number",
      );
      if (phoneQ) setAnswers((a) => ({ ...a, [phoneQ.position]: phone }));
      setStep(2);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  /* ---- step 3 → book it ---- */
  const submitBooking = async () => {
    if (!loaded || !slot) return;

    const errs: Record<string, boolean> = {};
    if (!EMAIL_RE.test(email.trim())) errs.email = true;
    setErrors(errs);

    const qe: Record<number, boolean> = {};
    for (const q of loaded.questions) {
      if (isUnanswered(q, answers[q.position])) qe[q.position] = true;
    }
    setQErrors(qe);
    if (Object.keys(errs).length || Object.keys(qe).length) return;

    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(eventKey ? { event: eventKey } : { band }),
          name: name.trim(),
          email: email.trim(),
          timezone: BROWSER_TZ,
          startTime: slot,
          textReminderNumber: `+1${phone.replace(/\D/g, "")}`,
          answers: loaded.questions.map((q) => ({
            question: q.name,
            // Held in the form's own encoding — decode before it leaves.
            answer: toCalendlyAnswer(answers[q.position]),
            position: q.position,
          })),
        }),
      });
      const data = await res.json();

      if (res.status === 409) {
        // someone took the slot while this form was open — send them back with
        // fresh availability rather than a dead end
        setFailure(data.error);
        setSlot(null);
        const refresh = await fetch(`/api/booking?${routeQuery()}`);
        if (refresh.ok) setLoaded(await refresh.json());
        setStep(2);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Couldn't book that.");

      onBooked({
        name: name.trim(),
        email: email.trim(),
        startTime: slot,
        eventName: data.eventType.name,
        rescheduleUrl: data.booking.rescheduleUrl,
        cancelUrl: data.booking.cancelUrl,
      });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full">
      {/* Height is capped to the viewport on desktop so the panel reads as one
          card next to the pitch instead of running past it — step 3's ten
          questions are far taller than anything on the left. The body scrolls;
          the step rail, the booked-slot line and the actions stay put. Step 3
          sits shorter than the picker, which wants every pixel it can get. */}
      <div
        className={`relative flex flex-col overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.045] p-7 backdrop-blur-xl sm:p-8 ${
          step === 3
            ? "lg:max-h-[calc(100svh-12rem)]"
            : "lg:max-h-[calc(100svh-8rem)]"
        }`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,45,120,.55),rgba(139,43,232,.55),transparent)]"
        />

        <div className="mb-6 flex-none">
          <Steps step={step} />
          {step === 3 && slot && loaded && (
            <p className="m-0 mt-5 rounded-[11px] border border-white/10 bg-panel-2 px-3 py-[11px] font-mono text-[12px] tracking-[0.06em] text-mist">
              {new Intl.DateTimeFormat(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(slot))}{" "}
              · {loaded.eventType.duration} MIN
            </p>
          )}
        </div>

        {/* data-lenis-prevent: Lenis runs in root mode and eats the wheel for the
            window, so a nested scroller never sees it — without this the page
            scrolls instead of the form. Only bites with a discrete mouse wheel;
            Lenis stands down for trackpads, which is why it can look fine there.
            Negative margin + padding keep focus rings out of the clip. */}
        <div
          data-lenis-prevent
          className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2"
        >
        {step === 1 && (
          <div className="grid gap-4">
            <div>
              <label className={fieldLabelCls} htmlFor="s-name">
                Name
              </label>
              <TextInput
                id="s-name"
                type="text"
                placeholder="Your name"
                value={name}
                invalid={!!errors.name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearErr("name");
                }}
              />
              <FieldError show={!!errors.name}>
                Please enter your name.
              </FieldError>
            </div>

            {banded && (
              <div>
                <label className={fieldLabelCls} htmlFor="s-band">
                  What is your yearly projected income as a content creator?
                </label>
                <Select
                  id="s-band"
                  value={band}
                  invalid={!!errors.band}
                  onChange={(e) => {
                    setBand(e.target.value);
                    clearErr("band");
                  }}
                >
                  <option value="" disabled>
                    Select a range
                  </option>
                  {INCOME_BANDS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </Select>
                <FieldError show={!!errors.band}>
                  Please pick a range.
                </FieldError>
              </div>
            )}

            <div>
              <label className={fieldLabelCls} htmlFor="s-phone">
                Phone number
              </label>
              <PhoneInput
                id="s-phone"
                placeholder="(555) 123-4567"
                value={phone}
                invalid={!!errors.phone}
                onChange={(v) => {
                  setPhone(v);
                  clearErr("phone");
                }}
              />
              <FieldError show={!!errors.phone}>
                Please enter a 10-digit phone number.
              </FieldError>
            </div>
          </div>
        )}

        {step === 2 && loaded && (
          <div>
            <TimePicker
              slots={loaded.slots}
              value={slot}
              onChange={setSlot}
              duration={loaded.eventType.duration}
            />
          </div>
        )}

        {step === 3 && loaded && (
          <div>
            <div className="mb-5">
              <label className={fieldLabelCls} htmlFor="s-email">
                Email
              </label>
              <TextInput
                id="s-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                invalid={!!errors.email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearErr("email");
                }}
              />
              <FieldError show={!!errors.email}>
                Please enter a valid email.
              </FieldError>
            </div>

            <CalendlyQuestions
              questions={loaded.questions}
              answers={answers}
              errors={qErrors}
              onChange={(pos, v) => {
                setAnswers((a) => ({ ...a, [pos]: v }));
                setQErrors((e) => (e[pos] ? { ...e, [pos]: false } : e));
              }}
            />

            <RecordingConsent />
          </div>
        )}
        </div>

        <div className="mt-5 flex flex-none gap-3 border-t border-white/10 pt-5">
          {step > 1 && (
            <button
              className={navGhost}
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              disabled={busy}
            >
              ← Back
            </button>
          )}
          {step === 1 && (
            <button className={navPrimary} onClick={submitStep1} disabled={busy}>
              {busy ? "Finding times…" : "See available times →"}
            </button>
          )}
          {step === 2 && (
            <button
              className={navPrimary}
              onClick={() => setStep(3)}
              disabled={!slot}
            >
              Next →
            </button>
          )}
          {step === 3 && (
            <button
              className={navPrimary}
              onClick={submitBooking}
              disabled={busy}
            >
              {busy ? "Booking…" : "Book my call →"}
            </button>
          )}
        </div>

        {failure && (
          <p className="mt-4 flex-none text-center text-sm text-danger">
            {failure}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The recording notice, in full, at the foot of step 3.
 *
 * A notice rather than a tick-box on purpose. Every point here is either
 * something we do regardless (record, transcribe) or something they can stop
 * with a sentence on the call — so a required checkbox would gate the booking
 * on an agreement that has no "no" branch, which is friction pretending to be
 * a choice. What consent needs is that it was legible before the act it covers,
 * and that the opt-out is as prominent as the licence: hence full text, right
 * above the button, with the opt-out as its own point rather than a footnote.
 */
function RecordingConsent() {
  return (
    <div className="mt-7 rounded-[13px] border border-white/10 bg-white/[0.028] px-4 py-3.5">
      <p className="m-0 font-mono text-[9.5px] uppercase tracking-[0.26em] text-magenta">
        Recording &amp; consent
      </p>
      <p className="m-0 mt-2.5 text-[12px] leading-relaxed text-mist">
        By booking this call, you agree that:
      </p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {CONSENT_POINTS.map((point) => (
          <li key={point} className="flex gap-2.5">
            <span aria-hidden className="mt-[7px] h-1 w-1 flex-none rounded-full bg-magenta/70" />
            <span className="text-[11.5px] leading-[1.6] text-dusk [text-wrap:pretty]">
              {point}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Steps({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["You", "Time", "Details"];
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < step;
        const on = n === step;
        const last = i === labels.length - 1;
        return (
          // The last label carries no connector, so leaving it flex-1 would let
          // it hog a third of the row and strand the rail short of the edge.
          // Pinning it to its content lets the two rules absorb the slack and
          // the rail runs the full width.
          <div
            key={label}
            className={`flex items-center gap-2 ${last ? "flex-none" : "flex-1"}`}
          >
            <span
              className={`font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] ${
                on ? "text-magenta" : done ? "text-mist" : "text-dusk"
              }`}
            >
              {String(n).padStart(2, "0")} {label}
            </span>
            {i < labels.length - 1 && (
              <span
                className={`h-px flex-1 ${done ? "bg-magenta/50" : "bg-white/12"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
