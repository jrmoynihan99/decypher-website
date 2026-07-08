"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { HUB_COLORS } from "@/components/home/services-variants/NeuralStage";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import ScaleReveal from "@/components/reveal/ScaleReveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import DecryptOnView from "@/components/ui/DecryptOnView";
import { useTilt } from "@/hooks/useTilt";
import { hexToRgba } from "@/lib/creators";
import type { CmsService } from "@/sanity/types";

/**
 * SERVICES PAGE — "NODE DOSSIERS"
 *
 * The dedicated-page cut of the neural map: the same five nodes as the home
 * Atlas/Flyover (same NODE tags, same hub colors), laid out as readable
 * editorial chapters instead of a camera flight — every headline legible at a
 * glance, per the "no puzzles" rule. Each chapter pairs the service copy with
 * a framed visual slot: a real image once `svc.img` is set, otherwise an
 * on-brand "awaiting asset" viewport (accent glow, scanlines, corner
 * brackets) carrying the existing `imgLabel` convention.
 *
 * A flight-plan rail (borrowed from The Flyover) rides sticky on desktop,
 * tracking the chapter in view and jumping on click.
 */

const chapterId = (svc: CmsService) => `node-${svc.num}`;

/** Framed visual: real image when present, else the awaiting-asset viewport. */
function ServiceVisual({
  svc,
  accent,
}: {
  svc: CmsService;
  accent: string;
}) {
  const { ref, hovered, onMouseEnter, onMouseMove, onMouseLeave } =
    useTilt<HTMLDivElement>({ translate: 6, rotate: 7, perspective: 1000 });
  return (
    <div
      ref={ref}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="group/card relative aspect-[4/3] overflow-hidden rounded-[24px] border bg-[#0F0E14] transition-[border-color,box-shadow] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]"
      style={{
        borderColor: hovered ? hexToRgba(accent, 0.45) : "#23212c",
        boxShadow: hovered
          ? `0 44px 130px -34px ${hexToRgba(accent, 0.6)}`
          : `0 30px 90px -40px ${hexToRgba(accent, 0.35)}`,
        willChange: "transform",
      }}
    >
      {svc.img ? (
        <>
          <Image
            src={svc.img}
            alt={svc.title}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover/card:scale-[1.04]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(10,10,14,.82)_100%)]"
          />
        </>
      ) : (
        <>
          {/* accent light source */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `radial-gradient(560px circle at 30% 22%, ${hexToRgba(accent, 0.17)}, transparent 62%)`,
            }}
          />
          {/* faint blueprint grid */}
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.028)_1px,transparent_1px)] bg-[size:44px_44px]"
          />
          {/* drifting CRT scanlines */}
          <div
            aria-hidden
            className="animate-scan absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(241,238,246,0.045) 0px, rgba(241,238,246,0.045) 1px, transparent 1px, transparent 4px)",
            }}
          />
          {/* centered node mark: ghost numeral over a live core */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
            <div className="text-grad select-none font-display text-[clamp(80px,10vw,120px)] font-bold leading-none opacity-[0.22]">
              {svc.num}
            </div>
            <span
              className="animate-pulse-ring h-3 w-3 rounded-full"
              style={{
                background: accent,
                boxShadow: `0 0 18px ${hexToRgba(accent, 0.9)}`,
              }}
            />
            <span className="font-mono text-[10px] tracking-[0.3em] text-faint">
              [ IMAGE SLOT ]
            </span>
          </div>
          {/* asset readout */}
          <div className="absolute inset-x-5 bottom-4 flex items-center justify-between gap-3 font-mono text-[10.5px] tracking-[0.16em]">
            <span className="text-faint">{svc.imgLabel}</span>
            <span style={{ color: accent }}>AWAITING_ASSET</span>
          </div>
        </>
      )}
      {/* viewfinder corner brackets */}
      {(["left-4 top-4 border-l-2 border-t-2", "right-4 top-4 border-r-2 border-t-2", "left-4 bottom-4 border-l-2 border-b-2", "right-4 bottom-4 border-r-2 border-b-2"] as const).map(
        (pos) => (
          <span
            key={pos}
            aria-hidden
            className={`pointer-events-none absolute h-[18px] w-[18px] opacity-60 ${pos}`}
            style={{ borderColor: hexToRgba(accent, 0.65) }}
          />
        ),
      )}
    </div>
  );
}

