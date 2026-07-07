import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";

/**
 * Sub-page hero header: mono eyebrow, decrypting display H1, body subline,
 * an optional mono "readout" status line, and optional extra content (CTA
 * rows) — all centered over an ambient glow. Shared by the Creators, Team,
 * Services, and Schedule pages so they open with the same voice as home.
 * SectionReveal fires on mount (the header is above the fold) and staggers
 * eyebrow → sub → readout → CTAs while the H1 decrypts over the top.
 */
export default function PageHeader({
  eyebrow,
  title,
  titleMax = "20ch",
  sub,
  readout,
  children,
}: {
  eyebrow: string;
  title: string;
  /** Max width of the H1 line box, e.g. "18ch". */
  titleMax?: string;
  sub?: React.ReactNode;
  /** Mono status line under the sub copy, e.g. record counts. */
  readout?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative z-[1] overflow-visible px-6 pb-[30px] pt-[90px] text-center">
      <SectionReveal>
        <GlowOrb
          size={760}
          blur={52}
          alpha={0.2}
          beta={0.12}
          duration={16}
          style={{ top: "calc(50% - 340px)" }}
        />
        <SubheadingReveal className="relative">
          <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            {eyebrow}
          </p>
        </SubheadingReveal>
        {/* maxWidth lives on the h1 itself so the ch unit tracks its font size */}
        <DecryptOnView
          as="h1"
          text={title}
          threshold={0}
          style={{ maxWidth: titleMax }}
          className="relative mx-auto mt-[18px] font-display text-[clamp(38px,5.4vw,72px)] font-bold leading-[1.04] tracking-[-0.03em] text-fog"
        />
        {sub != null &&
          (typeof sub === "string" ? (
            <ParagraphReveal
              delay={0.3}
              className="relative mx-auto mt-[22px] max-w-[56ch] text-[clamp(15.5px,1.8vw,18px)] leading-relaxed text-mist [text-wrap:pretty]"
            >
              {sub}
            </ParagraphReveal>
          ) : (
            <Reveal delay={0.3} className="relative">
              <p className="mx-auto mt-[22px] max-w-[56ch] text-[clamp(15.5px,1.8vw,18px)] leading-relaxed text-mist [text-wrap:pretty]">
                {sub}
              </p>
            </Reveal>
          ))}
        {readout != null && (
          <SubheadingReveal delay={0.55} className="relative mt-5">
            <p className="m-0 font-mono text-[11.5px] tracking-[0.16em] text-faint">
              {readout}
            </p>
          </SubheadingReveal>
        )}
        {children != null && <Reveal delay={0.7}>{children}</Reveal>}
      </SectionReveal>
    </header>
  );
}
