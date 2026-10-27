import Link from "next/link";
import { requirePermission } from "@/lib/firebase/session";
import { loadSavingsBoard } from "@/lib/tax-recap/board";
import { Eyebrow } from "@/components/estimator/fields";
import SavingsBoard from "@/components/portal/tax-recap/SavingsBoard";

export const metadata = { title: "Savings board — DeCypher Portal" };

/**
 * The team's savings sheet, read live from the recaps on every load — see
 * lib/tax-recap/board.ts for what each figure means. Same gate as the Tax
 * Recap tool: everyone who builds recaps can see what they add up to.
 */
export default async function SavingsBoardPage() {
  await requirePermission("receipts");
  const board = await loadSavingsBoard();

  return (
    <>
      <Eyebrow>Tool</Eyebrow>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-fog">Savings board</h1>
        <span className="rounded-full border border-teal/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-teal">
          Live
        </span>
        <Link
          href="/portal/tax-recap"
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-display text-[13px] font-semibold text-fog no-underline transition-colors hover:border-mist"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Tax Recap
        </Link>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted">
        What the team&rsquo;s recaps add up to. Every figure is read from the saved recaps when
        the page loads, so a recap saved a minute ago already counts.
      </p>

      <div className="mt-9">
        <SavingsBoard board={board} />
      </div>
    </>
  );
}
