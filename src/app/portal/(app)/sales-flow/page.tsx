import { requirePermission } from "@/lib/firebase/session";
import { listReferrers, listSalesCalls } from "@/lib/sales/store";
import { Eyebrow } from "@/components/estimator/fields";
import SalesFlow from "@/components/portal/sales/SalesFlow";

export const metadata = { title: "Sales Flow — DeCypher Portal" };

/**
 * Read on the server for first paint, then the grid takes over and saves each
 * cell through /api/portal/sales/*. Same shape as the Leads tab.
 */
export default async function SalesFlowPage() {
  await requirePermission("sales-flow");
  const [calls, referrers] = await Promise.all([listSalesCalls(), listReferrers()]);

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
        <SalesFlow initialCalls={calls} initialReferrers={referrers} />
      </div>
    </>
  );
}
