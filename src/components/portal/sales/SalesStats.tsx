"use client";

/**
 * The Stats tab — aggregate view over the same `salesCalls` the grid edits.
 *
 * Reads the rows already in memory rather than fetching or aggregating server
 * side: the whole pipeline is ~800 rows, every number here is a single pass
 * over an array, and computing in the browser means the figures track the
 * toolbar filters instantly instead of round-tripping. It's also what makes the
 * period comparison free — a second window is a second filter over the same
 * array, not a second query.
 *
 * SCOPE RULE: every panel respects the current date range and call-type filter,
 * with exactly one documented exception — the breakdown table at the bottom,
 * whose entire job is the multi-period comparison. Its header says so. Archived
 * rows are excluded everywhere, by the same filter the grid uses.
 *
 * Chart forms and colours are not free choices here; see the header of viz.tsx
 * for what was validated and why almost everything is one hue. The one thing
 * that changed since: categorical bars now take the colour their option was
 * given in ⚙ Options, from a palette that was checked as a set — an editor
 * can't reach a colour that fails.
 */

import { useMemo, useState } from "react";
import {
  DEAL_STATUS_META,
  commissionTotal,
  optionColorHex,
  partnerPayout,
} from "@/lib/sales/options";
import type {
  OptionItem,
  SalesCallRow,
  SalesOptionsConfig,
} from "@/lib/sales/types";
import {
  Kpi,
  KpiRow,
  Mono,
  Panel,
  Segmented,
  TableCell,
  TableHead,
} from "@/components/portal/widgets/ui";
import {
  BarList,
  Delta,
  Funnel,
  Meter,
  MonthColumns,
  VIZ,
  type MonthDatum,
} from "./viz";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const moneyShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}m`
  : n >= 1000 ? `$${Math.round(n / 1000)}k`
  : `$${Math.round(n)}`;
const count = (n: number) => n.toLocaleString();
const percent = (n: number) => `${Math.round(n)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const won = (r: SalesCallRow) => Boolean(r.status && DEAL_STATUS_META[r.status].counts);

/**
 * Tally rows against a configured option list: every configured key in list
 * order (labels and colours as edited), plus any stray keys found on rows
 * appended at the end — a retired-then-forgotten option still shows its
 * historical deals, in the default hue, because it has no configured colour.
 */
function tallyList(
  rows: SalesCallRow[],
  items: OptionItem[],
  pick: (r: SalesCallRow) => string | null,
) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r);
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

/* ───────────────────────── one period, summarised ───────────────────────── */

/**
 * Every headline number for a set of rows.
 *
 * Pulled out of the component so the comparison window runs through exactly the
 * same arithmetic as the current one. Two near-identical inline blocks is how
 * "close rate" quietly comes to mean two different things on one screen.
 */
function summarise(rows: SalesCallRow[]) {
  const deals = rows.filter((r) => r.isSales || r.isReferral);
  const answered = deals.filter((r) => r.showStatus);
  const showed = deals.filter((r) => r.showStatus === "showed");
  const decided = deals.filter((r) => r.status);
  const wonRows = deals.filter(won);
  const referrals = rows.filter((r) => r.isReferral);

  const revenue = wonRows.reduce((sum, r) => sum + (r.offer ?? 0), 0);

  return {
    booked: rows.length,
    deals: deals.length,
    answered: answered.length,
    showed: showed.length,
    decided: decided.length,
    won: wonRows.length,
    revenue,
    avgDeal: wonRows.length ? revenue / wonRows.length : 0,
    showRate: answered.length ? (showed.length / answered.length) * 100 : 0,
    closeRate: decided.length ? (wonRows.length / decided.length) * 100 : 0,
    referrals: referrals.length,
    wonReferrals: referrals.filter(won).length,
    commissionOwed: referrals
      .filter((r) => !r.paid)
      .reduce((sum, r) => sum + commissionTotal(r), 0),
    commissionPaid: referrals
      .filter((r) => r.paid)
      .reduce((sum, r) => sum + commissionTotal(r), 0),
  };
}

