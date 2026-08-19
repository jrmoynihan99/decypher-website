"use client";

/**
 * The Applications → Pipeline page: what recruiting decided about each
 * applicant, and the counts that fall out of those decisions.
 *
 * ONE COLLECTION, TWO HALVES. This is the same `jobApplications` documents the
 * Inbox lists — not a copy, not a second table. The Inbox renders what the
 * applicant sent; this renders the `pipeline` map next to it. That's why
 * deleting from either place removes the person from both, and why the hire
 * count can never disagree with the application count: they're passes over one
 * array.
 *
 * Everything saves on change. No Save button — the same contract as the sales
 * grid, for the same reason: this replaces a spreadsheet, and a spreadsheet
 * doesn't have one.
 *
 * SCOPE RULE: the date range applies to both views. The search box and the
 * stage filter narrow the TRACKER only — a filtered stats panel would be a
 * number that means something different every time you look at it.
 */

import { useMemo, useState } from "react";
import type { ApplicationRow } from "@/lib/application-store";
import {
  APPLICATION_LIST_ORDER,
  APPLICATION_LIST_TITLES,
  APPLICATION_OPEN_LISTS,
  isFit,
  isHired,
  isTriaged,
  offerPitched,
  roleSuggestions,
  type ApplicationList,
  type ApplicationOptionsConfig,
  type ApplicationPipeline as Pipeline,
} from "@/lib/applications/pipeline";
import { optionColorHex, optionKey, type OptionItem } from "@/lib/option-list";
import { OptionListEditor } from "@/components/portal/OptionListEditor";
import { DeleteCell, NotesCell, SelectCell } from "@/components/portal/sales/cells";
import {
  BarList,
  Funnel,
  Meter,
  MonthColumns,
  VIZ,
  type MonthDatum,
} from "@/components/portal/viz";
import {
  CogIcon,
  Kpi,
  KpiRow,
  Mono,
  Panel,
  Segmented,
} from "@/components/portal/widgets/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const percent = (n: number) => `${Math.round(n)}%`;
const rate = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);

/* ─────────────────────────── toolbar vocabulary ─────────────────────────── */

const RANGES = [
  { id: "all", label: "All time" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "ytd", label: "This year" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

/** Epoch ms before which a row is out of range. 0 means everything. */
function cutoffFor(range: RangeId): number {
  const now = new Date();
  if (range === "30d") return now.getTime() - 30 * 864e5;
  if (range === "90d") return now.getTime() - 90 * 864e5;
  if (range === "ytd") return new Date(now.getFullYear(), 0, 1).getTime();
  return 0;
}

/**
 * The stage filter, phrased as the questions someone actually opens this page
 * with. "Needs triage" is first after All because it's the working queue.
 */
const STAGES = [
  { id: "all", label: "All", test: () => true },
  { id: "untriaged", label: "Needs triage", test: (p: Pipeline) => !isTriaged(p) },
  { id: "fit", label: "A fit", test: (p: Pipeline) => isFit(p) },
  { id: "offers", label: "Offers out", test: (p: Pipeline) => offerPitched(p) },
  { id: "hired", label: "Hired", test: (p: Pipeline) => isHired(p) },
] as const;
type StageId = (typeof STAGES)[number]["id"];

/* ─────────────────────────── tallying ─────────────────────────── */

/**
 * Tally rows against a configured list: every configured key in list order
 * (labels and colours as edited), plus any stray keys found on rows appended
 * at the end — a retired-then-forgotten option still shows its history, in the
 * default hue, because it has no configured colour. Lifted from the sales
 * stats tab, which counts the same way.
 */
function tally(
  rows: ApplicationRow[],
  items: OptionItem[],
  pick: (p: Pipeline) => string | null,
) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r.pipeline);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const known = new Set(items.map((i) => i.key));
  const out = items.map((i) => ({
    key: i.key,
    label: i.label,
    value: counts.get(i.key) ?? 0,
    color: optionColorHex(i.color) ?? undefined,
  }));
  for (const [k, v] of counts) {
    if (!known.has(k)) out.push({ key: k, label: k, value: v, color: undefined });
  }
  return out;
}

/** Free-text tally — the applicant's own answers, which have no option list. */
function tallyText(rows: ApplicationRow[], pick: (r: ApplicationRow) => string) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = pick(r).trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({
    key: label,
    label,
    value,
  }));
}

