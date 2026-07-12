import NeuralWeb from "@/components/effects/NeuralWeb";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import TeamCard, { TeamFeatureCard } from "@/components/team/TeamCard";
import ConsultButton from "@/components/ui/ConsultButton";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import PageHeader from "@/components/ui/PageHeader";
import Readout from "@/components/ui/Readout";
import { buildTeamTiers } from "@/lib/team";
import type { CmsTeamMember, TeamPageDoc } from "@/sanity/types";

export default function TeamTemplate({
  page,
  members,
}: {
  page: TeamPageDoc;
  members: CmsTeamMember[];
}) {
  const header = page.header ?? {};
  const cta = page.cta ?? {};
  const teamTiers = buildTeamTiers(members);
  const total = teamTiers.reduce((n, t) => n + t.people.length, 0);
  /** One-line mission per tier, keyed by tier label. */
  const tierTaglines: Record<string, string | undefined> = {
    Managers: page.tierTaglines?.managers,
    Seniors: page.tierTaglines?.seniors,
    Staff: page.tierTaglines?.staff,
  };
  return (
    <main className="relative">
      {/* one continuous mesh from the header down the personnel files,
          fading out above the closing CTA */}
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
                vars={{
                  count: String(total).padStart(2, "0"),
                  tiers: teamTiers.length,
                }}
                blink
              />
            )
          }
        />

        <section className="relative z-[1] mx-auto flex max-w-[1220px] flex-col gap-16 px-7 pb-[110px] pt-[30px]">
          {teamTiers.map((tier, ti) => (
            <div key={tier.label}>
              <div className="mb-[22px] border-b border-edge pb-4">
                <SubheadingReveal>
                  <p className="m-0 font-mono text-[11px] uppercase tracking-[0.26em] text-magenta">
                    {`[ tier 0${ti + 1} // ${tier.label.toLowerCase()} ]`}
                  </p>
                </SubheadingReveal>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
                  <DecryptOnView
                    as="h2"
                    text={tier.label}
                    threshold={0.2}
                    className="m-0 font-display text-[clamp(24px,3vw,34px)] font-semibold tracking-[-0.01em] text-fog"
                  />
                  <span className="font-mono text-[13px] tracking-[0.06em] text-faint">
                    {tier.count}
                  </span>
                  {tierTaglines[tier.label] && (
                    <span className="ml-auto text-[14px] text-muted">
                      {tierTaglines[tier.label]}
                    </span>
                  )}
                </div>
              </div>
              {/* tier hierarchy: managers get wide feature dossiers; seniors
                  and staff share a uniform card grid */}
              {ti === 0 ? (
                <SectionReveal
                  amount={0.15}
                  className="grid gap-[18px] lg:grid-cols-2"
                >
                  {tier.people.map((p, i) => (
                    <Reveal key={p.fid} delay={0.1 + i * 0.12}>
                      <TeamFeatureCard p={p} />
                    </Reveal>
                  ))}
                </SectionReveal>
              ) : (
                <SectionReveal
                  amount={0.1}
                  className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(228px,1fr))] sm:gap-[18px]"
                >
                  {tier.people.map((p, i) => (
                    <Reveal key={p.fid} delay={0.1 + Math.min(i * 0.06, 0.55)}>
                      <TeamCard p={p} />
                    </Reveal>
                  ))}
                </SectionReveal>
              )}
            </div>
          ))}
        </section>
      </div>

      {/* closing CTA */}
      <SectionReveal>
        <section className="relative z-[1] overflow-x-clip px-6 pb-[130px] pt-[10px] text-center">
          <GlowOrb size={760} blur={54} alpha={0.2} beta={0.12} duration={15} />
          <DecryptOnView
            as="h2"
            text={cta.title ?? ""}
            className="relative mx-auto max-w-[20ch] font-display text-[clamp(32px,4.6vw,56px)] font-bold leading-[1.05] tracking-[-0.025em] text-fog"
          />
          {cta.body && (
            <ParagraphReveal
              delay={0.2}
              className="relative mx-auto mt-5 max-w-[48ch] text-[16.5px] leading-relaxed text-mist"
            >
              {cta.body}
            </ParagraphReveal>
          )}
          <Reveal delay={0.4} className="relative mt-8">
            <ConsultButton size="lg" href={cta.ctaHref || undefined}>
              {cta.ctaLabel}
            </ConsultButton>
          </Reveal>
          {cta.readout && (
            <SubheadingReveal delay={0.55} className="relative mt-[22px]">
              <p className="m-0 font-mono text-[11.5px] tracking-[0.16em] text-faint">
                {cta.readout}
              </p>
            </SubheadingReveal>
          )}
        </section>
      </SectionReveal>
    </main>
  );
}