type Summary = ReturnType<typeof summarise>;

/* ─────────────────────── period buckets (year / quarter) ─────────────────────── */

interface Bucket {
  key: string;
  label: string;
  /** Sorts newest-first without parsing the label back apart. */
  order: number;
  booked: number;
  showed: number;
  won: number;
  revenue: number;
  referrals: number;
}

/**
 * Group rows into calendar periods.
 *
 * Quarters as well as years because "how did Q3 go against Q2" is the question
 * a sales operator actually asks, and a year table can't answer it — by the
 * time a year has a number next to it, the quarter it went wrong in is eleven
 * months gone.
 */
function bucketRows(rows: SalesCallRow[], by: "year" | "quarter"): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const r of rows) {
    if (!r.bookedAt) continue;
    const d = new Date(r.bookedAt);
    const y = d.getFullYear();
    const q = Math.floor(d.getMonth() / 3) + 1;
    const key = by === "year" ? String(y) : `${y}-Q${q}`;
    let hit = m.get(key);
    if (!hit) {
      hit = {
        key,
        label: by === "year" ? String(y) : `Q${q} ${y}`,
        order: by === "year" ? y : y * 10 + q,
        booked: 0,
        showed: 0,
        won: 0,
        revenue: 0,
        referrals: 0,
      };
      m.set(key, hit);
    }
    hit.booked += 1;
    if (r.showStatus === "showed") hit.showed += 1;
    if (r.isReferral) hit.referrals += 1;
    if (won(r)) {
      hit.won += 1;
      hit.revenue += r.offer ?? 0;
    }
  }
  return [...m.values()].sort((a, b) => b.order - a.order);
}

