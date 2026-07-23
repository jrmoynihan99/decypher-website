import { requirePermission } from "@/lib/firebase/session";
import { PORTAL_WIDGETS } from "@/components/portal/nav-items";
import WidgetPlaceholder from "@/components/portal/WidgetPlaceholder";

const widget = PORTAL_WIDGETS.find((w) => w.href === "/portal/sales-flow")!;

export const metadata = { title: "Sales Flow — DeCypher Portal" };

export default async function SalesFlowPage() {
  await requirePermission("sales-flow");
  return <WidgetPlaceholder widget={widget} />;
}