export default function ServiceChapters({
  services,
}: {
  services: CmsService[];
}) {
  const [active, setActive] = useState(0);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);

  // the chapter crossing the vertical center band drives the rail highlight
  useEffect(() => {
    const els = chapterRefs.current.filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const i = chapterRefs.current.indexOf(en.target as HTMLElement);
          if (i >= 0) setActive(i);
        }
      },
      { rootMargin: "-42% 0px -42% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jumpTo = (i: number) => {
    chapterRefs.current[i]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  return (
    <div className="relative z-[1] mx-auto flex max-w-[1240px] items-start gap-12 px-6 pb-10">
      {/* flight-plan rail */}
      <aside className="sticky top-[130px] hidden w-[190px] flex-none pt-[70px] lg:block">
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.26em] text-faint">
          [ flight plan ]
        </p>
        <div className="mt-5 flex flex-col gap-1">
          {services.map((svc, i) => {
            const on = active === i;
            const accent = HUB_COLORS[i % HUB_COLORS.length];
            return (
              <button
                key={svc.num}
                type="button"
                onClick={() => jumpTo(i)}
                aria-label={`Jump to ${svc.title}`}
                className="group flex cursor-pointer items-center gap-3 rounded-lg border-none bg-transparent px-2 py-2.5 text-left"
              >
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full border transition-all duration-300"
                  style={
                    on
                      ? {
                          background: accent,
                          borderColor: accent,
                          boxShadow: `0 0 10px ${hexToRgba(accent, 0.8)}`,
                        }
                      : { borderColor: "#2e2c38", background: "transparent" }
                  }
                />
                <span
                  className={`font-mono text-[10px] tracking-[0.18em] transition-colors ${
                    on ? "text-fog" : "text-faint group-hover:text-mist"
                  }`}
                >
                  {svc.num}
                </span>
                <span
                  className={`truncate font-mono text-[10.5px] tracking-[0.08em] transition-colors ${
                    on ? "text-mist" : "text-faint group-hover:text-mist"
                  }`}
                >
                  {svc.title.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-6 font-mono text-[10px] tracking-[0.2em] text-faint">
          NODE 0{active + 1} / {String(services.length).padStart(2, "0")}
        </p>
      </aside>

      {/* chapters */}
      <div className="min-w-0 flex-1">
        {services.map((svc, i) => (
          <SectionReveal key={svc.num} amount={0.25}>
            <ServiceChapter
              svc={svc}
              accent={HUB_COLORS[i % HUB_COLORS.length]}
              flip={i % 2 === 1}
              registerRef={(el) => {
                chapterRefs.current[i] = el;
              }}
            />
          </SectionReveal>
        ))}
      </div>
    </div>
  );
}

/**
 * One editorial chapter. Both columns react to the cursor as a unit: the visual
 * card and the copy each tilt toward the pointer (independent rAF springs), the
 * ghost numeral parallaxes further behind the copy, and an accent bloom lifts
 * behind the whole row while any part of it is hovered.
 */
function ServiceChapter({
  svc,
  accent,
  flip,
  registerRef,
}: {
  svc: CmsService;
  accent: string;
  flip: boolean;
  registerRef: (el: HTMLElement | null) => void;
}) {
  const {
    ref: copyRef,
    parallaxRef: numeralRef,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
  } = useTilt<HTMLDivElement, HTMLDivElement>({
    translate: 8,
    rotate: 3.5,
    parallax: 2.2,
  });

  return (
    <article
      id={chapterId(svc)}
      ref={registerRef}
      className="group/row relative grid scroll-mt-24 items-center gap-10 py-[64px] lg:grid-cols-2 lg:gap-16"
    >
      {/* accent bloom behind the whole row — brightens on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-8%] inset-y-[-6%] opacity-0 transition-opacity duration-500 group-hover/row:opacity-100"
        style={{
          background: `radial-gradient(closest-side at 50% 50%, ${hexToRgba(accent, 0.12)}, transparent 78%)`,
        }}
      />

      <ScaleReveal className={flip ? "lg:order-2" : ""}>
        <ServiceVisual svc={svc} accent={accent} />
      </ScaleReveal>

      <div
        className={`relative ${flip ? "lg:order-1" : ""}`}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {/* ghost numeral drifting behind the copy — parallax child, brighter on hover */}
        <div
          ref={numeralRef}
          aria-hidden
          style={{ willChange: "transform" }}
          className="text-grad pointer-events-none absolute -top-10 right-0 select-none font-display text-[110px] font-bold leading-none opacity-[0.07] transition-opacity duration-500 group-hover/row:opacity-[0.12] sm:-top-16 sm:text-[170px]"
        >
          {svc.num}
        </div>

        {/* the tilting copy */}
        <div ref={copyRef} style={{ willChange: "transform" }} className="relative">
          <SubheadingReveal delay={0.1} className="relative">
            <p className="m-0 font-mono text-[11px] tracking-[0.26em] text-faint">
              NODE {svc.num} — {svc.nodeTag}{" "}
              <span className="text-teal">● LIVE</span>
            </p>
          </SubheadingReveal>
          <DecryptOnView
            as="h2"
            text={svc.title}
            threshold={0.3}
            className="relative mt-4 font-display text-[clamp(30px,3.6vw,46px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
          />
          <SubheadingReveal delay={0.3} className="relative mt-3.5">
            <p
              className="m-0 font-mono text-[12px] uppercase tracking-[0.22em]"
              style={{ color: accent }}
            >
              {svc.promise}
            </p>
          </SubheadingReveal>
          <ParagraphReveal
            delay={0.4}
            className="relative mb-0 mt-4 max-w-[54ch] text-[16px] leading-[1.7] text-mist"
          >
            {svc.body}
          </ParagraphReveal>
          {svc.chips && (
            <Reveal delay={0.55} className="relative mt-5 flex flex-wrap gap-2.5">
              {svc.chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-edge-bright px-[14px] py-1.5 font-mono text-[11px] tracking-[0.1em] text-mist"
                >
                  {chip}
                </span>
              ))}
            </Reveal>
          )}
        </div>
      </div>
    </article>
  );
}
