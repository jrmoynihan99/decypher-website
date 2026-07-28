"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 *
 * Quotes come from Sanity at any length (they run from 60 to 2500+ chars), so
 * the card clamps to CLAMP_LINES and hands the rest to a modal. Without the
 * clamp one long quote sets the height of its whole marquee row — every card
 * in a flex row stretches to the tallest one.
 */

/** Lines of quote shown before the card truncates to a Read more. */
const CLAMP_LINES = 6;

export default function TestimonialCard({ t }: { t: CmsTestimonial }) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLElement>();
  const quoteRef = useRef<HTMLQuoteElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);

  // Only offer Read more when the clamp actually swallowed something. Measured
  // rather than guessed from length: the card is 85vw on phones and capped at
  // 400px on desktop, so the same quote wraps to a different number of lines.
  useEffect(() => {
    const el = quoteRef.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollHeight - el.clientHeight > 4);
    check();
    // a late webfont swap re-wraps the text under us
    document.fonts?.ready.then(check).catch(() => {});
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [t.quote]);

  return (
    <>
      <figure
        ref={ref}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className="group relative m-0 flex w-[85vw] max-w-[400px] flex-none flex-col overflow-hidden rounded-[18px] border border-white/10 bg-panel/90 bg-gradient-to-b from-white/[0.09] to-white/[0.02] p-7 transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-white/20 hover:shadow-[0_26px_80px_-26px_rgba(255,45,120,.55)] md:bg-transparent md:backdrop-blur-xl"
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
        <div className="relative flex flex-1 flex-col gap-5">
          <blockquote
            ref={quoteRef}
            className="m-0 min-h-[100px] overflow-hidden text-[15.5px] leading-[1.62] text-[#D9D4E4] [-webkit-box-orient:vertical] [display:-webkit-box]"
            style={{ WebkitLineClamp: CLAMP_LINES }}
          >
            &ldquo;{t.quote}&rdquo;
          </blockquote>
          {truncated && (
            // data-nodrag: the desktop marquee pointer-captures its track, which
            // would swallow this button's click (captured pointers retarget the
            // click to the capture element). Marquee skips the drag for it.
            <button
              type="button"
              data-nodrag
              onClick={() => setOpen(true)}
              className="-mt-2 cursor-pointer self-start border-none bg-transparent p-0 font-mono text-[11.5px] uppercase tracking-[0.1em] text-magenta transition-colors duration-200 hover:text-fog"
            >
              Read more →
            </button>
          )}
          <figcaption className="mt-auto flex items-center gap-3.5">
            <Avatar t={t} />
            <span className="flex min-w-0 flex-col gap-[3px]">
              <b className="font-display text-[15px] font-semibold text-fog">
                {t.name}
              </b>
              <Meta t={t} />
            </span>
            {t.cat && (
              <span
                className="ml-auto flex-none rounded-full border px-[11px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.1em]"
                style={{ color: t.accent, borderColor: t.accentBorder }}
              >
                {t.cat}
              </span>
            )}
          </figcaption>
        </div>
      </figure>
      {open && <TestimonialModal t={t} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Handle · followers. Both are optional in Sanity and plenty of imported
 * reviews carry neither — joining the present ones keeps a name with no handle
 * from rendering as a stray separator.
 */
function Meta({ t }: { t: CmsTestimonial }) {
  const parts = [t.handle, t.followers].filter(Boolean);
  if (!parts.length) return null;
  return (
    <span className="font-mono text-[11.5px] text-dusk">
      {parts.join(" · ")}
    </span>
  );
}

function Avatar({ t, big = false }: { t: CmsTestimonial; big?: boolean }) {
  const size = big ? "h-14 w-14" : "h-12 w-12 sm:h-16 sm:w-16";
  return t.img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={t.img}
      alt=""
      loading="lazy"
      className={`${size} flex-none rounded-full border border-edge-bright object-cover`}
    />
  ) : (
    <span
      className={`${size} flex flex-none items-center justify-center rounded-full border border-edge-bright bg-panel-2 font-mono text-sm tracking-[0.08em] text-muted`}
    >
      {t.initials}
    </span>
  );
}

/**
 * Full-quote overlay. Portaled to <body>: the section sits inside a <Reveal>
 * whose will-change/transform makes it the containing block for fixed-position
 * descendants — rendered in place this would pin to the marquee row and drift
 * sideways with it.
 */
function TestimonialModal({
  t,
  onClose,
}: {
  t: CmsTestimonial;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Review from ${t.name}`}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(6,4,10,0.72)] px-4 py-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* m-auto centers while it fits, then collapses to 0 so a very long
          quote top-aligns and the overlay scrolls cleanly. */}
      <div className="m-auto w-full max-w-[560px] rounded-[20px] border border-white/15 bg-panel p-6 shadow-[0_0_60px_-10px_rgba(255,45,120,0.4)] sm:p-8">
        <button
          onClick={onClose}
          aria-label="Close"
          className="float-right -mr-2 -mt-2 flex h-11 w-11 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[22px] leading-none text-faint hover:text-fog"
        >
          ×
        </button>
        <div className="flex items-center gap-3.5">
          <Avatar t={t} big />
          <span className="flex min-w-0 flex-col gap-[3px]">
            <b className="font-display text-[16px] font-semibold text-fog">
              {t.name}
            </b>
            <Meta t={t} />
          </span>
        </div>
        {t.cat && (
          <span
            className="mt-4 inline-block rounded-full border px-[11px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.1em]"
            style={{ color: t.accent, borderColor: t.accentBorder }}
          >
            {t.cat}
          </span>
        )}
        <blockquote className="m-0 mt-4 max-h-[58vh] overflow-y-auto overscroll-contain whitespace-pre-line text-[15.5px] leading-[1.7] text-[#D9D4E4]">
          &ldquo;{t.quote}&rdquo;
        </blockquote>
      </div>
    </div>,
    document.body,
  );
}
