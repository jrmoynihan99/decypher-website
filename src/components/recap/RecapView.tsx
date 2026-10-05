"use client";

import { useEffect, useRef, useState } from "react";
import CipherRain from "@/components/effects/CipherRain";
import NeuralWeb from "@/components/effects/NeuralWeb";
import { MoneyFlow } from "@/components/portal/widgets/ui";
import RecapHero from "@/components/recap/RecapHero";
import Reveal from "@/components/reveal/Reveal";
import SectionHeading from "@/components/ui/SectionHeading";
import { prefersReducedMotion } from "@/lib/decrypt";
import ShareVideo from "@/components/recap/ShareVideo";
import { centsPerDollar } from "@/lib/decyphered/buildRecap";
import { computeRecap, type EntityKind, type FilingLine, type RecapSide } from "@/lib/tax-recap/compute";
import type { RecapDoc, VideoVariant } from "@/lib/tax-recap/schema";
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
 * The order is a sandwich: what the year would have cost before DeCypher,
 * the savings, then what it cost after. The before and the after are the
 * same full-screen layout, red then teal, with the same bar on the same
 * scale, so the drop reads without arithmetic. Then where the savings came
 * from, what's due at filing (owed, paid, the result: a smaller version of
 * the same beat), strategy and next steps. Every figure is derived by
 * computeRecap from the reviewed numbers; nothing is typed in here. The
 * handout is the PDF route, not the browser's print.
 */

type Section = { id?: string; label: string; title: string; sub?: string; stage?: boolean; body: React.ReactNode };

/** The DeCyphered video, when the recap has one matching its numbers (page.tsx decides). */
export type RecapShare = { variants: VideoVariant[]; qrSvg: string };

