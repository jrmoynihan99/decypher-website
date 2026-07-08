"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";

/**
 * NEURAL STAGE — shared world + camera engine for the neural-web services
 * variants (Atlas / Flyover / Deep Field).
 *
 * A fixed 1600×1000 "world" holds five service hubs scattered across a living
 * neural mesh: drifting ambient nodes, violet strands, a bright backbone
 * wiring the hubs together, and signal pulses that travel the backbone when a
 * hub energizes. A camera {x, y, z} flies over the world — the canvas mesh is
 * drawn through the camera transform every frame, and DOM children render
 * inside a layer that receives the exact same matrix, so markers authored in
 * world coordinates stay glued to the mesh mid-flight.
 *
 * Each hub also carries a volumetric NEURON: a 3D particle cluster (soma,
 * dendrite spokes, inter-particle strands) projected with perspective onto
 * the hub's position. It blooms open as the hub's energy rises — invisible
 * from orbit, a slowly tumbling anatomical structure once the camera closes
 * in — and its rotation tilts toward the cursor for a parallax-depth feel.
 *
 * Parents own the flight plan: mutate `target.current` (camera) and
 * `energy.current` (0..1 per hub) and the stage springs toward them. Pan
 * tracks slightly faster than zoom on purpose — that lag between the two is
 * what makes a move read as a camera swoop instead of a scale tween.
 */

export interface Cam {
  x: number;
  y: number;
  z: number;
}

export interface StageMetrics {
  fit: number;
  sw: number;
  sh: number;
}

export const WORLD = { w: 1600, h: 1000 };

/** Scattered anchor for each of the five service hubs (world units). */
export const HUBS = [
  { x: 285, y: 250 },
  { x: 1235, y: 205 },
  { x: 800, y: 505 },
  { x: 350, y: 800 },
  { x: 1290, y: 775 },
];

export const HUB_COLORS = [
  "#FF2D78",
  "#8B2BE8",
  "#FF5C2E",
  "#FF2D78",
  "#8B2BE8",
];

export const NODE_TAGS = [
  "TAX_STRATEGY.NODE",
  "LLC_FILING.NODE",
  "BOOKKEEPING.NODE",
  "SCORP_PAYROLL.NODE",
  "FRACTIONAL_CFO.NODE",
];

/** Which hubs are wired to which — the bright backbone of the map. */
const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 2],
  [2, 3],
  [2, 4],
  [3, 4],
  [0, 3],
  [1, 4],
];

export const OVERVIEW: Cam = { x: WORLD.w / 2, y: WORLD.h / 2, z: 1 };

/** Zoom that shows roughly `viewW × viewH` world units in the stage. */
export function focusZoom(m: StageMetrics, viewW = 540, viewH = 430): number {
  const z = Math.min(m.sw / viewW, m.sh / viewH) / m.fit;
  return Math.max(1.7, Math.min(3.6, z));
}

/* ---- ambient mesh ---- */

// the drifting field extends past the world so wide stages never show bare
// corners at birds-eye
const FIELD = { x0: -520, y0: -360, x1: 2120, y1: 1360 };
const LINK = 145; // ambient link distance (world units ≈ NeuralWeb's 130px)
const STRAND_R = 300; // hub→ambient illumination radius
const MOUSE_R = 180; // cursor strand radius at birds-eye
const MAX_SPD = 0.55; // world units per 60fps frame (matches NeuralWeb)

interface Ambient {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hub: boolean;
  color: string;
  in: boolean;
}

const AMBIENT_COLORS = ["#FF2D78", "#8B2BE8", "#FF5C2E"];

/* ---- volumetric neurons ---- */

const NEURON_R = 165; // fully bloomed radius (world units)
const N_PTS = 62;

interface Neuron {
  pts: { x: number; y: number; z: number; violet: boolean }[];
  edges: [number, number][];
  spokes: number[]; // particle indices wired straight to the soma
}

