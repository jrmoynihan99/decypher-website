"use client";

/**
 * Creator Finances — every client's profit & loss, pulled from their own
 * QuickBooks company file, plus the roll-up across all of them.
 *
 * Three things about the data shape drive how this is laid out:
 *
 *  1. Money arrives as integer CENTS and is divided by 100 exactly once, at the
 *     formatter. Summing ~150 clients' books in floats produces totals ending
 *     in .8899999999, which is not something an accounting firm can read out.
 *
 *  2. Connection health and data freshness are separate axes. A client can have
 *     a broken connection AND perfectly good numbers from last night, so the
 *     "needs attention" list shows both — collapsing them means choosing
 *     between hiding usable figures and hiding a problem.
 *
 *  3. The average states its denominator. Averaging over clients we couldn't
 *     read would count a broken connection as a $0 client and drag the firm's
 *     number down by a bug, so those are excluded and named.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { LineChart, type Series } from "@/components/portal/widgets/charts";
import {
  Chip,
  Disclaimer,
  Field,
  Kpi,
  KpiRow,
  LineRow,
  Mono,
  Note,
  Panel,
  SelectInput,
  TableCell,
  TableHead,
} from "@/components/portal/widgets/ui";
import { money2, pct } from "@/lib/widget-format";
import { averageOf, netMargin, primaryBucket } from "@/lib/quickbooks/aggregate";
import {
  CATEGORY_LABELS,
  categoriesForSide,
  type CategoryKey,
} from "@/lib/quickbooks/categories";
import {
  PERIOD_KEYS,
  PERIOD_LABELS,
  monthLabel,
  monthShortLabel,
  type PeriodKey,
} from "@/lib/quickbooks/periods";
import type {
  AccountMeta,
  CreatorFinanceRow,
  FinancesPayload,
  LineItem,
  MoneyCents,
  ProfitAndLossTotals,
} from "@/lib/quickbooks/types";

/** Cents → the dollars every formatter in widget-format expects. */
const usd = (cents: number) => money2(cents / 100);

const COLORS = {
  income: "#3dd6c4",
  expenses: "#ff2d78",
  net: "#f1eef6",
} as const;

type Tab = "roster" | "creator" | "mapping";

const TABS: { id: Tab; n: string; label: string }[] = [
  { id: "roster", n: "01", label: "all creators" },
  { id: "creator", n: "02", label: "per creator" },
  { id: "mapping", n: "03", label: "category mapping" },
];

export type ConnectNotice = {
  kind: "connected" | "cancelled" | "expired" | "already-connected" | "error";
  realm?: string;
  name?: string;
} | null;

