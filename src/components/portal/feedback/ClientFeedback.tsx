"use client";

/**
 * The Client Feedback tab — the survey prototype's backend, moved into the
 * portal. Onboarding, bookkeeping and tax responses, scored per team.
 *
 *   Responses          every submission; what the client said is locked,
 *                      the team columns are editable dropdowns
 *   Stats              distributions, by-owner splits, the reasons
 *   Monthly scorecard  the advisor's core numbers by month and by person
 *   Follow-ups         the tasks at-risk responses created
 *   Send a link        a link for one client, the TaxDome templates, previews
 *   Team & setup       dropdown lists, the founder on follow-ups, the rules
 *
 * Everything is computed in the browser from the rows the page loaded (see
 * lib/feedback/analytics) — a few hundred submissions, so filters are instant.
 * Edits save on change, optimistically, and roll back with an error banner
 * if the server says no, the same contract as the Sales Flow grid.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Kpi, KpiRow, Segmented } from "@/components/portal/widgets/ui";
import { downloadFile } from "@/lib/print-html";
import {
  PACKAGES,
  TEAMS,
  TEAM_ROLES,
  type FeedbackResponse,
  type FeedbackSettings,
  type FeedbackTask,
  type TeamFields,
  type TeamKey,
} from "@/lib/feedback/schema";
import {
  DATA_SCOPES,
  DEFAULT_FILTERS,
  PERIODS,
  ROUTES,
  core,
  filterRows,
  fmt1,
  inScope,
  pctTxt,
  responsesCsv,
  scorecardCsv,
  teamRows,
  type DataScope,
  type Filters,
  type PeriodId,
  type RouteId,
} from "@/lib/feedback/analytics";
import { FilterSelect, ToolButton, copyText } from "./bits";
import ResponsesTab, { EmptyResponses } from "./ResponsesTab";
import StatsTab from "./StatsTab";
import ScorecardTab, { type ScorecardState } from "./ScorecardTab";
import FollowupsTab from "./FollowupsTab";
import LinksTab from "./LinksTab";
import SetupTab from "./SetupTab";

type Tab = "responses" | "stats" | "scorecard" | "followups" | "links" | "setup";

const SETTINGS_DEBOUNCE_MS = 600;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.message ?? `Request failed (${res.status})`);
  return body as T;
}

const pickTeam = (team: TeamFields, keys: (keyof TeamFields)[]) =>
  Object.fromEntries(keys.map((k) => [k, team[k]])) as Partial<TeamFields>;

export default function ClientFeedback({
  initialResponses,
  initialTasks,
  initialSettings,
  isAdmin,
}: {
  initialResponses: FeedbackResponse[];
  initialTasks: FeedbackTask[];
  initialSettings: FeedbackSettings;
  /** Admins can delete a client's real response; everyone can delete test ones. */
  isAdmin: boolean;
}) {
  const [responses, setResponses] = useState(initialResponses);
  const [tasks, setTasks] = useState(initialTasks);
  const [settings, setSettings] = useState(initialSettings);
  const [tab, setTab] = useState<Tab>("responses");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sc, setSc] = useState<ScorecardState>({ team: "onboarding", by: "onboarding_team_lead_id", month: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** `${id}:${field}` while a write is in flight, so one control greys, not the row. */
  const [saving, setSaving] = useState<Set<string>>(new Set());

  /* Latest rows for the rollbacks, without making the save callbacks depend on them. */
  const responsesRef = useRef(responses);
  const tasksRef = useRef(tasks);
  useEffect(() => {
    responsesRef.current = responses;
    tasksRef.current = tasks;
  }, [responses, tasks]);

  const toastTimer = useRef(0);
  const flash = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const mark = useCallback(
    (keys: string[], on: boolean) =>
      setSaving((s) => {
        const next = new Set(s);
        for (const k of keys) {
          if (on) next.add(k);
          else next.delete(k);
        }
        return next;
      }),
    [],
  );
  const busy = useCallback((id: string, field: string) => saving.has(`${id}:${field}`), [saving]);

  /* ── saves ── */

  /**
   * Team fields on one response. Only the patched keys are rolled back or
   * taken from the server's copy, so two dropdowns saving at once on the same
   * row can't undo each other.
   */
  const saveTeam = useCallback(async (id: string, patch: Partial<TeamFields>) => {
    const before = responsesRef.current.find((r) => r.id === id);
    if (!before) return;
    const keys = Object.keys(patch) as (keyof TeamFields)[];
    const marks = keys.map((k) => `${id}:${k}`);
    setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, team: { ...r.team, ...patch } } : r)));
    mark(marks, true);
    setError(null);
    try {
      const body = await call<{ response: FeedbackResponse }>(`/api/portal/feedback/responses/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const server = body.response;
      setResponses((rows) =>
        rows.map((r) =>
          r.id === id
            ? {
                ...r,
                team: { ...r.team, ...pickTeam(server.team, keys) },
                team_updated_at: server.team_updated_at,
                team_updated_by: server.team_updated_by,
              }
            : r,
        ),
      );
    } catch (e) {
      setResponses((rows) =>
        rows.map((r) => (r.id === id ? { ...r, team: { ...r.team, ...pickTeam(before.team, keys) } } : r)),
      );
      setError(e instanceof Error ? e.message : "Couldn’t save that change");
    } finally {
      mark(marks, false);
    }
  }, [mark]);

  /** One response and its follow-ups. The server decides who may (admins, for a real one). */
  const deleteOne = useCallback(
    async (id: string) => {
      const r = responsesRef.current.find((x) => x.id === id);
      if (!r) return;
      const ask = r.is_test
        ? "Delete this test response? This can’t be undone."
        : `Delete ${r.client_name || "this client"}’s response and its follow-ups? It comes out of every stat and the scorecard, and it can’t be undone.`;
      if (!window.confirm(ask)) return;
      setError(null);
      try {
        await call(`/api/portal/feedback/responses/${encodeURIComponent(id)}`, { method: "DELETE" });
        setResponses((rows) => rows.filter((x) => x.id !== id));
        setTasks((ts) => ts.filter((t) => t.survey_id !== id));
        setOpenId(null);
        flash(r.is_test ? "Test response deleted" : "Response deleted");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t delete");
      }
    },
    [flash],
  );

  const clearTest = useCallback(async () => {
    if (!window.confirm("Delete every test response and its follow-ups?")) return;
    setError(null);
    try {
      await call("/api/portal/feedback/test-data", { method: "DELETE" });
      setResponses((rows) => rows.filter((r) => !r.is_test));
      setTasks((ts) => ts.filter((t) => !t.is_test));
      setOpenId(null);
      flash("Test data cleared");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t clear test data");
    }
  }, [flash]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const body = await call<{ responses: FeedbackResponse[]; tasks: FeedbackTask[] }>("/api/portal/feedback");
      setResponses(body.responses);
      setTasks(body.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t refresh");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const toggleTask = useCallback(async (t: FeedbackTask) => {
    const status = t.status === "done" ? "open" : "done";
    const before = tasksRef.current.find((x) => x.task_id === t.task_id);
    if (!before) return;
    setTasks((ts) => ts.map((x) => (x.task_id === t.task_id ? { ...x, status } : x)));
    mark([`${t.task_id}:status`], true);
    setError(null);
    try {
      const body = await call<{ task: FeedbackTask }>(`/api/portal/feedback/tasks/${encodeURIComponent(t.task_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setTasks((ts) => ts.map((x) => (x.task_id === t.task_id ? body.task : x)));
    } catch (e) {
      setTasks((ts) => ts.map((x) => (x.task_id === t.task_id ? before : x)));
      setError(e instanceof Error ? e.message : "Couldn’t update the follow-up");
    } finally {
      mark([`${t.task_id}:status`], false);
    }
  }, [mark]);

  /* Settings: lists save at once; typed fields wait out the typing. A failure
     puts back the last copy the server accepted. */
  const savedSettings = useRef(initialSettings);
  const settingsTimer = useRef(0);
  useEffect(() => () => clearTimeout(settingsTimer.current), []);
  const putSettings = useCallback(async (next: FeedbackSettings, adopt: boolean) => {
    try {
      const body = await call<{ settings: FeedbackSettings }>("/api/portal/feedback/settings", {
        method: "PUT",
        body: JSON.stringify({ settings: next }),
      });
      savedSettings.current = body.settings;
      // Not while someone's typing: the server trims, and adopting its copy
      // mid-word would eat their trailing space.
      if (adopt) setSettings(body.settings);
    } catch (e) {
      setSettings(savedSettings.current);
      setError(e instanceof Error ? `Settings didn’t save: ${e.message}` : "Settings didn’t save");
    }
  }, []);
  const updateSettings = useCallback(
    (next: FeedbackSettings, debounce = false) => {
      setSettings(next);
      setError(null);
      clearTimeout(settingsTimer.current);
      if (debounce) settingsTimer.current = window.setTimeout(() => void putSettings(next, false), SETTINGS_DEBOUNCE_MS);
      else void putSettings(next, true);
    },
    [putSettings],
  );

  const copy = useCallback(
    async (text: string, label: string, filename?: string) => {
      if (await copyText(text)) return flash(`${label} copied`);
      if (filename) {
        downloadFile(text, filename, "text/csv;charset=utf-8");
        flash(`Clipboard blocked, so the ${label.toLowerCase()} downloaded instead`);
      } else flash("Select and copy it by hand");
    },
    [flash],
  );

  /* ── what's on screen ── */

  const fr = useMemo(() => filterRows(responses, filters), [responses, filters]);
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const testCount = responses.filter((r) => r.is_test).length;
  const analysis = tab === "responses" || tab === "stats";

  const kpis = useMemo(() => {
    const tr = teamRows(fr);
    const by = (t: TeamKey) => core(tr.filter((r) => r.team === t));
    return { onboarding: by("onboarding"), bookkeeping: by("bookkeeping"), tax: by("tax"), risk: fr.filter((x) => x.at_risk_flag).length };
  }, [fr]);

  const teamCounts = useMemo(() => {
    const base = responses.filter((x) => inScope(x, filters.data));
    const n = (t: TeamKey) => base.filter((x) => x.teams.includes(t)).length;
    return { all: base.length, onboarding: n("onboarding"), bookkeeping: n("bookkeeping"), tax: n("tax") };
  }, [responses, filters.data]);

  const everyone = useMemo(
    () =>
      [
        ...new Set([
          ...TEAM_ROLES.flatMap((k) => settings.lists[k]),
          ...responses.flatMap((x) => TEAM_ROLES.map((k) => x.team[k])).filter((v): v is string => !!v),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    [settings, responses],
  );

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setOpenId(null);
  };

  const today = () => new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <KpiRow cols={4}>
        {(["onboarding", "bookkeeping", "tax"] as const).map((t) => (
          <TeamKpi key={t} label={TEAMS[t].label} c={kpis[t]} />
        ))}
        <Kpi
          label="At risk"
          value={kpis.risk}
          tone={kpis.risk ? "neg" : "plain"}
          sub={`${pctTxt(kpis.risk, fr.length)} of responses · ${openTasks} open follow-up${openTasks === 1 ? "" : "s"}`}
        />
      </KpiRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <Segmented<Tab>
            value={tab}
            onChange={(v) => {
              setTab(v);
              setOpenId(null);
            }}
            ariaLabel="Client feedback view"
            options={[
              { value: "responses", label: <Count label="Responses" n={fr.length} /> },
              { value: "stats", label: "Stats" },
              { value: "scorecard", label: "Monthly scorecard" },
              { value: "followups", label: <Count label="Follow-ups" n={openTasks || null} /> },
              { value: "links", label: "Send a link" },
              { value: "setup", label: "Team & setup" },
            ]}
          />
        </div>
        {analysis ? (
          <input
            type="search"
            value={filters.q}
            placeholder="Search name, client ID, comments…"
            aria-label="Search responses"
            onChange={(e) => setF("q", e.target.value)}
            className="w-full max-w-[280px] rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]"
          />
        ) : null}
      </div>

      {analysis ? (
        <>
          <Segmented<TeamKey | "">
            size="sm"
            value={filters.team}
            onChange={(v) => setF("team", v)}
            ariaLabel="Which team"
            options={[
              { value: "", label: <Count label="All" n={teamCounts.all} /> },
              { value: "onboarding", label: <Count label="Onboarding" n={teamCounts.onboarding} /> },
              { value: "bookkeeping", label: <Count label="Bookkeeping" n={teamCounts.bookkeeping} /> },
              { value: "tax", label: <Count label="Tax" n={teamCounts.tax} /> },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <FilterSelect label="Submitted" value={filters.period} width="w-[150px]" onChange={(v) => setF("period", v as PeriodId)}>
              {PERIODS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Person" value={filters.person} width="w-[160px]" onChange={(v) => setF("person", v)}>
              <option value="">Everyone</option>
              {everyone.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Package" value={filters.pkg} width="w-[150px]" onChange={(v) => setF("pkg", v)}>
              <option value="">All packages</option>
              {PACKAGES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
              <option value="_none">Not set</option>
            </FilterSelect>
            <FilterSelect label="Route" value={filters.route} width="w-[200px]" onChange={(v) => setF("route", v as RouteId)}>
              {ROUTES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Data" value={filters.data} width="w-[140px]" onChange={(v) => setF("data", v as DataScope)}>
              {DATA_SCOPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </FilterSelect>
            <ToolButton
              disabled={!fr.length}
              onClick={() => void copy(responsesCsv(fr), "CSV", `client-feedback-${today()}.csv`)}
              title="Every response the filters select, every column, ready to paste into a sheet"
            >
              ↓ Copy CSV ({fr.length})
            </ToolButton>
            {testCount ? (
              <ToolButton danger onClick={() => void clearTest()}>
                Clear test data ({testCount})
              </ToolButton>
            ) : null}
            <ToolButton onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </ToolButton>
          </div>
        </>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-[10px] border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-danger">
          {error}
        </div>
      ) : null}

      <section>
        {tab === "responses" ? (
          <ResponsesTab
            rows={fr}
            anyAtAll={responses.length > 0}
            teamFilter={filters.team}
            settings={settings}
            openId={openId}
            onToggleOpen={(id) => setOpenId((o) => (o === id ? null : id))}
            saveTeam={(id, patch) => void saveTeam(id, patch)}
            saving={busy}
            canDeleteReal={isAdmin}
            onDelete={(id) => void deleteOne(id)}
            onGoSetup={() => setTab("setup")}
          />
        ) : tab === "stats" ? (
          fr.length ? (
            <StatsTab rows={fr} team={filters.team} />
          ) : (
            <EmptyResponses anyAtAll={responses.length > 0} />
          )
        ) : tab === "scorecard" ? (
          <ScorecardTab
            rows={responses}
            data={filters.data}
            sc={sc}
            onChange={setSc}
            onCopy={() => void copy(scorecardCsv(responses, filters.data), "Scorecard", `client-feedback-scorecard-${today()}.csv`)}
          />
        ) : tab === "followups" ? (
          <FollowupsTab
            tasks={tasks}
            responses={responses}
            escalation={settings.escalation}
            saving={(id) => busy(id, "status")}
            onToggle={(t) => void toggleTask(t)}
          />
        ) : tab === "links" ? (
          <LinksTab settings={settings} onChange={updateSettings} onCopy={(text, label) => void copy(text, label)} />
        ) : (
          <SetupTab settings={settings} onChange={updateSettings} flash={flash} />
        )}
      </section>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-fog px-4 py-2.5 font-body text-[13.5px] font-medium text-night shadow-[0_10px_30px_rgba(0,0,0,.3)]"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function Count({ label, n }: { label: string; n: number | null }) {
  return (
    <>
      {label}
      {n != null ? <span className="ml-1.5 opacity-75">{n}</span> : null}
    </>
  );
}

/** One team's CSAT and NPS side by side, in the KPI strip's own tile. */
function TeamKpi({ label, c }: { label: string; c: ReturnType<typeof core> }) {
  const csatCls = c.csat == null ? "text-fog" : c.csat >= 4 ? "text-teal" : c.csat < 3.5 ? "text-danger" : "text-tier-warn";
  const npsCls = c.nps == null ? "text-fog" : c.nps >= 30 ? "text-teal" : c.nps < 0 ? "text-danger" : "text-tier-warn";
  return (
    <div className="bg-panel px-4 py-3.5">
      <div className="flex justify-between gap-2 font-mono text-[10.5px] uppercase tracking-[1.2px] text-dusk">
        {label}
        <span className="normal-case tracking-[0.4px]">
          {c.n} response{c.n === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-1.5 flex gap-5">
        <div>
          <div className={`font-display text-[22px] font-bold tabular-nums ${csatCls}`}>{c.csat == null ? "–" : fmt1(c.csat)}</div>
          <div className="mt-0.5 text-[11px] text-dusk">CSAT of 5</div>
        </div>
        <div>
          <div className={`font-display text-[22px] font-bold tabular-nums ${npsCls}`}>{c.nps ?? "–"}</div>
          <div className="mt-0.5 text-[11px] text-dusk">NPS</div>
        </div>
      </div>
    </div>
  );
}
