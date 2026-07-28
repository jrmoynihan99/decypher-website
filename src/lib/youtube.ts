/**
 * YouTube URL parsing + embed-src construction, shared by the two players
 * (ClickToPlayVideo and AutoplayVideo).
 *
 * Editors paste whatever the YouTube share sheet hands them, which is almost
 * never an embed URL — and a watch/share link in an `<iframe src>` is refused
 * outright (YouTube sends `X-Frame-Options` on those). Everything that frames
 * a video goes through here so the shape of the pasted link stops mattering.
 */

/** Video id from any YouTube URL shape (watch, share, shorts, live, embed). */
export function youTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:.*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

type EmbedOptions = {
  /** Start on load. Browsers only honour this while the player is muted. */
  autoplay?: boolean;
  /** Load muted — pair with `autoplay`, then unmute on a real user gesture. */
  muted?: boolean;
  /** Expose the postMessage player API (needed to unmute in place). */
  jsapi?: boolean;
};

/**
 * Embed src for a video id. `-nocookie` so the player doesn't drop ad-tracking
 * cookies on visitors who never touch it.
 */
export function youTubeEmbedSrc(id: string, opts: EmbedOptions = {}): string {
  const p = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  if (opts.autoplay) p.set("autoplay", "1");
  if (opts.muted) p.set("mute", "1");
  if (opts.jsapi) p.set("enablejsapi", "1");
  return `https://www.youtube-nocookie.com/embed/${id}?${p}`;
}

/** Thumbnail for a video id. `hqdefault` always exists; `maxres` may not. */
export function youTubeThumb(id: string, size: "hq" | "maxres"): string {
  return `https://i.ytimg.com/vi/${id}/${size}default.jpg`;
}
