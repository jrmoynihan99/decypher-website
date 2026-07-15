"use client";

import { useMemo, useState } from "react";

/**
 * Month calendar + times column, the shape Calendly's own picker uses: days
 * with availability are the only ones you can hit, and picking one fills the
 * column beside it with every open time on that day.
 *
 * Calendly hands back a flat list of UTC instants; everything here regroups
 * them into the visitor's local days, so they read their own calendar rather
 * than the host's. The timezone is stated rather than assumed — a mis-set clock
 * is the classic way to book a call nobody shows up to.
 */

export const BROWSER_TZ =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "America/New_York";

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const monthFmt = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** Local-date key. Never use toISOString here — that shifts across midnight. */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export default function TimePicker({
  slots,
  value,
  onChange,
  duration,
}: {
  slots: { startTime: string; inviteesRemaining: number }[];
  value: string | null;
  onChange: (startTime: string) => void;
  duration: number;
}) {
  /** local day key → that day's open instants, in order */
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots) {
      const k = dayKey(new Date(s.startTime));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s.startTime);
    }
    return m;
  }, [slots]);

  const firstOpen = useMemo(
    () => (slots.length ? new Date(slots[0].startTime) : new Date()),
    [slots],
  );

  const [month, setMonth] = useState(
    () => new Date(firstOpen.getFullYear(), firstOpen.getMonth(), 1),
  );
  const [day, setDay] = useState<string | null>(
    slots.length ? dayKey(firstOpen) : null,
  );

  /** Which months hold anything — bounds the arrows so you can't wander off. */
  const { minMonth, maxMonth } = useMemo(() => {
    if (!slots.length) return { minMonth: month, maxMonth: month };
    const a = new Date(slots[0].startTime);
    const b = new Date(slots[slots.length - 1].startTime);
    return {
      minMonth: new Date(a.getFullYear(), a.getMonth(), 1),
      maxMonth: new Date(b.getFullYear(), b.getMonth(), 1),
    };
  }, [slots, month]);

  /** Leading blanks + every day of the month, as a flat 7-column grid. */
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const total = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate();
    const out: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= total; d++) {
      out.push(new Date(month.getFullYear(), month.getMonth(), d));
    }
    return out;
  }, [month]);

  const shiftMonth = (by: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));

  const canPrev = month > minMonth;
  const canNext = month < maxMonth;
  const times = day ? (byDay.get(day) ?? []) : [];

  if (!slots.length) {
    return (
      <div className="rounded-[11px] border border-white/15 bg-panel-2 px-4 py-6 text-center">
        <p className="m-0 text-sm text-mist">
          No times are open right now. Try again shortly, or reach out directly.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* The row takes its height from the calendar — the tallest thing in it —
          and the times column stretches to match (default align-items). Don't
          give this row a height of its own: tie it to the panel and the times
          column drags the calendar around with it when the list runs long. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        {/* ---- calendar ---- */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              disabled={!canPrev}
              aria-label="Previous month"
              className="cursor-pointer rounded-full px-2 py-1 text-mist transition-colors duration-150 hover:text-fog disabled:cursor-default disabled:text-white/15"
            >
              ‹
            </button>
            <span className="font-display text-[15px] font-semibold text-fog">
              {monthFmt.format(month)}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              disabled={!canNext}
              aria-label="Next month"
              className="cursor-pointer rounded-full px-2 py-1 text-mist transition-colors duration-150 hover:text-fog disabled:cursor-default disabled:text-white/15"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {DOW.map((d, i) => (
              <div
                key={i}
                className="pb-1 text-center font-mono text-[10px] tracking-[0.08em] text-dusk"
              >
                {d}
              </div>
            ))}

            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} />;
              const k = dayKey(d);
              const open = byDay.has(k);
              const on = k === day;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!open}
                  onClick={() => setDay(k)}
                  aria-pressed={on}
                  className={`aspect-square rounded-full text-[13px] transition-colors duration-150 ${
                    on
                      ? "bg-grad font-semibold text-white"
                      : open
                        ? "cursor-pointer bg-magenta/[.10] font-semibold text-magenta hover:bg-magenta/20"
                        : "cursor-default text-white/20"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Inside the calendar column, not below the row: the times column
              takes its height from this column, so anything parked underneath
              the row is height the list can never reach. Sitting here it reads
              in the same place but the column grows to cover it. */}
          <p className="m-0 mt-4 font-mono text-[10px] tracking-[0.06em] text-dusk">
            {duration} MIN · {BROWSER_TZ.replace(/_/g, " ")}
          </p>
        </div>

        {/* ---- times for the chosen day ----
            Flex sizes a row to its TALLEST item, and a long list of times beats
            the calendar every time — left in flow it sets the row height, the
            calendar stretches to match, and you get a dead gap under the grid.
            flex-1 can't rein it in either: a 0% basis against an indefinite
            height collapses back to content size.
            So at sm+ the inner block goes absolute. Out of flow it contributes
            no height, the calendar is left as the tallest item and sets the
            row, this column stretches to that, and the list scrolls inside it.
            Below sm the column stacks with no calendar beside it to measure
            against, so it stays in flow and falls back to max-h. */}
        <div className="sm:relative sm:w-[136px] sm:flex-none">
          <div className="flex flex-col sm:absolute sm:inset-0">
            <p className="m-0 mb-2 flex-none font-mono text-[10px] uppercase tracking-[0.08em] text-dusk">
              {day ? dayFmt.format(new Date(`${day}T12:00:00`)) : "Pick a day"}
            </p>
            {/* data-lenis-prevent — see the note in ScheduleForm: root-mode
                Lenis swallows the wheel, so nested scrollers opt out by hand */}
            <div
              data-lenis-prevent
              className="flex max-h-[260px] min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1 sm:max-h-none"
            >
              {times.map((t) => {
                const on = value === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onChange(t)}
                    aria-pressed={on}
                    className={`flex-none cursor-pointer rounded-[9px] border py-2 text-center font-mono text-[12px] tracking-[0.06em] transition-colors duration-150 ${
                      on
                        ? "border-magenta bg-magenta/[.14] text-magenta"
                        : "border-white/15 bg-panel-2 text-mist hover:border-magenta/50 hover:text-fog"
                    }`}
                  >
                    {timeFmt.format(new Date(t))}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
