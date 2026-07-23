import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JobDetail from "@/components/careers/JobDetail";
import { getAllJobSlugs, getJobBySlug, getSiteSettings } from "@/sanity/queries";

// Safety net only — content updates land instantly via the Sanity webhook.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await getAllJobSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [job, settings] = await Promise.all([
    getJobBySlug(slug),
    getSiteSettings(),
  ]);
  if (!job) return {};
  return {
    title: `${job.title} — Careers at DeCypher`,
    description: job.blurb ?? settings?.defaultSeo?.description,
  };
}

export default async function JobPage({ params }: Props) {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  if (!job) notFound();
  return <JobDetail job={job} />;
}
