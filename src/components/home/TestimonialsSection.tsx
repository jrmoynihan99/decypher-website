import Reveal from "@/components/reveal/Reveal";
import SectionHeading from "@/components/ui/SectionHeading";
import Marquee from "@/components/ui/Marquee";
import TestimonialCard from "@/components/home/TestimonialCard";
import { TESTIMONIALS_ROW_A, TESTIMONIALS_ROW_B } from "@/lib/content";

/** Repeat a row enough times for a seamless -50% marquee loop. */
const repeat = <T,>(arr: T[], n: number): T[] =>
  Array.from({ length: n }, () => arr).flat();

const ROW_A = repeat(TESTIMONIALS_ROW_A, 4);
const ROW_B = repeat(TESTIMONIALS_ROW_B, 4);

export default function TestimonialsSection({
  eyebrow = "[ 06 // reviews ]",
}: {
  eyebrow?: string;
}) {
  return (
    <section id="reviews" className="relative z-[1] pb-[130px] pt-[120px]">
      <SectionHeading
        eyebrow={eyebrow}
        title="Creators who cracked the code."
        sub="// grab and throw the reel"
        subMono
        glowDuration={16}
      />
      <Reveal
        amount={0.2}
        className="mt-[54px] overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_7%,#000_93%,transparent)]"
      >
        <Marquee duration={58} className="gap-5 px-6 pt-2.5">
          {ROW_A.map((t, i) => (
            <TestimonialCard key={`a-${i}`} t={t} />
          ))}
        </Marquee>
        <Marquee duration={72} reverse className="gap-5 px-6 pb-2.5 pt-5">
          {ROW_B.map((t, i) => (
            <TestimonialCard key={`b-${i}`} t={t} />
          ))}
        </Marquee>
      </Reveal>
    </section>
  );
}
