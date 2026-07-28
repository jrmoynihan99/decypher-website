"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useRef, useState } from "react";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { videoFrameClass } from "@/components/ui/videoFrame";
import { noop } from "@/lib/noop";
import { youTubeEmbedSrc, youTubeId } from "@/lib/youtube";

/**
 * The hero player: one iframe that starts playing muted on load (the only way
 * a browser allows autoplay), with a magnetic unmute affordance that trails
 * the cursor. Clicking anywhere unmutes that same player in place — no iframe
 * swap, no restart — and hands the frame over to YouTube's native controls.
 *
 * Use this for the single big video on a page. A grid of these would put a
 * live decoder behind every card, so testimonial walls stay on
 * [[ClickToPlayVideo]], which paints a thumbnail until tapped.
 *
 * Flicker note (inherited from the same pattern on aletheia): while muted, the
 * unmute scrim covers the video and keeps it on the normal compositing path.
 * The moment the scrim goes away, Chrome is free to promote the now-uncovered
 * video to a hardware OVERLAY plane — and that plane flipping on and off
 * against the fixed nav flashes the whole page. The permanent `blend guard`
 * below keeps a hair of paint over the video at all times so it never gets
 * promoted. It's pointer-events-none, so the native controls stay clickable.
 */

const MAGNET = { stiffness: 150, damping: 15, mass: 0.1 };

export default function AutoplayVideo({
  url,
  title,
  variant = "hero",
}: {
  url: string;
  /** Iframe title; the overlay reads "Unmute: <title>". */
  title: string;
  variant?: "card" | "hero";
}) {
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const [muted, setMuted] = useState(true);
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Nothing starts by itself for a visitor who asked for less motion.
  const autoplay = !reduced;
  const magnetic = !coarse && !reduced;
  const hero = variant === "hero";

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, MAGNET);
  const springY = useSpring(y, MAGNET);

  const onMove = (e: React.MouseEvent) => {
    if (!magnetic || !frameRef.current) return;
    const r = frameRef.current.getBoundingClientRect();
    x.set(e.clientX - r.left - r.width / 2);
    y.set(e.clientY - r.top - r.height / 2);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  const id = youTubeId(url);

  /** The click is the user gesture, so the browser lets us raise the volume. */
  const unmute = () => {
    const win = iframeRef.current?.contentWindow;
    const send = (func: string, args: unknown[] = []) =>
      win?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    send("unMute");
    send("setVolume", [100]);
    // iOS occasionally refuses autoplay even muted-and-inline, which leaves a
    // parked player under the overlay — the same tap should start it.
    send("playVideo");
    setMuted(false);
  };

  if (!id) return null;

  return (
    <div
      ref={frameRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={videoFrameClass(variant)}
    >
      <iframe
        ref={iframeRef}
        src={youTubeEmbedSrc(id, { autoplay, muted: autoplay, jsapi: true })}
        title={title}
        allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />

      {/* blend guard — see the flicker note above. Imperceptible, click-through. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[rgba(0,0,0,.02)]"
      />

      {autoplay && muted && (
        <button
          type="button"
          onClick={unmute}
          aria-label={`Unmute: ${title}`}
          className="group/unmute absolute inset-0 cursor-pointer border-0 bg-transparent p-0"
        >
          <span className="absolute inset-0 bg-night/25 transition-colors duration-300 group-hover/unmute:bg-night/35" />
          <motion.span
            style={magnetic ? { x: springX, y: springY } : undefined}
            onUpdate={noop}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span
              className={`bg-grad flex items-center justify-center rounded-full text-white shadow-[0_10px_30px_rgba(0,0,0,.45)] ring-1 ring-white/15 transition-transform duration-300 group-hover/unmute:scale-110 ${
                hero
                  ? "h-[64px] w-[64px] md:h-[72px] md:w-[72px]"
                  : "h-[56px] w-[56px]"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className={hero ? "h-7 w-7" : "h-6 w-6"}
              >
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <path d="m23 9-6 6" />
                <path d="m17 9 6 6" />
              </svg>
            </span>
          </motion.span>
          <span className="pointer-events-none absolute inset-x-0 bottom-3.5 text-center font-mono text-[10.5px] tracking-[0.22em] text-mist md:bottom-4 md:text-[11px]">
            {"// TAP TO UNMUTE"}
          </span>
        </button>
      )}
    </div>
  );
}
