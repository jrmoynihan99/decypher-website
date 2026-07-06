"use client";

import { useEffect, useRef, useState } from "react";
import ServicesTicker from "@/components/home/services-variants/ServicesTicker";
import ConsultButton from "@/components/ui/ConsultButton";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SERVICES } from "@/lib/content";
import { cancelDecrypt, decryptTo } from "@/lib/decrypt";

/**
 * SERVICES VARIANT 08 — "MISSION CONTROL"
 *
 * The zero-effort extreme: every service is fully visible and readable the
 * instant the section appears — a bento dashboard you can scan in seconds.
 * The motion is pure ambience layered on top: conic light beams orbiting the
 * key cards' borders, a savings counter that ticks up on arrival, proof lines
 * that quietly re-decrypt to the next stat every few seconds, and a slow
 * deliverables ticker (drag it if you like — or don't; nothing is gated).
 */

const TICKERS: string[][] = [
  [
    "$4.6M+ found in creator tax savings",
    "600+ strategies deployed",
    "live support, all year long",
  ],
  [
    "LLC + EIN + BOI + bank — done for you",
    "crash course included",
    "structured to save from day one",
  ],
  [
    "books closed weekly, not yearly",
    "every write-off captured",
    "decision-ready numbers, always",
  ],
];

/** Card shell with a slow conic light beam orbiting its border. */
function BeamCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-[22px] p-px ${className}`}>
      <div
        aria-hidden
        className="absolute inset-[-120%] animate-spin-grad [background:conic-gradient(from_0deg,transparent_0_74%,#FF5C2E_84%,#FF2D78_91%,#8B2BE8_96%,transparent_100%)]"
        style={{ animationDuration: "7s" }}
      />
      <div className="relative h-full rounded-[21px] border border-edge bg-panel">
        {children}
      </div>
    </div>
  );
}

export default function ServicesLedger() {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const tickerRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const tickerIdxRef = useRef(0);

  const [shown, setShown] = useState(false);
  const reduced = useReducedMotion();

  /* entrance stagger */
  useEffect(() => {
    if (reduced) return;
    const grid = gridRef.current;
    if (!grid) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.disconnect();
          setShown(true);
        }
      },
      { threshold: 0.12 },
    );
    io.observe(grid);
    return () => io.disconnect();
  }, [reduced]);

  /* the savings counter ticks up when it arrives */
  useEffect(() => {
    const el = counterRef.current;
    const sec = sectionRef.current;
    if (!el || !sec) return;
    let raf = 0;
    let fired = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting || fired) continue;
          fired = true;
          io.disconnect();
          if (reduced) {
            el.textContent = "$4.6M+";
            return;
          }
          const t0 = performance.now();
          const step = (t: number) => {
            const p = Math.min(1, (t - t0) / 1400);
            const e = 1 - Math.pow(1 - p, 3);
            el.textContent = `$${(4.6 * e).toFixed(1)}M+`;
            if (p < 1) raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(sec);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  /* proof lines quietly rotate every few seconds */
  useEffect(() => {
    if (reduced) return;
    const iv = setInterval(() => {
      tickerIdxRef.current += 1;
      tickerRefs.current.forEach((el, i) => {
        if (el)
          decryptTo(el, TICKERS[i][tickerIdxRef.current % TICKERS[i].length], 420);
      });
    }, 3400);
    const els = [...tickerRefs.current];
    return () => {
      clearInterval(iv);
      els.forEach(cancelDecrypt);
    };
  }, [reduced]);

  const tileIn = `transition-[opacity,transform] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] ${
    shown || reduced ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
  }`;

  const tileDelay = (i: number) =>
    shown && !reduced ? { transitionDelay: `${i * 110}ms` } : undefined;

  const [svc1, svc2, svc3] = SERVICES;

  return (
    <section
      id="services"
      ref={sectionRef}
      className="relative z-[1] px-6 pb-[130px] pt-[110px]"
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="relative mx-auto max-w-[760px] text-center">
          <GlowOrb size={660} alpha={0.14} />
          <p className="relative m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            [ 05 // services ]
          </p>
          <DecryptOnView
            as="h2"
            text="One stop shop for your creator business."
            className="relative mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
          />
          <p className="relative mx-auto mt-[18px] max-w-[52ch] text-base leading-relaxed text-mist">
            Everything on one screen. No digging, no decoding &mdash; the
            decrypting is our job.
          </p>
        </div>

        {/* deliverables ticker */}
        <ServicesTicker className="mt-11" />

        {/* bento */}
        <div ref={gridRef} className="mt-11 grid gap-5 lg:grid-cols-12">
          {/* featured: tax strategy */}
          <div className={`lg:col-span-7 ${tileIn}`} style={tileDelay(0)}>
            <BeamCard className="h-full">
              <div className="flex h-full flex-col p-7">
                <div className="flex h-[190px] w-full items-center justify-center rounded-[14px] border border-edge bg-[#0F0E14]">
                  <span className="font-mono text-[11.5px] tracking-[0.16em] text-faint">
                    {svc1.imgLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-6">
                  <span className="font-mono text-[13px] tracking-[0.14em] text-magenta">
                    {svc1.num}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.18em] text-teal">
                    ● LIVE
                  </span>
                </div>
                <h3 className="mt-3 font-display text-[clamp(26px,3vw,38px)] font-semibold tracking-[-0.015em] text-fog">
                  {svc1.title}
                </h3>
                <p className="mb-0 mt-2.5 font-mono text-xs uppercase tracking-[0.16em] text-magenta">
                  {svc1.promise}
                </p>
                <p className="mb-0 mt-3.5 max-w-[56ch] text-[15.5px] leading-[1.65] text-mist">
                  {svc1.body}
                </p>
                <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-edge pt-6">
                  <span
                    ref={counterRef}
                    className="text-grad font-display text-[clamp(36px,4vw,50px)] font-bold leading-none tracking-[-0.02em]"
                  >
                    $0.0M+
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                    recovered for creators
                  </span>
                </div>
                <p className="mb-0 mt-5 min-h-[18px] font-mono text-[11px] tracking-[0.14em] text-faint">
                  ▸{" "}
                  <span
                    ref={(el) => {
                      tickerRefs.current[0] = el;
                    }}
                  >
                    {TICKERS[0][0]}
                  </span>
                </p>
              </div>
            </BeamCard>
          </div>

          {/* llc filing */}
          <div className={`lg:col-span-5 ${tileIn}`} style={tileDelay(1)}>
            <div className="flex h-full flex-col rounded-[22px] border border-edge bg-panel p-7 transition-shadow duration-300 hover:shadow-[0_0_44px_rgba(139,43,232,.14)]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] tracking-[0.14em] text-magenta">
                  {svc2.num}
                </span>
                <span className="font-mono text-[10px] tracking-[0.18em] text-teal">
                  ● LIVE
                </span>
              </div>
              <h3 className="mt-3 font-display text-[clamp(22px,2.4vw,28px)] font-semibold tracking-[-0.01em] text-fog">
                {svc2.title}
              </h3>
              <p className="mb-0 mt-2 font-mono text-xs uppercase tracking-[0.16em] text-magenta">
                {svc2.promise}
              </p>
              <p className="mb-0 mt-3 text-[14.5px] leading-[1.62] text-mist">
                {svc2.body}
              </p>
              {svc2.chips && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {svc2.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-edge-bright px-3 py-1 font-mono text-[10.5px] tracking-[0.1em] text-mist"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
              <p className="mb-0 mt-auto min-h-[18px] pt-5 font-mono text-[11px] tracking-[0.14em] text-faint">
                ▸{" "}
                <span
                  ref={(el) => {
                    tickerRefs.current[1] = el;
                  }}
                >
                  {TICKERS[1][0]}
                </span>
              </p>
            </div>
          </div>

          {/* bookkeeping */}
          <div className={`lg:col-span-5 ${tileIn}`} style={tileDelay(2)}>
            <div className="flex h-full flex-col rounded-[22px] border border-edge bg-panel p-7 transition-shadow duration-300 hover:shadow-[0_0_44px_rgba(255,45,120,.13)]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] tracking-[0.14em] text-magenta">
                  {svc3.num}
                </span>
                <span className="font-mono text-[10px] tracking-[0.18em] text-teal">
                  ● LIVE
                </span>
              </div>
              <h3 className="mt-3 font-display text-[clamp(22px,2.4vw,28px)] font-semibold tracking-[-0.01em] text-fog">
                {svc3.title}
              </h3>
              <p className="mb-0 mt-2 font-mono text-xs uppercase tracking-[0.16em] text-magenta">
                {svc3.promise}
              </p>
              <p className="mb-0 mt-3 text-[14.5px] leading-[1.62] text-mist">
                {svc3.body}
              </p>
              <p className="mb-0 mt-auto min-h-[18px] pt-5 font-mono text-[11px] tracking-[0.14em] text-faint">
                ▸{" "}
                <span
                  ref={(el) => {
                    tickerRefs.current[2] = el;
                  }}
                >
                  {TICKERS[2][0]}
                </span>
              </p>
            </div>
          </div>

          {/* cta tile */}
          <div className={`lg:col-span-7 ${tileIn}`} style={tileDelay(3)}>
            <BeamCard className="h-full">
              <div className="flex h-full flex-col items-center justify-center gap-5 px-7 py-10 text-center">
                <p className="m-0 font-mono text-[11px] uppercase tracking-[0.26em] text-faint">
                  [ not sure where to start? ]
                </p>
                <h3 className="m-0 font-display text-[clamp(24px,2.8vw,34px)] font-bold tracking-[-0.015em] text-fog">
                  We&rsquo;ll map your setup in one call.
                </h3>
                <p className="m-0 max-w-[44ch] text-[15px] leading-relaxed text-mist">
                  Tell us how you earn — we&rsquo;ll tell you which of the
                  three moves the needle first.
                </p>
                <ConsultButton size="lg" />
                <p className="m-0 font-mono text-[10.5px] tracking-[0.22em] text-faint">
                  20 MIN · NO PITCH · FREE
                </p>
              </div>
            </BeamCard>
          </div>
        </div>
      </div>
    </section>
  );
}
