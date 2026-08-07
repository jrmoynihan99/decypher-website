import { requirePermission } from "@/lib/firebase/session";
import { listReferrers, listSalesCalls } from "@/lib/sales/store";
import { getOptionsConfig } from "@/lib/sales/config";
import { getCreators } from "@/sanity/queries";
import type { CreatorOption } from "@/lib/sales/types";
import { Eyebrow } from "@/components/estimator/fields";
import SalesFlow from "@/components/portal/sales/SalesFlow";

export const metadata = { title: "Sales Flow — DeCypher Portal" };

/**
 * Read on the server for first paint, then the grid takes over and saves each
 * cell through /api/portal/sales/*. Same shape as the Leads tab.
 *
 * The Sanity roster rides along for the referrer manager's photo picker; it's
 * fetched best-effort because a Sanity outage shouldn't take the pipeline down
 * with it — the picker just comes up empty.
 */
export default async function SalesFlowPage() {
  await requirePermission("sales-flow");
  const [calls, referrers, config, creators] = await Promise.all([
    listSalesCalls(),
    listReferrers(),
    getOptionsConfig(),
    getCreators().then(
      (list): CreatorOption[] =>
        list.map((c) => ({ id: c.id, name: c.name, imageUrl: c.img ?? null })),
      () => [] as CreatorOption[],
    ),
  ]);

  return (
    <>
      <Eyebrow>Pipeline</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">Sales Flow</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Every discovery call Calendly books, and what happened to it. Booked
        Calls triages what&rsquo;s a sale and what&rsquo;s a referral; Deal Desk
        is the money; Referrals is who gets the credit. Edits save as you make
        them.
      </p>

      <div className="mt-7">
        <SalesFlow
          initialCalls={calls}
          initialReferrers={referrers}
          initialConfig={config}
          creators={creators}
        />
      </div>
    </>
  );
}
