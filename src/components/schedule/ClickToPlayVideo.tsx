"use client";

import { useState } from "react";
import { videoFrameClass } from "@/components/ui/videoFrame";
import { youTubeEmbedSrc, youTubeId, youTubeThumb } from "@/lib/youtube";

/**
 * Click-to-load YouTube embed — the creator wall on the thank-you takeover and
 * the careers VSL. A grid of live iframes drags any phone under, so the frame
 * shows the video's own thumbnail behind a play button and only mounts the
 * iframe (playing, with sound) once tapped. The single big video at the top of
 * a page can afford to run on its own: that one is [[AutoplayVideo]].
 */

/** Embed src that starts playing immediately (the visitor already pressed play). */
function playSrc(url: string): string {
  const id = youTubeId(url);
  if (id) return youTubeEmbedSrc(id, { autoplay: true });
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
    <div className={videoFrameClass(variant)}>
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
              src={youTubeThumb(id, hero ? "maxres" : "hq")}
              alt=""
              loading="lazy"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth < 320 && !img.src.includes("hqdefault"))
                  img.src = youTubeThumb(id, "hq");
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
