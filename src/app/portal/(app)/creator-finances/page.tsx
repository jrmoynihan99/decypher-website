import { requirePermission } from "@/lib/firebase/session";
import { PORTAL_WIDGETS } from "@/components/portal/nav-items";
import WidgetPlaceholder from "@/components/portal/WidgetPlaceholder";

const widget = PORTAL_WIDGETS.find((w) => w.href === "/portal/creator-finances")!;

export const metadata = { title: "Creator Finances — DeCypher Portal" };

export default async function CreatorFinancesPage() {
  await requirePermission("creator-finances");
  return <WidgetPlaceholder widget={widget} />;
}
