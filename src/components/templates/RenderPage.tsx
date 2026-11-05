import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo";
import AffiliateTemplate from "@/components/templates/AffiliateTemplate";
import CareersTemplate from "@/components/templates/CareersTemplate";
import CreatorsTemplate from "@/components/templates/CreatorsTemplate";
import HomeTemplate from "@/components/templates/HomeTemplate";
import LandingTemplate from "@/components/templates/LandingTemplate";
import ScheduleTemplate from "@/components/templates/ScheduleTemplate";
import ServicesTemplate from "@/components/templates/ServicesTemplate";
import TeamTemplate from "@/components/templates/TeamTemplate";
import {
  getCreators,
  getHomeRosterRefs,
  getJobs,
  getPageBySlug,
  getServices,
  getSiteSettings,
  getTeam,
  getTestimonials,
  getThankYouRouting,
  getVideoTestimonials,
  slugToPath,
} from "@/sanity/queries";
import { creatorRevenueTimeline, withLiveStats } from "@/lib/quickbooks/public-stats";
import { taxSavingsSummary } from "@/lib/tax-recap/public-stats";
import { urlFor } from "@/sanity/image";
import type { Creator } from "@/lib/creators";
import type { LandingPageDoc, PageDoc } from "@/sanity/types";

/**
 * Template dispatch: a page document's `_type` picks the layout, and each
 * template fetches the collections it renders. Identical GROQ calls within
 * one render are deduped by Next's fetch memoization.
 */
export async function renderPage(page: PageDoc) {
  switch (page._type) {
    case "homePage": {
      // The stat tokens, the revenue graph and the savings strip share their
      // reads — see the cache() wrappers in the two public-stats modules.
      const [settings, creators, services, testimonials, revenue, taxSavings] =
        await Promise.all([
          getSiteSettings().then(withLiveStats),
          getCreators(),
          getServices(),
          getTestimonials(),
          creatorRevenueTimeline(),
          taxSavingsSummary(),
        ]);
      return (
        <HomeTemplate
          page={page}
          settings={settings}
          creators={creators}
          services={services}
          testimonials={testimonials}
          revenue={revenue}
          taxSavings={taxSavings}
        />
      );
    }
    case "servicesPage": {
      const services = await getServices();
      return <ServicesTemplate page={page} services={services} />;
    }
    case "creatorsPage": {
      const creators = await getCreators();
      return <CreatorsTemplate page={page} creators={creators} />;
    }
    case "teamPage": {
      const members = await getTeam();
      return <TeamTemplate page={page} members={members} />;
    }
    case "schedulePage": {
      const [settings, testimonials, thankYou] = await Promise.all([
        getSiteSettings().then(withLiveStats),
        getTestimonials(),
        // Where the form hands off once a call is booked. Resolved server-side
        // because the page doc holds a raw reference (blanket `...` fetch) and
        // the form also needs the full route list to validate a `?ty=` against.
        getThankYouRouting(),
      ]);
      return (
        <ScheduleTemplate
          page={page}
          settings={settings}
          testimonials={testimonials}
          thankYou={thankYou}
        />
      );
    }
    case "careersPage": {
      const jobs = await getJobs();
      return <CareersTemplate page={page} jobs={jobs} />;
    }
    case "affiliatePage": {
      const [settings, testimonials] = await Promise.all([
        getSiteSettings().then(withLiveStats),
        getTestimonials(),
      ]);
      // Page docs are fetched with a blanket `...` spread, so the hero image
      // arrives as a raw asset ref rather than a URL — the collections resolve
      // theirs inside their own queries, but there's no per-type projection to
      // hang this on. Resolving here keeps getPageBySlug generic.
      return (
        <AffiliateTemplate
          page={page}
          settings={settings}
          testimonials={testimonials}
          heroImageUrl={
            page.hero?.image
              ? urlFor(page.hero.image).width(920).url()
              : undefined
          }
        />
      );
    }
    case "landingPage":
      return renderLanding(page);
  }
}

/** Roster carousel's fallback size when nothing is picked — Home's. */
const ROSTER_DEFAULT = 16;

/**
 * A landing page reads only what its sections use: a page with no reviews
 * carousel never fetches testimonials, one with no services map never fetches
 * services. Site Settings is always read — stats, the booking form's stat grid
 * and the FAQ fallback all hang off it, and the layout has already fetched it.
 */
async function renderLanding(page: LandingPageDoc) {
  const sections = page.sections ?? [];
  const has = (type: string) => sections.some((s) => s._type === type);
  const rosters = sections.filter((s) => s._type === "sectionRoster");
  const wallNeedsAll = sections.some(
    (s) => s._type === "sectionVideoWall" && !s.videos?.length,
  );

  const none = Promise.resolve(null);
  const [settings, testimonials, videos, services, creators, homeRoster, thankYou] =
    await Promise.all([
      getSiteSettings().then(withLiveStats),
      has("sectionTestimonials") ? getTestimonials() : none,
      wallNeedsAll ? getVideoTestimonials() : none,
      has("sectionServices") ? getServices() : none,
      rosters.length ? getCreators() : none,
      rosters.some((s) => !s.creators?.length) ? getHomeRosterRefs() : none,
      has("sectionBooking") ? getThankYouRouting() : none,
    ]);

  // Each roster's picks, in order — else Home's picks — else the first 16 by
  // sort position, the same fallback chain Home's own carousel uses. Matched
  // against the one creators fetch rather than dereferenced per section.
  const byId = new Map((creators ?? []).map((c) => [c.id, c]));
  const pick = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((c): c is Creator => Boolean(c));
  const rosterBy: Record<string, Creator[]> = {};
  for (const s of rosters) {
    const own = pick((s.creators ?? []).map((r) => r._ref));
    const home = pick(homeRoster ?? []);
    rosterBy[s._key] = own.length
      ? own
      : home.length
        ? home
        : (creators ?? []).slice(0, ROSTER_DEFAULT);
  }

  return (
    <LandingTemplate
      page={page}
      data={{
        settings,
        testimonials: testimonials ?? { rowA: [], rowB: [] },
        videos: videos ?? [],
        services: services ?? [],
        rosters: rosterBy,
        thankYou: thankYou ?? { defaultSlug: null, slugs: [] },
      }}
    />
  );
}

/**
 * Page SEO with Site Settings defaults as fallback.
 *
 * The Share image resolves page → Site Settings → the generated card; only the
 * first two come from Sanity, so an unset image here means socialMetadata falls
 * through to app/opengraph-image.tsx rather than emitting nothing.
 */
export async function pageMetadata(slug: string): Promise<Metadata> {
  const [page, settings] = await Promise.all([
    getPageBySlug(slug),
    getSiteSettings(),
  ]);
  if (!page) return {};

  const title = page.seo?.title ?? settings?.defaultSeo?.title;
  const description =
    page.seo?.description ?? settings?.defaultSeo?.description;
  const share = page.seo?.ogImage ?? settings?.defaultSeo?.ogImage;

  // Landing pages marked "Hide from search engines": reachable by link (ads,
  // emails) but asked not to be listed. They're out of the sitemap too.
  const hidden = page._type === "landingPage" && page.hideFromSearch === true;

  return {
    title,
    description,
    ...(hidden && { robots: { index: false, follow: true } }),
    // Self-referencing canonical: the catch-all serves the same document at
    // more than one URL shape (trailing slash, the query strings on affiliate
    // links), and this names the one that should be indexed.
    ...socialMetadata({
      title,
      description,
      path: slugToPath(page.slug),
      image: share
        ? urlFor(share).width(1200).height(630).fit("crop").url()
        : undefined,
    }),
  };
}
