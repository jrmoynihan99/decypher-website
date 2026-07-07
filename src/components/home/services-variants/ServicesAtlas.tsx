"use client";

import { useEffect, useRef, useState } from "react";
import DecryptOnView from "@/components/ui/DecryptOnView";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cancelDecrypt, decryptTo } from "@/lib/decrypt";
import type { CmsService, SectionHeadingContent } from "@/sanity/types";
import NeuralStage, {
  HUBS,
  HUB_COLORS,
  OVERVIEW,
  focusZoom,
  type Cam,
  type StageMetrics,
} from "@/components/home/services-variants/NeuralStage";

/**
 * SERVICES VARIANT 09 — "NEURAL ATLAS"
 *
 * All five services scattered across a fully lit neural map — every hub a
 * breathing light source, strands radiating, signal packets running the
 * backbone. HOVER never moves the camera (hover-driven zoom made it too
 * easy to re-zoom by accident on the way out): hovering a node illuminates
 * it and its network, spins its cluster up, and flashes a CLICK TO OPEN
 * cue. CLICKING dives the camera in — the hub blooms into a volumetric 3D
 * neuron and the copy grows out of the node as open editorial type with a
 * cursor-lagged drift. While zoomed, a CLICK TO CLOSE chip rides the
 * cursor: clicking anywhere off a node (or the node again, or Esc) climbs
 * back to orbit.
 *
 * `framed` renders the original contained cut — a rounded, bordered map
 * panel in page flow instead of a full-viewport stage.
 * Flat grid under prefers-reduced-motion.
 */

