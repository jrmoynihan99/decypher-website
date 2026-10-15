import { requirePermission } from "@/lib/firebase/session";
import { activeStaffNames } from "@/lib/firebase/users";
import DiscoveryCall from "@/components/discovery/DiscoveryCall";

/**
 * Opened from Tax Strategy → Sales Discovery → Start a call. The signed-in
 * staff member is the advisor by default; the roster fills the drawer's
 * advisor dropdown. A link can prefill the creator's first name (`?name=`)
 * and start as a practice call (`?test=1`).
 */
export default async function DiscoveryCallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("tax-strategy");
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const me = session.displayName.trim() || session.email;
  let advisors = [me];
  try {
    advisors = await activeStaffNames(me);
  } catch (e) {
    console.error("[discovery] couldn't list staff names:", e);
  }
  return (
    <DiscoveryCall
      me={me}
      advisors={advisors}
      prefill={{ name: one("name").replace(/\s+/g, " ").trim().slice(0, 120), practice: one("test") === "1" }}
    />
  );
}
