"use client";

import type { CmsJob } from "@/sanity/types";
import ApplicationForm from "./ApplicationForm";
import ApplyCta from "./ApplyCta";
import { useJobTabs } from "./JobTabs";

/**
 * The role file's right column: a mono tab rail — [ 01 // OVERVIEW ] /
 * [ 02 // APPLICATION ] — over a dossier panel. Overview holds the VSL + rich
 * posting (server-rendered, passed in as a node); Application replaces it
 * in place with the inline form, no modal. The active tab gets the brand
 * gradient underline riding the rail's hairline.
 */

const panelCls =
  "relative overflow-hidden rounded-[24px] border border-edge bg-panel px-6 py-8 sm:px-10 sm:py-10";

const Hairline = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-x-0 top-0 h-px"
    style={{
      background:
        "linear-gradient(90deg, transparent, rgba(255,45,120,.7), transparent)",
    }}
  />
);

export default function JobTabPanel({
  job,
  overview,
}: {
  job: CmsJob;
  overview: React.ReactNode;
}) {
  const { tab, setTab } = useJobTabs();
  const node = job.department.toUpperCase().replace(/\s+/g, "_");

  const tabs = [
    { key: "overview", label: "[ 01 // OVERVIEW ]" },
    { key: "application", label: "[ 02 // APPLICATION ]" },
  ] as const;

  return (
    <div>
      <div role="tablist" aria-label="Role file" className="flex items-end gap-7 border-b border-edge px-1">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`relative -mb-px cursor-pointer whitespace-nowrap border-none bg-transparent p-0 pb-3 pt-1 font-mono text-[11px] tracking-[0.16em] transition-colors ${
                active ? "text-magenta" : "text-faint hover:text-mist"
              }`}
            >
              {t.label}
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[linear-gradient(90deg,#FF5C2E,#FF2D78,#B06CFF)]"
                />
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" ? (
        <article className={`${panelCls} mt-6`}>
          <Hairline />
          <p className="m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
            {`// ROLE_BRIEF — ${node}.NODE`}
          </p>
          <div className="mt-7">{overview}</div>
          {/* footer: apply bottom-right, switches to the application tab */}
          <div className="mt-9 flex items-center border-t border-edge pt-7">
            <div className="ml-auto">
              <ApplyCta size="sm" />
            </div>
          </div>
        </article>
      ) : (
        <article className={`${panelCls} mt-6`}>
          <Hairline />
          <p className="m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
            {`// APPLICATION — ${node}.NODE`}
          </p>
          <div className="mt-7 max-w-[560px]">
            <ApplicationForm
              job={job}
              variant="panel"
              onDone={() => setTab("overview")}
            />
          </div>
        </article>
      )}
    </div>
  );
}
