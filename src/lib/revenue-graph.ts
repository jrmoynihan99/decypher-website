/**
 * Pure math for the home revenue graph: path building, scale helpers, money
 * formatting, and the replay choreography (turning the server's real
 * creator×category amounts into a ~minute-long schedule).
 *
 * Client-safe: type-only imports from the server module, no I/O, no DOM. The
 * only impurity is the caller-supplied rng, injected so the component can pass
 * Math.random while tests could pass something fixed.
 */

import type {
  RevenuePoint,
  RevenueReplay,
} from "@/lib/quickbooks/public-stats";

/* ────────────────────────── easings ────────────────────────── */

export const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

export const easeInOutQuad = (p: number) =>
  p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ────────────────────────── money formats ────────────────────────── */

/** "$59,118,646" — the odometer, tooltip and ticker figure. */
export function fmtExact(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** "$59.1M" / "$820K" — grid labels and window totals. */
export function fmtCompact(cents: number): string {
  const d = Math.abs(cents) / 100;
  if (d >= 1_000_000) {
    const m = d / 1_000_000;
    return `$${m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (d >= 1_000) return `$${Math.round(d / 1_000)}K`;
  return `$${Math.round(d)}`;
}

export function fmtDelta(cents: number): string {
  return `${cents < 0 ? "−" : "+"}${fmtCompact(cents)}`;
}

export function fmtAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins} MIN AGO`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}H AGO`;
  return `${Math.floor(hours / 24)}D AGO`;
}

/** Smallest "nice" step (1/2/2.5/5 × 10^k) at or above `raw`. */
export function niceStep(raw: number): number {
  const k = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const c of [1, 2, 2.5, 5, 10]) if (c * k >= raw) return c * k;
  return 10 * k;
}

/* ────────────────────────── paths ────────────────────────── */

/** Steffen tangents — shared by the path builder and the hover evaluator. */
function steffenTangents(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i]);
    m.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
    }
  }
  t.push(m[n - 2]);
  return t;
}

/**
 * Monotone cubic path (Steffen tangents): follows the data smoothly but can
 * never overshoot it. Matters for a cumulative series — a Catmull-Rom curve
 * would dip below a flat month and show revenue "un-earning" itself.
 */
export function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n < 2) return n ? `M ${r2(xs[0])} ${r2(ys[0])}` : "";
  const t = steffenTangents(xs, ys);
  let d = `M ${r2(xs[0])} ${r2(ys[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (xs[i + 1] - xs[i]) / 3;
    d +=
      ` C ${r2(xs[i] + h)} ${r2(ys[i] + t[i] * h)}` +
      ` ${r2(xs[i + 1] - h)} ${r2(ys[i + 1] - t[i + 1] * h)}` +
      ` ${r2(xs[i + 1])} ${r2(ys[i + 1])}`;
  }
  return d;
}

/**
 * y at an arbitrary x on the SAME curve monotonePath draws — identical
 * tangents, Hermite-evaluated — so a scrubbing cursor's dot never sits off
 * the rendered line. Clamps outside the domain.
 */
export function monotoneYAt(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (!n) return 0;
  if (n === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const t = steffenTangents(xs, ys);
  let k = 0;
  while (k < n - 2 && xs[k + 1] < x) k++;
  const h = xs[k + 1] - xs[k];
  const u = (x - xs[k]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * ys[k] +
    (u3 - 2 * u2 + u) * h * t[k] +
    (-2 * u3 + 3 * u2) * ys[k + 1] +
    (u3 - u2) * h * t[k + 1]
  );
}

/** Linear y-at-x over a pixel-space polyline (the jagged replay trace). */
export function polylineYAt(
  samples: readonly { x: number; y: number }[],
  x: number,
): number | null {
  if (samples.length < 2) return samples[0]?.y ?? null;
  if (x <= samples[0].x) return samples[0].y;
  if (x >= samples[samples.length - 1].x) return samples[samples.length - 1].y;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].x >= x) {
      const a = samples[i - 1];
      const b = samples[i];
      const u = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * u;
    }
  }
  return samples[samples.length - 1].y;
}

/* ────────────────────────── views ────────────────────────── */

/**
 * A camera position in DATA space — x in fractional point indices, y in cents.
 * Resize-independent by construction: pixels are derived per frame from the
 * view and the measured stage, so a mid-animation resize just remaps.
 */
export type View = { xd: [number, number]; yd: [number, number] };

/**
 * The intro frame: all history through the anchor, floor at $0. `lastIdx` is
 * the (possibly fractional) x index of the final point — a month 7 days old
 * sits ~23% into its slot rather than claiming a full month of axis.
 */
export function introView(
  points: RevenuePoint[],
  anchorIndex: number,
  lastIdx: number,
): View {
  const peak = Math.max(
    ...points.slice(0, anchorIndex + 1).map((p) => p.total),
  );
  const step = niceStep(peak / 3.2);
  const yMax = Math.max(step, Math.ceil((peak * 1.04) / step) * step);
  const upper = anchorIndex === points.length - 1 ? lastIdx : anchorIndex;
  return { xd: [0, Math.max(upper, 1)], yd: [0, yMax] };
}

/**
 * The replay frame: the trailing window fills the stage, with a sliver of
 * history entering from the lower left. Spans are floored so a tiny window
 * (young month) can't zoom into a microscope shot of nothing.
 */
export function replayView(
  points: RevenuePoint[],
  anchorIndex: number,
  lastIdx: number,
): View {
  const anchorTotal = points[anchorIndex].total;
  const endTotal = points[points.length - 1].total;
  const span = Math.max(endTotal - anchorTotal, endTotal * 0.01);
  // 0.4 of a month of history — enough for the line to enter the frame with
  // direction, small enough that the minute-long sweep owns most of the width.
  return {
    xd: [anchorIndex - 0.4, lastIdx],
    yd: [
      anchorTotal - Math.max(span * 0.18, endTotal * 0.004),
      endTotal + Math.max(span * 0.26, endTotal * 0.006),
    ],
  };
}

export function lerpView(a: View, b: View, p: number): View {
  return {
    xd: [lerp(a.xd[0], b.xd[0], p), lerp(a.xd[1], b.xd[1], p)],
    yd: [lerp(a.yd[0], b.yd[0], p), lerp(a.yd[1], b.yd[1], p)],
  };
}

/* ────────────────────────── the replay schedule ────────────────────────── */

export type ScheduledChip = {
  /** ms from replay start. */
  t: number;
  amountCents: number;
  /** Server-classified from the account name — fixed vocabulary. */
  label: string;
  month: string;
};

type Segment = {
  month: string;
  /** Fractional point index the sweep covers for this month. */
  idxFrom: number;
  idxTo: number;
  t0: number;
  t1: number;
  /** Cumulative cents at the segment's start (absolute, not relative). */
  baseCents: number;
  incomeCents: number;
  backgroundCents: number;
  chips: ScheduledChip[];
};

export type ReplaySchedule = {
  segments: Segment[];
  chips: ScheduledChip[];
  startCents: number;
  endCents: number;
  windowCents: number;
};

/** How long a landed event takes to ease its amount into the line. */
const CHIP_RAMP_MS = 380;

/**
 * Lay the window's months out over the replay duration.
 *
 * Time per month is proportional to income but floored, so the partial
 * current month gets a readable moment rather than a 2% blink. Chip times are
 * evenly slotted with jitter and shuffled, so the big amounts land scattered
 * through the minute instead of sorted.
 */
export function buildReplaySchedule(
  replay: RevenueReplay,
  points: RevenuePoint[],
  lastIdx: number,
  durationMs: number,
  rng: () => number,
): ReplaySchedule {
  const startCents = points[replay.anchorIndex].total;
  const windowCents = replay.months.reduce((s, m) => s + m.incomeCents, 0);

  const weights = replay.months.map((m) =>
    Math.max(m.incomeCents, windowCents * 0.1),
  );
  const weightSum = weights.reduce((s, w) => s + w, 0);

  const segments: Segment[] = [];
  let t = 0;
  let base = startCents;
  replay.months.forEach((m, i) => {
    const dur = (weights[i] / weightSum) * durationMs;
    const idxFrom = replay.anchorIndex + i;
    const seg: Segment = {
      month: m.month,
      idxFrom,
      // The final (partial) month sweeps only to its true fraction of the
      // slot — a week of August is a sliver of x, not a month-wide plateau.
      idxTo: i === replay.months.length - 1 ? lastIdx : idxFrom + 1,
      t0: t,
      t1: t + dur,
      baseCents: base,
      incomeCents: m.incomeCents,
      backgroundCents: m.backgroundCents,
      chips: [],
    };

    // Slot the chips: even spacing + jitter inside the segment, with margins
    // so nothing lands during the handover between months.
    const amounts = [...m.featured];
    for (let j = amounts.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [amounts[j], amounts[k]] = [amounts[k], amounts[j]];
    }
    const lo = seg.t0 + Math.min(700, dur * 0.08);
    const hi = seg.t1 - Math.min(1100, dur * 0.12);
    amounts.forEach((event, j) => {
      const slot = (j + 0.5) / amounts.length;
      const jitter = ((rng() - 0.5) * 0.7) / amounts.length;
      seg.chips.push({
        t: lo + Math.min(Math.max(slot + jitter, 0), 1) * Math.max(hi - lo, 0),
        amountCents: event.amountCents,
        label: event.label,
        month: m.month,
      });
    });
    seg.chips.sort((a, b) => a.t - b.t);

    segments.push(seg);
    t += dur;
    base += m.incomeCents;
  });

  return {
    segments,
    chips: segments.flatMap((s) => s.chips),
    startCents,
    endCents: base,
    windowCents,
  };
}

/**
 * Where the replay stands at time `t`: the running total (monotone — background
 * accrues on an eased curve, each chip ramps its amount in over CHIP_RAMP_MS)
 * and the sweep's fractional x index. Completed segments contribute their full
 * income, so the end lands on endCents exactly.
 */
export function accrueAt(
  schedule: ReplaySchedule,
  t: number,
): { cents: number; idx: number } {
  let cents = schedule.startCents;
  let idx = schedule.segments[0]?.idxFrom ?? 0;
  for (const seg of schedule.segments) {
    if (t >= seg.t1) {
      cents = seg.baseCents + seg.incomeCents;
      idx = seg.idxTo;
      continue;
    }
    if (t < seg.t0) break;
    const p = (t - seg.t0) / (seg.t1 - seg.t0);
    // Scale by the segment's true x-span — the final partial month covers a
    // sliver of axis, and advancing a full month-width here sends the tip
    // sweeping past the chart's right edge.
    idx = seg.idxFrom + p * (seg.idxTo - seg.idxFrom);
    cents = seg.baseCents + seg.backgroundCents * easeInOutQuad(p);
    for (const chip of seg.chips) {
      if (chip.t > t) break;
      cents += chip.amountCents * easeOutCubic(Math.min(1, (t - chip.t) / CHIP_RAMP_MS));
    }
    break;
  }
  return { cents, idx };
}
