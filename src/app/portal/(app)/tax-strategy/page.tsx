import { requirePermission } from "@/lib/firebase/session";
import TaxStrategyWorkbench from "@/components/portal/widgets/TaxStrategyWorkbench";

export const metadata = { title: "Tax Strategy — DeCypher Portal" };

/**
 * The page is the gate; the header lives inside the workbench because it
 * swaps — the launcher shows the tab title, an open tool shows a back link.
 */
export default async function TaxStrategyPage() {
  await requirePermission("tax-strategy");
  return <TaxStrategyWorkbench />;
}
