"use client";

/**
 * Tax Savings Snapshot — the four-step client-facing walkthrough.
 *
 *   1. Where they are now      — tax owed before a single write-off
 *   2. What we can do          — strategies toggled on, bill drops live
 *   3. The bottom line         — annual and three-year savings
 *   4. The long game           — those savings invested to retirement
 *
 * The one piece of modelling worth understanding is how per-strategy savings
 * are attributed. Strategies interact — a write-off that drops someone into a
 * lower bracket changes what the S-corp election is worth — so a naive
 * "run each one alone" attribution wouldn't sum to the total. Instead they're
 * applied in a fixed order (ORDER below) and each one is credited with the
 * marginal drop it causes on top of the ones before it. The rows always add up.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import { money, toNum } from "@/lib/widget-format";
import { STATE_NAMES } from "@/lib/tax";
import {
  LIMITS,
  SE,
  SS_WAGE_BASE,
  STD_DED,
  estimateTax,
  latestLateYear,
  monthsLate,
  penaltyFor,
  type WizardStatus,
} from "@/lib/widget-tax";
import { CHART, LineChart } from "@/components/portal/widgets/charts";
import {
  Check,
  Disclaimer,
  Field,
  Kpi,
  KpiRow,
  LineRow,
  Mono,
  MoneyFlow,
  Note,
  NumInput,
  Panel,
  SelectInput,
  Slider,
  StrategyCard,
  Switch,
} from "@/components/portal/widgets/ui";

/* ────────────────────────────── the model ────────────────────────────── */

type RetPlan = "sep" | "solo" | null;

interface ScenarioOpts {
  revenue: number;
  w2: number;
  status: WizardStatus;
  state: string;
  useStd: boolean;
  useQBI: boolean;
  curExp?: number;
  found?: number;
  ho?: boolean;
  rent?: number;
  util?: number;
  hopct?: number;
  scorp?: boolean;
  salary?: number;
  retPlan?: RetPlan;
}

interface ScenarioResult {
  total: number;
  net: number;
  salary: number;
  maxRet: number;
  seSaved: number;
}

/**
 * Total tax under one set of active strategies.
 *
 * The S-corp branch is the subtle one: the income-tax base is still computed
 * off net profit, but the payroll line replaces self-employment tax with FICA
 * on the salary alone. That difference is the whole point of the election.
 */
function evalScenario(o: ScenarioOpts): ScenarioResult {
  const writeoff = (o.curExp ?? 0) + (o.found ?? 0);
  let net = Math.max(0, o.revenue - writeoff);

  if (o.ho) {
    const wr = Math.min(
      ((o.rent ?? 0) + (o.util ?? 0)) * 12 * ((o.hopct ?? 0) / 100),
      net,
    );
    net = Math.max(0, net - wr);
  }

  const salary = o.scorp ? Math.min(o.salary ?? 0, net) : 0;

  // Retirement room depends on the entity and on net profit *at this point* in
  // the stack, so it's computed after write-offs and after the S-corp salary.
  const preRet = estimateTax({
    net,
    status: o.status,
    state: o.state,
    other: o.w2,
    useStd: o.useStd,
    useQBI: o.useQBI,
  });
  const halfSE = preRet.seTax / 2;

  const employerMax = o.scorp
    ? LIMITS.sepPctScorp * salary
    : LIMITS.sepPctSoleProp * Math.max(0, net - halfSE);
  const retBase = o.scorp ? salary : Math.max(0, net - halfSE);

  const maxSEP = Math.min(employerMax, LIMITS.dcLimit);
  const maxSolo = Math.min(
    Math.min(LIMITS.deferral, retBase) + employerMax,
    LIMITS.dcLimit,
  );
  const maxRet =
    o.retPlan === "solo" ? maxSolo : o.retPlan === "sep" ? maxSEP : 0;

  const r = estimateTax({
    net,
    status: o.status,
    state: o.state,
    other: o.w2,
    adjust: o.retPlan ? maxRet : 0,
    useStd: o.useStd,
    useQBI: o.useQBI,
  });

  // Under an S-corp, FICA on wages replaces SE tax on the whole profit.
  const ficaS = o.scorp
    ? Math.min(salary, Math.max(0, SS_WAGE_BASE - o.w2)) * SE.ss +
      salary * SE.medicare
    : 0;
  const seLine = o.scorp ? ficaS : r.seTax;

  return {
    total: r.fed + r.stateTax + seLine,
    net,
    salary,
    maxRet,
    seSaved: Math.max(0, r.seTax - ficaS),
  };
}

/** Fixed attribution order, so per-row gains sum to the headline total. */
const ORDER = ["yours", "ours", "ho", "scorp", "retire"] as const;
type GainKey = (typeof ORDER)[number];

/* The penalty run needs today's date, and reading the clock during render
   would desync the server and client markup. This hands the server a null
   snapshot and the client a single Date fixed for the life of the page —
   penalty figures shouldn't drift under someone mid-call anyway. */
let clientNow: Date | null = null;
const subscribeNow = () => () => {};
const getClientNow = () => (clientNow ??= new Date());
const getServerNow = () => null;

/* ──────────────────────────── the component ──────────────────────────── */

const STEPS = [
  "Where you are now",
  "What we can do",
  "Make it make cents",
  "The long game",
] as const;

