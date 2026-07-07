"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SectionHeading from "@/components/ui/SectionHeading";
import type { FaqContent, SectionHeadingContent } from "@/sanity/types";
import {
  cancelDecrypt,
  decryptTo,
  encrypt,
  prefersReducedMotion,
} from "@/lib/decrypt";

/**
 * FAQ accordion. Answers ship "encrypted" (scrambled + blurred) and decrypt
 * the first time their item is opened.
 */
function FaqItem({ faq }: { faq: FaqContent }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const decrypted = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const txtRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const txt = txtRef.current;
    if (!txt || prefersReducedMotion()) return;
    if (!decrypted.current) {
      encrypt(txt, faq.answer);
    }
    return () => {
      cancelDecrypt(txt);
      txt.textContent = faq.answer;
      txt.style.filter = "";
    };
  }, [faq.answer]);

  const toggle = () => {
    const wrap = wrapRef.current;
    const txt = txtRef.current;
    if (!wrap || !txt) return;
    const next = !openRef.current;
    openRef.current = next;
    setOpen(next);
    if (next) {
      wrap.style.maxHeight = `${txt.scrollHeight + 60}px`;
      if (!decrypted.current) {
        decrypted.current = true;
        decryptTo(txt, faq.answer, undefined, () => {
          // re-measure: decrypted text is usually shorter than the scramble
          if (openRef.current) wrap.style.maxHeight = `${txt.scrollHeight + 34}px`;
        });
      } else {
        wrap.style.maxHeight = `${txt.scrollHeight + 34}px`;
      }
    } else {
      wrap.style.maxHeight = "0px";
    }
  };

  return (
    <div className="border-b border-edge">
      <button
        onClick={toggle}
        className="flex w-full cursor-pointer items-center justify-between gap-[18px] border-none bg-transparent px-1 py-6 text-left"
      >
        <span className="font-display text-[clamp(17px,2vw,20px)] font-semibold text-fog">
          {faq.question}
        </span>
        <span className="flex-none font-mono text-[15px] text-magenta">
          {open ? "[–]" : "[+]"}
        </span>
      </button>
      <div
        ref={wrapRef}
        className="max-h-0 overflow-hidden transition-[max-height] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]"
      >
        <p
          ref={txtRef}
          className="m-0 max-w-[64ch] px-1 pb-[26px] text-[15.5px] leading-[1.68] text-mist"
        >
          {faq.answer}
        </p>
      </div>
    </div>
  );
}

export default function FaqSection({
  content,
  faqs,
}: {
  content: SectionHeadingContent;
  faqs: FaqContent[];
}) {
  return (
    <section id="faq" className="relative z-[1] px-6 pb-[130px] pt-10">
      <SectionHeading
        eyebrow={content.eyebrow ?? ""}
        title={content.title ?? ""}
        sub={content.sub}
        subMono
        glowDuration={18}
      />
      <SectionReveal
        amount={0.1}
        className="mx-auto mt-12 max-w-[840px] border-t border-edge"
      >
        {faqs.map((faq, i) => (
          <Reveal key={faq.question} delay={0.1 + i * 0.07}>
            <FaqItem faq={faq} />
          </Reveal>
        ))}
      </SectionReveal>
    </section>
  );
}
