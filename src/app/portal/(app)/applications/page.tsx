import { requirePermission } from "@/lib/firebase/session";
import { listApplications } from "@/lib/application-store";
import { Eyebrow } from "@/components/estimator/fields";
import ApplicationsTable from "@/components/portal/ApplicationsTable";

export const metadata = { title: "Applications — DeCypher Portal" };

export default async function ApplicationsPage() {
  await requirePermission("applications");
  const applications = await listApplications();

  return (
    <>
      <Eyebrow>Inbox</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">
        Applications
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Everyone who applied through the careers page. Same records that ping{" "}
        <span className="font-mono text-[13px]">#recruiting</span> in Slack.
      </p>

      <ApplicationsTable initialApplications={applications} />
    </>
  );
}
