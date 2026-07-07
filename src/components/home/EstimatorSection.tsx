import WaveField from "@/components/effects/WaveField";
import Reveal from "@/components/reveal/Reveal";
import SectionHeading from "@/components/ui/SectionHeading";
import TaxEstimator from "@/components/estimator/TaxEstimator";
import type { SectionHeadingContent } from "@/sanity/types";

export default function EstimatorSection({
  content,
}: {
  content: SectionHeadingContent;
}) {
  return (
    <section id="estimator" className="relative z-[1] px-6 pb-[120px] pt-10">
      <WaveField />
      <SectionHeading
        eyebrow={content.eyebrow ?? ""}
        title={content.title ?? ""}
        sub={content.sub}
        glowDuration={18}
      />
      <Reveal amount={0.15} className="mx-auto mt-11 w-full max-w-[760px]">
        <TaxEstimator />
      </Reveal>
    </section>
  );
}