function makeNeuron(): Neuron {
  const pts = Array.from({ length: N_PTS }, () => {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    // bias outward so the cluster reads as a shell with a busy membrane
    const r = 0.34 + 0.66 * Math.cbrt(Math.random());
    return {
      x: r * Math.sin(ph) * Math.cos(th),
      y: r * Math.sin(ph) * Math.sin(th),
      z: r * Math.cos(ph),
      violet: Math.random() < 0.35,
    };
  });
  const edges: [number, number][] = [];
  const deg = new Array(N_PTS).fill(0);
  for (let i = 0; i < N_PTS && edges.length < 92; i++) {
    for (let j = i + 1; j < N_PTS; j++) {
      if (deg[i] > 2 || deg[j] > 2) continue;
      const d = Math.hypot(
        pts[i].x - pts[j].x,
        pts[i].y - pts[j].y,
        pts[i].z - pts[j].z,
      );
      if (d < 0.46) {
        edges.push([i, j]);
        deg[i]++;
        deg[j]++;
      }
    }
  }
  const spokes: number[] = [];
  for (let i = 0; i < N_PTS && spokes.length < 12; i++) {
    const p = pts[i];
    if (Math.hypot(p.x, p.y, p.z) > 0.6) spokes.push(i);
  }
  return { pts, edges, spokes };
}

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

const HUB_RGB = HUB_COLORS.map((hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
}));

