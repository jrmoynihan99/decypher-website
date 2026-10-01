"use client";

import { useEffect, useRef, useState } from "react";
import CipherRain from "@/components/effects/CipherRain";
import NeuralWeb from "@/components/effects/NeuralWeb";
import { Eyebrow } from "@/components/estimator/fields";
import { MoneyFlow } from "@/components/portal/widgets/ui";
import RecapHero from "@/components/recap/RecapHero";
import Reveal from "@/components/reveal/Reveal";
import SectionHeading from "@/components/ui/SectionHeading";
import { useSpotlight } from "@/hooks/useSpotlight";
import { prefersReducedMotion } from "@/lib/decrypt";
import { computeRecap, type EntityKind, type RecapSide } from "@/lib/tax-recap/compute";
import type { RecapDoc } from "@/lib/tax-recap/schema";
import { money } from "@/lib/widget-format";

/**
 * The client-facing recap — the page the link opens.
 *
 * It opens sealed: RecapHero holds the screen until the client presses and
 * holds to decypher it, and the decyphered headline ("Maya, you saved
 * $31,045") stays as the page's hero. The rest of the recap mounts below at
 * that moment and reads like the home page — full-bleed sections, a
 * decrypting heading each, frosted panels over the moving background — so
 * it is one design from the seal down. `sealed={false}` (the page's `?open`)
 * renders it all open.
 *
 * Same beats as the Canva deck it replaces (agenda, before, after, the
 * result, at filing, strategy, next steps). Every figure is derived by
 * computeRecap from the reviewed numbers; nothing is typed in here. The
 * handout is the PDF route, not the browser's print.
 */

