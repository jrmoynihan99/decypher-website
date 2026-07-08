import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
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
  return {
    title:
      settings?.defaultSeo?.title ??
      "DeCypher Financials — Accounting for Creators",
    description: settings?.defaultSeo?.description,
    icons: {
      icon: { url: "/favicon.webp", type: "image/webp" },
    },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
      </body>
    </html>
  );
}
