"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import ClickToPlayVideo from "@/components/schedule/ClickToPlayVideo";
import DecryptOnView from "@/components/ui/DecryptOnView";
import type { CmsVideoTestimonial, SectionHeadingContent } from "@/sanity/types";

/**
 * The creator-video wall on a thank-you page, beneath the pre-call hero video.
 * Cards are picked per page (Thank You Pages → Creator videos) and fall back to
 * the whole Video Testimonials collection; the heading is shared by every
 * thank-you page and editable in Sanity (Book a Call → Confirmation → Video
 * wall heading), where the eyebrow and title are required and the subline is
 * optional and rendered only if written. Embeds are click-to-load
 * (ClickToPlayVideo) — a grid of live YouTube iframes would drag any phone
 * under.
 *
 * A page may carry up to forty videos, which is more wall than any visitor
 * scrolls, so the grid grows as it's scrolled rather than mounting whole: the
 * first INITIAL on load, then BATCH more each time the bottom comes within
 * PRELOAD of the viewport. Mounting isn't free — each card carries a Reveal
 * (a motion element + its own IntersectionObserver) and a thumbnail request,
 * and forty of those on a phone for the sake of the two people who reach the
 * bottom is the wrong trade. Loading ahead of the fold rather than at it means
 * the next rows are already painted by the time they'd be read, so the wall
 * reads as one continuous scroll with no button and no visible stall.
 */

/**
 * Eyebrow and title only. Both are required in the Studio, so these cover the
 * one case where the shared heading has never been filled in at all — whereas
 * the subline is optional, and an optional field left empty means the client
 * doesn't want the line. Substituting stock copy there makes an empty field
 * un-emptyable: deleting it in the Studio is what puts the default back.
 */
const DEFAULTS = {
  eyebrow: "[ the receipts ]",
  title: "Hear it from the creators.",
};

/** Cards rendered on first paint — three full rows at lg. */
const INITIAL = 9;

/** Cards appended per batch as the wall is scrolled — two more rows at lg. */
const BATCH = 6;

/** How far below the fold the next batch starts mounting. */
const PRELOAD = "600px";

/**
 * Cards that animate in on load rather than waiting to be scrolled to — the
 * widest the grid ever gets (lg:grid-cols-3), so it's exactly the top row.
 *
 * The whole point of the hero video's size is that this row breaks the fold,
 * and a scroll-triggered reveal defeats that: the self-trigger wants `amount`
 * of the card visible AND sits 60px up from the bottom edge, so a card peeking
 * at the fold is still blank. The visitor gets an empty band under the heading
 * — worse than no row at all, since it reads as a broken page rather than as
 * something to scroll toward.
 */
const TOP_ROW = 3;

function VideoCard({ v, i }: { v: CmsVideoTestimonial; i: number }) {
  return (
    <Reveal delay={(i % 3) * 0.1} amount={0.15} immediate={i < TOP_ROW}>
      <figure className="m-0">
        <ClickToPlayVideo
          url={v.videoUrl}
          title={`${v.name} — creator testimonial`}
        />
        <figcaption className="mt-2.5 flex items-baseline justify-between gap-3 px-1">
          <span className="truncate font-display text-[14.5px] font-semibold tracking-[-0.01em] text-fog">
            {v.name}
          </span>
          {v.handle && (
            <span className="flex-none font-mono text-[11px] tracking-[0.12em] text-faint">
              {v.handle}
            </span>
          )}
        </figcaption>
      </figure>
    </Reveal>
  );
}

/** On-brand awaiting-asset frame shown until videos exist in the Studio. */
function PlaceholderCard({ i }: { i: number }) {
  return (
    <Reveal delay={(i % 3) * 0.1} amount={0.15}>
      <div className="relative aspect-video overflow-hidden rounded-[18px] border border-edge-mid bg-[linear-gradient(160deg,#16141D,#0D0B13)]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:34px_34px]" />
        <div className="absolute left-4 top-3.5 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.18em] text-muted">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-[#FF3B3B] [animation-duration:1.4s]" />
          REC
        </div>
        <div className="absolute right-4 top-3.5 font-mono text-[10.5px] tracking-[0.18em] text-muted">
          {`TESTIMONIAL_${String(i + 1).padStart(2, "0")}`}
        </div>
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="m-0 font-mono text-[11px] leading-relaxed tracking-[0.12em] text-faint">
            {"// AWAITING_UPLOAD — Studio → Video Testimonials"}
          </p>
        </div>
      </div>
    </Reveal>
  );
}

export default function VideoWall({
  content = {},
  videos,
  showHeading = true,
}: {
  content?: SectionHeadingContent;
  videos: CmsVideoTestimonial[];
  /**
   * False on a thank-you page with the hero video switched off: there the page
   * header stands directly over this grid and already introduces it, and two
   * headings for one wall reads as a mistake.
   */
  showHeading?: boolean;
}) {
  const [count, setCount] = useState(INITIAL);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sub = content.sub?.trim();
  const shown = videos.slice(0, count);
  const more = count < videos.length;

  // Re-observed on every count change: after a batch lands the sentinel is
  // usually still inside the preload margin, and an observer that never saw it
  // leave has no new crossing to report — the wall would stall one batch in.
  // A fresh observer re-reports the current state, so batches cascade until
  // the sentinel is genuinely out of range.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !more) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting))
          setCount((c) => Math.min(c + BATCH, videos.length));
      },
      { rootMargin: `0px 0px ${PRELOAD} 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [count, more, videos.length]);

  return (
    <section
      id="videos"
      className={`relative z-[1] mx-auto max-w-[1160px] px-4 md:px-6 ${
        // With no heading the grid is what sits under the page header, so it
        // needs the breathing room the heading block would otherwise supply.
        showHeading ? "pt-7 md:pt-14" : "pt-9 md:pt-16"
      }`}
    >
      {showHeading && (
        <SectionReveal className="relative mx-auto max-w-[860px] px-2 text-center">
          <SubheadingReveal className="relative">
            <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
              {content.eyebrow ?? DEFAULTS.eyebrow}
            </p>
          </SubheadingReveal>
          <DecryptOnView
            as="h2"
            text={content.title ?? DEFAULTS.title}
            threshold={0}
            className="relative mt-2.5 font-display text-[clamp(24px,3.2vw,40px)] font-bold leading-[1.08] tracking-[-0.025em] text-fog md:mt-4"
          />
          {sub && (
            <SubheadingReveal delay={0.3} className="relative mt-2.5 md:mt-4">
              <p className="m-0 font-mono text-[11px] tracking-[0.14em] text-faint md:text-[11.5px]">
                {sub}
              </p>
            </SubheadingReveal>
          )}
        </SectionReveal>
      )}

      <div
        className={`grid gap-x-4 gap-y-6 sm:grid-cols-2 md:gap-x-6 md:gap-y-8 lg:grid-cols-3 ${
          showHeading ? "mt-6 md:mt-10" : ""
        }`}
      >
        {videos.length
          ? shown.map((v, i) => <VideoCard key={`${v.videoUrl}-${i}`} v={v} i={i} />)
          : Array.from({ length: 3 }, (_, i) => <PlaceholderCard key={i} i={i} />)}
      </div>

      {more && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}
    </section>
  );
}
