"use client";

import { useState } from "react";

/**
 * Click-to-load YouTube embed shared by the thank-you takeover videos (the
 * pre-call hero video + the creator wall). Live iframes drag any phone under,
 * so the frame shows the video's own thumbnail behind a play button and only
 * mounts the iframe (autoplaying) once tapped.
 */

/** Video id from any YouTube URL shape (watch, share, shorts, embed). */
export function youTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:.*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

/** Embed src that starts playing immediately (the visitor already pressed play). */
function playSrc(url: string): string {
  const id = youTubeId(url);
  if (id)
    return `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
  return `${url}${url.includes("?") ? "&" : "?"}autoplay=1`;
}

export default function ClickToPlayVideo({
  url,
  title,
  variant = "card",
}: {
  url: string;
  /** Iframe title; the play button reads "Play: <title>". */
  title: string;
  /** "hero" = the big top-of-page video: sharper thumbnail, larger radius + button. */
  variant?: "card" | "hero";
}) {
  const [playing, setPlaying] = useState(false);
  const id = youTubeId(url);
  const hero = variant === "hero";
  return (
    <div
      className={`group relative aspect-video overflow-hidden border border-edge-mid bg-[linear-gradient(160deg,#16141D,#0D0B13)] transition-[border-color,box-shadow] duration-300 hover:border-magenta/40 ${
        hero
          ? "rounded-[20px] shadow-[0_28px_80px_rgba(0,0,0,.55)] hover:shadow-[0_34px_90px_-20px_rgba(255,45,120,.42)] md:rounded-[24px]"
          : "rounded-[18px] shadow-[0_18px_50px_rgba(0,0,0,.45)] hover:shadow-[0_22px_60px_-18px_rgba(255,45,120,.4)]"
      }`}
    >
      {playing ? (
        <iframe
          src={playSrc(url)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play: ${title}`}
          className="absolute inset-0 block h-full w-full cursor-pointer border-0 bg-transparent p-0"
        >
          {id && (
            // hqdefault always exists; object-cover crops its 4:3 letterbox.
            // The hero starts on maxres for sharpness at 960px — videos with
            // no HD still get YouTube's gray 120px stand-in, so downgrade on
            // load when the decoded image is suspiciously small.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://i.ytimg.com/vi/${id}/${hero ? "maxresdefault" : "hqdefault"}.jpg`}
              alt=""
              loading="lazy"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth < 320 && !img.src.includes("hqdefault"))
                  img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
              }}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          )}
          {/* keeps the play button readable over bright thumbnails */}
          <span
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,14,.05),rgba(10,10,14,.45))]"
          />
          <span
            aria-hidden
            className={`bg-grad absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full pl-1 text-white shadow-[0_10px_30px_rgba(0,0,0,.45)] transition-transform duration-300 group-hover:scale-110 ${
              hero
                ? "h-[64px] w-[64px] text-[21px] md:h-[72px] md:w-[72px] md:text-[24px]"
                : "h-[56px] w-[56px] text-[18px]"
            }`}
          >
            ▶
          </span>
        </button>
      )}
    </div>
  );
}
