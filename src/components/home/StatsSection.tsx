import ProofStats from "@/components/home/ProofStats";
import StatsGrid from "@/components/home/StatsGrid";
import SectionHeading from "@/components/ui/SectionHeading";
import type { LiveStat, RevenueTimeline } from "@/lib/quickbooks/public-stats";
import type { TaxSavingsSummary } from "@/lib/tax-recap/public-stats";

/**
 * The standalone proof section: heading over the stat cards, laid out in one
 * auto-fitting row. The cards and their reveal live in StatsGrid, which the
 * schedule hero also reuses in a 2x2.
 *
 * On the home page the section has a stage under the cards: `revenue` is the
 * live QuickBooks series (the cumulative revenue graph) and `taxSavings` the
 * tax recap aggregate (the savings strip). When either is present, ProofStats
 * takes over the layout — the live cards become the tabs over the stage, the
 * other figures sit above them as plain numerals, and the whole section pins
 * while the strip scrolls through. Null means the figures couldn't be read,
 * and the section simply doesn't show that stage: same drop-don't-guess
 * posture as the live stat tokens.
 */
export default function StatsSection({
  eyebrow = "[ 01 // proof of work ]",
  title = "Receipts, decrypted.",
  stats,
  revenue = null,
  taxSavings = null,
}: {
  eyebrow?: string;
  title?: string;
  stats: LiveStat[];
  revenue?: RevenueTimeline | null;
  taxSavings?: TaxSavingsSummary | null;
}) {
  const heading = <SectionHeading eyebrow={eyebrow} title={title} />;

  return (
    <section
      id="proof"
      className="relative z-[1] px-4 pb-16 pt-16 md:px-6 md:pb-[110px] md:pt-[100px]"
    >
      {revenue || taxSavings ? (
        <ProofStats heading={heading} stats={stats} revenue={revenue} taxSavings={taxSavings} />
      ) : (
        <>
          {heading}
          <StatsGrid
            stats={stats}
            className="mx-auto mt-8 grid max-w-[1160px] grid-cols-2 gap-3 md:mt-[52px] md:grid-cols-[repeat(auto-fit,minmax(230px,1fr))] md:gap-[18px]"
          />
        </>
      )}
    </section>
  );
}
