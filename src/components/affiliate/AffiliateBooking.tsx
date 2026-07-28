"use client";

import { useState } from "react";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import ScheduleForm, { type Booking } from "@/components/schedule/ScheduleForm";
import DecryptOnView from "@/components/ui/DecryptOnView";
import SectionHeading from "@/components/ui/SectionHeading";

/**
 * The booking section — the page's only real ask.
 *
 * Books the shared "DeCypher Affiliate" event via `eventKey`, so there's no
 * income question: the partner already paid for this call, and qualifying
 * someone who's been sent here by a person they trust is both redundant and a
 * good way to lose them.
 *
 * Unlike /schedule-team, confirmation replaces only this panel rather than taking
 * over the page. The value stack and the partner's endorsement above are what
 * got them to book; blanking those out the moment they do would throw away the
 * reassurance right when second thoughts arrive.
 */

const HEADING = {
  eyebrow: "[ 06 // schedule ]",
  title: "Pick a time that works.",
  sub: "It's you and a DeCypher strategist — 30 minutes, no obligation. You'll get a confirmation and a reminder before the call.",
};

export default function AffiliateBooking() {
  const [booking, setBooking] = useState<Booking | null>(null);

  return (
    <section
      id="book"
      className="relative z-[1] mx-auto max-w-[1100px] scroll-mt-24 px-6 pb-[90px] pt-[30px]"
    >
      <SectionHeading
        eyebrow={HEADING.eyebrow}
        title={HEADING.title}
        sub={HEADING.sub}
      />

      <SectionReveal amount={0.1} className="mx-auto mt-12 max-w-[580px]">
        <Reveal delay={0.1}>
          {booking ? (
            <Confirmed booking={booking} />
          ) : (
            <ScheduleForm eventKey="affiliate" onBooked={setBooking} />
          )}
        </Reveal>
      </SectionReveal>
    </section>
  );
}

/**
 * What they get instead of the form once it's done: the time, in their own
 * timezone, and the two links they might actually need. No upsell — the call
 * is the conversion, and this page has nothing left to sell.
 */
function Confirmed({ booking }: { booking: Booking }) {
  const when = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(booking.startTime));

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.045] p-7 text-center sm:p-9 md:backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(61,214,196,.6),transparent)]"
      />

      <SubheadingReveal immediate>
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.3em] text-teal">
          ● CHANNEL OPEN
        </p>
      </SubheadingReveal>

      <DecryptOnView
        as="h3"
        text="You're booked."
        threshold={0}
        className="mt-3 font-display text-[clamp(26px,3.4vw,34px)] font-bold tracking-[-0.02em] text-fog"
      />

      {/* Deliberately not booking.eventName — that's the internal Calendly
          label ("DeCypher Affiliate"), which means nothing to a visitor and
          reads like they booked a category. */}
      <p className="mx-auto mb-0 mt-4 max-w-[36ch] text-[15px] leading-relaxed text-mist">
        Your call is locked in, {booking.name.split(" ")[0]}. Confirmation is on
        its way to <span className="text-fog">{booking.email}</span>.
      </p>

      <p className="mx-auto mt-5 rounded-[11px] border border-white/10 bg-panel-2 px-4 py-3 font-mono text-[12.5px] tracking-[0.05em] text-fog">
        {when}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <a
          href={booking.rescheduleUrl}
          className="font-mono text-[11px] tracking-[0.12em] text-dusk underline decoration-white/20 underline-offset-4 transition-colors hover:text-fog"
        >
          RESCHEDULE
        </a>
        <a
          href={booking.cancelUrl}
          className="font-mono text-[11px] tracking-[0.12em] text-dusk underline decoration-white/20 underline-offset-4 transition-colors hover:text-fog"
        >
          CANCEL
        </a>
      </div>
    </div>
  );
}
