"use client";

/**
 * The Deal Desk — property underwriting.
 *
 * Three views over one shared set of inputs: what a borrower qualifies for,
 * whether the deal works, and what the loan actually costs over its life.
 * They share state deliberately — changing the rate on Qualify has to move
 * the amortisation too, or staff end up quoting two different loans.
 *
 * Rebuilt from the "Asset Calculator" workbook (Buy & Hold / Amortization /
 * Pre-Approval); the defaults mirror a real 2025 Closing Disclosure so the
 * blank state is a sanity check rather than a made-up example.
 */

import { useMemo, useState } from "react";
import { money2, pct, times, toNum } from "@/lib/widget-format";
import {
  CHART,
  ChartLegend,
  FlowChart,
  LineChart,
  type Series,
} from "@/components/portal/widgets/charts";
import {
  Callout,
  Chip,
  InlineField,
  Kpi,
  KpiRow,
  LineRow,
  Mono,
  Note,
  Panel,
  Segmented,
  SelectInput,
  Switch,
  TableCell,
  TableHead,
} from "@/components/portal/widgets/ui";

type Tab = "qualify" | "underwrite" | "amort";

/**
 * Defaults mirror a real 2025 Closing Disclosure: $470k condo, 5% down,
 * 6.99% 30yr conventional. P&I $2,967.58 · PITI+MI $3,694.75 — verified to the
 * penny against the CD, so a changed number here is a changed answer.
 */
const DEFAULTS = {
  purchasePrice: "470000",
  downPct: "5",
  interestRate: "6.99",
  termYears: "30",
  closingPct: "1.49", // lender/title/government fees only (CD sections A–E,H)
  prepaidsEscrow: "5847", // CD F+G: prepaid interest, 1st-yr insurance, reserves
  rehab: "0",
  furniture: "0",
  propertyTaxYr: "7198", // $599.81/mo escrow → 1.53% of price
  insuranceYr: "546", // $45.50/mo → 0.12% of price (condo HO-6)
  pmiYr: "982", // $81.86/mo → 0.22% of loan; drops at 78% LTV
  hoaMo: "425",
  maintenanceYr: "4700", // ~1% of value — not on a CD, but real
  capexYr: "0",
  mgmtPct: "0",
  gasYr: "840", // blended FL/CA/NY residential
  electricYr: "1600",
  waterYr: "1310",
  otherOpexYr: "0",
  cleaningYr: "0",
  rent1: "10000",
  rent2: "0",
  rent3: "0",
  rent4: "0",
  occupancy: "100",
  additionalMo: "0",
  extraPrincipal: "0",
  grossMonthlyIncome: "10000",
  monthlyDebts: "0",
  maxDTI: "43",
};

type FieldKey = keyof typeof DEFAULTS;

/** Level payment for a loan: rate per period, periods, present value. */
const PMT = (r: number, n: number, pv: number) =>
  r === 0 ? pv / n : (pv * r) / (1 - Math.pow(1 + r, -n));

/** Roles, not colours — the values live in charts.tsx. */
const COLORS = {
  interest: CHART.cost,
  principal: CHART.gain,
  balance: CHART.level,
  cumInterest: CHART.cumulative,
  baseline: CHART.baseline,
  accelerated: CHART.gain,
};

