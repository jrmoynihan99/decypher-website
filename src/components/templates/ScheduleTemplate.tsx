import NeuralWeb from "@/components/effects/NeuralWeb";
import StatsSection from "@/components/home/StatsSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import ScheduleHero from "@/components/schedule/ScheduleHero";
import type {
  CmsTestimonial,
  SchedulePageDoc,
  SiteSettings,
} from "@/sanity/types";

export default function ScheduleTemplate({
  page,
  settings,
  serviceTitles,
  testimonials,
}: {
  page: SchedulePageDoc;
  settings: SiteSettings | null;
  serviceTitles: string[];
  testimonials: { rowA: CmsTestimonial[]; rowB: CmsTestimonial[] };
}) {
  return (
    <main className="relative">
      {/* one continuous mesh from the hero through the proof, fading out
          under the reviews reel */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
          }}
        />

        {/* hero: pitch + form until the request sends, then the thank-you
            takeover — the swap lives in ScheduleHero (client) */}
        <ScheduleHero
          hero={page.hero ?? {}}
          confirmation={page.confirmation}
          serviceTitles={serviceTitles}
        />

        {/* the proof */}
        <StatsSection
          eyebrow={page.statsSection?.eyebrow}
          title={page.statsSection?.title}
          stats={settings?.stats ?? []}
        />

        {/* the receipts */}
        <TestimonialsSection
          content={page.testimonialsSection ?? {}}
          rowA={testimonials.rowA}
          rowB={testimonials.rowB}
        />
      </div>
    </main>
  );
}
