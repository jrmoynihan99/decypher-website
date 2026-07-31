import NeuralWeb from "@/components/effects/NeuralWeb";
import StatsSection from "@/components/home/StatsSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import ScheduleHero from "@/components/schedule/ScheduleHero";
import ScrollToTop from "@/components/ui/ScrollToTop";
import type {
  CmsTestimonial,
  SchedulePageDoc,
  SiteSettings,
  ThankYouRouting,
} from "@/sanity/types";

export default function ScheduleTemplate({
  page,
  settings,
  testimonials,
  thankYou,
}: {
  page: SchedulePageDoc;
  settings: SiteSettings | null;
  testimonials: { rowA: CmsTestimonial[]; rowB: CmsTestimonial[] };
  thankYou: ThankYouRouting;
}) {
  return (
    <main className="relative">
      {/* one continuous mesh from the hero through the proof, fading out
          under whichever section closes the page */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
          }}
        />

        {/* pitch + form; booking hands off to a thank-you page (own route) */}
        <ScheduleHero
          hero={page.hero ?? {}}
          stats={settings?.stats ?? []}
          thankYou={thankYou}
        />

        {/* the receipts */}
        <TestimonialsSection
          content={page.testimonialsSection ?? {}}
          rowA={testimonials.rowA}
          rowB={testimonials.rowB}
        />

        {/* the proof — below lg only; wider viewports show these same stats up
            in the hero, so a second copy down here would just repeat itself */}
        <div className="lg:hidden">
          <StatsSection
            eyebrow={page.statsSection?.eyebrow}
            title={page.statsSection?.title}
            stats={settings?.stats ?? []}
          />
        </div>
      </div>

      <ScrollToTop />
    </main>
  );
}
