"use client";

import { useState } from "react";
import StatsGrid from "@/components/home/StatsGrid";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import ScheduleForm from "@/components/schedule/ScheduleForm";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { resolveThankYouPath } from "@/lib/thank-you";
import type {
  SchedulePageDoc,
  StatContent,
  ThankYouRouting,
} from "@/sanity/types";

/**
 * Client shell for the schedule hero: the pitch + form grid, and the handoff
 * to the thank-you page once a request goes through.
 *
 * The thank-you used to be a takeover swapped in right here. It's a real route
 * now (/thank-you/<campaign>) because the client runs paid ads and needs each
 * campaign's conversion to have a URL an ad platform can fire a pixel on — a
 * state swap has no URL to fire on. Which page depends on the `?ty=` on the
 * link the visitor arrived through; see lib/thank-you.ts.
 *
 * The navigation is a full page load rather than a router push, on purpose:
 * a client-side route change doesn't reload the document, so the pixel in the
 * page head never re-runs and the conversion goes uncounted. The destination
 * is prerendered, so the cost is small and the tracking actually works.
 *
 * The proof stats ride along under the pitch as a 2x2, but only once the grid
 * splits at lg — stacked under the headline they'd push the form below the
 * fold, so narrower widths get the standalone StatsSection down-page instead.
 */
export default function ScheduleHero({
  hero,
  stats,
  thankYou,
}: {
  hero: NonNullable<SchedulePageDoc["hero"]>;
  stats: StatContent[];
  thankYou: ThankYouRouting;
}) {
  const [leaving, setLeaving] = useState(false);

  // The form re-enables its button as soon as the request resolves, and the
  // browser takes a moment to leave — long enough to click "Book my call"
  // twice and book two calls. Swapping the panel out closes that window.
  if (leaving) return <Handoff />;

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
            onBooked={() => {
              setLeaving(true);
              window.location.assign(
                resolveThankYouPath(window.location.search, thankYou),
              );
            }}
          />
        </Reveal>
      </section>
    </SectionReveal>
  );
}

/** Holds the stage for the moment between "booked" and the thank-you page. */
function Handoff() {
  return (
    <section className="relative z-[1] mx-auto flex min-h-[46svh] max-w-[720px] flex-col items-center justify-center px-6 py-24 text-center">
      <GlowOrb
        size={780}
        blur={54}
        alpha={0.2}
        beta={0.12}
        duration={16}
        style={{ top: "-160px" }}
      />
      <p className="relative m-0 font-mono text-xs uppercase tracking-[0.3em] text-teal">
        ● CHANNEL OPEN
      </p>
      <p className="relative m-0 mt-4 font-mono text-[11.5px] tracking-[0.14em] text-faint">
        {"// YOU'RE BOOKED — OPENING YOUR BRIEFING"}
      </p>
    </section>
  );
}
