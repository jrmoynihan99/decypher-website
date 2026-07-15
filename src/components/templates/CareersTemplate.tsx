import JobCard from "@/components/careers/JobCard";
import PerkCard from "@/components/careers/PerkCard";
import NeuralWeb from "@/components/effects/NeuralWeb";
import CtaSection from "@/components/home/CtaSection";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import PageHeader from "@/components/ui/PageHeader";
import Readout from "@/components/ui/Readout";
import SectionHeading from "@/components/ui/SectionHeading";
import type { CareersPageDoc, CmsJob } from "@/sanity/types";

/** A CMS subline starting with // renders as a mono code-comment. */
const isMono = (s?: string) => !!s?.trim().startsWith("//");

export default function CareersTemplate({
  page,
  jobs,
}: {
  page: CareersPageDoc;
  jobs: CmsJob[];
}) {
  const header = page.header ?? {};
  const openings = page.openingsSection ?? {};
  const why = page.whySection ?? {};
  const perks = page.perks ?? [];
  return (
    <main className="relative">
      {/* one continuous mesh from the header through the perks, fading out
          above the closing CTA */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 280px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 280px), transparent 100%)",
          }}
        />
        <PageHeader
          eyebrow={header.eyebrow ?? ""}
          title={header.title ?? ""}
          sub={header.sub}
          readout={
            header.readout && (
              <Readout
                text={header.readout}
                vars={{ count: String(jobs.length).padStart(2, "0") }}
                blink
              />
            )
          }
        />

        {/* open roles */}
        <section className="relative z-[1] mx-auto max-w-[920px] px-6 pb-[90px] pt-[30px]">
          {(openings.eyebrow || openings.title) && (
            <SectionHeading
              eyebrow={openings.eyebrow ?? ""}
              title={openings.title ?? ""}
              sub={openings.sub}
              subMono={isMono(openings.sub)}
            />
          )}
          {jobs.length ? (
            <SectionReveal amount={0.1} className="mt-12 flex flex-col gap-4">
              {jobs.map((job, i) => (
                <Reveal key={job.title} delay={0.1 + Math.min(i * 0.1, 0.5)}>
                  <JobCard job={job} index={i} />
                </Reveal>
              ))}
            </SectionReveal>
          ) : (
            <SectionReveal amount={0.1} className="mt-12">
              <Reveal delay={0.1}>
                <div className="rounded-[20px] border border-dashed border-edge-mid bg-panel/60 px-6 py-12 text-center">
                  <p className="m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
                    {"// NO OPEN NODES DETECTED"}
                  </p>
                  {page.noOpenings && (
                    <p className="mx-auto mb-0 mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">
                      {page.noOpenings}
                    </p>
                  )}
                </div>
              </Reveal>
            </SectionReveal>
          )}
        </section>

        {/* why decypher */}
        {(why.title || perks.length > 0) && (
          <section className="relative z-[1] mx-auto max-w-[1100px] px-6 pb-[110px]">
            {(why.eyebrow || why.title) && (
              <SectionHeading
                eyebrow={why.eyebrow ?? ""}
                title={why.title ?? ""}
                sub={why.sub}
                subMono={isMono(why.sub)}
              />
            )}
            <SectionReveal
              amount={0.15}
              className="mt-12 grid gap-[18px] sm:grid-cols-2"
            >
              {perks.map((perk, i) => (
                <Reveal key={i} delay={0.1 + i * 0.1}>
                  <PerkCard perk={perk} />
                </Reveal>
              ))}
            </SectionReveal>
          </section>
        )}
      </div>

      {/* closing CTA */}
      <CtaSection content={page.cta ?? {}} />
    </main>
  );
}