export default function DealDesk() {
  const [tab, setTab] = useState<Tab>("underwrite");
  const [f, setF] = useState(DEFAULTS);
  const [unitCount, setUnitCount] = useState(1);
  const [occupiedUnits, setOccupiedUnits] = useState(1);
  const [mode, setMode] = useState<"rental" | "househack">("rental");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = (k: FieldKey) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const num = (k: FieldKey) => toNum(f[k]);

  /* ── the deal ── */
  const m = useMemo(() => {
    const price = toNum(f.purchasePrice);
    const downPct = toNum(f.downPct) / 100;
    const nMonths = Math.round(toNum(f.termYears) * 12);
    const iMo = toNum(f.interestRate) / 100 / 12;

    const downPayment = price * downPct;
    const loan = price - downPayment;
    const closing = (toNum(f.closingPct) / 100) * price;
    const totalCashIn =
      downPayment +
      closing +
      toNum(f.prepaidsEscrow) +
      toNum(f.rehab) +
      toNum(f.furniture);

    const mortgageMo = loan > 0 ? PMT(iMo, nMonths, loan) : 0;
    const debtServiceYr = mortgageMo * 12;

    const occ = toNum(f.occupancy) / 100;
    const rents = [f.rent1, f.rent2, f.rent3, f.rent4]
      .slice(0, unitCount)
      .map(toNum);
    const grossRentMo = rents.reduce((a, b) => a + b, 0);
    const grossIncomeYr = grossRentMo * 12 * occ + toNum(f.additionalMo) * 12;

    const opexItems: Record<string, number> = {
      "Property tax": toNum(f.propertyTaxYr),
      Insurance: toNum(f.insuranceYr),
      PMI: toNum(f.pmiYr),
      HOA: toNum(f.hoaMo) * 12,
      Maintenance: toNum(f.maintenanceYr),
      "Property management": (toNum(f.mgmtPct) / 100) * grossIncomeYr,
      Utilities:
        toNum(f.gasYr) +
        toNum(f.electricYr) +
        toNum(f.waterYr) +
        toNum(f.otherOpexYr),
      Cleaning: toNum(f.cleaningYr),
    };
    const opexYr = Object.values(opexItems).reduce((a, b) => a + b, 0);
    const capexYr = toNum(f.capexYr);

    const noi = grossIncomeYr - opexYr;
    const cashFlowYr = noi - debtServiceYr - capexYr;

    // House hack: the units you *don't* occupy are the ones producing rent.
    const occUnits = Math.min(occupiedUnits, unitCount);
    const hhRentMo =
      rents.filter((_, i) => i >= occUnits).reduce((a, b) => a + b, 0) * occ;
    const monthlyOpex = opexYr / 12;
    const monthlyCapex = capexYr / 12;

    return {
      price,
      downPct,
      nMonths,
      iMo,
      downPayment,
      loan,
      totalCashIn,
      mortgageMo,
      debtServiceYr,
      grossIncomeYr,
      opexItems,
      opexYr,
      capexYr,
      noi,
      capRate: noi / price,
      cashFlowYr,
      coc: cashFlowYr / totalCashIn,
      dscr: noi / debtServiceYr,
      oer: opexYr / grossIncomeYr,
      occUnits,
      hhRentMo,
      monthlyOpex,
      monthlyCapex,
      hhOutOfPocketMo: mortgageMo + monthlyOpex + monthlyCapex - hhRentMo,
      allInMo: mortgageMo + monthlyOpex + monthlyCapex,
      // What the lender calls "the payment": P&I plus escrowed tax, insurance and MI.
      pitiMiMo:
        mortgageMo +
        (toNum(f.propertyTaxYr) + toNum(f.insuranceYr) + toNum(f.pmiYr)) / 12,
    };
  }, [f, unitCount, occupiedUnits]);

  /* ── amortisation ── */
  const amort = useMemo(() => {
    const rows: {
      k: number;
      interest: number;
      principal: number;
      balance: number;
      cumInt: number;
    }[] = [];
    let bal = m.loan;
    let cumInt = 0;
    for (let k = 1; k <= m.nMonths; k++) {
      const interest = bal * m.iMo;
      const principal = m.mortgageMo - interest;
      bal = Math.max(0, bal - principal);
      cumInt += interest;
      rows.push({ k, interest, principal, balance: bal, cumInt });
    }
    return {
      rows,
      totalInterest: cumInt,
      totalPaid: m.mortgageMo * m.nMonths,
    };
  }, [m.loan, m.iMo, m.mortgageMo, m.nMonths]);

  /* ── extra principal ── */
  const extra = useMemo(() => {
    const E = toNum(f.extraPrincipal);
    const baseInt = amort.totalInterest;
    if (E <= 0 || m.loan <= 0 || m.mortgageMo <= 0) {
      return {
        E: 0,
        months: m.nMonths,
        totalInterest: baseInt,
        interestSaved: 0,
        monthsSaved: 0,
        byMonth: null as number[] | null,
      };
    }
    let bal = m.loan;
    let months = 0;
    let totInt = 0;
    const byMonth = [m.loan];
    while (bal > 0 && months < m.nMonths * 3) {
      const interest = bal * m.iMo;
      let principal = m.mortgageMo - interest + E;
      if (principal <= 0) {
        months = Infinity; // the payment can't even cover interest
        break;
      }
      if (principal > bal) principal = bal;
      bal -= principal;
      totInt += interest;
      months++;
      byMonth[months] = Math.max(0, bal);
    }
    return {
      E,
      months,
      totalInterest: totInt,
      interestSaved: baseInt - totInt,
      monthsSaved: m.nMonths - months,
      byMonth,
    };
  }, [f.extraPrincipal, m.loan, m.iMo, m.mortgageMo, m.nMonths, amort.totalInterest]);

  /* ── rate sensitivity ── */
  const rateTable = useMemo(() => {
    const base = toNum(f.interestRate);
    return [-1, -0.5, 0, 0.5, 1, 2].map((d) => {
      const pay = m.loan > 0 ? PMT((base + d) / 100 / 12, m.nMonths, m.loan) : 0;
      return {
        d,
        rate: base + d,
        pay,
        totalInt: pay * m.nMonths - m.loan,
        current: d === 0,
      };
    });
  }, [f.interestRate, m.loan, m.nMonths]);

  /* ── qualify ──
     Originators size a borrower off debt-to-income. The full housing payment
     (P&I + tax + insurance + PMI + HOA) has to fit inside the DTI limit, and
     tax/insurance/PMI all scale with the price — so we solve for price rather
     than solve for payment and back into it. */
  const q = useMemo(() => {
    const inc = toNum(f.grossMonthlyIncome);
    const debts = toNum(f.monthlyDebts);
    const dti = toNum(f.maxDTI) / 100;
    const d = m.downPct;
    const i = m.iMo;
    const n = m.nMonths;
    // P&I per $1 of loan
    const f1 =
      i === 0 ? 1 / n : (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);

    const price = toNum(f.purchasePrice) || 1;
    const taxRate = toNum(f.propertyTaxYr) / price;
    const insRate = toNum(f.insuranceYr) / price;
    const pmiRate = d < 0.2 ? toNum(f.pmiYr) / (m.loan || 1) : 0;
    const hoaMo = toNum(f.hoaMo);

    const housingBudget = Math.max(0, dti * inc - debts);
    // HOA is a flat monthly figure — it doesn't scale with the price we solve for.
    const budgetForProperty = Math.max(0, housingBudget - hoaMo);
    const perDollar =
      (1 - d) * f1 + taxRate / 12 + insRate / 12 + ((1 - d) * pmiRate) / 12;

    const maxPrice = perDollar > 0 ? budgetForProperty / perDollar : 0;
    const maxLoan = maxPrice * (1 - d);
    const piMo = maxLoan * f1;
    const taxMo = (maxPrice * taxRate) / 12;
    const insMo = (maxPrice * insRate) / 12;
    const pmiMo = (maxLoan * pmiRate) / 12;
    const housingMo = piMo + taxMo + insMo + pmiMo + hoaMo;

    return {
      inc,
      debts,
      housingBudget,
      maxPrice,
      maxLoan,
      piMo,
      taxMo,
      insMo,
      pmiMo,
      hoaMo,
      housingMo,
      frontEndRatio: inc > 0 ? housingMo / inc : 0,
      backEndRatio: inc > 0 ? (housingMo + debts) / inc : 0,
      cashNeeded:
        maxPrice * d +
        (toNum(f.closingPct) / 100) * maxPrice +
        toNum(f.prepaidsEscrow),
    };
  }, [f, m.downPct, m.iMo, m.nMonths, m.loan]);

  const rules = [
    { label: "Positive cash flow", ok: m.cashFlowYr > 0, got: `${money2(m.cashFlowYr)}/yr` },
    { label: "DSCR ≥ 1.25", ok: m.dscr >= 1.25, got: times(m.dscr) },
    { label: "Cap rate ≥ 6%", ok: m.capRate >= 0.06, got: pct(m.capRate) },
    { label: "Cash-on-cash ≥ 8%", ok: m.coc >= 0.08, got: pct(m.coc) },
  ];

  const yrLabel = (i: number) => `Yr ${Math.max(1, Math.round((i + 1) / 12))}`;
  const monthLabel = (i: number) =>
    `Month ${i + 1} · Yr ${Math.ceil((i + 1) / 12)}`;

  const flowSeries: Series[] = [
    { key: "interest", label: "Interest", color: COLORS.interest, kind: "area", values: amort.rows.map((r) => r.interest) },
    { key: "principal", label: "Principal", color: COLORS.principal, kind: "area", values: amort.rows.map((r) => r.principal) },
    { key: "balance", label: "Remaining balance", color: COLORS.balance, kind: "line", values: amort.rows.map((r) => r.balance) },
    { key: "cum", label: "Total interest paid", color: COLORS.cumInterest, kind: "line", values: amort.rows.map((r) => r.cumInt) },
  ];

  const compareSeries: Series[] = [
    { key: "base", label: "Balance as scheduled", color: COLORS.baseline, kind: "line", values: amort.rows.map((r) => r.balance) },
    {
      key: "accel",
      label: "Balance with extra",
      color: COLORS.accelerated,
      kind: "line",
      values: amort.rows.map((r) =>
        extra.byMonth && r.k <= extra.months ? (extra.byMonth[r.k] ?? 0) : 0,
      ),
    },
  ];

  return (
    <div>
      <nav
        role="tablist"
        aria-label="Deal Desk views"
        className="mb-6 flex gap-0.5 border-b border-edge"
      >
        {(
          [
            ["qualify", "01", "Qualify"],
            ["underwrite", "02", "Underwrite the deal"],
            ["amort", "03", "Amortization & interest"],
          ] as const
        ).map(([id, n, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px flex cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-[13.5px] font-semibold transition-colors duration-150 ${
              tab === id
                ? "border-magenta text-fog"
                : "border-transparent text-muted hover:text-fog"
            }`}
          >
            <span className="font-mono text-[11px] text-magenta">{n}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* ═══════════ QUALIFY ═══════════ */}
      {tab === "qualify" ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <Panel title="Your numbers">
                <InlineField label="Gross monthly income" hint="before taxes, all sources" prefix="$" value={f.grossMonthlyIncome} onChange={set("grossMonthlyIncome")} />
                <InlineField label="Existing monthly debts" hint="cards, auto, student loans" prefix="$" value={f.monthlyDebts} onChange={set("monthlyDebts")} />
                <InlineField label="Max DTI" hint="total debt-to-income lenders allow" suffix="%" value={f.maxDTI} onChange={set("maxDTI")} width="w-[94px]" />
              </Panel>

              <Panel title="Loan assumptions">
                <InlineField label="Interest rate" suffix="%" value={f.interestRate} onChange={set("interestRate")} width="w-[94px]" />
                <InlineField label="Loan term" suffix="yrs" value={f.termYears} onChange={set("termYears")} width="w-[94px]" />
                <InlineField label="Down payment" suffix="%" value={f.downPct} onChange={set("downPct")} width="w-[94px]" />
                <Note>
                  These stay in sync with the Underwrite view. The tax, insurance
                  and PMI <i>rates</i> from that view scale with the price we
                  solve for, so the estimate stays honest at any size of home.
                </Note>
              </Panel>
            </div>

            <div className="flex flex-col gap-4">
              <Callout label="Estimated max purchase price" value={money2(q.maxPrice)}>
                At a <b>{f.maxDTI}% DTI</b> your total housing payment can run up
                to <b>{money2(q.housingBudget)}/mo</b>
                {q.debts > 0 ? <> (after {money2(q.debts)} of other debt)</> : null}.
                That supports about <b>{money2(q.maxLoan)}</b> in loan with{" "}
                {pct(m.downPct, 1)} down — roughly <b>{money2(q.cashNeeded)}</b>{" "}
                cash to close.
              </Callout>

              <Panel title="The payment at that price">
                <LineRow label="Principal & interest" value={money2(q.piMo)} />
                <LineRow label="Property tax" value={money2(q.taxMo)} />
                <LineRow label="Insurance" value={money2(q.insMo)} />
                <LineRow label="PMI" value={money2(q.pmiMo)} />
                <LineRow label="HOA" value={money2(q.hoaMo)} />
                <LineRow label="Total housing payment" value={money2(q.housingMo)} total />
                <LineRow label="Housing ratio (front-end)" value={pct(q.frontEndRatio)} />
                <LineRow label="Total DTI (back-end)" value={pct(q.backEndRatio)} />
              </Panel>
            </div>
          </div>

          <Panel title="How lenders decide how much house you can afford" className="mt-5">
            <Note className="mt-0">
              Modern approvals run through automated underwriting (Fannie and
              Freddie&rsquo;s DU &amp; LP, or FHA&rsquo;s TOTAL Scorecard), and
              the number they key on is{" "}
              <b className="text-mist">debt-to-income (DTI)</b> — your total monthly
              debt payments divided by your gross (pre-tax) income.
            </Note>
            <Note>
              <b className="text-mist">Back-end DTI</b> is the real lever: it
              counts the full housing payment <i>plus</i> every other monthly
              debt. The old <b className="text-mist">front-end</b> (housing only)
              rule of ~28% still gets quoted, but underwriting engines routinely
              clear housing ratios in the high 30s and 40s as long as the
              back-end is in range — which is why capping at 28% understates what
              you would actually be approved for. Both ratios are shown above
              as a read-out; the DTI field is what drives the number.
            </Note>
            <Note>
              Typical ceilings: <b>~43%</b> is the classic qualified-mortgage
              line, conventional loans commonly go to <b>45–50%</b>, and FHA can
              stretch past <b>50%</b> with strong credit and cash reserves. We
              take the DTI limit, subtract existing debts and HOA, then solve for
              the largest price whose full payment still fits. It&rsquo;s a
              rule-of-thumb estimate — a real pre-approval also weighs credit
              score, reserves and documented income, so treat this as the top of
              the range to confirm with a lender.
            </Note>
          </Panel>
        </>
      ) : null}

      {/* ═══════════ UNDERWRITE ═══════════ */}
      {tab === "underwrite" ? (
        <>
          {showAdvanced ? (
            <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[16px] border border-edge bg-panel px-4 py-3.5">
              <Mono className="mr-1.5 font-bold tracking-[1.4px] text-magenta">
                Deal check
              </Mono>
              {rules.map((r) => (
                <Chip key={r.label} tone={r.ok ? "pos" : "neg"}>
                  {r.label} · {r.got}
                </Chip>
              ))}
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            {/* inputs */}
            <div className="flex flex-col gap-4">
              <Panel
                title="Scenario"
                action={
                  <Segmented
                    size="sm"
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: "rental", label: "Buy & hold" },
                      { value: "househack", label: "Live-in → rent" },
                    ]}
                    ariaLabel="Scenario"
                  />
                }
              >
                {mode === "househack" ? (
                  <>
                    <label className="flex items-center justify-between gap-4 py-2">
                      <span className="text-[13px] text-mist">
                        Units you&rsquo;ll live in
                        <small className="mt-0.5 block text-[11px] text-dusk">
                          the rest get rented while you&rsquo;re there
                        </small>
                      </span>
                      <SelectInput
                        className="w-[86px]"
                        value={occupiedUnits}
                        onChange={(e) => setOccupiedUnits(Number(e.target.value))}
                      >
                        {[0, 1, 2, 3, 4]
                          .filter((x) => x <= unitCount)
                          .map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                      </SelectInput>
                    </label>
                    <Note>
                      Phase 1 shows your out-of-pocket cost while you live there.
                      Phase 2 — the KPIs on the right — shows the deal once you
                      move out and rent every unit.
                    </Note>
                  </>
                ) : (
                  <p className="py-1 text-[13px] text-dusk">
                    Straight rental: every unit is let from day one.
                  </p>
                )}
              </Panel>

              <Panel title="Purchase &amp; financing">
                <InlineField label="Purchase price" prefix="$" value={f.purchasePrice} onChange={set("purchasePrice")} />
                <InlineField label="Down payment" suffix="%" value={f.downPct} onChange={set("downPct")} width="w-[94px]" />
                <InlineField label="Interest rate" suffix="%" value={f.interestRate} onChange={set("interestRate")} width="w-[94px]" />
                <InlineField label="Loan term" suffix="yrs" value={f.termYears} onChange={set("termYears")} width="w-[94px]" />
                <InlineField label="Closing costs" hint="lender, title & government fees" suffix="%" value={f.closingPct} onChange={set("closingPct")} width="w-[94px]" />
                <InlineField label="Prepaids & escrow at closing" hint="prepaid interest, 1st-yr insurance, tax reserves" prefix="$" value={f.prepaidsEscrow} onChange={set("prepaidsEscrow")} />
                <InlineField label="Rehab" prefix="$" value={f.rehab} onChange={set("rehab")} />
                <InlineField label="Furniture / setup" prefix="$" value={f.furniture} onChange={set("furniture")} />
              </Panel>

              <Panel
                title="Rental income"
                action={
                  <Segmented
                    size="sm"
                    value={unitCount}
                    onChange={(u) => {
                      setUnitCount(u);
                      setOccupiedUnits((o) => Math.min(o, u));
                    }}
                    options={[1, 2, 3, 4].map((u) => ({ value: u, label: String(u) }))}
                    ariaLabel="Unit count"
                  />
                }
              >
                {([1, 2, 3, 4] as const).slice(0, unitCount).map((u) => (
                  <InlineField
                    key={u}
                    label={`Unit ${u} rent`}
                    hint="per month"
                    prefix="$"
                    value={f[`rent${u}` as FieldKey]}
                    onChange={set(`rent${u}` as FieldKey)}
                  />
                ))}
                <InlineField label="Occupancy rate" suffix="%" value={f.occupancy} onChange={set("occupancy")} width="w-[94px]" />
                <InlineField label="Additional income" hint="per month — parking, laundry…" prefix="$" value={f.additionalMo} onChange={set("additionalMo")} />
              </Panel>

              <Panel title="Operating costs">
                <InlineField label="Property tax" hint={`per year · ${((num("propertyTaxYr") / (num("purchasePrice") || 1)) * 100).toFixed(2)}% of price`} prefix="$" value={f.propertyTaxYr} onChange={set("propertyTaxYr")} />
                <InlineField label="Insurance" hint={`per year · ${((num("insuranceYr") / (num("purchasePrice") || 1)) * 100).toFixed(2)}% of price`} prefix="$" value={f.insuranceYr} onChange={set("insuranceYr")} />
                <InlineField label="PMI" hint={`per year · ${((num("pmiYr") / (m.loan || 1)) * 100).toFixed(2)}% of loan · ends at 20% equity`} prefix="$" value={f.pmiYr} onChange={set("pmiYr")} />
                <InlineField label="HOA" hint="per month" prefix="$" value={f.hoaMo} onChange={set("hoaMo")} />
                <InlineField label="Maintenance" hint={`per year · ${((num("maintenanceYr") / (num("purchasePrice") || 1)) * 100).toFixed(2)}% of price`} prefix="$" value={f.maintenanceYr} onChange={set("maintenanceYr")} />
                <InlineField label="Management" hint="% of income" suffix="%" value={f.mgmtPct} onChange={set("mgmtPct")} width="w-[94px]" />
                <InlineField label="Gas" hint="per year" prefix="$" value={f.gasYr} onChange={set("gasYr")} />
                <InlineField label="Electric" hint="per year" prefix="$" value={f.electricYr} onChange={set("electricYr")} />
                <InlineField label="Water / sewer" hint="per year" prefix="$" value={f.waterYr} onChange={set("waterYr")} />
                <InlineField label="Other operating" hint="per year" prefix="$" value={f.otherOpexYr} onChange={set("otherOpexYr")} />
                <InlineField label="Cleaning" hint="per year" prefix="$" value={f.cleaningYr} onChange={set("cleaningYr")} />
                <InlineField label="CapEx reserve" hint="per year — set aside for big-ticket items" prefix="$" value={f.capexYr} onChange={set("capexYr")} />
                <Note>
                  The percentages next to tax, insurance and PMI show what each
                  represents against the price (or the loan), so they&rsquo;re
                  easy to sanity-check. Starting values are blended averages
                  across Florida, California and New York — swap in the real
                  numbers for your market and the deal re-prices instantly.
                </Note>
              </Panel>
            </div>

            {/* results */}
            {/* Deliberately not pinned, unlike the Savings Snapshot and S-Corp
                results columns: those are compact summaries that fit a screen,
                this one runs past it. A sticky column taller than the viewport
                strands its own bottom half. */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Mono className="font-bold tracking-[1.4px] text-muted">
                  The numbers
                </Mono>
                <label className="flex cursor-pointer items-center gap-2.5">
                  <Mono
                    className={`font-bold ${showAdvanced ? "text-teal" : "text-muted"}`}
                  >
                    Investor metrics
                  </Mono>
                  <Switch
                    checked={showAdvanced}
                    onChange={setShowAdvanced}
                    label="Show investor metrics"
                  />
                </label>
              </div>

              <KpiRow cols={3}>
                <Kpi
                  label="Total cash to close"
                  value={money2(m.totalCashIn)}
                  sub={`down + closing + prepaids${num("rehab") + num("furniture") > 0 ? " + rehab/furniture" : ""}`}
                />
                <Kpi label="Monthly payment (P&I)" value={money2(m.mortgageMo)} sub="principal & interest only" />
                <Kpi label="Loan amount" value={money2(m.loan)} sub={`${pct(m.downPct, 1)} down`} />
              </KpiRow>

              <KpiRow cols={3}>
                <Kpi
                  label="Lender payment (PITI + MI)"
                  value={money2(m.pitiMiMo)}
                  sub="the number on the statement"
                />
                <Kpi
                  label="Monthly costs"
                  value={money2(m.monthlyOpex + m.monthlyCapex)}
                  sub="taxes, insurance, PMI, HOA, upkeep, utilities"
                />
                <Kpi
                  label="Total monthly (all-in)"
                  value={money2(m.allInMo)}
                  sub="payment + every monthly cost"
                  tone="brand"
                />
              </KpiRow>

              {showAdvanced ? (
                <>
                  <KpiRow cols={3}>
                    <Kpi label="NOI (yr)" value={money2(m.noi)} sub="income − operating costs" />
                    <Kpi label="Cap rate" value={pct(m.capRate)} sub="NOI ÷ price" tone={m.capRate >= 0.06 ? "pos" : "neg"} />
                    <Kpi label="Cash flow (yr)" value={money2(m.cashFlowYr)} sub="after debt & capex" tone={m.cashFlowYr >= 0 ? "pos" : "neg"} />
                    <Kpi label="Cash-on-cash" value={pct(m.coc)} sub="cash flow ÷ cash in" tone={m.coc >= 0.08 ? "pos" : "neg"} />
                    <Kpi label="DSCR" value={times(m.dscr)} sub="can the rent cover the loan?" tone={m.dscr >= 1.25 ? "pos" : "neg"} />
                    <Kpi label="Op. expense ratio" value={pct(m.oer)} sub="operating costs ÷ income" />
                  </KpiRow>
                  <Note className="mt-0">
                    <b className="text-mist">DSCR</b> = NOI ÷ annual loan
                    payments. It answers whether the property earns enough to pay
                    its own mortgage: <b>1.0×</b> breaks even, and most lenders
                    want <b>1.20–1.25×</b> before they&rsquo;ll finance a rental.{" "}
                    <b className="text-mist">Operating expense ratio</b> is the
                    share of rent eaten by running costs — lower is leaner.
                  </Note>
                </>
              ) : null}

              {mode === "househack" ? (
                <Callout
                  tone={m.hhOutOfPocketMo <= 0 ? "pos" : "brand"}
                  label="Phase 1 · while you live there"
                  value={
                    m.hhOutOfPocketMo <= 0
                      ? `${money2(-m.hhOutOfPocketMo)} /mo in your pocket`
                      : `${money2(m.hhOutOfPocketMo)} /mo out of pocket`
                  }
                >
                  Occupying {m.occUnits} of {unitCount} unit
                  {unitCount > 1 ? "s" : ""}, renting the rest for{" "}
                  {money2(m.hhRentMo)}/mo. Your true housing cost = payment{" "}
                  {money2(m.mortgageMo)} + operating {money2(m.monthlyOpex)} −
                  rent collected {money2(m.hhRentMo)}. Once you move out and
                  rent everything (Phase 2), the deal performs as the KPIs above
                  show.
                </Callout>
              ) : null}

              <Panel title="Operating expenses (annual)">
                {Object.entries(m.opexItems).map(([k, v]) => (
                  <LineRow key={k} label={k} value={money2(v)} />
                ))}
                <LineRow label="Total operating expenses" value={money2(m.opexYr)} total />
                <LineRow label="Gross income" value={money2(m.grossIncomeYr)} />
                <LineRow label="− Debt service" value={money2(-m.debtServiceYr)} tone="neg" />
                <LineRow label="− CapEx reserve" value={money2(-m.capexYr)} tone="neg" />
                <LineRow
                  label="Cash flow after everything"
                  value={money2(m.cashFlowYr)}
                  total
                  tone={m.cashFlowYr >= 0 ? "pos" : "neg"}
                />
                <Note>
                  NOI here counts HOA as an operating cost — leaving it out is a
                  common way to overstate a deal. CapEx reserve and debt service
                  sit below NOI, per standard underwriting.
                </Note>
              </Panel>
            </div>
          </div>
        </>
      ) : null}

      {/* ═══════════ AMORTIZATION ═══════════ */}
      {tab === "amort" ? (
        <>
          <KpiRow cols={4}>
            <Kpi label="Monthly payment" value={money2(m.mortgageMo)} sub="P & I" />
            <Kpi label="Total interest" value={money2(amort.totalInterest)} sub={`over ${f.termYears} years`} tone="neg" />
            <Kpi label="Total paid back" value={money2(amort.totalPaid)} sub={`on a ${money2(m.loan)} loan`} />
            <Kpi
              label="Interest per $1 borrowed"
              value={`$${(amort.totalInterest / (m.loan || 1)).toFixed(2)}`}
              sub={`at ${f.interestRate}%`}
            />
          </KpiRow>

          <Callout
            label="Total interest over the life of this loan"
            value={money2(amort.totalInterest)}
            className="mt-4"
          >
            You borrow <b>{money2(m.loan)}</b> and pay back{" "}
            <b>{money2(amort.totalPaid)}</b> — the difference is pure interest.
            That&rsquo;s <b>{pct(amort.totalInterest / (m.loan || 1), 0)}</b> on
            top of the loan, or about{" "}
            <b>${(amort.totalInterest / (m.loan || 1)).toFixed(2)}</b> of
            interest for every dollar you borrow at {f.interestRate}% over{" "}
            {f.termYears} years.
          </Callout>

          <Panel title="Where your payments go, month by month" className="mt-4">
            <ChartLegend series={flowSeries} />
            <FlowChart
              series={flowSeries}
              xLabel={yrLabel}
              labelForIndex={monthLabel}
            />
            <Note>
              Each month&rsquo;s payment splits into{" "}
              <b style={{ color: COLORS.interest }}>interest</b> and{" "}
              <b style={{ color: COLORS.principal }}>principal</b> on the left
              axis. The <b>white line</b> is your remaining balance and the{" "}
              <b style={{ color: COLORS.cumInterest }}>ember line</b> is the total
              interest you&rsquo;ve paid so far — both on the right axis. Watch them cross: as
              the balance falls, the interest you&rsquo;ve handed the bank climbs past it.
              Hover any month to see all four figures.
            </Note>
          </Panel>

          <Panel title="Pay extra toward principal" className="mt-4">
            <InlineField
              label="Extra principal / month"
              hint="paid on top of your normal payment"
              prefix="$"
              value={f.extraPrincipal}
              onChange={set("extraPrincipal")}
            />
            {extra.E > 0 && isFinite(extra.months) ? (
              <>
                <Callout
                  tone="pos"
                  label="Interest saved"
                  value={money2(extra.interestSaved)}
                  className="mt-4"
                >
                  Adding <b>{money2(extra.E)}/mo</b> pays the loan off in{" "}
                  <b>{(extra.months / 12).toFixed(1)} years</b> —{" "}
                  <b>{(extra.monthsSaved / 12).toFixed(1)} years sooner</b> — and
                  cuts total interest from {money2(amort.totalInterest)} to{" "}
                  <b>{money2(extra.totalInterest)}</b>. Same payment — you just redirect a little
                  extra to principal and skip years of interest.
                </Callout>
                <div className="mt-4">
                  <ChartLegend series={compareSeries} />
                  <LineChart
                    series={compareSeries}
                    xLabel={yrLabel}
                    labelForIndex={monthLabel}
                  />
                </div>
              </>
            ) : (
              <Note>
                Enter an extra monthly amount above to see how much interest it
                wipes out and how many years it shaves off. Even a small amount
                early has an outsized effect, because it removes principal that
                would otherwise accrue interest for decades.
              </Note>
            )}
          </Panel>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="Rate sensitivity">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    <TableHead align="left">Rate</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Lifetime interest</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {rateTable.map((r) => (
                    <tr
                      key={r.d}
                      className={
                        r.current
                          ? "bg-magenta/10 font-bold text-magenta"
                          : "text-mist"
                      }
                    >
                      <TableCell align="left">
                        {r.rate.toFixed(2)}%{r.current ? " ←" : ""}
                      </TableCell>
                      <TableCell>{money2(r.pay)}</TableCell>
                      <TableCell>{money2(r.totalInt)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Note>
                Every extra point of rate on this loan is worth studying — the
                lifetime-interest column shows exactly what it costs to lock one
                rate versus another.
              </Note>
            </Panel>

            <Panel title="Monthly schedule">
              <div className="max-h-[340px] overflow-auto rounded-[10px] border border-edge">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead className="sticky top-0 bg-panel">
                    <tr>
                      <TableHead align="left">Mo</TableHead>
                      <TableHead>Interest</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Interest to date</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {amort.rows.map((r) => (
                      <tr key={r.k} className="text-mist even:bg-white/[0.02]">
                        <TableCell align="left">{r.k}</TableCell>
                        <TableCell>{money2(r.interest)}</TableCell>
                        <TableCell>{money2(r.principal)}</TableCell>
                        <TableCell>{money2(r.balance)}</TableCell>
                        <TableCell>{money2(r.cumInt)}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Note>
                All {m.nMonths} monthly payments. &ldquo;Interest to date&rdquo;
                is the running total you&rsquo;ve paid the lender — scroll to the bottom to
                see the full {money2(amort.totalInterest)}.
              </Note>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
