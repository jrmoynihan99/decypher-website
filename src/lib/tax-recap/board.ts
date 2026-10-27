import "server-only";
import { listRecapFacts, type RecapFact } from "./store";
import { BAND_EDGES, BAND_LABELS } from "./public-stats";

/**
 * The team's savings board (/portal/tax-recap/savings): what the recaps add
 * up to, for the people who build them. Read live on every load; nothing is
 * cached between requests, so a recap saved a minute ago already counts.
 *
 * Two clocks, on purpose. Lifetime and the per-year panels go by TAX YEAR
 * (the return's year — what the client saved on their 2025 taxes). The
 * twelve-month figures go by the date the recap was SAVED, so they read as
 * the team's output: what this season produced, month by month, against the
 * season before.
 *
 * Totals include every recap, revoked and loss years alike. The medians and
 * the bands count only recaps (or clients) with something positive to
 * count. The scoreboard is keyed by the builder's email, since a recap
 * carries no pod or manager; `whoLabel` turns "maya.r@…" into "Maya R".
 */

export type SavingsBoard = {
  lifetime: {
    savings: number;
    recaps: number;
    clients: number;
    firstTaxYear: number;
    lastTaxYear: number;
    byYear: { taxYear: number; savings: number; recaps: number }[];
  };
  /** By the date each recap was saved. */
  last12: {
    savings: number;
    /** The twelve months before those. */
    prior: number;
    months: { key: string; label: string; savings: number; recaps: number }[];
    /** Per client (their recaps in the window summed), positive only. */
    median: number | null;
    average: number | null;
    clients: number;
    recaps: number;
    thisMonth: number;
  };
  /** Median share of the before bill that went away, whole percent. */
  pctCut: number | null;
  /** One entry per tax year, newest first, then "all". */
  years: {
    key: string;
    label: string;
    taxYear: number | null;
    recaps: number;
    /** Clients in a band. */
    clients: number;
    /** Every recap's savings in scope, summed — what the scoreboard adds up to. */
    savings: number;
    bands: { label: string; count: number }[];
    builders: { who: string; savings: number; recaps: number }[];
  }[];
  latest: {
    clientName: string;
    taxYear: number;
    before: number;
    after: number;
    savings: number;
    who: string;
    createdAt: string | null;
  }[];
  updatedAt: string | null;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const bandOf = (v: number) => (v < BAND_EDGES[0] ? 0 : v < BAND_EDGES[1] ? 1 : v < BAND_EDGES[2] ? 2 : 3);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** "maya.r@wedecypher.co" → "Maya R"; anything else as typed. */
export function whoLabel(email: string): string {
  const local = email.split("@")[0] ?? "";
  if (!local) return email || "—";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Pure, so it can be fed fixtures. `now` is the clock for the twelve-month windows. */
export function buildSavingsBoard(facts: RecapFact[], now = new Date()): SavingsBoard {
  const years = facts.map((f) => f.taxYear).filter((y) => y > 0);

  /* lifetime, by tax year */
  const perYear = new Map<number, { savings: number; recaps: number }>();
  for (const f of facts) {
    const y = perYear.get(f.taxYear) ?? { savings: 0, recaps: 0 };
    y.savings += f.savings;
    y.recaps++;
    perYear.set(f.taxYear, y);
  }
  const lifetime = {
    savings: Math.round(facts.reduce((s, f) => s + f.savings, 0)),
    recaps: facts.length,
    clients: new Set(facts.map((f) => f.clientKey)).size,
    firstTaxYear: years.length ? Math.min(...years) : 0,
    lastTaxYear: years.length ? Math.max(...years) : 0,
    byYear: [...perYear]
      .sort((a, b) => a[0] - b[0])
      .map(([taxYear, v]) => ({ taxYear, savings: Math.round(v.savings), recaps: v.recaps })),
  };

  /* the last twelve months, by the date the recap was saved */
  const t = now.getTime();
  const DAY = 86_400_000;
  const since = t - 365 * DAY;
  const priorSince = t - 730 * DAY;
  const at = (f: RecapFact) => (f.createdAt ? new Date(f.createdAt).getTime() : NaN);
  const inWindow = facts.filter((f) => at(f) >= since && at(f) <= t);
  const inPrior = facts.filter((f) => at(f) >= priorSince && at(f) < since);
  const months: SavingsBoard["last12"]["months"] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ key: monthKey(d), label: `${MONTHS[d.getUTCMonth()]} ’${String(d.getUTCFullYear()).slice(2)}`, savings: 0, recaps: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.key, m]));
  for (const f of inWindow) {
    const m = byMonth.get(monthKey(new Date(f.createdAt!)));
    if (m) {
      m.savings += f.savings;
      m.recaps++;
    }
  }
  months.forEach((m) => (m.savings = Math.round(m.savings)));
  const perClient12 = new Map<string, number>();
  for (const f of inWindow) perClient12.set(f.clientKey, (perClient12.get(f.clientKey) ?? 0) + f.savings);
  const positive12 = [...perClient12.values()].filter((v) => v > 0);
  const thisKey = monthKey(now);
  const last12 = {
    savings: Math.round(inWindow.reduce((s, f) => s + f.savings, 0)),
    prior: Math.round(inPrior.reduce((s, f) => s + f.savings, 0)),
    months,
    median: positive12.length ? Math.round(median(positive12)) : null,
    average: positive12.length ? Math.round(positive12.reduce((s, v) => s + v, 0) / positive12.length) : null,
    clients: positive12.length,
    recaps: inWindow.length,
    thisMonth: inWindow.filter((f) => monthKey(new Date(f.createdAt!)) === thisKey).length,
  };

  const ratios = facts.filter((f) => f.totalBefore > 0 && f.savings > 0).map((f) => f.savings / f.totalBefore);
  const pctCut = ratios.length ? Math.round(median(ratios) * 100) : null;

  /* per tax year, and all years: bands per client, scoreboard per builder */
  const scope = (key: string, label: string, taxYear: number | null, rows: RecapFact[]) => {
    const perClient = new Map<string, number>();
    const perBuilder = new Map<string, { savings: number; recaps: number }>();
    for (const f of rows) {
      perClient.set(f.clientKey, (perClient.get(f.clientKey) ?? 0) + f.savings);
      const b = perBuilder.get(f.createdBy) ?? { savings: 0, recaps: 0 };
      b.savings += f.savings;
      b.recaps++;
      perBuilder.set(f.createdBy, b);
    }
    const counts = [0, 0, 0, 0];
    let clients = 0;
    for (const v of perClient.values()) {
      if (v <= 0) continue;
      clients++;
      counts[bandOf(v)]++;
    }
    return {
      key,
      label,
      taxYear,
      recaps: rows.length,
      clients,
      savings: Math.round(rows.reduce((s, f) => s + f.savings, 0)),
      bands: BAND_LABELS.map((l, i) => ({ label: l, count: counts[i] })),
      builders: [...perBuilder]
        .map(([email, v]) => ({ who: whoLabel(email), savings: Math.round(v.savings), recaps: v.recaps }))
        .sort((a, b) => b.savings - a.savings),
    };
  };
  const yearList = [...perYear.keys()].filter((y) => y > 0).sort((a, b) => b - a);
  const scopes = [
    ...yearList.map((y) => scope(String(y), String(y), y, facts.filter((f) => f.taxYear === y))),
    scope("all", "All years", null, facts),
  ];

  const latest = [...facts]
    .filter((f) => f.createdAt)
    .sort((a, b) => (b.createdAt! > a.createdAt! ? 1 : -1))
    .slice(0, 5)
    .map((f) => ({
      clientName: f.clientName,
      taxYear: f.taxYear,
      before: Math.round(f.totalBefore),
      after: Math.round(f.totalBefore - f.savings),
      savings: Math.round(f.savings),
      who: whoLabel(f.createdBy),
      createdAt: f.createdAt,
    }));

  const updatedAt = facts.reduce<string | null>(
    (m, f) => (f.updatedAt && (!m || f.updatedAt > m) ? f.updatedAt : m),
    null,
  );

  return { lifetime, last12, pctCut, years: scopes, latest, updatedAt };
}

export async function loadSavingsBoard(): Promise<SavingsBoard> {
  return buildSavingsBoard(await listRecapFacts());
}
