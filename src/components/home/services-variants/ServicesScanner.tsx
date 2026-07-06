"use client";

import { useEffect, useRef } from "react";
import ServicesTicker from "@/components/home/services-variants/ServicesTicker";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SERVICES } from "@/lib/content";
import { cancelDecrypt, decryptTo } from "@/lib/decrypt";

/**
 * SERVICES VARIANT 07 — "THE SCAN GATE"
 *
 * Vertical scroll drives a horizontal conveyor. The three service cards ride
 * the belt through a fixed decryption beam at the center of the screen: as a
 * card crosses the gate it flashes, saturates to full color, its status flips
 * to DECRYPTED and the headline runs the decrypt sweep — automatically. The
 * copy is real, readable text at every moment (queued cards are just dimmed),
 * so nothing is ever hidden behind the effect. Scroll is the only input.
 */

export default function ServicesScanner() {
  const outerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const flashRefs = useRef<(HTMLDivElement | null)[]>([]);
  const statusRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const promiseRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const scannedRef = useRef([false, false, false]);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const outer = outerRef.current;
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!outer || !stage || !track) return;
    let raf = 0;

    const tick = () => {
      raf = 0;
      const vh = window.innerHeight;
      const total = Math.max(1, outer.offsetHeight - vh);
      const top = outer.getBoundingClientRect().top;
      const sp = Math.max(0, Math.min(1, -top / total));

      const cards = cardRefs.current;
      const first = cards[0];
      const last = cards[cards.length - 1];
      if (!first || !last) return;
      const stageW = stage.clientWidth;
      const beamX = stageW * 0.5;
      const cx = (el: HTMLElement) => el.offsetLeft + el.offsetWidth / 2;

      // belt travel: first card starts right of the gate, last ends left of it
      const startX = beamX - cx(first) + stageW * 0.42;
      const endX = beamX - cx(last) - stageW * 0.32;
      const tx = startX + (endX - startX) * sp;
      track.style.transform = `translate3d(${tx.toFixed(1)}px,0,0)`;

      let nearest = 0;
      let nearestDist = Infinity;
      cards.forEach((card, i) => {
        if (!card) return;
        const d = tx + cx(card) - beamX; // >0 = still right of the gate
        const ad = Math.abs(d);
        if (ad < nearestDist) {
          nearestDist = ad;
          nearest = i;
        }
        const raw = Math.max(0, Math.min(1, 0.5 - d / 220));
        const f = raw * raw * (3 - 2 * raw);
        card.style.opacity = (0.45 + 0.55 * f).toFixed(3);
        card.style.filter = `saturate(${(0.2 + 0.8 * f).toFixed(2)})`;

        const flash = flashRefs.current[i];
        if (flash)
          flash.style.opacity = (Math.exp(-((d / 90) * (d / 90))) * 0.45).toFixed(3);

        const st = statusRefs.current[i];
        if (st) {
          const label =
            f > 0.85 ? "● DECRYPTED" : f > 0.15 ? "≈ SCANNING" : "○ IN QUEUE";
          if (st.textContent !== label) st.textContent = label;
          st.style.color =
            f > 0.85 ? "#3DD6C4" : f > 0.15 ? "#FF2D78" : "#5F5870";
        }

        if (f > 0.6 && !scannedRef.current[i]) {
          scannedRef.current[i] = true;
          decryptTo(titleRefs.current[i], SERVICES[i].title, 380);
          decryptTo(promiseRefs.current[i], SERVICES[i].promise, 440);
        }
      });

      if (readoutRef.current) {
        const txt = `SCAN ${String(Math.round(sp * 100)).padStart(3, " ")}% · FILE 0${nearest + 1}/03`;
        if (readoutRef.current.textContent !== txt)
          readoutRef.current.textContent = txt;
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
  }, [reduced]);

  const card = (svc: (typeof SERVICES)[number], i: number, belt: boolean) => (
    <article
      key={svc.num}
      ref={
        belt
          ? (el) => {
              cardRefs.current[i] = el;
            }
          : undefined
      }
      className={`relative rounded-[20px] border border-edge-mid bg-panel p-6 ${
        belt ? "w-[min(430px,82vw)] flex-none" : ""
      }`}
    >
      {belt && (
        <div
          ref={(el) => {
            flashRefs.current[i] = el;
          }}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[20px] bg-[linear-gradient(180deg,rgba(255,45,120,.28),rgba(139,43,232,.2))] opacity-0"
        />
      )}
      <div className="flex h-[180px] w-full items-center justify-center rounded-[14px] border border-edge bg-[#0F0E14]">
        <span className="font-mono text-[11.5px] tracking-[0.16em] text-faint">
          {svc.imgLabel}
        </span>
      </div>
      <div className="flex items-center justify-between pt-5">
        <span className="font-mono text-[13px] tracking-[0.14em] text-magenta">
          {svc.num}
        </span>
        <span
          ref={
            belt
              ? (el) => {
                  statusRefs.current[i] = el;
                }
              : undefined
          }
          className="font-mono text-[10px] tracking-[0.18em] text-faint"
        >
          {belt ? "○ IN QUEUE" : "● DECRYPTED"}
        </span>
      </div>
      <h3
        ref={
          belt
            ? (el) => {
                titleRefs.current[i] = el;
              }
            : undefined
        }
        className="mt-3 font-display text-[clamp(22px,2.4vw,28px)] font-semibold tracking-[-0.01em] text-fog"
      >
        {svc.title}
      </h3>
      <p
        ref={
          belt
            ? (el) => {
                promiseRefs.current[i] = el;
              }
            : undefined
        }
        className="mb-0 mt-2.5 font-mono text-xs uppercase tracking-[0.16em] text-magenta"
      >
        {svc.promise}
      </p>
      <p className="mb-0 mt-3 text-[15px] leading-[1.62] text-mist">{svc.body}</p>
      {svc.chips && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {svc.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-edge-bright px-[13px] py-1.5 font-mono text-[11.5px] tracking-[0.1em] text-mist"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </article>
  );

  /* reduced motion: plain grid, everything decrypted */
  if (reduced) {
    return (
      <section id="services" className="relative z-[1] px-6 pb-[120px] pt-[110px]">
        <div className="mx-auto max-w-[1180px]">
          <div className="relative mx-auto max-w-[760px] text-center">
            <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
              [ 05 // services ]
            </p>
            <h2 className="mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog">
              One stop shop for your creator business.
            </h2>
          </div>
          <ServicesTicker className="mt-10" />
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {SERVICES.map((svc, i) => card(svc, i, false))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="services" className="relative z-[1]">
      <div ref={outerRef} className="relative h-[300vh]">
        <div
          ref={stageRef}
          className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden"
        >
          <GlowOrb size={720} alpha={0.13} duration={18} />

          {/* header — z-raised so the belt passes beneath the HUD */}
          <div className="pointer-events-none absolute inset-x-0 top-[70px] z-20 px-6 text-center">
            <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
              [ 05 // services ]
            </p>
            <DecryptOnView
              as="h2"
              text="One stop shop for your creator business."
              threshold={0.1}
              className="mx-auto mt-3 max-w-[720px] font-display text-[clamp(24px,2.8vw,36px)] font-bold tracking-[-0.02em] text-fog"
            />
            <p className="mx-auto mt-2.5 max-w-[52ch] text-[14.5px] leading-relaxed text-mist">
              Keep scrolling &mdash; the gate does the decrypting.
            </p>
            <ServicesTicker className="pointer-events-auto mx-auto mt-4 max-w-[860px] bg-night/60 backdrop-blur-[2px]" />
          </div>

          {/* the belt */}
          <div
            ref={trackRef}
            className="flex w-max items-center gap-8 will-change-transform"
            style={{ transform: "translate3d(45vw,0,0)" }}
          >
            {SERVICES.map((svc, i) => card(svc, i, true))}
          </div>

          {/* the scan gate */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[13%] left-1/2 top-[21%] z-10 -translate-x-1/2"
          >
            <div className="h-full w-[3px] rounded bg-[linear-gradient(180deg,transparent,#FF2D78_18%,#8B2BE8_82%,transparent)] shadow-[0_0_26px_rgba(255,45,120,.65)]" />
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-magenta shadow-[0_0_10px_rgba(255,45,120,.9)]" />
            <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-violet shadow-[0_0_10px_rgba(139,43,232,.9)]" />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[9.5px] tracking-[0.3em] text-magenta/60 [writing-mode:vertical-rl]">
              SCAN GATE
            </span>
          </div>

          {/* readout */}
          <div className="absolute inset-x-0 bottom-[30px] flex items-center justify-center gap-5 font-mono text-[11px] tracking-[0.2em] text-faint">
            <span ref={readoutRef} className="text-mist">
              SCAN {"  "}0% · FILE 01/03
            </span>
            <span className="hidden sm:inline">
              SCROLL TO FEED THE BELT <span className="animate-blink">▼</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
