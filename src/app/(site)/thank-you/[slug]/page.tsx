import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  renderThankYou,
  thankYouMetadata,
} from "@/components/templates/RenderThankYou";
import { getAllThankYouSlugs, getThankYouPageBySlug } from "@/sanity/queries";

/**
 * One post-booking page per ad campaign, so each conversion has a URL of its
 * own to fire on. The booking form picks between them from the `?ty=` on the
 * landing link — see lib/thank-you.ts.
 *
 * Deliberately its own route rather than a slug under the catch-all: these are
 * nested under /thank-you/, which means a campaign named "services" can't
 * shadow a real page the way an affiliate slug could, and one rule in an ad
 * platform ("URL contains /thank-you/") covers every campaign at once.
 */

// Safety net only — publishes land instantly via the Sanity webhook.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await getAllThankYouSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return thankYouMetadata(await getThankYouPageBySlug(slug));
}

export default async function ThankYouPage({ params }: Props) {
  const { slug } = await params;
  const page = await getThankYouPageBySlug(slug);
  if (!page) notFound();
  return renderThankYou(page);
}
