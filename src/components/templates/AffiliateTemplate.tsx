import AffiliateBooking from "@/components/affiliate/AffiliateBooking";
import AffiliateHero from "@/components/affiliate/AffiliateHero";
import CallSteps from "@/components/affiliate/CallSteps";
import PartnerQuotes from "@/components/affiliate/PartnerQuotes";
import ValueStack from "@/components/affiliate/ValueStack";
import NeuralWeb from "@/components/effects/NeuralWeb";
import FaqSection from "@/components/home/FaqSection";
import StatsSection from "@/components/home/StatsSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import ScrollToTop from "@/components/ui/ScrollToTop";
import type {
  AffiliatePageDoc,
  CmsTestimonial,
  SiteSettings,
} from "@/sanity/types";

/**
 * A partner landing page: the offer, the proof, the call.
 *
 * The only content this template reads from its own document is
 * partner-specific — hero, value stack, the partner's quotes. Everything else
 * is shared and resolved here: stats and FAQ from Site Settings, the review
 * carousel from the Testimonials collection, the call steps from code. That
 * split is the whole design. Adding a partner should mean filling in a short
 * form, and a stat corrected once should be corrected everywhere — not six
 * times, badly, across six pages that quietly drift apart.
 *
 * Section rhythm mirrors the funnel page this replaces: offer → proof →
 * process → the partner's word → everyone else's word → book → objections.
 * The FAQ sits after the booking panel on purpose, catching whoever scrolled
 * past it with a question still in the way.
 */
export default function AffiliateTemplate({
  page,
  settings,
  testimonials,
  heroImageUrl,
}: {
  page: AffiliatePageDoc;
  settings: SiteSettings | null;
  testimonials: { rowA: CmsTestimonial[]; rowB: CmsTestimonial[] };
  heroImageUrl?: string;
}) {
  const stats = settings?.stats ?? [];
  const faqs = settings?.faqs ?? [];

  return (
    <main className="relative">
      {/* Two mesh groups rather than one, per the Home pattern: node count
          scales with wrapper area but caps at 90, so a single web stretched
          over a page this tall thins out to nothing. The groups bleed into each
          other (-360px / -300px) and the masks fade the overlap, so the seam
          never lands on a section edge. */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            bottom: "-360px",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 360px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 360px), transparent 100%)",
          }}
        />
        <AffiliateHero
          content={page.hero ?? {}}
          partnerName={page.partnerName}
          imageUrl={heroImageUrl}
        />
        <ValueStack
          content={page.valueStack ?? {}}
          partnerName={page.partnerName}
        />
        <StatsSection
          eyebrow="[ 02 // proof of work ]"
          title="Built for creators. Not generic small business."
          stats={stats}
        />
      </div>

      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            top: "-300px",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 300px, #000 calc(100% - 300px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 300px, #000 calc(100% - 300px), transparent 100%)",
          }}
        />
        <CallSteps />
        <PartnerQuotes content={page.partnerQuotes ?? {}} />
        {/* no sub — TestimonialsSection renders eyebrow + title only */}
        <TestimonialsSection
          content={{
            eyebrow: "[ 05 // receipts ]",
            title: "And everyone else's.",
          }}
          rowA={testimonials.rowA}
          rowB={testimonials.rowB}
        />
        <AffiliateBooking />
        <FaqSection
          content={{
            eyebrow: "[ 07 // faq ]",
            title: "Questions, decrypted on demand.",
            sub: "// answers ship encrypted — open one to decrypt",
          }}
          faqs={faqs}
        />
      </div>

      <ScrollToTop />
    </main>
  );
}
