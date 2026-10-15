"use client";

/**
 * The Setter Answers tab — the discovery call's backend, the way Client
 * Feedback is the survey's.
 *
 *   Calls   every call; what the creator said is locked, the staff columns
 *           (advisor, fit, next step) are editable dropdowns, and a creator
 *           opens to everything they said plus notes and the Fathom link
 *   Stats   where they come from, entity and payroll, banking, how they
 *           filed, income, what the next call reviews, fit and next step
 *
 * Everything is computed in the browser from the rows the page loaded — a
 * few hundred calls, so filters are instant. Edits save on change,
 * optimistically, and roll back with an error banner if the server says no,
 * the same contract as Client Feedback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Kpi, KpiRow, Segmented } from "@/components/portal/widgets/ui";
import { downloadFile } from "@/lib/print-html";
import { PERIODS, fmtDate, pctTxt } from "@/lib/feedback/analytics";
import {
  DATA_SCOPES,
  DEFAULT_FILTERS,
  LISTS,
  TEAM_KEYS,
  callsCsv,
  filterRecords,
  fmtMoney,
  inScope,
  median,
  short,
  type DataScope,
  type DiscoveryRecord,
  type DiscoveryTeam,
  type Filters,
  type PeriodId,
} from "@/lib/discovery/schema";
import { FilterSelect, ToolButton, copyText } from "@/components/portal/feedback/bits";
import CallsTab, { EmptyCalls } from "./CallsTab";
import StatsTab from "./StatsTab";

type Tab = "calls" | "stats";

const API = "/api/portal/setter-answers";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.message ?? `Request failed (${res.status})`);
  return body as T;
}

const pickTeam = (team: DiscoveryTeam, keys: (keyof DiscoveryTeam)[]) =>
  Object.fromEntries(keys.map((k) => [k, team[k]])) as Partial<DiscoveryTeam>;

export type SaveTeam = (id: string, patch: Partial<DiscoveryTeam>) => void;

export default function SetterAnswers({
  initialCalls,
  initialAdvisors,
  isAdmin,
  canRunCalls,
}: {
  initialCalls: DiscoveryRecord[];
  initialAdvisors: string[];
  /** Admins can delete a real call; everyone can delete practice ones. */
  isAdmin: boolean;
  /** Holds the Tax Strategy tab too, so a Start a call button makes sense. */
  canRunCalls: boolean;
}) {
  const [calls, setCalls] = useState(initialCalls);
  const [advisors, setAdvisors] = useState(initialAdvisors);
  const [tab, setTab] = useState<Tab>("calls");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** `${id}:${field}` while a write is in flight, so one control greys, not the row. */
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const callsRef = useRef(calls);
  useEffect(() => {
    callsRef.current = calls;
  }, [calls]);

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

  /** Only the patched keys are rolled back or taken from the server's copy, so two controls saving at once on the same row can't undo each other. */
  const saveTeam = useCallback<SaveTeam>(
    async (id, patch) => {
      const before = callsRef.current.find((r) => r.id === id);
      if (!before) return;
      const keys = Object.keys(patch) as (keyof DiscoveryTeam)[];
      const marks = keys.map((k) => `${id}:${k}`);
      setCalls((rows) => rows.map((r) => (r.id === id ? { ...r, team: { ...r.team, ...patch } } : r)));
      mark(marks, true);
      setError(null);
      try {
        const body = await call<{ call: DiscoveryRecord }>(`${API}/calls/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        const server = body.call;
        setCalls((rows) =>
          rows.map((r) =>
            r.id === id
              ? { ...r, team: { ...r.team, ...pickTeam(server.team, keys) }, teamUpdatedAt: server.teamUpdatedAt, teamUpdatedBy: server.teamUpdatedBy }
              : r,
          ),
        );
      } catch (e) {
        setCalls((rows) => rows.map((r) => (r.id === id ? { ...r, team: { ...r.team, ...pickTeam(before.team, keys) } } : r)));
        setError(e instanceof Error ? e.message : "Couldn’t save that change");
      } finally {
        mark(marks, false);
      }
    },
    [mark],
  );

  const deleteOne = useCallback(
    async (id: string) => {
      const r = callsRef.current.find((x) => x.id === id);
      if (!r) return;
      const ask = r.isTest
        ? "Delete this practice call? This can’t be undone."
        : `Delete ${r.call.creatorName || "this creator"}’s call? It comes out of every stat, and it can’t be undone.`;
      if (!window.confirm(ask)) return;
      setError(null);
      try {
        await call(`${API}/calls/${encodeURIComponent(id)}`, { method: "DELETE" });
        setCalls((rows) => rows.filter((x) => x.id !== id));
        setOpenId(null);
        flash(r.isTest ? "Practice call deleted" : "Call deleted");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t delete");
      }
    },
    [flash],
  );

  const clearTest = useCallback(async () => {
    if (!window.confirm("Delete every practice call?")) return;
    setError(null);
    try {
      await call(`${API}/test-data`, { method: "DELETE" });
      setCalls((rows) => rows.filter((r) => !r.isTest));
      setOpenId(null);
      flash("Practice calls cleared");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t clear practice calls");
    }
  }, [flash]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const body = await call<{ calls: DiscoveryRecord[]; advisors: string[] }>(API);
      setCalls(body.calls);
      setAdvisors(body.advisors);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t refresh");
    } finally {
      setRefreshing(false);
    }
  }, []);

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

  const fr = useMemo(() => filterRecords(calls, filters), [calls, filters]);
  const testCount = calls.filter((r) => r.isTest).length;
  const scoped = useMemo(() => calls.filter((r) => inScope(r, filters.data)), [calls, filters.data]);

  const everyone = useMemo(
    () => [...new Set([...advisors, ...calls.map((x) => x.team.advisor).filter((v): v is string => !!v)])].sort((a, b) => a.localeCompare(b)),
    [advisors, calls],
  );

  const kpis = useMemo(() => {
    const n = fr.length;
    const good = fr.filter((x) => x.team.fit === "good").length;
    const nf = fr.filter((x) => x.team.fit === "not_fit").length;
    const won = fr.filter((x) => x.team.nextStep === "won").length;
    const taxes = fr.map((x) => x.call.totalTax).filter((v): v is number => v != null);
    const src = new Map<string, number>();
    for (const x of fr) if (x.call.source) src.set(x.call.source, (src.get(x.call.source) ?? 0) + 1);
    const top = [...src].sort((a, b) => b[1] - a[1])[0];
    const ty = fr[0]?.call.taxYearAsked;
    return { n, good, nf, won, med: median(taxes), taxed: taxes.length, top, ty };
  }, [fr]);

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setOpenId(null);
  };

  const today = () => new Date().toISOString().slice(0, 10);
  const scopeWord = filters.data === "test" ? "practice only" : filters.data === "all" ? "real + practice" : "real calls";

  return (
    <div className="space-y-5">
      <KpiRow cols={3}>
        <Kpi label="Calls" value={kpis.n} sub={scopeWord} />
        <Kpi label="Good fit" value={kpis.good} tone="pos" sub={`${pctTxt(kpis.good, kpis.n)} of calls`} />
        <Kpi label="Not a fit" value={kpis.nf} tone={kpis.nf ? "neg" : "plain"} sub={`${pctTxt(kpis.nf, kpis.n)} of calls`} />
        <Kpi label="Signed" value={kpis.won} sub={`${pctTxt(kpis.won, kpis.n)} close rate`} />
        <Kpi
          label={`Median ${kpis.ty ?? ""} tax`.replace("  ", " ")}
          value={kpis.med == null ? "–" : fmtMoney(kpis.med)}
          sub={`${kpis.taxed} with a number`}
        />
        <Kpi label="Top source" value={kpis.top ? short("source", kpis.top[0]) : "–"} sub={kpis.top ? `${kpis.top[1]} call${kpis.top[1] === 1 ? "" : "s"}` : "no calls yet"} />
      </KpiRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={(v) => {
            setTab(v);
            setOpenId(null);
          }}
          ariaLabel="Setter answers view"
          options={[
            {
              value: "calls",
              label: (
                <>
                  Calls<span className="ml-1.5 opacity-75">{fr.length}</span>
                </>
              ),
            },
            { value: "stats", label: "Stats" },
          ]}
        />
        <input
          type="search"
          value={filters.q}
          placeholder="Search names, referrers, notes…"
          aria-label="Search calls"
          onChange={(e) => setF("q", e.target.value)}
          className="w-full max-w-[280px] rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <FilterSelect label="Called" value={filters.period} width="w-[150px]" onChange={(v) => setF("period", v as PeriodId)}>
          {PERIODS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Advisor" value={filters.advisor} width="w-[160px]" onChange={(v) => setF("advisor", v)}>
          <option value="">Everyone</option>
          {everyone.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Fit" value={filters.fit} width="w-[140px]" onChange={(v) => setF("fit", v)}>
          <option value="">Any</option>
          {LISTS.fit.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
          <option value="_none">Not set</option>
        </FilterSelect>
        <FilterSelect label="Data" value={filters.data} width="w-[150px]" onChange={(v) => setF("data", v as DataScope)}>
          {DATA_SCOPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </FilterSelect>
        <ToolButton
          disabled={!fr.length}
          onClick={() => void copy(callsCsv(fr), "CSV", `setter-answers-${today()}.csv`)}
          title="Every call the filters select, every column, ready to paste into a sheet"
        >
          ↓ Copy CSV ({fr.length})
        </ToolButton>
        {testCount ? (
          <ToolButton danger onClick={() => void clearTest()}>
            Clear practice calls ({testCount})
          </ToolButton>
        ) : null}
        <ToolButton onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </ToolButton>
        {canRunCalls ? (
          <a
            href="/discovery-call"
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer whitespace-nowrap rounded-[10px] border border-magenta/60 bg-transparent px-3 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-magenta no-underline transition-colors duration-150 hover:bg-magenta/10"
          >
            Start a call ↗
          </a>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-[10px] border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-danger">
          {error}
        </div>
      ) : null}

      <section>
        {tab === "calls" ? (
          <CallsTab
            rows={fr}
            anyAtAll={scoped.length > 0}
            hiddenPractice={filters.data === "real" && testCount > 0}
            advisors={everyone}
            openId={openId}
            onToggleOpen={(id) => setOpenId((o) => (o === id ? null : id))}
            saveTeam={saveTeam}
            saving={busy}
            canDeleteReal={isAdmin}
            onDelete={(id) => void deleteOne(id)}
          />
        ) : fr.length ? (
          <StatsTab rows={fr} />
        ) : (
          <EmptyCalls anyAtAll={scoped.length > 0} hiddenPractice={filters.data === "real" && testCount > 0} />
        )}
      </section>

      <p className="m-0 px-0.5 text-[12px] text-dusk">
        {TEAM_KEYS.length ? "Advisor, fit, next step, notes and the Fathom link save as you change them. " : ""}
        {fr.length ? `Showing ${fr.length} of ${scoped.length} ${scopeWord}` : ""}
        {fr.length && fr[0].submittedAt ? ` · newest ${fmtDate(fr[0].submittedAt)}` : ""}
      </p>

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
