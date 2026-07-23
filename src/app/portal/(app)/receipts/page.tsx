import { requirePermission } from "@/lib/firebase/session";
import { PORTAL_WIDGETS } from "@/components/portal/nav-items";
import WidgetPlaceholder from "@/components/portal/WidgetPlaceholder";

const widget = PORTAL_WIDGETS.find((w) => w.href === "/portal/receipts")!;

export const metadata = { title: "Receipt Analyzer — DeCypher Portal" };

export default async function ReceiptsPage() {
  await requirePermission("receipts");
  return <WidgetPlaceholder widget={widget} />;
}
