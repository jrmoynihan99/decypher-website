import ConsultButton from "@/components/ui/ConsultButton";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";

export default function CtaSection() {
  return (
    <section className="relative z-[1] overflow-hidden px-6 pb-[150px] pt-[60px] text-center">
      <GlowOrb size={840} blur={56} alpha={0.22} beta={0.14} duration={14} />
      <DecryptOnView
        as="h2"
        text="Ready to decrypt your savings?"
        className="relative mx-auto max-w-[18ch] font-display text-[clamp(36px,5.4vw,68px)] font-bold leading-[1.04] tracking-[-0.03em] text-fog"
      />
      <p className="relative mx-auto mt-[22px] max-w-[44ch] text-[17px] leading-relaxed text-mist">
        Book a free consultation. If we can&rsquo;t find you savings,
        you&rsquo;ll know in one call.
      </p>
      <div className="relative mt-9">
        <ConsultButton size="xl" />
      </div>
      <p className="relative mt-[22px] font-mono text-[11.5px] tracking-[0.16em] text-faint">
        {"// WEEKLY MODEL — CANCEL ANYTIME. NO YEARLY CONTRACTS."}
      </p>
    </section>
  );
}