export default function CreatorFinances({
  initial,
  notice,
}: {
  initial: FinancesPayload;
  notice: ConnectNotice;
}) {
  const [payload, setPayload] = useState(initial);
  const [period, setPeriod] = useState<PeriodKey>(initial.period);
  const [tab, setTab] = useState<Tab>("roster");
  // A freshly connected company should be the one on screen, so it's chosen in
  // the initialiser rather than by an effect that would re-render immediately.
  const [selected, setSelected] = useState<string | null>(
    (notice?.kind === "connected" ? notice.realm : null) ?? initial.rows[0]?.realmId ?? null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<ConnectNotice>(notice);

  const load = useCallback(async (next: PeriodKey) => {
    setBusy("load");
    setError("");
    try {
      const res = await fetch(`/api/portal/quickbooks/finances?period=${next}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.message);
      setPayload(data as FinancesPayload);
    } catch {
      setError("Couldn't load the latest figures — try again.");
    } finally {
      setBusy(null);
    }
  }, []);

  const sync = useCallback(
    async (realmId: string) => {
      setBusy(realmId);
      setError("");
      try {
        const res = await fetch("/api/portal/quickbooks/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ realmId }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.message);
        if (!data.result?.ok) setError(data.result?.message ?? "That sync didn't complete.");
      } catch {
        setError("Couldn't reach QuickBooks — try again.");
      } finally {
        setBusy(null);
      }
      await load(period);
    },
    [load, period],
  );

  /**
   * Hand a client's books back. Registered with Intuit as the app's disconnect
   * destination, so this control is the reason that URL resolves to something
   * actionable rather than a dashboard you can only look at.
   *
   * Worth the confirm: it revokes our refresh token at Intuit, so there is no
   * undo — coming back means signing in to QuickBooks and picking the company
   * out of the list again.
   */
  const disconnect = useCallback(
    async (row: CreatorFinanceRow) => {
      if (
        !confirm(
          `Disconnect ${row.displayName}? This revokes our access at Intuit. Reconnecting means signing in and picking the company again.`,
        )
      )
        return;
      setBusy(`disconnect:${row.realmId}`);
      setError("");
      try {
        const res = await fetch(
          `/api/portal/quickbooks/connections/${row.realmId}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.message);
        // The route drops our credentials whether or not Intuit confirms the
        // revocation, because a connection we can't reach is exactly when
        // staff most need to be able to remove it. Say so rather than let a
        // half-done disconnect read as a clean one.
        if (!data.revoked) {
          setError(
            `Disconnected ${row.displayName} here, but Intuit didn't confirm the revocation — remove DeCypher from that company in QuickBooks to be certain.`,
          );
        }
      } catch {
        setError("Couldn't disconnect — try again.");
        setBusy(null);
        return;
      }
      setBusy(null);
      await load(period);
    },
    [load, period],
  );

  /**
   * A company connected seconds ago has no figures yet, and waiting for the
   * overnight cron to prove the connection works is a poor first impression —
   * so the dashboard kicks the first sync on arrival.
   *
   * It can't be fired from the callback route: the serverless function is
   * frozen once it returns a redirect, so anything not awaited there simply
   * never runs, and awaiting it would park staff on a spinner through two more
   * round trips.
   *
   * Written as an external action whose results land in callbacks, rather than
   * calling the shared sync() helper — that one sets state synchronously, which
   * inside an effect means a cascading render.
   */
  useEffect(() => {
    if (notice?.kind !== "connected" || !notice.realm) return;
    let cancelled = false;

    fetch("/api/portal/quickbooks/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ realmId: notice.realm }),
    })
      .then(() => fetch(`/api/portal/quickbooks/finances?period=${initial.period}`))
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setPayload(data as FinancesPayload);
      })
      .catch(() => {
        if (!cancelled) setError("Connected, but the first sync didn't complete. Try Sync now.");
      });

    return () => {
      cancelled = true;
    };
  }, [notice, initial.period]);

  const changePeriod = (next: PeriodKey) => {
    setPeriod(next);
    void load(next);
  };

  const bucket = primaryBucket(payload.aggregate);
  const average = useMemo(() => averageOf(bucket), [bucket]);
  // Both tabs read the same selection, so picking a creator in the comparison
  // and opening their breakdown lands on the one you were just looking at. The
  // fallback matters after a disconnect, when the held realmId no longer exists.
  const current =
    payload.rows.find((r) => r.realmId === selected) ?? payload.rows[0] ?? null;

  if (!payload.rows.length) {
    return (
      <div>
        <Header period={period} onPeriod={changePeriod} disabled />
        {banner ? <NoticeBanner notice={banner} onDismiss={() => setBanner(null)} /> : null}
        <FirstRun />
        <Disclaimer>
          Figures come straight from each client&rsquo;s QuickBooks company file and are only
          as current as their bookkeeping. Not a substitute for a filed return.
        </Disclaimer>
      </div>
    );
  }

  return (
    <div>
      <Header period={period} onPeriod={changePeriod} disabled={busy === "load"} />

      {banner ? <NoticeBanner notice={banner} onDismiss={() => setBanner(null)} /> : null}
      {error ? (
        <p className="mb-4 text-[12.5px] text-danger" role="status">
          {error}
        </p>
      ) : null}

      <nav role="tablist" aria-label="Creator finances views" className="mb-6 flex gap-0.5 border-b border-edge">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px cursor-pointer border-b-2 px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[1px] transition-colors duration-150 ${
              tab === t.id
                ? "border-magenta text-fog"
                : "border-transparent text-dusk hover:text-mist"
            }`}
          >
            <span className="mr-1.5 text-magenta">{t.n}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "roster" ? (
        <Roster
          payload={payload}
          average={average}
          selected={current}
          busy={busy}
          onSelect={setSelected}
          onOpen={(realmId) => {
            setSelected(realmId);
            setTab("creator");
          }}
          onSync={sync}
        />
      ) : null}

      {tab === "creator" ? (
        <CreatorDetail
          rows={payload.rows}
          selected={current}
          onSelect={setSelected}
          onSync={sync}
          onDisconnect={disconnect}
          busy={busy}
        />
      ) : null}

      {tab === "mapping" ? <Mapping rows={payload.rows} /> : null}

      <Disclaimer>
        Figures come straight from each client&rsquo;s QuickBooks company file, on an accrual
        basis, and are only as current as their bookkeeping. Totals follow QuickBooks&rsquo; own
        section summaries so they reconcile against what the client sees in their books.
      </Disclaimer>
    </div>
  );
}

/* ──────────────────────────── chrome ──────────────────────────── */

function Header({
  period,
  onPeriod,
  disabled,
}: {
  period: PeriodKey;
  onPeriod: (p: PeriodKey) => void;
  disabled?: boolean;
}) {
  // The page owns the title block (see the refund-calculator page); this is
  // just the tool's own controls.
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <Field label="Period" className="w-[200px]">
          <SelectInput
            value={period}
            disabled={disabled}
            onChange={(e) => onPeriod(e.target.value as PeriodKey)}
          >
            {PERIOD_KEYS.map((key) => (
              <option key={key} value={key}>
                {PERIOD_LABELS[key]}
              </option>
            ))}
          </SelectInput>
        </Field>

        {/* A real anchor, not next/link: this hits an API route that 302s to
            Intuit's consent screen on another origin. A client-side transition
            can't follow that, and the OAuth state cookie is SameSite=Lax, which
            requires a top-level navigation to come back. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/portal/quickbooks/connect"
          className="cursor-pointer rounded-full border border-magenta/50 bg-magenta/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[1px] text-magenta transition-colors duration-150 hover:border-magenta hover:bg-magenta/15"
        >
          + Add a client
        </a>
      </div>
    </>
  );
}

const NOTICE_COPY: Record<NonNullable<ConnectNotice>["kind"], (n: NonNullable<ConnectNotice>) => string> = {
  connected: () => "Connected. Pulling this client's figures now — it takes a few seconds.",
  cancelled: () => "No company was connected — the QuickBooks window was closed.",
  expired: () => "That took too long and the connect link expired. Try Add a client again.",
  "already-connected": (n) =>
    `That QuickBooks company is already connected as “${n.name ?? "another client"}”. ` +
    `Pick a different company, or reconnect from that client's row.`,
  error: () => "QuickBooks couldn't complete the connection. Try again.",
};

