"use client";

/**
 * S-Corp self-employment tax savings.
 *
 * Models the one thing an S-corp election actually buys: SE tax on the whole
 * profit becomes payroll tax on a salary. Everything else — payroll costs,
 * the extra return, state fees — is out of scope and called out on screen.
 *
 * The risk meter is the reason this is a staff tool and not a public one. A
 * salary ratio that saves the most is also the one the IRS is most likely to
 * reclassify, so the number is always shown next to how defensible it is.
 */

import { useState } from "react";
import { money } from "@/lib/widget-format";
import {
  Callout,
  Chip,
  Disclaimer,
  Field,
  Kpi,
  KpiRow,
  LineRow,
  Mono,
  Note,
  NumInput,
  Panel,
  Slider,
} from "@/components/portal/widgets/ui";

/**
 * 2025 figures on purpose: this tool prices an election against the return
 * being prepared now, not next year's. Update with the tax year.
 */
const SS_RATE = 0.124;
const MED_RATE = 0.029;
const ADDL_MED = 0.009;
const SE_BASE = 0.9235;
const WAGE_BASE = 176100;

/** Profit below which the election's overhead eats the saving. */
const GREEN_LIGHT = 55000;
/** A salary this size is defendable on its own, whatever share of profit it is. */
const REASONABLE_ABS = 150000;

function seTax(profit: number) {
  const b = Math.max(0, profit) * SE_BASE;
  return (
    SS_RATE * Math.min(b, WAGE_BASE) +
    MED_RATE * b +
    ADDL_MED * Math.max(0, b - 200000)
  );
}

function payrollTax(salary: number) {
  return (
    SS_RATE * Math.min(salary, WAGE_BASE) +
    MED_RATE * salary +
    ADDL_MED * Math.max(0, salary - 200000)
  );
}

type RiskLevel = "low" | "medium" | "high";

const RISK_SEGMENTS: { level: RiskLevel; label: string; cls: string }[] = [
  { level: "low", label: "Conservative", cls: "bg-teal text-teal" },
  { level: "medium", label: "Getting aggressive", cls: "bg-ember text-ember" },
  { level: "high", label: "Aggressive", cls: "bg-danger text-danger" },
];

