import Link from "next/link";
import { requirePermission } from "@/lib/firebase/session";
import { getRecap, listRecaps } from "@/lib/tax-recap/store";
import { loadTables } from "@/lib/tax-recap/tables-store";
import { Eyebrow } from "@/components/estimator/fields";
import TaxRecapBuilder from "@/components/portal/tax-recap/TaxRecapBuilder";
import RecapList from "@/components/portal/tax-recap/RecapList";

export const metadata = { title: "Tax Recap — DeCypher Portal" };

export default async function TaxRecapPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  // "receipts" is the Tax Recap tab's key — see lib/permissions for why.
  await requirePermission("receipts");
  const { edit } = await searchParams;
  const [recaps, editing, tables] = await Promise.all([
    listRecaps(),
    edit && !edit.includes("/") ? getRecap(edit) : Promise.resolve(null),
    loadTables(),
  ]);

  return (
    <>
      <Eyebrow>Tool</Eyebrow>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-fog">Tax Recap</h1>
        <span className="rounded-full border border-teal/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-teal">
          Live
        </span>
        <Link
          href="/portal/tax-recap/tables"
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-display text-[13px] font-semibold text-fog no-underline transition-colors hover:border-mist"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M3 5h18v14H3zM3 10h18M3 15h18M9 5v14" />
          </svg>
          Tax tables
        </Link>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted">
        Upload the client&rsquo;s final return from ProSeries. The before column is computed
        from it using the year&rsquo;s tax tables, you check the numbers, and the client gets
        their recap page.
      </p>

      <div className="mt-9">
        {/* Keyed so switching between "new" and "edit" remounts with fresh state. */}
        <TaxRecapBuilder key={editing?.id ?? "new"} initial={editing} tables={tables} />
      </div>

      <div className="mt-8">
        <RecapList recaps={recaps} />
      </div>
    </>
  );
}
