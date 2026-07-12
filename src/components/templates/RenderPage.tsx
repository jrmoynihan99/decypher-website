import type { Metadata } from "next";
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
} from "@/sanity/queries";
import type { PageDoc } from "@/sanity/types";

/**
 * Template dispatch: a page document's `_type` picks the layout, and each
 * template fetches the collections it renders. Identical GROQ calls within
 * one render are deduped by Next's fetch memoization.
 */
export async function renderPage(page: PageDoc) {
  switch (page._type) {
    case "homePage": {
      const [settings, creators, services, testimonials] = await Promise.all([
        getSiteSettings(),
        getCreators(),
        getServices(),
        getTestimonials(),
      ]);
      return (
        <HomeTemplate
          page={page}
          settings={settings}
          creators={creators}
          services={services}
          testimonials={testimonials}
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
      const [settings, services, testimonials] = await Promise.all([
        getSiteSettings(),
        getServices(),
        getTestimonials(),
      ]);
      return (
        <ScheduleTemplate
          page={page}
          settings={settings}
          serviceTitles={services.map((s) => s.title)}
          testimonials={testimonials}
        />
      );
    }
    case "careersPage": {
      const jobs = await getJobs();
      return <CareersTemplate page={page} jobs={jobs} />;
    }
  }
}

/** Page SEO with Site Settings defaults as fallback. */
export async function pageMetadata(slug: string): Promise<Metadata> {
  const [page, settings] = await Promise.all([
    getPageBySlug(slug),
    getSiteSettings(),
  ]);
  if (!page) return {};
  return {
    title: page.seo?.title ?? settings?.defaultSeo?.title,
    description: page.seo?.description ?? settings?.defaultSeo?.description,
  };
}
