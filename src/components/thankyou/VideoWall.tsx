"use client";

import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import ClickToPlayVideo from "@/components/schedule/ClickToPlayVideo";
import DecryptOnView from "@/components/ui/DecryptOnView";
import type { CmsVideoTestimonial, SectionHeadingContent } from "@/sanity/types";

/**
 * The creator-video wall on a thank-you page, beneath the pre-call hero video.
 * Cards come from the Video Testimonials collection; the heading is shared by
 * every thank-you page and editable in Sanity (Book a Call → Thank You), with
 * these defaults as fallback. Embeds are click-to-load (ClickToPlayVideo) — a
 * grid of live YouTube iframes would drag any phone under.
 */

const DEFAULTS = {
  eyebrow: "[ the receipts ]",
  title: "Hear it from the creators.",
  sub: "// REAL CLIENTS. REAL RESULTS. TAP A VIDEO TO PLAY.",
};

function VideoCard({ v, i }: { v: CmsVideoTestimonial; i: number }) {
  return (
    <Reveal delay={(i % 3) * 0.1} amount={0.15}>
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
}: {
  content?: SectionHeadingContent;
  videos: CmsVideoTestimonial[];
}) {
  const sub = content.sub ?? DEFAULTS.sub;
  return (
    <section
      id="videos"
      className="relative z-[1] mx-auto max-w-[1160px] px-4 pt-7 md:px-6 md:pt-14"
    >
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

      <div className="mt-6 grid gap-x-4 gap-y-6 sm:grid-cols-2 md:mt-10 md:gap-x-6 md:gap-y-8 lg:grid-cols-3">
        {videos.length
          ? videos.map((v, i) => <VideoCard key={`${v.videoUrl}-${i}`} v={v} i={i} />)
          : Array.from({ length: 3 }, (_, i) => <PlaceholderCard key={i} i={i} />)}
      </div>
    </section>
  );
}
