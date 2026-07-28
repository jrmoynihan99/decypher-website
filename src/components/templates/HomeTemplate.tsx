import CipherRain from "@/components/effects/CipherRain";
import NeuralWeb from "@/components/effects/NeuralWeb";
import ScrollHud from "@/components/effects/ScrollHud";
import CtaSection from "@/components/home/CtaSection";
import EstimatorSection from "@/components/home/EstimatorSection";
import FaqSection from "@/components/home/FaqSection";
import Hero from "@/components/home/Hero";
import RosterSection from "@/components/home/RosterSection";
import ServicesShowcase from "@/components/home/ServicesShowcase";
import StatsSection from "@/components/home/StatsSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import VideoSection from "@/components/home/VideoSection";
import type { Creator } from "@/lib/creators";
import type {
  CmsService,
  CmsTestimonial,
  HomePageDoc,
  SiteSettings,
} from "@/sanity/types";

export default function HomeTemplate({
  page,
  settings,
  creators,
  services,
  testimonials,
}: {
  page: HomePageDoc;
  settings: SiteSettings | null;
  creators: Creator[];
  services: CmsService[];
  testimonials: { rowA: CmsTestimonial[]; rowB: CmsTestimonial[] };
}) {
  // Roster carousel: the creators picked in Studio (Home → Roster), in the
  // order they're listed there. Nothing picked → the first 16 by sort position,
  // which is what the section did before it was curatable.
  const picked = page.rosterCreators ?? [];
  const byId = new Map(creators.map((c) => [c.id, c]));
  const rosterCreators = picked.length
    ? picked
        .map((ref) => byId.get(ref._ref))
        .filter((c): c is Creator => Boolean(c))
    : creators.slice(0, 16);

  return (
    <main id="top" className="relative">
      <CipherRain />
      <ScrollHud />
      {/* one continuous neural mesh spanning Hero + Stats (no seam), fading in
          at the very top and bleeding down past Stats into the Estimator.
          z-[1] lifts the whole group above the fixed CipherRain (z-0) so the
          mesh (at -z-10 inside here) still renders above it, not hidden behind. */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            bottom: "-360px",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 220px, #000 calc(100% - 360px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 220px, #000 calc(100% - 360px), transparent 100%)",
          }}
        />
        <Hero content={page.hero ?? {}} creators={creators} />
        <StatsSection
          eyebrow={page.statsSection?.eyebrow}
          title={page.statsSection?.title}
          stats={settings?.stats ?? []}
        />
      </div>
      <EstimatorSection content={page.estimatorSection ?? {}} />
      {/* continuous mesh over Video + Roster: bleeds up into the Estimator and
          fades back out as the Services section scrolls in below */}
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
        <VideoSection content={page.videoSection ?? {}} />
        <RosterSection
          content={page.rosterSection ?? {}}
          creators={rosterCreators}
        />
      </div>
      {/* Services + everything below share one web: the Atlas stage's own
          mesh bleeds down behind Testimonials/FAQ/CTA (one simulation, one
          canvas). ServicesShowcase owns the wiring. */}
      <ServicesShowcase
        content={page.servicesSection ?? {}}
        services={services.slice(0, 5)}
      >
        <TestimonialsSection
          content={page.testimonialsSection ?? {}}
          rowA={testimonials.rowA}
          rowB={testimonials.rowB}
        />
        <FaqSection
          content={page.faqSection ?? {}}
          faqs={settings?.faqs ?? []}
        />
        <CtaSection content={page.cta ?? {}} />
      </ServicesShowcase>
    </main>
  );
}
