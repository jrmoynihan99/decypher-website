"use client";

/**
 * Minimal SVG charts for the portal widgets.
 *
 * Hand-rolled rather than pulling in a charting library: the repo ships no
 * chart dependency today, these two shapes are all the widgets need, and a
 * 400kB import for one internal page is a bad trade. Everything is a plain
 * <svg> with a viewBox, so it scales without a resize observer.
 *
 * Both charts share the hover model: a transparent overlay rect maps the
 * pointer's x to the nearest data index, and the tooltip is positioned in
 * percentage units so it tracks the responsive scale.
 */

import { useState } from "react";
import { money2, moneyShort, niceMax } from "@/lib/widget-format";

/**
 * The chart palette, mirroring the Tailwind brand tokens in globals.css.
 *
 * These have to be literal hex rather than `var(--color-*)`: SVG `stroke` and
 * `fill` are set as attributes/props here, and the same values are handed to
 * gradient stops, so a var would resolve inconsistently. Kept in one place so
 * a brand change is one edit, and named by role so a chart never picks a
 * colour by eye.
 */
export const CHART = {
  /** Cost, outflow, the thing you're trying to shrink. */
  cost: "#ff2d78",
  /** Gain, equity, the thing you're trying to grow. */
  gain: "#3dd6c4",
  /** A running cumulative total. */
  cumulative: "#ff5c2e",
  /** A primary balance or level. */
  level: "#f1eef6",
  /** A baseline being compared against. */
  baseline: "#8f88a0",
  /** Gridlines and axis text. */
  grid: "rgba(255,255,255,0.055)",
  crosshair: "rgba(255,255,255,0.28)",
} as const;

export interface Series {
  key: string;
  label: string;
  color: string;
  /** "area" stacks against the other areas; "line" draws on the right axis. */
  kind: "area" | "line";
  values: number[];
}

const W = 720;
const H = 320;
const PAD = { top: 12, right: 58, bottom: 26, left: 60 };

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

function pathFrom(pts: [number, number][]): string {
  return pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
}

/**
 * Dual-axis chart: stacked areas on the left axis (per-period flows) with
 * lines on the right axis (running totals and balances). This is the shape
 * the amortisation view needs — monthly interest/principal against the
 * remaining balance and the cumulative interest.
 */
export function FlowChart({
  series,
  xLabel,
  labelForIndex,
  height = 340,
}: {
  series: Series[];
  xLabel: (i: number) => string;
  labelForIndex: (i: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const areas = series.filter((s) => s.kind === "area");
  const lines = series.filter((s) => s.kind === "line");
  const n = Math.max(1, (series[0]?.values.length ?? 1) - 1);

  // Left axis holds the stacked flows; right axis holds the balances.
  const areaMax = niceMax(
    Math.max(
      1,
      ...Array.from({ length: n + 1 }, (_, i) =>
        areas.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
      ),
    ),
  );
  const lineMax = niceMax(
    Math.max(1, ...lines.flatMap((s) => s.values.map((v) => v || 0))),
  );

  const X = (i: number) => PAD.left + (i / n) * plotW;
  const YA = (v: number) => PAD.top + plotH - (v / areaMax) * plotH;
  const YL = (v: number) => PAD.top + plotH - (v / lineMax) * plotH;

  /* Stack the areas bottom-up: band k runs from the sum of everything below it
     to the sum including it. `cumulative[k]` is that upper edge. */
  const zeros = new Array(n + 1).fill(0) as number[];
  const cumulative = areas.map((_, idx) =>
    areas
      .slice(0, idx + 1)
      .reduce((acc, cur) => acc.map((v, i) => v + (cur.values[i] ?? 0)), zeros),
  );
  const stacked = areas.map((s, idx) => {
    const upper = cumulative[idx];
    const lower = idx === 0 ? zeros : cumulative[idx - 1];
    const top = upper.map((v, i) => [X(i), YA(v)] as [number, number]);
    const bottom = lower
      .map((v, i) => [X(i), YA(v)] as [number, number])
      .reverse();
    return {
      s,
      d: `${pathFrom(top)} ${pathFrom(bottom).replace("M", "L")} Z`,
      edge: pathFrom(top),
    };
  });

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - r.left) / r.width;
          const x = frac * W;
          const i = Math.round(((x - PAD.left) / plotW) * n);
          setHover(i >= 0 && i <= n ? i : null);
        }}
      >
        {/* horizontal grid + both axes */}
        {ticks.map((t) => {
          const y = PAD.top + plotH - t * plotH;
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke={CHART.grid}
              />
              <text
                x={PAD.left - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-dusk font-mono"
                style={{ fontSize: 10 }}
              >
                {moneyShort(areaMax * t)}
              </text>
              <text
                x={W - PAD.right + 8}
                y={y + 3.5}
                className="fill-faint font-mono"
                style={{ fontSize: 10 }}
              >
                {moneyShort(lineMax * t)}
              </text>
            </g>
          );
        })}

        {stacked.map(({ s, d }) => (
          <path key={s.key} d={d} fill={s.color} fillOpacity={0.45} />
        ))}
        {stacked.map(({ s, edge }) => (
          <path
            key={`${s.key}-edge`}
            d={edge}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
          />
        ))}

        {lines.map((s) => (
          <path
            key={s.key}
            d={pathFrom(s.values.map((v, i) => [X(i), YL(v || 0)]))}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
          />
        ))}

        {/* x labels at quarter points */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const i = Math.round(t * n);
          return (
            <text
              key={t}
              x={X(i)}
              y={H - 7}
              textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
              className="fill-dusk font-mono"
              style={{ fontSize: 10 }}
            >
              {xLabel(i)}
            </text>
          );
        })}

        {hover != null ? (
          <line
            x1={X(hover)}
            y1={PAD.top}
            x2={X(hover)}
            y2={PAD.top + plotH}
            stroke={CHART.crosshair}
            strokeDasharray="3 3"
          />
        ) : null}
      </svg>

      {hover != null ? (
        <Tooltip
          xFrac={X(hover) / W}
          title={labelForIndex(hover)}
          rows={series.map((s) => ({
            label: s.label,
            color: s.color,
            value: money2(s.values[hover] ?? 0),
          }))}
        />
      ) : null}
    </div>
  );
}

