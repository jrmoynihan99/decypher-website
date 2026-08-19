"use client";

/**
 * Chart primitives for the portal's stats views — Sales Flow, and the
 * Applications pipeline.
 *
 * BUILT IN CSS, NOT SVG. Every shape here is a bar, and a bar is a div with a
 * width or a height. That keeps text crisp at any container size — the portal's
 * existing charts.tsx uses `preserveAspectRatio="none"`, which stretches the
 * viewBox and distorts its own labels and corner radii. Nothing here needs a
 * resize observer either.
 *
 * ── The palette ──────────────────────────────────────────────────────────────
 * Not picked by eye. Validated against the portal's real panel surface
 * (#141319) with the data-viz validator:
 *
 *   SERIES  #d62368 magenta   3.78:1  — magnitude, every single-hue bar
 *           #29a294 teal      4.9:1   — "won", the only second series anywhere
 *           ↳ the pair passes all six checks. Its CVD separation is ΔE 7.3
 *             (deuteranopia), inside the 6–8 floor band, which is legal ONLY
 *             with secondary encoding — hence the legend, the direct labels and
 *             the 2px segment gap on the one chart that uses both. Don't remove
 *             any of those three.
 *   FUNNEL  #8f1a4d → #d62368 → #ff5c96 — an ordinal ramp (one hue, monotone
 *           lightness, adjacent ΔL ≥ 0.06, dark end 2.13:1). Funnel stages are
 *           ordered, so they take a ramp, not categorical hues.
 *
 * The brand's own five accents were tested as a categorical set and FAILED:
 * teal sits at L 0.794 against a 0.48–0.67 dark band, and ember (#ff5c2e) vs
 * danger (#ff6b7a) measure ΔE 7.5 to NORMAL vision — indistinguishable before
 * colour blindness is even considered. That is why almost everything here is
 * one hue and magnitude is carried by bar length, not by colour.
 *
 * Status colours (won/lost/etc.) are exempt from the categorical checks and
 * keep the portal's existing tokens — but they always ship beside a text label,
 * never as colour alone.
 */

import { useState } from "react";
import { Mono } from "@/components/portal/widgets/ui";

export const VIZ = {
  series: "#d62368",
  series2: "#29a294",
  funnel: ["#8f1a4d", "#d62368", "#ff5c96"],
  // Theme-bound, unlike the series hues: a hardcoded white gridline vanishes
  // completely on the portal's light theme, which is exactly the failure the
  // Savings Snapshot's baseline bar had.
  grid: "var(--color-chart-grid)",
} as const;

const pct = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);

/* ─────────────────────────── horizontal bars ─────────────────────────── */

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Overrides the single-hue default — only for status, which means something. */
  color?: string;
  /** Replaces the plain count on the right, e.g. "$12,400". */
  display?: string;
}

/**
 * Ranked horizontal bars — the default form for "compare magnitude across
 * named things": lead source, service sold, payment plan, top partners.
 *
 * Deliberately NOT a pie chart. Ten lead sources is past the ~7 classes where
 * slices stop being comparable, angle is a weaker channel than length, and a
 * ten-colour categorical palette can't pass the CVD gates at all (the brand's
 * own five don't). Sorted bars with the numbers printed answer "which is
 * biggest, and by how much" instantly; a pie makes the reader estimate.
 *
 * One hue for every bar: these are nominal categories, so colouring them by
 * value would spend the identity channel re-encoding what length already shows.
 */
