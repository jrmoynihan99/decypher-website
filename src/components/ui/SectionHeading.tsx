import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";

/**
 * Centered section header: mono eyebrow, decrypting display heading, and an
 * optional subline (body copy or a mono code-comment), over an ambient glow.
 */
export default function SectionHeading({
  eyebrow,
  title,
  sub,
  subMono = false,
  glowDuration = 17,
}: {
  eyebrow: string;
  title: string;
  sub?: React.ReactNode;
  subMono?: boolean;
  glowDuration?: number;
}) {
  return (
    <div className="relative mx-auto max-w-[860px] px-6 text-center">
      <GlowOrb duration={glowDuration} />
      <p className="relative m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
        {eyebrow}
      </p>
      <DecryptOnView
        as="h2"
        text={title}
        className="relative mt-4 font-display text-[clamp(34px,4.6vw,58px)] font-bold leading-[1.05] tracking-[-0.025em] text-fog"
      />
      {sub != null &&
        (subMono ? (
          <p className="relative mt-[18px] font-mono text-[11.5px] tracking-[0.14em] text-faint">
            {sub}
          </p>
        ) : (
          <p className="relative mx-auto mt-4 max-w-[54ch] text-[16.5px] leading-relaxed text-mist">
            {sub}
          </p>
        ))}
    </div>
  );
}
