import Reveal from "@/components/reveal/Reveal";
import SectionHeading from "@/components/ui/SectionHeading";
import Marquee from "@/components/ui/Marquee";
import TestimonialCard from "@/components/home/TestimonialCard";
import type { CmsTestimonial, SectionHeadingContent } from "@/sanity/types";

/** Repeat a row enough times for a seamless -50% marquee loop. */
const repeat = <T,>(arr: T[], n: number): T[] =>
  Array.from({ length: n }, () => arr).flat();

/**
 * Copies needed for a seamless loop: each half of the track has to overflow
 * the viewport, and the total must stay even so both halves match. A fixed
 * count doesn't work here — the two rows are authored independently in Sanity
 * and currently hold 60 and 3 quotes, so a flat 4× would render 240 blurred
 * cards for one row and 12 for the other.
 */
const copiesFor = (n: number) => (n < 1 ? 2 : Math.max(2, Math.ceil(6 / n) * 2));

/**
 * Seconds per card, not seconds per lap. Marquee's `duration` is "seconds to
 * travel one content-set", and a set's width scales with its card count — so a
 * shared duration made the 60-quote row drift ~20× faster than the 3-quote one.
 * Pace stays constant only if the duration grows with the set.
 */
const paceOf = (loopLength: number, secPerCard: number) =>
  (loopLength / 2) * secPerCard;

export default function TestimonialsSection({
  content,
  rowA,
  rowB,
}: {
  content: SectionHeadingContent;
  rowA: CmsTestimonial[];
  rowB: CmsTestimonial[];
}) {
  const loopA = repeat(rowA, copiesFor(rowA.length));
  const loopB = repeat(rowB, copiesFor(rowB.length));
  return (
    <section id="reviews" className="relative z-[1] pb-16 pt-16 md:pb-[130px] md:pt-[120px]">
      <SectionHeading
        eyebrow={content.eyebrow ?? ""}
        title={content.title ?? ""}
        glowDuration={16}
      />
      <Reveal
        amount={0.2}
        className="mt-8 overflow-hidden md:mt-[54px] md:[mask-image:linear-gradient(90deg,transparent,#000_7%,#000_93%,transparent)]"
      >
        <Marquee duration={paceOf(loopA.length, 9.7)} className="gap-5 px-6 pt-2.5">
          {loopA.map((t, i) => (
            <TestimonialCard key={`a-${i}`} t={t} />
          ))}
        </Marquee>
        <Marquee
          duration={paceOf(loopB.length, 12)}
          reverse
          className="gap-5 px-6 pb-2.5 pt-5"
        >
          {loopB.map((t, i) => (
            <TestimonialCard key={`b-${i}`} t={t} />
          ))}
        </Marquee>
      </Reveal>
    </section>
  );
}
