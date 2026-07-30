import Link from "next/link";
import type { StaffSession } from "@/lib/firebase/session";
import SignOutButton from "@/components/portal/SignOutButton";
import SidebarUser from "@/components/portal/SidebarUser";
import { SidebarRail, SidebarStrip } from "@/components/portal/PortalSidebar";

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
export default function PortalShell({
  session,
  children,
}: {
  session: StaffSession;
  children: React.ReactNode;
}) {
  const isAdmin = session.role === "admin";

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

          {/* phones only — the desktop copy lives at the foot of the rail */}
          <div className="ml-auto flex items-center gap-3 md:hidden">
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

        <div className="border-t border-edge-soft md:hidden">
          <SidebarStrip isAdmin={isAdmin} permissions={session.permissions} />
        </div>
      </header>

      <div className="flex">
        {/* Offset and height are 4rem + 1px, not 4rem: the header is a 4rem bar
            plus its own bottom border, and its height is auto so that border
            adds to it. Subtracting only 4rem makes the rail a pixel taller than
            the space beneath the header — enough to give every portal page a
            permanent 1px of scroll. */}
        <aside className="sticky top-[calc(4rem+1px)] hidden h-[calc(100svh-4rem-1px)] w-[228px] flex-none flex-col border-r border-edge-soft md:flex">
          {/* nav scrolls if it outgrows the rail; the user block never does */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarRail isAdmin={isAdmin} permissions={session.permissions} />
          </div>
          <div className="flex-none border-t border-edge-soft">
            <SidebarUser session={session} />
          </div>
        </aside>

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
