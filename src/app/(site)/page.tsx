import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata, renderPage } from "@/components/templates/RenderPage";
import { getPageBySlug } from "@/sanity/queries";

// Sanity edits land instantly via the webhook; this window is for the LIVE
// QuickBooks figures (the revenue graph + {{creatorRevenue}} stat), which move
// on the hourly sync. The sync cron also revalidates this path explicitly, so
// the hour here is the fallback, not the mechanism.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/");
}

export default async function Home() {
  const page = await getPageBySlug("/");
  if (!page) notFound();
  return renderPage(page);
}
