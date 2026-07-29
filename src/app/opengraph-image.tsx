import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getSiteSettings } from "@/sanity/queries";

/**
 * The default share card, generated rather than designed.
 *
 * This is a Next metadata file convention: it supplies openGraph/twitter images
 * for every route that doesn't set `openGraph.images` itself. Pages with a
 * Share image in Sanity set that explicitly and override this (see
 * pageMetadata); everything else — new job posts, legal pages, anything added
 * without an image — still gets a branded card instead of a bare link.
 *
 * Node runtime, not edge: it reads the brand mark off disk.
 */
export const alt = "DeCypher Financials — accounting built for creators";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Matches --color-night / --color-fog / --color-magenta / --color-violet.
const NIGHT = "#0a0a0e";
const FOG = "#f1eef6";
const MUTED = "#8f88a0";
const MAGENTA = "#ff2d78";
const VIOLET = "#8b2be8";

/**
 * Space Grotesk, fetched from Google Fonts so the card matches the site's
 * display face. Wrapped because a build that can't reach fonts.googleapis.com
 * should still ship a card — satori falls back to its built-in sans, which is
 * a slightly off-brand card rather than a failed deploy.
 */
async function displayFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700",
      // A modern UA gets woff2 back; satori wants a ttf, so ask as a plain client.
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image() {
  const [settings, font, mark] = await Promise.all([
    getSiteSettings().catch(() => null),
    displayFont(),
    readFile(join(process.cwd(), "public/assets/decypher-mark.png")).catch(
      () => null,
    ),
  ]);

  // The SEO title is brand-prefixed ("DeCypher Financials — Accounting for
  // Creators") because a browser tab needs that. The card already says the
  // brand in the eyebrow, so strip it and let the headline be the claim.
  const title = (settings?.defaultSeo?.title ?? "Accounting built for creators")
    .replace(/^\s*DeCypher(\s+Financials)?\s*[—–|:-]\s*/i, "")
    .trim();
  const markSrc = mark
    ? `data:image/png;base64,${Buffer.from(mark).toString("base64")}`
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NIGHT,
          padding: 72,
          position: "relative",
        }}
      >
        {/* Brand glow, bled off the top-right corner. */}
        <div
          style={{
            position: "absolute",
            top: -260,
            right: -180,
            width: 720,
            height: 720,
            borderRadius: 9999,
            background: `radial-gradient(circle, ${MAGENTA}38 0%, ${VIOLET}1f 45%, ${NIGHT}00 70%)`,
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {markSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={markSrc} width={56} height={56} alt="" />
          ) : null}
          <div
            style={{
              fontSize: 28,
              letterSpacing: 6,
              color: MUTED,
              textTransform: "uppercase",
            }}
          >
            DeCypher Financials
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              fontSize: 78,
              lineHeight: 1.05,
              color: FOG,
              letterSpacing: -2,
              maxWidth: 900,
              // satori needs an explicit family name to pick up the loaded font.
              fontFamily: font ? "Space Grotesk" : undefined,
            }}
          >
            {title}
          </div>
          <div
            style={{
              width: 220,
              height: 6,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${MAGENTA}, ${VIOLET})`,
            }}
          />
        </div>

        <div style={{ fontSize: 30, color: MUTED }}>wedecypher.co</div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: "Space Grotesk", data: font, weight: 700, style: "normal" }]
        : undefined,
    },
  );
}
