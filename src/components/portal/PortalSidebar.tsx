"use client";

import { useState } from "react";
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
import { RAIL_COOKIE, RAIL_LABEL, cascade } from "@/components/portal/rail";
import { useSignOut } from "@/components/portal/SignOutButton";

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

const PIN_ICON =
  "M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z";
const SIGN_OUT_ICON = "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9";

/* Easing shared by the rail and its layout slot, so pinning slides the page
   in step with the panel. */
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";

/**
 * The desktop rail. Collapsed, it's a 66px icon column; hovering (or tabbing
 * into) it opens the panel to full width *over* the page, so the content
 * never reflows under a passing cursor. Pinned, the <aside> itself widens to
 * match and the page makes room.
 *
 * Open/closed is pure CSS (the rail-open: variant in globals.css), with the
 * hover intent in transition-delay: a cursor crossing the rail on its way
 * somewhere else never opens it, and brushing out of it doesn't snap it shut.
 * Only the pin is state, mirrored into a cookie so PortalShell can render a
 * pinned rail open on the first paint.
 *
 * The panel is 66px because that centres the 17px icons exactly: 12px nav
 * padding + 12px row padding either side, plus the 1px border.
 */
export function RailFrame({
  initialPinned,
  footer,
  children,
}: {
  initialPinned: boolean;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [pinned, setPinned] = useState(initialPinned);

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    document.cookie = `${RAIL_COOKIE}=${next ? "pinned" : "hover"}; path=/portal; max-age=31536000; samesite=lax`;
  };

  return (
    // Offset and height are 4rem + 1px, not 4rem: the header is a 4rem bar
    // plus its own bottom border, and its height is auto so that border adds
    // to it. Subtracting only 4rem makes the rail a pixel taller than the
    // space beneath the header — enough to give every portal page a permanent
    // 1px of scroll.
    <aside
      data-pinned={pinned ? "" : undefined}
      className={`portal-rail sticky top-[calc(4rem+1px)] z-[15] hidden h-[calc(100svh-4rem-1px)] w-[66px] flex-none transition-[width] duration-300 ${EASE} motion-reduce:transition-none data-pinned:w-[228px] md:block`}
    >
      <div
        className={`absolute inset-y-0 left-0 flex w-[66px] flex-col overflow-hidden border-r border-edge-soft bg-night transition-[width,box-shadow] delay-[140ms] duration-[260ms] ${EASE} motion-reduce:transition-none rail-open:w-[228px] rail-open:delay-[80ms] rail-open:duration-[340ms] rail-float:shadow-[18px_0_44px_-24px_rgba(0,0,0,0.55)]`}
      >
        {/* nav scrolls if it outgrows the rail; the pin and user block never
            do. No scrollbar: a classic one would eat the icon column. */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        <div className="flex-none px-3 pb-2">
          <RailButton
            onClick={togglePin}
            icon={PIN_ICON}
            // tilted while loose, upright once it's holding the rail open
            iconClassName={`transition-[rotate,color] duration-300 ${pinned ? "text-magenta" : "rotate-45"}`}
            label={pinned ? "Unpin sidebar" : "Pin sidebar"}
            i={0}
          />
        </div>
        <div className="flex-none border-t border-edge-soft">{footer}</div>
      </div>
    </aside>
  );
}

/** Collapsed, a group's heading gives way to a short rule under the icons. */
function RailHeading({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <div className="relative mt-5 mb-1 px-3 font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint">
      <span aria-hidden className="absolute left-3 top-1/2 h-px w-[17px] bg-edge-mid transition-opacity delay-[200ms] duration-200 rail-open:opacity-0 rail-open:delay-[80ms] rail-open:duration-150" />
      <span className={`block ${RAIL_LABEL}`} style={cascade(i)}>
        {children}
      </span>
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

  // Cascade order for the labels: each group's heading, then its rows.
  const toolsAt = 1;
  const inboxAt = toolsAt + (tools.length ? tools.length + 1 : 0);
  const adminAt = inboxAt + (inbox.length ? inbox.length + 1 : 0);

  return (
    <nav className="flex flex-col gap-1 p-3">
      <RailLink item={DASHBOARD_ITEM} active={isActive(DASHBOARD_ITEM.href)} i={0} />

      {tools.length ? (
        <>
          <RailHeading i={toolsAt}>Tools</RailHeading>
          {tools.map((w, n) => (
            <RailLink key={w.href} item={w} active={isActive(w.href)} i={toolsAt + 1 + n} />
          ))}
        </>
      ) : null}

      {inbox.length ? (
        <>
          <RailHeading i={inboxAt}>Inbox</RailHeading>
          {inbox.map((w, n) => (
            <RailLink key={w.href} item={w} active={isActive(w.href)} i={inboxAt + 1 + n} />
          ))}
        </>
      ) : null}

      {isAdmin ? (
        <>
          <RailHeading i={adminAt}>Admin</RailHeading>
          <RailLink item={STAFF_ITEM} active={isActive(STAFF_ITEM.href)} i={adminAt + 1} />
        </>
      ) : null}
    </nav>
  );
}

const ROW =
  "relative flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 font-body text-[13.5px] no-underline transition-colors duration-150";
const IDLE = "text-muted hover:bg-white/[0.03] hover:text-fog";

function RailLink({
  item,
  active,
  i,
}: {
  item: { href: string; name: string; icon: string };
  active: boolean;
  i: number;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${ROW} ${active ? "bg-white/[0.06] text-fog" : IDLE}`}
    >
      {/* magenta tick on the active row — the only accent in the rail */}
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-magenta"
        />
      ) : null}
      <NavIcon d={item.icon} className={active ? "text-magenta" : ""} />
      <span className={RAIL_LABEL} style={cascade(i)}>
        {item.name}
      </span>
    </Link>
  );
}

function RailButton({
  icon,
  iconClassName = "",
  label,
  i,
  ...props
}: {
  icon: string;
  iconClassName?: string;
  label: string;
  i: number;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button
      type="button"
      {...props}
      className={`${ROW} ${IDLE} cursor-pointer border-0 bg-transparent text-left disabled:cursor-default disabled:opacity-60`}
    >
      <NavIcon d={icon} className={iconClassName} />
      <span className={RAIL_LABEL} style={cascade(i)}>
        {label}
      </span>
    </button>
  );
}

/** Sign out as a rail row, so it keeps an icon when the rail is collapsed. */
export function RailSignOut({ i }: { i: number }) {
  const { busy, signOut } = useSignOut();
  return (
    <RailButton
      onClick={signOut}
      disabled={busy}
      icon={SIGN_OUT_ICON}
      label={busy ? "Signing out…" : "Sign out"}
      i={i}
    />
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
