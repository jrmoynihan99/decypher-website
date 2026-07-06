"use client";

import { useEffect, useRef, useState } from "react";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import ServicesTicker from "@/components/home/services-variants/ServicesTicker";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SERVICES } from "@/lib/content";
import { cancelDecrypt, decryptTo, encrypt } from "@/lib/decrypt";

/**
 * SERVICES VARIANT 06 — "THE PIPELINE"
 *
 * Zero pinning, zero steps: all three services sit in normal page flow,
 * zigzagging along a central circuit spine in the same open editorial type
 * as "The Sequence" — giant gradient numeral behind big display headlines,
 * no boxed cards. As you scroll, a gradient charge fills the spine with a
 * pulse riding its head, and each row powers on the moment it enters view:
 * the node casts a cone of light outward across the row, a glow blooms
 * behind the copy, the headline decrypts, chips stagger up. Every word is
 * on the page and readable at all times; scrolling is the only input.
 */

const FILE_TAGS = [
  "FILE 01 — TAX_STRATEGY.ENC",
  "FILE 02 — LLC_FILING.ENC",
  "FILE 03 — BOOKKEEPING.ENC",
];

export default function ServicesCircuit() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const promiseRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const [powered, setPowered] = useState([false, false, false]);
  const poweredRef = useRef([false, false, false]);
  const reduced = useReducedMotion();

  /* rows rest encrypted & dormant until the charge reaches them */
  useEffect(() => {
    if (reduced) return;
    const titles = [...titleRefs.current];
    const promises = [...promiseRefs.current];
    titles.forEach((el, i) => encrypt(el, SERVICES[i].title));
    promises.forEach((el, i) => encrypt(el, SERVICES[i].promise));
    return () => {
      titles.forEach((el, i) => {
        cancelDecrypt(el);
        if (el) el.textContent = SERVICES[i].title;
      });
      promises.forEach((el, i) => {
        cancelDecrypt(el);
        if (el) el.textContent = SERVICES[i].promise;
      });
    };
  }, [reduced]);

  /* the spine charges with scroll; a pulse rides the head of the charge, and
     each row powers on the instant that pulse crosses its node on the spine */
  useEffect(() => {
    if (reduced) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = window.innerHeight;
      const r = wrap.getBoundingClientRect();
      const height = Math.max(1, r.height);
      const p = Math.max(0, Math.min(1, (vh * 0.68 - r.top) / height));
      if (fillRef.current)
        fillRef.current.style.transform = `scaleY(${p.toFixed(4)})`;
      if (dotRef.current) dotRef.current.style.top = `${(p * 100).toFixed(2)}%`;

      // charge head position within the spine, in wrap-local pixels
      const chargeY = p * height;
      let changed = false;
      for (let i = 0; i < SERVICES.length; i++) {
        if (poweredRef.current[i]) continue;
        const row = rowRefs.current[i];
        if (!row) continue;
        // node sits at the row's vertical center on the spine
        const nodeY = row.offsetTop + row.offsetHeight / 2;
        if (chargeY >= nodeY) {
          poweredRef.current[i] = true;
          changed = true;
          decryptTo(titleRefs.current[i], SERVICES[i].title, 460);
          decryptTo(promiseRefs.current[i], SERVICES[i].promise, 520);
        }
      }
      if (changed) setPowered([...poweredRef.current]);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    tick();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <section id="services" className="relative z-[1] px-6 pb-[130px] pt-[110px]">
      <div className="relative mx-auto max-w-[760px] text-center">
        <GlowOrb size={640} alpha={0.14} />
        <p className="relative m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
          [ 05 // services ]
        </p>
        <DecryptOnView
          as="h2"
          text="One stop shop for your creator business."
          className="relative mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
        />
        <p className="relative mx-auto mt-[18px] max-w-[52ch] text-base leading-relaxed text-mist">
          Three services, one pipeline. Keep scrolling &mdash; the charge does
          the rest.
        </p>
      </div>

      <ServicesTicker className="mx-auto mt-10 max-w-[1080px]" />

      <div ref={wrapRef} className="relative mx-auto mt-16 max-w-[1280px]">
        {/* spine */}
        <div className="absolute bottom-0 left-6 top-0 w-[2px] -translate-x-1/2 rounded bg-edge md:left-1/2">
          <div
            ref={fillRef}
            className="h-full w-full origin-top rounded bg-[linear-gradient(#FF5C2E,#FF2D78,#8B2BE8)] shadow-[0_0_12px_rgba(255,45,120,.5)]"
            style={{ transform: reduced ? "scaleY(1)" : "scaleY(0)" }}
          />
        </div>
        {/* the pulse riding the charge */}
        {!reduced && (
          <div
            ref={dotRef}
            aria-hidden
            className="absolute left-6 z-[2] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-pulse-ring rounded-full bg-magenta shadow-[0_0_18px_rgba(255,45,120,.9)] md:left-1/2"
            style={{ top: 0 }}
          />
        )}

        {SERVICES.map((svc, i) => (
          <PipelineRow
            key={svc.num}
            svc={svc}
            i={i}
            on={reduced || powered[i]}
            leftSide={i % 2 === 0}
            reduced={reduced}
            registerRow={(el) => {
              rowRefs.current[i] = el;
            }}
            registerTitle={(el) => {
              titleRefs.current[i] = el;
            }}
            registerPromise={(el) => {
              promiseRefs.current[i] = el;
            }}
          />
        ))}

        {/* pipeline terminus */}
        <div className="relative mt-20 pl-14 text-left md:pl-0 md:text-center">
          <span className="font-mono text-[11px] tracking-[0.22em] text-faint">
            [ PIPELINE COMPLETE — 03/03 SERVICES ONLINE ]
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * One service row. Owns its hover state so the whole content item reacts as a
 * unit: the ambient glow and spine node brighten, and the copy drifts toward
 * the cursor with an eased lag (a rAF spring, low stiffness = trailing feel).
 * The giant numeral drifts further than the text for a layered parallax depth.
 */
function PipelineRow({
  svc,
  i,
  on,
  leftSide,
  reduced,
  registerRow,
  registerTitle,
  registerPromise,
}: {
  svc: (typeof SERVICES)[number];
  i: number;
  on: boolean;
  leftSide: boolean;
  reduced: boolean;
  registerRow: (el: HTMLDivElement | null) => void;
  registerTitle: (el: HTMLHeadingElement | null) => void;
  registerPromise: (el: HTMLParagraphElement | null) => void;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  /* eased mouse-follow state, driven imperatively to avoid per-move rerenders */
  const follow = useRef({
    tx: 0,
    ty: 0,
    rx: 0,
    ry: 0,
    cx: 0,
    cy: 0,
    crx: 0,
    cry: 0,
    raf: 0,
    running: false,
  });

  useEffect(() => {
    const f = follow.current;
    return () => {
      if (f.raf) cancelAnimationFrame(f.raf);
    };
  }, []);

  const runLoop = () => {
    const s = follow.current;
    if (s.running) return;
    s.running = true;
    const step = () => {
      const k = 0.09; // low stiffness → the content lags behind the cursor
      s.cx += (s.tx - s.cx) * k;
      s.cy += (s.ty - s.cy) * k;
      s.crx += (s.rx - s.crx) * k;
      s.cry += (s.ry - s.cry) * k;
      if (textRef.current)
        textRef.current.style.transform = `perspective(900px) rotateX(${s.crx.toFixed(
          3,
        )}deg) rotateY(${s.cry.toFixed(3)}deg) translate3d(${s.cx.toFixed(
          2,
        )}px, ${s.cy.toFixed(2)}px, 0)`;
      if (numRef.current)
        numRef.current.style.transform = `translate3d(${(s.cx * 2.4).toFixed(
          2,
        )}px, ${(s.cy * 2.4).toFixed(2)}px, 0)`;
      const rest =
        Math.abs(s.tx - s.cx) < 0.03 &&
        Math.abs(s.ty - s.cy) < 0.03 &&
        Math.abs(s.rx - s.crx) < 0.02 &&
        Math.abs(s.ry - s.cry) < 0.02;
      if (rest && s.tx === 0 && s.ty === 0 && s.rx === 0 && s.ry === 0) {
        s.running = false;
        s.raf = 0;
        return;
      }
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const s = follow.current;
    s.tx = dx * 12;
    s.ty = dy * 12;
    s.ry = dx * 4.5;
    s.rx = -dy * 4.5;
    runLoop();
  };

  const onLeave = () => {
    if (reduced) return;
    setHovered(false);
    const s = follow.current;
    s.tx = s.ty = s.rx = s.ry = 0;
    runLoop();
  };

  return (
    <div
      ref={registerRow}
      data-i={i}
      className="relative mt-20 py-6 first:mt-0 md:mt-28"
    >
      {/* row glow — blooms on power-on, brightens on hover */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-[-90px] hidden transition-[opacity,filter,transform] duration-700 md:block ${
          on ? "opacity-100" : "opacity-0"
        } ${hovered ? "scale-[1.06] brightness-[1.6]" : ""} ${
          leftSide ? "left-0 right-1/2" : "left-1/2 right-0"
        }`}
      >
        <GlowOrb size={560} alpha={0.15} beta={0.1} duration={16} />
      </div>

      {/* node on the spine — the light source; flares brighter on hover */}
      <span
        className={`absolute left-6 top-8 z-[2] flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border font-mono text-[11.5px] font-bold transition-all duration-500 md:left-1/2 md:top-1/2 md:-translate-y-1/2 ${
          on
            ? "border-transparent bg-[radial-gradient(circle_at_38%_32%,#FF8FB8,#FF2D78_58%,#D91B5F)] text-night"
            : "border-edge-bright bg-night text-faint"
        } ${
          on && hovered
            ? "scale-110 shadow-[0_0_28px_rgba(255,45,120,1),0_0_84px_rgba(255,45,120,.6),0_0_170px_rgba(139,43,232,.5)]"
            : on
              ? "shadow-[0_0_20px_rgba(255,45,120,.9),0_0_56px_rgba(255,45,120,.5),0_0_120px_rgba(139,43,232,.35)]"
              : ""
        }`}
      >
        {svc.num}
      </span>

      {/* light beam: the node shines outward across the row */}
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1/2 z-0 hidden h-[820px] -translate-y-1/2 transition-[opacity,transform] delay-150 duration-1000 ease-[cubic-bezier(.2,.7,.2,1)] md:block ${
          on ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"
        } ${
          leftSide
            ? "left-2 right-1/2 origin-right"
            : "left-1/2 right-2 origin-left"
        }`}
        style={{
          background: leftSide
            ? "conic-gradient(from 200deg at 100% 50%, transparent 0deg, rgba(139,43,232,.10) 35deg, rgba(255,45,120,.24) 70deg, rgba(139,43,232,.10) 105deg, transparent 140deg)"
            : "conic-gradient(from 20deg at 0% 50%, transparent 0deg, rgba(139,43,232,.10) 35deg, rgba(255,45,120,.24) 70deg, rgba(139,43,232,.10) 105deg, transparent 140deg)",
          WebkitMaskImage: leftSide
            ? "linear-gradient(270deg, black 0%, rgba(0,0,0,.5) 50%, transparent 94%)"
            : "linear-gradient(90deg, black 0%, rgba(0,0,0,.5) 50%, transparent 94%)",
          maskImage: leftSide
            ? "linear-gradient(270deg, black 0%, rgba(0,0,0,.5) 50%, transparent 94%)"
            : "linear-gradient(90deg, black 0%, rgba(0,0,0,.5) 50%, transparent 94%)",
          filter: "blur(10px)",
        }}
      />

      {/* content — Sequence-style open editorial type, no card box */}
      <div
        onMouseEnter={() => !reduced && setHovered(true)}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className={`relative ml-14 transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] md:ml-0 md:w-[calc(50%-80px)] ${
          leftSide ? "" : "md:ml-auto"
        } ${
          on
            ? "translate-y-0 opacity-100 saturate-100"
            : "translate-y-8 opacity-45 saturate-[.25]"
        }`}
      >
        {/* giant numeral behind the copy — drifts further for parallax depth */}
        <div
          ref={numRef}
          aria-hidden
          style={{ willChange: "transform" }}
          className={`text-grad pointer-events-none absolute -left-4 -top-16 select-none font-display text-[clamp(120px,16vw,210px)] font-bold leading-none transition-opacity duration-1000 md:-left-10 ${
            on ? "opacity-[0.09]" : "opacity-[0.04]"
          }`}
        >
          {svc.num}
        </div>

        <div
          ref={textRef}
          style={{ willChange: "transform" }}
          className="relative"
        >
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.26em] text-faint">
            <span>{FILE_TAGS[i]}</span>
            <span
              className={`tracking-[0.18em] transition-colors duration-500 ${
                on ? "text-teal" : "text-faint"
              }`}
            >
              {on ? "● DECRYPTED" : "○ INCOMING…"}
            </span>
          </p>
          <h3
            ref={registerTitle}
            className="mt-5 font-display text-[clamp(30px,4.2vw,54px)] font-bold leading-[1.04] tracking-[-0.025em] text-fog"
          >
            {svc.title}
          </h3>
          <p
            ref={registerPromise}
            className="mb-0 mt-4 font-mono text-[12.5px] uppercase tracking-[0.22em] text-magenta"
          >
            {svc.promise}
          </p>
          <p className="mb-0 mt-4 max-w-[52ch] text-[16px] leading-[1.7] text-mist">
            {svc.body}
          </p>
          {svc.chips && (
            <div className="mt-5 flex flex-wrap gap-2.5">
              {svc.chips.map((chip, j) => (
                <span
                  key={chip}
                  style={{
                    transitionDelay: on ? `${220 + j * 70}ms` : "0ms",
                  }}
                  className={`rounded-full border border-edge-bright px-[14px] py-1.5 font-mono text-[11.5px] tracking-[0.1em] text-mist transition-[opacity,transform] duration-500 ${
                    on
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
}
