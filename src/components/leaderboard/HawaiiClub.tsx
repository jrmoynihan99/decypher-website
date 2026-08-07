"use client";

import Image from "next/image";
import { useSpotlight } from "@/hooks/useSpotlight";
import {
  HAWAII_THRESHOLD,
  type LeaderboardEntry,
} from "@/lib/sales/leaderboard-types";

/**
 * The Hawaii Club — creators who have cleared the threshold.
 *
 * Given its own section, and a bigger card than the standings rows, because
 * the whole page is a race toward this and a qualifier reading as row eleven
 * of a list would undersell the thing being competed for. Portrait cards in a
 * grid rather than a list: at the counts involved (a handful, ever) a list
 * reads as a stub, and the format leaves room for a face and a post.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export interface Spotlight {
  postUrl?: string;
  caption?: string;
}

/**
 * No post preview here on purpose. A qualifier also keeps their place in the
 * standings below, where the row already carries the tile — putting a second,
 * larger copy on this card doubled the poster and made the card tower over
 * everything around it.
 */
export function HawaiiCard({ entry }: { entry: LeaderboardEntry }) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLDivElement>();

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="group relative overflow-hidden rounded-[20px] border border-violet/40 bg-panel p-6 text-center transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-violet hover:shadow-[0_26px_60px_-26px_rgba(139,43,232,0.55)]"
    >
      {/* violet spotlight — this section's own accent, so a Hawaii card never
          reads as just another magenta standings row */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(340px circle at var(--mx, 50%) var(--my, 0%), rgba(139,43,232,.18), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
        style={{ background: "linear-gradient(90deg, transparent, #B06CFF, transparent)" }}
      />

      <div className="relative">
        <div className="mx-auto h-[86px] w-[86px] rounded-full bg-grad p-[2.5px]">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-night font-display text-[22px] font-bold text-mist">
            {entry.photo ? (
              <Image
                src={entry.photo}
                alt=""
                width={86}
                height={86}
                className="h-full w-full object-cover"
                sizes="86px"
              />
            ) : (
              initials(entry.name)
            )}
          </div>
        </div>

        <h3 className="m-0 mt-4 font-display text-[19px] font-semibold tracking-[-0.015em] text-fog">
          {entry.name}
        </h3>

        <span className="mt-2.5 inline-block rounded-full border border-violet/45 bg-violet/12 px-3 py-1 font-mono text-[10.5px] tracking-[0.1em] text-[#B06CFF]">
          🌺 HAWAII UNLOCKED
        </span>

        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[13px] border border-edge bg-edge">
          <div className="bg-panel px-3 py-3">
            <span className="block font-display text-[22px] font-bold leading-none tabular-nums text-magenta">
              {entry.closed}
            </span>
            <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
              Referrals
            </span>
          </div>
          <div className="bg-panel px-3 py-3">
            <span className="block font-display text-[22px] font-bold leading-none tabular-nums text-teal">
              {money(entry.earned)}
            </span>
            <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
              Earned
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}

/** Shown while the club is empty — which it is until someone hits the number. */
export function HawaiiEmpty({
  body,
  closest,
}: {
  body?: string;
  closest: LeaderboardEntry | null;
}) {
  const away = closest ? HAWAII_THRESHOLD - closest.closed : HAWAII_THRESHOLD;
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-dashed border-violet/35 bg-panel/60 px-6 py-12 text-center">
      <p className="m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
        {"// NOBODY HAS UNLOCKED HAWAII YET"}
      </p>
      <p className="mx-auto mb-0 mt-4 max-w-[48ch] text-[15px] leading-relaxed text-muted">
        {body ??
          `The first creator to close ${HAWAII_THRESHOLD} referrals gets the trip. The seat is still open.`}
      </p>
      {closest ? (
        <p className="m-0 mt-5 font-mono text-[11.5px] tracking-[0.14em] text-mist">
          Closest right now:{" "}
          <span className="text-magenta">{closest.name}</span>
          {` — ${away} ${away === 1 ? "referral" : "referrals"} away`}
        </p>
      ) : null}
    </div>
  );
}
