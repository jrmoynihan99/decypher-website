import NeuralWeb from "@/components/effects/NeuralWeb";
import StatsSection from "@/components/home/StatsSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import ThankYouHero from "@/components/thankyou/ThankYouHero";
import VideoWall from "@/components/thankyou/VideoWall";
import TrackingCode from "@/components/TrackingCode";
import ScrollToTop from "@/components/ui/ScrollToTop";
import type {
  CmsTestimonial,
  CmsThankYouPage,
  CmsVideoTestimonial,
  StatContent,
  ThankYouSharedSections,
} from "@/sanity/types";

/**
 * What someone sees the moment after they book: the header, the pre-call
 * video, then the same three proof sections that were under the form.
 *
 * The header copy, the video, which creator videos run on the wall and the
 * tracking snippet come from this page's own document. The wall's heading, the
 * review carousel's heading and the stats are shared by every thank-you page
 * and resolved by the caller from Book a Call and the collections — the same
 * split the affiliate pages use, and for the same reason: a new campaign page
 * should be a two-minute job, and a stat corrected once should be corrected
 * everywhere.
 *
 * With "Include the hero video" switched off the page loses its video section
 * AND the wall's heading, and reads header → creator wall: "See you in our
 * call." / "But first, hear it from the creators." straight into the grid.
 * Two headings introducing the same wall is worse than one, so the page
 * header takes the job whenever it's the thing standing directly over it.
 *
 * `page` is null when no default has been set in the Studio yet (the bare
 * /thank-you route). The hero falls back to its built-in copy, so a booking
 * still lands somewhere finished rather than on an empty page.
 */
export default function ThankYouTemplate({
  page,
  shared,
  testimonials,
  videos,
  stats,
}: {
  page: CmsThankYouPage | null;
  shared: ThankYouSharedSections;
  testimonials: { rowA: CmsTestimonial[]; rowB: CmsTestimonial[] };
  videos: CmsVideoTestimonial[];
  stats: StatContent[];
}) {
  // Only an explicit false turns it off — pages that predate the toggle have
  // no value for it and must keep the video they were built around.
  const showHeroVideo = page?.showHeroVideo !== false;

  return (
    <main className="relative">
      {/* The per-campaign conversion snippet. The base pixel it reports to is
          injected site-wide from the root layout. */}
      <TrackingCode code={page?.trackingCode} id="thank-you-tracking" />

      {/* one continuous mesh from the hero through the proof, fading out under
          whichever section closes the page — mirrors ScheduleTemplate */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
          }}
        />

        <ThankYouHero
          header={page?.header}
          video={page?.video}
          showVideo={showHeroVideo}
        />

        <VideoWall
          content={shared.videoWallSection}
          videos={videos}
          showHeading={showHeroVideo}
        />

        <TestimonialsSection
          content={shared.testimonialsSection ?? {}}
          rowA={testimonials.rowA}
          rowB={testimonials.rowB}
        />

        {/* Shown at every width, unlike on Book a Call — there the wide layout
            carries these same numbers beside the form, and this page has no
            form to sit beside. */}
        <StatsSection
          eyebrow={shared.statsSection?.eyebrow}
          title={shared.statsSection?.title}
          stats={stats}
        />
      </div>

      <ScrollToTop />
    </main>
  );
}