/** Single-axis multi-line chart — balance comparisons and growth curves. */
export function LineChart({
  series,
  xLabel,
  labelForIndex,
  height = 250,
  fillFirst = false,
}: {
  series: Series[];
  xLabel: (i: number) => string;
  labelForIndex: (i: number) => string;
  height?: number;
  /** Shade under the first series — used for the compounding curve. */
  fillFirst?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(1, (series[0]?.values.length ?? 1) - 1);
  const max = niceMax(
    Math.max(1, ...series.flatMap((s) => s.values.map((v) => v || 0))),
  );

  const right = 16;
  const pw = W - PAD.left - right;
  const X = (i: number) => PAD.left + (i / n) * pw;
  const Y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const gradId = `wc-fill-${series[0]?.key ?? "s"}`;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((x - PAD.left) / pw) * n);
          setHover(i >= 0 && i <= n ? i : null);
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={series[0]?.color ?? CHART.cost}
              stopOpacity={0.38}
            />
            <stop
              offset="100%"
              stopColor={series[0]?.color ?? CHART.cost}
              stopOpacity={0}
            />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + plotH - t * plotH;
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - right}
                y2={y}
                stroke={CHART.grid}
              />
              <text
                x={PAD.left - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-dusk font-mono"
                style={{ fontSize: 10 }}
              >
                {moneyShort(max * t)}
              </text>
            </g>
          );
        })}

        {fillFirst && series[0] ? (
          <path
            d={`${pathFrom(series[0].values.map((v, i) => [X(i), Y(v || 0)]))} L${X(n)} ${PAD.top + plotH} L${X(0)} ${PAD.top + plotH} Z`}
            fill={`url(#${gradId})`}
          />
        ) : null}

        {series.map((s) => (
          <path
            key={s.key}
            d={pathFrom(s.values.map((v, i) => [X(i), Y(v || 0)]))}
            fill="none"
            stroke={s.color}
            strokeWidth={2.5}
          />
        ))}

        {[0, 0.5, 1].map((t) => {
          const i = Math.round(t * n);
          return (
            <text
              key={t}
              x={X(i)}
              y={H - 7}
              textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
              className="fill-dusk font-mono"
              style={{ fontSize: 10 }}
            >
              {xLabel(i)}
            </text>
          );
        })}

        {hover != null ? (
          <line
            x1={X(hover)}
            y1={PAD.top}
            x2={X(hover)}
            y2={PAD.top + plotH}
            stroke={CHART.crosshair}
            strokeDasharray="3 3"
          />
        ) : null}
      </svg>

      {hover != null ? (
        <Tooltip
          xFrac={X(hover) / W}
          title={labelForIndex(hover)}
          rows={series.map((s) => ({
            label: s.label,
            color: s.color,
            value: money2(s.values[hover] ?? 0),
          }))}
        />
      ) : null}
    </div>
  );
}

/** Colour swatch + label list, rendered above or below a chart. */
export function ChartLegend({ series }: { series: Series[] }) {
  return (
    <div className="mb-2.5 flex flex-wrap gap-4">
      {series.map((s) => (
        <span
          key={s.key}
          className="inline-flex items-center gap-2 text-[12px] text-muted"
        >
          <span
            aria-hidden
            className={s.kind === "area" ? "h-3 w-3 rounded-[3px]" : "h-0.5 w-4"}
            style={{ background: s.color }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({
  xFrac,
  title,
  rows,
}: {
  xFrac: number;
  title: string;
  rows: { label: string; color: string; value: string }[];
}) {
  // Flip to the left of the cursor past the midpoint so it never clips out.
  const flip = xFrac > 0.55;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded-[10px] border border-edge-mid bg-panel px-3 py-2 font-mono text-[11.5px] shadow-lg"
      style={{
        left: `${xFrac * 100}%`,
        transform: `translateX(${flip ? "calc(-100% - 10px)" : "10px"})`,
      }}
    >
      <div className="mb-1.5 text-dusk">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-5 tabular-nums">
          <span style={{ color: r.color }}>{r.label}</span>
          <span className="text-fog">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
