"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import RevenueGraph from "@/components/home/RevenueGraph";
import StatsGrid from "@/components/home/StatsGrid";
import TaxSavingsStrip from "@/components/home/TaxSavingsStrip";
import type { LiveStat, RevenueTimeline } from "@/lib/quickbooks/public-stats";
import type { TaxSavingsSummary } from "@/lib/tax-recap/public-stats";

type View = "rev" | "tax";

/**
 * The proof section with a stage: the live stat cards are tabs, and the stage
 * under them is whichever one is selected — the cumulative revenue graph
 * (creator revenue) or the tax savings strip (tax savings found).
 *
 * The figures that aren't tabs (creators helped, and anything else an editor
 * adds) sit ABOVE the two cards as plain numerals, so nothing that isn't
 * clickable looks clickable. If no card resolved to a live token yet (the
 * activation script hasn't run), the old layout stands: every stat a card,
 * the graph beneath.
 *
 * `heading` is the server-rendered SectionHeading, passed in so it can sit
 * inside the pin: with the strip up, the strip pins the whole of this block —
 * heading, figures, cards and stage — and scrolls its panels through
 * sideways. The pin container and the sticky block are owned here and handed
 * to the strip, which sizes them.
 */
export default function ProofStats({
  heading,
  stats,
  revenue,
  taxSavings,
}: {
  heading: ReactNode;
  stats: LiveStat[];
  revenue: RevenueTimeline | null;
  taxSavings: TaxSavingsSummary | null;
}) {
  const pinRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  // which stats are tabs: the live cards whose stage exists
  const { tabs, cards, bare } = useMemo(() => {
    const tabOf = (s: LiveStat): View | null =>
      s.live === "creatorRevenue" && revenue ? "rev"
      : s.live === "taxSavings" && taxSavings ? "tax"
      : null;
    const cards = stats.filter((s) => tabOf(s));
    const bare = stats.filter((s) => !tabOf(s));
    return { tabs: cards.map((s) => tabOf(s)!), cards, bare };
  }, [stats, revenue, taxSavings]);

  const [view, setView] = useState<View>(() => (tabs.includes("rev") || !tabs.includes("tax") ? "rev" : "tax"));

  const select = (i: number) => {
    const next = tabs[i];
    if (!next || next === view) return;
    setView(next);
    // Either way the section's height changes under the reader: the strip
    // pins it and gives it a scroll range, and leaving the strip takes that
    // range away again. So the section's top goes to the pin line — eased on
    // the way into the strip, at once on the way out, where the page would
    // otherwise land somewhere below the section.
    requestAnimationFrame(() => {
      const pin = pinRef.current;
      if (!pin) return;
      const smooth = next === "tax" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: pin.getBoundingClientRect().top + window.scrollY - 8, behavior: smooth ? "smooth" : "auto" });
    });
  };

  // nothing resolved to a live token: today's layout
  if (!cards.length) {
    return (
      <>
        {heading}
        <StatsGrid
          stats={stats}
          className="mx-auto mt-8 grid max-w-[1160px] grid-cols-2 gap-3 md:mt-[52px] md:grid-cols-[repeat(auto-fit,minmax(230px,1fr))] md:gap-[18px]"
        />
        {revenue && <RevenueGraph timeline={revenue} className="mx-auto mt-10 max-w-[1160px] md:mt-16" />}
      </>
    );
  }

  return (
    <div ref={pinRef} className="relative">
      <div ref={stickyRef} className="relative">
        {heading}
        {bare.length > 0 && (
          <StatsGrid
            stats={bare}
            variant="bare"
            size="lg"
            className="mx-auto mt-8 flex max-w-[1160px] flex-wrap justify-center md:mt-12 [&>*+*]:border-l [&>*+*]:border-white/10"
          />
        )}
        <StatsGrid
          stats={cards}
          tabs={{ indexes: cards.map((_, i) => i), active: tabs.indexOf(view), onSelect: select }}
          className={`mx-auto grid max-w-[760px] grid-cols-2 gap-3 md:gap-[18px] ${bare.length ? "mt-7 md:mt-9" : "mt-8 md:mt-[52px]"}`}
        />
        <div className="mt-10 md:mt-14">
          {view === "rev" && revenue && (
            <RevenueGraph timeline={revenue} className="mx-auto max-w-[1160px]" />
          )}
          {view === "tax" && taxSavings && (
            <TaxSavingsStrip summary={taxSavings} pinRef={pinRef} stickyRef={stickyRef} />
          )}
        </div>
      </div>
    </div>
  );
}
