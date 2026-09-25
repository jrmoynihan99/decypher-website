import Link from "next/link";
import { cookies } from "next/headers";
import type { StaffSession } from "@/lib/firebase/session";
import SignOutButton from "@/components/portal/SignOutButton";
import SidebarUser from "@/components/portal/SidebarUser";
import { RailFrame, SidebarRail, SidebarStrip } from "@/components/portal/PortalSidebar";
import { PortalThemeToggle } from "@/components/portal/PortalTheme";
import { RAIL_COOKIE } from "@/components/portal/rail";

/**
 * Where portal users report a problem. Deliberately a real, monitored mailbox
 * rather than a support@ alias — an address that bounces is worse than none,
 * and Intuit's reviewers do test the contact route they're told about.
 */
const SUPPORT_EMAIL = "otavio@wedecypher.co";

/**
 * Chrome for every signed-in portal page: full-bleed sticky header over a
 * left rail + content column.
 *
 * Identity and sign-out live at the foot of the rail on desktop. The rail is
 * hidden on phones, so they're mirrored into the header there — otherwise a
 * phone user would have no way to sign out at all.
 */
export default async function PortalShell({
  session,
  children,
}: {
  session: StaffSession;
  children: React.ReactNode;
}) {
  const isAdmin = session.role === "admin";
  const railPinned = (await cookies()).get(RAIL_COOKIE)?.value === "pinned";

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-20 border-b border-edge-soft bg-night/85 backdrop-blur-xl">
        <div className="flex h-16 w-full items-center gap-4 px-5">
          <Link
            href="/portal"
            className="font-display text-[15px] font-semibold text-fog no-underline"
          >
            DeCypher <span className="text-grad">Portal</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <PortalThemeToggle />

            {/* phones only — the desktop copy lives at the foot of the rail */}
            <div className="flex items-center gap-3 md:hidden">
              <div className="text-right">
                <div className="font-body text-[13px] leading-tight text-fog">
                  {session.displayName || session.email}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[1.2px] text-dusk">
                  {session.role}
                </div>
              </div>
              <SignOutButton />
            </div>
          </div>
        </div>

        <div className="border-t border-edge-soft md:hidden">
          <SidebarStrip isAdmin={isAdmin} permissions={session.permissions} />
        </div>
      </header>

      <div className="flex">
        <RailFrame initialPinned={railPinned} footer={<SidebarUser session={session} />}>
          <SidebarRail isAdmin={isAdmin} permissions={session.permissions} />
        </RailFrame>

        <main className="min-w-0 flex-1 px-5 py-9 sm:px-8">
          {children}

          {/* Inside <main> rather than the rail on purpose: the rail is hidden
              below md, and a support route that disappears on a phone is not a
              support route. Intuit's app assessment asks specifically whether
              users can reach support from within the app. */}
          <footer className="mt-14 border-t border-edge-soft pt-5">
            <p className="font-mono text-[11px] leading-relaxed text-dusk">
              Trouble with the portal or a QuickBooks connection?{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("DeCypher Portal support")}`}
                className="text-mist underline decoration-edge-bright underline-offset-2 transition-colors hover:text-fog"
              >
                {SUPPORT_EMAIL}
              </a>
              . Include the client name and the time it happened — sync errors
              are recorded per company with an Intuit trace id.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
