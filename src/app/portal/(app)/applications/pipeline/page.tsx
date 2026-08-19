import { requirePermission } from "@/lib/firebase/session";
import { listApplications } from "@/lib/application-store";
import { getApplicationOptions } from "@/lib/applications/config";
import { Eyebrow } from "@/components/estimator/fields";
import ApplicationsNav from "@/components/portal/applications/ApplicationsNav";
import ApplicationPipeline from "@/components/portal/applications/ApplicationPipeline";

export const metadata = { title: "Pipeline — DeCypher Portal" };

/**
 * The tracking half of the Applications tab. Same permission and the same
 * records as the Inbox — this page just reads the pipeline annotations
 * alongside them, plus the editable option lists so the tracker's dropdowns
 * render without a client round trip.
 */
export default async function ApplicationPipelinePage() {
  await requirePermission("applications");
  const [applications, config] = await Promise.all([
    listApplications(),
    getApplicationOptions(),
  ]);

  return (
    <>
      <Eyebrow>Inbox</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">
        Pipeline
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Who&rsquo;s a fit, who got an offer, who got hired — and for what role.
        The Stats view turns those calls into the numbers: how many people
        applied, and how many we hired.
      </p>

      <ApplicationsNav />

      <ApplicationPipeline
        initialApplications={applications}
        initialConfig={config}
      />
    </>
  );
}
