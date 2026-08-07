"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";
import { COARSE_FRAME_MS, isCoarsePointer } from "@/lib/perf";
import { monthLabel, monthShortLabel } from "@/lib/quickbooks/periods";
import type { RevenueTimeline } from "@/lib/quickbooks/public-stats";
import {
  accrueAt,
  buildReplaySchedule,
  easeInOutCubic,
  fmtAgo,
  fmtCompact,
  fmtDelta,
  fmtExact,
  introView,
  lerpView,
  monotonePath,
  monotoneYAt,
  niceStep,
  polylineYAt,
  replayView,
  type ReplaySchedule,
  type View,
} from "@/lib/revenue-graph";

/**
 * The cumulative creator-revenue line under the proof stats — real QuickBooks
 * data drawn like a stock chart, floating on the mesh with no chrome.
 *
 * Five acts, one rAF director per act, all real figures:
 *
 *   drawing  the history through the replay anchor draws itself in (~2.6s):
 *            eased clip sweep, print-head hairline, odometer chip riding the
 *            glowing tip.
 *   zooming  the camera dives into the trailing window (~1.3s) — the view is
 *            interpolated in DATA space (indices × cents), so pixels derive
 *            per frame and a resize mid-flight just remaps.
 *   replay   the window's real income re-earns itself over ~a minute. The
 *            server decomposed it into per-creator per-category amounts;
 *            chips pop at the tip ("+$21,450 · BRAND DEALS") as their amounts
 *            ease into the line, the rest accrues silently, and the sum lands
 *            on the true total TO THE CENT. Timing within the month is
 *            synthetic (books are monthly); amounts never are. The header
 *            says "replaying" while it runs, which is what keeps a reload
 *            honest — a replay is supposed to replay. Click skips.
 *   live     the tip settles into the radar pulse, hover crosshair arms.
 *
 * The replay trace is drawn as a raw polyline of accrual samples — jagged
 * where history is smooth, which is exactly how "recent" should read. It's
 * pixel-space, so a resize during/after the replay drops it: mid-replay the
 * trace restarts from the current point, afterwards the true monthly curve
 * takes over (`jagged` state).
 *
 * React renders acts and chip spawns; every per-frame mutation is imperative
 * on refs with STABLE React props (React must never reclaim an attribute the
 * director is driving). Perf per the repo rules: rAF throttled to
 * COARSE_FRAME_MS on coarse pointers, the one SVG blur is desktop-only, and
 * prefers-reduced-motion skips every act straight to the settled frame.
 */

const PAD_TOP = 46; // headroom for the value chip riding the tip
const PAD_BOTTOM = 30; // x-axis tick labels
const PAD_RIGHT = 76; // the tip, its pulse and the settled chip stay unfaded

const INTRO_MS = 2600;
const HOLD_MS = 650;
const ZOOM_MS = 1300;
const REPLAY_MS = 56_000;
const TICKER_LIFE_MS = 2600;
/** How long the settled state breathes before the whole show reruns. */
const LOOP_DWELL_MS = 4500;
/** The fade-to-black between showings. */
const FADE_MS = 550;

/** "fading" is the loop's curtain: content fades, state resets to idle, and
    the intersection observer re-arms the full intro→zoom→replay from scratch. */
type Phase = "idle" | "armed" | "drawing" | "zooming" | "replay" | "live" | "fading";

type TickerChip = {
  id: number;
  born: number;
  x: number;
  y: number;
  amount: string;
  label: string;
};

