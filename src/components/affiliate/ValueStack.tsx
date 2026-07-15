import DecryptOnView from "@/components/ui/DecryptOnView";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import type { AffiliatePageDoc } from "@/sanity/types";

type ValueStackContent = NonNullable<AffiliatePageDoc["valueStack"]>;

const DEFAULTS = {
  eyebrow: "[ 01 // itemized ]",
  totalLabel: "Total due",
};

/**
 * The partner's onboarding, priced out line by line and then zeroed — the whole
 * argument of an affiliate page in one card. Everything above the rule is what
 * it costs; everything below is what they pay.
 *
 * Prices are display strings straight from the CMS, never parsed or summed.
 * A subtotal that doesn't add up is the client's to fix, and it's better than
 * arithmetic here disagreeing with the number the partner promised in their
 * own marketing.
 *
 * The total decrypts on view rather than fading in: it's the one number on the
 * page worth waiting a beat for, and the scramble buys that beat honestly.
 */
export default function ValueStack({
  content,
  partnerName,
}: {
  content: ValueStackContent;
  partnerName?: string;
}) {
  const items = content.items ?? [];
  if (items.length === 0) return null;

  const ledger = ["ITEMIZED", "DECYPHER FINANCIALS", partnerName?.toUpperCase()]
    .filter(Boolean)
    .join(" × ");

  return (
    <section
      id="whats-included"
      className="relative z-[1] mx-auto max-w-[1100px] px-6 pb-[90px] pt-[30px]"
    >
      <SectionHeading
        eyebrow={content.eyebrow ?? DEFAULTS.eyebrow}
        title={content.title ?? ""}
      />

      <SectionReveal amount={0.12} className="mx-auto mt-12 max-w-[760px]">
        <div className="relative overflow-hidden rounded-[22px] border border-edge bg-panel">
          {/* the same lit top edge the booking panel carries */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,45,120,.55),rgba(139,43,232,.55),transparent)]"
          />

          <Reveal delay={0.05}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-6 py-4 sm:px-8">
              <p className="m-0 font-mono text-[10px] tracking-[0.2em] text-dusk">
                {ledger}
              </p>
              <span className="rounded-full border border-teal/35 bg-teal/10 px-2.5 py-1 font-mono text-[9.5px] font-bold tracking-[0.18em] text-teal">
                VIP INCLUDED
              </span>
            </div>
          </Reveal>

          <ul className="m-0 list-none p-0">
            {items.map((item, i) => (
              <Reveal key={`${item.label}-${i}`} delay={0.12 + i * 0.09}>
                <li className="flex items-start justify-between gap-5 border-b border-edge/70 px-6 py-5 sm:px-8">
                  <div className="min-w-0">
                    <b className="block font-display text-[16px] font-semibold tracking-[-0.01em] text-fog">
                      {item.label}
                    </b>
                    {item.sublabel && (
                      <p className="mb-0 mt-1 text-[13.5px] leading-relaxed text-muted">
                        {item.sublabel}
                      </p>
                    )}
                  </div>
                  {/* struck at the line, not just at the total — the discount
                      should be legible without doing the subtraction */}
                  <span className="flex-none pt-0.5 font-mono text-[14px] tabular-nums text-dusk line-through decoration-magenta/60 decoration-[1.5px]">
                    {item.price}
                  </span>
                </li>
              </Reveal>
            ))}
          </ul>

          {content.subtotal && (
            <Reveal delay={0.12 + items.length * 0.09}>
              <div className="flex items-center justify-between gap-5 px-6 py-4 sm:px-8">
                <span className="font-mono text-[10.5px] tracking-[0.18em] text-dusk">
                  SUBTOTAL
                </span>
                <span className="font-mono text-[14px] tabular-nums text-dusk line-through decoration-magenta/60 decoration-[1.5px]">
                  {content.subtotal}
                </span>
              </div>
            </Reveal>
          )}

          {/* perforation — where a receipt would tear */}
          <div
            aria-hidden
            className="mx-6 border-t border-dashed border-edge-mid sm:mx-8"
          />

          <Reveal delay={0.2 + items.length * 0.09}>
            <div className="px-6 py-7 sm:px-8">
              {/* label and value share a row at every width — the footnote sits
                  under both. Nesting it beside the label wrapped it between the
                  two on phones, which put a caveat in the middle of the number
                  it qualifies. */}
              <div className="flex items-center justify-between gap-4">
                <b className="font-display text-[17px] font-semibold tracking-[-0.01em] text-fog sm:text-[19px]">
                  {content.totalLabel ?? DEFAULTS.totalLabel}
                </b>
                {content.totalValue && (
                  <DecryptOnView
                    as="span"
                    text={content.totalValue}
                    threshold={0.4}
                    className="text-grad flex-none font-display text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums sm:text-[46px]"
                  />
                )}
              </div>
              {content.footnote && (
                <p className="mb-0 mt-3 font-mono text-[10.5px] leading-relaxed tracking-[0.06em] text-dusk">
                  {content.footnote}
                </p>
              )}
            </div>
          </Reveal>
        </div>

        <SubheadingReveal
          delay={0.3 + items.length * 0.09}
          className="mt-5 text-center"
        >
          <p className="m-0 font-mono text-[11px] tracking-[0.1em] text-dusk">
            {"// NO CARD, NO TRIAL"}
          </p>
        </SubheadingReveal>
      </SectionReveal>
    </section>
  );
}
