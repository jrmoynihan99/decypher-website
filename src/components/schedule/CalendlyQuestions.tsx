"use client";

import {
  FieldError,
  PhoneInput,
  TextInput,
  fieldLabelCls,
} from "@/components/estimator/fields";
import type { CalendlyQuestion } from "@/lib/calendly";

/**
 * Renders the event type's custom questions straight from Calendly, in our own
 * fields. Nothing here is hardcoded to the current 10 questions — if the client
 * edits, adds, reorders, or removes a question in Calendly, this follows on the
 * next request with no deploy. That's the reason the form is data-driven rather
 * than hand-built.
 *
 * The tradeoff is that an unknown question type has to degrade rather than
 * crash: anything unrecognised renders as a plain text field, which still
 * collects an answer Calendly will accept.
 */

/** Answers keyed by question position. Multi-selects hold a joined string. */
export type Answers = Record<number, string>;

const OTHER = "__other__";

const rowCls =
  "flex cursor-pointer items-start gap-3 rounded-[11px] border px-3 py-[11px] transition-colors duration-150";
const rowOn = "border-magenta/55 bg-magenta/[.10]";
const rowOff = "border-white/15 bg-panel-2 hover:border-magenta/40";
const textareaCls =
  "min-h-[110px] w-full resize-y rounded-[11px] border border-white/15 bg-panel-2 px-3 py-[11px] font-body text-base text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.22)]";

/**
 * A multi-select's picks live in one string, so the joiner has to be something
 * a choice can never contain. ", " isn't: several of these choices are full
 * sentences with commas in them ("Yes, I will show up to the meeting on time,
 * and if I need to reschedule…"), and splitting on ", " shattered one choice
 * into fragments that matched nothing. The row then never read as checked, so
 * people clicked it again — and every click appended the whole sentence once
 * more, which is what landed on the booked call. A unit separator can't appear
 * in a Calendly choice or in typed "Other" text, so the round-trip is lossless.
 */
const SEP = String.fromCharCode(31); // ASCII unit separator
const split = (v: string) => (v ? v.split(SEP).filter(Boolean) : []);
// Deduped on the way in, so a pick can't appear twice however it got there —
// including "Other" text typed to match a choice that's already ticked.
const join = (list: string[]) => Array.from(new Set(list)).join(SEP);

/**
 * The form's internal encoding → what Calendly actually gets: comma-joined the
 * way its own multi-selects are, with the unfilled "Other" placeholder dropped
 * rather than booked as literal "__other__". A single-value answer round-trips
 * unchanged, so every question type can go through this.
 */
export const toCalendlyAnswer = (value: string | undefined) =>
  split(value ?? "")
    .filter((s) => s !== OTHER)
    .join(", ");

export default function CalendlyQuestions({
  questions,
  answers,
  onChange,
  errors,
}: {
  questions: CalendlyQuestion[];
  answers: Answers;
  onChange: (position: number, value: string) => void;
  errors: Record<number, boolean>;
}) {
  return (
    <div className="flex flex-col gap-5">
      {questions.map((q) => {
        const id = `q-${q.position}`;
        const value = answers[q.position] ?? "";
        const invalid = !!errors[q.position];

        return (
          <div key={q.position}>
            <label className={`${fieldLabelCls} normal-case tracking-normal`} htmlFor={id}>
              {q.name}
              {!q.required && (
                <span className="text-dusk"> (optional)</span>
              )}
            </label>

            {q.type === "text" ? (
              <textarea
                id={id}
                value={value}
                onChange={(e) => onChange(q.position, e.target.value)}
                className={`${textareaCls} ${invalid ? "border-danger" : ""}`}
              />
            ) : q.type === "phone_number" ? (
              <PhoneInput
                id={id}
                value={value}
                invalid={invalid}
                onChange={(v) => onChange(q.position, v)}
                placeholder="(555) 123-4567"
              />
            ) : q.type === "single_select" || q.type === "multi_select" ? (
              <ChoiceList
                q={q}
                value={value}
                invalid={invalid}
                onChange={(v) => onChange(q.position, v)}
              />
            ) : (
              <TextInput
                id={id}
                type="text"
                value={value}
                invalid={invalid}
                onChange={(e) => onChange(q.position, e.target.value)}
              />
            )}

            <FieldError show={invalid}>This one&apos;s required.</FieldError>
          </div>
        );
      })}
    </div>
  );
}

/**
 * single_select renders as radios, multi_select as checkboxes. Deliberately not
 * pills — several of these choices are full sentences, and pills turn long copy
 * into unreadable blobs.
 */
function ChoiceList({
  q,
  value,
  invalid,
  onChange,
}: {
  q: CalendlyQuestion;
  value: string;
  invalid: boolean;
  onChange: (v: string) => void;
}) {
  const multi = q.type === "multi_select";
  const selected = multi ? split(value) : value ? [value] : [];

  // "Other" is free text, so anything not in answer_choices is the other value.
  const otherValue = selected.find((s) => !q.answer_choices.includes(s)) ?? "";
  const otherOn = q.include_other && !!otherValue;

  const toggle = (choice: string) => {
    if (!multi) return onChange(choice === value ? "" : choice);
    const next = selected.includes(choice)
      ? selected.filter((s) => s !== choice)
      : [...selected, choice];
    onChange(join(next));
  };

  const setOther = (text: string) => {
    const kept = selected.filter((s) => q.answer_choices.includes(s));
    if (!multi) return onChange(text);
    onChange(join(text ? [...kept, text] : kept));
  };

  return (
    <div
      className={`flex flex-col gap-2 ${invalid ? "rounded-[11px] ring-1 ring-danger" : ""}`}
    >
      {q.answer_choices.map((choice) => {
        const on = selected.includes(choice);
        return (
          <label key={choice} className={`${rowCls} ${on ? rowOn : rowOff}`}>
            <input
              type={multi ? "checkbox" : "radio"}
              name={`q-${q.position}`}
              checked={on}
              onChange={() => toggle(choice)}
              className="mt-1 flex-none accent-magenta"
            />
            <span
              className={`text-[15px] leading-snug ${on ? "text-fog" : "text-mist"}`}
            >
              {choice}
            </span>
          </label>
        );
      })}

      {q.include_other && (
        <div className={`${rowCls} flex-col ${otherOn ? rowOn : rowOff}`}>
          <div className="flex w-full items-center gap-3">
            <input
              type={multi ? "checkbox" : "radio"}
              name={`q-${q.position}`}
              checked={otherOn}
              onChange={() => setOther(otherOn ? "" : OTHER)}
              className="flex-none accent-magenta"
            />
            <span className="text-[15px] text-mist">Other</span>
          </div>
          {otherOn && (
            <input
              type="text"
              autoFocus
              value={otherValue === OTHER ? "" : otherValue}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Tell us more"
              className="mt-2 w-full rounded-[8px] border border-white/15 bg-panel-2 px-3 py-2 font-body text-[15px] text-fog outline-none focus:border-magenta"
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * True when a required question has no usable answer yet. Judged on what would
 * actually be sent, so a checked-but-empty "Other" reads as unanswered whether
 * it's the only pick or sits alongside real ones.
 */
export function isUnanswered(q: CalendlyQuestion, value: string | undefined) {
  if (!q.required) return false;
  return !toCalendlyAnswer(value).trim();
}