export default function RevenueGraph({
  timeline,
  className = "",
}: {
  timeline: RevenueTimeline;
  className?: string;
}) {
  const { points, totalCents, creatorCount, updatedAt, replay } = timeline;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (s: string) => `rvg-${uid}-${s}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const clipRef = useRef<SVGRectElement>(null);
  const tipRef = useRef<SVGGElement>(null);
  const scanRef = useRef<SVGLineElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const chipValRef = useRef<HTMLSpanElement>(null);
  const replayLineRef = useRef<SVGPolylineElement>(null);
  const replayAreaRef = useRef<SVGPolygonElement>(null);

  const scheduleRef = useRef<ReplaySchedule | null>(null);
  const samplesRef = useRef<{ x: number; y: number }[]>([]);
  const sampleStrRef = useRef("");
  const chipSeq = useRef(0);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  /** Continuous hover: cursor x, the curve's y there, fractional month index. */
  const [scrub, setScrub] = useState<{ x: number; y: number; fi: number } | null>(null);
  const [syncedAgo, setSyncedAgo] = useState<string | null>(null);
  const [ticker, setTicker] = useState<TickerChip[]>([]);
  const [jagged, setJagged] = useState(false);

  const coarse = useMemo(() => isCoarsePointer(), []);
  const anchorIndex = replay ? replay.anchorIndex : points.length - 1;
  const anchorCents = points[anchorIndex].total;
  const windowCents = totalCents - anchorCents;

  /**
   * The x index of the final point — fractional when it's the current month,
   * so a week of August is a sliver of axis, not a month-wide plateau.
   */
  const lastIdx = useMemo(() => {
    const n = points.length - 1;
    const now = new Date();
    const cur = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (points[n].month !== cur) return n;
    const days = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return n - 1 + Math.min(1, Math.max(now.getUTCDate() / days, 0.08));
  }, [points]);

  const vIntro = useMemo(
    () => introView(points, anchorIndex, lastIdx),
    [points, anchorIndex, lastIdx],
  );
  const vReplay = useMemo(
    () => (replay ? replayView(points, anchorIndex, lastIdx) : null),
    [replay, points, anchorIndex, lastIdx],
  );
  const [view, setView] = useState<View>(vIntro);

  /* measure the stage — the SVG renders only once real pixels exist */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* a resize invalidates the pixel-space replay trace */
  useEffect(() => {
    if (!size) return;
    if (phase === "replay") {
      samplesRef.current = [];
      sampleStrRef.current = "";
      return;
    }
    if (phase !== "live") return;
    // deferred out of the effect body (no cascading render) — same pattern
    // as StatsGrid's reduced-motion path
    const timer = setTimeout(() => setJagged(false));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  /* "synced 42 min ago" — client clock only, so no hydration mismatch */
  useEffect(() => {
    if (!updatedAt) return;
    const tick = () => setSyncedAgo(fmtAgo(updatedAt));
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [updatedAt]);

  /* geometry — pure mapping from the data-space view to stage pixels */
  const geo = useMemo(() => {
    if (!size) return null;
    const { w, h } = size;
    const plotW = Math.max(w - PAD_RIGHT, 40);
    const plotB = h - PAD_BOTTOM;
    const [x0, x1] = view.xd;
    const [y0, y1] = view.yd;
    const xOf = (i: number) => ((i - x0) / (x1 - x0)) * plotW;
    const yOf = (v: number) => plotB - ((v - y0) / (y1 - y0)) * (plotB - PAD_TOP);
    const valueAtY = (y: number) =>
      y0 + ((plotB - y) / (plotB - PAD_TOP)) * (y1 - y0);
    /** Point index → x index, honouring the fractional final month. */
    const ix = (i: number) => (i === points.length - 1 ? lastIdx : i);

    const histXs = points.slice(0, anchorIndex + 1).map((_, i) => xOf(ix(i)));
    const histYs = points.slice(0, anchorIndex + 1).map((p) => yOf(p.total));
    const histLine = monotonePath(histXs, histYs);
    const histArea = `${histLine} L ${histXs[histXs.length - 1]} ${plotB + 4} L ${histXs[0]} ${plotB + 4} Z`;

    // the true monthly curve over the replay window — the resting-state trace
    // when no jagged replay polyline exists (reduced motion, post-resize)
    const tailXs = points.slice(anchorIndex).map((_, i) => xOf(ix(anchorIndex + i)));
    const tailYs = points.slice(anchorIndex).map((p) => yOf(p.total));
    const tailLine = monotonePath(tailXs, tailYs);
    const tailArea = `${tailLine} L ${tailXs[tailXs.length - 1]} ${plotB + 4} L ${tailXs[0]} ${plotB + 4} Z`;

    const range = y1 - y0;
    const step = niceStep(range / 3.2);
    const grid: { v: number; y: number }[] = [];
    for (let v = Math.ceil(y0 / step) * step; v <= y1 - range * 0.02; v += step) {
      if (v >= y0 + range * 0.04) grid.push({ v, y: yOf(v) });
    }
    const baselineY = y0 <= 0 && 0 <= y1 ? yOf(0) : null;

    // integer month indices inside the view, thinned to ~one per 110px,
    // skipping the left fade zone and the chip's landing zone at the right
    const first = Math.max(0, Math.ceil(x0));
    const last = Math.min(points.length - 1, Math.floor(x1));
    const visible: number[] = [];
    for (let i = first; i <= last; i++) visible.push(i);
    const tickStep = Math.max(1, Math.ceil(visible.length / Math.max(3, Math.floor(plotW / 110))));
    const ticks: { x: number; label: string }[] = [];
    for (let j = 0; j < visible.length; j += tickStep) {
      const i = visible[j];
      const x = xOf(ix(i));
      if (x < 44 || x > plotW - 34) continue;
      const [yy] = points[i].month.split("-");
      ticks.push({
        x,
        label: `${monthShortLabel(points[i].month).toUpperCase()} ’${yy.slice(2)}`,
      });
    }

    return {
      w, h, plotW, plotB, xOf, yOf, valueAtY, ix,
      histXs, histYs, histLine, histArea,
      tailXs, tailYs, tailLine, tailArea,
      grid, baselineY, ticks,
    };
  }, [size, points, view, anchorIndex, lastIdx]);

  /** The director acts read geometry through a ref, never a stale closure. */
  const geoRef = useRef(geo);
  useEffect(() => {
    geoRef.current = geo;
  }, [geo]);

  /* arm on scroll into view; reduced motion skips every act */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || phase !== "idle" || !geo) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (prefersReducedMotion()) {
          if (vReplay) setView(vReplay);
          setPhase("live");
        } else {
          setPhase("armed");
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, geo == null]);

  /* armed → drawing, in its own effect: scheduling this inside the observer
     effect gets the timer killed by that effect's own phase-triggered cleanup */
  useEffect(() => {
    if (phase !== "armed") return;
    const timer = setTimeout(() => setPhase("drawing"), 300);
    return () => clearTimeout(timer);
  }, [phase]);

  /** Chip rides above the tip; flips to the left once there's room. */
  const placeChip = (x: number, y: number) => {
    const chip = chipRef.current;
    if (!chip) return;
    chip.style.left = `${x}px`;
    chip.style.top = `${Math.max(y, PAD_TOP)}px`;
    chip.style.transform =
      x < 150
        ? "translate(14px, calc(-100% - 12px))"
        : "translate(calc(-100% - 14px), calc(-100% - 12px))";
  };

  /* act I — the history draws itself in */
  useEffect(() => {
    if (phase !== "drawing") return;
    const path = pathRef.current;
    if (!path) {
      setPhase(replay && vReplay ? "zooming" : "live");
      return;
    }
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: number | null = null;
    let last = 0;
    const frame = (t: number) => {
      if (start == null) start = t;
      if (coarse && t - last < COARSE_FRAME_MS) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = t;
      const p = Math.min(1, (t - start) / INTRO_MS);
      const pt = path.getPointAtLength(easeInOutCubic(p) * path.getTotalLength());
      clipRef.current?.setAttribute("width", String(pt.x + 3));
      tipRef.current?.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
      const scan = scanRef.current;
      if (scan) {
        scan.setAttribute("x1", String(pt.x));
        scan.setAttribute("x2", String(pt.x));
      }
      placeChip(pt.x, pt.y);
      if (chipValRef.current) {
        chipValRef.current.textContent = fmtExact(
          p >= 1 ? anchorCents : (geoRef.current?.valueAtY(pt.y) ?? 0),
        );
      }
      if (p < 1) raf = requestAnimationFrame(frame);
      else if (replay && vReplay) {
        timer = setTimeout(() => setPhase("zooming"), HOLD_MS);
      } else {
        setPhase("live");
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* act II — the camera dives into the trailing window */
  useEffect(() => {
    if (phase !== "zooming" || !vReplay) return;
    let raf = 0;
    let start: number | null = null;
    let last = 0;
    const frame = (t: number) => {
      if (start == null) start = t;
      if (coarse && t - last < COARSE_FRAME_MS) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = t;
      const p = Math.min(1, (t - start) / ZOOM_MS);
      const v = lerpView(vIntro, vReplay, easeInOutCubic(p));
      setView(v);
      // the tip holds the anchor point through the dive — position it from
      // the freshly interpolated view, not the (one-render-stale) geo
      const g = geoRef.current;
      if (g) {
        const x = ((anchorIndex - v.xd[0]) / (v.xd[1] - v.xd[0])) * g.plotW;
        const y =
          g.plotB -
          ((anchorCents - v.yd[0]) / (v.yd[1] - v.yd[0])) * (g.plotB - PAD_TOP);
        tipRef.current?.setAttribute("transform", `translate(${x} ${y})`);
        placeChip(x, y);
      }
      if (p < 1) raf = requestAnimationFrame(frame);
      else {
        setView(vReplay);
        setPhase("replay");
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* act III — the window re-earns itself */
  useEffect(() => {
    if (phase !== "replay" || !replay) return;
    const schedule = buildReplaySchedule(replay, points, lastIdx, REPLAY_MS, Math.random);
    scheduleRef.current = schedule;
    samplesRef.current = [];
    sampleStrRef.current = "";
    const jaggedTimer = setTimeout(() => setJagged(true));
    let raf = 0;
    let start: number | null = null;
    let last = 0;
    let spawned = 0;
    let lastPx = -Infinity;
    let lastPy = -Infinity;
    const pushSample = (px: number, py: number, plotB: number) => {
      // only when the trace moved a visible amount
      if (Math.abs(px - lastPx) < 0.6 && Math.abs(py - lastPy) < 0.6) return;
      const x = Math.round(px * 10) / 10;
      const y = Math.round(py * 10) / 10;
      samplesRef.current.push({ x, y });
      sampleStrRef.current += `${sampleStrRef.current ? " " : ""}${x},${y}`;
      lastPx = px;
      lastPy = py;
      replayLineRef.current?.setAttribute("points", sampleStrRef.current);
      replayAreaRef.current?.setAttribute(
        "points",
        `${sampleStrRef.current} ${lastPx},${plotB + 4} ${samplesRef.current[0]?.x ?? lastPx},${plotB + 4}`,
      );
    };
    const frame = (t: number) => {
      if (start == null) start = t;
      if (coarse && t - last < COARSE_FRAME_MS) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = t;
      const elapsed = t - start;
      const g = geoRef.current;
      if (!g) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const { cents, idx } = accrueAt(schedule, Math.min(elapsed, REPLAY_MS));
      const px = g.xOf(idx);
      const py = g.yOf(cents);
      pushSample(px, py, g.plotB);

      tipRef.current?.setAttribute("transform", `translate(${px} ${py})`);
      placeChip(px, py);
      if (chipValRef.current) {
        chipValRef.current.textContent = fmtExact(
          elapsed >= REPLAY_MS ? schedule.endCents : cents,
        );
      }

      // pop the chips whose moment has come
      const dueNow: TickerChip[] = [];
      while (spawned < schedule.chips.length && schedule.chips[spawned].t <= elapsed) {
        const c = schedule.chips[spawned++];
        dueNow.push({
          id: chipSeq.current++,
          born: t,
          x: Math.min(Math.max(px + (Math.random() - 0.5) * 26, 60), g.w - 90),
          y: Math.max(py - 26, 42),
          amount: `+${fmtExact(c.amountCents)}`,
          label:
            c.label.toUpperCase() +
            (replay.months.length > 1
              ? ` · ${monthShortLabel(c.month).toUpperCase()}`
              : ""),
        });
      }
      if (dueNow.length) {
        setTicker((prev) => [
          ...prev.filter((c) => t - c.born < TICKER_LIFE_MS),
          ...dueNow,
        ]);
      }

      if (elapsed < REPLAY_MS) raf = requestAnimationFrame(frame);
      else {
        setTicker([]);
        setPhase("live");
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(jaggedTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* settled state — also re-anchors the tip and chip after any resize */
  useEffect(() => {
    if (phase !== "live" || !geo) return;
    const x = geo.xOf(geo.ix(points.length - 1));
    const y = geo.yOf(totalCents);
    tipRef.current?.setAttribute("transform", `translate(${x} ${y})`);
    placeChip(x, y);
    if (chipValRef.current) chipValRef.current.textContent = fmtExact(totalCents);
  }, [phase, geo, points, totalCents]);

  /* the encore — while the section stays on screen (and nobody is mid-scrub),
     the whole show reruns after a breather: curtain-fade, then a fresh reveal
     from idle, exactly like a reload. A reload being coherent is what the
     REPLAYING label buys; a loop is the same statement twice. */
  useEffect(() => {
    if (phase !== "live" || !replay || scrub != null || prefersReducedMotion())
      return;
    const el = rootRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          timer ??= setTimeout(() => setPhase("fading"), LOOP_DWELL_MS);
        } else {
          clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [phase, replay, scrub]);

  /* the curtain: once faded, reset everything and hand back to idle — the
     intersection observer re-arms and the full intro runs again */
  useEffect(() => {
    if (phase !== "fading") return;
    const timer = setTimeout(() => {
      samplesRef.current = [];
      sampleStrRef.current = "";
      setTicker([]);
      setJagged(false);
      setView(vIntro);
      setPhase("idle");
    }, FADE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* the scrub — continuous, Robinhood-style: the crosshair follows the cursor
     pixel-for-pixel and the dot rides the drawn curve itself (same tangents as
     the path; linear over the jagged trace), values interpolated between
     months. Enabled once the theatre is over. */
  const onPointerMove = (e: React.PointerEvent) => {
    if (phase !== "live") return;
    const g = geoRef.current;
    const el = stageRef.current;
    if (!g || !el) return;
    const [x0, x1] = view.xd;
    const n = points.length;
    const minX = Math.max(g.xOf(0), 0);
    const maxX = g.xOf(lastIdx);
    const px = Math.min(Math.max(e.clientX - el.getBoundingClientRect().left, minX), maxX);
    // pixel → fractional data index; the final slot is compressed to lastIdx
    const xi = x0 + (px / g.plotW) * (x1 - x0);
    const fi =
      xi <= n - 2
        ? xi
        : n - 2 + Math.min(1, (xi - (n - 2)) / Math.max(lastIdx - (n - 2), 1e-6));
    const anchorX = g.xOf(g.ix(anchorIndex));
    const y =
      px <= anchorX || anchorIndex === n - 1
        ? monotoneYAt(g.histXs, g.histYs, px)
        : jagged
          ? polylineYAt(samplesRef.current, px)
          : monotoneYAt(g.tailXs, g.tailYs, px);
    if (y == null) return;
    setScrub({ x: px, y, fi: Math.max(0, Math.min(n - 1, fi)) });
  };

  const revealed = phase !== "idle";
  const gridShown = revealed && phase !== "zooming";
  const hover = phase === "live" && scrub != null && geo ? scrub : null;
  /** The month being earned where the cursor sits (segment i→i+1 is i+1). */
  const hoverMonth =
    hover != null
      ? points[Math.min(points.length - 1, Math.max(0, Math.ceil(hover.fi - 1e-4)))]
      : null;
  const hoverCents =
    hover != null && geo
      ? hover.fi >= points.length - 1 - 1e-4
        ? totalCents
        : Math.max(0, Math.round(geo.valueAtY(hover.y)))
      : 0;
  const replayMonthsLabel = replay
    ? replay.months.length > 1
      ? `${monthShortLabel(replay.months[0].month)}–${monthShortLabel(replay.months[replay.months.length - 1].month)} ’${replay.months[replay.months.length - 1].month.slice(2, 4)}`
      : `${monthShortLabel(replay.months[0].month)} ’${replay.months[0].month.slice(2, 4)}`
    : "";

  return (
    <div ref={rootRef} className={className}>
      {/* readout header */}
      <div className="mb-3 flex items-baseline justify-between gap-4 px-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted md:text-[10.5px] md:tracking-[0.18em]">
        <span>
          {phase === "replay" ? (
            <>
              <span className="text-magenta">{"// replaying "}</span>
              {`${replayMonthsLabel} · ${fmtDelta(windowCents).toLowerCase()} across ${creatorCount} creators`}
            </>
          ) : (
            <>
              {"// total creator revenue"}
              <span className="hidden sm:inline">{` · ${creatorCount} creators`}</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-2 whitespace-nowrap text-dusk">
          <span aria-hidden className="rvg-live-dot" />
          {syncedAgo ? `synced ${syncedAgo}` : "live from quickbooks"}
        </span>
      </div>

      <div
        ref={stageRef}
        className="relative h-[230px] transition-opacity duration-500 md:h-[320px]"
        style={{ opacity: phase === "fading" ? 0 : 1 }}
      >
        {/* masked chart layer — the fade IS the frame */}
        <div
          className="absolute inset-0"
          style={{
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0, #000 6%, #000 97%, transparent 100%)",
            maskImage:
              "linear-gradient(to right, transparent 0, #000 6%, #000 97%, transparent 100%)",
          }}
        >
          {geo && (
            <svg
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label={`Cumulative creator revenue, ${monthLabel(points[0].month)} to ${monthLabel(points[points.length - 1].month)}: ${fmtExact(totalCents)} across ${creatorCount} creators. Recent months replay as individual income amounts by category.`}
            >
              <defs>
                <linearGradient id={id("stroke")} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#8b2be8" />
                  <stop offset="55%" stopColor="#ff2d78" />
                  <stop offset="100%" stopColor="#ff5c96" />
                </linearGradient>
                <linearGradient
                  id={id("fill")}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1={PAD_TOP}
                  x2="0"
                  y2={geo.plotB}
                >
                  <stop offset="0%" stopColor="rgba(255,45,120,0.30)" />
                  <stop offset="45%" stopColor="rgba(255,45,120,0.10)" />
                  <stop offset="100%" stopColor="rgba(255,45,120,0)" />
                </linearGradient>
                <radialGradient id={id("halo")}>
                  <stop offset="0%" stopColor="rgba(255,45,120,0.55)" />
                  <stop offset="70%" stopColor="rgba(255,45,120,0)" />
                </radialGradient>
                <linearGradient id={id("scan")} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,45,120,0)" />
                  <stop offset="70%" stopColor="rgba(255,45,120,0.35)" />
                  <stop offset="100%" stopColor="rgba(255,45,120,0)" />
                </linearGradient>
                {!coarse && (
                  <filter id={id("blur")} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="5" />
                  </filter>
                )}
                <clipPath id={id("clip")}>
                  <rect
                    ref={clipRef}
                    x="0"
                    y="0"
                    width={phase === "idle" || phase === "armed" || phase === "drawing" ? 0 : "100%"}
                    height="100%"
                  />
                </clipPath>
              </defs>

              {/* grid + axis — recessive, hidden while the camera moves */}
              <g className="transition-opacity duration-700" opacity={gridShown ? 1 : 0}>
                {geo.grid.map(({ v, y }) => (
                  <line
                    key={v}
                    x1="0"
                    x2={geo.w}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.055)"
                  />
                ))}
                {geo.baselineY != null && (
                  <line
                    x1="0"
                    x2={geo.w}
                    y1={geo.baselineY}
                    y2={geo.baselineY}
                    stroke="rgba(255,255,255,0.09)"
                  />
                )}
                {geo.ticks.map((t) => (
                  <text
                    key={t.label}
                    x={t.x}
                    y={geo.plotB + 19}
                    textAnchor="middle"
                    className="font-mono text-[9px] tracking-[0.14em]"
                    fill="var(--color-faint)"
                  >
                    {t.label}
                  </text>
                ))}
              </g>

              {/* the history, revealed by the sweeping clip */}
              <g clipPath={`url(#${id("clip")})`}>
                <path d={geo.histArea} fill={`url(#${id("fill")})`} />
                {!coarse && (
                  <path
                    d={geo.histLine}
                    fill="none"
                    stroke={`url(#${id("stroke")})`}
                    strokeWidth={7}
                    opacity={0.35}
                    filter={`url(#${id("blur")})`}
                  />
                )}
                <path
                  d={geo.histLine}
                  fill="none"
                  stroke={`url(#${id("stroke")})`}
                  strokeWidth={5}
                  strokeLinecap="round"
                  opacity={0.14}
                />
                <path
                  ref={pathRef}
                  d={geo.histLine}
                  fill="none"
                  stroke={`url(#${id("stroke")})`}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                />
              </g>

              {/* the replay trace — jagged pixel-space accrual, driven
                  imperatively (props here must stay STABLE) */}
              {replay && (phase === "replay" || (phase === "live" && jagged)) && (
                <g>
                  <polygon ref={replayAreaRef} fill={`url(#${id("fill")})`} />
                  <polyline
                    ref={replayLineRef}
                    fill="none"
                    stroke="#ff5c96"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}
              {/* …or the true monthly curve, when no valid trace exists */}
              {replay && phase === "live" && !jagged && (
                <g>
                  <path d={geo.tailArea} fill={`url(#${id("fill")})`} />
                  <path
                    d={geo.tailLine}
                    fill="none"
                    stroke="#ff5c96"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                  />
                </g>
              )}

              {/* print-head hairline while drawing */}
              {(phase === "armed" || phase === "drawing") && (
                <line
                  ref={scanRef}
                  x1={0}
                  x2={0}
                  y1={PAD_TOP - 26}
                  y2={geo.plotB}
                  stroke={`url(#${id("scan")})`}
                  strokeWidth={1}
                />
              )}

              {/* hover crosshair */}
              {hover != null && (
                <g>
                  <line
                    x1={hover.x}
                    x2={hover.x}
                    y1={PAD_TOP - 10}
                    y2={geo.plotB}
                    stroke="rgba(255,255,255,0.14)"
                  />
                  <circle cx={hover.x} cy={hover.y} r={7} fill="rgba(255,45,120,0.18)" />
                  <circle
                    cx={hover.x}
                    cy={hover.y}
                    r={3}
                    fill="#ff2d78"
                    stroke="#fff"
                    strokeWidth={1}
                  />
                </g>
              )}

              {/* the live tip */}
              <g ref={tipRef} opacity={phase === "idle" || phase === "armed" ? 0 : 1}>
                <circle r={24} fill={`url(#${id("halo")})`} />
                {phase === "live" && <circle className="rvg-pulse" r={5} />}
                <circle r={3.5} fill="#ff2d78" />
                <circle r={1.5} fill="#fff" opacity={0.9} />
              </g>
            </svg>
          )}
        </div>

        {/* y-labels live OUTSIDE the mask, or the edge fade would erase them */}
        {geo &&
          geo.grid.map(({ v, y }) => (
            <span
              key={v}
              aria-hidden
              className="absolute left-0.5 font-mono text-[9px] tracking-[0.12em] text-faint transition-opacity duration-700"
              style={{ top: y - 14, opacity: gridShown ? 1 : 0 }}
            >
              {fmtCompact(v)}
            </span>
          ))}

        {/* value chip — odometers through every act, settles at the tip */}
        {revealed && phase !== "armed" && (
          <div
            ref={chipRef}
            className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-white/10 bg-panel/85 px-2.5 py-1.5 shadow-[0_10px_36px_-12px_rgba(255,45,120,0.45)] backdrop-blur-md ${
              phase === "live" ? "rvg-pop" : ""
            }`}
          >
            <span
              ref={chipValRef}
              className="font-mono text-[12px] font-semibold tabular-nums leading-none text-fog md:text-[13px]"
            />
          </div>
        )}

        {/* the ticker — real amounts, floating off the tip */}
        {ticker.map((c) => (
          <div
            key={c.id}
            aria-hidden
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
            style={{ left: c.x, top: c.y }}
          >
            <div className="rvg-float whitespace-nowrap rounded-lg border border-white/10 bg-panel/85 px-2.5 py-1.5 backdrop-blur-md">
              <span className="font-mono text-[12px] font-semibold tabular-nums leading-none text-teal">
                {c.amount}
              </span>
              <span className="ml-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">
                {c.label}
              </span>
            </div>
          </div>
        ))}

        {/* scrub tooltip — value read off the curve, month being earned */}
        {hover != null && hoverMonth != null && geo && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/10 bg-panel/90 px-3 py-2 backdrop-blur-md"
            style={{
              left: Math.min(Math.max(hover.x, 78), geo.w - 82),
              top: hover.y - 16,
            }}
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-dusk">
              {monthLabel(hoverMonth.month)}
            </div>
            <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums leading-none text-fog">
              {fmtExact(hoverCents)}
            </div>
            <div className="mt-1 font-mono text-[9.5px] tracking-[0.1em] text-mist">
              {fmtDelta(hoverMonth.income)}
              <span className="text-dusk"> that month</span>
            </div>
          </div>
        )}

        {/* pointer surface — scrubbing only, once the show has settled */}
        <div
          className="absolute inset-0"
          style={{ pointerEvents: phase === "live" ? "auto" : "none" }}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setScrub(null)}
        />
      </div>
    </div>
  );
}