export default function RecapView({
  recap,
  sealed = true,
  share = null,
}: {
  recap: RecapDoc;
  sealed?: boolean;
  share?: RecapShare | null;
}) {
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
  // The before doesn't claim the dependents (engine v8 on): they're the
  // strategy split's first line. A recap saved earlier claims them on both
  // sides, so they're shown beside the total instead, never added to it.
  const kids = recap.analysis?.kids ?? null;
  const kidsOut = !!kids?.inBefore;
  const kidsBeside = kids && !kids.inBefore && kids.after > 0 ? kids : null;

  const owed = c.filing.federal.owed + c.filing.state.owed + (c.filing.entity?.owed ?? 0);
  const paid = c.filing.federal.paid + c.filing.state.paid + (c.filing.entity?.paid ?? 0);
  const refund = c.filing.total < 0;

  const sections: Section[] = [
    {
      label: "before decypher",
      title: `What ${recap.taxYear} would have cost.`,
      sub: `Your income with nothing taken off it: no write-offs, no strategies${kidsOut ? ", no dependents claimed" : ""}.`,
      stage: true,
      body: <Stage side={c.before} scale={c.before.grossIncome} tone="neg" stateLabel={stateLabel} entityKind={c.entityKind} />,
    },
    {
      label: "the difference",
      title: "Total tax savings",
      sub:
        scorpSavings > 0
          ? `What ${recap.taxYear} would have cost on income alone, less what it cost with your books done and every strategy applied, plus the self-employment tax your S corporation kept off the table.`
          : `What ${recap.taxYear} would have cost on income alone, less what it cost with your books done and every strategy applied.`,
      body: (
        <>
          <Reveal className="text-center">
            <div className="font-display text-[clamp(64px,11vw,136px)] font-bold leading-none tracking-[-0.045em] text-teal tabular-nums">
              <CountUp value={totalSavings} />
            </div>
          </Reveal>
          {scorpSavings > 0 ? (
            <Reveal
              delay={0.1}
              className="mx-auto mt-8 flex max-w-[720px] flex-wrap items-baseline justify-center gap-x-3 gap-y-1.5 text-center text-[14.5px] text-mist"
            >
              <span>
                <span className="font-mono tabular-nums text-fog">{money(c.savings)}</span> between your two returns
              </span>
              <span className="text-faint">+</span>
              <span>
                <span className="font-mono tabular-nums text-fog">{money(scorpSavings)}</span> of self-employment tax your S
                corporation avoided
              </span>
            </Reveal>
          ) : null}
        </>
      ),
    },
    {
      label: "after decypher",
      title: "What it cost with DeCypher.",
      sub: `Your books done and every strategy applied: the ${c.scorp ? "returns" : "return"} you’re filing.`,
      stage: true,
      body: (
        <Stage side={c.after} scale={c.before.grossIncome} tone="pos" was={c.before} stateLabel={stateLabel} entityKind={c.entityKind} />
      ),
    },
    ...(attribution.length
      ? [
          {
            label: "where it came from",
            title: "Savings by strategy",
            sub: "Each one switched on in this order and the whole return re-run, so the lines add up to your savings. A deduction is worth more at a higher tax bracket, which is why the order matters.",
            body: (
              <Reveal>
                <Panel>
                  {attribution.map((a, i) => (
                    <StrategyLine key={i} label={a.label} note={a.note} value={a.savings} />
                  ))}
                  {recap.analysis?.scorpSavings ? (
                    <>
                      <div className="mt-2 flex items-baseline justify-between gap-4 border-t-2 border-white/15 pt-3.5">
                        <span className="font-display text-[15px] font-semibold text-mist">Between your two returns</span>
                        <span className="font-mono text-[16px] font-semibold tabular-nums text-fog">{money(c.savings)}</span>
                      </div>
                      <StrategyLine
                        label="S corporation: self-employment tax avoided"
                        note={recap.analysis.scorpSavings.note}
                        value={recap.analysis.scorpSavings.amount}
                      />
                    </>
                  ) : null}
                  <div className="mt-2 flex items-baseline justify-between gap-4 border-t-2 border-white/15 pt-3.5">
                    <span className="font-display text-[15px] font-semibold text-mist">Total tax savings</span>
                    <span className="font-mono text-[19px] font-semibold tabular-nums text-teal">{money(totalSavings)}</span>
                  </div>
                  {kidsBeside ? (
                    <p className="mb-0 mt-5 border-t border-white/[0.06] pt-4 text-[13px] leading-relaxed text-dusk">
                      Not in your total: your {kidsBeside.dependents === 1 ? "dependent" : "dependents"} took{" "}
                      <span className="font-mono tabular-nums text-mist">{money(kidsBeside.after)}</span>
                      {" "}off this return.
                      They&rsquo;re claimed on both versions of {recap.taxYear}, so they aren&rsquo;t part of your savings.
                      {kidsBeside.note ? ` ${kidsBeside.note}.` : ""}
                    </p>
                  ) : null}
                </Panel>
              </Reveal>
            ),
          },
        ]
      : []),
    {
      label: "at filing",
      title: refund ? "Your refund" : "Taxes due at filing",
      sub: "Owed is the tax on the return for the whole year. Paid is what already went in through withholding and estimated payments. What’s left is due when you file, or comes back to you.",
      body: (
        <>
          <Reveal className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-4">
            <Figure label={`Owed for ${recap.taxYear}`} value={owed} />
            <Op>−</Op>
            <Figure label="Already paid" value={paid} tone="pos" delay={600} />
            <Op>=</Op>
            <Figure
              label={refund ? "Refund" : "Due at filing"}
              value={Math.abs(c.filing.total)}
              tone={refund ? "pos" : "neg"}
              delay={1200}
              strong
            />
          </Reveal>
          <Reveal delay={0.1} className="mt-5">
            <Panel className="!py-5">
              <div className="space-y-2">
                <FilingRow label="Federal" line={c.filing.federal} />
                <FilingRow label={stateLabel} line={c.filing.state} />
                {c.filing.entity ? (
                  <FilingRow label={c.entityKind === "partnership" ? "LLC / partnership" : "S-corp (PTET)"} line={c.filing.entity} />
                ) : null}
              </div>
            </Panel>
          </Reveal>
        </>
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
    ...(share
      ? [
          {
            id: "share",
            label: "your decyphered",
            title: "Post your DeCyphered.",
            sub: `Your ${recap.taxYear} as a video for your Instagram story. Tag @we.decypher when you post it and we’ll send you a $50 Visa gift card.`,
            body: <ShareVideo token={recap.token} taxYear={recap.taxYear} variants={share.variants} qrSvg={share.qrSvg} />,
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
          {/* only the before up here: the after is the payoff further down */}
          <div className="mx-auto w-fit min-w-[260px] rounded-[20px] border border-white/10 bg-night/90 px-9 py-5 text-center">
            <div className="font-mono text-[10.5px] uppercase tracking-[1.6px] text-muted">Before DeCypher</div>
            <div className="mt-2 font-display text-[40px] font-bold leading-none tracking-[-1px] tabular-nums text-danger">
              {money(c.before.totalTaxes)}
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
              <section
                key={s.label}
                id={s.id}
                className={`relative px-5 ${s.stage ? "flex min-h-svh flex-col justify-center py-24 sm:py-28" : "py-20 sm:py-24"}`}
              >
                <SectionHeading eyebrow={`[ 0${i + 1} · ${s.label} ]`} title={s.title} sub={s.sub} />
                <div className={`mx-auto mt-12 w-full sm:mt-14 ${s.stage ? "max-w-[1120px]" : "max-w-[1040px]"}`}>{s.body}</div>
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

/** True once the element has scrolled into view; stays true. */
function useSeen<T extends Element>(threshold = 0.4) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        setSeen(true);
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

/**
 * One side of the sandwich, full screen: the year's total as the hero
 * figure, the cents-per-dollar bar, and the ledger as open rows, income
 * on the left and taxes on the right. The before and the after are this
 * same layout so the eye compares them without trying.
 */
function Stage({
  side,
  scale,
  tone,
  was,
  stateLabel,
  entityKind,
}: {
  side: RecapSide;
  /** The bar's one scale on both sides: the before return's total income. */
  scale: number;
  tone: "neg" | "pos";
  /** The after only: the before side, for the "was" line and the bar's ghost. */
  was?: RecapSide;
  stateLabel: string;
  entityKind: EntityKind;
}) {
  const dash = (v: number) => (v === 0 ? "—" : signed(v));
  return (
    <>
      <Reveal className="text-center">
        <div
          className={`font-display text-[clamp(60px,11vw,136px)] font-bold leading-none tracking-[-0.045em] tabular-nums ${
            tone === "neg" ? "text-danger" : "text-teal"
          }`}
        >
          <CountUp value={side.totalTaxes} />
        </div>
        <div className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          Total taxes owed
          {was !== undefined ? (
            <>
              <span className="mx-2 text-faint">·</span>
              was <span className="text-mist line-through decoration-danger/80">{money(was.totalTaxes)}</span>
            </>
          ) : null}
        </div>
      </Reveal>
      {scale > 0 && side.totalTaxes >= 0 ? (
        <Reveal delay={0.1}>
          <TaxShare taxes={side.totalTaxes} scale={scale} tone={tone} was={was?.totalTaxes} />
        </Reveal>
      ) : null}
      <Reveal delay={0.15} className="mx-auto mt-14 grid max-w-[880px] gap-x-16 gap-y-10 md:grid-cols-2">
        <div>
          <ColumnHead>Income on the return</ColumnHead>
          <div>
            <Row label="W-2 income" value={dash(side.w2Income)} />
            <Row label={entityKind ? "Business net income (K-1)" : "Business net income"} value={money(side.businessNetIncome)} tone="brand" />
            <Row label="Other income (loss)" value={dash(side.otherIncome)} />
            <Row label="Gross income" value={money(side.grossIncome)} total />
          </div>
        </div>
        <div>
          <ColumnHead>Taxes</ColumnHead>
          <div>
            <Row label="Federal taxes" value={money(side.federalTaxes)} />
            <Row label={`${stateLabel} taxes`} value={dash(side.stateTaxes)} />
            {entityKind === "scorp" ? <Row label={`${stateLabel} S-corp tax & PTET`} value={dash(side.entityTaxes)} /> : null}
            {entityKind === "partnership" ? <Row label={`${stateLabel} LLC tax & fee`} value={dash(side.entityTaxes)} /> : null}
            <Row label="Penalties" value={dash(side.penalties)} />
            <Row label="Total taxes owed" value={money(side.totalTaxes)} total tone={tone} />
          </div>
        </div>
      </Reveal>
    </>
  );
}

/**
 * Cents of every dollar brought in that went to tax, as a meter on one
 * fixed scale: the BEFORE return's total income, on both sides, so the
 * after's bar is shorter by exactly the savings. The same figure, rounded
 * the same way, as the DeCyphered video prints (lib/decyphered
 * centsPerDollar). The before's fill grows in; the after's starts at the
 * before's width and falls back to its own, leaving the before hatched
 * behind it.
 */
function TaxShare({ taxes, scale, tone, was }: { taxes: number; scale: number; tone: "neg" | "pos"; was?: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const exact = (v: number) => Math.max(0, Math.min(100, (v / scale) * 100));
  const cents = centsPerDollar(taxes, scale) ?? 0;
  const before = was !== undefined ? centsPerDollar(was, scale) : null;
  const from = was !== undefined ? exact(was) : 0;
  return (
    <div ref={ref} className="mx-auto mt-14 max-w-[880px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="m-0 text-[15.5px] text-mist">
          <span className="font-display text-[24px] font-bold text-fog">{cents}¢</span> of every dollar you brought in
          {before !== null ? <span className="text-muted">{`, down from ${before}¢`}</span> : null}
        </p>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{money(scale)} brought in</span>
      </div>
      <div
        role="img"
        aria-label={`${cents} cents of every dollar of income went to taxes${before !== null ? `, down from ${before} cents` : ""}`}
        className={`relative mt-3 h-3 overflow-hidden rounded-full ${tone === "neg" ? "bg-danger/15" : "bg-teal/15"}`}
      >
        {before !== null ? (
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${from}%`,
              background:
                "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-danger) 45%, transparent) 0 4px, transparent 4px 8px)",
            }}
          />
        ) : null}
        <div
          aria-hidden
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] delay-300 duration-[1400ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none ${
            tone === "neg" ? "bg-danger" : "bg-teal"
          }`}
          style={{ width: `${seen ? exact(taxes) : from}%` }}
        />
      </div>
    </div>
  );
}

function ColumnHead({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-faint">{children}</div>;
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
      className={`flex items-baseline justify-between gap-4 text-[15px] ${
        total ? "mt-2 border-t-2 border-white/15 pt-3" : "border-t border-white/[0.07] py-2.5 first:border-t-0"
      }`}
    >
      <span className={total ? "font-display text-[15px] font-semibold text-mist" : "text-muted"}>{label}</span>
      <span className={`font-mono tabular-nums ${color} ${total ? "text-[19px] font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

/** One line of the savings split: the strategy, what it was, what it saved. */
function StrategyLine({ label, note, value }: { label: string; note: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-white/[0.06] py-3.5 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="text-[15.5px] text-fog">{label}</div>
        {note ? <div className="mt-0.5 text-[12.5px] leading-snug text-dusk">{note}</div> : null}
      </div>
      <span className={`flex-none font-mono text-[15px] tabular-nums ${value >= 0 ? "text-teal" : "text-danger"}`}>
        {value < 0 ? "−" : ""}
        {money(Math.abs(value))}
      </span>
    </div>
  );
}

/** One figure of owed − paid = due, counting up in turn. */
function Figure({
  label,
  value,
  tone = "plain",
  delay = 0,
  strong = false,
}: {
  label: string;
  value: number;
  tone?: "plain" | "pos" | "neg";
  delay?: number;
  strong?: boolean;
}) {
  const color = tone === "pos" ? "text-teal" : tone === "neg" ? "text-danger" : "text-fog";
  return (
    <div
      className={`rounded-[18px] border bg-panel/85 px-6 py-6 text-center md:bg-white/[0.045] md:backdrop-blur-xl ${
        strong ? (tone === "pos" ? "border-teal/40" : "border-danger/40") : "border-white/10"
      }`}
    >
      <div className={`font-display font-bold leading-none tracking-[-0.02em] tabular-nums ${color} ${strong ? "text-[38px]" : "text-[32px]"}`}>
        <CountUp value={value} delay={delay} />
      </div>
      <div className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">{label}</div>
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="text-center font-display text-[26px] font-semibold leading-none text-faint">
      {children}
    </span>
  );
}

function FilingRow({ label, line }: { label: string; line: FilingLine }) {
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

function Due({ value }: { value: number }) {
  const refund = value < 0;
  return (
    <span className={`font-mono text-[15px] font-semibold tabular-nums ${refund ? "text-teal" : "text-danger"}`}>
      {money(Math.abs(value))}
      <span className="ml-1.5 font-body text-[11px] font-medium uppercase tracking-[1px] opacity-80">{refund ? "refund" : "due"}</span>
    </span>
  );
}

/**
 * Rolls up from zero the first time it scrolls into view — the reveal the
 * Canva version couldn't do. `delay` holds it back further, for figures
 * that land one after another.
 */
function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // reduced motion: still waits for the scroll, but lands without the beat
    const wait = prefersReducedMotion() ? 0 : 250 + delay;
    let timer = 0;
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        timer = window.setTimeout(() => setShown(value), wait);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [value, delay]);
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
