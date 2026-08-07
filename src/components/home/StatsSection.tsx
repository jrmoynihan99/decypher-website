import RevenueGraph from "@/components/home/RevenueGraph";
import StatsGrid from "@/components/home/StatsGrid";
import SectionHeading from "@/components/ui/SectionHeading";
import { hasLiveToken, type RevenueTimeline } from "@/lib/quickbooks/public-stats";
import type { StatContent } from "@/sanity/types";

/**
 * The standalone proof section: heading over the stat cards, laid out in one
 * auto-fitting row. The cards and their reveal live in StatsGrid, which the
 * schedule hero also reuses in a 2x2.
 *
 * `revenue` is the live QuickBooks series — when present, the cumulative
 * revenue graph draws itself in under the cards. Null means the figures
 * couldn't be read, and the section simply doesn't show a graph: same
 * drop-don't-guess posture as the {{creatorRevenue}} stat token.
 */
export default function StatsSection({
  eyebrow = "[ 01 // proof of work ]",
  title = "Receipts, decrypted.",
  stats,
  revenue,
}: {
  eyebrow?: string;
  title?: string;
  stats: StatContent[];
  revenue?: RevenueTimeline | null;
}) {
  // The graph draws the revenue figure, so its card reads as the selected tab
  // (the other stats get graphs of their own eventually). Found by data, not
  // position: the card that carries the live token — or, until the token is
  // activated, the one labelled like "lifetime revenue".
  const highlightIndex = revenue
    ? stats.findIndex(
        (s) => hasLiveToken(s.value ?? "") || /lifetime revenue/i.test(s.label ?? ""),
      )
    : -1;

  return (
    <section
      id="proof"
      className="relative z-[1] px-4 pb-16 pt-16 md:px-6 md:pb-[110px] md:pt-[100px]"
    >
      <SectionHeading eyebrow={eyebrow} title={title} />
      <StatsGrid
        stats={stats}
        highlightIndex={highlightIndex}
        className="mx-auto mt-8 grid max-w-[1160px] grid-cols-2 gap-3 md:mt-[52px] md:grid-cols-[repeat(auto-fit,minmax(230px,1fr))] md:gap-[18px]"
      />
      {revenue && (
        <RevenueGraph
          timeline={revenue}
          className="mx-auto mt-10 max-w-[1160px] md:mt-16"
        />
      )}
    </section>
  );
}
