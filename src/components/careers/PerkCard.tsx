"use client";

import { useSpotlight } from "@/hooks/useSpotlight";
import type { CareersPageDoc } from "@/sanity/types";

type Perk = NonNullable<CareersPageDoc["perks"]>[number];

/**
 * One "why you'll want in" perk. Carries the cursor spotlight but no lift or
 * border change — these aren't links, and the lift would advertise a click
 * that goes nowhere.
 */
export default function PerkCard({ perk }: { perk: Perk }) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLDivElement>();

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="group relative h-full overflow-hidden rounded-[18px] border border-edge bg-panel p-6 sm:p-7"
    >
      {/* cursor spotlight — position eased in JS, opacity eased in CSS */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(320px circle at var(--mx, 50%) var(--my, 0%), rgba(255,45,120,.14), transparent 70%)",
        }}
      />
      <div className="relative">
        {perk.tag && (
          <p className="m-0 font-mono text-[10px] tracking-[0.2em] text-teal">
            {perk.tag}
          </p>
        )}
        <b className="mt-3 block font-display text-[18px] font-semibold tracking-[-0.01em] text-fog">
          {perk.title}
        </b>
        {perk.body && (
          <p className="mb-0 mt-2 text-[14.5px] leading-relaxed text-muted">
            {perk.body}
          </p>
        )}
      </div>
    </div>
  );
}
