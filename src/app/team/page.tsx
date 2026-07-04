import type { Metadata } from "next";
import TeamCard from "@/components/team/TeamCard";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { teamTiers } from "@/lib/team";

export const metadata: Metadata = {
  title: "Our Team — DeCypher Financials",
  description:
    "The experts who help creators build generational wealth through finance and tax strategy.",
};

export default function TeamPage() {
  return (
    <main className="relative">
      <header className="relative z-[1] px-6 pb-[30px] pt-[90px] text-center">
        <GlowOrb
          size={760}
          blur={52}
          alpha={0.2}
          beta={0.12}
          duration={16}
          style={{ top: "calc(50% - 340px)" }}
        />
        <p className="relative m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
          [ personnel file // our team ]
        </p>
        <DecryptOnView
          as="h1"
          text="The team behind creator wealth."
          duration={1400}
          threshold={0}
          className="relative mx-auto mt-[18px] max-w-[20ch] font-display text-[clamp(38px,5.4vw,72px)] font-bold leading-[1.04] tracking-[-0.03em] text-fog"
        />
        <p className="relative mx-auto mt-[22px] max-w-[56ch] text-[clamp(15.5px,1.8vw,18px)] leading-relaxed text-mist [text-wrap:pretty]">
          The experts who help creators build generational wealth through
          finance and tax strategy. Each one runs a codename &mdash; the thing
          they&rsquo;re deadliest at.
        </p>
        <p className="relative mt-5 font-mono text-[11.5px] tracking-[0.16em] text-faint">
          {"// HOVER A CARD TO "}
          <span className="text-magenta">DECRYPT</span>
          {" THEIR CODENAME "}
          <span className="animate-blink text-magenta">▮</span>
        </p>
      </header>

      <section className="relative z-[1] mx-auto flex max-w-[1220px] flex-col gap-16 px-7 pb-[110px] pt-[30px]">
        {teamTiers.map((tier) => (
          <div key={tier.label}>
            <div className="mb-[22px] flex items-baseline gap-3.5 border-b border-edge pb-3.5">
              <h2 className="m-0 font-display text-[clamp(24px,3vw,34px)] font-semibold tracking-[-0.01em] text-fog">
                {tier.label}
              </h2>
              <span className="font-mono text-[13px] tracking-[0.06em] text-faint">
                {tier.count}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(218px,1fr))] gap-[18px]">
              {tier.people.map((p) => (
                <TeamCard key={p.fid} p={p} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
