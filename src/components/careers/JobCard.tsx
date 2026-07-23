"use client";

import Link from "next/link";
import { useState } from "react";
import { useSpotlight } from "@/hooks/useSpotlight";
import type { CmsJob } from "@/sanity/types";
import ApplicationModal from "./ApplicationModal";

/**
 * One role on the Careers page — a dossier row. The card is a link to the
 * role's detail page (/careers/<slug>), where the full posting and the apply
 * modal live. Department chips cycle the brand accent trio by position, same
 * palette as the testimonial badges. Hover carries a cursor-tracking spotlight
 * and lift, matching the team and creator cards.
 *
 * Docs that predate the slug field fall back to the old behavior: the card is
 * a div and clicking it opens the application modal directly.
 */

const ACCENTS = [
  { color: "#FF2D78", border: "rgba(255,45,120,.4)", bg: "rgba(255,45,120,.10)" },
  { color: "#B06CFF", border: "rgba(139,43,232,.45)", bg: "rgba(139,43,232,.12)" },
  { color: "#FF7A4D", border: "rgba(255,92,46,.45)", bg: "rgba(255,92,46,.10)" },
];

const cardCls =
  "group relative block cursor-pointer overflow-hidden rounded-[20px] border border-edge bg-panel p-6 no-underline transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-magenta/45 hover:shadow-[0_26px_60px_-26px_rgba(255,45,120,0.5)] sm:p-7";

export default function JobCard({ job, index }: { job: CmsJob; index: number }) {
  const accent = ACCENTS[index % ACCENTS.length];
  const meta = [job.location, job.type].filter(Boolean).join(" · ");
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLElement>();
  const [open, setOpen] = useState(false);
  const href = job.slug ? `/careers/${job.slug}` : undefined;

  const inner = (
    <>
      {/* accent hairline, revealed on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent.color}, transparent)`,
        }}
      />
      {/* cursor spotlight — position eased in JS, opacity eased in CSS */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(420px circle at var(--mx, 50%) var(--my, 0%), rgba(255,45,120,.15), transparent 70%)",
        }}
      />

      <div className="relative">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[12px] tracking-[0.14em] text-faint">
            [{String(index + 1).padStart(2, "0")}]
          </span>
          <span
            className="rounded-full border px-3 py-1 font-mono text-[10.5px] tracking-[0.1em]"
            style={{
              color: accent.color,
              borderColor: accent.border,
              background: accent.bg,
            }}
          >
            {job.department.toUpperCase()}
          </span>
          {meta && (
            <span className="ml-auto font-mono text-[11px] tracking-[0.1em] text-dusk">
              {meta}
            </span>
          )}
        </div>

        <h3 className="m-0 mt-4 font-display text-[clamp(20px,2.4vw,26px)] font-semibold tracking-[-0.015em] text-fog">
          {job.title}
        </h3>
        {job.comp && (
          <p className="m-0 mt-2 font-mono text-[13px] tracking-[0.04em] text-teal">
            {job.comp}
          </p>
        )}
        <p className="mb-0 mt-2 max-w-[62ch] text-[14.5px] leading-relaxed text-muted">
          {job.blurb}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {(job.tags ?? []).map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/12 bg-panel-2 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.08em] text-muted"
            >
              {t.toUpperCase()}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-2 font-mono text-[11.5px] tracking-[0.16em] text-mist transition-colors group-hover:text-magenta">
            {href ? "VIEW ROLE" : "APPLY"}
            <span
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              →
            </span>
          </span>
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        ref={ref as React.Ref<HTMLAnchorElement>}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className={cardCls}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      role="button"
      tabIndex={0}
      aria-label={`Apply for ${job.title}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
      className={cardCls}
    >
      {inner}
      <ApplicationModal job={job} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
