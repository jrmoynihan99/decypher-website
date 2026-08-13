"use client";

/**
 * Minimal SVG charts for the portal widgets.
 *
 * Hand-rolled rather than pulling in a charting library: the repo ships no
 * chart dependency today, these two shapes are all the widgets need, and a
 * 400kB import for one internal page is a bad trade.
 *
 * Rendering is in real pixel space: a ResizeObserver measures the container
 * and the viewBox matches it 1:1. The earlier `viewBox=720×320` +
 * `preserveAspectRatio="none"` approach stretched every axis label to the
 * container's aspect ratio — the "weird font" was text distortion, not the
 * typeface.
 *
 * Values animate between states (useAnimatedSeries): the axis snaps to the
 * new domain immediately, the marks glide over ~½s. Reduced-motion users get
 * the snap without the glide.
 *
 * Both charts share the hover model: the pointer's x maps to the nearest
 * data index; a crosshair, per-series markers, and a tooltip follow it.
 */

import { useEffect, useId, useRef, useState } from "react";
import { money2, moneyShort, niceMax } from "@/lib/widget-format";

/**
 * The chart palette, expressed as the palette tokens themselves so the
 * portal light theme re-binds every chart in one place. All chart color is
 * applied through `style` props (never bare SVG presentation attributes) —
 * attributes don't resolve var(), CSS properties do.
 */
export const CHART = {
  /** Cost, outflow, the thing you're trying to shrink. */
  cost: "var(--color-magenta)",
  /** Gain, equity, the thing you're trying to grow. */
  gain: "var(--color-teal)",
  /** A running cumulative total. */
  cumulative: "var(--color-ember)",
  /** A primary balance or level. */
  level: "var(--color-fog)",
  /** A baseline being compared against. */
  baseline: "var(--color-muted)",
  /** Gridlines and the hover crosshair. */
  grid: "var(--color-chart-grid)",
  crosshair: "var(--color-chart-crosshair)",
} as const;

export interface Series {
  key: string;
  label: string;
  color: string;
  /** "area" stacks against the other areas; "line" draws on the right axis. */
  kind: "area" | "line";
  values: number[];
}

const PAD = { top: 14, bottom: 30 };
const AXIS_FONT = 11.5;
const ANIM_MS = 500;

function pathFrom(pts: [number, number][]): string {
  return pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
}

/** Container width via ResizeObserver — charts render only once measured. */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Tween a matrix of series values toward its latest target. Interpolation
 * only runs when the shape (series count and point count) is unchanged — a
 * different shape means a different dataset, which snaps.
 */
