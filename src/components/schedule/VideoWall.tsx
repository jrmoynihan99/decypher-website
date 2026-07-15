"use client";

import { useState } from "react";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import DecryptOnView from "@/components/ui/DecryptOnView";
import type { CmsVideoTestimonial, SectionHeadingContent } from "@/sanity/types";

/**
 * The "but first" creator-video wall on the thank-you takeover. Cards come
 * from the Video Testimonials collection; the heading is editable in Sanity
 * (Book a Call → Thank You) with these defaults as fallback.
 *
 * Embeds are click-to-load: a grid of live YouTube iframes would drag any
 * phone under, so each card shows the video's own thumbnail behind a play
 * button and only mounts the iframe (autoplaying) once tapped.
 */

const DEFAULTS = {
  eyebrow: "[ but first ]",
  title: "Hear it from the creators.",
  sub: "// REAL CLIENTS. REAL RESULTS. TAP A VIDEO TO PLAY.",
};

/** Video id from any YouTube URL shape (watch, share, shorts, embed). */
function youTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:.*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

/** Embed src that starts playing immediately (the visitor already pressed play). */
function playSrc(url: string): string {
  const id = youTubeId(url);
  if (id)
    return `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
  return `${url}${url.includes("?") ? "&" : "?"}autoplay=1`;
}

function VideoCard({ v, i }: { v: CmsVideoTestimonial; i: number }) {
  const [playing, setPlaying] = useState(false);
  const id = youTubeId(v.videoUrl);
  return (
    <Reveal delay={(i % 3) * 0.1} amount={0.15}>
      <figure className="m-0">
        <div className="group relative aspect-video overflow-hidden rounded-[18px] border border-edge-mid bg-[linear-gradient(160deg,#16141D,#0D0B13)] shadow-[0_18px_50px_rgba(0,0,0,.45)] transition-[border-color,box-shadow] duration-300 hover:border-magenta/40 hover:shadow-[0_22px_60px_-18px_rgba(255,45,120,.4)]">
          {playing ? (
            <iframe
              src={playSrc(v.videoUrl)}
              title={`${v.name} — creator testimonial`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={`Play ${v.name}'s testimonial`}
              className="absolute inset-0 block h-full w-full cursor-pointer border-0 bg-transparent p-0"
            >
              {id && (
                // hqdefault always exists; object-cover crops its 4:3 letterbox
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              )}
              {/* keeps the play button readable over bright thumbnails */}
              <span
                aria-hidden
                className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,14,.05),rgba(10,10,14,.45))]"
              />
              <span
                aria-hidden
                className="bg-grad absolute left-1/2 top-1/2 flex h-[56px] w-[56px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full pl-1 text-[18px] text-white shadow-[0_10px_30px_rgba(0,0,0,.45)] transition-transform duration-300 group-hover:scale-110"
              >
                ▶
              </span>
            </button>
          )}
        </div>
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
