import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";

/**
 * Centered section header: mono eyebrow, decrypting display heading, and an
 * optional subline (body copy or a mono code-comment), over an ambient glow.
 * One SectionReveal drives the choreography: eyebrow slides up first, the
 * heading decrypts on its own observer, and the subline follows.
 */
export default function SectionHeading({
  eyebrow,
  title,
  sub,
  subMono = false,
  subClassName = "",
  glowDuration = 17,
}: {
  eyebrow: string;
  title: string;
  sub?: React.ReactNode;
  subMono?: boolean;
  /** Extra classes for the subline wrapper (e.g. `hidden md:block`). */
  subClassName?: string;
  glowDuration?: number;
}) {
  return (
    <SectionReveal className="relative mx-auto max-w-[860px] px-2 text-center md:px-6">
      <GlowOrb duration={glowDuration} />
      <SubheadingReveal className="relative">
        <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
          {eyebrow}
        </p>
      </SubheadingReveal>
      <DecryptOnView
        as="h2"
        text={title}
        className="relative mt-4 font-display text-[clamp(34px,4.6vw,58px)] font-bold leading-[1.05] tracking-[-0.025em] text-fog"
      />
      {sub != null &&
        (subMono ? (
          <SubheadingReveal
            delay={0.35}
            className={`relative mt-[18px] ${subClassName}`}
          >
            <p className="m-0 font-mono text-[11.5px] tracking-[0.14em] text-faint">
              {sub}
            </p>
          </SubheadingReveal>
        ) : typeof sub === "string" ? (
          <ParagraphReveal
            delay={0.25}
            className={`relative mx-auto mt-4 max-w-[54ch] text-[16.5px] leading-relaxed text-mist ${subClassName}`}
          >
            {sub}
          </ParagraphReveal>
        ) : (
          <Reveal delay={0.25} className={`relative ${subClassName}`}>
            <p className="mx-auto mt-4 max-w-[54ch] text-[16.5px] leading-relaxed text-mist">
              {sub}
            </p>
          </Reveal>
        ))}
    </SectionReveal>
  );
}
