"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PermissionKey } from "@/lib/permissions";
import {
  DASHBOARD_ITEM,
  NavIcon,
  PORTAL_INBOX,
  PORTAL_WIDGETS,
  STAFF_ITEM,
} from "@/components/portal/nav-items";

/**
 * Portal navigation. Renders as a left rail on desktop and a horizontally
 * scrollable strip under the header on phones — the rail would eat half a
 * phone screen, and a hidden nav is worse than a scrolling one.
 *
 * Tabs are filtered to the session's permission grants, and the Staff link is
 * hidden for non-admins — both as tidiness only; every page and API route
 * enforces its own gate, so nothing here is load-bearing.
 */

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
}

const allowed = (permissions: PermissionKey[]) => {
  const can = new Set(permissions);
  return {
    tools: PORTAL_WIDGETS.filter((w) => can.has(w.permission)),
    inbox: PORTAL_INBOX.filter((w) => can.has(w.permission)),
  };
};

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 mb-1 px-3 font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint">
      {children}
    </div>
  );
}

export function SidebarRail({
  isAdmin,
  permissions,
}: {
  isAdmin: boolean;
  permissions: PermissionKey[];
}) {
  const isActive = useIsActive();
  const { tools, inbox } = allowed(permissions);

  return (
    <nav className="flex flex-col gap-1 p-3">
      <RailLink item={DASHBOARD_ITEM} active={isActive(DASHBOARD_ITEM.href)} />

      {tools.length ? (
        <>
          <RailHeading>Tools</RailHeading>
          {tools.map((w) => (
            <RailLink key={w.href} item={w} active={isActive(w.href)} />
          ))}
        </>
      ) : null}

      {inbox.length ? (
        <>
          <RailHeading>Inbox</RailHeading>
          {inbox.map((w) => (
            <RailLink key={w.href} item={w} active={isActive(w.href)} />
          ))}
        </>
      ) : null}

      {isAdmin ? (
        <>
          <RailHeading>Admin</RailHeading>
          <RailLink item={STAFF_ITEM} active={isActive(STAFF_ITEM.href)} />
        </>
      ) : null}
    </nav>
  );
}

function RailLink({
  item,
  active,
}: {
  item: { href: string; name: string; icon: string };
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-2.5 rounded-[10px] px-3 py-2 font-body text-[13.5px] no-underline transition-colors duration-150 ${
        active
          ? "bg-white/[0.06] text-fog"
          : "text-muted hover:bg-white/[0.03] hover:text-fog"
      }`}
    >
      {/* magenta tick on the active row — the only accent in the rail */}
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-magenta"
        />
      ) : null}
      <NavIcon d={item.icon} className={active ? "text-magenta" : ""} />
      {item.name}
    </Link>
  );
}

export function SidebarStrip({
  isAdmin,
  permissions,
}: {
  isAdmin: boolean;
  permissions: PermissionKey[];
}) {
  const isActive = useIsActive();
  const { tools, inbox } = allowed(permissions);
  const items = [
    DASHBOARD_ITEM,
    ...tools,
    ...inbox,
    ...(isAdmin ? [STAFF_ITEM] : []),
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-none items-center gap-2 rounded-full px-3 py-1.5 font-body text-[13px] no-underline transition-colors duration-150 ${
              active ? "bg-white/[0.07] text-fog" : "text-muted"
            }`}
          >
            <NavIcon d={item.icon} className={active ? "text-magenta" : ""} />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
