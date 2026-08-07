"use client";

/**
 * The Stats tab — aggregate view over the same `salesCalls` the grid edits.
 *
 * Reads the rows already in memory rather than fetching or aggregating server
 * side: the whole pipeline is ~800 rows, every number here is a single pass
 * over an array, and computing in the browser means the figures track the
 * toolbar filters instantly instead of round-tripping.
 *
 * SCOPE RULE: every panel respects the current date range and call-type filter,
 * with exactly one documented exception — "By year", whose entire job is the
 * multi-year comparison. Its header says so. Archived rows are excluded
 * everywhere, by the same filter the grid uses.
 *
 * Chart forms and colours are not free choices here; see the header of viz.tsx
 * for what was validated and why almost everything is one hue.
 */

import { useMemo } from "react";
import {
  DEAL_STATUS_META,
  commissionTotal,
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
  TableCell,
  TableHead,
} from "@/components/portal/widgets/ui";
import { BarList, Funnel, Meter, MonthColumns, VIZ, type MonthDatum } from "./viz";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const moneyShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}m`
  : n >= 1000 ? `$${Math.round(n / 1000)}k`
  : `$${Math.round(n)}`;

/** Status tone → the portal's existing token. Status is never colour alone. */
const STATUS_HEX: Record<"pos" | "warn" | "neg" | "mute", string> = {
  pos: "#29a294",
  warn: "#ff5c2e",
  neg: "#ff6b7a",
  mute: "#5f5870",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const won = (r: SalesCallRow) => Boolean(r.status && DEAL_STATUS_META[r.status].counts);

/**
 * Tally rows against a configured option list: every configured key in list
 * order (labels as edited), plus any stray keys found on rows appended at the
 * end — a retired-then-forgotten option still shows its historical deals.
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
  }));
  for (const [k, v] of counts) {
    if (!known.has(k)) out.push({ key: k, label: k, value: v });
  }
  return out;
}

export default function SalesStats({
  rows,
  allRows,
  rangeLabel,
  config,
}: {
  /** Already filtered by date range, call type and archived — the grid's `scoped`. */
  rows: SalesCallRow[];
  /** Unfiltered by date, for the by-year panel only. */
  allRows: SalesCallRow[];
  rangeLabel: string;
  config: SalesOptionsConfig;
}) {
  const s = useMemo(() => {
    const deals = rows.filter((r) => r.isSales || r.isReferral);
    const answered = deals.filter((r) => r.showStatus);
    const showed = deals.filter((r) => r.showStatus === "showed");
    const decided = deals.filter((r) => r.status);
    const wonRows = deals.filter(won);
    const referrals = rows.filter((r) => r.isReferral);
    const wonReferrals = referrals.filter(won);

    const revenue = wonRows.reduce((sum, r) => sum + (r.offer ?? 0), 0);
    const offered = decided.reduce((sum, r) => sum + (r.offer ?? 0), 0);

    return {
      booked: rows.length,
      deals: deals.length,
      answered: answered.length,
      showed: showed.length,
      decided: decided.length,
      won: wonRows.length,
      revenue,
      offered,
      avgDeal: wonRows.length ? revenue / wonRows.length : 0,
      referrals: referrals.length,
      wonReferrals: wonReferrals.length,
      commissionOwed: referrals
        .filter((r) => !r.paid)
        .reduce((sum, r) => sum + commissionTotal(r), 0),
      commissionPaid: referrals
        .filter((r) => r.paid)
        .reduce((sum, r) => sum + commissionTotal(r), 0),
    };
  }, [rows]);

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

  /* ── by year: the one panel that ignores the date range ── */
  const years = useMemo(() => {
    const m = new Map<number, { booked: number; showed: number; won: number; revenue: number; referrals: number }>();
    for (const r of allRows) {
      if (!r.bookedAt) continue;
      const y = new Date(r.bookedAt).getFullYear();
      const hit = m.get(y) ?? { booked: 0, showed: 0, won: 0, revenue: 0, referrals: 0 };
      hit.booked += 1;
      if (r.showStatus === "showed") hit.showed += 1;
      if (r.isReferral) hit.referrals += 1;
      if (won(r)) {
        hit.won += 1;
        hit.revenue += r.offer ?? 0;
      }
      m.set(y, hit);
    }
    return [...m.entries()].sort(([a], [b]) => b - a);
  }, [allRows]);

  /* ── breakdowns ── */
  const deals = useMemo(() => rows.filter((r) => r.isSales || r.isReferral), [rows]);

  const leadSources = useMemo(
    () => tallyList(deals, config.leadSource, (r) => r.leadSource),
    [deals, config],
  );

  const leadSourceSet = useMemo(() => deals.filter((r) => r.leadSource).length, [deals]);

  const statuses = useMemo(
    () =>
      tallyList(deals, config.dealStatus, (r) => r.status).map((row) => ({
        ...row,
        color:
          STATUS_HEX[
            DEAL_STATUS_META[row.key as keyof typeof DEAL_STATUS_META]?.tone ?? "mute"
          ],
      })),
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
    () =>
      tallyList(deals, config.showStatus, (r) => r.showStatus).map((row) => ({
        ...row,
        color:
          row.key === "showed" ? STATUS_HEX.pos
          : row.key === "no-show" ? STATUS_HEX.neg
          : STATUS_HEX.mute,
      })),
    [deals, config],
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
    }));
    for (const [k, v] of m) {
      if (!known.has(k)) out.push({ key: k, label: k, value: v, display: moneyShort(v) });
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

  return (
    <div className="space-y-5">
      <KpiRow cols={4}>
        <Kpi label="Calls booked" value={s.booked.toLocaleString()} sub={rangeLabel.toLowerCase()} />
        <Kpi
          label="Show rate"
          value={`${s.answered ? Math.round((s.showed / s.answered) * 100) : 0}%`}
          tone="pos"
          sub={`${s.showed} of ${s.answered} logged`}
        />
        <Kpi
          label="Close rate"
          value={`${s.decided ? Math.round((s.won / s.decided) * 100) : 0}%`}
          tone="brand"
          sub={`${s.won} of ${s.decided} decided`}
        />
        <Kpi label="Revenue won" value={moneyShort(s.revenue)} tone="pos" sub={`avg ${moneyShort(s.avgDeal)}`} />
      </KpiRow>

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
        title="By year"
        action={<Mono className="text-faint">all time · ignores the date filter</Mono>}
        bodyClassName="px-0 py-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <TableHead align="left">Year</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Showed</TableHead>
                <TableHead>Won</TableHead>
                <TableHead>Close rate</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Avg deal</TableHead>
                <TableHead>Referrals</TableHead>
              </tr>
            </thead>
            <tbody>
              {years.map(([year, y]) => (
                <tr key={year} className="hover:bg-white/[0.02]">
                  <TableCell align="left">
                    <span className="font-mono text-[13px] text-fog">{year}</span>
                  </TableCell>
                  <TableCell>{y.booked.toLocaleString()}</TableCell>
                  <TableCell>{y.showed.toLocaleString()}</TableCell>
                  <TableCell>
                    <span style={{ color: VIZ.series2 }}>{y.won.toLocaleString()}</span>
                  </TableCell>
                  <TableCell>{y.booked ? `${Math.round((y.won / y.booked) * 100)}%` : "—"}</TableCell>
                  <TableCell>{moneyShort(y.revenue)}</TableCell>
                  <TableCell>{y.won ? moneyShort(y.revenue / y.won) : "—"}</TableCell>
                  <TableCell>{y.referrals.toLocaleString()}</TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {years.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-dusk">No dated calls yet.</p>
        ) : null}
      </Panel>
    </div>
  );
}
