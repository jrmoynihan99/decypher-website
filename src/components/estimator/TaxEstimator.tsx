"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";
import {
  ESTIMATOR_CONFIG,
  EntityType,
  FilingStatus,
  STATE_NAMES,
  TaxBreakdown,
  computeStrategies,
  computeTax,
  fmt,
  stateHasTax,
} from "@/lib/tax";
import LeadModal, { Lead } from "./LeadModal";
import {
  Eyebrow,
  FieldError,
  MoneyInput,
  Select,
  btnPrimaryCls,
  fieldLabelCls,
  optNoteCls,
} from "./fields";

/* ===================== analytics ===================== */
interface AnalyticsWindow {
  dataLayer?: Record<string, unknown>[];
  gtag?: (...args: unknown[]) => void;
  analytics?: { track?: (event: string, props: unknown) => void };
}

function track(event: string, props: Record<string, unknown> = {}) {
  try {
    const w = window as unknown as AnalyticsWindow;
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event, ...props });
    if (typeof w.gtag === "function") w.gtag("event", event, props);
    if (w.analytics && typeof w.analytics.track === "function")
      w.analytics.track(event, props);
  } catch {}
}

/* ===================== state / model ===================== */
type SalaryMode = "unsure" | "nopayroll" | null;

interface EstimateInputs {
  status: FilingStatus;
  state: string;
  creator: number;
  expenses: number;
  w2: number;
  other: number;
  paid: number;
  fulltime: boolean;
  entity: EntityType | "unanswered";
  sCorp: boolean;
  sCorpSalary: number | null;
  sCorpSalaryStatus: string;
  sCorpNoPayroll: boolean;
  solePropRisk: boolean;
  needSCorp: boolean;
}

interface EstimateResult extends TaxBreakdown {
  bizTax: number;
  setAside: number;
  effRate: number;
  afterTax: number;
  totalIncome: number;
  savingsLow: number;
  savingsHigh: number;
}

interface Snapshot {
  inputs: EstimateInputs;
  result: EstimateResult;
}

const num = (s: string) => parseFloat(s.replace(/[^0-9.\-]/g, "")) || 0;

const BAR_PARTS = [
  { key: "seTax", label: "Self-employment tax", color: "#FF2D78" },
  { key: "fed", label: "Federal income tax", color: "#8B2BE8" },
  { key: "stateTax", label: "State income tax", color: "#2DD4A7" },
] as const;

function StepDots({ done }: { done: 1 | 2 }) {
  return (
    <div aria-hidden className="mb-3.5 mt-[18px] flex gap-2">
      <div className="bg-grad h-[3px] flex-1 rounded-sm" />
      <div
        className={`h-[3px] flex-1 rounded-sm ${done >= 2 ? "bg-grad" : "bg-panel-2"}`}
      />
    </div>
  );
}

