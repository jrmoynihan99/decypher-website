import type { CSSProperties, ReactNode } from "react";
import AffiliateHero from "@/components/affiliate/AffiliateHero";
import CallSteps from "@/components/affiliate/CallSteps";
import ValueStack from "@/components/affiliate/ValueStack";
import NeuralWeb from "@/components/effects/NeuralWeb";
import CtaSection from "@/components/home/CtaSection";
import EstimatorSection from "@/components/home/EstimatorSection";
import FaqSection from "@/components/home/FaqSection";
import RosterSection from "@/components/home/RosterSection";
import ServicesShowcase from "@/components/home/ServicesShowcase";
import StatsSection from "@/components/home/StatsSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import VideoSection from "@/components/home/VideoSection";
import ScheduleHero from "@/components/schedule/ScheduleHero";
import ThankYouHero from "@/components/thankyou/ThankYouHero";
import VideoWall from "@/components/thankyou/VideoWall";
import TrackingCode from "@/components/TrackingCode";
import ScrollToTop from "@/components/ui/ScrollToTop";
import type { Creator } from "@/lib/creators";
import { LANDING_DEFAULTS as D, N_TOKEN } from "@/lib/landing-sections";
import type {
  CmsService,
  CmsTestimonial,
  CmsVideoTestimonial,
  LandingPageDoc,
  LandingSection,
  SiteSettings,
  ThankYouRouting,
} from "@/sanity/types";

/**
 * A landing page: whatever stack of library sections the client arranged in
 * Studio, rendered in that order.
 *
 * Every other template places its NeuralWeb meshes by hand around a fixed
 * section order. Here the order is data, so the meshes are fitted to it:
 *
 *   - Ordinary sections run in pairs under one mesh. Pairs, because a web's
 *     node count scales with its area but caps at 90 — one mesh stretched over
 *     a whole tall page thins out to nothing (see NeuralWeb's seed()). Each run
 *     bleeds 300px into its neighbours and fades over the overlap, the way Home
 *     and the affiliate template join theirs, so no seam lands on a section edge.
 *   - The services map brings its own web (the Atlas canvas), so it opens a run
 *     of its own and takes the next pair along as children for that canvas to
 *     bleed behind — exactly how Home wires it.
 *   - The tax estimator sits outside any mesh with its own wave field, as on
 *     Home; the runs either side bleed into it.
 *
 * A section with a backdrop of its own belongs in SELF_BACKED below, or two
 * animated layers will fight over it.
 */

/** Sections that bring their own animated backdrop and so break a mesh run. */
const SELF_BACKED = new Set<LandingSection["_type"]>(["sectionServices", "sectionEstimator"]);

/** Sections whose eyebrow takes a number — everything but heroes and the CTA. */
const UNNUMBERED = new Set<LandingSection["_type"]>([
  "sectionHeroVideo",
  "sectionHeroImage",
  "sectionCta",
]);

const SECTIONS_PER_MESH = 2;
const BLEED = 300;

type Run =
  | { kind: "mesh"; sections: LandingSection[] }
  | { kind: "estimator"; section: LandingSection }
  | { kind: "services"; section: LandingSection; children: LandingSection[] };

/** Splits the stack into mesh runs — see the note at the top of the file. */
function runsOf(sections: LandingSection[]): Run[] {
  const runs: Run[] = [];
  const meshable = (from: number) => {
    const out: LandingSection[] = [];
    for (let j = from; j < sections.length && out.length < SECTIONS_PER_MESH; j++) {
      if (SELF_BACKED.has(sections[j]._type)) break;
      out.push(sections[j]);
    }
    return out;
  };
  for (let i = 0; i < sections.length; ) {
    const s = sections[i];
    if (s._type === "sectionEstimator") {
      runs.push({ kind: "estimator", section: s });
      i += 1;
    } else if (s._type === "sectionServices") {
      const children = meshable(i + 1);
      runs.push({ kind: "services", section: s, children });
      i += 1 + children.length;
    } else {
      const group = meshable(i);
      runs.push({ kind: "mesh", sections: group });
      i += group.length;
    }
  }
  return runs;
}

/**
 * The first run fades in from the top of the page (200px, like every other
 * template's opening mesh); later runs start BLEED above their own top and
 * fade in across their predecessor's tail. The last fades out under whatever
 * closes the page.
 */
function meshStyle(first: boolean, last: boolean): CSSProperties {
  const mask = `linear-gradient(to bottom, transparent 0, #000 ${first ? 200 : BLEED}px, #000 calc(100% - ${BLEED}px), transparent 100%)`;
  return {
    ...(!first && { top: `-${BLEED}px` }),
    ...(!last && { bottom: `-${BLEED}px` }),
    WebkitMaskImage: mask,
    maskImage: mask,
  };
}

