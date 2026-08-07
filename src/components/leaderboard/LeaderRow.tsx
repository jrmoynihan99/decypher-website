"use client";

import Image from "next/image";
import { useSpotlight } from "@/hooks/useSpotlight";
import {
  HAWAII_THRESHOLD,
  type LeaderboardEntry,
} from "@/lib/sales/leaderboard-types";
import PostEmbed from "./PostEmbed";
import type { Spotlight } from "./HawaiiClub";

/**
 * One creator on the board — a dossier row, same chrome as JobCard and the
 * team/creator cards: lift, magenta glow shadow, cursor-tracking spotlight,
 * and an accent hairline that wipes in on hover.
 *
 * Deliberately NOT animating the numbers per row. The site's card idiom keeps
 * numerals still and lets the reveal stagger carry the motion; the roll-up
 * moment belongs to the StatsGrid at the top of the page, where it reads as an
 * event instead of forty-nine competing ones.
 */

const cardCls =
  "group relative block overflow-hidden rounded-[20px] border border-edge bg-panel p-5 transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-magenta/45 hover:shadow-[0_26px_60px_-26px_rgba(255,45,120,0.5)] sm:p-6";

/** Podium trio, matching the accent cycle used on job and testimonial chips. */
const PODIUM = ["#FF2D78", "#B06CFF", "#FF7A4D"];

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="relative h-[52px] w-[52px] shrink-0 rounded-full bg-grad p-[2px] sm:h-[58px] sm:w-[58px]">
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-night font-display text-[15px] font-bold text-mist">
        {entry.photo ? (
          <Image
            src={entry.photo}
            alt=""
            width={58}
            height={58}
            className="h-full w-full object-cover"
            sizes="58px"
          />
        ) : (
          initials(entry.name)
        )}
      </div>
    </div>
  );
}

export default function LeaderRow({
  entry,
  highlight = false,
  spotlight,
}: {
  entry: LeaderboardEntry;
  highlight?: boolean;
  /** A social post attached to this creator in Sanity, if any. */
  spotlight?: Spotlight;
}) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLDivElement>();
  const podium = entry.place <= 3;
  const accent = PODIUM[Math.min(entry.place - 1, PODIUM.length - 1)];
  const earned = entry.closed >= HAWAII_THRESHOLD;
  const pct = Math.min(100, Math.round((entry.closed / HAWAII_THRESHOLD) * 100));

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`${cardCls} ${
        highlight ? "border-magenta/60 shadow-[0_0_0_1px_rgba(255,45,120,0.35)]" : ""
      }`}
    >
      {/* accent hairline, revealed on hover — podium rows get their own colour */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent, ${
            podium ? accent : "#FF2D78"
          }, transparent)`,
        }}
      />
      {/* cursor spotlight — position eased in JS, opacity eased in CSS */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(420px circle at var(--mx, 50%) var(--my, 0%), rgba(255,45,120,.15), transparent 70%)",
        }}
      />

      <div className="relative flex items-center gap-3.5 sm:gap-5">
        {/* rank — the podium wears the gradient, everyone else the file-index mono */}
        <div className="w-[38px] shrink-0 text-center sm:w-[46px]">
          {podium ? (
            <span className="text-grad font-display text-[26px] font-bold leading-none tracking-[-0.02em] sm:text-[32px]">
              {entry.place}
            </span>
          ) : (
            <span className="font-mono text-[12px] tracking-[0.14em] text-faint">
              [{String(entry.place).padStart(2, "0")}]
            </span>
          )}
        </div>

        <Avatar entry={entry} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="m-0 truncate font-display text-[clamp(16px,2vw,20px)] font-semibold tracking-[-0.015em] text-fog">
              {entry.name}
            </h3>
            {highlight && (
              <span className="rounded-full border border-magenta/40 bg-magenta/10 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.1em] text-magenta">
                YOU
              </span>
            )}
            {/* Phones get the chip here beside the name; wider screens get the
                poster tile in its own slot before the figures. */}
            {spotlight?.postUrl ? (
              <span className="sm:hidden">
                <PostEmbed
                  url={spotlight.postUrl}
                  name={entry.name}
                  caption={spotlight.caption}
                  variant="chip"
                />
              </span>
            ) : null}
          </div>

          {earned ? (
            <span className="mt-2 inline-block rounded-full border border-violet/45 bg-violet/12 px-3 py-1 font-mono text-[10.5px] tracking-[0.1em] text-[#B06CFF]">
              🌺 HAWAII EARNED
            </span>
          ) : (
            <div className="mt-2.5 max-w-[300px]">
              <div className="h-[5px] overflow-hidden rounded-full bg-edge-mid">
                <div
                  className="h-full rounded-full bg-grad"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {/* Two phrasings, one meaning. The full sentence wraps to a
                  second line at phone widths — and forcing nowrap ran it
                  under the earnings column — so phones get the ratio. */}
              <p className="m-0 mt-1.5 whitespace-nowrap font-mono text-[10px] tracking-[0.14em] text-dusk">
                <span className="sm:hidden">
                  {entry.closed}/{HAWAII_THRESHOLD}
                </span>
                <span className="hidden sm:inline">
                  {HAWAII_THRESHOLD - entry.closed} MORE TO HAWAII
                </span>
              </p>
            </div>
          )}
        </div>

        {spotlight?.postUrl ? (
          <PostEmbed
            url={spotlight.postUrl}
            name={entry.name}
            caption={spotlight.caption}
          />
        ) : null}

        {/* Stacks on phones and sits side-by-side from sm. Earnings used to be
            hidden below sm, which dropped the number the whole page is about
            on the device most of these creators will open it on. */}
        <div className="flex shrink-0 flex-col items-end gap-2 text-right sm:flex-row sm:items-start sm:gap-7">
          <div>
            <span className="block font-display text-[19px] font-bold leading-none tabular-nums text-magenta sm:text-[24px]">
              {entry.closed}
            </span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted sm:mt-1.5 sm:text-[10px]">
              Referrals
            </span>
          </div>
          <div>
            <span className="block whitespace-nowrap font-display text-[19px] font-bold leading-none tabular-nums text-teal sm:text-[24px]">
              {money(entry.earned)}
            </span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted sm:mt-1.5 sm:text-[10px]">
              Earned
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
