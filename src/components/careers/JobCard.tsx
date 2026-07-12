import type { CmsJob } from "@/sanity/types";

/**
 * One role on the Careers page — a dossier row. The whole card links to the
 * opening's apply target (mailto or job post). Department chips cycle the
 * brand accent trio by position, same palette as the testimonial badges.
 */

const ACCENTS = [
  { color: "#FF2D78", border: "rgba(255,45,120,.4)", bg: "rgba(255,45,120,.10)" },
  { color: "#B06CFF", border: "rgba(139,43,232,.45)", bg: "rgba(139,43,232,.12)" },
  { color: "#FF7A4D", border: "rgba(255,92,46,.45)", bg: "rgba(255,92,46,.10)" },
];

export default function JobCard({ job, index }: { job: CmsJob; index: number }) {
  const accent = ACCENTS[index % ACCENTS.length];
  const meta = [job.location, job.type, job.comp].filter(Boolean).join(" · ");
  return (
    <a
      href={job.applyHref}
      className="group relative block overflow-hidden rounded-[20px] border border-edge bg-panel p-6 no-underline transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-magenta/45 hover:shadow-[0_18px_50px_-24px_rgba(255,45,120,0.35)] sm:p-7"
    >
      {/* accent hairline, revealed on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent.color}, transparent)`,
        }}
      />

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
          APPLY
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </div>
    </a>
  );
}