export default function RecapView({ recap, sealed = true }: { recap: RecapDoc; sealed?: boolean }) {
  const [open, setOpen] = useState(!sealed);
  const c = computeRecap(recap);
  const firstName = recap.clientName.trim().split(/\s+/)[0] || recap.clientName;
  const stateLabel = recap.stateCode ? (STATE_NAMES[recap.stateCode] ?? recap.stateCode) : "State";
  const growth =
    c.priorYearIncome && c.priorYearIncome > 0
      ? (c.currentYearIncome - c.priorYearIncome) / c.priorYearIncome
      : null;
  // The S corporation's SE-tax saving sits outside the before/after — both
  // sides are S corporation returns — and is added on top, the way the
  // Canva recaps show "bookkeeping savings" and "S-corp savings" separately.
  const scorpSavings = recap.analysis?.scorpSavings?.amount ?? 0;
  const totalSavings = c.savings + scorpSavings;
  const attribution = recap.analysis?.attribution ?? [];

  const sections: { label: string; title: string; sub?: string; body: React.ReactNode }[] = [
    {
      label: "before & after",
      title: `Two versions of ${recap.taxYear}.`,
      sub: "Income only on the left. Your books done and every strategy applied on the right.",
      body: (
        <div className="grid gap-5 md:grid-cols-2">
          <Reveal>
            <Panel>
              <Eyebrow>Before DeCypher</Eyebrow>
              <PanelTitle sub="No write-offs, no strategies">Income only</PanelTitle>
              <Ledger side={c.before} stateLabel={stateLabel} entityKind={c.entityKind} totalTone="neg" totalLabel="Total taxes owed" />
            </Panel>
          </Reveal>
          <Reveal delay={0.12}>
            <Panel className="border-teal/30">
              <Eyebrow>After DeCypher</Eyebrow>
              <PanelTitle sub={c.scorp ? "Your final returns" : "Your final return"}>Bookkeeping + strategies</PanelTitle>
              <Ledger side={c.after} stateLabel={stateLabel} entityKind={c.entityKind} totalTone="pos" totalLabel="New total taxes owed" />
              <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-white/10 pt-3 text-[13px]">
                <span className="text-muted">Before DeCypher</span>
                <span className="font-mono tabular-nums text-danger">{money(c.before.totalTaxes)}</span>
              </div>
            </Panel>
          </Reveal>
        </div>
      ),
    },
    {
      label: "the result",
      title: "Total tax savings",
      sub:
        scorpSavings > 0
          ? `The difference between what ${recap.taxYear} would have cost on income alone and what it cost with your books done and every strategy applied, plus the self-employment tax your S corporation kept off the table.`
          : `The difference between what ${recap.taxYear} would have cost on income alone and what it cost with your books done and every strategy applied.`,
      body: (
        <>
          <Reveal className="text-center">
            <div className="font-display text-[clamp(64px,10vw,124px)] font-bold leading-none tracking-[-0.045em] text-teal tabular-nums">
              <CountUp value={totalSavings} />
            </div>
          </Reveal>
          {scorpSavings > 0 ? (
            <Reveal delay={0.1} className="mt-12 grid gap-4 sm:grid-cols-3">
              <StatTile label="Bookkeeping + strategies" value={money(c.savings)} />
              <StatTile label="S-corp: self-employment tax avoided" value={money(scorpSavings)} />
              <StatTile label="Total tax savings" value={money(totalSavings)} tone="pos" />
            </Reveal>
          ) : null}
          <Reveal delay={0.15} className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${scorpSavings > 0 ? "mt-4" : "mt-12"}`}>
            <StatTile label="Deductions found" value={signed(c.breakdown.deductionsFound)} />
            {c.entityKind === "scorp" ? (
              <StatTile label="S-corp state tax & PTET saved" value={signed(c.breakdown.entitySaved)} />
            ) : (
              <StatTile label="Self-employment tax saved" value={signed(c.breakdown.seTaxSaved)} />
            )}
            <StatTile label="Federal income tax saved" value={signed(c.breakdown.incomeTaxSaved)} />
            <StatTile label={`${stateLabel} tax saved`} value={signed(c.breakdown.stateSaved + c.breakdown.penaltiesSaved)} />
          </Reveal>
        </>
      ),
    },
    ...(attribution.length
      ? [
          {
            label: "where it came from",
            title: "Savings by strategy",
            sub: "Each strategy was switched on in this order and the whole return re-run, so the pieces add up to the total. A deduction is worth more at a higher tax bracket, which is why the order matters.",
            body: (
              <Reveal>
                <Panel>
                  {attribution.map((a, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-4 border-t border-white/[0.06] py-3.5 first:border-t-0 first:pt-0">
                      <div className="min-w-0">
                        <div className="text-[15.5px] text-fog">{a.label}</div>
                        {a.note ? <div className="mt-0.5 text-[12.5px] leading-snug text-dusk">{a.note}</div> : null}
                      </div>
                      <span className={`flex-none font-mono text-[15px] tabular-nums ${a.savings >= 0 ? "text-teal" : "text-danger"}`}>
                        {a.savings < 0 ? "−" : ""}
                        {money(Math.abs(a.savings))}
                      </span>
                    </div>
                  ))}
                  <div className="mt-2 flex items-baseline justify-between gap-4 border-t-2 border-white/15 pt-3.5">
                    <span className="font-display text-[15px] font-semibold text-mist">Bookkeeping + strategies</span>
                    <span className="font-mono text-[19px] font-semibold tabular-nums text-teal">{money(c.savings)}</span>
                  </div>
                  {recap.analysis?.scorpSavings ? (
                    <div className="flex items-baseline justify-between gap-4 border-t border-white/[0.06] py-3.5">
                      <div className="min-w-0">
                        <div className="text-[15.5px] text-fog">S corporation: self-employment tax avoided</div>
                        <div className="mt-0.5 text-[12.5px] leading-snug text-dusk">{recap.analysis.scorpSavings.note}</div>
                      </div>
                      <span className="flex-none font-mono text-[15px] tabular-nums text-teal">{money(recap.analysis.scorpSavings.amount)}</span>
                    </div>
                  ) : null}
                </Panel>
              </Reveal>
            ),
          },
        ]
      : []),
    {
      label: "at filing",
      title: "Taxes due or refund",
      sub: "Owed is the tax on the return. Paid is what was already sent in through withholding and estimated payments. What’s left is due at filing, or comes back as a refund.",
      body: (
        <Reveal>
          <Panel>
            <div className="space-y-2">
              <FilingRow label="Federal" line={c.filing.federal} />
              <FilingRow label={stateLabel} line={c.filing.state} />
              {c.filing.entity ? <FilingRow label={c.entityKind === "partnership" ? "LLC / partnership" : "S-corp (PTET)"} line={c.filing.entity} /> : null}
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 border-t-2 border-white/15 pt-4">
              <span className="font-display text-[15px] font-semibold text-mist">Total</span>
              <Due value={c.filing.total} large />
            </div>
          </Panel>
        </Reveal>
      ),
    },
    ...(recap.strategies.length
      ? [
          {
            label: "improvements",
            title: "Tax strategy going forward",
            body: (
              <Reveal>
                <Panel>
                  <ol className="grid gap-x-10 gap-y-4 md:grid-cols-2">
                    {recap.strategies.map((s, i) => (
                      <li key={i} className="flex items-baseline gap-4">
                        <span className="flex-none font-mono text-[12px] text-magenta">{String(i + 1).padStart(2, "0")}</span>
                        <span className="text-[15.5px] leading-relaxed text-fog">{s}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>
              </Reveal>
            ),
          },
        ]
      : []),
    ...(recap.nextSteps.length
      ? [
          {
            label: "next steps",
            title: "What to do now",
            body: (
              <div className="grid gap-4 md:grid-cols-2">
                {recap.nextSteps.map((s, i) => (
                  <Reveal key={i} delay={i * 0.08} className={s.options?.length ? "md:col-span-2" : ""}>
                    {s.options?.length ? (
                      <Panel className="!py-5">
                        <span className="font-display text-[17px] font-semibold text-fog">{s.label}</span>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {s.options.map((o) => (
                            <a
                              key={o.href}
                              href={o.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-magenta/50 bg-magenta/[0.06] px-4 py-2 font-display text-[13.5px] font-semibold text-fog no-underline transition-colors hover:border-magenta hover:bg-magenta/[0.12]"
                            >
                              {o.label}
                              <span className="font-mono text-[10px] uppercase tracking-[1px] text-magenta">→</span>
                            </a>
                          ))}
                        </div>
                      </Panel>
                    ) : s.href ? (
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex h-full items-center justify-between gap-4 rounded-[20px] border border-white/10 bg-panel/85 px-6 py-5 no-underline transition-colors hover:border-magenta/60 hover:bg-magenta/[0.06] md:bg-white/[0.045] md:backdrop-blur-xl"
                      >
                        <span className="font-display text-[17px] font-semibold text-fog">{s.label}</span>
                        <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-magenta">Open →</span>
                      </a>
                    ) : (
                      <div className="flex h-full items-center gap-4 rounded-[20px] border border-white/10 bg-panel/85 px-6 py-5 md:bg-white/[0.045] md:backdrop-blur-xl">
                        <span className="h-[6px] w-[6px] flex-none rounded-full bg-magenta" />
                        <span className="font-display text-[17px] font-semibold text-fog">{s.label}</span>
                      </div>
                    )}
                  </Reveal>
                ))}
              </div>
            ),
          },
        ]
      : []),
  ];

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

        <RecapHero
          firstName={firstName}
          taxYear={recap.taxYear}
          savings={totalSavings}
          initiallyOpen={!sealed}
          onOpen={() => setOpen(true)}
        >
          <div className="mx-auto grid max-w-[760px] gap-px overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.06] text-left sm:grid-cols-3">
            <Stat label="Before DeCypher" value={money(c.before.totalTaxes)} tone="neg" />
            <Stat label="After DeCypher" value={money(c.after.totalTaxes)} />
            <div className="bg-night/90 px-5 py-5">
              <div className="font-mono text-[10.5px] uppercase tracking-[1.6px] text-teal">Total tax savings</div>
              <div className="mt-2 font-display text-[34px] font-bold leading-none tracking-[-1px] tabular-nums text-teal">
                <CountUp value={totalSavings} />
              </div>
            </div>
          </div>
        </RecapHero>

        {open ? (
          <>
            {/* ── agenda + the year, a slim strip under the hero ── */}
            <section className="px-5 pb-8 pt-4">
              <Reveal className="mx-auto flex max-w-[1040px] flex-col items-center gap-4">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-faint">Agenda</span>
                  {["Your tax summary", "Q&A, if needed", "Housekeeping items"].map((item, i) => (
                    <span key={item} className="inline-flex items-baseline gap-2.5 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2">
                      <span className="font-mono text-[11px] text-magenta">0{i + 1}</span>
                      <span className="font-display text-[14px] font-semibold text-fog">{item}</span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
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
              </Reveal>
            </section>

            {sections.map((s, i) => (
              <section key={s.label} className="relative px-5 py-20 sm:py-24">
                <SectionHeading eyebrow={`[ 0${i + 1} · ${s.label} ]`} title={s.title} sub={s.sub} />
                <div className="mx-auto mt-12 max-w-[1040px] sm:mt-14">{s.body}</div>
              </section>
            ))}

            {/* ── footer ── */}
            <footer className="px-5 pb-16 pt-6">
              <div className="mx-auto max-w-[1040px] border-t border-white/10 pt-10 text-center">
                <div className="font-display text-[17px] font-semibold text-fog">
                  DeCypher <span className="text-grad">Financials</span>
                </div>
                <p className="mt-3 font-mono text-[11px] leading-relaxed text-dusk">
                  Prepared by DeCypher Financials ·{" "}
                  <a href="https://wedecypher.co" className="text-mist underline decoration-white/20 underline-offset-2 hover:text-fog">
                    wedecypher.co
                  </a>
                </p>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-4 print:hidden">
                  <a
                    href={`/recap/${recap.token}/pdf`}
                    className="rounded-full border border-white/15 px-5 py-2.5 font-display text-[13.5px] font-semibold text-fog no-underline transition-colors hover:border-mist"
                  >
                    Download PDF
                  </a>
                  {sealed ? (
                    // a fresh load is the reset: nothing about the seal is remembered
                    <button
                      type="button"
                      onClick={() => window.location.assign(window.location.pathname)}
                      className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] uppercase tracking-[0.18em] text-dusk transition-colors hover:text-fog"
                    >
                      ↺ Replay the reveal
                    </button>
                  ) : null}
                </div>
              </div>
            </footer>
          </>
        ) : null}
      </div>
    </>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

/** A figure that can be negative: "−$3,000" rather than "$-3,000". */
const signed = (v: number) => (v < 0 ? `−${money(-v)}` : money(v));

/**
 * The frosted panel from the home page's stats: glass on desktop, a
 * near-opaque plate on phones (a backdrop-filter over the always-animating
 * mesh re-blurs every frame — too hot for mobile GPUs, see StatsGrid).
 */
function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`break-inside-avoid rounded-[20px] border border-white/10 bg-panel/85 px-6 py-6 sm:px-8 sm:py-7 md:bg-white/[0.045] md:backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

function PanelTitle({ sub, children }: { sub?: string; children: React.ReactNode }) {
  return (
    <>
      <h3 className="mt-3 font-display text-[24px] font-bold leading-tight tracking-[-0.5px] text-fog">{children}</h3>
      {sub ? <p className="mt-1 text-[13px] text-muted">{sub}</p> : null}
    </>
  );
}

/** A stat with the site's cursor spotlight (useSpotlight), as on the home page's proof grid. */
function StatTile({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "pos" }) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLDivElement>();
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="group relative overflow-hidden rounded-[18px] border border-white/10 bg-panel/85 px-5 py-6 transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-white/20 hover:shadow-[0_26px_80px_-26px_rgba(255,45,120,.55)] md:bg-white/[0.045] md:backdrop-blur-xl"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "radial-gradient(340px circle at var(--mx, 50%) var(--my, 0%), rgba(255,45,120,.16), transparent 68%)" }}
      />
      <div className="relative">
        <div className={`font-display text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums ${tone === "pos" ? "text-teal" : "text-fog"}`}>
          {value}
        </div>
        <div className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">{label}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "neg" }) {
  return (
    <div className="bg-night/90 px-5 py-5">
      <div className="font-mono text-[10.5px] uppercase tracking-[1.6px] text-muted">{label}</div>
      <div className={`mt-2 font-display text-[34px] font-bold leading-none tracking-[-1px] tabular-nums ${tone === "neg" ? "text-danger" : "text-fog"}`}>
        {value}
      </div>
    </div>
  );
}

function Pill({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "pos" | "neg" }) {
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
      <span className={total ? "font-display text-[15px] font-semibold text-mist" : "text-muted"}>{label}</span>
      <span className={`font-mono tabular-nums ${color} ${total ? "text-[19px] font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function Ledger({
  side,
  stateLabel,
  entityKind,
  totalTone,
  totalLabel,
}: {
  side: RecapSide;
  stateLabel: string;
  entityKind: EntityKind;
  totalTone: "neg" | "pos";
  totalLabel: string;
}) {
  const dash = (v: number) => (v === 0 ? "—" : signed(v));
  return (
    <div className="mt-5">
      <Row label="W-2 income" value={dash(side.w2Income)} />
      <Row label={entityKind ? "Business net income (K-1)" : "Business net income"} value={money(side.businessNetIncome)} tone="brand" />
      <Row label="Other income (loss)" value={dash(side.otherIncome)} />
      <Row label="Gross income" value={money(side.grossIncome)} total />
      <div className="mt-4">
        <Row label="Federal taxes" value={money(side.federalTaxes)} />
        <Row label={`${stateLabel} taxes`} value={dash(side.stateTaxes)} />
        {entityKind === "scorp" ? <Row label={`${stateLabel} S-corp tax & PTET`} value={dash(side.entityTaxes)} /> : null}
        {entityKind === "partnership" ? <Row label={`${stateLabel} LLC tax & fee`} value={dash(side.entityTaxes)} /> : null}
        <Row label="Penalties" value={dash(side.penalties)} />
        <Row label={totalLabel} value={money(side.totalTaxes)} total tone={totalTone} />
      </div>
    </div>
  );
}

function FilingRow({ label, line }: { label: string; line: { owed: number; paid: number; due: number } }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[14px] border border-white/[0.08] px-4 py-3 sm:grid-cols-[130px_1fr_auto]">
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
      <span className="ml-1.5 font-body text-[11px] font-medium uppercase tracking-[1px] opacity-80">{refund ? "refund" : "due"}</span>
    </span>
  );
}

/** Rolls up from zero the first time it scrolls into view — the reveal the Canva version couldn't do. */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // reduced motion: still waits for the scroll, but lands without the beat
    const delay = prefersReducedMotion() ? 0 : 250;
    let timer = 0;
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        timer = window.setTimeout(() => setShown(value), delay);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [value]);
  return (
    <span ref={ref}>
      <MoneyFlow value={shown} />
    </span>
  );
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
