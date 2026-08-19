"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The two pages of the Applications tab.
 *
 * Inbox is the record — everything the applicant sent, read-only. Pipeline is
 * recruiting's own view — what we decided about them, and the counts that come
 * out of those decisions. Two pages rather than two client tabs because they
 * answer different questions and get linked to separately; the sidebar keeps
 * Applications lit for both (it matches on prefix).
 */

const PAGES = [
  { href: "/portal/applications", label: "Inbox" },
  { href: "/portal/applications/pipeline", label: "Pipeline" },
];

export default function ApplicationsNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-5 inline-flex gap-1 rounded-full border border-edge bg-white/[0.02] p-1">
      {PAGES.map((p) => {
        // Exact match — /applications is a prefix of /applications/pipeline.
        const active = pathname === p.href;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-[1px] no-underline transition-colors duration-150 ${
              active
                ? "bg-magenta text-white"
                : "text-dusk hover:text-fog"
            }`}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
