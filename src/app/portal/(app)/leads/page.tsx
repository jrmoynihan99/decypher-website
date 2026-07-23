import { requirePermission } from "@/lib/firebase/session";
import { listLeads } from "@/lib/lead-store";
import { Eyebrow } from "@/components/estimator/fields";
import LeadsTable from "@/components/portal/LeadsTable";

export const metadata = { title: "Leads — DeCypher Portal" };

export default async function LeadsPage() {
  await requirePermission("leads");
  const leads = await listLeads();

  return (
    <>
      <Eyebrow>Inbox</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">Leads</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Everyone who ran the estimator and left their details. Same records that
        ping <span className="font-mono text-[13px]">#leads</span> in Slack —
        this is the copy that can&rsquo;t scroll away.
      </p>

      <LeadsTable initialLeads={leads} />
    </>
  );
}
