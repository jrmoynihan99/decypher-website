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
 * SERVICES VARIANT 10 — "THE FLYOVER"
 *
 * The zero-effort cut of the neural map: scroll is the flight stick. The
 * stage pins to the viewport and the scrollbar flies the camera from a
 * birds-eye view of all five nodes down into node 01 — the hub blooms into
 * a volumetric 3D neuron, and the service copy grows out of the node itself:
 * open editorial type anchored to the hub's screen position, scaled by the
 * live camera zoom, with The Pipeline's cursor-lagged drift. Then the camera
 * climbs out, glides across the web, and dives into the next node. Between
 * stops the zoom pulls wide so you always see where you are on the map; the
 * final stretch returns to orbit with every hub lit — all systems online.
 * Nothing to hover, nothing to figure out.
 */

// scroll progress at which each node is framed dead-center
const CENTERS = [0.13, 0.31, 0.49, 0.67, 0.85];
const HOLD = 0.052; // half-width of the "parked at the node" plateau
const EDGE = 0.092; // where a chapter has fully faded
const Z_MID = 1.32; // how wide the camera pulls between stops

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

// eased 0→1 that PARKS for the first `a` and last `b` fractions of the leg —
// this is what gives each fully-zoomed stop real scroll estate before the
// camera moves on
const park = (u: number, a: number, b: number) =>
  smooth(Math.min(1, Math.max(0, (u - a) / Math.max(0.001, 1 - a - b))));

