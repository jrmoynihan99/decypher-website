"use client";

import Link from "next/link";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import type { BookingConfirmationContent } from "@/sanity/types";
import type { Booking } from "./ScheduleForm";

/**
 * Post-submit thank-you takeover: replaces the whole schedule hero (pitch +
 * form) once a call request goes through. Copy is editable in Sanity
 * (Book a Call → Thank You) with these defaults as fallback; the transmission
 * log itself echoes what the visitor just sent and stays in code.
 */

const DEFAULTS = {
  eyebrow: "● CHANNEL OPEN",
  title: "Transmission received.",
  body: "Your request is in the queue. A real human reads every transmission and replies within one business day to lock in your time.",
  nextSteps: [
    {
      title: "We review your file",
      body: "Your channel, revenue, and asks — before we ever reply.",
    },
    {
      title: "You pick a time",
      body: "We send a booking link with slots that fit your schedule.",
    },
    {
      title: "We decrypt the savings",
      body: "Twenty minutes, zero jargon — and you keep the plan either way.",
    },
  ],
  readout: "// AVG RESPONSE TIME < 24 HOURS — WATCH YOUR INBOX",
};

const ghostBtnCls =
  "inline-block cursor-pointer rounded-full border border-edge-bright bg-transparent px-6 py-3 font-mono text-[11px] tracking-[0.16em] text-mist no-underline transition-colors hover:border-magenta hover:text-magenta";

function LogRow({
  label,
  value,
  accent = false,
  delay,
}: {
  label: string;
  value: string;
  accent?: boolean;
  delay: number;
}) {
  return (
    <SubheadingReveal delay={delay}>
      <div className="flex items-baseline gap-3 font-mono text-[12px] tracking-[0.08em]">
        <span className="flex-none text-faint">{label}</span>
        <span
          aria-hidden
          className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-white/15"
        />
        <span
          className={`max-w-[60%] truncate text-right ${accent ? "text-teal" : "text-mist"}`}
        >
          {value}
        </span>
      </div>
    </SubheadingReveal>
  );
}

export default function BookingConfirmed({
  booking,
  content = {},
  onReset,
}: {
  booking: Booking;
  content?: BookingConfirmationContent;
  onReset: () => void;
}) {
  const steps = content.nextSteps?.length ? content.nextSteps : DEFAULTS.nextSteps;
  const payload = booking.interests.length
    ? booking.interests.join(" + ").toUpperCase()
    : "GENERAL CONSULT";
  const log = [
    { label: "FROM", value: booking.name },
    { label: "REPLY-TO", value: booking.email },
    { label: "PAYLOAD", value: payload },
    { label: "REF", value: booking.refCode },
    { label: "STATUS", value: "QUEUED FOR REVIEW", accent: true },
  ];
  return (
    <SectionReveal>
      <section className="relative z-[1] mx-auto max-w-[860px] px-6 pb-[100px] pt-8 text-center md:pt-[80px]">
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
          style={{ maxWidth: "16ch" }}
          className="relative mx-auto mt-[18px] font-display text-[clamp(36px,4.6vw,58px)] font-bold leading-[1.05] tracking-[-0.03em] text-fog"
        />
        <ParagraphReveal
          delay={0.3}
          className="relative mx-auto mt-[22px] max-w-[46ch] text-[clamp(15.5px,1.7vw,17.5px)] leading-relaxed text-mist [text-wrap:pretty]"
        >
          {content.body ?? DEFAULTS.body}
        </ParagraphReveal>

        {/* the transmission log — echoes what was just sent */}
        <Reveal delay={0.45} className="relative mx-auto mt-10 max-w-[560px]">
          <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.045] p-6 text-left backdrop-blur-xl sm:p-7">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(61,214,196,.55),rgba(139,43,232,.55),transparent)]"
            />
            <p className="m-0 mb-4 font-mono text-[10.5px] uppercase tracking-[0.26em] text-faint">
              [ transmission log ]
            </p>
            <div className="flex flex-col gap-[10px]">
              {log.map((row, i) => (
                <LogRow key={row.label} delay={0.55 + i * 0.1} {...row} />
              ))}
            </div>
          </div>
        </Reveal>

        {/* what happens next */}
        <div className="relative mx-auto mt-12 max-w-[760px]">
          <SubheadingReveal delay={0.7}>
            <p className="m-0 font-mono text-[11px] uppercase tracking-[0.26em] text-magenta">
              [ what happens next ]
            </p>
          </SubheadingReveal>
          <div className="mt-6 grid gap-4 text-left sm:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={i} delay={0.8 + i * 0.12}>
                <div className="h-full rounded-[16px] border border-edge bg-panel p-5">
                  <span className="font-mono text-[12px] tracking-[0.14em] text-magenta">
                    [{String(i + 1).padStart(2, "0")}]
                  </span>
                  <b className="mt-2 block font-display text-[15.5px] font-semibold tracking-[-0.01em] text-fog">
                    {s.title}
                  </b>
                  <span className="mt-1 block text-[13.5px] leading-relaxed text-muted">
                    {s.body}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={1.1} className="relative mt-11">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/services" className={ghostBtnCls}>
              EXPLORE THE SERVICES →
            </Link>
            <Link href="/" className={ghostBtnCls}>
              ← BACK TO HOME
            </Link>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="mt-6 cursor-pointer border-none bg-transparent p-0 font-mono text-[10.5px] tracking-[0.18em] text-faint transition-colors hover:text-magenta"
          >
            {"// SEND ANOTHER TRANSMISSION"}
          </button>
        </Reveal>

        <SubheadingReveal delay={1.25} className="relative mt-8">
          <p className="m-0 font-mono text-[11.5px] tracking-[0.16em] text-faint">
            {content.readout ?? DEFAULTS.readout}
          </p>
        </SubheadingReveal>
      </section>
    </SectionReveal>
  );
}
