"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import GlowOrb from "@/components/ui/GlowOrb";
import ConsultButton from "@/components/ui/ConsultButton";
import { creators } from "@/lib/creators";
import {
  cancelDecrypt,
  decryptTo,
  prefersReducedMotion,
  randChar,
} from "@/lib/decrypt";

const LINE_1 = "We decrypt";
const LINE_2 = "your tax savings.";

/* Per-letter gradient interpolation for the second headline line. */
function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function gradAt(t: number): string {
  return t < 0.5
    ? lerpColor("#FF5C2E", "#FF2D78", t * 2)
    : lerpColor("#FF2D78", "#8B2BE8", (t - 0.5) * 2);
}

/**
 * After the headline decrypts, split it into per-character spans that
 * scramble briefly when hovered. Gradient lines get per-letter colors so the
 * gradient survives the split.
 */
function armHover(el: HTMLElement, gradient: boolean) {
  if (prefersReducedMotion()) return;
  const txt = el.textContent ?? "";
  el.textContent = "";
  if (gradient) {
    el.style.background = "none";
    el.style.webkitBackgroundClip = "initial";
    el.style.backgroundClip = "initial";
    el.style.color = "#F1EEF6";
  }
  const chars = Array.from(txt);
  const n = chars.length;
  chars.forEach((ch, i) => {
    const s = document.createElement("span");
    s.textContent = ch;
    const base = gradient ? gradAt(n <= 1 ? 0 : i / (n - 1)) : "";
    if (base) s.style.color = base;
    if (!/\s/.test(ch)) {
      let busy = false;
      s.addEventListener("mouseenter", () => {
        if (busy) return;
        busy = true;
        let k = 0;
        s.style.color = "#FF2D78";
        s.style.textShadow = "0 0 20px rgba(255,45,120,.85)";
        const iv = setInterval(() => {
          s.textContent = randChar();
          if (++k > 5) {
            clearInterval(iv);
            s.textContent = ch;
            s.style.color = base;
            s.style.textShadow = "none";
            busy = false;
          }
        }, 45);
      });
    }
    el.appendChild(s);
  });
}

const STRIP = creators.slice(0, 16);

export default function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);
  const line1Ref = useRef<HTMLSpanElement>(null);
  const line2Ref = useRef<HTMLSpanElement>(null);

  // headline decrypt-in, then per-letter hover scramble
  useEffect(() => {
    const e1 = line1Ref.current;
    const e2 = line2Ref.current;
    if (!e1 || !e2 || prefersReducedMotion()) return;
    decryptTo(e1, LINE_1, 1500, () => armHover(e1, false));
    const t = setTimeout(
      () => decryptTo(e2, LINE_2, 1700, () => armHover(e2, true)),
      350,
    );
    return () => {
      clearTimeout(t);
      cancelDecrypt(e1);
      cancelDecrypt(e2);
      e1.textContent = LINE_1;
      e2.textContent = LINE_2;
      e2.removeAttribute("style");
    };
  }, []);

  // light beam follows the pointer
  useEffect(() => {
    const hero = heroRef.current;
    const beam = beamRef.current;
    if (!hero || !beam || prefersReducedMotion()) return;
    const onMove = (e: MouseEvent) => {
      const w = hero.offsetWidth || 1;
      beam.style.transform = `translateX(${((e.clientX / w - 0.5) * 70).toFixed(1)}px)`;
    };
    hero.addEventListener("mousemove", onMove);
    return () => hero.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative z-[1] flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-6 pb-[70px] pt-14 text-center"
    >
      <GlowOrb size={860} blur={52} alpha={0.22} beta={0.13} duration={15} />
      <div
        ref={beamRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden transition-transform duration-700 ease-out"
      >
        <div className="absolute -top-1/4 -bottom-1/4 left-[-45%] w-[130px] rotate-[15deg] animate-beam-sweep bg-[linear-gradient(90deg,rgba(255,45,120,0),rgba(255,45,120,.10),rgba(139,43,232,.15),rgba(139,43,232,0))] blur-[7px]" />
      </div>

      <p className="relative m-0 font-mono text-[12.5px] uppercase tracking-[0.34em] text-magenta">
        [ Accounting for creators ]
      </p>
      <h1 className="relative mt-[22px] max-w-[1060px] font-display text-[clamp(44px,7.2vw,94px)] font-bold leading-[1.03] tracking-[-0.03em]">
        <span ref={line1Ref} className="block text-fog">
          {LINE_1}
        </span>
        <span ref={line2Ref} className="block text-grad">
          {LINE_2}
        </span>
      </h1>
      <p className="relative mt-[26px] max-w-[58ch] text-[clamp(16px,1.9vw,19px)] leading-relaxed text-mist [text-wrap:pretty]">
        Tax is a creator&rsquo;s biggest expense. We find the strategies hiding
        in your numbers &mdash; so you keep more of every brand deal,
        sponsorship, and payout.
      </p>

      <div className="relative mt-[38px] flex flex-wrap items-center justify-center gap-4">
        <ConsultButton size="lg" />
        <a
          href="#proof"
          className="rounded-full border border-edge-bright px-[30px] py-4 font-display text-[16.5px] font-semibold text-fog no-underline transition-colors hover:border-magenta"
        >
          See the proof
        </a>
      </div>

      {/* creator photo strip */}
      <div className="relative mt-16 w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="flex w-max animate-marquee gap-5 hover:[animation-play-state:paused]">
          {[...STRIP, ...STRIP].map((c, i) => (
            <Image
              key={`${c.name}-${i}`}
              src={c.img}
              alt={c.name}
              width={230}
              height={280}
              className="h-[280px] w-[230px] flex-none rounded-2xl border border-edge bg-panel object-cover object-[50%_20%]"
            />
          ))}
        </div>
      </div>

      <p className="absolute inset-x-0 bottom-[26px] m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
        SCROLL TO DECRYPT <span className="animate-blink">▼</span>
      </p>
    </section>
  );
}