/* ─────────────────────────── the page ─────────────────────────── */

export default function ApplicationPipeline({
  initialApplications,
  initialConfig,
}: {
  initialApplications: ApplicationRow[];
  initialConfig: ApplicationOptionsConfig;
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [config, setConfig] = useState(initialConfig);
  const [view, setView] = useState<"tracker" | "stats">("tracker");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [range, setRange] = useState<RangeId>("all");
  const [stage, setStage] = useState<StageId>("all");
  const [query, setQuery] = useState("");
  /** Ids with a write in flight — the row's controls disable while it saves. */
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  /* ── the two scopes ── */

  const inRange = useMemo(() => {
    const cutoff = cutoffFor(range);
    if (!cutoff) return applications;
    return applications.filter(
      (a) => a.createdAt && new Date(a.createdAt).getTime() >= cutoff,
    );
  }, [applications, range]);

  const rows = useMemo(() => {
    const test = STAGES.find((s) => s.id === stage)?.test ?? (() => true);
    const q = query.trim().toLowerCase();
    return inRange.filter((a) => {
      if (!test(a.pipeline)) return false;
      if (!q) return true;
      return [a.name, a.email, a.role, a.location, a.currentRole]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [inRange, stage, query]);

  /* ── writes ── */

  const mark = (id: string, on: boolean) =>
    setSaving((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /**
   * Save one field, optimistically. The row moves the instant it's clicked and
   * rolls back if the write fails — anything slower feels broken in a grid.
   */
  const patch = async (id: string, field: keyof Pipeline, value: string | null) => {
    const before = applications.find((a) => a.id === id)?.pipeline;
    if (!before) return;

    setError("");
    setApplications((list) =>
      list.map((a) =>
        a.id === id ? { ...a, pipeline: { ...a.pipeline, [field]: value } } : a,
      ),
    );
    mark(id, true);
    try {
      const res = await fetch(`/api/portal/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.message);
      // Take the server's copy — it re-derived the value from the live config.
      setApplications((list) =>
        list.map((a) => (a.id === id ? { ...a, pipeline: data.pipeline } : a)),
      );
    } catch (e) {
      setApplications((list) =>
        list.map((a) => (a.id === id ? { ...a, pipeline: before } : a)),
      );
      setError(e instanceof Error && e.message ? e.message : "Couldn’t save that.");
    }
    mark(id, false);
  };

  const remove = async (id: string) => {
    setError("");
    mark(id, true);
    try {
      const res = await fetch(`/api/portal/applications/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.message);
      setApplications((list) => list.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn’t delete that.");
    }
    mark(id, false);
  };

  const saveConfig = async (next: ApplicationOptionsConfig): Promise<boolean> => {
    setError("");
    try {
      const res = await fetch("/api/portal/applications/options", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.message);
      setConfig(data.config);
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn’t save the options.");
      return false;
    }
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/portal/applications");
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.message);
      setApplications(data.applications);
    } catch {
      setError("Couldn’t refresh — try again.");
    }
    setRefreshing(false);
  };

  /* ── options editor ── */

  if (optionsOpen) {
    return (
      <OptionsPanel
        config={config}
        applications={applications}
        onSave={saveConfig}
        onClose={() => setOptionsOpen(false)}
      />
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={setView}
          ariaLabel="Pipeline view"
          options={[
            { value: "tracker" as const, label: "Tracker" },
            { value: "stats" as const, label: "Stats" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            size="sm"
            value={range}
            onChange={setRange}
            ariaLabel="Date range"
            options={RANGES.map((r) => ({ value: r.id, label: r.label }))}
          />
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="cursor-pointer rounded-[10px] border border-edge-mid px-3 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk transition-colors duration-150 hover:border-edge-bright hover:text-fog disabled:opacity-40"
          >
            {refreshing ? "…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            title="Edit the roles and the labels"
            className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-edge-mid px-3 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk transition-colors duration-150 hover:border-edge-bright hover:text-fog"
          >
            <CogIcon />
            Options
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}

      {view === "tracker" ? (
        <Tracker
          rows={rows}
          total={inRange.length}
          config={config}
          stage={stage}
          onStage={setStage}
          query={query}
          onQuery={setQuery}
          saving={saving}
          onPatch={patch}
          onDelete={remove}
        />
      ) : (
        <Stats rows={inRange} config={config} range={range} />
      )}
    </>
  );
}

/* ─────────────────────────── tracker ─────────────────────────── */

const thCls =
  "whitespace-nowrap px-3 py-2.5 text-left font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint";

function Tracker({
  rows,
  total,
  config,
  stage,
  onStage,
  query,
  onQuery,
  saving,
  onPatch,
  onDelete,
}: {
  rows: ApplicationRow[];
  /** Everything in the date range, before the stage filter and the search. */
  total: number;
  config: ApplicationOptionsConfig;
  stage: StageId;
  onStage: (s: StageId) => void;
  query: string;
  onQuery: (q: string) => void;
  saving: Set<string>;
  onPatch: (id: string, field: keyof Pipeline, value: string | null) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          size="sm"
          value={stage}
          onChange={onStage}
          ariaLabel="Stage filter"
          options={STAGES.map((s) => ({ value: s.id, label: s.label }))}
        />
        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search name, email, role…"
            aria-label="Search applicants"
            className="w-[230px] rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[13px] text-fog outline-none transition-[border-color] duration-150 placeholder:text-faint focus:border-magenta"
          />
          <Mono className="whitespace-nowrap text-dusk">
            {rows.length} of {total}
          </Mono>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center text-sm text-dusk">
          {total === 0
            ? "No applications in this range yet."
            : "Nothing matches that filter."}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[18px] border border-edge">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="border-b border-edge bg-white/[0.02]">
                  <th className={thCls}>Received</th>
                  <th className={thCls}>Applicant</th>
                  <th className={thCls}>Applied for</th>
                  <th className={thCls}>Role</th>
                  <th className={thCls}>Fit</th>
                  <th className={thCls}>Offer</th>
                  <th className={thCls}>Outcome</th>
                  <th className={thCls}>Notes</th>
                  <th className={thCls} aria-label="Delete" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const busy = saving.has(a.id);
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-edge transition-colors duration-150 last:border-b-0 hover:bg-white/[0.02]"
                    >
                      {/* viewer-timezone timestamp — see LeadsTable */}
                      <td
                        suppressHydrationWarning
                        className="whitespace-nowrap px-3 py-2 font-body text-[12.5px] text-dusk"
                      >
                        {a.createdAt
                          ? new Date(a.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "2-digit",
                            })
                          : "—"}
                      </td>

                      <td className="px-3 py-2 font-body text-[13px]">
                        <div className="text-fog">{a.name || "—"}</div>
                        <a
                          href={`mailto:${a.email}`}
                          className="font-mono text-[11px] text-dusk underline decoration-white/20 underline-offset-2 hover:text-fog"
                        >
                          {a.email}
                        </a>
                      </td>

                      {/* What the job posting said — history, not an edit. */}
                      <td className="px-3 py-2 font-body text-[12.5px] text-mist">
                        {a.role || "—"}
                        {a.department ? (
                          <span className="ml-2 rounded-full border border-edge-mid px-1.5 py-px font-mono text-[9px] uppercase tracking-[1px] text-dusk">
                            {a.department}
                          </span>
                        ) : null}
                      </td>

                      <td className="px-3 py-2">
                        <SelectCell
                          value={a.pipeline.role}
                          items={config.role}
                          saving={busy}
                          placeholder={config.role.length ? "—" : "add roles in ⚙"}
                          title="The role they're being considered for"
                          onChange={(v) => onPatch(a.id, "role", v)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <SelectCell
                          value={a.pipeline.fit}
                          items={config.fit}
                          saving={busy}
                          onChange={(v) => onPatch(a.id, "fit", v)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <SelectCell
                          value={a.pipeline.offer}
                          items={config.offer}
                          saving={busy}
                          onChange={(v) => onPatch(a.id, "offer", v)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <SelectCell
                          value={a.pipeline.outcome}
                          items={config.outcome}
                          saving={busy}
                          onChange={(v) => onPatch(a.id, "outcome", v)}
                        />
                      </td>

                      <td className="px-3 py-2">
                        <NotesCell
                          value={a.pipeline.notes}
                          who={a.name || a.email}
                          saving={busy}
                          onChange={(v) => onPatch(a.id, "notes", v)}
                        />
                      </td>

                      <td className="px-3 py-2 text-right">
                        <DeleteCell
                          saving={busy}
                          label={`Delete ${a.name || a.email}'s application`}
                          onDelete={() => onDelete(a.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-dusk">
        Everything here saves as you pick it. Deleting removes the application
        and its resume permanently, from the Inbox too — it&rsquo;s how you
        clear out test submissions.
      </p>
    </>
  );
}

/* ─────────────────────────── stats ─────────────────────────── */

/**
 * The headline question the client asked for: how many people apply, and how
 * many we hire. Everything else here is the path between those two numbers.
 *
 * Counted in the browser over the rows already in memory, like the sales stats
 * tab — every figure is one pass over an array, so the numbers track the date
 * range instantly instead of round-tripping.
 */
function Stats({
  rows,
  config,
  range,
}: {
  rows: ApplicationRow[];
  config: ApplicationOptionsConfig;
  range: RangeId;
}) {
  const s = useMemo(() => {
    const screened = rows.filter((r) => r.pipeline.fit !== null);
    const fits = rows.filter((r) => isFit(r.pipeline));
    const offers = rows.filter((r) => offerPitched(r.pipeline));
    const decided = rows.filter((r) => r.pipeline.outcome !== null);
    const hires = rows.filter((r) => isHired(r.pipeline));
    return {
      applied: rows.length,
      screened: screened.length,
      fits: fits.length,
      offers: offers.length,
      decided: decided.length,
      hires: hires.length,
      untriaged: rows.filter((r) => !isTriaged(r.pipeline)).length,
    };
  }, [rows]);

  const months = useMemo<MonthDatum[]>(() => {
    const m = new Map<string, MonthDatum>();
    for (const r of rows) {
      if (!r.createdAt) continue;
      const d = new Date(r.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      let hit = m.get(key);
      if (!hit) {
        hit = {
          key,
          short: MONTHS[d.getMonth()],
          full: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
          year: d.getFullYear(),
          month: d.getMonth(),
          total: 0,
          part: 0,
        };
        m.set(key, hit);
      }
      hit.total += 1;
      if (isHired(r.pipeline)) hit.part += 1;
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [rows]);

  /**
   * By role, counting the tracked role and falling back to the role they
   * applied for. Recruiting hasn't assigned a role to most rows on day one,
   * and a chart that showed "—" for all of them would be worse than useless;
   * the applied-for title is the honest answer until someone overrides it.
   */
  const byRole = useMemo(() => {
    const counts = new Map<string, { label: string; value: number; color?: string }>();
    for (const r of rows) {
      const tracked = r.pipeline.role
        ? config.role.find((i) => i.key === r.pipeline.role)
        : undefined;
      const key = tracked?.key ?? (r.role ? optionKey(r.role) : "");
      const label = tracked?.label ?? r.role;
      if (!key || !label) continue;
      const hit = counts.get(key);
      if (hit) hit.value += 1;
      else
        counts.set(key, {
          label,
          value: 1,
          color: optionColorHex(tracked?.color) ?? undefined,
        });
    }
    return [...counts.entries()].map(([key, v]) => ({ key, ...v }));
  }, [rows, config.role]);

  const rangeNote = RANGES.find((r) => r.id === range)?.label ?? "All time";

  return (
    <div className="mt-5 space-y-5">
      <KpiRow cols={4}>
        <Kpi
          label="Applied"
          value={s.applied.toLocaleString()}
          sub={rangeNote.toLowerCase()}
        />
        <Kpi label="A fit" value={s.fits.toLocaleString()} sub={`${s.screened} screened`} />
        <Kpi
          label="Offers pitched"
          value={s.offers.toLocaleString()}
          tone="brand"
          sub={`${percent(rate(s.offers, s.fits))} of the fits`}
        />
        <Kpi
          label="Hired"
          value={s.hires.toLocaleString()}
          tone="pos"
          sub={`${percent(rate(s.hires, s.applied))} of everyone who applied`}
        />
      </KpiRow>

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Applications & hires by month">
          <MonthColumns
            data={months}
            totalLabel="Applied"
            partLabel="Hired"
            emptyLabel="No applications in this range."
          />
        </Panel>

        <Panel title="From application to hire">
          <Funnel
            stages={[
              { label: "Applied", value: s.applied },
              { label: "Screened", value: s.screened, note: `${s.untriaged} still untriaged` },
              { label: "A fit", value: s.fits },
              { label: "Offer pitched", value: s.offers },
              { label: "Hired", value: s.hires },
            ]}
          />
        </Panel>
      </div>

      <div className="grid items-start gap-5 sm:grid-cols-3">
        <Panel title="Fit rate">
          <Meter label="Of those screened" value={s.fits} of={s.screened} />
        </Panel>
        <Panel title="Offer rate">
          <Meter label="Of the fits" value={s.offers} of={s.fits} />
        </Panel>
        <Panel title="Hire rate">
          <Meter
            label="Of everyone who applied"
            value={s.hires}
            of={s.applied}
            tone={VIZ.series2}
          />
        </Panel>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title="By role">
          <BarList data={byRole} total={s.applied} emptyLabel="No roles on these rows." />
        </Panel>
        <Panel title="Fit">
          <BarList
            data={tally(rows, config.fit, (p) => p.fit)}
            total={s.applied}
            emptyLabel="Nobody screened in this range."
          />
        </Panel>
        <Panel title="Offers">
          <BarList
            data={tally(rows, config.offer, (p) => p.offer)}
            total={s.applied}
            emptyLabel="No offers in this range."
          />
        </Panel>
        <Panel title="Outcome">
          <BarList
            data={tally(rows, config.outcome, (p) => p.outcome)}
            total={s.applied}
            emptyLabel="Nothing decided in this range."
          />
        </Panel>
        <Panel title="Where they heard about us" className="lg:col-span-2">
          <BarList
            data={tallyText(rows, (r) => HEARD_ABOUT[r.heardAbout] ?? r.heardAbout)}
            total={s.applied}
            emptyLabel="No sources recorded."
          />
        </Panel>
      </div>
    </div>
  );
}

/** The form stores slugs; show the labels it displayed. Mirrors ApplicationsTable. */
const HEARD_ABOUT: Record<string, string> = {
  referral: "Referral",
  social: "Social media",
  "job-board": "Job board",
  other: "Other",
};

/* ─────────────────────────── options ─────────────────────────── */

/**
 * The ⚙ panel. Roles are the list that matters — add, rename, recolour,
 * reorder and retire freely. The other three can be relabelled and recoloured
 * but not added to or removed from: "hired" is what the hire count counts.
 */
function OptionsPanel({
  config,
  applications,
  onSave,
  onClose,
}: {
  config: ApplicationOptionsConfig;
  applications: ApplicationRow[];
  onSave: (next: ApplicationOptionsConfig) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ApplicationOptionsConfig>(() =>
    JSON.parse(JSON.stringify(config)),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(
    () => roleSuggestions(draft.role, applications.map((a) => a.role)),
    [draft.role, applications],
  );

  const edit = (list: ApplicationList, next: OptionItem[]) => {
    setDraft((d) => ({ ...d, [list]: next }));
    setDirty(true);
  };

  const saveAll = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) {
      setDirty(false);
      onClose();
    }
  };

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted">
          The roles you&rsquo;re hiring for are yours to edit — add, rename,
          recolour, reorder, retire. A colour follows its option everywhere, the
          tracker cell and the Stats bars. Retiring hides an option from new
          picks; applicants already marked with it keep it. Fit, Offer and
          Outcome can be relabelled and recoloured but not added to or removed:
          the counts on the Stats view are tied to those entries.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[10px] border border-edge-mid px-4 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk hover:text-fog"
          >
            {dirty ? "Discard" : "Close"}
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={saveAll}
            className="cursor-pointer rounded-[10px] bg-magenta px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.8px] text-white transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {APPLICATION_LIST_ORDER.map((list) => (
          <OptionListEditor
            key={list}
            title={APPLICATION_LIST_TITLES[list]}
            items={draft[list]}
            open={(APPLICATION_OPEN_LISTS as readonly string[]).includes(list)}
            onChange={(next) => edit(list, next)}
            suggestions={list === "role" ? suggestions : []}
            suggestionsLabel="Roles people applied for"
          />
        ))}
      </div>
    </div>
  );
}
