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
  themeColor: "#0A0A0E",
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
      <body className="relative min-h-screen">{children}</body>
    </html>
  );
}