export default function ScorpAnalyzer() {
  const [revenue, setRevenue] = useState("200000");
  const [expenses, setExpenses] = useState("50000");
  const [salaryPct, setSalaryPct] = useState(40);
  const [distPct, setDistPct] = useState(25);

  const profit = Math.max(0, Number(revenue || 0) - Number(expenses || 0));
  const greenLight = profit > GREEN_LIGHT;
  const salary = Math.round(profit * (salaryPct / 100));

  const before = seTax(profit);
  const after = payrollTax(salary);
  const savings = Math.max(0, before - after);
  const distribution = Math.round(profit * (distPct / 100));

  const belowThreshold = profit < GREEN_LIGHT;
  const salaryRatio = salary / Math.max(profit, 1);
  const absReasonable = salary >= REASONABLE_ABS;

  let risk: { level: RiskLevel; pill: string; message: string; tone: "pos" | "warn" | "neg" } | null =
    null;
  if (!belowThreshold) {
    if (salaryRatio >= 0.2 || absReasonable) {
      risk = {
        level: "low",
        pill: "Conservative",
        tone: "pos",
        message:
          absReasonable && salaryRatio < 0.2
            ? `Even at ${salaryPct}% of profit, ${money(salary)} is a reasonable salary on its own — the IRS weighs the actual dollar amount, not just the ratio.`
            : "Conservative mix. Salary is likely defendable if you document your role and hours.",
      };
    } else if (salaryRatio >= 0.15) {
      risk = {
        level: "medium",
        pill: "Getting aggressive",
        tone: "warn",
        message:
          "Leaning on distributions. Make sure you have a documented salary study behind this.",
      };
    } else {
      risk = {
        level: "high",
        pill: "Aggressive",
        tone: "neg",
        message:
          "Aggressive compensation mix. The IRS could reclassify some of your distributions as wages.",
      };
    }
  }

  const leftAfterSalary = profit - salary;
  const overDistributing = distribution > leftAfterSalary;
  const retained = Math.round(leftAfterSalary - distribution);

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── inputs ── */}
        <div className="flex flex-col gap-4">
          <Panel title="Profit &amp; loss">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Total revenue">
                <NumInput value={revenue} onChange={setRevenue} prefix="$" align="left" />
              </Field>
              <Field label="Expenses">
                <NumInput value={expenses} onChange={setExpenses} prefix="$" align="left" />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-edge pt-3.5">
              <Mono className="text-muted">Business profit</Mono>
              <span className="font-display text-[30px] font-bold tabular-nums text-fog">
                {money(profit)}
              </span>
            </div>
          </Panel>

          {/* go / no-go */}
          <div
            className={`flex items-center gap-3.5 rounded-[16px] border px-4 py-3.5 ${
              greenLight
                ? "border-teal/50 bg-teal/10"
                : "border-edge bg-white/[0.02]"
            }`}
          >
            <span
              className={`h-3.5 w-3.5 flex-none rounded-full ${
                greenLight ? "bg-teal shadow-[0_0_14px_var(--color-teal)]" : "bg-dusk"
              }`}
            />
            <div>
              <div
                className={`font-display text-[15px] font-bold ${
                  greenLight ? "text-teal" : "text-muted"
                }`}
              >
                {greenLight
                  ? "Green light for the S-corp election"
                  : "Hold off on the S corp for now"}
              </div>
              <div className="mt-0.5 text-[12px] text-muted">
                {greenLight
                  ? `Profit is above ${money(GREEN_LIGHT)} — a strong candidate.`
                  : `S corp makes sense once profit clears ${money(GREEN_LIGHT)}.`}
              </div>
            </div>
          </div>

          {/* salary + risk meter */}
          <Panel
            title="Salary (W-2 payroll)"
            action={risk ? <Chip tone={risk.tone}>{risk.pill}</Chip> : null}
          >
            <div className="mb-3.5 flex items-baseline gap-2.5">
              <span className="font-display text-[30px] font-bold tabular-nums text-magenta">
                {money(salary)}
              </span>
              <span className="font-mono text-[12px] text-dusk">
                {salaryPct}% of profit
              </span>
            </div>
            <Slider
              value={salaryPct}
              onChange={setSalaryPct}
              ariaLabel="Salary as a percentage of profit"
            />

            {belowThreshold || !risk ? (
              <p className="mt-3.5 text-[12px] leading-relaxed text-muted">
                Below this profit level, an S corp usually isn&rsquo;t worth the
                complexity.
              </p>
            ) : (
              <>
                <div className="mt-3.5 flex gap-1.5">
                  {RISK_SEGMENTS.map((seg) => {
                    const on = risk.level === seg.level;
                    const [bg, text] = seg.cls.split(" ");
                    return (
                      <div key={seg.level} className="flex-1 text-center">
                        <div
                          className={`h-1.5 rounded transition-colors duration-200 ${
                            on ? bg : "bg-white/[0.08]"
                          }`}
                        />
                        <div
                          className={`mt-1.5 font-mono text-[8.5px] uppercase tracking-[0.5px] ${
                            on ? text : "text-faint"
                          }`}
                        >
                          {seg.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p
                  className={`mt-3 text-[12px] leading-relaxed ${
                    risk.tone === "pos" ? "text-teal"
                    : risk.tone === "warn" ? "text-ember"
                    : "text-danger"
                  }`}
                >
                  {risk.message}
                </p>
              </>
            )}
          </Panel>

          {/* distributions */}
          <Panel title="Recommended distribution">
            <div className="mb-3.5 flex items-baseline gap-2.5">
              <span className="font-display text-[30px] font-bold tabular-nums text-magenta">
                {money(distribution)}
              </span>
              <span className="font-mono text-[12px] text-dusk">
                {distPct}% of profit
              </span>
            </div>
            <Slider
              value={distPct}
              onChange={setDistPct}
              ariaLabel="Distribution as a percentage of profit"
            />
            {overDistributing ? (
              <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-ember/40 bg-ember/10 px-3 py-2.5">
                <span aria-hidden className="text-[14px] leading-tight">
                  ⚠️
                </span>
                <span className="text-[11.5px] leading-relaxed text-ember">
                  Distributing more than the profit left after salary — this is
                  pulling from cash, retained earnings, or basis.
                </span>
              </div>
            ) : (
              <p className="mt-2.5 text-[11.5px] text-dusk">
                {money(retained)} stays in the business.
              </p>
            )}
          </Panel>
        </div>

        {/* ── results ── */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[16px] border border-magenta/35 bg-gradient-to-br from-magenta/10 to-white/[0.02] p-6">
            <div className="flex items-baseline justify-between">
              <Mono className="text-muted">Before · single-member LLC</Mono>
              <span className="font-display text-[15px] font-bold tabular-nums text-fog">
                {money(before)}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between border-b border-edge pb-3.5">
              <Mono className="text-muted">After · S corp</Mono>
              <span className="font-display text-[15px] font-bold tabular-nums text-fog">
                {money(after)}
              </span>
            </div>
            <div className="pt-4 text-center">
              <Mono className="text-muted">You save per year</Mono>
              <div className="mt-1 font-display text-[52px] font-bold leading-none tracking-[-2px] tabular-nums text-magenta">
                {money(savings)}
              </div>
            </div>
          </div>

          <KpiRow cols={3}>
            <Kpi
              label="Salary"
              value={money(salary)}
              sub={`${salaryPct}% of profit`}
            />
            <Kpi
              label="Distributions"
              value={money(distribution)}
              sub={`${distPct}% of profit`}
            />
            <Kpi
              label="Retained"
              value={money(Math.max(0, retained))}
              sub="stays in the business"
              tone={overDistributing ? "neg" : "plain"}
            />
          </KpiRow>

          <Panel title="How the number is built">
            <LineRow
              label="Self-employment tax as an LLC"
              value={money(before)}
            />
            <LineRow
              label="Payroll tax on your salary"
              value={`− ${money(after)}`}
              tone="neg"
            />
            <LineRow label="Annual saving" value={money(savings)} total tone="pos" />
            <LineRow
              label="Effective saving on profit"
              value={profit > 0 ? `${((savings / profit) * 100).toFixed(1)}%` : "—"}
            />
            <Note>
              Social security stops at the {money(WAGE_BASE)} wage base, so most
              of the saving comes from the 12.4% SS portion on the profit above
              the salary. Medicare&rsquo;s 2.9% has no cap and keeps running on
              the wages either way.
            </Note>
          </Panel>

          <Callout label="Net effect" value={money(savings)}>
            Salary of {money(salary)} ({salaryPct}% of {money(profit)} profit),{" "}
            {money(distribution)} in distributions,{" "}
            {money(Math.max(0, retained))} retained.
          </Callout>
        </div>
      </div>

      <Disclaimer>
        Estimated self-employment / payroll tax savings only — before payroll and
        filing costs, and not a reasonable-compensation determination. Uses the
        2025 Social Security wage base ({money(WAGE_BASE)}); update for the
        current tax year. Internal estimate, not tax advice.
      </Disclaimer>
    </div>
  );
}
