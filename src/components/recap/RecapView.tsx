"use client";

import { useEffect, useState } from "react";
import CipherRain from "@/components/effects/CipherRain";
import NeuralWeb from "@/components/effects/NeuralWeb";
import { Eyebrow } from "@/components/estimator/fields";
import { MoneyFlow } from "@/components/portal/widgets/ui";
import { computeRecap, type RecapSide } from "@/lib/tax-recap/compute";
import type { RecapDoc } from "@/lib/tax-recap/schema";
import { money } from "@/lib/widget-format";

/**
 * The client-facing recap — the page the link opens.
 *
 * Same six beats as the Canva deck it replaces (cover, agenda, before, after,
 * at filing + strategy, next steps), re-set in the site's own type and
 * palette over the home page's moving background, with the one number that
 * matters counting up. Every figure is derived by computeRecap from the
 * reviewed numbers; nothing is typed in here.
 *
 * Prints to a handout: the canvas layers and the print button drop out,
 * cards refuse to split across pages, and the dark ground is kept (it's the
 * brand) via print-color-adjust.
 */

export default function RecapView({ recap }: { recap: RecapDoc }) {
  const c = computeRecap(recap);
  const firstName = recap.clientName.trim().split(/\s+/)[0] || recap.clientName;
  const stateLabel = recap.stateCode ? (STATE_NAMES[recap.stateCode] ?? recap.stateCode) : "State";
  const growth =
    c.priorYearIncome && c.priorYearIncome > 0
      ? (c.currentYearIncome - c.priorYearIncome) / c.priorYearIncome
      : null;

  return (
    <>
      <style>{`@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <CipherRain />
      <div className="relative z-[1] min-h-svh">
        <NeuralWeb
          className="print:hidden"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 160px, #000 calc(100% - 240px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 160px, #000 calc(100% - 240px), transparent 100%)",
          }}
        />

        <div className="mx-auto max-w-[820px] px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          {/* ── header ── */}
          <header className="flex items-center justify-between gap-4">
            <div className="font-display text-[17px] font-semibold text-fog">
              DeCypher <span className="text-grad">Financials</span>
            </div>
            <div className="font-mono text-[10.5px] uppercase tracking-[2px] text-muted">
              Tax Recap · {recap.taxYear}
            </div>
          </header>

          {/* ── cover ── */}
          <section className="mt-16 sm:mt-24">
            <Eyebrow>{recap.taxYear} tax recap</Eyebrow>
            <h1 className="mt-5 font-display text-[40px] font-bold leading-[1.02] tracking-[-1.5px] text-fog sm:text-[60px] sm:tracking-[-2.5px]">
              {firstName}, here&rsquo;s your {recap.taxYear} on one page.
            </h1>
            <p className="mt-5 max-w-[560px] text-[16px] leading-relaxed text-mist sm:text-[17px]">
              Where your taxes landed before DeCypher, where they landed after, and what
              comes next.
            </p>

            <div className="mt-10 grid gap-px overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.06] sm:grid-cols-3">
              <Stat label="Before DeCypher" value={money(c.before.totalTaxes)} tone="neg" />
              <Stat label="After DeCypher" value={money(c.after.totalTaxes)} />
              <div className="bg-night/90 px-5 py-5">
                <div className="font-mono text-[10.5px] uppercase tracking-[1.6px] text-teal">
                  Total tax savings
                </div>
                <div className="mt-2 font-display text-[34px] font-bold leading-none tracking-[-1px] tabular-nums text-teal">
                  <CountUp value={c.savings} />
                </div>
              </div>
            </div>
          </section>

          {/* ── agenda ── */}
          <Card className="mt-14" eyebrow="Agenda" title="What we'll cover">
            <ol className="mt-5 space-y-3">
              {["Your tax summary", "Q&A, if needed", "Housekeeping items"].map((item, i) => (
                <li key={item} className="flex items-baseline gap-4">
                  <span className="font-mono text-[12px] text-magenta">0{i + 1}</span>
                  <span className="font-display text-[18px] font-semibold text-fog">{item}</span>
                </li>
              ))}
            </ol>
            <div className="mt-7 flex flex-wrap gap-3">
              <Pill label={`${recap.taxYear} income`} value={money(c.currentYearIncome)} />
              {c.priorYearIncome !== null ? (
                <Pill label={`${recap.taxYear - 1} income`} value={money(c.priorYearIncome)} />
              ) : null}
              {growth !== null && isFinite(growth) ? (
                <Pill
                  label="Year over year"
                  value={`${growth >= 0 ? "+" : ""}${Math.round(growth * 100)}%`}
                  tone={growth >= 0 ? "pos" : "neg"}
                />
              ) : null}
            </div>
          </Card>

          {/* ── before / after ── */}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card eyebrow="Before DeCypher" title="Income only" sub="No write-offs, no strategies">
              <Ledger side={c.before} stateLabel={stateLabel} totalTone="neg" totalLabel="Total taxes owed" />
            </Card>
            <Card eyebrow="After DeCypher" title="Bookkeeping + strategies" sub="Your final return">
              <Ledger side={c.after} stateLabel={stateLabel} totalTone="pos" totalLabel="New total taxes owed" />
              <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-white/10 pt-3 text-[13px]">
                <span className="text-muted">Before DeCypher</span>
                <span className="font-mono tabular-nums text-danger">{money(c.before.totalTaxes)}</span>
              </div>
            </Card>
          </div>

          {/* ── savings ── */}
          <Card
            className="mt-6 border-teal/40 bg-gradient-to-b from-teal/[0.10] to-night/90"
            eyebrow="The result"
            title="Total tax savings"
          >
            <div className="mt-3 font-display text-[56px] font-bold leading-none tracking-[-2.5px] tabular-nums text-teal sm:text-[76px]">
              <CountUp value={c.savings} />
            </div>
            <p className="mt-4 max-w-[520px] text-[14.5px] leading-relaxed text-mist">
              The difference between what {recap.taxYear} would have cost on income alone and
              what it cost with your books done and every strategy applied.
            </p>
            <div className="mt-6 grid gap-px overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Deductions found" value={money(c.breakdown.deductionsFound)} small />
              <Stat label="Self-employment tax saved" value={money(c.breakdown.seTaxSaved)} small />
              <Stat label="Federal income tax saved" value={money(c.breakdown.incomeTaxSaved)} small />
              <Stat
                label={`${stateLabel} tax saved`}
                value={money(c.breakdown.stateSaved + c.breakdown.penaltiesSaved)}
                small
              />
            </div>
          </Card>

          {/* ── at filing ── */}
          <Card className="mt-6" eyebrow="At filing" title="Taxes due or refund">
            <div className="mt-5 space-y-2">
              <FilingRow label="Federal" line={c.filing.federal} />
              <FilingRow label={stateLabel} line={c.filing.state} />
              <div className="flex items-center justify-between gap-4 border-t-2 border-white/15 pt-3">
                <span className="font-display text-[15px] font-semibold text-mist">Total</span>
                <Due value={c.filing.total} large />
              </div>
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-dusk">
              Owed is the tax on the return. Paid is what was already sent in through
              withholding and estimated payments. What&rsquo;s left is due at filing, or
              comes back as a refund.
            </p>
          </Card>

          {/* ── strategy ── */}
          {recap.strategies.length ? (
            <Card className="mt-6" eyebrow="Improvements" title="Tax strategy going forward">
              <ol className="mt-5 space-y-3.5">
                {recap.strategies.map((s, i) => (
                  <li key={i} className="flex items-baseline gap-4">
                    <span className="flex-none font-mono text-[12px] text-magenta">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[15.5px] leading-relaxed text-fog">{s}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          {/* ── next steps ── */}
          {recap.nextSteps.length ? (
            <Card className="mt-6" eyebrow="Next steps" title="What to do now">
              <ul className="mt-5 space-y-3">
                {recap.nextSteps.map((s, i) => (
                  <li key={i}>
                    {s.href ? (
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-4 rounded-[14px] border border-white/12 bg-white/[0.03] px-4 py-3.5 no-underline transition-colors hover:border-magenta/60 hover:bg-magenta/[0.06]"
                      >
                        <span className="font-display text-[16px] font-semibold text-fog">{s.label}</span>
                        <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-magenta">
                          Open →
                        </span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-4 rounded-[14px] border border-white/8 px-4 py-3.5">
                        <span className="h-[6px] w-[6px] flex-none rounded-full bg-magenta" />
                        <span className="font-display text-[16px] font-semibold text-fog">{s.label}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* ── footer ── */}
          <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
            <p className="font-mono text-[11px] leading-relaxed text-dusk">
              Prepared by DeCypher Financials ·{" "}
              <a href="https://wedecypher.co" className="text-mist underline decoration-white/20 underline-offset-2 hover:text-fog">
                wedecypher.co
              </a>
            </p>
            <button
              type="button"
              onClick={() => window.print()}
              className="cursor-pointer rounded-full border border-white/15 px-4 py-2 font-display text-[13px] font-semibold text-fog transition-colors hover:border-mist print:hidden"
            >
              Save as PDF
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

function Card({
  eyebrow,
  title,
  sub,
  className = "",
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`break-inside-avoid rounded-[20px] border border-white/10 bg-night/85 px-6 py-6 sm:px-8 sm:py-7 ${className}`}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-display text-[24px] font-bold leading-tight tracking-[-0.5px] text-fog">
        {title}
      </h2>
      {sub ? <p className="mt-1 text-[13px] text-muted">{sub}</p> : null}
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "plain",
  small = false,
}: {
  label: string;
  value: string;
  tone?: "plain" | "neg" | "pos";
  small?: boolean;
}) {
  const color = tone === "neg" ? "text-danger" : tone === "pos" ? "text-teal" : "text-fog";
  return (
    <div className="bg-night/90 px-5 py-5">
      <div className="font-mono text-[10.5px] uppercase tracking-[1.6px] text-muted">{label}</div>
      <div
        className={`mt-2 font-display font-bold leading-none tabular-nums ${color} ${
          small ? "text-[24px] tracking-[-0.5px]" : "text-[34px] tracking-[-1px]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "pos" | "neg";
}) {
  const color = tone === "pos" ? "text-teal" : tone === "neg" ? "text-danger" : "text-fog";
  return (
    <div className="inline-flex items-baseline gap-2.5 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2">
      <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted">{label}</span>
      <span className={`font-display text-[15px] font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "plain",
  total = false,
}: {
  label: string;
  value: string;
  tone?: "plain" | "neg" | "pos" | "brand";
  total?: boolean;
}) {
  const color =
    tone === "neg" ? "text-danger"
    : tone === "pos" ? "text-teal"
    : tone === "brand" ? "text-magenta"
    : total ? "text-fog"
    : "text-mist";
  return (
    <div
      className={`flex items-baseline justify-between gap-4 text-[14px] ${
        total ? "mt-2 border-t-2 border-white/15 pt-3" : "border-t border-white/[0.06] py-2.5 first:border-t-0"
      }`}
    >
      <span className={total ? "font-display text-[15px] font-semibold text-mist" : "text-muted"}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${color} ${total ? "text-[19px] font-semibold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function Ledger({
  side,
  stateLabel,
  totalTone,
  totalLabel,
}: {
  side: RecapSide;
  stateLabel: string;
  totalTone: "neg" | "pos";
  totalLabel: string;
}) {
  const dash = (v: number) => (v === 0 ? "—" : money(v));
  return (
    <div className="mt-5">
      <Row label="W-2 income" value={dash(side.w2Income)} />
      <Row label="Business net income" value={money(side.businessNetIncome)} tone="brand" />
      <Row label="Other income (loss)" value={dash(side.otherIncome)} />
      <Row label="Gross income" value={money(side.grossIncome)} total />
      <div className="mt-4">
        <Row label="Federal taxes" value={money(side.federalTaxes)} />
        <Row label={`${stateLabel} taxes`} value={dash(side.stateTaxes)} />
        <Row label="Penalties" value={dash(side.penalties)} />
        <Row label={totalLabel} value={money(side.totalTaxes)} total tone={totalTone} />
      </div>
    </div>
  );
}

function FilingRow({ label, line }: { label: string; line: { owed: number; paid: number; due: number } }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[14px] border border-white/[0.08] px-4 py-3 sm:grid-cols-[110px_1fr_auto]">
      <span className="font-display text-[15px] font-semibold text-fog">{label}</span>
      <span className="col-span-2 font-mono text-[12.5px] tabular-nums text-muted sm:col-span-1">
        {money(line.owed)} owed <span className="text-faint">−</span> {money(line.paid)} paid
      </span>
      <div className="col-span-2 sm:col-span-1 sm:text-right">
        <Due value={line.due} />
      </div>
    </div>
  );
}

function Due({ value, large = false }: { value: number; large?: boolean }) {
  const refund = value < 0;
  return (
    <span className={`font-mono tabular-nums ${refund ? "text-teal" : "text-danger"} ${large ? "text-[22px] font-semibold" : "text-[15px] font-semibold"}`}>
      {money(Math.abs(value))}
      <span className="ml-1.5 font-body text-[11px] font-medium uppercase tracking-[1px] opacity-80">
        {refund ? "refund" : "due"}
      </span>
    </span>
  );
}

/** Counts up from zero once on mount — the reveal the Canva version couldn't do. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(value), 350);
    return () => clearTimeout(t);
  }, [value]);
  return <MoneyFlow value={shown} />;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "D.C.", FL: "Florida",
  GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana",
  IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",
};