export default function TaxEstimator() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<"input" | "results">("input");

  // form fields
  const [filing, setFiling] = useState<FilingStatus>("single");
  const [stateName, setStateName] = useState("");
  const [rev, setRev] = useState("");
  const [exp, setExp] = useState("");
  const [w2, setW2] = useState("");
  const [other, setOther] = useState("");
  const [paid, setPaid] = useState("");
  const [fulltime, setFulltime] = useState(true);
  const [entity, setEntity] = useState<"" | EntityType>("");
  const [scorpSalary, setScorpSalary] = useState("");
  const [salaryMode, setSalaryMode] = useState<SalaryMode>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // results
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const totalRef = useRef<HTMLDivElement>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [lead, setLead] = useState<Lead | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const started = useRef(false);

  const markStarted = () => {
    if (!started.current) {
      started.current = true;
      track("tax_widget_started");
    }
  };

  const clearErr = (field: string) =>
    setErrors((e) => (e[field] ? { ...e, [field]: "" } : e));

  const scrollToWidget = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const top = window.scrollY + el.getBoundingClientRect().top - 90;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  /* ===================== validation + estimate ===================== */
  const runEstimate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!stateName) errs.state = "Please choose your state.";
    if (!entity) errs.entity = "Please select your entity type.";
    const revN = num(rev);
    if (rev.trim() === "" || revN < 0)
      errs.rev =
        revN < 0 ? "Income can't be negative." : "Enter your annual business income.";
    if (num(exp) < 0) errs.exp = "Expenses can't be negative.";
    if (num(w2) < 0) errs.w2 = "W-2 income can't be negative.";
    if (num(other) < 0) errs.other = "Can't be negative.";
    if (num(paid) < 0) errs.paid = "Can't be negative.";
    setErrors(errs);
    if (Object.keys(errs).length) return false;

    const inputs: EstimateInputs = {
      status: filing,
      state: stateName,
      creator: Math.max(0, num(rev)),
      expenses: Math.max(0, num(exp)),
      w2: Math.max(0, num(w2)),
      other: Math.max(0, num(other)),
      paid: Math.max(0, num(paid)),
      fulltime,
      entity: entity || "unanswered",
      sCorp: entity === "scorp",
      sCorpSalary:
        entity === "scorp" && !salaryMode ? Math.max(0, num(scorpSalary)) : null,
      sCorpSalaryStatus:
        entity === "scorp"
          ? salaryMode ?? (num(scorpSalary) > 0 ? "provided" : "unspecified")
          : "n/a",
      sCorpNoPayroll: entity === "scorp" && salaryMode === "nopayroll",
      solePropRisk: false,
      needSCorp: false,
    };
    const r = computeTax(inputs);

    // business-attributable tax (marginal on the creator income)
    const rNoBiz = computeTax({ ...inputs, creator: 0, expenses: 0 });
    const bizTax = Math.max(0, r.total - rNoBiz.total);
    const setAside = r.netSE > 0 ? Math.min(60, (bizTax / r.netSE) * 100) : 0;

    const totalIncome = r.netSE + inputs.w2 + inputs.other;
    const effRate = totalIncome > 0 ? (r.total / totalIncome) * 100 : 0;
    const afterTax = totalIncome - r.total;

    // Already an S-corp? Don't count S-corp election as "potential" savings.
    const strat = computeStrategies(inputs, r, inputs.sCorp);

    inputs.solePropRisk = inputs.entity === "soleprop" && inputs.creator > 20000;
    inputs.needSCorp =
      r.netSE > 55000 &&
      (inputs.entity === "soleprop" || inputs.entity === "smllc");

    setSnapshot({
      inputs,
      result: {
        ...r,
        bizTax,
        setAside,
        effRate,
        afterTax,
        totalIncome,
        savingsLow: strat.low,
        savingsHigh: strat.high,
      },
    });
    setUnlocked(false);
    setEmailSent(false);
    setScreen("results");
    track("tax_widget_completed", {
      state: inputs.state,
      status: inputs.status,
      estimated_total: Math.round(r.total),
      effective_rate: +effRate.toFixed(1),
    });
    return true;
  };

  // scroll the page back to the widget when switching screens
  useEffect(() => {
    scrollToWidget();
  }, [screen, scrollToWidget]);

  // count the headline total up from $0 (writes to the DOM directly, like
  // the prototype, so per-frame updates don't re-render the whole widget)
  useEffect(() => {
    const el = totalRef.current;
    if (!snapshot || screen !== "results" || !el) return;
    const target = Math.round(snapshot.result.total);
    if (prefersReducedMotion() || target <= 0) {
      el.textContent = fmt(target);
      return;
    }
    el.textContent = fmt(0);
    let raf = 0;
    let start: number | null = null;
    const dur = 1600;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const frame = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      el.textContent = fmt(target * ease(p));
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    const delay = setTimeout(() => {
      raf = requestAnimationFrame(frame);
    }, 600);
    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(raf);
      el.textContent = fmt(target);
    };
  }, [snapshot, screen]);

  /* ===================== lead + email ===================== */
  const sendEstimateEmail = (l: Lead, snap: Snapshot) => {
    if (ESTIMATOR_CONFIG.emailEstimateEndpoint.includes("REPLACE")) return;
    try {
      fetch(ESTIMATOR_CONFIG.emailEstimateEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          email: l.email,
          name: l.name,
          estimate: snap.result,
          inputs: snap.inputs,
        }),
      }).catch(() => {});
    } catch {}
  };

  const onLeadSubmit = (l: Lead) => {
    if (!snapshot) return;
    setLead(l);
    const payload = {
      submittedAt: new Date().toISOString(),
      contact: l,
      inputs: snapshot.inputs,
      estimate: {
        total: Math.round(snapshot.result.total),
        seTax: Math.round(snapshot.result.seTax),
        fed: Math.round(snapshot.result.fed),
        state: Math.round(snapshot.result.stateTax),
        effectiveRate: +snapshot.result.effRate.toFixed(1),
        suggestedSetAside: Math.round(snapshot.result.setAside),
        potentialSavingsLow: Math.round(snapshot.result.savingsLow || 0),
        potentialSavingsHigh: Math.round(snapshot.result.savingsHigh || 0),
      },
    };
    if (!ESTIMATOR_CONFIG.crmEndpoint.includes("REPLACE")) {
      try {
        fetch(ESTIMATOR_CONFIG.crmEndpoint, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        }).catch(() => {});
      } catch {}
    }
    track("tax_widget_lead_captured", {
      is_creator: l.isCreator,
      platform: l.platform,
      revenue_band: l.revenueBand,
    });
    sendEstimateEmail(l, snapshot);
    setModalOpen(false);
    setUnlocked(true);
    scrollToWidget();
  };

  const bookingConfigured = !ESTIMATOR_CONFIG.bookingUrl.includes("REPLACE");
  const trackBook = (e: React.MouseEvent) => {
    if (!bookingConfigured) e.preventDefault();
    track("tax_widget_call_booked", lead ? { email: lead.email } : {});
  };

  /* ===================== render: input screen ===================== */
  const inputScreen = (
    <section
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          runEstimate();
        }
      }}
    >
      <StepDots done={1} />
      <div className="rounded-[18px] border border-white/10 bg-panel p-5">
        <Eyebrow className="mb-2.5">Step 01 · Your numbers</Eyebrow>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={fieldLabelCls} htmlFor="filing">
              Filing status
            </label>
            <Select
              id="filing"
              value={filing}
              onChange={(e) => {
                setFiling(e.target.value as FilingStatus);
                markStarted();
              }}
            >
              <option value="single">Single</option>
              <option value="mfj">Married filing jointly</option>
              <option value="mfs">Married filing separately</option>
              <option value="hoh">Head of household</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className={fieldLabelCls} htmlFor="state">
              State of residence
            </label>
            <Select
              id="state"
              value={stateName}
              invalid={!!errors.state}
              onChange={(e) => {
                setStateName(e.target.value);
                clearErr("state");
                markStarted();
              }}
            >
              <option value="">Select your state</option>
              {STATE_NAMES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <FieldError show={!!errors.state}>{errors.state}</FieldError>
          </div>
          <div className="flex flex-col">
            <label className={fieldLabelCls} htmlFor="rev">
              Creator / business income{" "}
              <span className={optNoteCls}>(annual, pre-tax)</span>
            </label>
            <MoneyInput
              id="rev"
              value={rev}
              placeholder="120,000"
              invalid={!!errors.rev}
              className="mt-auto"
              onChange={(v) => {
                setRev(v);
                clearErr("rev");
                markStarted();
              }}
            />
            <FieldError show={!!errors.rev}>{errors.rev}</FieldError>
          </div>
          <div className="flex flex-col">
            <label className={fieldLabelCls} htmlFor="exp">
              Business expenses <span className={optNoteCls}>(annual)</span>
            </label>
            <MoneyInput
              id="exp"
              value={exp}
              placeholder="30,000"
              invalid={!!errors.exp}
              className="mt-auto"
              onChange={(v) => {
                setExp(v);
                clearErr("exp");
                markStarted();
              }}
            />
            <FieldError show={!!errors.exp}>{errors.exp}</FieldError>
          </div>
          <div className="sm:col-span-2">
            <label className={fieldLabelCls} htmlFor="w2">
              W-2 income <span className={optNoteCls}>(from a job, if any)</span>
            </label>
            <MoneyInput
              id="w2"
              value={w2}
              placeholder="0"
              invalid={!!errors.w2}
              onChange={(v) => {
                setW2(v);
                clearErr("w2");
                markStarted();
              }}
            />
            <FieldError show={!!errors.w2}>{errors.w2}</FieldError>
          </div>
          <div className="flex items-start gap-[11px] sm:col-span-2">
            <input
              type="checkbox"
              id="fulltime"
              checked={fulltime}
              onChange={(e) => {
                setFulltime(e.target.checked);
                markStarted();
              }}
              className="mt-px h-[19px] w-[19px] flex-none accent-magenta"
            />
            <label
              htmlFor="fulltime"
              className="cursor-pointer text-sm leading-[1.45] text-mist"
            >
              I&rsquo;m full-time on my business (no day job)
            </label>
          </div>

          <div className="rounded-[14px] border border-white/15 px-4 pb-[18px] pt-4 sm:col-span-2">
            <label className={fieldLabelCls} htmlFor="entity">
              Business entity
            </label>
            <Select
              id="entity"
              value={entity}
              invalid={!!errors.entity}
              onChange={(e) => {
                const v = e.target.value as EntityType;
                setEntity(v);
                if (v !== "scorp") {
                  setSalaryMode(null);
                  setScorpSalary("");
                }
                clearErr("entity");
                markStarted();
              }}
            >
              <option value="" disabled>
                Select your entity type
              </option>
              <option value="soleprop">Sole proprietor (no LLC)</option>
              <option value="smllc">Single-member LLC</option>
              <option value="scorp">S-corp</option>
              <option value="ccorp">C-corp</option>
            </Select>
            <FieldError show={!!errors.entity}>{errors.entity}</FieldError>
            {entity === "scorp" && (
              <div className="mt-4">
                <label className={fieldLabelCls} htmlFor="scorpSalary">
                  Annual W-2 salary you pay yourself
                </label>
                <MoneyInput
                  id="scorpSalary"
                  value={scorpSalary}
                  placeholder="e.g. 60,000"
                  onChange={(v) => {
                    setScorpSalary(v);
                    if (v) setSalaryMode(null);
                    markStarted();
                  }}
                />
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {(
                    [
                      ["unsure", "I'm not sure"],
                      ["nopayroll", "I don't run payroll"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        if (salaryMode === mode) {
                          setSalaryMode(null);
                        } else {
                          setSalaryMode(mode);
                          setScorpSalary("");
                        }
                        markStarted();
                      }}
                      className={`cursor-pointer rounded-full border px-3.5 py-2 font-body text-[13px] transition-colors duration-150 ${
                        salaryMode === mode
                          ? "bg-grad border-transparent text-white"
                          : "border-white/15 bg-panel text-mist hover:border-mist hover:text-fog"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {salaryMode === "nopayroll" && (
                  <div className="mt-3.5 rounded-[11px] border border-[rgba(255,107,122,0.42)] bg-[rgba(255,107,122,0.10)] px-3.5 py-3 text-[13px] leading-normal text-[#FFB3BC]">
                    ⚠️ <b className="text-danger">Big red flag.</b> Please see
                    our recommendation in your results.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdvOpen((o) => !o)}
          aria-expanded={advOpen}
          className="mt-[22px] flex cursor-pointer items-center gap-[9px] border-none bg-transparent p-0 font-mono text-[11px] font-bold uppercase tracking-[1px] text-mist"
        >
          <span
            className={`transition-transform duration-200 ${advOpen ? "rotate-90" : ""}`}
          >
            ›
          </span>
          Advanced (optional)
        </button>
        {advOpen && (
          <div className="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col">
              <label className={fieldLabelCls} htmlFor="other">
                Other income{" "}
                <span className={optNoteCls}>
                  (interest, dividends, other 1099)
                </span>
              </label>
              <MoneyInput
                id="other"
                value={other}
                placeholder="0"
                invalid={!!errors.other}
                className="mt-auto"
                onChange={(v) => {
                  setOther(v);
                  clearErr("other");
                  markStarted();
                }}
              />
              <FieldError show={!!errors.other}>{errors.other}</FieldError>
            </div>
            <div className="flex flex-col">
              <label className={fieldLabelCls} htmlFor="paid">
                Taxes already paid{" "}
                <span className={optNoteCls}>(withholding + estimates)</span>
              </label>
              <MoneyInput
                id="paid"
                value={paid}
                placeholder="0"
                invalid={!!errors.paid}
                className="mt-auto"
                onChange={(v) => {
                  setPaid(v);
                  clearErr("paid");
                  markStarted();
                }}
              />
              <FieldError show={!!errors.paid}>{errors.paid}</FieldError>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <button className={btnPrimaryCls} onClick={runEstimate}>
            Get my estimate →
          </button>
        </div>
      </div>

      <p className="mt-[26px] border-t border-white/10 pt-[18px] text-[11px] leading-[1.7] text-faint">
        <b className="font-medium text-mist">Rough estimate only.</b> This tool
        provides a rough educational estimate based on limited inputs. It is
        not tax, legal, or financial advice. Your actual liability can differ.
        Talk to a qualified tax professional before making decisions.
      </p>
    </section>
  );

  /* ===================== render: results screen ===================== */
  let resultsScreen: React.ReactNode = null;
  if (snapshot) {
    const { inputs, result: r } = snapshot;
    const effLabel = `${r.effRate.toFixed(1).replace(/\.0$/, "")}%`;
    const showRange = r.savingsHigh - r.savingsLow >= 500;
    const balance = r.total - inputs.paid;
    const expRatio = inputs.creator > 0 ? (inputs.expenses / inputs.creator) * 100 : 0;

    const flags: React.ReactNode[] = [];
    if (inputs.sCorpNoPayroll) {
      flags.push(
        <div
          key="nopayroll"
          className="rounded-[11px] border border-[rgba(255,107,122,0.42)] bg-[rgba(255,107,122,0.10)] px-3.5 py-3 text-left text-[13px] leading-normal text-[#FFB3BC]"
        >
          ⚠️ <b className="text-danger">Big red flag:</b> you&rsquo;re taxed as
          an S-corp but told us you don&rsquo;t run payroll. S-corp owners must
          pay themselves reasonable W-2 wages — no payroll is a leading audit
          trigger, and back payroll taxes plus penalties add up fast. This is
          the first thing to fix.
        </div>,
      );
    }
    if (inputs.solePropRisk) {
      flags.push(
        <div
          key="soleprop"
          className="rounded-[11px] border border-[rgba(255,107,122,0.42)] bg-[rgba(255,107,122,0.10)] px-3.5 py-3 text-left text-[13px] leading-normal text-[#FFB3BC]"
        >
          ⚠️ <b className="text-danger">Risk:</b> you&rsquo;re operating as a
          sole proprietor with no LLC while earning over $20,000. That leaves
          your personal assets exposed with no liability protection, and
          you&rsquo;re likely leaving tax structure on the table. Forming an
          LLC is usually the first move.
        </div>,
      );
    }
    if (inputs.needSCorp) {
      const llcLine =
        inputs.entity === "soleprop"
          ? "You don't have an LLC yet, so that's step one — an S-corp election should never be made without forming the LLC first."
          : "You already have the LLC in place, so the S-corp election could be the next step.";
      flags.push(
        <div
          key="scorp"
          className="rounded-[11px] border border-[rgba(255,45,120,0.4)] bg-[linear-gradient(120deg,rgba(255,45,120,0.12),rgba(45,212,167,0.12))] px-3.5 py-3 text-left text-[13px] leading-normal text-mist"
        >
          💡 <b className="text-fog">Tax strategy — the S-corp:</b> at over
          $55,000 in net profit, you&rsquo;re in the range where an S-corp
          election typically starts to save real money on self-employment tax.
          Timing matters — done prematurely, the costs can outweigh the
          savings. {llcLine} Getting the sequence and timing right is exactly
          what a consultation covers.
        </div>,
      );
    }

    const drivers: React.ReactNode[] = [
      <li key="se">
        <b className="font-semibold text-fog">{fmt(r.seTax)} self-employment tax.</b>{" "}
        This is the 15.3% Social Security + Medicare tax. W-2 employees split
        it with an employer; on your business profit you cover both halves.
      </li>,
      <li key="fed">
        <b className="font-semibold text-fog">
          {Math.round(r.fedMarginal * 100)}% federal bracket.
        </b>{" "}
        Your estimated federal income tax is {fmt(r.fed)} after the standard
        deduction and the 20% qualified business income deduction.
      </li>,
      stateHasTax(inputs.state) ? (
        <li key="state">
          <b className="font-semibold text-fog">
            {fmt(r.stateTax)} to {inputs.state}.
          </b>{" "}
          State income tax on your business profit. Where you live can move
          this number significantly.
        </li>
      ) : (
        <li key="state">
          <b className="font-semibold text-fog">
            {inputs.state} has no state income tax.
          </b>{" "}
          One less layer on your creator income — that&rsquo;s already working
          in your favor.
        </li>
      ),
    ];
    if (inputs.creator > 0 && expRatio < 20) {
      drivers.push(
        <li key="exp">
          <b className="font-semibold text-fog">
            Expenses are only {Math.round(expRatio)}% of revenue.
          </b>{" "}
          A low expense ratio usually means deductions are being left on the
          table — one of the first things worth a closer look.
        </li>,
      );
    }
    drivers.push(
      <li key="aside">
        <b className="font-semibold text-fog">
          Set aside about {Math.round(r.setAside)}% of every business dollar.
        </b>{" "}
        Moving that to a separate account as you get paid is the simplest way
        to avoid an April surprise.
      </li>,
    );
    if (r.savingsHigh > 0) {
      drivers.push(
        <li key="savings">
          <b className="font-semibold text-fog">
            {fmt(r.savingsLow)}–{fmt(r.savingsHigh)} in potential savings.
          </b>{" "}
          We&rsquo;ve run the strategies that could apply to a situation like
          yours. Which ones fit — and how to put them in place — is exactly
          what your consultation covers.
        </li>,
      );
    }

    resultsScreen = (
      <section>
        <Eyebrow>DeCypher · Your estimate</Eyebrow>
        <StepDots done={2} />

        <div className="rounded-[18px] border border-[rgba(255,45,120,0.5)] bg-panel p-5 shadow-[0_0_0_1px_rgba(255,45,120,0.25),0_0_44px_-8px_rgba(255,45,120,0.45)]">
          <div className="py-0.5 text-center">
            <div className="font-mono text-[11px] uppercase tracking-[1.5px] text-mist">
              Estimated total tax
            </div>
            <div
              ref={totalRef}
              className="text-grad my-1 font-display text-[clamp(34px,8.5vw,50px)] font-bold leading-none"
            >
              {fmt(0)}
            </div>
            <p className="mx-auto mt-1.5 max-w-[440px] text-[13.5px] leading-[1.4] text-mist">
              Based on what you entered, you might owe about{" "}
              <b className="font-semibold text-fog">{fmt(r.total)}</b> in
              federal + state taxes — roughly{" "}
              <b className="font-semibold text-fog">{effLabel}</b> of your
              income.
            </p>
          </div>

          {r.savingsHigh > 0 && (
            <div className="mx-auto mt-3.5 max-w-[440px] rounded-2xl border border-[rgba(255,45,120,0.4)] bg-[linear-gradient(120deg,rgba(255,45,120,0.14),rgba(45,212,167,0.12))] px-[18px] py-3.5 text-center">
              <Eyebrow center>Potential tax savings</Eyebrow>
              <div className="text-grad my-1.5 flex items-center justify-center gap-1 font-display text-[clamp(24px,6vw,36px)] font-bold leading-none">
                {showRange && (
                  <>
                    <span>{fmt(r.savingsLow)}</span>
                    <span className="font-normal text-faint [-webkit-text-fill-color:var(--color-faint)]">
                      –
                    </span>
                  </>
                )}
                <span>{fmt(r.savingsHigh)}</span>
              </div>
              <p className="mx-auto m-0 max-w-[340px] text-[12.5px] text-mist">
                We&rsquo;ve identified potential tax savings for you.
              </p>
            </div>
          )}

          {!unlocked ? (
            <div className="mt-4 flex flex-col gap-3">
              <button className={btnPrimaryCls} onClick={() => setModalOpen(true)}>
                Show me the recommendations &amp; tax strategies
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <a
                className={btnPrimaryCls}
                href={ESTIMATOR_CONFIG.bookingUrl}
                target="_blank"
                rel="noopener"
                onClick={trackBook}
              >
                Book your complimentary 1:1 tax strategy call
              </a>
            </div>
          )}

          {/* Recommendations (flags + drivers) — gated behind the lead form */}
          {unlocked && (
            <div className="mt-6 border-t border-white/10 pt-[22px]">
              <h3 className="m-0 mb-1 font-display text-[17px] font-semibold text-fog">
                Our recommendations
              </h3>
              <p className="m-0 mb-4 text-[13.5px] text-mist">
                What we found, and what we&rsquo;d do about it.
              </p>
              {flags.length > 0 && (
                <div className="mb-4 flex flex-col gap-2.5">{flags}</div>
              )}
              <ul className="m-0 list-none p-0 [&>li]:relative [&>li]:border-b [&>li]:border-white/10 [&>li]:py-[9px] [&>li]:pl-[22px] [&>li]:text-[14.5px] [&>li]:text-mist [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-4 [&>li]:before:h-2 [&>li]:before:w-2 [&>li]:before:rounded-sm [&>li]:before:bg-magenta [&>li]:before:content-[''] [&>li:last-child]:border-b-0">
                {drivers}
              </ul>
              {lead && (
                <p className="mb-0 mt-4 text-[13.5px] text-teal">
                  📩 We&rsquo;ve emailed a copy of this estimate and our
                  recommendations to {lead.email}.
                </p>
              )}
              <div className="mt-4 flex flex-col gap-3">
                <a
                  className={btnPrimaryCls}
                  href={ESTIMATOR_CONFIG.bookingUrl}
                  target="_blank"
                  rel="noopener"
                  onClick={trackBook}
                >
                  Book your complimentary 1:1 tax strategy call
                </a>
                <button
                  className="cursor-pointer border-none bg-transparent p-1.5 font-body text-sm text-mist underline underline-offset-[3px] hover:text-fog disabled:cursor-default"
                  disabled={emailSent}
                  onClick={() => {
                    if (lead && snapshot) sendEstimateEmail(lead, snapshot);
                    setEmailSent(true);
                  }}
                >
                  {emailSent ? "Sent ✓" : "Resend to my email"}
                </button>
              </div>
            </div>
          )}

          {/* Detailed breakdown below so the tax bill + CTA stay together */}
          <div className="mt-5 border-t border-white/10" />
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div className="rounded-[13px] bg-panel-2 p-3">
              <div className="mb-[5px] text-[11px] leading-tight text-mist">
                After-tax income
              </div>
              <div className="font-display text-[19px] font-semibold text-fog">
                {fmt(r.afterTax)}
              </div>
            </div>
            <div className="rounded-[13px] bg-panel-2 p-3">
              <div className="mb-[5px] text-[11px] leading-tight text-mist">
                Effective rate
              </div>
              <div className="font-display text-[19px] font-semibold text-fog">
                {effLabel}
              </div>
            </div>
            <div className="rounded-[13px] border border-[rgba(255,45,120,0.4)] bg-[linear-gradient(120deg,rgba(255,45,120,0.18),rgba(124,92,246,0.20))] p-3">
              <div className="mb-[5px] text-[11px] leading-tight text-mist">
                Set aside per $1 earned
              </div>
              <div className="text-grad font-display text-[19px] font-semibold">
                {Math.round(r.setAside)}%
              </div>
            </div>
          </div>

          <div className="mb-0.5 mt-4 flex h-3.5 overflow-hidden rounded-lg bg-panel-2">
            {r.total > 0 &&
              BAR_PARTS.map((p) => (
                <div
                  key={p.key}
                  style={{
                    width: `${(r[p.key] / r.total) * 100}%`,
                    background: p.color,
                  }}
                />
              ))}
          </div>
          <div>
            {BAR_PARTS.map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between border-b border-white/10 py-2 text-sm last:border-b-0"
              >
                <span className="flex items-center text-mist">
                  <span
                    className="mr-2.5 inline-block h-2.5 w-2.5 rounded-[3px]"
                    style={{ background: p.color }}
                  />
                  {p.label}
                </span>
                <span className="font-display font-semibold text-fog">
                  {fmt(r[p.key])}
                </span>
              </div>
            ))}
          </div>

          {inputs.paid > 0 && (
            <div className="mt-3.5 text-[13.5px] text-mist">
              {balance > 0 ? (
                <>
                  You&rsquo;ve paid{" "}
                  <b className="font-semibold text-fog">{fmt(inputs.paid)}</b>{" "}
                  so far, leaving an estimated{" "}
                  <b className="font-semibold text-magenta">{fmt(balance)}</b>{" "}
                  still owed.
                </>
              ) : (
                <>
                  You&rsquo;ve already paid{" "}
                  <b className="font-semibold text-fog">{fmt(inputs.paid)}</b>{" "}
                  — roughly on track, with about{" "}
                  <b className="font-semibold text-teal">
                    {fmt(Math.abs(balance))}
                  </b>{" "}
                  of cushion.
                </>
              )}
            </div>
          )}
        </div>

        <p className="mt-[26px] border-t border-white/10 pt-[18px] text-[11px] leading-[1.7] text-faint">
          <b className="font-medium text-mist">
            This tool provides a rough educational estimate based on limited
            inputs. It is not tax, legal, or financial advice. Your actual
            liability can differ. Talk to a qualified tax professional before
            making decisions.
          </b>
          <br />
          <br />
          Federal figures use 2026 amounts (standard deduction $16,100 single /
          $32,200 joint / $24,150 head of household; Social Security wage base
          $184,500). State income tax is computed on business profit less the
          deductible half of self-employment tax using simplified per-state
          rates. The estimate excludes credits, the additional Medicare tax,
          capital gains, local/county taxes, and S-corporation salary planning.
          Quarterly-equivalent set-aside is a planning figure, not a
          safe-harbor calculation. The potential-savings range is an
          illustrative estimate of what common, generally-available planning
          approaches — such as capturing additional business deductions and
          home-office write-offs, retirement and HSA contributions, and entity
          elections — might save someone in a similar situation; it is not a
          promise of results, and eligibility, limits, and outcomes depend on
          facts we haven&rsquo;t collected here.
        </p>

        <div className="mt-4 max-w-[220px]">
          <button
            className="cursor-pointer border-none bg-transparent p-1.5 font-body text-sm text-mist underline underline-offset-[3px] hover:text-fog"
            onClick={() => setScreen("input")}
          >
            ← Start over
          </button>
        </div>

        <footer className="mt-7 flex items-center gap-2.5 text-xs text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-magenta" /> Prepared by
          DeCypher Financials · creator economy tax &amp; accounting
        </footer>
      </section>
    );
  }

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-[640px]">
      {screen === "input" ? inputScreen : resultsScreen}
      <LeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={onLeadSubmit}
      />
    </div>
  );
}
