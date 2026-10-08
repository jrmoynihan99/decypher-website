"use client";

import DecryptOnView from "@/components/ui/DecryptOnView";

/**
 * A survey headline: the site's DecryptOnView, so it decrypts in like every
 * heading on the site and then scrambles letter by letter under the cursor.
 * Only the sizes are the survey's.
 *
 * The parent keys each screen, so this mounts fresh per question and
 * decrypts once; tapping an answer re-renders without re-decrypting.
 *
 * `ink` is for the magenta review-ask slide. The hover scramble paints its
 * letter brand magenta, which is the slide's own background — so there the
 * letters keep the headline's ink and glow white instead (`.fb-ink`, in
 * SURVEY_CSS; it needs !important to beat the hover's inline style).
 */
export default function Headline({
  text,
  variant,
  ink = false,
  className = "",
}: {
  text: string;
  /** hero: intro and end screens · ask: the review ask · q: a question. */
  variant: "hero" | "ask" | "q";
  ink?: boolean;
  className?: string;
}) {
  const size =
    variant === "q"
      ? "mb-7 max-w-[30ch] text-[clamp(1.42rem,5.2vw,1.95rem)] font-semibold leading-[1.2] tracking-[-0.02em]"
      : variant === "ask"
        ? "mb-4 max-w-[20ch] text-[clamp(2rem,6.4vw,2.9rem)] font-bold leading-[1.05] tracking-[-0.03em]"
        : "mb-4 max-w-[13ch] text-[clamp(2.3rem,9.5vw,3.5rem)] font-bold leading-[1.03] tracking-[-0.035em]";

  return (
    <DecryptOnView
      as="h1"
      text={text}
      // A low bar: a long question on a short phone screen may never be half
      // on screen, and it must still decrypt.
      threshold={0.1}
      className={`relative m-0 font-display ${size} ${ink ? "fb-ink" : ""} ${className}`}
    />
  );
}