export interface LandingData {
  settings: SiteSettings | null;
  testimonials: { rowA: CmsTestimonial[]; rowB: CmsTestimonial[] };
  /** The whole Video Testimonials collection — for walls with no picks. */
  videos: CmsVideoTestimonial[];
  services: CmsService[];
  /** Roster creators per section key, already resolved from the picks. */
  rosters: Record<string, Creator[]>;
  thankYou: ThankYouRouting;
}

export default function LandingTemplate({
  page,
  data,
}: {
  page: LandingPageDoc;
  data: LandingData;
}) {
  const sections = page.sections ?? [];

  // Section numbers for the {n} eyebrow token, in page order.
  const numbers = new Map<string, string>();
  for (const s of sections) {
    if (!UNNUMBERED.has(s._type)) {
      numbers.set(s._key, String(numbers.size + 1).padStart(2, "0"));
    }
  }

  // Buttons left without a link jump to this page's booking form when there is
  // one — the visitor is already where the call gets booked — and otherwise
  // fall through to the site's consultation link.
  const firstBooking = sections.find((s) => s._type === "sectionBooking")?._key;
  const defaultHref = firstBooking ? "#book" : undefined;

  const stats = data.settings?.stats ?? [];

  const eyebrowOf = (s: LandingSection, fallback: string) =>
    ((s as { eyebrow?: string }).eyebrow?.trim() || fallback).replaceAll(
      N_TOKEN,
      numbers.get(s._key) ?? "",
    );
  const hrefOf = (href?: string) => href?.trim() || defaultHref;

  const render = (s: LandingSection, index: number): ReactNode => {
    // The page's first section carries its H1; any later hero or booking form
    // drops to an h2 so the outline stays one-H1.
    const titleAs = index === 0 ? "h1" : "h2";

    switch (s._type) {
      case "sectionHeroVideo":
        return (
          <ThankYouHero
            header={{ eyebrow: s.eyebrow?.trim() ?? "", title: s.title, body: s.body }}
            // no video.title: on this hero that's a second heading over the
            // video, and the page headline already introduces it
            video={{ videoUrl: s.videoUrl }}
            videoLabel={s.title}
            showVideo={!!s.videoUrl}
            cta={
              s.ctaLabel?.trim()
                ? { label: s.ctaLabel, href: hrefOf(s.ctaHref), note: s.ctaNote }
                : undefined
            }
            titleAs={titleAs}
          />
        );

      case "sectionHeroImage":
        return (
          <AffiliateHero
            content={{
              badge: s.badge,
              headlineLine1: s.headlineLine1,
              headlineLine2: s.headlineLine2,
              body: s.body,
              ctaLabel: s.ctaLabel?.trim() || D.sectionHeroImage.ctaLabel,
              ctaNote: s.ctaNote,
              quote: s.quote,
            }}
            imageUrl={s.imageUrl}
            imageAlt={s.imageAlt ?? s.quote?.attribution}
            ctaHref={hrefOf(s.ctaHref)}
            titleAs={titleAs}
          />
        );

      case "sectionStats":
        return (
          <StatsSection
            eyebrow={eyebrowOf(s, D.sectionStats.eyebrow)}
            title={s.title?.trim() || D.sectionStats.title}
            stats={stats}
          />
        );

      case "sectionTestimonials":
        return (
          <TestimonialsSection
            content={{
              eyebrow: eyebrowOf(s, D.sectionTestimonials.eyebrow),
              title: s.title?.trim() || D.sectionTestimonials.title,
            }}
            rowA={data.testimonials.rowA}
            rowB={data.testimonials.rowB}
          />
        );

      case "sectionVideoWall":
        return (
          <VideoWall
            content={{
              eyebrow: eyebrowOf(s, D.sectionVideoWall.eyebrow),
              title: s.title?.trim() || D.sectionVideoWall.title,
              sub: s.sub,
            }}
            videos={s.videos?.length ? s.videos : data.videos}
          />
        );

      case "sectionRoster":
        return (
          <RosterSection
            content={{
              eyebrow: eyebrowOf(s, D.sectionRoster.eyebrow),
              title: s.title?.trim() || D.sectionRoster.title,
            }}
            creators={data.rosters[s._key] ?? []}
          />
        );

      case "sectionEstimator":
        return (
          <EstimatorSection
            content={{
              eyebrow: eyebrowOf(s, D.sectionEstimator.eyebrow),
              title: s.title?.trim() || D.sectionEstimator.title,
              sub: s.sub?.trim() || D.sectionEstimator.sub,
            }}
          />
        );

      case "sectionVideo":
        return (
          <VideoSection
            content={{
              eyebrow: eyebrowOf(s, D.sectionVideo.eyebrow),
              title: s.title,
              sub: s.sub,
              videoUrl: s.videoUrl,
            }}
          />
        );

      case "sectionServices":
        // Rendered by the run itself — it wraps the sections after it.
        return null;

      case "sectionSteps":
        return (
          <CallSteps
            eyebrow={eyebrowOf(s, D.sectionSteps.eyebrow)}
            title={s.title?.trim() || D.sectionSteps.title}
            sub={s.sub?.trim() || D.sectionSteps.sub}
            label={s.label?.trim() || D.sectionSteps.label}
            steps={s.steps?.length ? s.steps : undefined}
          />
        );

      case "sectionValueStack":
        return (
          <ValueStack
            content={{
              ...s,
              eyebrow: eyebrowOf(s, D.sectionValueStack.eyebrow),
              totalLabel: s.totalLabel?.trim() || D.sectionValueStack.totalLabel,
            }}
            badge={s.badge ?? ""}
            closingLine={s.closingLine ?? ""}
          />
        );

      case "sectionBooking":
        return (
          // The anchor every empty button on the page jumps to. Only the first
          // form gets it — two elements can't share an id.
          <div
            id={s._key === firstBooking ? "book" : undefined}
            className="scroll-mt-20"
          >
            <ScheduleHero
              hero={{
                eyebrow: eyebrowOf(s, D.sectionBooking.eyebrow),
                title: s.title?.trim() || D.sectionBooking.title,
                body: s.body?.trim() || D.sectionBooking.body,
              }}
              stats={s.showStats === false ? [] : stats}
              // This section's own thank-you page stands in for Book a Call's
              // default; a ?ty= on the ad link still wins over both (see
              // resolveThankYouPath).
              thankYou={
                s.thankYouSlug
                  ? { ...data.thankYou, defaultSlug: s.thankYouSlug }
                  : data.thankYou
              }
              eventKey={s.callType === "referral" ? "affiliate" : undefined}
              titleAs={titleAs}
            />
          </div>
        );

      case "sectionFaq":
        return (
          <FaqSection
            content={{
              eyebrow: eyebrowOf(s, D.sectionFaq.eyebrow),
              title: s.title?.trim() || D.sectionFaq.title,
              sub: s.sub?.trim() || D.sectionFaq.sub,
            }}
            faqs={s.questions?.length ? s.questions : (data.settings?.featuredFaqs ?? [])}
            total={data.settings?.faqCount ?? 0}
          />
        );

      case "sectionCta":
        return (
          <CtaSection
            content={{
              title: s.title,
              body: s.body,
              ctaLabel: s.ctaLabel?.trim() || undefined,
              ctaHref: hrefOf(s.ctaHref),
              readout: s.readout,
            }}
          />
        );

      default:
        // A section type added to the schema but not wired up here yet, or a
        // stale one removed from it. Skip it rather than take the page down.
        return null;
    }
  };

  const indexOf = new Map(sections.map((s, i) => [s._key, i]));
  // data-section: a hook for tests and screenshots; no styling hangs off it.
  const block = (s: LandingSection) => (
    <div key={s._key} data-section={s._type}>
      {render(s, indexOf.get(s._key) ?? 0)}
    </div>
  );

  const runs = runsOf(sections);

  return (
    <main className="relative">
      <TrackingCode code={page.trackingCode} id="landing-tracking" />

      {runs.map((run, r) => {
        const first = r === 0;
        const last = r === runs.length - 1;
        switch (run.kind) {
          case "estimator":
            return block(run.section);
          case "services": {
            const s = run.section;
            if (s._type !== "sectionServices") return null;
            return (
              <div key={s._key} data-section={s._type}>
                <ServicesShowcase
                  content={{
                    eyebrow: eyebrowOf(s, D.sectionServices.eyebrow),
                    title: s.title?.trim() || D.sectionServices.title,
                  }}
                  services={data.services.slice(0, 5)}
                >
                  {run.children.map(block)}
                </ServicesShowcase>
              </div>
            );
          }
          case "mesh":
            return (
              // z-[1]: lifts each run (and the web at -z-10 inside it) into
              // its own layer, as every template does
              <div key={run.sections[0]._key} className="relative z-[1]">
                <NeuralWeb style={meshStyle(first, last)} />
                {run.sections.map(block)}
              </div>
            );
        }
      })}

      <ScrollToTop />
    </main>
  );
}
