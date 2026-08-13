import { requirePermission } from "@/lib/firebase/session";
import { getToolNames } from "@/lib/tax-strategy/names";
import TaxStrategyWorkbench from "@/components/portal/widgets/TaxStrategyWorkbench";

export const metadata = { title: "Tax Strategy — DeCypher Portal" };

/**
 * The page is the gate; the header lives inside the workbench because it
 * swaps — the launcher shows the tab title, an open tool shows a back link.
 * Custom tool names are fetched here so the launcher renders them without a
 * client round trip.
 */
export default async function TaxStrategyPage() {
  const session = await requirePermission("tax-strategy");
  const customNames = await getToolNames();
  return (
    <TaxStrategyWorkbench
      customNames={customNames}
      isAdmin={session.role === "admin"}
    />
  );
}
