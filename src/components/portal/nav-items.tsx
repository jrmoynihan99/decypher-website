/**
 * Single source of truth for the portal's tools. The sidebar, the dashboard
 * tiles and each tool's own page header all read from here, so adding a tool is
 * one entry rather than four edits that drift apart.
 *
 * `icon` is an SVG path `d` drawn on a 24×24 stroke grid — cheaper than pulling
 * in an icon dependency for five glyphs.
 */

export type PortalWidget = {
  href: string;
  name: string;
  blurb: string;
  note: string;
  icon: string;
};

export const PORTAL_WIDGETS: PortalWidget[] = [
  {
    href: "/portal/tax-strategy",
    name: "Tax Strategy",
    blurb: "Model strategies against a client's numbers and save the scenarios.",
    note: "Builds on the public estimator in lib/tax.ts",
    icon: "M3 3v18h18M7 15l3.5-4 3 2.5L21 7",
  },
  {
    href: "/portal/receipts",
    name: "Receipt Analyzer",
    blurb: "Drop a PDF, pull out the line items, categorise them for filing.",
    note: "Needs file storage + a parsing pass",
    icon: "M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21zM9 8h6M9 12h6",
  },
  {
    href: "/portal/sales-flow",
    name: "Sales Flow",
    blurb: "Visualise the pipeline from first touch to booked call.",
    note: "Calendly integration",
    icon: "M5 6h6M5 12h14M5 18h9M17 3l3 3-3 3M17 15l3 3-3 3",
  },
  {
    href: "/portal/creator-finances",
    name: "Creator Finances",
    blurb: "Per-creator revenue, expenses and payout history in one place.",
    note: "QuickBooks integration",
    icon: "M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
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
