import Reveal from "@/components/reveal/Reveal";
import SectionHeading from "@/components/ui/SectionHeading";
import Marquee from "@/components/ui/Marquee";
import TestimonialCard from "@/components/home/TestimonialCard";
import type { CmsTestimonial, SectionHeadingContent } from "@/sanity/types";

/** Repeat a row enough times for a seamless -50% marquee loop. */
const repeat = <T,>(arr: T[], n: number): T[] =>
  Array.from({ length: n }, () => arr).flat();

export default function TestimonialsSection({
  content,
  rowA,
  rowB,
}: {
  content: SectionHeadingContent;
  rowA: CmsTestimonial[];
  rowB: CmsTestimonial[];
}) {
  const loopA = repeat(rowA, 4);
  const loopB = repeat(rowB, 4);
  return (
    <section id="reviews" className="relative z-[1] pb-[130px] pt-[120px]">
      <SectionHeading
        eyebrow={content.eyebrow ?? ""}
        title={content.title ?? ""}
        sub={content.sub}
        subMono
        glowDuration={16}
      />
      <Reveal
        amount={0.2}
        className="mt-[54px] overflow-hidden md:[mask-image:linear-gradient(90deg,transparent,#000_7%,#000_93%,transparent)]"
      >
        <Marquee duration={58} className="gap-5 px-6 pt-2.5">
          {loopA.map((t, i) => (
            <TestimonialCard key={`a-${i}`} t={t} />
          ))}
        </Marquee>
        <Marquee duration={72} reverse className="gap-5 px-6 pb-2.5 pt-5">
          {loopB.map((t, i) => (
            <TestimonialCard key={`b-${i}`} t={t} />
          ))}
        </Marquee>
      </Reveal>
    </section>
  );
}