const rgba = (c: { r: number; g: number; b: number }, a: number) =>
  `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

export default function NeuralStage({
  target,
  energy,
  onMetrics,
  onFrame,
  stiffness = 6,
  bleedTo,
  bleedTop = 0,
  fadeTop = 0,
  fadeBottom = 0,
  children,
}: {
  /** Camera target — mutate freely; the stage springs toward it. */
  target: React.MutableRefObject<Cam>;
  /** Per-hub illumination targets, 0..1. */
  energy: React.MutableRefObject<number[]>;
  /** Called on mount/resize — stash it for computing focus zooms. */
  onMetrics?: (m: StageMetrics) => void;
  /** Called each frame with the smoothed camera (for HUD readouts). */
  onFrame?: (cam: Readonly<Cam>) => void;
  /** Spring rate — higher tracks the target tighter (scroll-scrub wants ~9). */
  stiffness?: number;
  /**
   * Unified page web: extend the canvas (and the ambient dot field) past the
   * stage bottom until it reaches this element's bottom edge — ONE mesh
   * flowing from the map down behind whatever sections share the wrapper.
   * The camera/world math stays anchored to the stage box itself.
   */
  bleedTo?: React.RefObject<HTMLElement | null>;
  /** Extend the canvas this many px ABOVE the stage top (mesh rises up
   *  behind the section header before the top fade takes it out). */
  bleedTop?: number;
  /** Mask fade distances (px) on the canvas top/bottom edges. */
  fadeTop?: number;
  fadeBottom?: number;
  children?: React.ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  // latest-callback refs so the render loop never goes stale and the main
  // effect doesn't re-run on every parent render
  const onFrameRef = useRef(onFrame);
  const onMetricsRef = useRef(onMetrics);
  useEffect(() => {
    onFrameRef.current = onFrame;
    onMetricsRef.current = onMetrics;
  });

  useEffect(() => {
    const stage = stageRef.current;
    const holder = holderRef.current;
    const canvas = canvasRef.current;
    const world = worldRef.current;
    if (!stage || !holder || !canvas || !world) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = prefersReducedMotion();

    let sw = 0;
    let sh = 0;
    let ch = 0; // full holder height = bleedTop + sh + bottom bleed
    let wh = 0; // canvas window height (≤ ch)
    let offY = 0; // window's offset down the holder
    let fit = 1;
    // The unified bleed can run the canvas down behind several sections;
    // clearing/compositing a page-height texture every frame is most of the
    // cost, so the canvas is viewport-sized (+margin) and slides down the
    // holder to track the visible band. With Lenis, scroll moves on the same
    // rAF tick before ours, so the window never lags; the margin covers
    // abrupt native jumps.
    const MARGIN = 400;
    // ambient field stretches to cover both bleeds
    let fieldY0 = FIELD.y0;
    let fieldY1 = FIELD.y1;
    let ambient: Ambient[] = [];
    const neurons = HUBS.map(makeNeuron);
    // per-hub tumble angle, integrated so spin speed can follow energy
    // (hover/focus spins a neuron up) without the angle jumping
    const rotAcc = HUBS.map((_, i) => i * 1.3);
    // per-hub eased "look-at" tilt toward the cursor
    const tiltX = HUBS.map(() => 0);
    const tiltY = HUBS.map(() => 0);
    // scratch buffers for neuron projection
    const prX = new Array(N_PTS).fill(0);
    const prY = new Array(N_PTS).fill(0);
    const prD = new Array(N_PTS).fill(0);

    // uniform grid for the ambient link pass — finds exactly the same pairs
    // as an all-pairs scan (cell size = LINK, so a partner can only sit in
    // the same or an adjacent cell) without the O(n²) distance checks
    let gCols = 0;
    let gRows = 0;
    let gHead = new Int32Array(0);
    let gNext = new Int32Array(0);
    let gCellX = new Int32Array(0);
    let gCellY = new Int32Array(0);

    const linkPair = (a: Ambient, b: Ambient) => {
      if (!a.in && !b.in) return;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > LINK * LINK) return;
      ctx.globalAlpha = (1 - Math.sqrt(d2) / LINK) * 0.24;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    const t0 = target.current;
    const cam = { x: t0.x, y: t0.y, lz: Math.log(t0.z) };
    const eng = energy.current.map(() => 0);
    let tm = 0; // seconds, for backbone pulses + neuron tumble
    // click-and-hold strengthens the cursor pull (same mechanic as the
    // background NeuralWeb): `grip` eases toward held-ness each frame so
    // the two modes blend instead of snapping
    let held = false;
    let grip = 0;

    const seed = () => {
      // sizes and hub-dot mix matched to the background NeuralWeb. Density
      // matches the EFFECTIVE density of those webs: they cap at 90 dots
      // per group canvas (~1 dot / 24000px²), so a fixed count here would
      // thin out as the unified canvas stretches over more sections —
      // scale with screen-projected area instead, under a generous cap.
      const area = (FIELD.x1 - FIELD.x0) * (fieldY1 - fieldY0) * fit * fit;
      const count = Math.max(30, Math.min(260, Math.round(area / 30000)));
      ambient = Array.from({ length: count }, () => {
        const hub = Math.random() < 0.12;
        return {
          x: FIELD.x0 + Math.random() * (FIELD.x1 - FIELD.x0),
          y: fieldY0 + Math.random() * (fieldY1 - fieldY0),
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          r: hub ? 2.6 + Math.random() * 1.4 : 1.1 + Math.random() * 1.2,
          hub,
          color:
            AMBIENT_COLORS[
              Math.random() < 0.45 ? 0 : Math.random() < 0.75 ? 1 : 2
            ],
          in: true,
        };
      });
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = sw;
      sw = stage.clientWidth;
      sh = stage.clientHeight;
      fit = Math.min(sw / WORLD.w, sh / WORLD.h) || 1;
      // unified page web: the canvas runs on past the stage bottom until it
      // reaches the bleed target's bottom edge
      const bleedEl = bleedTo?.current;
      const bleedPx = bleedEl
        ? Math.max(
            0,
            bleedEl.getBoundingClientRect().bottom -
              stage.getBoundingClientRect().bottom,
          )
        : 0;
      ch = bleedTop + sh + Math.round(bleedPx);
      holder.style.top = `${-bleedTop}px`;
      holder.style.height = `${ch}px`;
      // reduced motion draws one static frame — no loop to slide a window,
      // so it keeps the full-height canvas
      wh = reduce ? ch : Math.min(ch, window.innerHeight + MARGIN * 2);
      canvas.width = Math.max(1, Math.round(sw * dpr));
      canvas.height = Math.max(1, Math.round(wh * dpr));
      canvas.style.width = `${sw}px`;
      canvas.style.height = `${wh}px`;
      // world-y the canvas top/bottom map to at birds-eye, plus margin
      const tyOverview = sh / 2 - (WORLD.h / 2) * fit;
      const newFieldY0 = Math.min(
        FIELD.y0,
        -(bleedTop + tyOverview) / fit - 120,
      );
      const newFieldY1 = Math.max(
        FIELD.y1,
        (ch - bleedTop - tyOverview) / fit + 120,
      );
      const fieldJump =
        Math.abs(newFieldY1 - fieldY1) > 300 ||
        Math.abs(newFieldY0 - fieldY0) > 300;
      fieldY0 = newFieldY0;
      fieldY1 = newFieldY1;
      if (!ambient.length || Math.abs(sw - pw) > 200 || fieldJump) seed();
      onMetricsRef.current?.({ fit, sw, sh });
    };
    resize();

    // pointer in client coords, mapped to world / stage-normalized per frame
    const pointer = { cx: -1e5, cy: -1e5 };
    const onMove = (e: PointerEvent) => {
      pointer.cx = e.clientX;
      pointer.cy = e.clientY;
    };
    const onLeave = () => {
      pointer.cx = -1e5;
      pointer.cy = -1e5;
    };
    const onDown = (e: PointerEvent) => {
      held = true;
      // a stationary touch never fires pointermove — seed the position here
      // so tap-and-hold pulls the mesh toward the finger
      pointer.cx = e.clientX;
      pointer.cy = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      held = false;
      // touch has no hover: lifting the finger ends the interaction outright
      if (e.pointerType !== "mouse") onLeave();
    };

    let last = 0;
    const draw = (t: number) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
      const dtF = Math.min(2, dt * 60);
      last = t;
      tm += dt;
      // grip ramps 0→1 while held (≈0.3s) and back down on release; the
      // boosted pull and speed cap ride it, so the hand-off is one curve
      grip += ((held ? 1 : 0) - grip) * (1 - Math.exp(-dtF * 0.12));

      // camera spring — zoom eases slower than pan (the "swoop")
      const tg = target.current;
      const k = 1 - Math.exp(-dt * stiffness);
      const kz = 1 - Math.exp(-dt * stiffness * 0.72);
      cam.x += (tg.x - cam.x) * k;
      cam.y += (tg.y - cam.y) * k;
      cam.lz += (Math.log(Math.max(0.2, tg.z)) - cam.lz) * kz;
      const z = Math.exp(cam.lz);

      const scale = fit * z;
      const tx = sw / 2 - cam.x * scale;
      // stage-space transform for the DOM world layer; the canvas starts
      // bleedTop px higher, so its transform is offset by that much
      const tyW = sh / 2 - cam.y * scale;
      const ty = tyW + bleedTop;

      // hub energies chase their targets
      const te = energy.current;
      const ke = 1 - Math.exp(-dt * 6);
      for (let i = 0; i < eng.length; i++)
        eng[i] += ((te[i] ?? 0) - eng[i]) * ke;

      // the DOM world layer gets the identical matrix (in stage space)
      world.style.transform = `matrix(${scale},0,0,${scale},${tx},${tyW})`;
      world.style.opacity = "1";

      // slide the viewport-sized canvas window to the holder's visible band;
      // the context transform compensates, so world content stays put. The
      // holder itself is never transformed, so its rect doubles as the
      // pointer-mapping origin (what the canvas rect used to be).
      const rect = holder.getBoundingClientRect();
      if (wh < ch) {
        offY = Math.max(0, Math.min(ch - wh, -rect.top - MARGIN));
        canvas.style.transform = `translate3d(0,${offY.toFixed(1)}px,0)`;
      } else if (offY) {
        offY = 0;
        canvas.style.transform = "";
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, sw, wh);
      ctx.setTransform(
        dpr * scale,
        0,
        0,
        dpr * scale,
        dpr * tx,
        dpr * (ty - offY),
      );
      const px = 1.1 / scale; // ≈1 screen px regardless of zoom

      const hasPtr = pointer.cx > -1e4;

      // cursor in world coords + its influence, fading out as the camera
      // dives (same curve as the strands, so zoomed reading stays calm)
      const mxw = (pointer.cx - rect.left - tx) / scale;
      const myw = (pointer.cy - rect.top - ty) / scale;
      const fa = hasPtr
        ? Math.max(0, Math.min(1, (1.45 - z) / 0.45))
        : 0;

      // visible world rect (padded) for culling — the canvas WINDOW now,
      // not the full bleed, so off-screen stretches skip their draw work
      const vx0 = -tx / scale - LINK;
      const vy0 = (offY - ty) / scale - LINK;
      const vx1 = (sw - tx) / scale + LINK;
      const vy1 = (offY + wh - ty) / scale + LINK;

      // ambient drift — nodes near the cursor get gently pulled toward it,
      // exactly like the background NeuralWeb
      const pull = 0.028 * (1 + grip * 4.5);
      const spdCap = MAX_SPD * (1 + grip * 2.2);
      for (const n of ambient) {
        if (fa > 0) {
          const dx = mxw - n.x;
          const dy = myw - n.y;
          const d = Math.hypot(dx, dy);
          if (d < MOUSE_R && d > 1) {
            const f = (1 - d / MOUSE_R) * pull * fa * dtF;
            n.vx += (dx / d) * f;
            n.vy += (dy / d) * f;
          }
        }
        const spd = Math.hypot(n.vx, n.vy);
        if (spd > spdCap) {
          n.vx = (n.vx / spd) * spdCap;
          n.vy = (n.vy / spd) * spdCap;
        }
        n.x += n.vx * dtF;
        n.y += n.vy * dtF;
        if (n.x < FIELD.x0) n.x = FIELD.x1;
        else if (n.x > FIELD.x1) n.x = FIELD.x0;
        if (n.y < FIELD.y0) n.y = fieldY1;
        else if (n.y > fieldY1) n.y = FIELD.y0;
        n.in = n.x > vx0 && n.x < vx1 && n.y > vy0 && n.y < vy1;
      }

      // ambient mesh (violet, faint) — neighbor search via the uniform grid
      ctx.strokeStyle = "#8B2BE8";
      ctx.lineWidth = px;
      const cols = Math.max(1, Math.ceil((FIELD.x1 - FIELD.x0) / LINK));
      const rows = Math.max(1, Math.ceil((fieldY1 - fieldY0) / LINK));
      if (cols !== gCols || rows !== gRows || gNext.length < ambient.length) {
        gCols = cols;
        gRows = rows;
        gHead = new Int32Array(cols * rows);
        gNext = new Int32Array(Math.max(1, ambient.length));
        gCellX = new Int32Array(Math.max(1, ambient.length));
        gCellY = new Int32Array(Math.max(1, ambient.length));
      }
      gHead.fill(-1);
      for (let i = 0; i < ambient.length; i++) {
        const n = ambient[i];
        // clamped to the edge cells — a pair within LINK of each other can
        // never end up more than one cell apart even when clamped
        let cx = ((n.x - FIELD.x0) / LINK) | 0;
        let cy = ((n.y - fieldY0) / LINK) | 0;
        if (cx < 0) cx = 0;
        else if (cx >= cols) cx = cols - 1;
        if (cy < 0) cy = 0;
        else if (cy >= rows) cy = rows - 1;
        gCellX[i] = cx;
        gCellY[i] = cy;
        const ci = cy * cols + cx;
        gNext[i] = gHead[ci];
        gHead[ci] = i;
      }
      for (let i = 0; i < ambient.length; i++) {
        const a = ambient[i];
        const cx = gCellX[i];
        const cy = gCellY[i];
        // rest of own cell's chain, then the four forward-neighbor cells —
        // every in-range pair is visited exactly once
        for (let j = gNext[i]; j !== -1; j = gNext[j]) linkPair(a, ambient[j]);
        const right = cx + 1 < cols;
        if (right)
          for (let j = gHead[cy * cols + cx + 1]; j !== -1; j = gNext[j])
            linkPair(a, ambient[j]);
        if (cy + 1 < rows) {
          const rowBase = (cy + 1) * cols;
          if (cx > 0)
            for (let j = gHead[rowBase + cx - 1]; j !== -1; j = gNext[j])
              linkPair(a, ambient[j]);
          for (let j = gHead[rowBase + cx]; j !== -1; j = gNext[j])
            linkPair(a, ambient[j]);
          if (right)
            for (let j = gHead[rowBase + cx + 1]; j !== -1; j = gNext[j])
              linkPair(a, ambient[j]);
        }
      }

      // backbone edges between hubs — brighten when either end energizes
      for (const [ia, ib] of EDGES) {
        const a = HUBS[ia];
        const b = HUBS[ib];
        // both ends past the same window edge → the segment can't cross it
        if ((a.y < vy0 && b.y < vy0) || (a.y > vy1 && b.y > vy1)) continue;
        const e = Math.max(eng[ia] ?? 0, eng[ib] ?? 0);
        ctx.strokeStyle = "#8B2BE8";
        ctx.lineWidth = px;
        ctx.globalAlpha = 0.07 + e * 0.16;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (e > 0.06) {
          ctx.strokeStyle = "#FF2D78";
          ctx.lineWidth = px * 1.4;
          ctx.globalAlpha = e * 0.4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // signal pulses riding energized backbone edges
      ctx.fillStyle = "#FF2D78";
      for (let ei = 0; ei < EDGES.length; ei++) {
        const [ia, ib] = EDGES[ei];
        const e = Math.max(eng[ia] ?? 0, eng[ib] ?? 0);
        if (e < 0.25) continue;
        const a = HUBS[ia];
        const b = HUBS[ib];
        if ((a.y < vy0 && b.y < vy0) || (a.y > vy1 && b.y > vy1)) continue;
        // run pulses toward the hotter end
        const flip = (eng[ib] ?? 0) >= (eng[ia] ?? 0);
        for (let p = 0; p < 2; p++) {
          const u = (tm * 0.22 + ei * 0.37 + p * 0.5) % 1;
          const uu = flip ? u : 1 - u;
          ctx.globalAlpha = e * 0.7 * Math.sin(Math.PI * u);
          ctx.beginPath();
          ctx.arc(a.x + (b.x - a.x) * uu, a.y + (b.y - a.y) * uu, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // hub → ambient strands (the "it's part of the web" glow)
      for (let hi = 0; hi < HUBS.length; hi++) {
        const e = eng[hi] ?? 0;
        if (e < 0.03) continue;
        const h = HUBS[hi];
        // strands reach at most STRAND_R from the hub
        if (h.y + STRAND_R < vy0 || h.y - STRAND_R > vy1) continue;
        ctx.strokeStyle = HUB_COLORS[hi];
        ctx.lineWidth = px;
        for (const n of ambient) {
          if (!n.in && e < 0.5) continue;
          const d = Math.hypot(n.x - h.x, n.y - h.y);
          if (d > STRAND_R) continue;
          ctx.globalAlpha = (1 - d / STRAND_R) * 0.5 * e;
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(n.x, n.y);
          ctx.stroke();
        }
      }

      // cursor strands — birds-eye only, fading out as the camera dives
      if (fa > 0.02) {
        if (mxw > vx0 && mxw < vx1 && myw > vy0 && myw < vy1) {
          ctx.strokeStyle = "#FF2D78";
          ctx.lineWidth = px;
          for (const n of ambient) {
            const d = Math.hypot(n.x - mxw, n.y - myw);
            if (d > MOUSE_R) continue;
            ctx.globalAlpha = (1 - d / MOUSE_R) * 0.45 * fa;
            ctx.beginPath();
            ctx.moveTo(mxw, myw);
            ctx.lineTo(n.x, n.y);
            ctx.stroke();
          }
        }
      }

      // ambient nodes — hubs get the same soft halo as NeuralWeb's
      for (const n of ambient) {
        if (!n.in) continue;
        ctx.fillStyle = n.color;
        if (n.hub) {
          ctx.globalAlpha = 0.14;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.68;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // hub cores — each one a real light source: a white-hot center inside
      // the hub color, with a soft radial falloff that breathes bigger and
      // brighter. Hands off to the 3D neuron's soma as it blooms.
      ctx.globalAlpha = 1;
      for (let hi = 0; hi < HUBS.length; hi++) {
        const h = HUBS[hi];
        // glow radius tops out around 105 world units with the breathe
        if (h.y + 130 < vy0 || h.y - 130 > vy1) continue;
        const e = eng[hi] ?? 0;
        const bloom = smooth((e - 0.15) / 0.85);
        const rgb = HUB_RGB[hi];
        const breathe = Math.sin(tm * 1.7 + hi * 1.3);
        const dampen = 1 - 0.8 * bloom;

        // wide falloff glow
        const glowR = (36 + e * 54) * (1 + 0.16 * breathe);
        const ga = (0.32 + 0.38 * e) * dampen * (1 + 0.22 * breathe);
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, glowR);
        g.addColorStop(0, rgba(rgb, ga));
        g.addColorStop(0.35, rgba(rgb, ga * 0.35));
        g.addColorStop(1, rgba(rgb, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // white-hot core
        const coreR = (11 + e * 5) * (1 + 0.1 * breathe);
        const cg = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, coreR);
        cg.addColorStop(0, `rgba(255,255,255,${(0.95 * (1 - 0.45 * bloom)).toFixed(3)})`);
        cg.addColorStop(0.4, rgba(rgb, 0.85 * dampen));
        cg.addColorStop(1, rgba(rgb, 0));
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(h.x, h.y, coreR, 0, Math.PI * 2);
        ctx.fill();
      }

      // volumetric neurons — bloom open with energy, tumble slowly, tilt
      // toward the cursor. Drawn last so the structure sits over the mesh.
      for (let hi = 0; hi < HUBS.length; hi++) {
        const e = eng[hi] ?? 0;
        const bloom = smooth((e - 0.15) / 0.85);
        if (bloom < 0.02) continue;
        const h = HUBS[hi];
        // max projected particle reach ≈ NEURON_R × max perspective ≈ 300;
        // the tumble angle pauses off-window, which nothing can observe
        if (h.y + 340 < vy0 || h.y - 340 > vy1) continue;
        const neu = neurons[hi];
        const R = (30 + 135 * bloom) * (NEURON_R / 165);
        // each cluster leans toward the cursor RELATIVE TO ITSELF, with the
        // reaction falling off over distance — the network under your
        // pointer responds, the ones across the map stay calm
        let tyT = 0;
        let txT = 0;
        if (hasPtr) {
          const dxm = mxw - h.x;
          const dym = myw - h.y;
          const inf = Math.exp(-Math.hypot(dxm, dym) / 380);
          tyT = Math.max(-0.7, Math.min(0.7, dxm / 420)) * inf;
          txT = Math.max(-0.55, Math.min(0.55, dym / 420)) * inf;
        }
        const kt = 1 - Math.exp(-8 * dt);
        tiltY[hi] += (tyT - tiltY[hi]) * kt;
        tiltX[hi] += (txT - tiltX[hi]) * kt;
        rotAcc[hi] += dt * (0.18 + 0.5 * e);
        const rotY = rotAcc[hi] + tiltY[hi];
        const rotX = -0.3 + tiltX[hi];
        const cyr = Math.cos(rotY);
        const syr = Math.sin(rotY);
        const cxr = Math.cos(rotX);
        const sxr = Math.sin(rotX);

        for (let i = 0; i < N_PTS; i++) {
          const p = neu.pts[i];
          const X = p.x * cyr + p.z * syr;
          let Z = -p.x * syr + p.z * cyr;
          const Y = p.y * cxr - Z * sxr;
          Z = p.y * sxr + Z * cxr;
          const per = 2.2 / (2.2 + Z);
          prX[i] = h.x + X * per * R;
          prY[i] = h.y + Y * per * R;
          prD[i] = Math.max(0, Math.min(1, (per - 0.7) / 1.1)); // 0 far → 1 near
        }

        // inter-particle strands (violet, depth-faded)
        ctx.strokeStyle = "#8B2BE8";
        ctx.lineWidth = px;
        for (const [i, j] of neu.edges) {
          const d = (prD[i] + prD[j]) / 2;
          ctx.globalAlpha = (0.08 + 0.3 * d) * bloom;
          ctx.beginPath();
          ctx.moveTo(prX[i], prY[i]);
          ctx.lineTo(prX[j], prY[j]);
          ctx.stroke();
        }

        // dendrite spokes from the soma (hub color)
        ctx.strokeStyle = HUB_COLORS[hi];
        ctx.lineWidth = px * 1.2;
        for (const i of neu.spokes) {
          ctx.globalAlpha = (0.1 + 0.3 * prD[i]) * bloom;
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(prX[i], prY[i]);
          ctx.stroke();
        }

        // particles — near ones large + hot, far ones small + violet
        for (let i = 0; i < N_PTS; i++) {
          const p = neu.pts[i];
          ctx.fillStyle = p.violet ? "#8B2BE8" : HUB_COLORS[hi];
          ctx.globalAlpha = (0.25 + 0.7 * prD[i]) * bloom;
          ctx.beginPath();
          ctx.arc(
            prX[i],
            prY[i],
            (0.9 + 2.3 * prD[i]) * (0.5 + 0.5 * bloom),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }

        // pulsing soma
        const pulse = 0.5 + 0.5 * Math.sin(tm * 2.1 + hi * 1.7);
        ctx.fillStyle = HUB_COLORS[hi];
        ctx.globalAlpha = 0.22 * bloom * (0.7 + 0.3 * pulse);
        ctx.beginPath();
        ctx.arc(h.x, h.y, R * 0.24 * (1 + 0.12 * pulse), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.55 * bloom;
        ctx.beginPath();
        ctx.arc(h.x, h.y, R * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#F1EEF6";
        ctx.globalAlpha = 0.9 * bloom;
        ctx.beginPath();
        ctx.arc(h.x, h.y, R * 0.035 + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      onFrameRef.current?.({ x: cam.x, y: cam.y, z });
    };

    if (reduce) {
      // static frame at the current target — parents render flat fallbacks
      // anyway, this just avoids a blank stage if one doesn't
      cam.x = target.current.x;
      cam.y = target.current.y;
      cam.lz = Math.log(target.current.z);
      draw(16);
      const ro = new ResizeObserver(() => {
        resize();
        draw(16);
      });
      ro.observe(stage);
      if (bleedTo?.current) ro.observe(bleedTo.current);
      return () => ro.disconnect();
    }

    // Paint one frame synchronously on mount. The RAF loop below is gated
    // behind the IntersectionObserver, so it hasn't fired yet when a page's
    // view-transition snapshot is captured — without this the stage canvas is
    // blank in the snapshot and most of the atlas vanishes for the wipe.
    draw(16);

    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      draw(t);
    };
    // observe the HOLDER (stage + bleed): the sim must keep running while
    // any stretch of the unified web is on screen, not just the map
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) {
        if (!raf) {
          last = 0;
          raf = requestAnimationFrame(loop);
        }
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(holder);
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    // the sections under the bleed change height as they load/resize
    if (bleedTo?.current) ro.observe(bleedTo.current);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onLeave, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });

    return () => {
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, energy, stiffness, bleedTo, bleedTop]);

  const mask =
    fadeTop || fadeBottom
      ? `linear-gradient(to bottom, transparent 0, #000 ${fadeTop}px, #000 calc(100% - ${fadeBottom}px), transparent 100%)`
      : undefined;

  return (
    <div ref={stageRef} className="relative h-full w-full">
      {/* canvas holder — may run past the stage bottom (unified page web);
          -z-10 drops the mesh behind sibling section content, exactly like
          the background NeuralWeb instances */}
      <div
        ref={holderRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 w-full"
        style={{
          height: "100%",
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute left-0 top-0 will-change-transform"
        />
      </div>
      {/* world layer, in its own clip box so a zoomed-in world never paints
          over neighboring sections; hidden until the first frame stamps a
          real transform */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          ref={worldRef}
          className="pointer-events-none absolute left-0 top-0 origin-top-left will-change-transform"
          style={{ width: WORLD.w, height: WORLD.h, opacity: 0 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