export default function SalesStats({
  rows,
  allRows,
  compareRows,
  compareLabel,
  rangeLabel,
  config,
}: {
  /** Already filtered by date range, call type and archived — the grid's `scoped`. */
  rows: SalesCallRow[];
  /** Unfiltered by date, for the breakdown table only. */
  allRows: SalesCallRow[];
  /** The comparison window, same filters, or null when not comparing. */
  compareRows: SalesCallRow[] | null;
  compareLabel: string | null;
  rangeLabel: string;
  config: SalesOptionsConfig;
}) {
  const [breakdown, setBreakdown] = useState<"year" | "quarter">("year");

  const s = useMemo(() => summarise(rows), [rows]);
  const prev = useMemo(
    () => (compareRows ? summarise(compareRows) : null),
    [compareRows],
  );

  /* ── by month ── */
  const months = useMemo<MonthDatum[]>(() => {
    const m = new Map<string, MonthDatum>();
    for (const r of rows) {
      if (!r.bookedAt) continue;
      const d = new Date(r.bookedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      let hit = m.get(key);
      if (!hit) {
        hit = {
          key,
          short: MONTHS[d.getMonth()],
          full: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
          year: d.getFullYear(),
          month: d.getMonth(),
          booked: 0,
          won: 0,
        };
        m.set(key, hit);
      }
      hit.booked += 1;
      if (won(r)) hit.won += 1;
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [rows]);

  /* ── the breakdown: the one panel that ignores the date range ── */
  const buckets = useMemo(() => bucketRows(allRows, breakdown), [allRows, breakdown]);

  /* ── breakdowns ── */
  const deals = useMemo(() => rows.filter((r) => r.isSales || r.isReferral), [rows]);

  const leadSources = useMemo(
    () => tallyList(deals, config.leadSource, (r) => r.leadSource),
    [deals, config],
  );

  const leadSourceSet = useMemo(() => deals.filter((r) => r.leadSource).length, [deals]);

  const statuses = useMemo(
    () => tallyList(deals, config.dealStatus, (r) => r.status),
    [deals, config],
  );

  const services = useMemo(
    () => tallyList(deals, config.service, (r) => r.service),
    [deals, config],
  );

  const plans = useMemo(
    () => tallyList(deals, config.paymentPlan, (r) => r.paymentPlan),
    [deals, config],
  );

  const attendance = useMemo(
    () => tallyList(deals, config.showStatus, (r) => r.showStatus),
    [deals, config],
  );

  const objections = useMemo(
    () => tallyList(deals, config.objection, (r) => r.objection),
    [deals, config],
  );

  /**
   * How many deals we lost without recording why. This is the number that makes
   * the objection column worth filling in — the panel above it is only as
   * useful as this is small.
   */
  const unexplainedLosses = useMemo(
    () => deals.filter((r) => r.status && !won(r) && !r.objection).length,
    [deals],
  );
  const objectionsSet = useMemo(
    () => deals.filter((r) => r.objection).length,
    [deals],
  );

  /** Revenue by service — where the money actually comes from, vs unit counts. */
  const revenueByService = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of deals) {
      if (!won(r) || !r.service || !r.offer) continue;
      m.set(r.service, (m.get(r.service) ?? 0) + r.offer);
    }
    const known = new Set(config.service.map((i) => i.key));
    const out = config.service.map((i) => ({
      key: i.key,
      label: i.label,
      value: m.get(i.key) ?? 0,
      display: moneyShort(m.get(i.key) ?? 0),
      color: optionColorHex(i.color) ?? undefined,
    }));
    for (const [k, v] of m) {
      if (!known.has(k)) {
        out.push({ key: k, label: k, value: v, display: moneyShort(v), color: undefined });
      }
    }
    return out;
  }, [deals, config]);

  const partners = useMemo(() => {
    const m = new Map<string, { name: string; won: number; payout: number }>();
    for (const r of rows) {
      if (!r.isReferral || !r.referrerName) continue;
      const hit = m.get(r.referrerName) ?? { name: r.referrerName, won: 0, payout: 0 };
      if (won(r)) {
        hit.won += 1;
        hit.payout += partnerPayout(r);
      }
      m.set(r.referrerName, hit);
    }
    return [...m.values()]
      .filter((p) => p.won > 0)
      .map((p) => ({
        key: p.name,
        label: p.name,
        value: p.won,
        display: `${p.won} · ${moneyShort(p.payout)}`,
      }));
  }, [rows]);

  const scope = <Mono className="text-faint">{rangeLabel}</Mono>;

  /** A KPI's sub-line: the delta when comparing, the usual footnote when not. */
  const sub = (
    pick: (x: Summary) => number,
    format: (n: number) => string,
    fallback: React.ReactNode,
  ) =>
    prev ? <Delta value={pick(s)} previous={pick(prev)} format={format} /> : fallback;

  return (
    <div className="space-y-5">
      <KpiRow cols={4}>
        <Kpi
          label="Calls booked"
          value={count(s.booked)}
          sub={sub((x) => x.booked, count, rangeLabel.toLowerCase())}
        />
        <Kpi
          label="Show rate"
          value={percent(s.showRate)}
          tone="pos"
          sub={sub(
            (x) => x.showRate,
            percent,
            `${s.showed} of ${s.answered} logged`,
          )}
        />
        <Kpi
          label="Close rate"
          value={percent(s.closeRate)}
          tone="brand"
          sub={sub(
            (x) => x.closeRate,
            percent,
            `${s.won} of ${s.decided} decided`,
          )}
        />
        <Kpi
          label="Revenue won"
          value={moneyShort(s.revenue)}
          tone="pos"
          sub={sub((x) => x.revenue, moneyShort, `avg ${moneyShort(s.avgDeal)}`)}
        />
      </KpiRow>

      {prev && compareLabel ? (
        <ComparisonTable
          current={s}
          previous={prev}
          currentLabel={rangeLabel}
          previousLabel={compareLabel}
        />
      ) : null}

      <Panel title="Calls booked by month" action={scope}>
        <MonthColumns data={months} />
      </Panel>

      {/* items-start: without it every grid row stretches to its tallest card
          and the shorter panel carries a void, which reads as missing data. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title="Pipeline" action={scope}>
          <Funnel
            stages={[
              { label: "Calls booked", value: s.deals },
              { label: "Showed up", value: s.showed, note: "of those with attendance logged" },
              { label: "Closed won", value: s.won },
            ]}
          />
          <div className="mt-5 grid gap-4 border-t border-edge pt-4 sm:grid-cols-2">
            <Meter label="Show rate" value={s.showed} of={s.answered} tone={VIZ.series2} />
            <Meter label="Close rate" value={s.won} of={s.decided} />
          </div>
        </Panel>

        <Panel
          title="Lead source"
          action={<Mono className="text-faint">{leadSourceSet} of {s.deals} set</Mono>}
        >
          {/* Ranked bars, not a pie: ten categories is past the point where
              slices stay comparable, and length beats angle. */}
          <BarList data={leadSources} total={leadSourceSet} />
          {leadSourceSet < s.deals ? (
            <p className="mt-3 border-t border-edge pt-3 text-[11.5px] text-faint">
              {s.deals - leadSourceSet} deals have no lead source set — percentages are of the{" "}
              {leadSourceSet} that do.
            </p>
          ) : null}
        </Panel>

        <Panel title="Deal status" action={scope}>
          <BarList data={statuses} />
        </Panel>

        <Panel title="Attendance" action={scope}>
          <BarList data={attendance} />
        </Panel>

        <Panel
          title="Why deals don't close"
          action={<Mono className="text-faint">{objectionsSet} recorded</Mono>}
        >
          <BarList
            data={objections}
            total={objectionsSet}
            emptyLabel="No objections recorded yet — the column is on the Deal Desk tab."
          />
          {unexplainedLosses ? (
            <p className="mt-3 border-t border-edge pt-3 text-[11.5px] text-faint">
              {unexplainedLosses} decided-and-not-won{" "}
              {unexplainedLosses === 1 ? "deal has" : "deals have"} no objection
              recorded. This chart is only worth reading once that number is small.
            </p>
          ) : null}
        </Panel>

        <Panel title="Service sold — by deals" action={scope}>
          <BarList data={services} />
        </Panel>

        <Panel title="Service sold — by revenue" action={scope}>
          {/* The same categories ranked by money rather than count: the two
              orders differ, and the difference is the point. */}
          <BarList data={revenueByService} unit="" />
        </Panel>

        <Panel title="Payment plan" action={scope}>
          <BarList data={plans} />
        </Panel>

        <Panel
          title="Referral partners — closed"
          action={<Mono className="text-faint">{s.wonReferrals} won</Mono>}
        >
          <BarList data={partners} emptyLabel="No closed referrals in this range." />
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-edge pt-4">
            <div>
              <Mono className="text-dusk">Commission owed</Mono>
              <div className="mt-1 font-display text-[19px] font-bold tabular-nums text-ember">
                {money(s.commissionOwed)}
              </div>
            </div>
            <div>
              <Mono className="text-dusk">Already paid</Mono>
              <div className="mt-1 font-display text-[19px] font-bold tabular-nums text-teal">
                {money(s.commissionPaid)}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title={breakdown === "year" ? "By year" : "By quarter"}
        action={
          <span className="flex items-center gap-3">
            <Mono className="text-faint">all time · ignores the date filter</Mono>
            <Segmented<"year" | "quarter">
              value={breakdown}
              onChange={setBreakdown}
              ariaLabel="Break down by"
              options={[
                { value: "year", label: "Years" },
                { value: "quarter", label: "Quarters" },
              ]}
            />
          </span>
        }
        bodyClassName="px-0 py-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <TableHead align="left">{breakdown === "year" ? "Year" : "Quarter"}</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Showed</TableHead>
                <TableHead>Won</TableHead>
                <TableHead>Close rate</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Avg deal</TableHead>
                <TableHead>Referrals</TableHead>
                <TableHead>vs prev</TableHead>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => {
                // The row below is the previous period, because the table runs
                // newest-first. The oldest row has nothing under it.
                const before = buckets[i + 1];
                return (
                  <tr key={b.key} className="hover:bg-white/[0.02]">
                    <TableCell align="left">
                      <span className="font-mono text-[13px] text-fog">{b.label}</span>
                    </TableCell>
                    <TableCell>{count(b.booked)}</TableCell>
                    <TableCell>{count(b.showed)}</TableCell>
                    <TableCell>
                      <span style={{ color: VIZ.series2 }}>{count(b.won)}</span>
                    </TableCell>
                    <TableCell>
                      {b.booked ? percent((b.won / b.booked) * 100) : "—"}
                    </TableCell>
                    <TableCell>{moneyShort(b.revenue)}</TableCell>
                    <TableCell>{b.won ? moneyShort(b.revenue / b.won) : "—"}</TableCell>
                    <TableCell>{count(b.referrals)}</TableCell>
                    <TableCell>
                      {before ? (
                        <Delta
                          value={b.revenue}
                          previous={before.revenue}
                          format={moneyShort}
                        />
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {buckets.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-dusk">No dated calls yet.</p>
        ) : null}
      </Panel>
    </div>
  );
}

/* ─────────────────────── the period comparison ─────────────────────── */

/**
 * Two windows, line by line.
 *
 * The KPI strip already shows four deltas; this exists because the interesting
 * comparison is rarely one of those four. A quarter where revenue held steady
 * while the close rate fell and the booking count rose is a different business
 * problem from one where all three moved together, and only a table shows that
 * at a glance.
 *
 * Rates are compared in POINTS, not percent. "Close rate up 12%" from a base of
 * 40% is ambiguous — 52% or 44.8%? — so the rate rows print the point movement
 * and the delta column carries the same number rather than a percent of a
 * percent.
 */
function ComparisonTable({
  current,
  previous,
  currentLabel,
  previousLabel,
}: {
  current: Summary;
  previous: Summary;
  currentLabel: string;
  previousLabel: string;
}) {
  const lines: {
    label: string;
    pick: (s: Summary) => number;
    format: (n: number) => string;
    points?: boolean;
  }[] = [
    { label: "Calls booked", pick: (s) => s.booked, format: count },
    { label: "In deal desk", pick: (s) => s.deals, format: count },
    { label: "Showed up", pick: (s) => s.showed, format: count },
    { label: "Show rate", pick: (s) => s.showRate, format: percent, points: true },
    { label: "Closed won", pick: (s) => s.won, format: count },
    { label: "Close rate", pick: (s) => s.closeRate, format: percent, points: true },
    { label: "Revenue won", pick: (s) => s.revenue, format: money },
    { label: "Average deal", pick: (s) => s.avgDeal, format: money },
    { label: "Referrals", pick: (s) => s.referrals, format: count },
    { label: "Referrals closed", pick: (s) => s.wonReferrals, format: count },
  ];

  return (
    <Panel
      title="Period comparison"
      action={
        <Mono className="text-faint">
          {currentLabel} vs {previousLabel}
        </Mono>
      }
      bodyClassName="px-0 py-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <TableHead align="left">Metric</TableHead>
              <TableHead>{currentLabel}</TableHead>
              <TableHead>{previousLabel}</TableHead>
              <TableHead>Change</TableHead>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const now = line.pick(current);
              const then = line.pick(previous);
              const diff = now - then;
              return (
                <tr key={line.label} className="hover:bg-white/[0.02]">
                  <TableCell align="left">
                    <span className="font-body text-[12.5px] text-mist">{line.label}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-fog">{line.format(now)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-dusk">{line.format(then)}</span>
                  </TableCell>
                  <TableCell>
                    {line.points ? (
                      <span
                        className="font-mono text-[11.5px] tabular-nums"
                        style={{
                          color:
                            Math.abs(diff) < 0.5 ? "#8f88a0"
                            : diff > 0 ? VIZ.series2
                            : "#ff6b7a",
                        }}
                      >
                        {Math.abs(diff) < 0.5 ? "→" : diff > 0 ? "▲" : "▼"}{" "}
                        {Math.abs(Math.round(diff))} pts
                      </span>
                    ) : (
                      <Delta value={now} previous={then} format={line.format} />
                    )}
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
