"use client";

import Link from "next/link";
import { useId, useState } from "react";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SectionHeading from "@/components/ui/SectionHeading";
import type { FaqTeaser, SectionHeadingContent } from "@/sanity/types";

/**
 * FAQ accordion: a handful of Creator Tax FAQ questions (Site Settings → FAQ →
 * Questions on Home), each opening to its short answer and a link to the full
 * page.
 *
 * The answers used to ship scrambled and decrypt on open; they're plain text
 * now, in the DOM from the first render, because Acquisition.com's FAQ launch
 * checklist wants them readable by crawlers and AI assistants. Keep it that
 * way: no decrypt effects on answer text here.
 */
function FaqItem({ faq }: { faq: FaqTeaser }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-b border-edge">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center justify-between gap-[18px] border-none bg-transparent px-1 py-6 text-left"
      >
        <span className="font-display text-[clamp(17px,2vw,20px)] font-semibold text-fog">
          {faq.question}
        </span>
        <span className="flex-none font-mono text-[15px] text-magenta">
          {open ? "[–]" : "[+]"}
        </span>
      </button>
      {/* 0fr → 1fr animates to the content's own height without measuring it */}
      <div
        id={panelId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-1 pb-[26px]">
            <p className="m-0 max-w-[64ch] text-[15.5px] leading-[1.68] text-mist">
              {faq.shortAnswer}
            </p>
            <Link
              href={`/faq/${faq.slug}`}
              className="mt-3 inline-block font-mono text-[12px] tracking-[0.08em] text-magenta no-underline transition-colors hover:text-fog"
            >
              Read the full answer →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FaqSection({
  content,
  faqs,
  total,
}: {
  content: SectionHeadingContent;
  faqs: FaqTeaser[];
  /** How many questions the full FAQ has, for the "see all" link. */
  total: number;
}) {
  // nothing picked in Site Settings → no section, rather than a heading over nothing
  if (!faqs.length) return null;
  return (
    <section id="faq" className="relative z-[1] px-4 pb-16 pt-10 md:px-6 md:pb-[130px]">
      <SectionHeading
        eyebrow={content.eyebrow ?? ""}
        title={content.title ?? ""}
        sub={content.sub}
        subMono
        subClassName="hidden md:block"
        glowDuration={18}
      />
      <SectionReveal
        amount={0.1}
        className="mx-auto mt-8 max-w-[840px] border-t border-edge md:mt-12"
      >
        {faqs.map((faq, i) => (
          <Reveal key={faq.slug} delay={0.1 + i * 0.07}>
            <FaqItem faq={faq} />
          </Reveal>
        ))}
        <Reveal delay={0.1 + faqs.length * 0.07} className="pt-8 text-center">
          <Link
            href="/faq"
            className="font-mono text-[12.5px] tracking-[0.1em] text-mist no-underline transition-colors hover:text-magenta"
          >
            {`See all ${total} questions in the Creator Tax FAQ →`}
          </Link>
        </Reveal>
      </SectionReveal>
    </section>
  );
}
