import { requireSession } from "@/lib/firebase/session";
import PortalShell from "@/components/portal/PortalShell";

/** Everything in this route group is behind the gate. requireSession() verifies
 *  the cookie against Firebase and checks the staff record on every request —
 *  the proxy's cookie-presence check is only a redirect shortcut, not this. */
export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return <PortalShell session={session}>{children}</PortalShell>;
}
