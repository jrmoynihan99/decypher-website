"use client";

import { useState } from "react";
import { accentRgba, monogram } from "@/lib/tools-hub/catalog";
import type { ToolEntry } from "@/lib/tools-hub/types";

/**
 * A tool's brand tile: the real logo when a file exists at its `logoUrl`,
 * otherwise the vendor's monogram over a tint of its accent.
 *
 * The monogram is `text-fog`, not the accent. Accents here are whatever colour
 * the vendor's brand happens to be, and several of them — Slack's #611f69, the
 * Intuit blues — are unreadable as text on a near-black panel. The tint carries
 * the identity and contrast stays fixed, which is the compromise that lets this
 * page use free brand hexes at all (see the note in lib/tools-hub/types.ts).
 *
 * The image fallback tracks the URL that failed rather than a boolean, so
 * editing a broken logo path in the admin panel re-tries the new one instead of
 * staying stuck on the monogram for the rest of the session.
 *
 * A plain <img>, not next/image: these URLs are typed into the editor by an
 * admin and can point anywhere, which is exactly what next/image's
 * remotePatterns allowlist is designed to refuse.
 */
export default function ToolLogo({
  tool,
  size = 44,
}: {
  tool: ToolEntry;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(tool.logoUrl) && tool.logoUrl !== failedUrl;

  return (
    <div
      aria-hidden
      className="relative flex flex-none items-center justify-center overflow-hidden rounded-[10px] border font-mono font-bold text-fog"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.32),
        backgroundColor: accentRgba(tool.accent, 0.16) ?? "rgba(255,255,255,0.04)",
        borderColor: accentRgba(tool.accent, 0.4) ?? "rgba(255,255,255,0.1)",
      }}
    >
      {monogram(tool.vendor)}
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tool.logoUrl}
          alt=""
          onError={() => setFailedUrl(tool.logoUrl ?? null)}
          className="absolute inset-0 h-full w-full object-contain p-[18%]"
          style={{ backgroundColor: accentRgba(tool.accent, 0.16) ?? "#141319" }}
        />
      ) : null}
    </div>
  );
}
