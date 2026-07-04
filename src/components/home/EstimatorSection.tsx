import SectionHeading from "@/components/ui/SectionHeading";
import TaxEstimator from "@/components/estimator/TaxEstimator";

export default function EstimatorSection() {
  return (
    <section id="estimator" className="relative z-[1] px-6 pb-[120px] pt-10">
      <SectionHeading
        eyebrow="[ 02 // run the numbers ]"
        title="Decrypt your tax bill."
        sub={
          <>
            A 60-second, no-login estimate of your self-employment, federal,
            and state taxes &mdash; plus what you could be saving. 2026 tax
            year, US self-employed.
          </>
        }
        glowDuration={18}
      />
      <div className="mx-auto mt-11 w-full max-w-[760px]">
        <TaxEstimator />
      </div>
    </section>
  );
}
