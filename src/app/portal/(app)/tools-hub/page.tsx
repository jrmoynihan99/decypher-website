import { requirePermission } from "@/lib/firebase/session";
import { getCatalog } from "@/lib/tools-hub/store";
import { Eyebrow } from "@/components/estimator/fields";
import ToolsHub from "@/components/portal/tools-hub/ToolsHub";

export const metadata = { title: "Tools Hub — DeCypher Portal" };

export default async function ToolsHubPage() {
  const session = await requirePermission("tools-hub");
  const catalog = await getCatalog();

  return (
    <>
      <Eyebrow>Resources</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">Tools Hub</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Every tool the team uses, grouped by department. Switch off the
        departments you don&rsquo;t work in and the page remembers.
      </p>

      <ToolsHub
        initialCatalog={catalog}
        userId={session.uid}
        isAdmin={session.role === "admin"}
      />
    </>
  );
}
