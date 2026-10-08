/**
 * The portal's arithmetic over feedback responses: the filters, the advisor's
 * four core numbers, the monthly scorecard, the follow-up owner lookup and the
 * CSV exports. Pure functions over the rows already in the browser — the whole
 * history is a few hundred submissions, so every number tracks the filters
 * instantly instead of round-tripping.
 *
 * TEAM ROWS. The advisor's "tag each answer with team": one row per team per
 * submission. A client who answered bookkeeping and tax counts once for each,
 * and every per-team number (KPIs, stats, scorecard) is computed over these.
 */

import {
  TEAMS,
  TEAM_ROLES,
  LINK_ROLES,
  ROLE_LABELS,
  joinNames,
  teamFlags,
  teamScores,
  type FeedbackResponse,
  type FeedbackTask,
  type NpsBand,
  type TeamKey,
} from "./schema";
import type { TeamRole } from "./links";

/* ─────────────────────────────── team rows ─────────────────────────────── */

export type TeamRow = {
  id: string;
  team: TeamKey;
  x: FeedbackResponse;
  when: string;
  is_test: boolean;
  client_name: string;
  /** Who owns this team's work for the client, as the team map says now. */
  owner: string;
  roles: Record<TeamRole, string>;
  package: string;
  segment: string;
  csat: number | null;
  nps: number | null;
  band: NpsBand | null;
  /** The team's diagnostic: onboarding clarity, bookkeeping ease, tax clarity. */
  diag: number | null;
  reason: string;
  period: string;
  at_risk: boolean;
  happy: boolean;
};

export function teamRows(rows: FeedbackResponse[]): TeamRow[] {
  const out: TeamRow[] = [];
  for (const x of rows) {
    for (const t of x.teams) {
      const s = teamScores(x, t);
      const f = teamFlags(x, t);
      out.push({
        id: x.id,
        team: t,
        x,
        when: x.submitted_at ?? "",
        is_test: x.is_test,
        client_name: x.client_name,
        owner: x.team[TEAMS[t].owner] ?? "",
        roles: Object.fromEntries(TEAM_ROLES.map((r) => [r, x.team[r] ?? ""])) as Record<TeamRole, string>,
        package: x.team.package ?? "",
        segment: x.team.segment ?? "",
        csat: s.csat,
        nps: s.nps,
        band: f.band,
        diag: s.diag,
        reason: s.reason,
        period: t === "onboarding" ? "" : t === "bookkeeping" ? (x.bookkeeping_period ?? "") : (x.tax_year ?? ""),
        at_risk: f.atRisk,
        happy: f.happy,
      });
    }
  }
  return out;
}

/* ─────────────────────────────── numbers ─────────────────────────────── */

export function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export type Core = {
  /** Responses with an NPS answer — the NPS denominator. */
  n: number;
  csat: number | null;
  /** % promoters (9–10) minus % detractors (0–6), rounded. */
  nps: number | null;
  promPct: number | null;
  detPct: number | null;
  diag: number | null;
  risk: number;
};

/** The advisor's four core numbers, for any set of team rows. */
export function core(trs: TeamRow[]): Core {
  const n = trs.filter((r) => r.nps != null).length;
  const prom = trs.filter((r) => r.band === "promoter").length;
  const det = trs.filter((r) => r.band === "detractor").length;
  return {
    n,
    csat: mean(trs.map((r) => r.csat)),
    nps: n ? Math.round(((prom - det) / n) * 100) : null,
    promPct: n ? prom / n : null,
    detPct: n ? det / n : null,
    diag: mean(trs.map((r) => r.diag)),
    risk: trs.filter((r) => r.at_risk).length,
  };
}

export const fmt1 = (v: number | null | undefined) => (v == null ? "–" : (Math.round(v * 10) / 10).toFixed(1));
export const pctTxt = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
export const pctOf = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "–"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* ─────────────────────────────── filters ─────────────────────────────── */

export type PeriodId = "ytd" | "month" | "lastmonth" | "90" | "all";
export const PERIODS: [PeriodId, string][] = [
  ["ytd", "Year to date"],
  ["month", "This month"],
  ["lastmonth", "Last month"],
  ["90", "Last 90 days"],
  ["all", "All time"],
];

export type RouteId = "" | "at_risk" | "happy" | "promoter" | "detractor";
export const ROUTES: [RouteId, string][] = [
  ["", "All responses"],
  ["at_risk", "At risk (any team)"],
  ["happy", "Happy for review (all teams)"],
  ["promoter", "Has a promoter (9–10)"],
  ["detractor", "Has a detractor (0–6)"],
];

export type DataScope = "all" | "real" | "test";
export const DATA_SCOPES: [DataScope, string][] = [
  ["all", "Real + test"],
  ["real", "Real only"],
  ["test", "Test only"],
];

