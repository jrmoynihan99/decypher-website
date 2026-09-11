import { requirePermission } from "@/lib/firebase/session";
import { getRecap, listRecaps } from "@/lib/tax-recap/store";
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
  const [recaps, editing] = await Promise.all([
    listRecaps(),
    edit && !edit.includes("/") ? getRecap(edit) : Promise.resolve(null),
  ]);

  return (
    <>
      <Eyebrow>Tool</Eyebrow>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-fog">Tax Recap</h1>
        <span className="rounded-full border border-teal/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-teal">
          Live
        </span>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted">
        Print the before return (income only) and the after return (everything applied)
        from ProSeries, drop both here, check the numbers it read, and send the client
        their recap page. The field map it follows is in{" "}
        <code className="font-mono text-[12px] text-mist">docs/TAX-RECAP-FIELD-MAP.md</code>.
      </p>

      <div className="mt-9">
        {/* Keyed so switching between "new" and "edit" remounts with fresh state. */}
        <TaxRecapBuilder key={editing?.id ?? "new"} initial={editing} />
      </div>

      <div className="mt-8">
        <RecapList recaps={recaps} />
      </div>
    </>
  );
}
