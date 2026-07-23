"use client";

import { useSpotlight } from "@/hooks/useSpotlight";
import type { CmsTestimonial } from "@/sanity/types";

/**
 * Frosted-glass testimonial card with a cursor-tracking spotlight
 * (useSpotlight) and a smooth hover lift. Mirrors the stat cards.
 *
 * The frost (backdrop-blur) is md+ only: these cards ride a marquee, and a
 * MOVING backdrop-filter re-samples and re-blurs its backdrop every frame —
 * on mobile GPUs two drifting rows of them is a device-heating fill-rate
 * bill. Phones get a near-opaque panel instead.
 */
export default function TestimonialCard({ t }: { t: CmsTestimonial }) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLElement>();

  return (
    <figure
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="group relative m-0 w-[85vw] max-w-[400px] flex-none overflow-hidden rounded-[18px] border border-white/10 bg-panel/90 bg-gradient-to-b from-white/[0.09] to-white/[0.02] p-7 transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-white/20 hover:shadow-[0_26px_80px_-26px_rgba(255,45,120,.55)] md:bg-transparent md:backdrop-blur-xl"
    >
      {/* cursor spotlight — position eased in JS, opacity eased in CSS */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(360px circle at var(--mx, 50%) var(--my, 0%), rgba(255,45,120,.15), transparent 68%)",
        }}
      />
      <div className="relative flex flex-col gap-5">
        <blockquote className="m-0 min-h-[100px] text-[15.5px] leading-[1.62] text-[#D9D4E4]">
          &ldquo;{t.quote}&rdquo;
        </blockquote>
        <figcaption className="flex items-center gap-3.5">
          {t.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.img}
              alt=""
              loading="lazy"
              className="h-12 w-12 flex-none rounded-full border border-edge-bright object-cover sm:h-16 sm:w-16"
            />
          ) : (
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full border border-edge-bright bg-panel-2 font-mono text-sm tracking-[0.08em] text-muted sm:h-16 sm:w-16">
              {t.initials}
            </span>
          )}
          <span className="flex min-w-0 flex-col gap-[3px]">
            <b className="font-display text-[15px] font-semibold text-fog">
              {t.name}
            </b>
            <span className="font-mono text-[11.5px] text-dusk">
              {t.handle} · {t.followers}
            </span>
          </span>
          <span
            className="ml-auto flex-none rounded-full border px-[11px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.1em]"
            style={{ color: t.accent, borderColor: t.accentBorder }}
          >
            {t.cat}
          </span>
        </figcaption>
      </div>
    </figure>
  );
}
