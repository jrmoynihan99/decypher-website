"use client";

import Marquee from "@/components/ui/Marquee";

/**
 * The deliverables ticker from "Mission Control", shared across the services
 * variants: a slow, draggable marquee of everything the team handles. Pure
 * ambience — reading it is optional, nothing is gated behind it.
 */

const DELIVERABLES = [
  "S-CORP ELECTIONS",
  "QUARTERLY ESTIMATES",
  "WRITE-OFF AUDITS",
  "1099 WRANGLING",
  "BRAND-DEAL INVOICING",
  "ENTITY SETUP",
  "TAX STRATEGY",
  "WEEKLY BOOKKEEPING",
  "AUDIT SUPPORT",
  "SOLO 401(K) SETUP",
];

export default function ServicesTicker({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden border-y border-edge-soft py-3 [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)] ${className}`}
    >
      <Marquee duration={46}>
        {[...DELIVERABLES, ...DELIVERABLES].map((m, i) => (
          <span
            key={`${m}-${i}`}
            className="flex items-center whitespace-nowrap font-mono text-[11.5px] tracking-[0.22em] text-dusk"
          >
            <span className="px-5">{m}</span>
            <span className="text-magenta">·</span>
          </span>
        ))}
      </Marquee>
    </div>
  );
}
