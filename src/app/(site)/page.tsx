import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata, renderPage } from "@/components/templates/RenderPage";
import { getPageBySlug } from "@/sanity/queries";

// Safety net only — content updates land instantly via the Sanity webhook.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/");
}

export default async function Home() {
  const page = await getPageBySlug("/");
  if (!page) notFound();
  return renderPage(page);
}