function useAnimatedSeries(target: number[][]): number[][] {
  const [drawn, setDrawn] = useState(target);
  // Mirror of `drawn` plus the live rAF id — written ONLY inside the effect
  // and its animation frames, never during render.
  const live = useRef({ values: target, raf: 0, mounted: false });

  const key = target.map((s) => s.join(",")).join(";");
  useEffect(() => {
    if (!live.current.mounted) {
      live.current.mounted = true; // first run — drawn already equals target
      return;
    }
    const from = live.current.values;
    const to = target;
    const commit = (v: number[][]) => {
      live.current.values = v;
      setDrawn(v);
    };
    const sameShape =
      from.length === to.length &&
      from.every((s, i) => s.length === to[i].length);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!sameShape || reduce) {
      commit(to);
      return;
    }
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / ANIM_MS);
      const k = easeOut(t);
      commit(
        t >= 1
          ? to
          : from.map((s, si) => s.map((v, i) => v + (to[si][i] - v) * k)),
      );
      if (t < 1) live.current.raf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(live.current.raf);
    live.current.raf = requestAnimationFrame(step);
    const ref = live.current;
    return () => cancelAnimationFrame(ref.raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return drawn;
}

/** moneyShort with an explicit minus — axis ticks can sit below zero now. */
function tickLabel(v: number): string {
  return v < 0 ? `−${moneyShort(-v)}` : moneyShort(v);
}

/**
 * A y-domain that always includes zero and extends to a "nice" bound on
 * whichever sides the data occupies — negative months plot inside the chart
 * instead of running off the bottom edge.
 */
function niceDomain(values: number[]): { lo: number; hi: number } {
  const hiRaw = Math.max(0, ...values);
  const loRaw = Math.min(0, ...values);
  let hi = hiRaw > 0 ? niceMax(hiRaw) : 0;
  const lo = loRaw < 0 ? -niceMax(-loRaw) : 0;
  if (hi === 0 && lo === 0) hi = 1;
  return { lo, hi };
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
  const [wrapRef, W] = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);
  // useId emits colons, which url(#…) references choke on in some engines.
  const clipId = `fc-clip-${useId().replace(/:/g, "")}`;

  const drawnValues = useAnimatedSeries(series.map((s) => s.values));
  const drawnSeries = series.map((s, i) => ({
    ...s,
    values: drawnValues[i] ?? s.values,
  }));

  const areas = drawnSeries.filter((s) => s.kind === "area");
  const lines = drawnSeries.filter((s) => s.kind === "line");
  const n = Math.max(1, (series[0]?.values.length ?? 1) - 1);

  // Axis bounds come from the *target* values so the scale snaps while the
  // marks glide — a mid-tween axis would flicker through nonsense labels.
  const targetAreas = series.filter((s) => s.kind === "area");
  const targetLines = series.filter((s) => s.kind === "line");
  const areaMax = niceMax(
    Math.max(
      1,
      ...Array.from({ length: n + 1 }, (_, i) =>
        targetAreas.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
      ),
    ),
  );
  const lineMax = niceMax(
    Math.max(1, ...targetLines.flatMap((s) => s.values.map((v) => v || 0))),
  );

  if (!W) return <div ref={wrapRef} className="w-full" style={{ height }} />;

  const H = height;
  const left = W < 480 ? 52 : 62;
  const right = W < 480 ? 50 : 60;
  const plotW = W - left - right;
  const plotH = H - PAD.top - PAD.bottom;

  const X = (i: number) => left + (i / n) * plotW;
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
  const xTicks = W < 480 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - r.left;
          const i = Math.round(((x - left) / plotW) * n);
          setHover(i >= 0 && i <= n ? i : null);
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={left} y={0} width={plotW} height={PAD.top + plotH} />
          </clipPath>
        </defs>

        {/* horizontal grid + both axes */}
        {ticks.map((t) => {
          const y = PAD.top + plotH - t * plotH;
          return (
            <g key={t}>
              <line
                x1={left}
                y1={y}
                x2={W - right}
                y2={y}
                style={{ stroke: CHART.grid }}
              />
              <text
                x={left - 9}
                y={y + 4}
                textAnchor="end"
                className="fill-dusk font-mono"
                style={{ fontSize: AXIS_FONT }}
              >
                {tickLabel(areaMax * t)}
              </text>
              <text
                x={W - right + 9}
                y={y + 4}
                className="fill-faint font-mono"
                style={{ fontSize: AXIS_FONT }}
              >
                {tickLabel(lineMax * t)}
              </text>
            </g>
          );
        })}

        <g clipPath={`url(#${clipId})`}>
          {stacked.map(({ s, d }) => (
            <path key={s.key} d={d} style={{ fill: s.color }} fillOpacity={0.4} />
          ))}
          {stacked.map(({ s, edge }) => (
            <path
              key={`${s.key}-edge`}
              d={edge}
              fill="none"
              style={{ stroke: s.color }}
              strokeWidth={1.5}
            />
          ))}

          {lines.map((s) => (
            <path
              key={s.key}
              d={pathFrom(s.values.map((v, i) => [X(i), YL(v || 0)]))}
              fill="none"
              style={{ stroke: s.color }}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}
        </g>

        {/* x labels */}
        {xTicks.map((t) => {
          const i = Math.round(t * n);
          return (
            <text
              key={t}
              x={X(i)}
              y={H - 8}
              textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
              className="fill-dusk font-mono"
              style={{ fontSize: AXIS_FONT }}
            >
              {xLabel(i)}
            </text>
          );
        })}

        {hover != null ? (
          <g>
            <line
              x1={X(hover)}
              y1={PAD.top}
              x2={X(hover)}
              y2={PAD.top + plotH}
              style={{ stroke: CHART.crosshair }}
              strokeDasharray="3 3"
            />
            {lines.map((s) => (
              <circle
                key={s.key}
                cx={X(hover)}
                cy={YL(s.values[hover] || 0)}
                r={4}
                style={{ fill: s.color, stroke: "var(--color-panel)" }}
                strokeWidth={2}
              />
            ))}
          </g>
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
  endDot = false,
  endLabel,
}: {
  series: Series[];
  xLabel: (i: number) => string;
  labelForIndex: (i: number) => string;
  height?: number;
  /** Shade under the first series — used for the compounding curve. */
  fillFirst?: boolean;
  /** Mark the last point of the first series. */
  endDot?: boolean;
  /** Direct label drawn by the end dot (implies endDot). */
  endLabel?: string;
}) {
  const [wrapRef, W] = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);
  // useId emits colons, which url(#…) references choke on in some engines.
  const clipId = `lc-clip-${useId().replace(/:/g, "")}`;

  const drawnValues = useAnimatedSeries(series.map((s) => s.values));
  const drawnSeries = series.map((s, i) => ({
    ...s,
    values: drawnValues[i] ?? s.values,
  }));

  const n = Math.max(1, (series[0]?.values.length ?? 1) - 1);
  // Domain from the target values (axis snaps, marks glide) — and it now
  // spans zero, so negative months draw inside the plot instead of clipping
  // off the bottom edge.
  const { lo, hi } = niceDomain(series.flatMap((s) => s.values.map((v) => v || 0)));
  const span = hi - lo;

  if (!W) return <div ref={wrapRef} className="w-full" style={{ height }} />;

  const H = height;
  const left = W < 480 ? 52 : 62;
  const right = 16;
  const plotW = W - left - right;
  const plotH = H - PAD.top - PAD.bottom;

  const X = (i: number) => left + (i / n) * plotW;
  const Y = (v: number) => PAD.top + ((hi - v) / span) * plotH;
  const gradId = `wc-fill-${series[0]?.key ?? "s"}`;

  // Ticks: halves of each side of zero, deduped — [lo, lo/2, 0, hi/2, hi].
  const yTicks = Array.from(
    new Set(
      [lo, lo / 2, 0, hi / 2, hi].map((v) => Math.round(v * 100) / 100),
    ),
  ).sort((a, b) => a - b);
  const xTicks = W < 480 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];

  const first = drawnSeries[0];
  const lastIdx = (first?.values.length ?? 1) - 1;
  const lastVal = first?.values[lastIdx] ?? 0;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - r.left;
          const i = Math.round(((x - left) / plotW) * n);
          setHover(i >= 0 && i <= n ? i : null);
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: series[0]?.color ?? CHART.cost }}
              stopOpacity={0.34}
            />
            <stop
              offset="100%"
              style={{ stopColor: series[0]?.color ?? CHART.cost }}
              stopOpacity={0}
            />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x={left} y={0} width={plotW} height={PAD.top + plotH} />
          </clipPath>
        </defs>

        {yTicks.map((v) => {
          const y = Y(v);
          const isZero = v === 0 && lo < 0;
          return (
            <g key={v}>
              <line
                x1={left}
                y1={y}
                x2={W - right}
                y2={y}
                style={{ stroke: isZero ? CHART.crosshair : CHART.grid }}
              />
              <text
                x={left - 9}
                y={y + 4}
                textAnchor="end"
                className="fill-dusk font-mono"
                style={{ fontSize: AXIS_FONT }}
              >
                {tickLabel(v)}
              </text>
            </g>
          );
        })}

        <g clipPath={`url(#${clipId})`}>
          {fillFirst && first ? (
            <path
              d={`${pathFrom(first.values.map((v, i) => [X(i), Y(v || 0)]))} L${X(n)} ${Y(0)} L${X(0)} ${Y(0)} Z`}
              fill={`url(#${gradId})`}
            />
          ) : null}

          {drawnSeries.map((s) => (
            <path
              key={s.key}
              d={pathFrom(s.values.map((v, i) => [X(i), Y(v || 0)]))}
              fill="none"
              style={{ stroke: s.color }}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          ))}
        </g>

        {(endDot || endLabel) && first ? (
          <g>
            <circle
              cx={X(lastIdx)}
              cy={Y(lastVal)}
              r={4.5}
              style={{ fill: first.color, stroke: "var(--color-panel)" }}
              strokeWidth={2}
            />
            {endLabel ? (
              <text
                x={X(lastIdx) - 10}
                y={Y(lastVal) - 12}
                textAnchor="end"
                className="fill-fog font-display"
                style={{ fontSize: 15, fontWeight: 700 }}
              >
                {endLabel}
              </text>
            ) : null}
          </g>
        ) : null}

        {xTicks.map((t) => {
          const i = Math.round(t * n);
          return (
            <text
              key={t}
              x={X(i)}
              y={H - 8}
              textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
              className="fill-dusk font-mono"
              style={{ fontSize: AXIS_FONT }}
            >
              {xLabel(i)}
            </text>
          );
        })}

        {hover != null ? (
          <g>
            <line
              x1={X(hover)}
              y1={PAD.top}
              x2={X(hover)}
              y2={PAD.top + plotH}
              style={{ stroke: CHART.crosshair }}
              strokeDasharray="3 3"
            />
            {drawnSeries.map((s) => (
              <circle
                key={s.key}
                cx={X(hover)}
                cy={Y(s.values[hover] || 0)}
                r={4}
                style={{ fill: s.color, stroke: "var(--color-panel)" }}
                strokeWidth={2}
              />
            ))}
          </g>
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
        <div
          key={r.label}
          className="flex items-center justify-between gap-5 tabular-nums"
        >
          <span className="inline-flex items-center gap-1.5 text-mist">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: r.color }}
            />
            {r.label}
          </span>
          <span className="text-fog">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
