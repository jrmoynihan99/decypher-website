import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo";
import AffiliateTemplate from "@/components/templates/AffiliateTemplate";
import CareersTemplate from "@/components/templates/CareersTemplate";
import CreatorsTemplate from "@/components/templates/CreatorsTemplate";
import HomeTemplate from "@/components/templates/HomeTemplate";
import ScheduleTemplate from "@/components/templates/ScheduleTemplate";
import ServicesTemplate from "@/components/templates/ServicesTemplate";
import TeamTemplate from "@/components/templates/TeamTemplate";
import {
  getCreators,
  getJobs,
  getPageBySlug,
  getServices,
  getSiteSettings,
  getTeam,
  getTestimonials,
  getThankYouRouting,
  slugToPath,
} from "@/sanity/queries";
import { creatorRevenueTimeline, withLiveStats } from "@/lib/quickbooks/public-stats";
import { urlFor } from "@/sanity/image";
import type { PageDoc } from "@/sanity/types";

/**
 * Template dispatch: a page document's `_type` picks the layout, and each
 * template fetches the collections it renders. Identical GROQ calls within
 * one render are deduped by Next's fetch memoization.
 */
export async function renderPage(page: PageDoc) {
  switch (page._type) {
    case "homePage": {
      // The stat token and the revenue graph share one snapshot read — see the
      // cache() wrapper in public-stats.ts.
      const [settings, creators, services, testimonials, revenue] =
        await Promise.all([
          getSiteSettings().then(withLiveStats),
          getCreators(),
          getServices(),
          getTestimonials(),
          creatorRevenueTimeline(),
        ]);
      return (
        <HomeTemplate
          page={page}
          settings={settings}
          creators={creators}
          services={services}
          testimonials={testimonials}
          revenue={revenue}
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
  }
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

  return {
    title,
    description,
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
