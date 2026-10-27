"use client";

import { useEffect, useMemo, useState } from "react";
import CountUp from "@/components/ui/CountUp";
import { Mono, Panel, Segmented, TableCell, TableHead } from "@/components/portal/widgets/ui";
import { VIZ } from "@/components/portal/viz";
import { money, shortDate } from "@/lib/widget-format";
import type { SavingsBoard as Board } from "@/lib/tax-recap/board";

/**
 * The savings board: the team's own sheet of what the recaps add up to. One
 * hero figure, a hairline KPI strip, then a tax-year filter scoping two
 * panels (clients by band, the scoreboard) and the five latest recaps.
 *
 * Drawn with the portal chart kit's rules (viz.tsx): one magnitude hue for
 * every bar, direct labels on every row, hairline grid, nothing dashed. The
 * only two-tone element is the by-year strip, which is ordered, so it takes
 * steps of the one hue. Every figure rolls in through the shared CountUp.
 */
export default function SavingsBoard({ board }: { board: Board }) {
  const [year, setYear] = useState(board.years[0]?.key ?? "all");
  const scope = board.years.find((y) => y.key === year) ?? board.years[board.years.length - 1];
  const { lifetime, last12 } = board;
  const delta = last12.prior > 0 ? Math.round(((last12.savings - last12.prior) / last12.prior) * 100) : null;
  const yearsLabel =
    lifetime.firstTaxYear === lifetime.lastTaxYear ? `${lifetime.lastTaxYear}` : `${lifetime.firstTaxYear}–${lifetime.lastTaxYear}`;

  if (!lifetime.recaps) {
    return (
      <Panel title="Savings board">
        <p className="text-[13px] text-dusk">Nothing saved yet — the first recap lands here.</p>
      </Panel>
    );
  }

  return (
    <div>
      {/* ── lifetime ── */}
      <div className="grid items-end gap-x-9 gap-y-5 md:grid-cols-[auto_1fr]">
        <div>
          <Mono className="text-dusk">Lifetime tax saved · all years, all clients</Mono>
          <div className="mt-2 font-display text-[clamp(44px,7vw,76px)] font-bold leading-none tracking-[-0.03em] text-fog">
            <CountUp value={lifetime.savings} />
          </div>
          <div className="mt-2.5 text-[13px] text-muted">
            <span className="text-mist">{lifetime.recaps} recaps</span> ·{" "}
            <span className="text-mist">{lifetime.clients} clients</span> · {yearsLabel} returns · revoked links included
          </div>
        </div>
        <YearStrip byYear={lifetime.byYear} total={lifetime.savings} />
      </div>

      {/* ── the twelve-month strip ── */}
      <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-edge bg-edge md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <Tile label="Saved in the last 12 months" value={<CountUp value={last12.savings} />}>
          <div className="text-[11.5px] leading-snug text-dusk">
            {delta != null ? (
              <>
                <b className={`font-semibold ${delta >= 0 ? "text-teal" : "text-danger"}`}>
                  {delta >= 0 ? "+" : "−"}
                  {Math.abs(delta)}%
                </b>{" "}
                on the 12 months before ({money(last12.prior)}) · by recap date
              </>
            ) : (
              "by recap date · nothing in the 12 months before to compare"
            )}
          </div>
          <Spark months={last12.months} total={last12.savings} />
        </Tile>
        <Tile
          label="Median saved per client"
          value={last12.median != null ? <CountUp value={last12.median} delay={150} /> : "—"}
          sub={
            last12.median != null
              ? `last 12 months · average ${money(last12.average ?? 0)} · ${last12.clients} clients`
              : "no client saved in the last 12 months"
          }
        />
        <Tile
          label="Median cut in the tax bill"
          value={board.pctCut != null ? <CountUp value={board.pctCut} format="int" suffix="%" delay={300} /> : "—"}
          tone="pos"
          sub="savings ÷ the before return's total tax, per recap"
        />
        <Tile
          label="Recaps built"
          value={<CountUp value={last12.recaps} format="int" delay={450} />}
          sub={`last 12 months · ${last12.thisMonth} so far this month`}
        />
      </div>

      {/* ── the year filter, scoping the two panels under it ── */}
      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <Mono className="text-dusk">Tax year</Mono>
        <Segmented
          value={year}
          onChange={setYear}
          size="sm"
          ariaLabel="Tax year"
          options={board.years.map((y) => ({ value: y.key, label: y.label }))}
        />
        <span className="text-[12px] text-dusk">scopes the two panels below · lifetime and 12-month figures don&rsquo;t change</span>
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        <Panel
          title="Clients by savings band"
          action={<Mono className="text-dusk">{scope.clients} clients · {scope.label.toLowerCase()}</Mono>}
        >
          <Rows
            rows={scope.bands.map((b) => ({ key: b.label, label: b.label, sub: "saved", value: b.count }))}
            denom={scope.clients}
            format="int"
            unit="clients"
            empty="Nobody in a band yet for this year."
          />
          <p className="mb-0 mt-3 text-[12px] leading-relaxed text-dusk">
            A client with more than one recap in the year counts once, by their total. Bands are what the
            client saved, not their income.
          </p>
        </Panel>
        <Panel
          title="Scoreboard · saved by builder"
          action={<Mono className="text-dusk">{money(scope.savings)} · {scope.label.toLowerCase()}</Mono>}
        >
          <Rows
            rows={scope.builders.map((b) => ({
              key: b.who,
              label: b.who,
              sub: `${b.recaps} recap${b.recaps === 1 ? "" : "s"}`,
              value: b.savings,
            }))}
            denom={scope.savings}
            format="money"
            empty="No recaps for this year yet."
          />
          <p className="mb-0 mt-3 text-[12px] leading-relaxed text-dusk">
            Keyed by who saved the recap. A pod or manager field on the Staff page would let this roll up by
            team instead.
          </p>
        </Panel>
      </div>

      {/* ── the latest five ── */}
      <Panel title="Latest recaps" className="mt-3.5" bodyClassName="!px-0 !py-0" action={<Mono className="text-dusk">newest first</Mono>}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <TableHead align="left">Client</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Before</TableHead>
                <TableHead>After</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead align="left">Built by</TableHead>
                <TableHead align="left">When</TableHead>
              </tr>
            </thead>
            <tbody>
              {board.latest.map((r, i) => (
                <tr key={`${r.clientName}-${r.taxYear}-${i}`} className="even:bg-white/[0.02]">
                  <TableCell align="left">
                    <span className="font-body text-fog">{r.clientName}</span>
                  </TableCell>
                  <TableCell>{r.taxYear}</TableCell>
                  <TableCell>{money(r.before)}</TableCell>
                  <TableCell>{money(r.after)}</TableCell>
                  <TableCell>
                    <span className={r.savings >= 0 ? "font-semibold text-teal" : "font-semibold text-danger"}>{money(r.savings)}</span>
                  </TableCell>
                  <TableCell align="left">
                    <span className="font-body text-[12px] text-dusk">{r.who}</span>
                  </TableCell>
                  <TableCell align="left">
                    <span className="font-body text-mist">{r.createdAt ? shortDate(new Date(r.createdAt)) : "—"}</span>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="mb-0 mt-5 max-w-[72ch] text-[12px] leading-relaxed text-dusk">
        Lifetime, the by-year split, the bands and the scoreboard go by tax year — the return&rsquo;s year.
        The 12-month figures go by the date the recap was saved, so they read as the team&rsquo;s output.
        Totals include every recap, revoked links and loss years alike; medians and bands count only
        what came out positive. The home page&rsquo;s figures are built from the same records.
      </p>
    </div>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

/** One cell of the hairline strip. */
function Tile({
  label,
  value,
  sub,
  tone = "plain",
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "plain" | "pos";
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-panel px-[18px] py-4">
      <Mono className="text-dusk">{label}</Mono>
      <div
        className={`mt-2 font-display text-[26px] font-bold leading-none tracking-[-0.015em] ${
          tone === "pos" ? "text-teal" : "text-fog"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-2 text-[11.5px] leading-snug text-dusk">{sub}</div> : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

/**
 * Lifetime by tax year, as one strip: ordered, so it takes lightness steps of
 * the one hue rather than three colours, with a 2px surface gap between.
 */
function YearStrip({ byYear, total }: { byYear: Board["lifetime"]["byYear"]; total: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, []);
  const positive = byYear.filter((y) => y.savings > 0);
  const sum = positive.reduce((s, y) => s + y.savings, 0) || 1;
  if (!positive.length || total <= 0) return <div />;
  return (
    <div className="min-w-0">
      <Mono className="text-dusk">By tax year</Mono>
      <div className="mt-2.5 flex h-[14px] gap-[2px]" aria-hidden>
        {positive.map((y, i) => (
          <div
            key={y.taxYear}
            className={`h-full min-w-0 transition-[flex-basis] duration-[900ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none ${
              i === 0 ? "rounded-l-[4px]" : ""
            } ${i === positive.length - 1 ? "rounded-r-[4px]" : ""}`}
            style={{
              flex: `0 0 ${ready ? (y.savings / sum) * 100 : 0}%`,
              background: VIZ.series,
              opacity: 0.5 + (0.5 * (i + 1)) / positive.length,
            }}
          />
        ))}
      </div>
      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${positive.length}, minmax(0, 1fr))` }}>
        {positive.map((y) => (
          <div key={y.taxYear} className="min-w-0 font-mono text-[11px] tabular-nums text-mist">
            <div className="truncate font-mono text-[9.5px] uppercase tracking-[1.2px] text-dusk">
              {y.taxYear} · {y.recaps} recap{y.recaps === 1 ? "" : "s"}
            </div>
            <div className="mt-0.5">{money(y.savings)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Twelve months of savings by recap date — a sparkline in the series hue,
 * 2px line, a wash under it, the last point marked, a chip on hover.
 */
function Spark({ months, total }: { months: Board["last12"]["months"]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 44;
  const max = Math.max(1, ...months.map((m) => m.savings)) * 1.12;
  const x = (i: number) => 4 + (i / Math.max(1, months.length - 1)) * (W - 8);
  const y = (v: number) => H - 4 - (Math.max(0, v) / max) * (H - 8);
  const pts = months.map((m, i) => `${x(i)},${y(m.savings)}`).join(" ");
  const last = months.length - 1;
  const h = hover != null ? months[hover] : null;
  return (
    <div className="relative h-11">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-label="Tax saved per month, last twelve months">
        <polygon points={`${x(0)},${H} ${pts} ${x(last)},${H}`} fill={VIZ.series} opacity={0.1} />
        <polyline points={pts} fill="none" stroke={VIZ.series} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(last)} cy={y(months[last]?.savings ?? 0)} r={4} fill={VIZ.series} stroke="var(--color-panel)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hover != null && hover !== last && (
          <circle cx={x(hover)} cy={y(months[hover].savings)} r={4} fill={VIZ.series} stroke="var(--color-panel)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div
        className="absolute inset-0"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last))));
        }}
        onPointerLeave={() => setHover(null)}
      />
      {h && hover != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-edge-mid bg-panel-2 px-2.5 py-1.5 shadow-[0_10px_30px_-14px_rgba(0,0,0,.6)]"
          style={{ left: `${(hover / Math.max(1, last)) * 100}%`, top: -6 }}
        >
          <div className="font-mono text-[9px] uppercase tracking-[1.2px] text-dusk">{h.label}</div>
          <div className="mt-0.5 font-mono text-[12.5px] font-semibold tabular-nums text-fog">{money(h.savings)}</div>
          <div className="mt-0.5 font-mono text-[9.5px] text-mist">
            {h.recaps} recap{h.recaps === 1 ? "" : "s"}
            {total > 0 ? ` · ${Math.round((h.savings / total) * 100)}% of the 12 months` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Horizontal bars in the kit's form — ≤24px thick, 4px data end, square at
 * the baseline, a direct label on every row — in the order given (the bands
 * are ordered; the scoreboard arrives ranked).
 */
function Rows({
  rows,
  denom,
  format,
  unit,
  empty,
}: {
  rows: { key: string; label: string; sub?: string; value: number }[];
  /** The whole, for the % beside each figure. */
  denom: number;
  format: "money" | "int";
  unit?: string;
  empty: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, []);
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.value)), [rows]);
  if (!rows.some((r) => r.value > 0)) {
    return <p className="py-6 text-center text-[12.5px] text-dusk">{empty}</p>;
  }
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div
          key={r.key}
          className="-mx-1.5 grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/[0.03] sm:grid-cols-[150px_minmax(0,1fr)_auto]"
        >
          <div className="min-w-0">
            <div className="truncate text-[12.5px] text-fog" title={r.label}>
              {r.label}
            </div>
            {r.sub ? <div className="font-mono text-[9.5px] uppercase tracking-[1px] text-dusk">{r.sub}</div> : null}
          </div>
          <div className="relative h-[18px]">
            <div
              className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
              style={{ width: `${ready ? Math.max((r.value / max) * 100, r.value > 0 ? 1.5 : 0) : 0}%`, background: VIZ.series }}
            />
          </div>
          <div className="whitespace-nowrap text-right font-mono text-[12.5px] tabular-nums text-fog">
            <CountUp value={r.value} format={format} />
            {unit ? <span className="ml-1.5 text-[10px] text-dusk">{unit}</span> : null}
            <span className="ml-2 text-[11px] text-dusk">{denom > 0 ? Math.round((r.value / denom) * 100) : 0}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}
