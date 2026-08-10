"use client";

import { useMemo, useState } from "react";
import { matchesQuery } from "@/lib/tools-hub/catalog";
import type { ToolDepartment, ToolEntry, ToolsHubCatalog } from "@/lib/tools-hub/types";
import { Disclaimer, Mono } from "@/components/portal/widgets/ui";
import CatalogEditor from "./CatalogEditor";
import ToolLogo from "./ToolLogo";
import { useHubPrefs } from "./prefs";

/**
 * The Tools Hub: every tool the team uses, grouped by department.
 *
 * Three things are separate on purpose and shouldn't be conflated:
 *
 *  - The CATALOG is shared and admin-owned. It arrives server-rendered and only
 *    changes when an admin saves the editor.
 *  - Which departments a person shows, and which sections they've collapsed, is
 *    a per-browser preference in localStorage (see prefs.ts).
 *  - SEARCH spans every department, including ones the pills have switched off.
 *    A search that silently skips a department you hid is a search that lies —
 *    so a hidden department that matches surfaces with a "hidden" marker on its
 *    header, which also explains why it appeared.
 *
 * Sections open by default. The prototype this came from started them all
 * collapsed to look compact, but the page's entire job is "find the tool and
 * click it", and a screen of four headings does that job badly. Collapse state
 * persists, so anyone who prefers compact gets it after one click.
 */

const buttonCls =
  "inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-edge-mid px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk transition-colors duration-150 hover:border-edge-bright hover:text-fog";