export type Filters = {
  period: PeriodId;
  team: TeamKey | "";
  person: string;
  /** A package key, "_none" for not set, "" for any. */
  pkg: string;
  route: RouteId;
  data: DataScope;
  q: string;
};

export const DEFAULT_FILTERS: Filters = { period: "ytd", team: "", person: "", pkg: "", route: "", data: "all", q: "" };

export function periodStart(p: PeriodId, now = new Date()): Date {
  if (p === "ytd") return new Date(now.getFullYear(), 0, 1);
  if (p === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === "lastmonth") return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  if (p === "90") return new Date(now.getTime() - 90 * 864e5);
  return new Date(0);
}

export function periodEnd(p: PeriodId, now = new Date()): Date {
  return p === "lastmonth" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(8.64e15);
}

export const inScope = (r: { is_test: boolean }, data: DataScope) =>
  data === "all" || (data === "real" ? !r.is_test : r.is_test);

/** Every toolbar filter, plus the search box. */
export function filterRows(rows: FeedbackResponse[], F: Filters, now = new Date()): FeedbackResponse[] {
  const from = periodStart(F.period, now);
  const to = periodEnd(F.period, now);
  const q = F.q.trim().toLowerCase();
  return rows.filter((x) => {
    const t = new Date(x.submitted_at ?? "");
    if (!(t >= from && t < to)) return false;
    if (F.team && !x.teams.includes(F.team)) return false;
    if (F.person && !TEAM_ROLES.some((k) => x.team[k] === F.person)) return false;
    if (F.pkg && (x.team.package || "") !== (F.pkg === "_none" ? "" : F.pkg)) return false;
    if (!inScope(x, F.data)) return false;
    if (F.route === "at_risk" && !x.at_risk_flag) return false;
    if (F.route === "happy" && !x.happy_for_review) return false;
    if (F.route === "promoter" && !x.teams.some((tm) => teamFlags(x, tm).band === "promoter")) return false;
    if (F.route === "detractor" && !x.teams.some((tm) => teamFlags(x, tm).band === "detractor")) return false;
    if (q) {
      const hay = [
        x.client_name,
        x.client_id,
        x.team.brand_name,
        x.bookkeeping_reason_text,
        x.tax_reason_text,
        x.most_valuable_text,
        x.improvement_text,
        ...TEAM_ROLES.map((k) => x.team[k]),
      ];
      if (!hay.some((v) => String(v || "").toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

/* ─────────────────────────────── months ─────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export function monthLabel(k: string): string {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** The last `n` month keys, this month first. */
export function lastMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < n; i++) {
    out.push(monthKey(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

const inMonth = (k: string) => (r: TeamRow) => !!r.when && monthKey(new Date(r.when)) === k;

/* ─────────────────────────────── scorecard ─────────────────────────────── */

/** Fewer responses than this and a person's numbers are too small a sample to judge alone. */
export const SC_MIN_SAMPLE = 5;

export type ScoreLine = Core & { name: string };

/**
 * One team's leaderboard for a month (or "ytd" / "all"), grouped by whoever
 * holds `by` on each client. Onboarding ranks by % promoters first (the
 * advisor's call); bookkeeping and tax by NPS. Then NPS, CSAT, sample size.
 * "Not set" always sinks to the bottom, unranked.
 */
export function scoreboard(tr: TeamRow[], team: TeamKey, by: TeamRole, month: string, now = new Date()): ScoreLine[] {
  const ytd = periodStart("ytd", now);
  const pool = tr.filter(
    (r) =>
      r.team === team &&
      (month === "ytd" ? new Date(r.when) >= ytd : month === "all" ? true : inMonth(month)(r)),
  );
  const groups = new Map<string, TeamRow[]>();
  for (const r of pool) {
    const k = r.roles[by] || "Not set";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const first = team === "onboarding" ? (g: ScoreLine) => g.promPct ?? -1 : (g: ScoreLine) => g.nps ?? -999;
  return [...groups]
    .map(([name, rs]) => ({ name, ...core(rs) }))
    .sort(
      (a, b) =>
        Number(a.name === "Not set") - Number(b.name === "Not set") ||
        first(b) - first(a) ||
        (b.nps ?? -999) - (a.nps ?? -999) ||
        (b.csat ?? 0) - (a.csat ?? 0) ||
        b.n - a.n,
    );
}

/** Core numbers per team for each of `months`. */
export function trend(tr: TeamRow[], months: string[]): { month: string; teams: Record<TeamKey, Core> }[] {
  return months.map((k) => ({
    month: k,
    teams: Object.fromEntries(
      (["onboarding", "bookkeeping", "tax"] as const).map((t) => [t, core(tr.filter((r) => r.team === t && inMonth(k)(r)))]),
    ) as Record<TeamKey, Core>,
  }));
}

/* ─────────────────────────────── follow-ups ─────────────────────────────── */

/**
 * Who owns a follow-up, read off the client's team NOW — not who the link
 * named when it was made — so filling in the team later routes it.
 */
export function taskOwners(t: FeedbackTask, byId: Map<string, FeedbackResponse>): string[] {
  const team = byId.get(t.survey_id)?.team;
  if (!team) return [];
  const names =
    t.team === "onboarding"
      ? [team.onboarding_team_lead_id]
      : t.team === "tax"
        ? [team.tax_strategist_id, team.tax_manager_id]
        : [team.bookkeeping_lead_id];
  return names.filter((v): v is string => !!v);
}

export const assignedTo = (t: FeedbackTask, byId: Map<string, FeedbackResponse>, escalation: string) =>
  joinNames([...new Set([...taskOwners(t, byId), ...t.assignees])]) || escalation || "–";

export const needsTeam = (t: FeedbackTask, byId: Map<string, FeedbackResponse>) =>
  t.status !== "done" && !taskOwners(t, byId).length;

/* ─────────────────────────────── CSV ─────────────────────────────── */

/**
 * The prototype's export columns, in its order, so a spreadsheet built against
 * it keeps lining up. `recap_id` is new and goes on the end for the same reason.
 */
export const CSV_COLS = [
  "survey_id", "survey", "client_id", "client_name", "is_test", "submitted_at", "sections", "bookkeeping_period", "tax_year",
  "csat_overall", "nps_score", "nps_band", "clarity_score", "ease_score", "confidence_score", "fa_confidence_score",
  "expectation_match", "most_valuable_text", "improvement_text",
  "bookkeeping_csat_1_5", "bookkeeping_nps_0_10", "bookkeeping_nps_band", "bookkeeping_ease_1_5", "bookkeeping_reason_text", "bookkeeping_at_risk",
  "tax_csat_1_5", "tax_nps_0_10", "tax_nps_band", "tax_clarity_1_5", "tax_reason_text", "tax_at_risk",
  "happy_for_review", "at_risk_flag", "review_prompt_shown", "review_link_clicked",
  ...LINK_ROLES.map((r) => r.field),
  ...LINK_ROLES.map((r) => r.role),
  "package", "segment", "brand_name", "legal_name", "duration_sec", "survey_version",
  "recap_id",
];

const TEAM_COLS = new Set<string>([...TEAM_ROLES, "package", "segment", "brand_name", "legal_name"]);

function csvValue(r: FeedbackResponse, col: string): unknown {
  if (col === "survey_id") return r.id;
  // Team-owned columns come from the team map; everything else is what the client sent.
  if (TEAM_COLS.has(col)) return r.team[col as keyof FeedbackResponse["team"]];
  return (r as unknown as Record<string, unknown>)[col];
}

/**
 * Every CSV built here goes through this, so the formula guard can't be
 * forgotten on one of them. Client-typed text (names, reasons, comments)
 * lands in a sheet staff open in Excel or Google Sheets, where a cell starting
 * with = + - @ (or a tab / carriage return) runs as a formula — so any such
 * string gets a leading apostrophe, which both apps read as "this is text".
 * Real numbers are left alone: a scorecard NPS of -20 is a number, not an
 * injection, and quoting it would turn it into text.
 */
export function toCSV(rows: Record<string, unknown>[], cols: string[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("+") : String(v);
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

export function responsesCsv(rows: FeedbackResponse[]): string {
  return toCSV(
    rows.map((r) => Object.fromEntries(CSV_COLS.map((c) => [c, csvValue(r, c)]))),
    CSV_COLS,
  );
}

/** Every month × team × role × person, the scorecard's numbers as a sheet. */
export function scorecardCsv(rows: FeedbackResponse[], data: DataScope): string {
  const tr = teamRows(rows).filter((r) => inScope(r, data));
  const out: Record<string, unknown>[] = [];
  const keys = [...new Set(tr.filter((r) => r.when).map((r) => monthKey(new Date(r.when))))].sort();
  for (const k of keys) {
    for (const t of ["onboarding", "bookkeeping", "tax"] as const) {
      const pool = tr.filter((r) => r.team === t && inMonth(k)(r));
      for (const role of TEAMS[t].roles) {
        const g = new Map<string, TeamRow[]>();
        for (const r of pool) {
          const o = r.roles[role] || "Not set";
          g.set(o, [...(g.get(o) ?? []), r]);
        }
        for (const [person, rs] of g) {
          const c = core(rs);
          out.push({
            month: k,
            team: t,
            role: ROLE_LABELS[role],
            person,
            responses: c.n,
            avg_csat: c.csat == null ? "" : c.csat.toFixed(2),
            nps: c.nps,
            promoters_pct: c.promPct == null ? "" : Math.round(c.promPct * 100),
            detractors_pct: c.detPct == null ? "" : Math.round(c.detPct * 100),
            at_risk: c.risk,
          });
        }
      }
    }
  }
  return toCSV(out, ["month", "team", "role", "person", "responses", "avg_csat", "nps", "promoters_pct", "detractors_pct", "at_risk"]);
}
