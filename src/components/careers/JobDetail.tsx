import Link from "next/link";
import ApplyCta from "@/components/careers/ApplyCta";
import JobMetaSidebar from "@/components/careers/JobMetaSidebar";
import RichText from "@/components/RichText";
import JobTabPanel from "@/components/careers/JobTabPanel";
import { JobTabsProvider } from "@/components/careers/JobTabs";
import NeuralWeb from "@/components/effects/NeuralWeb";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import ClickToPlayVideo from "@/components/schedule/ClickToPlayVideo";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import PageHeader from "@/components/ui/PageHeader";
import Readout from "@/components/ui/Readout";
import type { CmsJob } from "@/sanity/types";

/**
 * One role's dossier page (/careers/<slug>). The standard decrypting
 * PageHeader opens it; below sits the "role file" — a sticky meta rail on the
 * left (status, location, comp, stack) and a tabbed panel on the right where
 * OVERVIEW (optional VSL + the rich posting) swaps in place for APPLICATION
 * (the inline form — no modal). Every apply button on the page flips that tab
 * via JobTabsProvider. A closing apply band covers readers who reach the end
 * on mobile, where the rail isn't sticky.
 */
export default function JobDetail({ job }: { job: CmsJob }) {
  const meta = [job.location, job.type, job.comp && `**${job.comp}**`]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  const overview = (
    <>
      {job.videoUrl && (
        <div className="mb-8">
          <p className="m-0 mb-3 font-mono text-[11px] tracking-[0.22em] text-faint">
            {"// TRANSMISSION — A WORD BEFORE YOU READ"}
          </p>
          <ClickToPlayVideo
            url={job.videoUrl}
            title={`${job.title} — a word from the team`}
            variant="hero"
          />
        </div>
      )}
      {job.description?.length ? (
        <RichText value={job.description} />
      ) : (
        <p className="m-0 text-[15.5px] leading-relaxed text-mist">{job.blurb}</p>
      )}
    </>
  );

  return (
    <main className="relative">
      <JobTabsProvider>
        {/* one continuous mesh from the header through the role file, fading
            out above the closing apply band */}
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
            eyebrow={`[ careers // ${job.department.toLowerCase()} ]`}
            title={job.title}
            titleMax="22ch"
            sub={job.blurb}
            readout={meta && <Readout text={`// ${meta}`} blink />}
          >
            <div className="relative mt-9 flex flex-wrap items-center justify-center gap-4">
              <ApplyCta size="lg" />
              <Link
                href="/careers"
                className="rounded-full border border-edge-bright px-[30px] py-4 font-display text-[16.5px] font-semibold text-fog no-underline transition-colors hover:border-magenta"
              >
                ← All openings
              </Link>
            </div>
          </PageHeader>

          {/* the role file: sticky meta rail + tabbed dossier */}
          <section
            id="role-file"
            className="relative z-[1] mx-auto max-w-[1100px] px-6 pb-[100px] pt-[30px]"
          >
            <SectionReveal amount={0.05}>
              <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
                {/* sticky sits OUTSIDE Reveal: the motion wrapper's persistent
                    will-change:transform makes it a containing block that
                    defeats position:sticky (cousin of the fixed-modal trap),
                    so the card animates inside the sticky box instead */}
                <div className="order-2 lg:order-1">
                  <div className="lg:sticky lg:top-24">
                    <Reveal delay={0.1}>
                      <JobMetaSidebar job={job} />
                    </Reveal>
                  </div>
                </div>
                <Reveal delay={0.18} className="order-1 lg:order-2">
                  <JobTabPanel job={job} overview={overview} />
                </Reveal>
              </div>
            </SectionReveal>
          </section>
        </div>

        {/* closing apply band */}
        <SectionReveal>
          <section className="relative z-[1] px-6 pb-20 pt-6 text-center md:pb-[140px] md:pt-10">
            <GlowOrb size={840} blur={56} alpha={0.22} beta={0.14} duration={14} anchorTop />
            <DecryptOnView
              as="h2"
              text="Sound like you?"
              className="relative mx-auto max-w-[18ch] font-display text-[clamp(36px,5.4vw,68px)] font-bold leading-[1.04] tracking-[-0.03em] text-fog"
            />
            <ParagraphReveal
              delay={0.2}
              className="relative mx-auto mt-[22px] max-w-[44ch] text-[17px] leading-relaxed text-mist"
            >
              Ten minutes, no cover letter — your resume fills in half of it.
              A real human reads every application — if the fit is there,
              you&rsquo;ll hear back within the week.
            </ParagraphReveal>
            <Reveal delay={0.4} className="relative mt-9">
              <ApplyCta size="xl">{`Apply — ${job.title}`}</ApplyCta>
            </Reveal>
            <SubheadingReveal delay={0.55} className="relative mt-[22px]">
              <p className="m-0 font-mono text-[11.5px] tracking-[0.16em] text-faint">
                {"// APPLICATIONS REVIEWED WEEKLY — NO COVER LETTER REQUIRED"}
              </p>
            </SubheadingReveal>
          </section>
        </SectionReveal>
      </JobTabsProvider>
    </main>
  );
}
