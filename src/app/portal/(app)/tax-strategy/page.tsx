import { requirePermission } from "@/lib/firebase/session";
import { PORTAL_WIDGETS } from "@/components/portal/nav-items";
import WidgetPlaceholder from "@/components/portal/WidgetPlaceholder";

const widget = PORTAL_WIDGETS.find((w) => w.href === "/portal/tax-strategy")!;

export const metadata = { title: "Tax Strategy — DeCypher Portal" };

export default async function TaxStrategyPage() {
  await requirePermission("tax-strategy");
  return <WidgetPlaceholder widget={widget} />;
}
