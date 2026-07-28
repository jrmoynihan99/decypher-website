"use client";

import { useEffect, useState } from "react";
import StatsGrid from "@/components/home/StatsGrid";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import BookingConfirmed from "@/components/schedule/BookingConfirmed";
import ScheduleForm, { type Booking } from "@/components/schedule/ScheduleForm";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import type {
  CmsVideoTestimonial,
  SchedulePageDoc,
  StatContent,
} from "@/sanity/types";

/**
 * Client shell for the schedule hero: renders the pitch + form grid until a
 * request goes through, then swaps the whole hero for the thank-you takeover
 * (BookingConfirmed — header + creator-video wall). Swapping at this level —
 * rather than inside the form panel — lets the confirmation own the full
 * stage while the proof sections below stay put.
 *
 * The proof stats ride along under the pitch as a 2x2, but only once the grid
 * splits at lg — stacked under the headline they'd push the form below the
 * fold, so narrower widths get the standalone StatsSection down-page instead.
 */
export default function ScheduleHero({
  hero,
  confirmation,
  videoWall,
  videos,
  stats,
}: {
  hero: NonNullable<SchedulePageDoc["hero"]>;
  confirmation: SchedulePageDoc["confirmation"];
  videoWall: SchedulePageDoc["videoWallSection"];
  videos: CmsVideoTestimonial[];
  stats: StatContent[];
}) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [preview, setPreview] = useState(false);

  // /schedule-team?confirmed shows the thank-you takeover without booking a real
  // call — for Studio editors checking copy and for Playwright screenshots.
  // An effect (not a state initializer) so server and first client render agree.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("confirmed"))
      setPreview(true);
  }, []);

  if (booking || preview) {
    return (
      <BookingConfirmed
        content={confirmation}
        videoWall={videoWall}
        videos={videos}
      />
    );
  }

  return (
    <SectionReveal>
      <section className="relative z-[1] mx-auto grid max-w-[1200px] items-start gap-12 px-6 pb-[100px] pt-8 lg:grid-cols-[1fr_520px] lg:gap-16 md:pt-[80px]">
        <GlowOrb
          size={780}
          blur={54}
          alpha={0.2}
          beta={0.12}
          duration={16}
          style={{ top: "-160px", left: "calc(25% - 390px)" }}
        />

        <div className="relative text-center lg:pt-6 lg:text-left">
          <SubheadingReveal>
            <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
              {hero.eyebrow}
            </p>
          </SubheadingReveal>
          <DecryptOnView
            as="h1"
            text={hero.title ?? ""}
            threshold={0}
            style={{ maxWidth: "14ch" }}
            className="mx-auto mt-[18px] font-display text-[clamp(38px,4.6vw,62px)] font-bold leading-[1.05] tracking-[-0.03em] text-fog lg:mx-0"
          />
          {hero.body && (
            <ParagraphReveal
              delay={0.3}
              className="mx-auto mt-[22px] max-w-[48ch] text-[clamp(15.5px,1.7vw,17.5px)] leading-relaxed text-mist [text-wrap:pretty] lg:mx-0"
            >
              {hero.body}
            </ParagraphReveal>
          )}

          {stats.length > 0 && (
            <Reveal delay={0.5}>
              {/* hairline cross between the four cells: right rule on the left
                  column, bottom rule on the top row */}
              <StatsGrid
                stats={stats}
                variant="bare"
                className="mt-12 hidden max-w-[440px] grid-cols-2 border-t border-white/10 pt-6 lg:grid [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(2n+1)]:border-r [&>*:nth-child(2n+1)]:pl-0 [&>*]:border-white/10"
              />
            </Reveal>
          )}
        </div>

        <Reveal delay={0.35}>
          <ScheduleForm
            onBooked={(b) => {
              setBooking(b);
              // the confirmation mounts at the top of the page — bring the
              // visitor with it (matters on mobile, where the form sits low)
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </Reveal>
      </section>
    </SectionReveal>
  );
}
