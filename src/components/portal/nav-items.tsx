import type { PermissionKey } from "@/lib/permissions";

/**
 * Single source of truth for the portal's tools. The sidebar, the dashboard
 * tiles and each tool's own page header all read from here, so adding a tool is
 * one entry rather than four edits that drift apart.
 *
 * `permission` ties the entry to the per-user tab grants in lib/permissions —
 * the sidebar and dashboard filter on it, and each page enforces it with
 * requirePermission(). Every widget must carry one; an ungated tab is a bug.
 *
 * `icon` is an SVG path `d` drawn on a 24×24 stroke grid — cheaper than pulling
 * in an icon dependency for a handful of glyphs.
 */

export type PortalWidget = {
  href: string;
  name: string;
  blurb: string;
  note: string;
  icon: string;
  permission: PermissionKey;
  /** Actually built, vs a placeholder page. Drives the dashboard badge. */
  live?: boolean;
};

export const PORTAL_WIDGETS: PortalWidget[] = [
  {
    href: "/portal/tax-strategy",
    name: "Tax Strategy",
    blurb:
      "Savings snapshot, shelter engine, S-corp analyzer and the property deal desk.",
    note: "Shares the bracket tables in lib/tax.ts",
    icon: "M3 3v18h18M7 15l3.5-4 3 2.5L21 7",
    permission: "tax-strategy",
    live: true,
  },
  {
    href: "/portal/refund-calculator",
    name: "Refund Calculator",
    blurb:
      "Pro-rated cancellation refunds, with the plain-English version to read out.",
    note: "Plan pricing is set in the tool",
    icon: "M3 10h18M7 15h4M9 3h6a2 2 0 012 2v14a2 2 0 01-2 2H9a2 2 0 01-2-2V5a2 2 0 012-2z",
    permission: "refund-calculator",
    live: true,
  },
  {
    href: "/portal/receipts",
    name: "Receipt Analyzer",
    blurb: "Drop a PDF, pull out the line items, categorise them for filing.",
    note: "Needs file storage + a parsing pass",
    icon: "M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21zM9 8h6M9 12h6",
    permission: "receipts",
  },
  {
    href: "/portal/sales-flow",
    name: "Sales Flow",
    blurb: "Visualise the pipeline from first touch to booked call.",
    note: "Calendly integration",
    icon: "M5 6h6M5 12h14M5 18h9M17 3l3 3-3 3M17 15l3 3-3 3",
    permission: "sales-flow",
  },
  {
    href: "/portal/creator-finances",
    name: "Creator Finances",
    blurb:
      "Per-creator profit & loss straight from their books, plus the roll-up across every client.",
    note: "Syncs nightly from QuickBooks Online",
    icon: "M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
    permission: "creator-finances",
    live: true,
  },
];

/**
 * The "Inbox" group: things people send us, mirrored from Firestore. These are
 * live pages, not placeholders — the same records whose arrival pings Slack.
 */
export const PORTAL_INBOX: PortalWidget[] = [
  {
    href: "/portal/leads",
    name: "Leads",
    blurb: "Every estimator lead — the same numbers and flags that post to #leads.",
    note: "Mirrors the #leads Slack channel",
    icon: "M21 4H3l7 8.5V19l4 2v-8.5L21 4z",
    permission: "leads",
    live: true,
  },
  {
    href: "/portal/applications",
    name: "Applications",
    blurb: "Job applications from the careers page, as they arrive.",
    note: "Mirrors the #recruiting Slack channel",
    icon: "M3 8h18v12H3zM9 8V6a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18",
    permission: "applications",
    live: true,
  },
];

export const DASHBOARD_ITEM = {
  href: "/portal",
  name: "Dashboard",
  icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
};

export const STAFF_ITEM = {
  href: "/portal/admin/users",
  name: "Staff",
  icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
};

export function NavIcon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-[17px] w-[17px] flex-none ${className}`}
    >
      <path d={d} />
    </svg>
  );
}