export function BarList({
  data,
  total,
  unit = "",
  emptyLabel = "No data in this range.",
  max: maxOverride,
}: {
  data: BarDatum[];
  /** Denominator for the % — pass the true total so "unset" rows are honest. */
  total?: number;
  unit?: string;
  emptyLabel?: string;
  max?: number;
}) {
  const rows = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (!rows.length) {
    return <p className="py-6 text-center text-[12.5px] text-dusk">{emptyLabel}</p>;
  }
  const max = maxOverride ?? Math.max(...rows.map((r) => r.value));
  const denom = total ?? rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[12.5px] text-mist" title={row.label}>
                {row.label}
              </span>
            </div>
            {/* 4px radius on the data end only, anchored to the baseline. */}
            <div className="h-[7px] w-full rounded-[4px] bg-white/[0.04]">
              <div
                className="h-full rounded-[4px] transition-[width] duration-500"
                style={{
                  width: `${Math.max(pct(row.value, max), row.value > 0 ? 1.5 : 0)}%`,
                  background: row.color ?? VIZ.series,
                }}
              />
            </div>
          </div>
          {/* Direct labels on every row — this is the table view, and it is what
              lets the sub-3:1 fills below satisfy the contrast relief rule. */}
          <div className="whitespace-nowrap text-right font-mono text-[12.5px] tabular-nums text-fog">
            {row.display ?? `${row.value.toLocaleString()}${unit}`}
            <span className="ml-2 text-[11px] text-dusk">{pct(row.value, denom).toFixed(0)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── monthly columns ─────────────────────────── */

export interface MonthDatum {
  key: string;
  /** "Jan" — the year is printed separately, only where it changes. */
  short: string;
  full: string;
  year: number;
  /** 0-11, so January can carry the year tick. */
  month: number;
  /** The whole for this month — booked calls, or applications received. */
  total: number;
  /** The highlighted subset stacked at the base — deals won, or people hired. */
  part: number;
}

/** Round up to something a human would choose for an axis top. */
function niceTop(n: number): number {
  if (n <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(n));
  for (const s of [1, 2, 2.5, 5, 10]) {
    if (n <= s * mag) return s * mag;
  }
  return 10 * mag;
}

/**
 * A count per month, with a highlighted subset stacked at the base — booked
 * calls and the ones that closed, or applications and the people hired.
 *
 * Stacked rather than two charts because the question is "of what came in,
 * how much converted" — a part-to-whole over time. The part sits at the bottom so it
 * shares the baseline and its heights are comparable month to month; the
 * floating segment is the remainder, which nobody needs to compare precisely.
 *
 * This is the only two-series chart in the tab, so it carries all three pieces
 * of secondary encoding its palette's CVD warn band requires: a legend, a 2px
 * surface gap between the segments, and hover values.
 */
export function MonthColumns({
  data,
  height = 190,
  totalLabel = "Booked",
  partLabel = "Won",
  emptyLabel = "No calls in this range.",
}: {
  data: MonthDatum[];
  height?: number;
  /** What the whole column is, e.g. "Booked" or "Applied". */
  totalLabel?: string;
  /** What the base segment is, e.g. "Won" or "Hired". */
  partLabel?: string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);

  if (!data.length) {
    return <p className="py-6 text-center text-[12.5px] text-dusk">{emptyLabel}</p>;
  }
  // The axis top is a rounded number, not the raw peak, so the gridlines land
  // on values a reader can actually do arithmetic with.
  const max = niceTop(Math.max(1, ...data.map((d) => d.total)));
  // Label every month when there's room, otherwise roughly every other one.
  const step = data.length > 18 ? Math.ceil(data.length / 12) : 1;
  const ticks = [1, 0.5, 0];

  return (
    <div>
      <Legend
        items={[
          { label: partLabel, color: VIZ.series2 },
          { label: `Not ${partLabel.toLowerCase()}`, color: VIZ.series },
        ]}
      />

      {/* Left gutter carries the scale. Without it, a range wider than 18
          months suppresses the per-column labels and the chart has no
          magnitude at all — only shape. */}
      <div className="relative pl-8">
        {ticks.map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute left-0 right-0 flex items-center gap-2"
            style={{ top: `${(1 - t) * height}px` }}
          >
            <span className="w-6 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-faint">
              {Math.round(max * t)}
            </span>
            <span className="h-px flex-1" style={{ background: VIZ.grid }} />
          </div>
        ))}

        <div className="relative flex items-end gap-[3px]" style={{ height }}>
          {data.map((d, i) => {
            const on = hover === d.key;
            const rest = Math.max(0, d.total - d.part);
            return (
              <div
                key={d.key}
                className="group relative flex h-full flex-1 flex-col justify-end"
                onMouseEnter={() => setHover(d.key)}
                onMouseLeave={() => setHover(null)}
              >
                {/* Selective direct labels: the count above each column when the
                    axis isn't crowded. Never a number on every point otherwise. */}
                {step === 1 && d.total > 0 ? (
                  <span className="mb-1 text-center font-mono text-[9.5px] tabular-nums text-dusk">
                    {d.total}
                  </span>
                ) : null}

                <div
                  className="w-full rounded-t-[4px] transition-opacity duration-150"
                  style={{
                    height: `${pct(rest, max)}%`,
                    background: VIZ.series,
                    opacity: hover && !on ? 0.4 : 1,
                  }}
                />
                {/* The 2px gap IS the spacer between stacked fills. */}
                {rest > 0 && d.part > 0 ? <div className="h-[2px] w-full" /> : null}
                <div
                  className="w-full transition-opacity duration-150"
                  style={{
                    height: `${pct(d.part, max)}%`,
                    background: VIZ.series2,
                    borderRadius: rest > 0 ? "0 0 2px 2px" : "4px 4px 2px 2px",
                    opacity: hover && !on ? 0.4 : 1,
                  }}
                />

                {on ? (
                  <div
                    className={`pointer-events-none absolute bottom-full z-20 mb-1.5 whitespace-nowrap rounded-[8px] border border-edge-mid bg-panel px-2.5 py-1.5 font-mono text-[11px] shadow-lg ${
                      i > data.length - 4 ? "right-0" : "left-0"
                    }`}
                  >
                    <div className="mb-1 text-dusk">{d.full}</div>
                    <div className="flex justify-between gap-4 tabular-nums">
                      <span style={{ color: VIZ.series2 }}>{partLabel}</span>
                      <span className="text-fog">{d.part}</span>
                    </div>
                    <div className="flex justify-between gap-4 tabular-nums">
                      <span className="text-mist">{totalLabel}</span>
                      <span className="text-fog">{d.total}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-1.5 flex gap-[3px] border-t border-edge pt-1.5">
          {data.map((d, i) => {
            // The year is printed only where it changes, so a multi-year range
            // can't read as an ambiguous run of "Dec … Mar … Dec".
            const newYear = i === 0 || d.year !== data[i - 1].year;
            return (
              <div key={d.key} className="flex-1 text-center leading-tight">
                {i % step === 0 || newYear ? (
                  <span className="block font-mono text-[9.5px] text-dusk">{d.short}</span>
                ) : null}
                {newYear ? (
                  <span className="block font-mono text-[9px] font-bold text-muted">{d.year}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── funnel ─────────────────────────────── */

/**
 * Booked → showed → won.
 *
 * Ordinal, not categorical: the stages have an order, so they take one hue's
 * lightness ramp and the reader sees the progression in the colour. Each stage
 * shows its own conversion from the stage above, which is the number that
 * actually gets acted on.
 */
export function Funnel({
  stages,
}: {
  stages: { label: string; value: number; note?: string }[];
}) {
  const top = Math.max(1, stages[0]?.value ?? 1);
  return (
    <div className="space-y-2.5">
      {stages.map((s, i) => {
        const prev = i === 0 ? null : stages[i - 1].value;
        const conv = prev && prev > 0 ? (s.value / prev) * 100 : null;
        return (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-mist">{s.label}</span>
              <span className="font-mono text-[12.5px] tabular-nums text-fog">
                {s.value.toLocaleString()}
                {conv != null ? (
                  <span className="ml-2 text-[11px] text-dusk">{conv.toFixed(0)}% of prev</span>
                ) : null}
              </span>
            </div>
            <div className="h-[10px] w-full rounded-[4px] bg-white/[0.04]">
              <div
                className="h-full rounded-[4px] transition-[width] duration-500"
                style={{
                  width: `${Math.max(pct(s.value, top), s.value > 0 ? 2 : 0)}%`,
                  background: VIZ.funnel[Math.min(i, VIZ.funnel.length - 1)],
                }}
              />
            </div>
            {s.note ? <p className="mt-1 text-[11px] text-faint">{s.note}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────── meter ─────────────────────────────── */

/**
 * One ratio against its whole — a show rate or a close rate.
 *
 * A meter rather than a two-slice pie: the reader compares one length to one
 * track, and the percentage is printed anyway.
 */
export function Meter({
  label,
  value,
  of,
  suffix = "%",
  tone = VIZ.series,
}: {
  label: string;
  value: number;
  of: number;
  suffix?: string;
  tone?: string;
}) {
  const p = pct(value, of);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Mono className="text-dusk">{label}</Mono>
        <span className="font-display text-[19px] font-bold tabular-nums" style={{ color: tone }}>
          {p.toFixed(0)}
          {suffix}
        </span>
      </div>
      <div className="mt-1.5 h-[7px] w-full rounded-[4px] bg-white/[0.04]">
        <div
          className="h-full rounded-[4px] transition-[width] duration-500"
          style={{ width: `${Math.min(100, p)}%`, background: tone }}
        />
      </div>
      <p className="mt-1 font-mono text-[10.5px] text-faint">
        {value.toLocaleString()} of {of.toLocaleString()}
      </p>
    </div>
  );
}

/* ─────────────────────────────── delta ─────────────────────────────── */

/**
 * This period against the one it's being compared with.
 *
 * The arrow and the sign both carry the direction, so the colour is the third
 * encoding rather than the only one — the same rule the rest of this file
 * follows. Percentages are of the previous value, which is what "up 20%" means
 * to everyone except a statistician.
 *
 * A previous value of zero has no percentage — dividing by it yields infinity,
 * and "+∞%" is worse than useless next to a real number. It reports the raw
 * move instead.
 */
export function Delta({
  value,
  previous,
  format = (n: number) => n.toLocaleString(),
  goodWhenUp = true,
}: {
  value: number;
  previous: number;
  format?: (n: number) => string;
  /** False where a rise is bad — nothing yet, but commission owed would be. */
  goodWhenUp?: boolean;
}) {
  const diff = value - previous;
  const flat = Math.abs(diff) < 0.0001;
  const up = diff > 0;
  const color = flat ? "#8f88a0" : (up === goodWhenUp ? VIZ.series2 : "#ff6b7a");
  const pct = previous !== 0 ? Math.round((diff / Math.abs(previous)) * 100) : null;

  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono text-[11px] tabular-nums">
      <span style={{ color }}>
        {flat ? "→" : up ? "▲" : "▼"}{" "}
        {pct != null ? `${Math.abs(pct)}%` : format(Math.abs(diff))}
      </span>
      <span className="text-faint">vs {format(previous)}</span>
    </span>
  );
}

/* ─────────────────────────────── legend ─────────────────────────────── */

/** Always present for two or more series — identity is never colour alone. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-4">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-2 text-[11.5px] text-muted">
          <span
            aria-hidden
            className="h-[9px] w-[9px] rounded-[3px]"
            style={{ background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
