"use client";

import { useEffect, useState } from "react";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import type { LeaderboardEntry } from "@/lib/sales/leaderboard-types";
import LeaderRow from "./LeaderRow";
import type { Spotlight } from "./HawaiiClub";

/**
 * Everyone ranked 11+, with the "find yourself" search.
 *
 * The only client-side state on the page. The top ten is server-rendered — all
 * ten are on screen, so there is nothing to search for up there.
 */
export default function RiseList({
  entries,
  spotlights = {},
}: {
  entries: LeaderboardEntry[];
  /** Keyed by entry id — resolved server-side so this stays a dumb list. */
  spotlights?: Record<string, Spotlight | undefined>;
}) {
  const [query, setQuery] = useState("");

  // ?me=Name pre-fills the search so a shared link lands on the right row.
  // Read after mount rather than via useSearchParams — the latter would make
  // the whole page dynamic and defeat its ISR.
  useEffect(() => {
    const me = new URLSearchParams(window.location.search).get("me");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL→state sync; useSearchParams would de-static the page
    if (me) setQuery(me.slice(0, 60));
  }, []);

  const q = query.trim().toLowerCase();
  const matches = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;

  return (
    <>
      <SectionReveal amount={0.1} className="mx-auto mt-10 max-w-[560px]">
        <Reveal delay={0.1}>
          <label className="relative block">
            <span className="sr-only">Search creators outside the top 10</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your name…"
              className="w-full rounded-full border border-edge-mid bg-panel px-6 py-3.5 text-center font-body text-[15px] text-fog outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_30px_-8px_rgba(255,45,120,0.5)]"
            />
          </label>
        </Reveal>
      </SectionReveal>

      <SectionReveal amount={0.06} className="mt-8 flex flex-col gap-4">
        {matches.length ? (
          matches.map((e, i) => (
            <Reveal key={e.id} delay={0.1 + Math.min(i * 0.06, 0.55)}>
              <LeaderRow entry={e} highlight={Boolean(q)} spotlight={spotlights[e.id]} />
            </Reveal>
          ))
        ) : (
          <Reveal delay={0.1}>
            <div className="rounded-[20px] border border-dashed border-edge-mid bg-panel/60 px-6 py-12 text-center">
              <p className="m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
                {"// NO MATCH FOR "}
                <span className="text-magenta">{query.toUpperCase()}</span>
              </p>
              <p className="mx-auto mb-0 mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">
                Only creators with a closed referral appear on the board. If
                yours is still in progress, it lands here the moment it closes.
              </p>
            </div>
          </Reveal>
        )}
      </SectionReveal>
    </>
  );
}