export default function ToolsHub({
  initialCatalog,
  userId,
  isAdmin,
}: {
  initialCatalog: ToolsHubCatalog;
  userId: string;
  isAdmin: boolean;
}) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const { hidden, collapsed, toggleDepartment, toggleSection, setAllCollapsed } =
    useHubPrefs(userId);

  const searching = query.trim() !== "";

  const byDepartment = useMemo(() => {
    const map = new Map<string, ToolEntry[]>();
    for (const d of catalog.departments) map.set(d.id, []);
    for (const t of catalog.tools) map.get(t.department)?.push(t);
    return map;
  }, [catalog]);

  const sections = useMemo(
    () =>
      catalog.departments
        .map((department) => ({
          department,
          tools: (byDepartment.get(department.id) ?? []).filter((t) =>
            matchesQuery(t, query),
          ),
        }))
        .filter(({ department, tools }) =>
          searching ? tools.length > 0 : !hidden.has(department.id),
        ),
    [catalog.departments, byDepartment, query, searching, hidden],
  );

  const shownIds = sections.map((s) => s.department.id);
  const allOpen = shownIds.length > 0 && shownIds.every((id) => !collapsed.has(id));
  const hits = sections.reduce((n, s) => n + s.tools.length, 0);

  /** Returns an error message, or null when the save landed. */
  const saveCatalog = async (next: ToolsHubCatalog): Promise<string | null> => {
    try {
      const res = await fetch("/api/portal/tools-hub", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog: next }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) return data?.message || "Couldn’t save — try again.";
      // Adopt the server's sanitized copy rather than the local draft: it may
      // have dropped a URL it wouldn't accept or rehomed an orphaned tool, and
      // the screen should show what was actually stored.
      setCatalog(data.catalog);
      return null;
    } catch {
      return "Couldn’t reach the server — try again.";
    }
  };

  if (editing) {
    return (
      <CatalogEditor
        catalog={catalog}
        onSave={saveCatalog}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[400px]">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dusk"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, vendor or description…"
            aria-label="Search tools"
            autoComplete="off"
            className="w-full rounded-[10px] border border-edge-mid bg-panel-2 py-2.5 pl-9 pr-3 font-body text-[14px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-dusk focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Nothing to expand while a search is forcing every section open. */}
          {searching ? null : (
            <button
              type="button"
              onClick={() => setAllCollapsed(shownIds, allOpen)}
              className={buttonCls}
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
          {isAdmin ? (
            <button type="button" onClick={() => setEditing(true)} className={buttonCls}>
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[13px] w-[13px]"
              >
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Edit tools
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-edge pb-5">
        <Mono className="text-faint">Departments</Mono>
        <div className="flex flex-wrap gap-2">
          {catalog.departments.map((d) => {
            const on = !hidden.has(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDepartment(d.id)}
                title={on ? "Showing — click to hide" : "Hidden — click to show"}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 font-body text-[12.5px] transition-colors duration-150 ${
                  on
                    ? "border-edge-bright bg-white/[0.05] text-fog"
                    : "border-edge text-dusk hover:border-edge-mid hover:text-muted"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-[7px] w-[7px] flex-none rounded-full ${
                    on ? "bg-magenta" : "border border-edge-bright"
                  }`}
                />
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {searching ? (
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[1.2px] text-dusk">
          {hits} {hits === 1 ? "tool" : "tools"} matching “{query.trim()}”
        </p>
      ) : null}

      <div className="mt-5 space-y-3">
        {sections.map(({ department, tools }) => (
          <Section
            key={department.id}
            department={department}
            tools={tools}
            open={searching || !collapsed.has(department.id)}
            // A forced-open search result has nothing to toggle.
            onToggle={searching ? undefined : () => toggleSection(department.id)}
            markHidden={searching && hidden.has(department.id)}
          />
        ))}

        {sections.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-edge-mid bg-white/[0.02] px-6 py-12 text-center text-[13px] text-dusk">
            {searching
              ? `Nothing matches “${query.trim()}”.`
              : "Every department is switched off — turn one back on above."}
          </div>
        ) : null}
      </div>

      {/* No mailto here on purpose — PortalShell already closes every page with
          one, and two "email otavio" lines stacked is just noise. This one's
          job is to name the mechanism. */}
      <Disclaimer>
        Missing a tool, a department, or a link that&rsquo;s gone stale? An admin
        can add or fix it from Edit tools, and the change lands for the whole
        team at once.
      </Disclaimer>
    </>
  );
}

/* ─────────────────────────── one department ─────────────────────────── */

function Section({
  department,
  tools,
  open,
  onToggle,
  markHidden,
}: {
  department: ToolDepartment;
  tools: ToolEntry[];
  open: boolean;
  /** Absent while searching, when the section is pinned open. */
  onToggle?: () => void;
  /** This department's pill is off; it's only here because a search matched. */
  markHidden: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-edge bg-panel">
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 ${
          onToggle ? "cursor-pointer hover:bg-white/[0.025]" : "cursor-default"
        } ${open ? "border-b border-edge" : ""}`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-[13px] w-[13px] flex-none transition-transform duration-200 ${
            open ? "rotate-90 text-magenta" : "text-dusk"
          }`}
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        <span className="flex-1 font-display text-[15px] font-semibold text-fog">
          {department.label}
        </span>
        {markHidden ? (
          <span className="flex-none" title="You have this department switched off">
            <Mono className="text-faint">hidden</Mono>
          </span>
        ) : null}
        <span className="flex-none rounded-full border border-edge px-2 py-0.5 font-mono text-[10.5px] tabular-nums text-dusk">
          {tools.length}
        </span>
      </button>

      {open ? (
        <div className="p-4">
          {tools.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-3">
              {tools.map((tool) => (
                <Card key={tool.id} tool={tool} />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center font-mono text-[11.5px] uppercase tracking-[1px] text-faint">
              No tools in this department yet
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ─────────────────────────── one tool ─────────────────────────── */

function Card({ tool }: { tool: ToolEntry }) {
  return (
    <article className="flex flex-col rounded-[16px] border border-edge bg-white/[0.02] p-4 transition-colors duration-150 hover:border-edge-mid hover:bg-white/[0.04]">
      <ToolLogo tool={tool} />

      <h3 className="mt-3.5 font-display text-[15px] font-semibold leading-tight text-fog">
        {tool.name}
      </h3>
      <Mono className="mt-1 block text-faint">{tool.vendor}</Mono>

      <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted">
        {tool.description}
      </p>

      <div className="mt-4 flex items-center gap-3.5">
        <a
          href={tool.appUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${tool.name}`}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-magenta/35 bg-magenta/[0.08] px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.8px] text-magenta no-underline transition-colors duration-150 hover:border-magenta hover:bg-magenta hover:text-white"
        >
          Open
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[11px] w-[11px]"
          >
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>

        {tool.docsUrl ? (
          <a
            href={tool.docsUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${tool.name} SOP`}
            className="text-[12.5px] text-dusk underline decoration-white/15 underline-offset-[3px] transition-colors duration-150 hover:text-fog"
          >
            SOP
          </a>
        ) : null}
      </div>
    </article>
  );
}
