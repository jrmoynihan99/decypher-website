import type { CSSProperties } from "react";

/**
 * Shared by the desktop rail's server and client halves: PortalShell reads the
 * pin cookie and SidebarUser styles its rows. That's why this isn't in the
 * "use client" PortalSidebar module. Its exports reach a server component as
 * client references, not as values.
 */

/** Holds the rail's pin state: "pinned", or anything else for hover-to-open.
 *  PortalShell reads it so a pinned rail is already open on the first paint. */
export const RAIL_COOKIE = "dcy-portal-rail";

/**
 * A row's text: hidden while the rail sits collapsed to its icon column, then
 * fading and sliding in as it opens, top to bottom in `--i` order (see
 * cascade). Closing drops them all at once. `rail-open:` is the custom variant
 * in globals.css.
 */
export const RAIL_LABEL =
  "whitespace-nowrap opacity-0 -translate-x-2 transition-[opacity,translate] delay-[140ms] duration-150 ease-out motion-reduce:transition-none rail-open:translate-x-0 rail-open:opacity-100 rail-open:delay-[calc(90ms+var(--i,0)*16ms)] rail-open:duration-300";

/** Stagger slot for a RAIL_LABEL. */
export const cascade = (i: number) => ({ "--i": i }) as CSSProperties;