function NoticeBanner({
  notice,
  onDismiss,
}: {
  notice: NonNullable<ConnectNotice>;
  onDismiss: () => void;
}) {
  const good = notice.kind === "connected";
  return (
    <div
      role="status"
      className={`mb-5 flex items-start justify-between gap-4 rounded-[14px] border px-4 py-3 text-[13px] ${
        good
          ? "border-teal/40 bg-teal/[0.07] text-teal"
          : "border-ember/40 bg-ember/[0.07] text-ember"
      }`}
    >
      <span>{NOTICE_COPY[notice.kind](notice)}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="cursor-pointer text-current opacity-60 transition-opacity hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

/** The state the firm is in before a single company is connected. */
function FirstRun() {
  return (
    <Panel title="No companies connected yet">
      <p className="text-[13.5px] leading-relaxed text-mist">
        Each client&rsquo;s books are a separate QuickBooks company file, so each one is
        connected once. Hit <strong className="text-fog">Add a client</strong>
        {" "}and pick them from Intuit&rsquo;s company list — because the firm signs in with
        a QuickBooks Online Accountant login, every client you have access to is already
        in that list.
      </p>
      <Note>
        Their company name, currency and fiscal year fill themselves in, and the first
        set of figures appears a few seconds later. After that it&rsquo;s unattended:
        connections refresh themselves and the books re-sync nightly. The only reason a
        client ever needs reconnecting is if they revoke access on their side.
      </Note>
    </Panel>
  );
}

/* ──────────────────────── all creators ──────────────────────── */

/**
 * The firm-wide roll-up, then one creator read against the average.
 *
 * This was a row per connected company, which is the obvious shape and the
 * wrong one: at ~150 clients it's a wall of figures nobody scans, and the
 * question actually asked on a call — how does *this* creator sit against the
 * rest of the book — was the one thing you had to work out in your head.
 *
 * So the totals stay in the tiles, the list collapses to a picker, and the
 * table is three lines: creator, average, difference. There's no total line in
 * it because the total is the strip directly above; printing it twice invites
 * the reader to check whether the two agree.
 */
function Roster({
  payload,
  average,
  selected,
  busy,
  onSelect,
  onOpen,
  onSync,
}: {
  payload: FinancesPayload;
  average: ProfitAndLossTotals;
  selected: CreatorFinanceRow | null;
  busy: string | null;
  onSelect: (realmId: string) => void;
  onOpen: (realmId: string) => void;
  onSync: (realmId: string) => void;
}) {
  const bucket = primaryBucket(payload.aggregate);
  const { excluded, mixedCurrency, primaryCurrency } = payload.aggregate;
  const d = selected?.data ?? null;

  // Losing the table loses the at-a-glance read on which connections are
  // broken, so the unhealthy rows keep a home of their own. `disabled` is
  // deliberately off rather than failing, and the aggregate skips it too.
  const excludedIds = new Set(excluded.map((e) => e.realmId));
  const attention = payload.rows.filter(
    (row) =>
      row.connection !== "disabled" &&
      (excludedIds.has(row.realmId) ||
        row.connection === "reconnect-required" ||
        row.connection === "error" ||
        row.stale),
  );

  return (
    <div className="flex flex-col gap-5">
      <KpiRow cols={4}>
        <Kpi label="Total income" value={usd(bucket.income)} sub={`${bucket.count} creators`} />
        <Kpi label="Total expenses" value={usd(bucket.expenses + bucket.costOfGoodsSold)} />
        <Kpi
          label="Net operating profit"
          value={usd(bucket.netOperatingIncome)}
          tone={bucket.netOperatingIncome >= 0 ? "pos" : "neg"}
        />
        <Kpi
          label="Net profit"
          value={usd(bucket.netIncome)}
          tone={bucket.netIncome >= 0 ? "pos" : "neg"}
          sub={marginLabel(bucket)}
        />
      </KpiRow>

      {mixedCurrency ? (
        <Callout>
          These clients&rsquo; books aren&rsquo;t all in the same currency. The totals above cover{" "}
          <strong className="text-fog">{primaryCurrency}</strong>{" "}only — other currencies are
          reported separately rather than added together.
        </Callout>
      ) : null}

      <Panel
        title="Creator vs. average"
        action={<Mono className="text-dusk">{payload.rows.length} connected</Mono>}
        bodyClassName="px-0 py-0"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3.5">
          <Field label="Creator" className="w-[280px]">
            <SelectInput
              value={selected?.realmId ?? ""}
              onChange={(e) => onSelect(e.target.value)}
            >
              {payload.rows.map((row) => (
                <option key={row.realmId} value={row.realmId}>
                  {row.displayName}
                </option>
              ))}
            </SelectInput>
          </Field>

          {selected ? (
            <div className="flex items-center gap-3 pb-1">
              <StatusCell row={selected} />
              <button
                onClick={() => onOpen(selected.realmId)}
                className="cursor-pointer whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[1px] text-dusk transition-colors duration-150 hover:text-fog"
              >
                Full breakdown →
              </button>
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <thead>
              <tr>
                <TableHead align="left">{""}</TableHead>
                <TableHead>Income</TableHead>
                <TableHead>Expenses</TableHead>
                <TableHead>Net operating</TableHead>
                <TableHead>Net profit</TableHead>
                <TableHead>Margin</TableHead>
              </tr>
            </thead>
            <tbody>
              <tr>
                <TableCell align="left">
                  <span className="font-display font-semibold text-fog">
                    {selected?.displayName ?? "—"}
                  </span>
                </TableCell>
                {d ? <TotalCells totals={d} /> : <BlankCells />}
              </tr>
              <tr>
                <TableCell align="left">
                  <span className="text-mist">Average</span>
                  {/* Naming the denominator is the point — an average over a
                      different set of clients is a different number. */}
                  <span className="ml-2 font-body text-[11px] text-dusk">
                    of {bucket.count} creators
                  </span>
                </TableCell>
                <TotalCells totals={average} />
              </tr>
              <tr className="border-t-2 border-edge-mid">
                <TableCell align="left">
                  <span className="font-display font-semibold text-fog">Difference</span>
                </TableCell>
                {d ? <DiffCells row={d} average={average} /> : <BlankCells />}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="px-4 pb-4">
          <Note>
            Difference is this creator minus the firm-wide average, with the share of
            the average alongside it. Expenses aren&rsquo;t colour-coded: a creator
            billing three times the average is supposed to spend more than it, so
            above-average spend isn&rsquo;t a finding on its own — the net lines are.
          </Note>
        </div>
      </Panel>

      {attention.length ? (
        <Panel title={`Needs attention (${attention.length})`} bodyClassName="px-0 py-0">
          {attention.map((row) => (
            <div
              key={row.realmId}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-4 py-2.5 first:border-t-0"
            >
              <button
                onClick={() => onSelect(row.realmId)}
                className="cursor-pointer text-left text-[13px] text-fog transition-colors duration-150 hover:text-magenta"
              >
                {row.displayName}
              </button>
              <div className="flex items-center gap-3">
                {excludedIds.has(row.realmId) ? (
                  <span className="text-[11px] text-dusk">left out of the totals</span>
                ) : null}
                <StatusCell row={row} />
                {row.connection === "reconnect-required" ? (
                  // Same top-level navigation as "Add a client" — reconnecting
                  // and onboarding are one code path.
                  // eslint-disable-next-line @next/next/no-html-link-for-pages
                  <a
                    href="/api/portal/quickbooks/connect"
                    className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1px] text-ember hover:text-fog"
                  >
                    Reconnect
                  </a>
                ) : (
                  <button
                    onClick={() => onSync(row.realmId)}
                    disabled={busy === row.realmId}
                    className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1px] text-dusk transition-colors duration-150 hover:text-fog disabled:cursor-default disabled:opacity-40"
                  >
                    {busy === row.realmId ? "Syncing…" : "Sync"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {excluded.length ? (
            <div className="px-4 pb-4">
              <Note>
                The ones marked left out of the totals are excluded rather than counted
                as zero — a connection we can&rsquo;t read isn&rsquo;t a client who earned
                nothing, and treating it as one would pull the average down by a bug.
              </Note>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

function TotalCells({ totals }: { totals: ProfitAndLossTotals }) {
  return (
    <>
      <TableCell>{usd(totals.income)}</TableCell>
      <TableCell>{usd(totals.expenses + totals.costOfGoodsSold)}</TableCell>
      <TableCell>{usd(totals.netOperatingIncome)}</TableCell>
      <TableCell>
        <span className={totals.netIncome >= 0 ? "text-teal" : "text-danger"}>
          {usd(totals.netIncome)}
        </span>
      </TableCell>
      <TableCell>{marginLabel(totals) ?? "—"}</TableCell>
    </>
  );
}

/** The five figure columns, for a creator we have no readable books for. */
function BlankCells() {
  return (
    <>
      {["income", "expenses", "netop", "net", "margin"].map((key) => (
        <TableCell key={key}>—</TableCell>
      ))}
    </>
  );
}

const expensesOf = (t: ProfitAndLossTotals) => t.expenses + t.costOfGoodsSold;

function DiffCells({
  row,
  average,
}: {
  row: ProfitAndLossTotals;
  average: ProfitAndLossTotals;
}) {
  return (
    <>
      <DiffCell value={row.income - average.income} base={average.income} />
      <DiffCell
        value={expensesOf(row) - expensesOf(average)}
        base={expensesOf(average)}
        tone={false}
      />
      <DiffCell
        value={row.netOperatingIncome - average.netOperatingIncome}
        base={average.netOperatingIncome}
      />
      <DiffCell value={row.netIncome - average.netIncome} base={average.netIncome} />
      <TableCell>{marginDelta(row, average)}</TableCell>
    </>
  );
}

/**
 * One delta, with its size relative to the average beside it.
 *
 * The relative figure is dropped when the average isn't positive: "+240% of
 * −$4,000" is a sentence with no meaning, and a firm-wide average net loss is
 * exactly the moment nobody should be squinting at a percentage.
 */
function DiffCell({
  value,
  base,
  tone = true,
}: {
  value: MoneyCents;
  base: MoneyCents;
  tone?: boolean;
}) {
  const rel = base > 0 ? value / base : null;
  return (
    <TableCell>
      <span className={!tone ? "text-mist" : value >= 0 ? "text-teal" : "text-danger"}>
        {signedUsd(value)}
      </span>
      {rel !== null ? (
        <span className="ml-1.5 text-[10.5px] text-faint">{signedPct(rel)}</span>
      ) : null}
    </TableCell>
  );
}

/** A delta reads as a sign, not as accounting parentheses. */
const signedUsd = (cents: MoneyCents) =>
  cents === 0 ? usd(0) : (cents < 0 ? "−" : "+") + usd(Math.abs(cents));

const signedPct = (v: number) => (v < 0 ? "−" : "+") + pct(Math.abs(v), 0);

/** Margin is a ratio, so the gap between two of them is points, not dollars. */
function marginDelta(row: ProfitAndLossTotals, average: ProfitAndLossTotals) {
  const a = netMargin(row);
  const b = netMargin(average);
  if (a === null || b === null) return "—";
  const points = (a - b) * 100;
  return (
    <span className={points >= 0 ? "text-teal" : "text-danger"}>
      {(points < 0 ? "−" : "+") + Math.abs(points).toFixed(1)} pts
    </span>
  );
}

/**
 * Connection health and data freshness read as one line but come from two
 * independent fields — the row that forces that split is a broken connection
 * still showing last night's perfectly good numbers.
 */
function StatusCell({ row }: { row: CreatorFinanceRow }) {
  if (row.connection === "disabled") return <Chip tone="mute">Disconnected</Chip>;
  if (row.connection === "reconnect-required") {
    return (
      <span className="flex items-center gap-2">
        <Chip tone="neg">Reconnect</Chip>
        {row.data ? <span className="text-[11px] text-dusk">last-good figures</span> : null}
      </span>
    );
  }
  if (row.dataStatus === "never") return <Chip tone="mute">First sync pending</Chip>;
  if (row.dataStatus === "error") return <Chip tone="warn">Sync failed</Chip>;
  if (row.stale) return <Chip tone="warn">Stale</Chip>;
  if (row.dataStatus === "empty") return <Chip tone="mute">No activity</Chip>;
  return <Chip tone="pos">Synced</Chip>;
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[14px] border border-ember/40 bg-ember/[0.07] px-4 py-3 text-[13px] text-ember">
      {children}
    </p>
  );
}

function marginLabel(totals: ProfitAndLossTotals): string | null {
  const margin = netMargin(totals);
  return margin === null ? null : pct(margin);
}

/* ──────────────────────── per-creator ──────────────────────── */

function CreatorDetail({
  rows,
  selected,
  onSelect,
  onSync,
  onDisconnect,
  busy,
}: {
  rows: CreatorFinanceRow[];
  selected: CreatorFinanceRow | null;
  onSelect: (realmId: string) => void;
  onSync: (realmId: string) => void;
  onDisconnect: (row: CreatorFinanceRow) => void;
  busy: string | null;
}) {
  if (!selected) return <Panel title="Pick a creator">No creator selected.</Panel>;
  const d = selected.data;
  const syncing = busy === selected.realmId;
  const disconnecting = busy === `disconnect:${selected.realmId}`;

  const series: Series[] = d
    ? [
        { key: "cf-income", label: "Income", color: COLORS.income, kind: "line", values: d.monthly.income.map((c) => c / 100) },
        { key: "cf-expenses", label: "Expenses", color: COLORS.expenses, kind: "line", values: d.monthly.expenses.map((c) => c / 100) },
        { key: "cf-net", label: "Net profit", color: COLORS.net, kind: "line", values: d.monthly.netIncome.map((c) => c / 100) },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Creator" className="w-[280px]">
          <SelectInput value={selected.realmId} onChange={(e) => onSelect(e.target.value)}>
            {rows.map((row) => (
              <option key={row.realmId} value={row.realmId}>
                {row.displayName}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-dusk">
            {selected.lastSyncedAt ? (
              <>
                Last synced{" "}
                <time dateTime={selected.lastSyncedAt} suppressHydrationWarning>
                  {new Date(selected.lastSyncedAt).toLocaleString()}
                </time>
              </>
            ) : (
              "Never synced"
            )}
          </span>
          <button
            onClick={() => onSync(selected.realmId)}
            disabled={syncing || disconnecting}
            className="cursor-pointer rounded-full border border-white/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[1px] text-mist transition-colors duration-150 hover:border-mist hover:text-fog disabled:cursor-default disabled:opacity-40"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          {/* Nothing left to hand back once it's already disconnected. */}
          {selected.connection === "disabled" ? null : (
            <button
              onClick={() => onDisconnect(selected)}
              disabled={syncing || disconnecting}
              className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1px] text-dusk transition-colors duration-150 hover:text-danger disabled:cursor-default disabled:opacity-40"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          )}
        </div>
      </div>

      {selected.connection !== "connected" || !d ? (
        <Callout>
          {selected.connectionMessage || selected.dataMessage || "No figures for this client yet."}
        </Callout>
      ) : null}

      {d ? (
        <>
          <KpiRow cols={4}>
            <Kpi label="Total income" value={usd(d.income)} />
            <Kpi label="Total expenses" value={usd(d.expenses + d.costOfGoodsSold)} />
            <Kpi
              label="Net operating profit"
              value={usd(d.netOperatingIncome)}
              tone={d.netOperatingIncome >= 0 ? "pos" : "neg"}
            />
            <Kpi
              label="Net profit"
              value={usd(d.netIncome)}
              tone={d.netIncome >= 0 ? "pos" : "neg"}
              sub={marginLabel(d)}
            />
          </KpiRow>

          {d.months.length > 1 ? (
            <Panel title="Month by month">
              <LineChart
                series={series}
                xLabel={(i) => monthShortLabel(d.months[i] ?? "")}
                labelForIndex={(i) => monthLabel(d.months[i] ?? "")}
                height={260}
              />
            </Panel>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <Ledger
              title="Revenue streams"
              items={d.revenueStreams}
              total={d.income + d.otherIncome}
              color={COLORS.income}
              note="Each client's own account names, kept verbatim — QuickBooks has no category that tells AdSense apart from a brand deal, so the raw names are the answer here."
            />
            <Ledger
              title="Expense categories"
              items={d.expenseLines}
              total={d.costOfGoodsSold + d.expenses + d.otherExpenses}
              color={COLORS.expenses}
              note="Cost of goods sold is folded in, so this reconciles against net profit."
            />
          </div>

          <Panel title="Profit &amp; loss">
            <LineRow label="Income" value={usd(d.income)} />
            {d.costOfGoodsSold !== 0 ? (
              <>
                <LineRow label="Cost of goods sold" value={usd(d.costOfGoodsSold)} />
                <LineRow label="Gross profit" value={usd(d.grossProfit)} total />
              </>
            ) : null}
            <LineRow label="Operating expenses" value={usd(d.expenses)} />
            <LineRow
              label="Net operating profit"
              value={usd(d.netOperatingIncome)}
              tone={d.netOperatingIncome >= 0 ? "pos" : "neg"}
              total
            />
            {d.otherIncome !== 0 ? <LineRow label="Other income" value={usd(d.otherIncome)} /> : null}
            {d.otherExpenses !== 0 ? (
              <LineRow label="Other expenses" value={usd(d.otherExpenses)} />
            ) : null}
            <LineRow
              label="Net profit"
              value={usd(d.netIncome)}
              tone={d.netIncome >= 0 ? "pos" : "neg"}
              total
              size="lg"
              display
            />
          </Panel>

          {d.warnings.length ? (
            <Panel title="Worth a look">
              {d.warnings.map((w) => (
                <LineRow key={w} label={w} value="" size="sm" />
              ))}
              <Note>
                These are places our reading of the report disagrees with QuickBooks&rsquo; own
                figures. Headline numbers always follow QuickBooks, so what&rsquo;s above still
                matches the client&rsquo;s books — but a persistent warning is worth chasing.
              </Note>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** A ledger with proportion bars — the categorical read the chart kit has no primitive for. */
function Ledger({
  title,
  items,
  total,
  color,
  note,
}: {
  title: string;
  items: LineItem[];
  total: number;
  color: string;
  note: string;
}) {
  const scale = Math.max(...items.map((i) => Math.abs(i.total)), 1);
  return (
    <Panel title={title}>
      {items.length ? (
        <>
          <div className="flex flex-col gap-2.5">
            {items.map((item) => {
              const share = total === 0 ? 0 : item.total / total;
              return (
                <div key={`${item.accountId ?? item.name}`}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-muted" title={item.name}>
                      {item.name}
                    </span>
                    <span className="flex-none font-mono tabular-nums text-mist">
                      {usd(item.total)}
                      <span className="ml-2 text-[11px] text-faint">
                        {total === 0 ? "—" : pct(share, 0)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (Math.abs(item.total) / scale) * 100)}%`,
                        background: color,
                        opacity: item.total < 0 ? 0.4 : 1,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <LineRow label="Total" value={usd(total)} total />
        </>
      ) : (
        <p className="text-[13px] text-dusk">Nothing in this period.</p>
      )}
      <Note>{note}</Note>
    </Panel>
  );
}

/* ──────────────────────────── mapping ──────────────────────────── */

type MappedAccount = AccountMeta & {
  side: "income" | "expense";
  category: CategoryKey;
  pinned: boolean;
};

/**
 * The category map, per client.
 *
 * Necessary rather than optional: QuickBooks files AdSense, sponsorships,
 * integrations and affiliate income under the same one or two income subtypes,
 * so without this the aggregate's income breakdown collapses into one
 * meaningless bar. Expenses mostly sort themselves out from their subtypes.
 *
 * Roughly ten accounts per new client, once.
 */
function Mapping({ rows }: { rows: CreatorFinanceRow[] }) {
  const [realmId, setRealmId] = useState(rows[0]?.realmId ?? "");

  return (
    <div className="flex flex-col gap-5">
      <Field label="Client" className="w-[280px]">
        <SelectInput value={realmId} onChange={(e) => setRealmId(e.target.value)}>
          {rows.map((row) => (
            <option key={row.realmId} value={row.realmId}>
              {row.displayName}
            </option>
          ))}
        </SelectInput>
      </Field>

      {/* Keyed on realmId so switching client remounts with empty state. That's
          why the table below never has to reset anything in an effect — the
          "loading" state is simply "mounted but nothing has arrived yet". */}
      {realmId ? <AccountTable key={realmId} realmId={realmId} /> : null}

      <Note>
        Mapping a revenue account here is what makes the aggregate income breakdown mean
        anything — QuickBooks files AdSense, sponsorships and merch under the same one or
        two subtypes, so it genuinely can&rsquo;t tell them apart. Expenses mostly sort
        themselves out. Changes apply on this client&rsquo;s next sync.
      </Note>
    </div>
  );
}

function AccountTable({ realmId }: { realmId: string }) {
  const [accounts, setAccounts] = useState<MappedAccount[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/quickbooks/connections/${realmId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.ok) throw new Error(data?.message);
        setAccounts(data.accounts as MappedAccount[]);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this client's chart of accounts.");
      });
    return () => {
      cancelled = true;
    };
  }, [realmId]);

  const save = async (account: MappedAccount, category: CategoryKey) => {
    setSaving(account.id);
    setError("");
    try {
      const res = await fetch("/api/portal/quickbooks/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "account", realmId, accountId: account.id, category }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.message);
      setAccounts(
        (prev) =>
          prev?.map((a) => (a.id === account.id ? { ...a, category, pinned: true } : a)) ?? prev,
      );
    } catch {
      setError("Couldn't save that mapping — try again.");
    } finally {
      setSaving(null);
    }
  };

  // Unmapped first: that's the queue, and it's what a newly connected client
  // arrives with.
  const sorted = useMemo(() => {
    if (!accounts) return [];
    return [...accounts].sort((a, b) => {
      const aLoose = a.category === "uncategorized" ? 0 : 1;
      const bLoose = b.category === "uncategorized" ? 0 : 1;
      if (aLoose !== bLoose) return aLoose - bLoose;
      if (a.side !== b.side) return a.side === "income" ? -1 : 1;
      return a.fullyQualifiedName.localeCompare(b.fullyQualifiedName);
    });
  }, [accounts]);

  const unmapped = sorted.filter((a) => a.category === "uncategorized").length;
  // Derived, not stored: "mounted and nothing has arrived" is exactly loading.
  const loading = accounts === null && !error;

  return (
    <>
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}

      <Panel
        title="Accounts"
        action={
          accounts ? (
            unmapped ? (
              <Chip tone="warn">{unmapped} unmapped</Chip>
            ) : (
              <Chip tone="pos">All mapped</Chip>
            )
          ) : null
        }
        bodyClassName="px-0 py-0"
      >
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-dusk">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <TableHead align="left">Account</TableHead>
                  <TableHead align="left">QuickBooks subtype</TableHead>
                  <TableHead align="left">Category</TableHead>
                </tr>
              </thead>
              <tbody>
                {sorted.map((account) => (
                  <tr key={account.id} className="transition-colors duration-150 hover:bg-white/[0.03]">
                    <TableCell align="left">
                      <span className="font-body text-fog">{account.fullyQualifiedName}</span>
                      {account.pinned ? (
                        <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[1px] text-magenta">
                          pinned
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell align="left">
                      <span className="text-dusk">{account.subType ?? "—"}</span>
                    </TableCell>
                    <TableCell align="left">
                      <SelectInput
                        value={account.category}
                        disabled={saving === account.id}
                        onChange={(e) => save(account, e.target.value as CategoryKey)}
                        className="w-[210px]"
                      >
                        {categoriesForSide(account.side).map((key) => (
                          <option key={key} value={key}>
                            {CATEGORY_LABELS[key]}
                          </option>
                        ))}
                      </SelectInput>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
