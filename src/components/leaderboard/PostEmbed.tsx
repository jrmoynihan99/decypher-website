"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A creator's social post, shown on demand.
 *
 * WHY AN IFRAME AND NOT INSTAGRAM'S SCRIPT: the documented embed path is a
 * `<blockquote>` plus `//www.instagram.com/embed.js`, which is ~100KB of
 * third-party JavaScript that mutates the DOM and has to be re-run whenever
 * content changes. Instagram also serves a plain `/embed/captioned/` HTML
 * endpoint intended for framing — verified live: 200, and its CSP sets no
 * `frame-ancestors`, so it frames fine. That gets us a real rendered post for
 * the cost of one lazy iframe and no third-party script on the page.
 *
 * Collapsed by default and rendered only once opened. Forty-nine always-live
 * Instagram iframes would be a page nobody could scroll, and most visitors are
 * here for the standings, not the posts.
 *
 * VIDEO CAVEAT: Instagram's embed shows Reels as a poster frame with a play
 * control that hands off to Instagram. There is no supported way to play the
 * video inline off-platform, so the modal always offers "Open on Instagram"
 * rather than pretending otherwise.
 */

/** Instagram post/reel short-code, or null if this isn't an embeddable IG URL. */
export function instagramCode(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    // /p/<code>/, /reel/<code>/, /tv/<code>/
    const m = /^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

/**
 * Poster frame for a post, via our own route.
 *
 * `instagram.com/p/<code>/media/` serves the image without login, but with a
 * cross-origin resource policy: pointing an <img> straight at it fails with
 * `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` (verified in-browser — the request
 * is made and then dropped, so it fails silently as a blank tile). CORP only
 * binds browser fetches, so /api/leaderboard/poster makes the same request
 * server-side and streams the JPEG back same-origin, cached hard.
 *
 * Not next/image either: the upstream is a redirect to a signed, expiring CDN
 * address, so the optimiser would cache precisely the URL that dies.
 */
function posterUrl(code: string, size: "t" | "m" | "l" = "m") {
  return `/api/leaderboard/poster?code=${encodeURIComponent(code)}&size=${size}`;
}

export default function PostEmbed({
  url,
  name,
  caption,
  variant = "thumb",
}: {
  url: string;
  name: string;
  caption?: string;
  /**
   * `thumb` — the labelled poster tile, hidden below sm. `chip` — the text
   * pill, for phones where a row has no spare width.
   *
   * A row renders BOTH: `chip` inside `sm:hidden` beside the name, and `thumb`
   * in its own slot. They are mutually exclusive by breakpoint. There is no
   * combined variant on purpose — the earlier one rendered its own mobile chip,
   * so a row that also placed one ended up with two.
   */
  variant?: "thumb" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const code = instagramCode(url);

  // Lock the page behind the modal. Lenis drives scrolling here, so overflow
  // alone isn't enough — it listens on window and would keep scrolling the
  // page under the overlay.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Not embeddable (TikTok, a profile link, anything else) — just link out.
  if (!code) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-violet/40 bg-violet/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-[#B06CFF] transition-colors duration-200 hover:border-violet hover:bg-violet/20"
      >
        {hostLabel(url).toUpperCase()} ↗
      </a>
    );
  }

  const modal = open ? (
    <PostModal
      url={url}
      code={code}
      name={name}
      caption={caption}
      onClose={() => setOpen(false)}
    />
  ) : null;

  const chip = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Watch ${name}'s post`}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-magenta/40 bg-magenta/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-magenta transition-colors duration-200 hover:border-magenta hover:bg-magenta/20"
    >
      ▶ WATCH POST
    </button>
  );

  // A dead poster (deleted post, account gone private) falls back to the chip
  // rather than leaving a broken tile sitting in the row.
  if (variant === "chip" || broken) {
    return (
      <>
        {chip}
        {modal}
      </>
    );
  }

  return (
    <>
      {/* Tile + label. The poster alone read as decoration next to a face and a
          progress bar; the caption is what tells you it's a thing you click. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Watch ${name}'s post`}
        className="group/thumb hidden shrink-0 cursor-pointer flex-col items-center gap-1 sm:flex"
      >
        <span className="relative block h-[52px] w-[52px] overflow-hidden rounded-[10px] border border-edge-mid bg-panel-2 transition-[border-color,box-shadow] duration-300 group-hover/thumb:border-magenta group-hover/thumb:shadow-[0_0_24px_-6px_rgba(255,45,120,0.6)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed,
              expiring CDN URL behind a redirect; the optimiser would cache
              exactly the URL that dies. See posterUrl. */}
          <img
            src={posterUrl(code, "m")}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover/thumb:scale-[1.06]"
          />
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center bg-night/35 transition-colors duration-300 group-hover/thumb:bg-night/10"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 pl-px text-[9px] text-night shadow-lg">
              ▶
            </span>
          </span>
        </span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-dusk transition-colors duration-300 group-hover/thumb:text-magenta">
          Watch
        </span>
      </button>

      {modal}
    </>
  );
}

/**
 * Portalled to <body>: the row this lives in sits inside a Reveal, whose
 * persistent `will-change: transform` makes it a containing block and would
 * trap a position:fixed overlay inside the card.
 */
function PostModal({
  url,
  code,
  name,
  caption,
  onClose,
}: {
  url: string;
  code: string;
  name: string;
  caption?: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portals need a DOM; one-shot mount flag
    setMounted(true);
  }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} — post`}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-night/85 p-4 sm:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative m-auto w-full max-w-[420px] overflow-hidden rounded-[20px] border border-edge-mid bg-panel"
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 truncate font-display text-[15px] font-semibold text-fog">{name}</p>
            {caption ? (
              <p className="m-0 mt-0.5 truncate font-mono text-[10.5px] tracking-[0.1em] text-dusk">
                {caption}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-none cursor-pointer rounded-full border border-edge-mid px-2.5 py-1 font-mono text-[12px] text-dusk transition-colors duration-150 hover:border-magenta hover:text-fog"
          >
            ✕
          </button>
        </header>

        {/* No allowTransparency/scrolling — both are obsolete HTML4 attributes
            React refuses to pass through, and the embed doesn't need them. */}
        <iframe
          src={`https://www.instagram.com/p/${code}/embed/captioned/`}
          title={`${name} on Instagram`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="block h-[540px] w-full border-0 bg-white"
        />

        <div className="border-t border-edge px-4 py-3 text-center">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-magenta transition-colors duration-150 hover:text-fog"
          >
            Open on Instagram ↗
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