export default function ServicesFlyover({
  content,
  services,
}: {
  content: SectionHeadingContent;
  services: CmsService[];
}) {
  const reduced = useReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const target = useRef<Cam>({ ...OVERVIEW });
  const energy = useRef<number[]>(HUBS.map(() => 0.08));
  const metrics = useRef<StageMetrics>({ fit: 0.75, sw: 1200, sh: 800 });

  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const numRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const promiseRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const railFillRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  // per-chapter visibility from the scroll plateau, consumed by onFrame
  const visRef = useRef<number[]>(HUBS.map(() => 0));

  const [active, setActive] = useState(0);
  const idxRef = useRef(-1);

  /* eased mouse-follow (The Pipeline's spring), applied per stage frame */
  const follow = useRef({ tx: 0, ty: 0, rx: 0, ry: 0, cx: 0, cy: 0, crx: 0, cry: 0 });

  useEffect(() => {
    if (reduced) return;
    const outer = outerRef.current;
    if (!outer) return;
    let raf = 0;

    const tick = () => {
      raf = 0;
      const vh = window.innerHeight;
      const total = Math.max(1, outer.offsetHeight - vh);
      const top = outer.getBoundingClientRect().top;
      const sp = Math.max(0, Math.min(1, -top / total));

      // ---- flight path ----
      const FZ = focusZoom(metrics.current);
      let cx: number;
      let cy: number;
      let z: number;
      if (sp <= CENTERS[0]) {
        // descent from orbit into node 01 — arrive early, then park
        const u = park(sp / CENTERS[0], 0.06, 0.24);
        cx = lerp(OVERVIEW.x, HUBS[0].x, u);
        cy = lerp(OVERVIEW.y, HUBS[0].y, u);
        z = lerp(OVERVIEW.z, FZ, u);
      } else if (sp >= CENTERS[CENTERS.length - 1]) {
        // climb back to orbit, then hold the all-lit finish before unpinning
        const li = CENTERS.length - 1;
        const u = park((sp - CENTERS[li]) / (1 - CENTERS[li]), 0.24, 0.2);
        cx = lerp(HUBS[li].x, OVERVIEW.x, u);
        cy = lerp(HUBS[li].y, OVERVIEW.y, u);
        z = lerp(FZ, OVERVIEW.z, u);
      } else {
        // hop between consecutive nodes — parked at both ends of the leg,
        // zoom breathing wide mid-flight
        let k = 0;
        while (sp > CENTERS[k + 1]) k++;
        const u = (sp - CENTERS[k]) / (CENTERS[k + 1] - CENTERS[k]);
        const s = park(u, 0.24, 0.24);
        cx = lerp(HUBS[k].x, HUBS[k + 1].x, s);
        cy = lerp(HUBS[k].y, HUBS[k + 1].y, s);
        z = FZ + (Z_MID - FZ) * Math.sin(Math.PI * s);
      }
      target.current = { x: cx, y: cy, z };

      // ---- chapter visibility + hub energy ----
      const outro = Math.max(0, (sp - 0.9) / 0.07);
      for (let i = 0; i < services.length; i++) {
        const aa = Math.abs(sp - CENTERS[i]);
        const vis =
          aa <= HOLD ? 1 : aa >= EDGE ? 0 : (EDGE - aa) / (EDGE - HOLD);
        const eased = smooth(vis);
        visRef.current[i] = eased;
        const label = labelRefs.current[i];
        if (label) label.style.opacity = (1 - eased).toFixed(3);
        energy.current[i] = Math.max(0.08 + eased * 0.92, outro * 0.75);
      }

      if (railFillRef.current)
        railFillRef.current.style.transform = `scaleY(${sp.toFixed(3)})`;

      // nearest node drives the counter + decrypt-on-arrival
      let idx = 0;
      for (let i = 1; i < CENTERS.length; i++)
        if (Math.abs(sp - CENTERS[i]) < Math.abs(sp - CENTERS[idx])) idx = i;
      if (idx !== idxRef.current && top < vh) {
        idxRef.current = idx;
        setActive(idx);
        if (counterRef.current)
          counterRef.current.textContent = `0${idx + 1}`;
        decryptTo(titleRefs.current[idx], services[idx].title, 460);
        decryptTo(promiseRefs.current[idx], services[idx].promise, 520);
      }
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    tick();

    const titles = [...titleRefs.current];
    const promises = [...promiseRefs.current];
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      titles.forEach(cancelDecrypt);
      promises.forEach(cancelDecrypt);
    };
  }, [reduced, services]);

  const onStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const s = follow.current;
    s.tx = dx * 14;
    s.ty = dy * 14;
    s.ry = dx * 5;
    s.rx = -dy * 5;
  };

  const onStageLeave = () => {
    const s = follow.current;
    s.tx = s.ty = s.rx = s.ry = 0;
  };

  // runs every stage frame: chapters are pinned to their hub's screen
  // position, growing/fading with the live camera zoom so the copy reads as
  // living ON the node; the cursor spring rides on top
  const onFrame = (cam: Readonly<Cam>) => {
    const s = follow.current;
    const k = 0.09;
    s.cx += (s.tx - s.cx) * k;
    s.cy += (s.ty - s.cy) * k;
    s.crx += (s.rx - s.crx) * k;
    s.cry += (s.ry - s.cry) * k;

    const m = metrics.current;
    const fz = focusZoom(m);
    const q = Math.max(0, Math.min(1, (cam.z - 1) / Math.max(0.001, fz - 1)));
    const grow = 0.38 + 0.62 * q;
    const reveal = smooth((q - 0.18) / 0.5);

    for (let i = 0; i < HUBS.length; i++) {
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

    const i = idxRef.current;
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

  const jumpTo = (i: number) => {
    const outer = outerRef.current;
    if (!outer) return;
    const outerTop = outer.getBoundingClientRect().top + window.scrollY;
    const total = Math.max(1, outer.offsetHeight - window.innerHeight);
    window.scrollTo({ top: outerTop + total * CENTERS[i] });
  };

  /* reduced motion: a plain, fully readable stack */
  if (reduced) {
    return (
      <section id="services" className="relative z-[1] px-6 pb-[120px] pt-[110px]">
        <div className="mx-auto max-w-[900px]">
          <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            {content.eyebrow}
          </p>
          <h2 className="mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog">
            {content.title}
          </h2>
          <div className="mt-10 space-y-8">
            {services.map((svc) => (
              <article
                key={svc.num}
                className="rounded-[20px] border border-edge bg-panel p-7"
              >
                <p className="m-0 font-mono text-[11px] tracking-[0.2em] text-faint">
                  NODE {svc.num} — {svc.nodeTag}
                </p>
                <h3 className="mt-3 font-display text-[clamp(24px,3vw,34px)] font-semibold tracking-[-0.015em] text-fog">
                  {svc.title}
                </h3>
                <p className="mb-0 mt-2 font-mono text-xs uppercase tracking-[0.16em] text-magenta">
                  {svc.promise}
                </p>
                <p className="mb-0 mt-3 text-[16px] leading-[1.65] text-mist">
                  {svc.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="services" className="relative z-[1]">
      {/* header lives above the pin in normal flow — once the map sticks,
          the viewport is pure map */}
      <div className="mx-auto max-w-[760px] px-6 pb-14 pt-[110px] text-center">
        <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
          {content.eyebrow}
        </p>
        <DecryptOnView
          as="h2"
          text={content.title ?? ""}
          className="mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
        />
        <p className="mx-auto mt-[18px] max-w-[52ch] text-base leading-relaxed text-mist">
          Five services, one network. Scroll &mdash; the camera does the rest.
        </p>
      </div>

      <div ref={outerRef} className="relative h-[640vh]">
        <div
          className="sticky top-0 h-svh overflow-hidden"
          onMouseMove={onStageMove}
          onMouseLeave={onStageLeave}
        >
          <NeuralStage
            target={target}
            energy={energy}
            onMetrics={(m) => {
              metrics.current = m;
            }}
            onFrame={onFrame}
            stiffness={9}
          >
            {services.map((svc, i) => {
              const hub = HUBS[i];
              return (
                // hub marker: the node itself is the canvas light source —
                // just a spacer over it plus a floating open-type label on a
                // leader line. The label yields to the chapter type while
                // the camera is parked.
                <div
                  key={svc.num}
                  className="absolute flex -translate-x-1/2 -translate-y-[36px] flex-col items-center"
                  style={{ left: hub.x, top: hub.y }}
                >
                  <span className="block h-[72px] w-[72px]" />
                  <span
                    ref={(el) => {
                      labelRefs.current[i] = el;
                    }}
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
                  </span>
                </div>
              );
            })}
          </NeuralStage>

          {/* chapters — anchored to their node's screen position every frame;
              scale + opacity ride the camera zoom (see onFrame) */}
          {services.map((svc, i) => (
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
              {/* giant gradient numeral — cursor-drifts 2.4× deeper */}
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
                      {svc.chips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-edge-bright px-[14px] py-1.5 font-mono text-[11.5px] tracking-[0.1em] text-mist"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* flight-plan rail */}
          <div className="absolute left-6 top-1/2 z-[3] hidden -translate-y-1/2 md:block lg:left-12">
            <div className="relative h-[42vh] w-[2px] rounded bg-edge">
              <div
                ref={railFillRef}
                className="h-full w-full origin-top rounded bg-[linear-gradient(#FF5C2E,#FF2D78,#8B2BE8)] shadow-[0_0_10px_rgba(255,45,120,.5)] [transform:scaleY(0)]"
              />
              {services.map((svc, i) => (
                <button
                  key={svc.num}
                  type="button"
                  onClick={() => jumpTo(i)}
                  aria-label={`Fly to ${svc.title}`}
                  style={{ top: `${CENTERS[i] * 100}%` }}
                  className="group absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full border transition-all ${
                      active === i
                        ? "border-magenta bg-magenta shadow-[0_0_10px_rgba(255,45,120,.8)]"
                        : "border-edge-bright bg-night group-hover:border-magenta"
                    }`}
                  />
                  <span
                    className={`whitespace-nowrap font-mono text-[10px] tracking-[0.18em] transition-colors ${
                      active === i
                        ? "text-fog"
                        : "text-faint group-hover:text-mist"
                    }`}
                  >
                    {svc.num}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* footer readout */}
          <div className="absolute inset-x-0 bottom-[26px] z-[3] flex items-center justify-center gap-4 font-mono text-[11px] tracking-[0.2em] text-faint">
            <span>
              NODE{" "}
              <span ref={counterRef} className="text-magenta">
                01
              </span>{" "}
              / 05
            </span>
            <span className="hidden sm:inline">
              SCROLL TO FLY <span className="animate-blink">▼</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
