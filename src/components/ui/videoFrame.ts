/**
 * The framed-media chrome both video players wear, so a click-to-play card and
 * an autoplaying one are the same object to the eye.
 *
 * "hero" = the big top-of-page player (home page, thank-you takeover): wider
 * radius, deeper shadow. "card" = the testimonial grid.
 */
export function videoFrameClass(variant: "card" | "hero"): string {
  return `group relative aspect-video overflow-hidden border border-edge-mid bg-[linear-gradient(160deg,#16141D,#0D0B13)] transition-[border-color,box-shadow] duration-300 hover:border-magenta/40 ${
    variant === "hero"
      ? "rounded-[20px] shadow-[0_28px_80px_rgba(0,0,0,.55)] hover:shadow-[0_34px_90px_-20px_rgba(255,45,120,.42)] md:rounded-[24px]"
      : "rounded-[18px] shadow-[0_18px_50px_rgba(0,0,0,.45)] hover:shadow-[0_22px_60px_-18px_rgba(255,45,120,.4)]"
  }`;
}
