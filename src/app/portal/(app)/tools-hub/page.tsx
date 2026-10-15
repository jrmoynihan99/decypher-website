import { requirePermission } from "@/lib/firebase/session";
import { getCatalog } from "@/lib/tools-hub/store";
import { getPortalResources } from "@/sanity/queries";
import { Eyebrow } from "@/components/estimator/fields";
import ToolsHub from "@/components/portal/tools-hub/ToolsHub";

export const metadata = { title: "Tools Hub — DeCypher Portal" };

/**
 * Two sources on one page: the tool catalog (Firestore, admin-edited in the
 * hub itself) and the PDF library (Sanity, edited in the Studio). A Sanity
 * outage costs the library, not the hub.
 */
export default async function ToolsHubPage() {
  const session = await requirePermission("tools-hub");
  const [catalog, resources] = await Promise.all([
    getCatalog(),
    getPortalResources().catch((e) => {
      console.error("[tools-hub] couldn't load the resource library:", e);
      return [];
    }),
  ]);

  return (
    <>
      <Eyebrow>Resources</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">Tools Hub</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Every tool the team uses, grouped by department, and the documents the
        team reaches for. Switch off the departments you don&rsquo;t work in and
        the page remembers.
      </p>

      <ToolsHub
        initialCatalog={catalog}
        resources={resources}
        userId={session.uid}
        isAdmin={session.role === "admin"}
      />
    </>
  );
}
