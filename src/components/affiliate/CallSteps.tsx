"use client";

import { useSpotlight } from "@/hooks/useSpotlight";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SectionHeading from "@/components/ui/SectionHeading";
import { CALL_STEPS, CALL_STEPS_HEADING } from "@/lib/landing-sections";

/**
 * What the call actually covers. Identical on every affiliate page and not in
 * the CMS on purpose: it describes DeCypher's call, not the partner's offer, so
 * there's nothing here a partner page should be able to contradict. If the call
 * itself changes, it changes in lib/landing-sections.ts once for all of them.
 *
 * Landing pages reuse the card row as their generic "Steps" section and may
 * pass their own heading, card label and steps; anything left out falls back
 * to the call steps.
 */

interface Step {
  /** "01 / CALL" — the number, then the card label. */
  tag: string;
  title: string;
  body?: string;
}

export default function CallSteps({
  eyebrow = "[ 03 // the call ]",
  title = CALL_STEPS_HEADING.title,
  sub = CALL_STEPS_HEADING.sub,
  label = CALL_STEPS_HEADING.label,
  steps = CALL_STEPS,
}: {
  eyebrow?: string;
  title?: string;
  sub?: string;
  label?: string;
  steps?: { title: string; body?: string }[];
} = {}) {
  const cards: Step[] = steps.map((s, i) => ({
    ...s,
    tag: `${String(i + 1).padStart(2, "0")} / ${label}`,
  }));
  return (
    <section className="relative z-[1] mx-auto max-w-[1160px] px-6 pb-[90px] pt-[30px]">
      <SectionHeading eyebrow={eyebrow} title={title} sub={sub} subMono />

      <SectionReveal
        amount={0.12}
        className="mt-12 grid gap-5 md:grid-cols-3"
      >
        {cards.map((step, i) => (
          <Reveal key={step.tag} delay={0.1 + i * 0.1} className="h-full">
            <StepCard step={step} />
          </Reveal>
        ))}
      </SectionReveal>
    </section>
  );
}

/**
 * Carries the cursor spotlight but no hover lift — these aren't links, and a
 * lift would advertise a click that goes nowhere (same call as PerkCard).
 */
function StepCard({ step }: { step: Step }) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLDivElement>();
  const [num, label] = step.tag.split(" / ");

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="group relative h-full overflow-hidden rounded-[18px] border border-edge bg-panel p-6 sm:p-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(320px circle at var(--mx, 50%) var(--my, 0%), rgba(255,45,120,.14), transparent 70%)",
        }}
      />

      {/* the step number as watermark — reads as sequence at a glance without
          spending a heading on it */}
      <span
        aria-hidden
        className="text-grad pointer-events-none absolute -right-2 -top-5 select-none font-display text-[86px] font-bold leading-none tracking-[-0.04em] opacity-[0.13]"
      >
        {num}
      </span>

      <div className="relative">
        <p className="m-0 font-mono text-[10px] tracking-[0.2em] text-teal">
          {num} <span className="text-dusk">/ {label}</span>
        </p>
        <b className="mt-3 block font-display text-[18px] font-semibold tracking-[-0.01em] text-fog">
          {step.title}
        </b>
        {step.body && (
          <p className="mb-0 mt-2 text-[14.5px] leading-relaxed text-muted">
            {step.body}
          </p>
        )}
      </div>
    </div>
  );
}