const BASE_ENERGY = 0.75; // resting state = everything online
const DIM_ENERGY = 0.3; // the other four while one is focused

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export default function ServicesAtlas({
  content,
  services,
  framed = false,
  bleedTo,
}: {
  content: SectionHeadingContent;
  services: CmsService[];
  framed?: boolean;
  /**
   * Unified page web: ref to a wrapper whose bottom edge the stage's canvas
   * should extend to (one continuous mesh flowing down behind the sections
   * that share the wrapper). Adds edge fades and removes the stage's own
   * stacking/clipping so the mesh can live behind sibling content.
   */
  bleedTo?: React.RefObject<HTMLDivElement | null>;
}) {
  const unified = !!bleedTo && !framed;
  const reduced = useReducedMotion();
  const target = useRef<Cam>({ ...OVERVIEW });
  const energy = useRef<number[]>(HUBS.map(() => BASE_ENERGY));
  const metrics = useRef<StageMetrics>({ fit: 0.75, sw: 1200, sh: 800 });
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const promiseRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  const numRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chipRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  // page-scroll spring: driven per stage frame with the same rate as the
  // camera, so centering the map and diving read as ONE motion instead of
  // the browser's smooth-scroll easing fighting the zoom spring
  const scrollAnim = useRef<{ target: number; pos: number } | null>(null);
  // per-chapter visibility, eased every frame toward (focused ? 1 : 0)
  const visRef = useRef<number[]>(HUBS.map(() => 0));

  const [focus, setFocus] = useState(-1);
  const focusRef = useRef(-1);
  const [hot, setHot] = useState(-1);
  const hotRef = useRef(-1);

  /* eased mouse-follow (The Pipeline's spring): targets set on mousemove,
     eased + applied every stage frame to the active chapter's type */
  const follow = useRef({ tx: 0, ty: 0, rx: 0, ry: 0, cx: 0, cy: 0, crx: 0, cry: 0 });

  // hover + focus feed one energy field: the focused node burns at full,
  // a hovered node lights up (and spins up) as the "you can click me" cue
  const applyEnergy = () => {
    const f = focusRef.current;
    const h = hotRef.current;
    energy.current = HUBS.map((_, j) => {
      if (j === f) return 1;
      if (f >= 0) return j === h ? 0.65 : DIM_ENERGY;
      if (h < 0) return BASE_ENERGY;
      return j === h ? 1 : 0.55;
    });
  };

  const setHotIdx = (i: number) => {
    if (hotRef.current === i) return;
    hotRef.current = i;
    setHot(i);
    applyEnergy();
  };

  const flyIn = (i: number) => {
    if (focusRef.current === i) return;
    focusRef.current = i;
    setFocus(i);
    applyEnergy();
    const hub = HUBS[i];
    target.current = { x: hub.x, y: hub.y, z: focusZoom(metrics.current) };
    // if the map is only partially in view, glide it into place while the
    // camera dives — the full-screen cut fills the viewport (align to top),
    // the framed cut centers its panel. Handled by our own spring in
    // onFrame rather than scrollIntoView so it shares the camera's easing.
    const el = stageWrapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const want = framed
        ? r.top + window.scrollY - Math.max(0, (window.innerHeight - r.height) / 2)
        : r.top + window.scrollY;
      const max =
        document.documentElement.scrollHeight - window.innerHeight;
      const st = Math.max(0, Math.min(max, want));
      if (Math.abs(st - window.scrollY) > 2)
        scrollAnim.current = { target: st, pos: window.scrollY };
    }
    decryptTo(titleRefs.current[i], services[i].title, 460);
    decryptTo(promiseRefs.current[i], services[i].promise, 520);
  };

  const pullBack = () => {
    focusRef.current = -1;
    setFocus(-1);
    applyEnergy();
    target.current = { ...OVERVIEW };
  };

  useEffect(() => {
    const titles = [...titleRefs.current];
    const promises = [...promiseRefs.current];
    return () => {
      titles.forEach(cancelDecrypt);
      promises.forEach(cancelDecrypt);
    };
  }, []);

  const onStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - (r.left + r.width / 2);
    const py = e.clientY - (r.top + r.height / 2);
    const s = follow.current;
    s.tx = (px / (r.width / 2)) * 14;
    s.ty = (py / (r.height / 2)) * 14;
    s.ry = (px / (r.width / 2)) * 5;
    s.rx = -(py / (r.height / 2)) * 5;
    // the CLICK TO CLOSE chip rides the cursor while zoomed
    if (chipRef.current)
      chipRef.current.style.transform = `translate(${(e.clientX - r.left + 18).toFixed(
        1,
      )}px, ${(e.clientY - r.top + 18).toFixed(1)}px)`;
  };

  const onStageLeave = () => {
    const s = follow.current;
    s.tx = s.ty = s.rx = s.ry = 0;
    setHotIdx(-1);
  };

  // runs every stage frame: the mouse-follow spring and the node-anchored
  // chapter reveal — each chapter is pinned to its hub's screen position
  // and grows/fades with the live camera zoom, so the copy reads as living
  // ON the node rather than appearing over it
  const onFrame = (cam: Readonly<Cam>) => {
    // page-scroll spring — same rate as the camera pan, cancelled the
    // moment the user scrolls themselves
    const sa = scrollAnim.current;
    if (sa) {
      const cur = window.scrollY;
      if (Math.abs(cur - sa.pos) > 4) {
        scrollAnim.current = null;
      } else {
        // integrate our own float position — re-reading scrollY would let
        // browser rounding eat the sub-pixel steps and stall short
        sa.pos += (sa.target - sa.pos) * 0.1;
        if (Math.abs(sa.target - sa.pos) < 0.5) {
          window.scrollTo({ top: sa.target, behavior: "instant" });
          scrollAnim.current = null;
        } else {
          window.scrollTo({ top: sa.pos, behavior: "instant" });
        }
      }
    }

    const s = follow.current;
    const k = 0.09; // low stiffness → the type trails the cursor
    s.cx += (s.tx - s.cx) * k;
    s.cy += (s.ty - s.cy) * k;
    s.crx += (s.rx - s.crx) * k;
    s.cry += (s.ry - s.cry) * k;

    const m = metrics.current;
    const fz = focusZoom(m);
    const q = Math.max(0, Math.min(1, (cam.z - 1) / Math.max(0.001, fz - 1)));
    const grow = 0.38 + 0.62 * q; // content scales up with the dive
    const reveal = smooth((q - 0.18) / 0.5); // fades in past ~1/5 of the dive

    for (let i = 0; i < HUBS.length; i++) {
      const v = visRef.current[i];
      visRef.current[i] = v + ((focusRef.current === i ? 1 : 0) - v) * 0.12;
      const el = chapterRefs.current[i];
      if (!el) continue;
      const o = visRef.current[i] * reveal;
      if (o < 0.015) {
        el.style.opacity = "0";
        continue;
      }
      const sx = m.sw / 2 + (HUBS[i].x - cam.x) * m.fit * cam.z;
      const sy = m.sh / 2 + (HUBS[i].y - cam.y) * m.fit * cam.z;
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(
        1,
      )}px) scale(${grow.toFixed(3)}) translate(-50%,-50%)`;
    }

    const i = focusRef.current;
    if (i < 0) return;
    const text = textRefs.current[i];
    if (text)
      text.style.transform = `perspective(900px) rotateX(${s.crx.toFixed(
        3,
      )}deg) rotateY(${s.cry.toFixed(3)}deg) translate3d(${s.cx.toFixed(
        2,
      )}px, ${s.cy.toFixed(2)}px, 0)`;
    const num = numRefs.current[i];
    if (num)
      num.style.transform = `translate3d(${(s.cx * 2.4).toFixed(2)}px, ${(
        s.cy * 2.4
      ).toFixed(2)}px, 0)`;
  };

  /* reduced motion: flat, fully readable grid */
  if (reduced) {
    return (
      <section id="services" className="relative z-[1] px-6 pb-[120px] pt-[110px]">
        <div className="mx-auto max-w-[1180px]">
          <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            {content.eyebrow}
          </p>
          <h2 className="mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog">
            {content.title}
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map((svc) => (
              <article
                key={svc.num}
                className="rounded-[20px] border border-edge-mid bg-panel p-6"
              >
                <div className="font-mono text-[12.5px] tracking-[0.14em] text-magenta">
                  {svc.num}
                </div>
                <h3 className="mt-2.5 font-display text-[22px] font-semibold tracking-[-0.01em] text-fog">
                  {svc.title}
                </h3>
                <p className="mb-0 mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-magenta">
                  {svc.promise}
                </p>
                <p className="mb-0 mt-3 text-[14.5px] leading-[1.62] text-mist">
                  {svc.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const header = (
    <div
      className={`mx-auto max-w-[760px] text-center ${
        framed ? "" : "px-6 pb-14 pt-[110px]"
      }`}
    >
      <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
        {content.eyebrow}
      </p>
      <DecryptOnView
        as="h2"
        text={content.title ?? ""}
        className="mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
      />
      <p className="mx-auto mt-[18px] max-w-[52ch] text-base leading-relaxed text-mist">
        Five services, one network. Click a node &mdash; the camera does the
        rest.
      </p>
    </div>
  );

  const stage = (
    <div
      ref={stageWrapRef}
      className={`${
        framed
          ? "relative mt-10 h-[min(82vh,820px)] overflow-hidden rounded-[24px] border border-edge bg-night/40"
          : unified
            ? "relative h-screen" // canvas must escape to bleed below
            : "relative h-screen overflow-hidden"
      } ${focus >= 0 ? "cursor-pointer" : ""}`}
      onMouseMove={onStageMove}
      onMouseLeave={onStageLeave}
      onKeyDown={(e) => {
        if (e.key === "Escape") pullBack();
      }}
      onClick={(e) => {
        // click anywhere off a node pulls back
        if (!(e.target as HTMLElement).closest("[data-node]")) pullBack();
      }}
    >
      <NeuralStage
        target={target}
        energy={energy}
        onMetrics={(m) => {
          metrics.current = m;
        }}
        onFrame={onFrame}
        bleedTo={unified ? bleedTo : undefined}
        bleedTop={unified ? 260 : 0}
        fadeTop={unified ? 320 : 0}
        fadeBottom={unified ? 220 : 0}
      >
        {services.map((svc, i) => {
          const hub = HUBS[i];
          const focused = focus === i;
          const dimmed = focus >= 0 && !focused;
          const hotHere = hot === i && !focused;
          return (
            // hub marker: the node itself is the canvas light source —
            // this is just a hit zone over it plus a floating open-type
            // label. Hover only illuminates + spins the node and flashes
            // the CLICK TO OPEN cue; the click does the flying.
            <button
              key={svc.num}
              type="button"
              data-node
              onMouseEnter={() => setHotIdx(i)}
              onMouseLeave={() => setHotIdx(-1)}
              onFocus={() => setHotIdx(i)}
              onBlur={() => setHotIdx(-1)}
              onClick={() => (focused ? pullBack() : flyIn(i))}
              aria-label={`Open ${svc.title}`}
              className={`pointer-events-auto absolute flex -translate-x-1/2 -translate-y-[36px] cursor-pointer flex-col items-center outline-none transition-opacity duration-500 ${
                focused ? "opacity-0" : ""
              } ${
                !focused && dimmed ? (hot === i ? "opacity-80" : "opacity-35") : ""
              }`}
              style={{ left: hub.x, top: hub.y }}
            >
              <span className="block h-[72px] w-[72px]" />
              <span
                className="animate-node-float flex flex-col items-center"
                style={{ animationDelay: `${i * -1.2}s` }}
              >
                <span
                  className="h-[12px] w-[1.5px]"
                  style={{
                    background: `linear-gradient(to bottom, ${HUB_COLORS[i]}AA, transparent)`,
                  }}
                />
                <span
                  className="mt-[5px] font-mono text-[10px] tracking-[0.3em]"
                  style={{
                    color: HUB_COLORS[i],
                    textShadow: `0 0 12px ${HUB_COLORS[i]}66`,
                  }}
                >
                  NODE {svc.num}
                </span>
                <span className="mt-[4px] whitespace-nowrap font-display text-[19px] font-bold tracking-[0.04em] text-fog [text-shadow:0_0_14px_rgba(10,10,14,.95),0_0_30px_rgba(10,10,14,.85)]">
                  {svc.title.toUpperCase()}
                </span>
                <span
                  className={`mt-[6px] font-mono text-[9.5px] tracking-[0.26em] transition-opacity duration-300 ${
                    hotHere ? "opacity-100" : "opacity-0"
                  }`}
                  style={{ color: HUB_COLORS[i] }}
                >
                  <span className="animate-blink">[ CLICK TO OPEN ]</span>
                </span>
              </span>
            </button>
          );
        })}
      </NeuralStage>

      {/* chapters — anchored to their node's screen position every frame;
          scale + opacity ride the camera zoom (see onFrame) */}
      {services.map((svc, i) => {
        const focused = focus === i;
        return (
          <div
            key={svc.num}
            ref={(el) => {
              chapterRefs.current[i] = el;
            }}
            className="pointer-events-none absolute left-0 top-0 z-[2] w-[min(860px,92vw)]"
            style={{ opacity: 0, willChange: "transform, opacity" }}
          >
            {/* soft vignette so the type reads over the structure */}
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 h-[620px] w-[940px] max-w-none -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(10,10,14,.62),rgba(10,10,14,.22)_58%,transparent_78%)]"
            />
            {/* giant gradient numeral — drifts 2.4× deeper than the type */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none">
              <div
                ref={(el) => {
                  numRefs.current[i] = el;
                }}
                style={{ willChange: "transform" }}
                className="text-grad font-display text-[min(36vw,360px)] font-bold leading-none opacity-[0.10]"
              >
                {svc.num}
              </div>
            </div>

            <div className="relative mx-auto text-center">
              <div
                ref={(el) => {
                  textRefs.current[i] = el;
                }}
                style={{ willChange: "transform" }}
              >
                <p className="m-0 font-mono text-[11px] tracking-[0.26em] text-faint">
                  NODE {svc.num} — {svc.nodeTag}{" "}
                  <span className="text-teal">● LIVE</span>
                </p>
                <h3
                  ref={(el) => {
                    titleRefs.current[i] = el;
                  }}
                  className="mt-4 font-display text-[clamp(32px,4.8vw,62px)] font-bold leading-[1.03] tracking-[-0.028em] text-fog"
                >
                  {svc.title}
                </h3>
                <p
                  ref={(el) => {
                    promiseRefs.current[i] = el;
                  }}
                  className="mb-0 mt-4 font-mono text-[12.5px] uppercase tracking-[0.22em] text-magenta"
                >
                  {svc.promise}
                </p>
                <p className="mx-auto mb-0 mt-4 max-w-[54ch] text-[clamp(15px,1.5vw,17px)] leading-[1.7] text-mist">
                  {svc.body}
                </p>
                {svc.chips && (
                  <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                    {svc.chips.map((chip, j) => (
                      <span
                        key={chip}
                        style={{
                          transitionDelay: focused ? `${240 + j * 70}ms` : "0ms",
                        }}
                        className={`rounded-full border border-edge-bright px-[14px] py-1.5 font-mono text-[11.5px] tracking-[0.1em] text-mist transition-[opacity,transform] duration-500 ${
                          focused
                            ? "translate-y-0 opacity-100"
                            : "translate-y-2 opacity-0"
                        }`}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* CLICK TO CLOSE — rides the cursor while zoomed (hidden while the
          cursor is offering a different node to open) */}
      <div
        ref={chipRef}
        className={`pointer-events-none absolute left-0 top-0 z-[4] transition-opacity duration-200 ${
          focus >= 0 && (hot < 0 || hot === focus) ? "opacity-100" : "opacity-0"
        }`}
        style={{ willChange: "transform" }}
      >
        <span className="whitespace-nowrap rounded-full border border-edge-mid bg-night/85 px-[10px] py-[4px] font-mono text-[10px] tracking-[0.22em] text-magenta">
          <span className="animate-blink">[ CLICK TO CLOSE ]</span>
        </span>
      </div>

      {/* HUD — just the flight hint */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[3] text-center font-mono text-[11px] tracking-[0.22em] text-faint">
        {focus >= 0 ? (
          <>
            LOCKED — <span className="text-magenta">NODE 0{focus + 1}</span> ·
            CLICK AWAY TO PULL BACK
          </>
        ) : (
          "HOVER A NODE · CLICK TO FLY IN"
        )}
      </div>
    </div>
  );

  return framed ? (
    <section id="services" className="relative z-[1] px-6 pb-[120px] pt-[110px]">
      <div className="mx-auto max-w-[1320px]">
        {header}
        {stage}
      </div>
    </section>
  ) : (
    // unified mode drops the section's own stacking context so the -z-10
    // canvas can sink behind the sibling sections in the shared wrapper
    <section id="services" className={unified ? "relative" : "relative z-[1]"}>
      {header}
      {stage}
    </section>
  );
}
