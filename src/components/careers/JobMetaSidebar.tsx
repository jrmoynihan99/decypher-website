import ApplyCta from "./ApplyCta";
import type { CmsJob } from "@/sanity/types";

/**
 * The role file's left rail: a dossier meta card — status, location, type,
 * department, comp, stack tags — with the apply action pinned at the bottom.
 * On desktop it rides along inside a sticky wrapper (owned by JobDetail — it
 * must sit outside the Reveal motion div, whose will-change:transform kills
 * position:sticky); on mobile it stacks below the tab panel as a recap.
 */
export default function JobMetaSidebar({ job }: { job: CmsJob }) {
  const rows: { label: string; value?: string; comp?: boolean }[] = [
    { label: "Location", value: job.location },
    { label: "Employment type", value: job.type },
    { label: "Department", value: job.department },
    { label: "Compensation", value: job.comp, comp: true },
  ];

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-edge bg-panel p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,45,120,.7), transparent)",
        }}
      />
      <p className="m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
        {`// ROLE_FILE — ${job.department.toUpperCase().replace(/\s+/g, "_")}.NODE`}
      </p>

      <dl className="m-0 mt-2 divide-y divide-edge">
        <div className="py-4">
          <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
            Status
          </dt>
          <dd className="m-0 mt-1.5 flex items-center gap-2 font-mono text-[12.5px] tracking-[0.06em] text-teal">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-teal"
            />
            OPEN — ACCEPTING APPLICANTS
          </dd>
        </div>
        {rows.map(
          (r) =>
            r.value && (
              <div key={r.label} className="py-4">
                <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
                  {r.label}
                </dt>
                <dd
                  className={`m-0 mt-1.5 ${
                    r.comp
                      ? "font-mono text-[14px] tracking-[0.04em] text-teal"
                      : "text-[15px] text-fog"
                  }`}
                >
                  {r.value}
                </dd>
              </div>
            ),
        )}
        {(job.tags ?? []).length > 0 && (
          <div className="py-4">
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
              Stack
            </dt>
            <dd className="m-0 mt-2.5 flex flex-wrap gap-2">
              {(job.tags ?? []).map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/12 bg-panel-2 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-muted"
                >
                  {t.toUpperCase()}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      <div className="border-t border-edge pt-5 text-center">
        <ApplyCta size="sm" />
        <p className="m-0 mt-3 font-mono text-[10px] tracking-[0.16em] text-faint">
          {"// APPLICATIONS REVIEWED WEEKLY"}
        </p>
      </div>
    </div>
  );
}
