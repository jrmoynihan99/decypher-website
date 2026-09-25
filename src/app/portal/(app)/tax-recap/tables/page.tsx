import Link from "next/link";
import { requirePermission } from "@/lib/firebase/session";
import { listProofPairings } from "@/lib/tax-recap/store";
import { SEED_YEARS, seedFor } from "@/lib/tax-recap/tables";
import { listStoredYears } from "@/lib/tax-recap/tables-store";
import { Eyebrow } from "@/components/estimator/fields";
import TaxTablesEditor, { type YearRow } from "@/components/portal/tax-recap/TaxTablesEditor";

export const metadata = { title: "Tax Tables — DeCypher Portal" };

/**
 * The settings behind the Tax Recap's derived before: every year's federal
 * figures and every state's rules and figures, editable, plus the real
 * before/after pairings the engine is proven against.
 */
export default async function TaxTablesPage() {
  await requirePermission("receipts");
  const [stored, pairings] = await Promise.all([listStoredYears(), listProofPairings()]);

  const byYear = new Map<number, YearRow>();
  for (const y of SEED_YEARS) {
    const card = seedFor(y);
    if (card) byYear.set(y, { taxYear: y, card, stored: false, seeded: true, updatedAt: null, updatedBy: "" });
  }
  for (const s of stored) {
    byYear.set(s.taxYear, {
      taxYear: s.taxYear,
      card: s.card,
      stored: true,
      seeded: byYear.has(s.taxYear),
      updatedAt: s.updatedAt,
      updatedBy: s.updatedBy,
    });
  }
  const years = [...byYear.values()].sort((a, b) => b.taxYear - a.taxYear);

  return (
    <>
      <Eyebrow>Tool · settings</Eyebrow>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-fog">Tax Tables</h1>
        <Link
          href="/portal/tax-recap"
          className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted no-underline hover:text-fog"
        >
          ← Back to Tax Recap
        </Link>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted">
        Everything the recap uses to compute a client&rsquo;s before column from their after
        return: the year&rsquo;s federal figures and a card for each state with its rules and
        numbers. Fill a year in once and every client of that year is computed from it. The
        proof panel re-derives every real before/after pairing on file with the tables as you
        edit them, so a wrong number shows up next to the client it would have got wrong.
      </p>

      <div className="mt-9">
        <TaxTablesEditor years={years} pairings={pairings} />
      </div>
    </>
  );
}