export default function SavingsWizard() {
  const [step, setStep] = useState(1);

  // step 1
  const [revenue, setRevenue] = useState("150000");
  const [w2, setW2] = useState("0");
  const [usState, setUsState] = useState("Massachusetts");
  const [status, setStatus] = useState<WizardStatus>("single");
  const [useStd, setUseStd] = useState(false);
  const [useQBI, setUseQBI] = useState(false);

  // step 1 — behind-on-filing
  const [penOn, setPenOn] = useState(false);
  const [ext, setExt] = useState(false);
  /** null = follow the most recent overdue year rather than pin one. */
  const [taxYearSel, setTaxYearSel] = useState<number | null>(null);
  const [penBase, setPenBase] = useState("");
  const [penBaseDirty, setPenBaseDirty] = useState(false);

  // step 2 — strategies
  const [onYours, setOnYours] = useState(false);
  const [onOurs, setOnOurs] = useState(false);
  const [onHo, setOnHo] = useState(false);
  const [onScorp, setOnScorp] = useState(false);
  const [retPlanSel, setRetPlanSel] = useState<RetPlan>(null);

  const [curExp, setCurExp] = useState("0");
  const [found, setFound] = useState("0");
  const [rent, setRent] = useState("2500");
  const [util, setUtil] = useState("300");
  const [hoPct, setHoPct] = useState(15);
  const [salaryPct, setSalaryPct] = useState(25);

  // step 4
  const [age, setAge] = useState("35");
  const [retAge, setRetAge] = useState("65");
  const [investPct, setInvestPct] = useState(100);
  const [investRate, setInvestRate] = useState(7);

  const now = useSyncExternalStore(subscribeNow, getClientNow, getServerNow);
  const taxYear = taxYearSel ?? (now ? latestLateYear(now) : null);

  const base = useMemo(
    () => ({
      revenue: Math.max(0, toNum(revenue)),
      w2: Math.max(0, toNum(w2)),
      status,
      state: usState,
      useStd,
      useQBI,
    }),
    [revenue, w2, status, usState, useStd, useQBI],
  );

  /* ── step 1: the anchor ── */
  const anchor = useMemo(() => {
    const r = estimateTax({
      net: base.revenue,
      status: base.status,
      state: base.state,
      other: base.w2,
      useStd: base.useStd,
      useQBI: base.useQBI,
    });
    // Split the federal line so a client with a day job can see which part of
    // the bill their business is actually responsible for.
    const stdAmt = base.useStd ? STD_DED[base.status] : 0;
    const w2Fed =
      base.w2 > 0
        ? Math.min(
            r.fed,
            estimateTax({
              net: 0,
              status: base.status,
              state: base.state,
              other: Math.max(0, base.w2 - stdAmt),
              useStd: false,
              useQBI: false,
            }).fed,
          )
        : 0;
    const income = base.revenue + base.w2;
    return {
      ...r,
      w2Fed,
      bizFed: Math.max(0, r.fed - w2Fed),
      effRate: income > 0 ? (r.total / income) * 100 : 0,
    };
  }, [base]);

  /* Retirement contributions must be made by the filing deadline (including an
     extension). If the client is behind far enough that the window has closed,
     SEP and Solo are simply off the table — the tool refuses rather than
     quoting a saving they can't have. */
  const retLocked = useMemo(() => {
    if (!penOn || !now || taxYear == null) return false;
    if (!ext) return true; // no extension → past the April deadline
    return now >= new Date(taxYear + 1, 9, 15); // extension → closed after Oct 15
  }, [penOn, now, taxYear, ext]);

  // A locked plan is simply not in play — the selection is remembered so that
  // clearing the penalty toggle brings it straight back.
  const retPlan: RetPlan = retLocked ? null : retPlanSel;

  /* ── step 2: strategies, applied in order ── */
  const c = useMemo(() => {
    const baseline = evalScenario(base).total;

    const cur: ScenarioOpts = { ...base };
    if (onYours) cur.curExp = Math.max(0, toNum(curExp));
    if (onOurs) cur.found = Math.max(0, toNum(found));
    if (onHo) {
      cur.ho = true;
      cur.rent = Math.max(0, toNum(rent));
      cur.util = Math.max(0, toNum(util));
      cur.hopct = Math.max(0, Math.min(100, hoPct));
    }
    if (onScorp) {
      cur.scorp = true;
      const gp = Math.max(
        0,
        base.revenue - (cur.curExp ?? 0) - (cur.found ?? 0),
      );
      cur.salary = Math.round((gp * salaryPct) / 100);
    }
    if (retPlan) cur.retPlan = retPlan;

    const running: ScenarioOpts = { ...base };
    let prev = baseline;
    const gains: Record<GainKey, number> = {
      yours: 0,
      ours: 0,
      ho: 0,
      scorp: 0,
      retire: 0,
    };

    for (const k of ORDER) {
      if (k === "yours" && cur.curExp != null) running.curExp = cur.curExp;
      else if (k === "ours" && cur.found != null) running.found = cur.found;
      else if (k === "ho" && cur.ho) {
        running.ho = true;
        running.rent = cur.rent;
        running.util = cur.util;
        running.hopct = cur.hopct;
      } else if (k === "scorp" && cur.scorp) {
        running.scorp = true;
        running.salary = cur.salary;
      } else if (k === "retire" && cur.retPlan) running.retPlan = cur.retPlan;
      else continue;

      const t = evalScenario(running).total;
      gains[k] = Math.max(0, prev - t);
      prev = t;
    }

    return {
      baseline,
      optimized: prev,
      gains,
      totalSavings: Math.max(0, baseline - prev),
      full: evalScenario(cur),
      curExpAmt: cur.curExp ?? 0,
      foundAmt: cur.found ?? 0,
    };
  }, [
    base,
    onYours,
    onOurs,
    onHo,
    onScorp,
    retPlan,
    curExp,
    found,
    rent,
    util,
    hoPct,
    salaryPct,
  ]);

  /* Split the write-off savings between what they already claim and what we
     find on top, so the second number is provably incremental. */
  const writeoffSplit = useMemo(() => {
    const cx = onYours ? Math.max(0, toNum(curExp)) : 0;
    const fd = onOurs ? Math.max(0, toNum(found)) : 0;
    const tGross = evalScenario(base).total;
    const tCur = evalScenario({ ...base, curExp: cx }).total;
    const tFound = evalScenario({ ...base, curExp: cx, found: fd }).total;
    return {
      cx,
      fd,
      savX: Math.max(0, tGross - tCur),
      savY: Math.max(0, tCur - tFound),
    };
  }, [base, onYours, onOurs, curExp, found]);

  /* ── back-tax penalties ── */
  const penalty = useMemo(() => {
    if (!penOn || !now || taxYear == null) {
      return {
        active: false as const,
        saved: 0,
        allInBefore: c.baseline,
        allInAfter: c.optimized,
      };
    }
    const bse = penBaseDirty
      ? Math.max(0, toNum(penBase))
      : Math.max(0, anchor.total);
    // Strategies that shrink the tax owed shrink the penalties in proportion.
    const ratio =
      c.baseline > 0 ? Math.min(1, Math.max(0, c.optimized / c.baseline)) : 1;
    const after = bse * ratio;
    const pBefore = penaltyFor(bse, taxYear, ext, now);
    const pAfter = penaltyFor(after, taxYear, ext, now);
    return {
      active: true as const,
      base: bse,
      detail: pBefore,
      lateMonths: monthsLate(pBefore.origDue, now),
      penBefore: pBefore.total,
      penAfter: pAfter.total,
      saved: Math.max(0, pBefore.total - pAfter.total),
      allInBefore: bse + pBefore.total,
      allInAfter: after + pAfter.total,
    };
  }, [penOn, now, taxYear, ext, penBase, penBaseDirty, anchor.total, c.baseline, c.optimized]);

  const penSaved = penalty.active ? penalty.saved : 0;

  /* ── step 4: compounding ── */
  const invest = useMemo(() => {
    const annual = (c.totalSavings * investPct) / 100;
    const lump = (penSaved * investPct) / 100;
    const a = Math.max(0, toNum(age));
    const r = Math.max(0, toNum(retAge));
    const years = Math.max(0, Math.round(r - a));
    const rate = investRate / 100;

    let bal = lump;
    let contributed = lump;
    const series = [bal];
    for (let i = 1; i <= years; i++) {
      bal = (bal + annual) * (1 + rate);
      contributed += annual;
      series.push(bal);
    }
    return {
      annual,
      lump,
      years,
      total: bal,
      contributed,
      growth: Math.max(0, bal - contributed),
      series,
      startAge: a,
      endAge: r,
    };
  }, [c.totalSavings, penSaved, investPct, investRate, age, retAge]);

  const retName =
    retPlan === "sep" ? "SEP-IRA" : retPlan === "solo" ? "Solo 401(k)" : "Retirement";

  const strategyRows = [
    { label: "Your existing write-offs", value: writeoffSplit.savX },
    { label: "Write-offs we find", value: writeoffSplit.savY },
    { label: "Home office deduction", value: c.gains.ho },
    { label: "S-Corp election", value: c.gains.scorp },
    { label: retName, value: c.gains.retire },
  ].filter((r) => r.value >= 1);

  /* ── the comparison bars ── */
  const barBase = penalty.active ? penalty.allInBefore : c.baseline;
  const barOpt = penalty.active ? penalty.allInAfter : c.optimized;
  const barSaved = Math.max(0, barBase - barOpt);
  const barMax = Math.max(barBase, 1);
  const optPct = (barOpt / barMax) * 100;
  const savPct = (barSaved / barMax) * 100;

  const newNet = Math.max(
    0,
    base.revenue - writeoffSplit.cx - writeoffSplit.fd,
  );
  const marginPct = base.revenue > 0 ? (newNet / base.revenue) * 100 : 0;
  const marginOut = base.revenue > 0 && (marginPct < 20 || marginPct > 70);

  return (
    <div>
      {/* ── stepper ── */}
      <div className="mb-6 flex items-stretch gap-2.5">
        {STEPS.map((label, i) => {
          const nStep = i + 1;
          const active = step === nStep;
          const done = nStep < step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setStep(nStep)}
              aria-current={active ? "step" : undefined}
              className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition-colors duration-200 ${
                active
                  ? "border-transparent bg-gradient-to-r from-magenta/[0.16] to-violet/[0.16]"
                  : "border-edge bg-panel hover:border-edge-mid"
              }`}
            >
              <span
                className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-full border font-display text-[13px] font-semibold ${
                  active
                    ? "border-transparent bg-grad text-white"
                    : done
                      ? "border-teal/40 bg-teal/15 text-teal"
                      : "border-edge bg-panel-2 text-faint"
                }`}
              >
                {nStep}
              </span>
              <span
                className={`hidden truncate font-display text-[13.5px] font-medium sm:block ${
                  active ? "text-fog" : "text-faint"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ═════════════ STEP 1 ═════════════ */}
      {step === 1 ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <Mono className="font-bold tracking-[2px] text-magenta">
                [ 01 // your numbers ]
              </Mono>
              <h3 className="mt-2 font-display text-[20px] font-semibold text-fog">
                Where you are now
              </h3>
              <p className="mb-5 mt-1 text-[13.5px] text-muted">
                A quick read on where you stand — before a single write-off.
                Your revenue and state get us there.
              </p>

              <Field label="Annual business revenue">
                <NumInput value={revenue} onChange={setRevenue} prefix="$" align="left" />
              </Field>

              <Field
                label="W-2 income"
                className="mt-4"
                hint="Optional — if you also have a job"
              >
                <NumInput value={w2} onChange={setW2} prefix="$" align="left" />
              </Field>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="State">
                  <SelectInput
                    value={usState}
                    onChange={(e) => setUsState(e.target.value)}
                  >
                    {STATE_NAMES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Filing status">
                  <SelectInput
                    value={status}
                    onChange={(e) => setStatus(e.target.value as WizardStatus)}
                  >
                    <option value="single">Single</option>
                    <option value="mfj">Married filing jointly</option>
                    <option value="hoh">Head of household</option>
                  </SelectInput>
                </Field>
              </div>

              <div className="mt-5 flex flex-wrap gap-6">
                <Check checked={useStd} onChange={setUseStd}>
                  Standard deduction ({money(STD_DED[status])})
                </Check>
                <Check checked={useQBI} onChange={setUseQBI}>
                  QBI deduction (20%)
                </Check>
              </div>
            </Panel>

            {/* the anchor number */}
            <div className="relative overflow-hidden rounded-[20px] border border-edge bg-gradient-to-br from-violet/[0.10] to-panel px-7 py-8">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_0%,rgba(255,45,120,0.14),transparent_60%)]"
              />
              <div className="relative">
                <p className="text-[15px] text-muted">
                  Before a single write-off, on this revenue you&rsquo;d be
                  looking at about
                </p>
                <div className="my-2 font-display text-[56px] font-bold leading-none tracking-[-1.5px] tabular-nums text-magenta">
                  <MoneyFlow value={anchor.total} />
                </div>
                <p className="text-[15px] text-muted">
                  in tax — self-employment, federal and state combined.
                </p>

                <div className="mt-5 border-t border-edge pt-4">
                  <Mono className="text-faint">Taxes before any write-offs</Mono>
                  <div className="mt-2.5">
                    <LineRow display divider={false} label="Federal income tax" value={money(anchor.bizFed)} />
                    {base.w2 > 0 ? (
                      <LineRow display divider={false} label="W-2 federal income tax" value={money(anchor.w2Fed)} />
                    ) : null}
                    <LineRow display divider={false} label="Self-employment tax" value={money(anchor.seTax)} />
                    <LineRow display divider={false} label="State income tax" value={money(anchor.stateTax)} />
                    <div className="mt-1.5 flex items-baseline justify-between border-t border-edge pt-3">
                      <span className="font-display text-[14px] text-fog">
                        Total
                      </span>
                      <span className="font-display text-[16px] font-semibold tabular-nums text-magenta">
                        {money(anchor.total)}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="mt-5 text-[15px] text-muted">
                  That&rsquo;s the raw starting point. Step 2 puts write-offs and
                  strategies to work.
                </p>
                <p className="mt-4 border-t border-edge pt-3.5 text-[12.5px] text-faint">
                  About a {anchor.effRate.toFixed(1)}% effective rate in{" "}
                  {usState}, before any deductions
                  {base.w2 > 0 ? " (W-2 stacks on top of business income)" : ""}
                  {[
                    !useStd ? "no standard deduction" : null,
                    !useQBI ? "no QBI deduction" : null,
                  ].filter(Boolean).length > 0
                    ? ` · ${[
                        !useStd ? "no standard deduction" : null,
                        !useQBI ? "no QBI deduction" : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}`
                    : ""}
                  . Step 2 brings it down.
                </p>
              </div>
            </div>
          </div>

          {/* behind on filing */}
          <div
            className={`mt-5 rounded-[16px] border px-5 py-4 transition-colors duration-200 ${
              penOn ? "border-magenta/40 bg-magenta/[0.04]" : "border-edge"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="font-display text-[15.5px] font-semibold text-fog">
                  Behind on a past return?
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  A lot of creators come to us behind on filing. Pick the tax
                  year and this shows what the IRS failure-to-file and
                  failure-to-pay penalties plus interest add up to — and how an
                  extension changes it. Today&rsquo;s date is read automatically,
                  so the numbers stay accurate.
                </p>
              </div>
              <Switch
                checked={penOn}
                onChange={setPenOn}
                label="Model back-tax penalties"
              />
            </div>

            {penOn ? (
              <div className="mt-4 border-t border-edge pt-4">
                {!now || taxYear == null ? (
                  <p className="text-[13px] text-dusk">Reading today&rsquo;s date…</p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Tax year">
                        <SelectInput
                          value={taxYear}
                          onChange={(e) => setTaxYearSel(Number(e.target.value))}
                        >
                          {Array.from(
                            { length: latestLateYear(now) - 2019 },
                            (_, i) => latestLateYear(now) - i,
                          ).map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field
                        label="Estimated tax owed"
                        hint="Pre-filled from the estimate above — adjust if the selected year differed"
                      >
                        <NumInput
                          value={
                            penBaseDirty
                              ? penBase
                              : String(Math.round(anchor.total))
                          }
                          onChange={(v) => {
                            setPenBaseDirty(true);
                            setPenBase(v);
                          }}
                          prefix="$"
                          align="left"
                        />
                      </Field>
                    </div>

                    <div className="mt-4">
                      <Check checked={ext} onChange={setExt}>
                        Filed an extension for this year
                      </Check>
                    </div>

                    {penalty.active ? (
                      <>
                        <div className="mt-4 rounded-[16px] border border-edge bg-panel-2 px-4 py-3.5">
                          <span className="block font-display text-[15px] font-semibold text-fog">
                            Tax year {taxYear}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-faint">
                            Return due {penalty.detail.origDue.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · about{" "}
                            {penalty.lateMonths} month
                            {penalty.lateMonths === 1 ? "" : "s"} late
                          </span>
                          <div className="mt-2.5">
                            <LineRow display divider={false} label="Failure-to-file penalty" value={money(penalty.detail.ftf)} />
                            <LineRow display divider={false} label="Failure-to-pay penalty" value={money(penalty.detail.ftp)} />
                            <LineRow display divider={false} label="Interest" value={money(penalty.detail.interest)} />
                            <div className="mt-1.5 flex items-baseline justify-between border-t border-edge pt-3">
                              <span className="font-display text-[14px] text-fog">
                                Penalties &amp; interest
                              </span>
                              <span className="font-display text-[16px] font-semibold tabular-nums text-magenta">
                                {money(penalty.detail.total)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <LineRow display divider={false} label="Estimated back tax" value={money(penalty.base)} />
                          <div className="mt-1.5 flex items-baseline justify-between border-t border-edge pt-3">
                            <span className="font-display text-[14px] text-fog">
                              Total to resolve, all in
                            </span>
                            <span className="font-display text-[19px] font-semibold tabular-nums text-magenta">
                              {money(penalty.allInBefore)}
                            </span>
                          </div>
                        </div>

                        <p className="mt-3 border-t border-dashed border-edge pt-3 text-[12px] leading-relaxed text-muted">
                          {ext ? (
                            <>
                              The extension moves the <b className="text-fog">filing</b>{" "}
                              deadline six months, to{" "}
                              {penalty.detail.fileDue.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, so the
                              failure-to-file penalty{" "}
                              {penalty.detail.ftf < 1 ? "hasn't started yet" : "is reduced"}.
                              But an extension is only an extension to{" "}
                              <b className="text-fog">file</b>, never to{" "}
                              <b className="text-fog">pay</b>: the{" "}
                              {money(penalty.detail.ftp)} failure-to-pay penalty
                              and the interest still run from April.
                            </>
                          ) : (
                            <>
                              No extension on file, so the failure-to-file
                              penalty (5%/mo, up to 25%) runs from the original
                              deadline. An extension would push the{" "}
                              <b className="text-fog">filing</b> deadline out six
                              months and shrink or remove that penalty — but it
                              would <b className="text-fog">not</b> reduce the
                              failure-to-pay penalty or the interest.
                            </>
                          )}
                        </p>
                      </>
                    ) : null}

                    <Note>
                      Estimate only, for a single tax year, calculated as of
                      today. Assumes the balance went unpaid from the original
                      deadline. State penalties and any prior payments or
                      withholding aren&rsquo;t included — we confirm the exact
                      figure against your IRS notices before we file.
                    </Note>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <StepNav onNext={() => setStep(2)} nextLabel="See what we can do →" />
        </>
      ) : null}

      {/* ═════════════ STEP 2 ═════════════ */}
      {step === 2 ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <Panel>
                <Mono className="font-bold tracking-[2px] text-magenta">
                  [ 02 // the plan ]
                </Mono>
                <h3 className="mt-2 font-display text-[20px] font-semibold text-fog">
                  What we can do
                </h3>
                <p className="mb-5 mt-1 text-[13.5px] text-muted">
                  Toggle the strategies we&rsquo;d put in place. Your tax bill
                  drops in real time — every estimate is deliberately
                  conservative.
                </p>

                <div className="flex flex-col gap-3.5">
                  <StrategyCard
                    title="Your existing write-offs"
                    note="The expenses you already write off each year — clean books make sure every one of them actually counts."
                    gain={`+${money(c.gains.yours)}`}
                    on={onYours}
                    onToggle={setOnYours}
                  >
                    <Field label="Annual business expenses (same write-offs as last year)">
                      <NumInput value={curExp} onChange={setCurExp} prefix="$" align="left" />
                    </Field>
                    {writeoffSplit.cx > 0 ? (
                      <p className="mt-2.5 text-[13px] text-muted">
                        Same write-offs as last year → saves{" "}
                        <b className="font-display font-semibold text-teal">
                          {money(writeoffSplit.savX)}/yr
                        </b>
                      </p>
                    ) : null}
                  </StrategyCard>

                  <StrategyCard
                    title="Write-offs we find"
                    note="The legitimate deductions most creators miss — the ones our bookkeeping surfaces on top of what you already claim."
                    gain={`+${money(c.gains.ours)}`}
                    on={onOurs}
                    onToggle={setOnOurs}
                    footnote="Conservative estimate"
                  >
                    <Field label="Additional deductions we typically find">
                      <NumInput value={found} onChange={setFound} prefix="$" align="left" />
                    </Field>
                    {writeoffSplit.fd > 0 ? (
                      <p className="mt-2.5 text-[13px] text-muted">
                        We typically find an extra {money(writeoffSplit.fd)} → an
                        additional{" "}
                        <b className="font-display font-semibold text-teal">
                          {money(writeoffSplit.savY)}/yr
                        </b>
                      </p>
                    ) : null}
                  </StrategyCard>

                  <StrategyCard
                    title="Home office deduction"
                    note="Deduct the business-use share of your rent and utilities."
                    gain={`+${money(c.gains.ho)}`}
                    on={onHo}
                    onToggle={setOnHo}
                    footnote="Conservative estimate"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Monthly rent / mortgage">
                        <NumInput value={rent} onChange={setRent} prefix="$" align="left" />
                      </Field>
                      <Field label="Monthly utilities">
                        <NumInput value={util} onChange={setUtil} prefix="$" align="left" />
                      </Field>
                    </div>
                    <div className="mt-3">
                      <Mono className="mb-2 block text-mist">
                        Business-use of home — {hoPct}%
                      </Mono>
                      <Slider
                        value={hoPct}
                        onChange={setHoPct}
                        max={100}
                        ariaLabel="Business use of home percentage"
                      />
                    </div>
                  </StrategyCard>

                  <StrategyCard
                    title="S-Corp election"
                    note="Pay yourself a reasonable salary and take the rest as distributions — cutting self-employment tax."
                    gain={`+${money(c.gains.scorp)}`}
                    on={onScorp}
                    onToggle={setOnScorp}
                    footnote="Typical range 15–30% for creators"
                  >
                    <Mono className="mb-2 block text-mist">
                      Reasonable salary — {salaryPct}% of net profit
                    </Mono>
                    <Slider
                      value={salaryPct}
                      onChange={setSalaryPct}
                      min={5}
                      max={90}
                      ariaLabel="Reasonable salary as a percentage of net profit"
                    />
                    <p className="mt-2.5 text-[12px] text-dusk">
                      ≈ {money((newNet * salaryPct) / 100)} salary ·{" "}
                      {money(Math.max(0, newNet - (newNet * salaryPct) / 100))} in
                      distributions (of {money(newNet)} net profit)
                    </p>
                  </StrategyCard>

                  {/* retirement — SEP and Solo are mutually exclusive */}
                  <div
                    className={`rounded-[16px] border px-4.5 py-4 transition-colors duration-200 ${
                      retPlan
                        ? "border-transparent bg-gradient-to-r from-magenta/[0.09] to-violet/[0.09] shadow-[inset_0_0_0_1px_rgba(168,75,224,0.35)]"
                        : "border-edge"
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[15.5px] font-semibold text-fog">
                          Retirement plan
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted">
                          Pre-tax contributions lower taxable income. SEP and
                          Solo work very differently — only one at a time.
                        </p>
                      </div>
                      <div className="whitespace-nowrap text-right font-display text-[16px] font-semibold text-teal">
                        +{money(c.gains.retire)}
                        <small className="mt-0.5 block font-body text-[10px] font-medium uppercase tracking-[1px] text-faint">
                          per year
                        </small>
                      </div>
                    </div>

                    <div className="mt-3.5 border-t border-edge">
                      {(
                        [
                          ["sep", "SEP-IRA", "Employer contribution only"],
                          [
                            "solo",
                            "Solo 401(k)",
                            "Employee deferral + employer contribution",
                          ],
                        ] as const
                      ).map(([key, name, sub]) => (
                        <div
                          key={key}
                          className={`flex items-center justify-between gap-4 border-b border-edge py-3 ${
                            retLocked ? "opacity-50" : ""
                          }`}
                        >
                          <div>
                            <span className="block font-display text-[15px] font-semibold text-fog">
                              {name}
                            </span>
                            <span className="text-[12px] text-muted">{sub}</span>
                          </div>
                          <Switch
                            checked={retPlan === key}
                            onChange={(on) => {
                              if (on && retLocked) return; // the lock note below explains why
                              setRetPlanSel(on ? key : null);
                            }}
                            label={`Use a ${name}`}
                          />
                        </div>
                      ))}
                    </div>

                    {retLocked ? (
                      <p className="mt-3.5 rounded-[10px] border border-danger/30 bg-danger/[0.08] px-3 py-2.5 text-[12.5px] leading-relaxed text-danger">
                        A SEP-IRA or Solo 401(k) isn&rsquo;t available here —
                        contributions for a tax year must be made by the filing
                        deadline, including an extension, and that window has
                        closed for the year selected in Step 1.
                      </p>
                    ) : retPlan ? (
                      <>
                        <KpiRow cols={2} className="mt-4">
                          <Kpi label="Annual contribution" value={money(c.full.maxRet)} />
                          <Kpi label="Tax saved" value={money(c.gains.retire)} tone="pos" />
                        </KpiRow>
                        <p className="mt-2.5 text-[12px] text-dusk">
                          {retName} max this year: {money(c.full.maxRet)} —{" "}
                          {retPlan === "sep"
                            ? onScorp
                              ? "25% of the W-2 salary"
                              : "20% of net self-employment earnings"
                            : `${money(LIMITS.deferral)} deferral + ${
                                onScorp
                                  ? "25% of the W-2 salary"
                                  : "20% of net self-employment earnings"
                              }`}
                          .
                        </p>
                      </>
                    ) : null}

                    <p className="mt-3 inline-block rounded-full border border-teal/40 px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[1px] text-teal">
                      2026 limits · both capped at {money(LIMITS.dcLimit)}
                    </p>
                  </div>
                </div>
              </Panel>

              {/* books after clean-up */}
              <Panel>
                <Mono className="font-bold tracking-[2px] text-magenta">
                  [ your books after clean-up ]
                </Mono>
                <div className="mt-3">
                  <LineRow
                    display
                    label="Current expenses"
                    value={money(writeoffSplit.cx)}
                  />
                  {writeoffSplit.fd > 0 ? (
                    <LineRow
                      display
                      tone="pos"
                      label="Additional deductions we find"
                      value={`+${money(writeoffSplit.fd)}`}
                    />
                  ) : null}
                  <LineRow
                    total
                    display
                    label="Total business expenses"
                    value={money(writeoffSplit.cx + writeoffSplit.fd)}
                  />
                  <LineRow display label="New net profit" value={money(newNet)} />
                  <LineRow
                    display
                    label="Net profit margin"
                    value={`${marginPct.toFixed(1)}%`}
                    tone={marginOut ? "neg" : "plain"}
                  />
                </div>
                <p className="mt-2 text-[12px] text-dusk">
                  {marginOut
                    ? `Most creators land between 20% and 70% — this one's ${marginPct > 70 ? "above" : "below"} that range.`
                    : "Most creators land between 20% and 70%."}
                </p>

                <div className="mt-4 border-t border-edge pt-3.5">
                  <Mono className="font-semibold text-magenta">
                    Tax savings by strategy
                  </Mono>
                  {strategyRows.length || penSaved >= 1 ? (
                    <div className="mt-2">
                      {strategyRows.map((r) => (
                        <div
                          key={r.label}
                          className="flex justify-between py-1.5 text-[14px]"
                        >
                          <span className="text-muted">{r.label}</span>
                          <span className="font-display font-semibold text-teal">
                            +{money(r.value)}/yr
                          </span>
                        </div>
                      ))}
                      {penSaved >= 1 ? (
                        <div className="flex justify-between py-1.5 text-[14px]">
                          <span className="text-muted">
                            Penalties &amp; interest avoided
                          </span>
                          <span className="font-display font-semibold text-teal">
                            +{money(penSaved)} one-time
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-1 flex justify-between border-t border-edge pt-2.5">
                        <span className="font-display text-[14px] font-medium text-fog">
                          {penalty.active
                            ? "Total first-year savings"
                            : "Total annual savings"}
                        </span>
                        <span className="font-display text-[16px] font-semibold text-teal">
                          {money(c.totalSavings + penSaved)}
                          {penalty.active ? "" : "/yr"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[13px] text-faint">
                      Toggle a strategy above to see its savings here.
                    </p>
                  )}
                </div>
              </Panel>
            </div>

            {/* live comparison */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <Panel>
                <Mono className="font-bold tracking-[2px] text-magenta">
                  [ live comparison ]
                </Mono>
                <h3 className="mb-5 mt-2 font-display text-[20px] font-semibold text-fog">
                  The tax bill, before and after
                </h3>

                <div className="mb-2 flex justify-center gap-14 px-2.5">
                  <div className="w-[108px] text-center font-display text-[17px] font-semibold text-muted">
                    {money(barBase)}
                  </div>
                  <div className="w-[108px] text-center font-display text-[17px] font-semibold text-magenta">
                    {money(barOpt)}
                  </div>
                </div>

                <div className="flex h-[230px] items-end justify-center gap-14 px-2.5">
                  <div className="relative h-full w-[108px]">
                    {/* The baseline bar is drawn in the ink token, not in
                        white-alpha: on the portal's light theme the panel IS
                        white, so a white-on-white gradient made this whole
                        half of the comparison disappear. `fog` inverts with
                        the theme, so the bar reads on both. */}
                    <div className="absolute inset-x-0 bottom-0 h-full rounded-t-[10px] bg-gradient-to-b from-fog/[0.14] to-fog/[0.05]" />
                  </div>
                  <div className="relative h-full w-[108px]">
                    {barSaved > 0 ? (
                      <div
                        className="absolute inset-x-0 flex items-center justify-center overflow-hidden rounded-t-[10px] border border-b-0 border-dashed border-teal/55 bg-teal/[0.13] transition-[height,bottom] duration-500"
                        style={{ height: `${savPct}%`, bottom: `${optPct}%` }}
                      >
                        {savPct >= 8 ? (
                          <span className="px-1 text-center font-display text-[11.5px] font-semibold leading-tight text-teal">
                            Saved
                            <br />
                            {money(barSaved)}
                            <br />
                            {barBase > 0 ? Math.round((barSaved / barBase) * 100) : 0}%
                          </span>
                        ) : savPct >= 4 ? (
                          <span className="font-display text-[11.5px] font-semibold text-teal">
                            {money(barSaved)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div
                      className="absolute inset-x-0 bottom-0 z-[2] rounded-t-[10px] bg-grad shadow-[0_0_26px_rgba(255,45,120,0.3)] transition-[height] duration-500"
                      style={{ height: `${Math.max(2, optPct)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-center gap-14 px-2.5">
                  <span className="w-[108px] text-center font-display text-[12px] leading-tight text-muted">
                    Now
                    <br />
                    no strategies
                  </span>
                  <span className="w-[108px] text-center font-display text-[12px] leading-tight text-muted">
                    With
                    <br />
                    DeCypher
                  </span>
                </div>

                <div className="mt-5 border-t border-edge pt-4">
                  <LineRow
                    display
                    divider={false}
                    size="lg"
                    label="First-year savings"
                    value={<MoneyFlow value={c.totalSavings + penSaved} />}
                  />
                  <LineRow
                    display
                    divider={false}
                    size="lg"
                    label="Ongoing annual savings"
                    value={<MoneyFlow value={c.totalSavings} />}
                  />
                  <div className="mt-1.5 flex items-baseline justify-between border-t border-dashed border-edge pt-4">
                    <span className="font-display text-[14px] font-medium text-fog">
                      3-year total
                    </span>
                    <span className="font-display text-[26px] font-bold tabular-nums text-magenta">
                      <MoneyFlow value={c.totalSavings * 3 + penSaved} />
                    </span>
                  </div>
                </div>
              </Panel>
            </div>
          </div>

          <StepNav
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextLabel="See the bottom line →"
          />
        </>
      ) : null}

      {/* ═════════════ STEP 3 ═════════════ */}
      {step === 3 ? (
        <>
          <div className="mx-auto max-w-[600px] text-center">
            <Mono className="font-bold tracking-[2px] text-magenta">
              [ 03 // the bottom line ]
            </Mono>
            <h3 className="mt-2 font-display text-[26px] font-semibold text-fog">
              Make it make <span className="text-teal">$CENTS</span>
            </h3>
            <p className="mb-6 mt-1.5 text-[14px] italic text-muted">
              &ldquo;accountant math&rdquo;
            </p>

            <div className="relative overflow-hidden rounded-[20px] border border-edge bg-gradient-to-br from-violet/[0.12] to-panel px-8 py-10">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(139,43,232,0.16),transparent_62%)]"
              />
              <div className="relative">
                <p className="text-[14px] text-muted">
                  Your projected savings with DeCypher
                </p>
                <div className="font-display text-[60px] font-bold leading-none tracking-[-1.5px] tabular-nums text-magenta">
                  <MoneyFlow value={c.totalSavings} />
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-9">
                  <div>
                    <div className="font-display text-[22px] font-semibold text-teal">
                      {money(c.totalSavings * 3 + penSaved)}
                    </div>
                    <Mono className="mt-1 block text-faint">
                      Three-year savings
                    </Mono>
                  </div>
                  <div>
                    <div className="font-display text-[22px] font-semibold text-fog">
                      {Math.round(
                        base.revenue + base.w2 > 0
                          ? (c.baseline / (base.revenue + base.w2)) * 100
                          : 0,
                      )}
                      % <span className="font-normal text-faint">→</span>{" "}
                      {Math.round(
                        base.revenue + base.w2 > 0
                          ? (c.optimized / (base.revenue + base.w2)) * 100
                          : 0,
                      )}
                      %
                    </div>
                    <Mono className="mt-1 block text-faint">
                      Effective tax rate
                    </Mono>
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-auto mt-6 max-w-[440px] text-left">
              {strategyRows.length || penSaved >= 1 ? (
                <>
                  {strategyRows.map((r) => (
                    <div
                      key={r.label}
                      className="flex justify-between border-b border-edge py-2.5 text-[14.5px]"
                    >
                      <span className="text-muted">{r.label}</span>
                      <span className="font-display font-semibold text-teal">
                        +{money(r.value)}/yr
                      </span>
                    </div>
                  ))}
                  {penSaved >= 1 ? (
                    <div className="flex justify-between border-b border-edge py-2.5 text-[14.5px]">
                      <span className="text-muted">
                        Penalties &amp; interest avoided
                      </span>
                      <span className="font-display font-semibold text-teal">
                        +{money(penSaved)} one-time
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between py-2.5 text-[14.5px]">
                    <span className="font-semibold text-fog">
                      {penalty.active
                        ? "Total first-year savings"
                        : "Total annual savings"}
                    </span>
                    <span className="font-display font-semibold text-teal">
                      {money(c.totalSavings + penSaved)}
                      {penalty.active ? "" : "/yr"}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-center text-[13px] text-dusk">
                  Turn on a strategy in Step 2 to see the plan.
                </p>
              )}
            </div>

            <div className="mt-6 inline-flex flex-col items-center gap-1 rounded-[16px] border border-teal/30 bg-gradient-to-b from-teal/10 to-teal/[0.02] px-11 py-5">
              <Mono className="text-muted">Annual savings</Mono>
              <span className="font-display text-[34px] font-bold leading-none text-teal">
                <MoneyFlow value={c.totalSavings} />
                <small className="ml-1 text-[15px] font-semibold text-muted">
                  /yr
                </small>
              </span>
            </div>

            <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
              Estimates use 2026 figures and are intentionally conservative —
              your actual result depends on the full return. Not tax advice;
              final numbers are confirmed when we prepare it. State brackets are
              current-year approximations.
            </p>
          </div>

          <StepNav
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            nextLabel="Now invest the savings →"
          />
        </>
      ) : null}

      {/* ═════════════ STEP 4 ═════════════ */}
      {step === 4 ? (
        <>
          <div className="mx-auto max-w-[760px]">
            <div className="text-center">
              <Mono className="font-bold tracking-[2px] text-magenta">
                [ 04 // the long game ]
              </Mono>
              <h3 className="mt-2 font-display text-[26px] font-semibold text-fog">
                Now invest the difference.
              </h3>
              <p className="mx-auto mt-1.5 max-w-[560px] text-[13.5px] text-muted">
                Every dollar we save you is a dollar that can compound. Here are your
                savings invested in the market and grown to retirement.
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Current age">
                <NumInput value={age} onChange={setAge} align="left" />
              </Field>
              <Field label="Retirement age">
                <NumInput value={retAge} onChange={setRetAge} align="left" />
              </Field>
            </div>

            <Mono className="mb-2 mt-5 block font-bold text-mist">
              How much of the savings gets invested
            </Mono>
            <ChipRow
              value={investPct}
              onChange={setInvestPct}
              options={[
                [10, "A little"],
                [20, "Some"],
                [50, "Half"],
                [100, "All of it"],
              ]}
            />
            <p className="mt-2 text-[12px] text-dusk">
              {investPct}% of the {money(c.totalSavings)}/yr tax savings ={" "}
              {money(invest.annual)}/yr invested
              {invest.lump > 0
                ? ` (plus ${money(invest.lump)} of the one-time savings)`
                : ""}
              .
            </p>

            <Mono className="mb-2 mt-5 block font-bold text-mist">
              Assumed annual return
            </Mono>
            <ChipRow
              value={investRate}
              onChange={setInvestRate}
              suffix="%"
              options={[
                [6, "Conservative"],
                [7, "Market"],
                [10, "Growth"],
                [12, "Aggressive"],
              ]}
            />

            <div className="relative mt-6 overflow-hidden rounded-[20px] border border-edge bg-gradient-to-br from-violet/[0.12] to-panel px-8 py-9 text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(139,43,232,0.16),transparent_62%)]"
              />
              <div className="relative">
                <p className="text-[14px] text-muted">
                  Projected value at retirement
                </p>
                <div className="font-display text-[60px] font-bold leading-none tracking-[-1.5px] tabular-nums text-magenta">
                  <MoneyFlow value={invest.total} />
                </div>
                <p className="mt-1.5 text-[13.5px] text-muted">
                  {money(invest.annual)}/yr invested for {invest.years} year
                  {invest.years === 1 ? "" : "s"} at {investRate}%
                  {invest.lump > 0
                    ? `, plus a ${money(invest.lump)} head start`
                    : ""}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-9">
                  <div>
                    <div className="font-display text-[22px] font-semibold text-fog">
                      {money(invest.contributed)}
                    </div>
                    <Mono className="mt-1 block text-faint">You invested</Mono>
                  </div>
                  <div>
                    <div className="font-display text-[22px] font-semibold text-teal">
                      {money(invest.growth)}
                    </div>
                    <Mono className="mt-1 block text-faint">Market growth</Mono>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[16px] border border-edge bg-panel-2 px-3.5 pb-2.5 pt-3.5">
              <GrowthChart
                series={invest.series}
                startAge={invest.startAge}
                endAge={invest.endAge}
              />
            </div>

            <Disclaimer>
              Illustration only, not investment advice. Assumes the annual tax
              savings are invested at the start of each year and compound at the
              selected fixed rate until retirement. Actual market returns vary
              year to year and are not guaranteed.
            </Disclaimer>
          </div>

          <StepNav onBack={() => setStep(3)} onRestart={() => setStep(1)} />
        </>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

function StepNav({
  onBack,
  onNext,
  onRestart,
  nextLabel,
}: {
  onBack?: () => void;
  onNext?: () => void;
  onRestart?: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer rounded-[10px] border border-edge px-6 py-3.5 font-display text-[15px] font-semibold text-muted transition-colors duration-150 hover:text-fog"
        >
          ← Back
        </button>
      ) : (
        <span />
      )}
      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          className="cursor-pointer rounded-[10px] bg-grad px-6 py-3.5 font-display text-[15px] font-semibold text-white transition-[filter] duration-150 hover:brightness-110"
        >
          {nextLabel}
        </button>
      ) : null}
      {onRestart ? (
        <button
          type="button"
          onClick={onRestart}
          className="cursor-pointer border-b border-dotted border-faint text-[12.5px] text-faint transition-colors duration-150 hover:text-mist"
        >
          Start over
        </button>
      ) : null}
    </div>
  );
}

function ChipRow({
  value,
  onChange,
  options,
  suffix = "%",
}: {
  value: number;
  onChange: (v: number) => void;
  options: [number, string][];
  suffix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex min-w-[118px] flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-[10px] border px-2.5 py-3 font-display text-[19px] font-bold transition-colors duration-150 ${
              on
                ? "border-transparent bg-gradient-to-r from-magenta/[0.18] to-violet/[0.16] text-fog"
                : "border-edge bg-panel-2 text-muted hover:border-edge-mid"
            }`}
          >
            {v}
            {suffix}
            <small
              className={`font-mono text-[9.5px] font-normal uppercase tracking-[1.2px] ${
                on ? "text-magenta" : "text-faint"
              }`}
            >
              {label}
            </small>
          </button>
        );
      })}
    </div>
  );
}

/** The compounding curve — the shared LineChart with an end-of-line label.
 *  The bespoke fixed-viewBox SVG this replaced stretched its text to the
 *  container aspect; the shared chart renders in pixel space and animates
 *  between states. */
function GrowthChart({
  series,
  startAge,
}: {
  series: number[];
  startAge: number;
  /** Kept in the signature for the call site; the axis derives ages from the index. */
  endAge: number;
}) {
  const s = series.length < 2 ? [series[0] ?? 0, series[0] ?? 0] : series;
  const last = s[s.length - 1] ?? 0;
  const age = (i: number) => (startAge ? `Age ${startAge + i}` : "—");

  return (
    <LineChart
      series={[
        {
          key: "wizard-growth",
          label: "Projected value",
          color: CHART.cost,
          kind: "line",
          values: s,
        },
      ]}
      xLabel={age}
      labelForIndex={age}
      height={220}
      fillFirst
      endLabel={money(last)}
    />
  );
}
