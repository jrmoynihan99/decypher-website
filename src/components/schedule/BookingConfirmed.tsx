"use client";

import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import VideoWall from "@/components/schedule/VideoWall";
import AutoplayVideo from "@/components/ui/AutoplayVideo";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import type {
  BookingConfirmationContent,
  CmsVideoTestimonial,
  SectionHeadingContent,
} from "@/sanity/types";

/**
 * Post-submit thank-you takeover: replaces the whole schedule hero (pitch +
 * form) once a call request goes through. A deliberately short header —
 * "see you in our call" / "but first…" — trails straight into the star of the
 * page: the big pre-call video the client should watch before the call. The
 * creator wall follows, with the reviews reel and stats below in the
 * template. Copy and the video URL are editable in Sanity (Book a Call →
 * Thank You) with these defaults as fallback; the optional eyebrow/title over
 * the video stay empty by default so the body line does the introducing.
 *
 * The header stays tight on phones (smaller type, tighter gaps) so the hero
 * video lands above the fold without scrolling.
 */

const DEFAULTS = {
  eyebrow: "● CHANNEL OPEN",
  title: "See you in our call.",
  body: "But first…",
};

/** On-brand awaiting-asset frame shown until the video URL exists in the Studio. */
function HeroVideoPlaceholder() {
  return (
    <div className="relative aspect-video overflow-hidden rounded-[20px] border border-edge-mid bg-[linear-gradient(160deg,#16141D,#0D0B13)] md:rounded-[24px]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:34px_34px]" />
      <div className="absolute left-4 top-3.5 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.18em] text-muted">
        <span className="h-1.5 w-1.5 animate-blink rounded-full bg-[#FF3B3B] [animation-duration:1.4s]" />
        REC
      </div>
      <div className="absolute right-4 top-3.5 font-mono text-[10.5px] tracking-[0.18em] text-muted">
        PRE_CALL_BRIEFING
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
        <p className="m-0 font-mono text-[11px] leading-relaxed tracking-[0.12em] text-faint">
          {"// AWAITING_UPLOAD — Studio → Book a Call → Thank You → Hero video"}
        </p>
      </div>
    </div>
  );
}

export default function BookingConfirmed({
  content = {},
  videoWall,
  videos,
}: {
  content?: BookingConfirmationContent;
  videoWall?: SectionHeadingContent;
  videos: CmsVideoTestimonial[];
}) {
  const video = content.video ?? {};
  return (
    <>
      <SectionReveal>
        <section className="relative z-[1] mx-auto max-w-[960px] px-4 pt-3 text-center md:px-6 md:pt-[64px]">
          <GlowOrb
            size={780}
            blur={54}
            alpha={0.2}
            beta={0.12}
            duration={16}
            style={{ top: "-120px" }}
          />

          <div className="relative mx-auto max-w-[860px]">
            <SubheadingReveal className="relative">
              <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-teal">
                {content.eyebrow ?? DEFAULTS.eyebrow}
              </p>
            </SubheadingReveal>
            <DecryptOnView
              as="h1"
              text={content.title ?? DEFAULTS.title}
              threshold={0}
              style={{ maxWidth: "22ch" }}
              className="relative mx-auto mt-3 font-display text-[clamp(32px,4.6vw,56px)] font-bold leading-[1.05] tracking-[-0.03em] text-fog md:mt-[18px]"
            />
            <ParagraphReveal
              delay={0.3}
              className="relative mx-auto mt-3 max-w-[52ch] text-[14px] leading-relaxed text-mist [text-wrap:pretty] md:mt-[18px] md:text-[clamp(15.5px,1.7vw,17.5px)]"
            >
              {content.body ?? DEFAULTS.body}
            </ParagraphReveal>
          </div>

          {/* optional kicker over the video — empty in Studio by default, the
              "but first…" body line above does the introducing */}
          {(video.eyebrow || video.title) && (
            <div className="relative mt-7 md:mt-11">
              {video.eyebrow && (
                <SubheadingReveal delay={0.35} className="relative">
                  <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
                    {video.eyebrow}
                  </p>
                </SubheadingReveal>
              )}
              {video.title && (
                <DecryptOnView
                  as="h2"
                  text={video.title}
                  threshold={0}
                  className="relative mt-2.5 font-display text-[clamp(24px,3.2vw,40px)] font-bold leading-[1.08] tracking-[-0.025em] text-fog md:mt-4"
                />
              )}
            </div>
          )}

          {/* the pre-call briefing video, the star of this page */}
          <Reveal delay={0.5} amount={0.15} className="relative mt-6 md:mt-9">
            {video.videoUrl ? (
              <AutoplayVideo
                url={video.videoUrl}
                title={video.title ?? "Pre-call briefing"}
                variant="hero"
              />
            ) : (
              <HeroVideoPlaceholder />
            )}
          </Reveal>
        </section>
      </SectionReveal>

      {/* the wall of creator receipts */}
      <VideoWall content={videoWall} videos={videos} />
    </>
  );
}
