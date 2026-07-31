import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import TrackingCode from "@/components/TrackingCode";
import { socialMetadata } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import { getSiteSettings } from "@/sanity/queries";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const title =
    settings?.defaultSeo?.title ??
    "DeCypher Financials — Accounting for Creators";
  const description = settings?.defaultSeo?.description;

  return {
    // Every relative URL below — and in every page's metadata — resolves
    // against this. Without it Next emits relative og:image/canonical values,
    // which crawlers can't follow.
    metadataBase: new URL(siteUrl()),
    title,
    description,
    icons: {
      icon: { url: "/favicon.webp", type: "image/webp" },
    },
    // Site-wide share-card defaults, for routes that don't build their own
    // (the portal, /studio, 404). No canonical here — see socialMetadata.
    ...socialMetadata({ title, description }),
  };
}

export const viewport: Viewport = {
  // Deliberately NO themeColor: iOS 26 Safari renders its top/bottom bars as
  // translucent "liquid glass" that page content bleeds behind — but ONLY when
  // no <meta name="theme-color"> is present. Set one and Safari paints the
  // status-bar region as a solid tint of that color instead (the near-black
  // #0A0A0E bar we used to get). The page background is already #0A0A0E via
  // globals.css, so the glass reads dark anyway. Paired with viewportFit below.
  width: "device-width",
  initialScale: 1,
  // Opt the viewport in to drawing under the safe-area insets (edge-to-edge).
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSiteSettings();

  return (
    <html
      lang="en"
      data-page-transition="wipe"
      className={`${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable}`}
    >
      <body className="relative min-h-screen">
        {/* decrypt headings ship blurred (.decrypt-pending) and rely on JS to
            scramble + reveal — without JS, lift the blur so text is readable */}
        <noscript>
          <style>{`.decrypt-pending{filter:none !important}`}</style>
        </noscript>
        {children}
        {/* Base analytics/pixel from Site Settings → Tracking. Every page, not
            just the marketing routes: an ads platform can only count a landing
            on a thank-you page as a conversion if its tag is already loaded
            everywhere. Empty until the client pastes one, and renders nothing
            when empty. */}
        <TrackingCode code={settings?.trackingCode} id="site-tracking" />
      </body>
    </html>
  );
}
