import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata, renderPage } from "@/components/templates/RenderPage";
import { getAllPageSlugs, getPageBySlug } from "@/sanity/queries";

// Safety net only — content updates land instantly via the Sanity webhook.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string[] }> };

export async function generateStaticParams() {
  const slugs = await getAllPageSlugs();
  return slugs
    .map((s) => s.replace(/^\/+/, ""))
    .filter(Boolean)
    .map((s) => ({ slug: s.split("/") }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata(slug.join("/"));
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug(slug.join("/"));
  if (!page) notFound();
  return renderPage(page);
}
