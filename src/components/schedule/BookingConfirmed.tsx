"use client";

import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import VideoWall from "@/components/schedule/VideoWall";
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
 * "see you in our call" — then straight into the creator-video wall; the
 * reviews reel and stats follow below in the template. Copy is editable in
 * Sanity (Book a Call → Thank You) with these defaults as fallback.
 *
 * The header stays tight on phones (smaller type, tighter gaps) so the
 * first video lands above the fold without scrolling.
 */

const DEFAULTS = {
  eyebrow: "● CHANNEL OPEN",
  title: "See you in our call.",
  body: "Request received — a real human reads every transmission and replies within one business day to lock in your time.",
};

export default function BookingConfirmed({
  content = {},
  videoWall,
  videos,
}: {
  content?: BookingConfirmationContent;
  videoWall?: SectionHeadingContent;
  videos: CmsVideoTestimonial[];
}) {
  return (
    <>
      <SectionReveal>
        <section className="relative z-[1] mx-auto max-w-[860px] px-4 pt-3 text-center md:px-6 md:pt-[64px]">
          <GlowOrb
            size={780}
            blur={54}
            alpha={0.2}
            beta={0.12}
            duration={16}
            style={{ top: "-120px" }}
          />

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
        </section>
      </SectionReveal>

      {/* "but first —" the wall of creator receipts */}
      <VideoWall content={videoWall} videos={videos} />
    </>
  );
}
