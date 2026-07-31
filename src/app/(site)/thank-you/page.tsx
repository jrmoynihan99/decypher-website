import type { Metadata } from "next";
import {
  renderThankYou,
  thankYouMetadata,
} from "@/components/templates/RenderThankYou";
import { getThankYouPageBySlug, getThankYouRouting } from "@/sanity/queries";

/**
 * The bare /thank-you route: whatever page is set in Book a Call → Thank You,
 * served at a stable URL.
 *
 * It exists so the booking form always has somewhere to go. Without it, a
 * dataset with no default set — or with the default deleted — would leave the
 * form holding a booking and no destination, which is the one moment in the
 * funnel where a dead end costs a paying client. With nothing configured at
 * all this still renders: the hero falls back to its built-in copy.
 */

export const revalidate = 86400;

async function defaultPage() {
  const { defaultSlug } = await getThankYouRouting();
  return defaultSlug ? getThankYouPageBySlug(defaultSlug) : null;
}

export async function generateMetadata(): Promise<Metadata> {
  return thankYouMetadata(await defaultPage());
}

export default async function ThankYouFallbackPage() {
  return renderThankYou(await defaultPage());
}
