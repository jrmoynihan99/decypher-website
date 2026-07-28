"use client";

/**
 * Shelter Engine — how much can you legally shelter this year?
 *
 * Client-facing: this is screen-shared on the call, so every string speaks to
 * the creator. Five vehicles (Solo 401(k), SEP-IRA, Traditional IRA, Roth IRA,
 * HSA), each with its own contribution room and its own answer to "what does
 * that save?" The marginal rate is derived from the brackets rather than asked
 * for, so nobody can accidentally model a 37% saving on a 22% earner.
 *
 * Two mutual exclusions are enforced in the UI, because both are easy to get
 * wrong and expensive to get wrong: Solo 401(k) and SEP share the
 * self-employed plan slot, and Traditional and Roth share one annual IRA limit.
 */

import { useMemo, useState } from "react";
import { money } from "@/lib/widget-format";
import {
  LIMITS,
  ROTH_PHASEOUT,
  SE,
  STD_DED,
  SS_WAGE_BASE,
  deferralCatchup,
  fedMarginalRate,
  rothAllowed,
  type FilingStatus,
} from "@/lib/widget-tax";
import {
  CogIcon,
  Disclaimer,
  Drawer,
  Field,
  Mono,
  Note,
  NumInput,
  Panel,
  SelectInput,
  Segmented,
  StrategyCard,
} from "@/components/portal/widgets/ui";

type PlanKey = "solo" | "sep" | "ira" | "roth" | "hsa";
type HsaCoverage = "none" | "self" | "family";

/** The editable caps drawer — seeded from lib/widget-tax, overridable per year. */
const DEFAULT_CAPS = {
  deferral: String(LIMITS.deferral),
  catchup: String(LIMITS.deferralCatchup50),
  superCatchup: String(LIMITS.deferralCatchup60),
  dcLimit: String(LIMITS.dcLimit),
  compCap: String(LIMITS.compCap),
  ssBase: String(SS_WAGE_BASE),
  hsaSelf: String(LIMITS.hsaSelf),
  hsaFamily: String(LIMITS.hsaFamily),
  hsaCatchup: String(LIMITS.hsaCatchup55),
  iraLimit: String(LIMITS.iraLimit),
  iraCatchup: String(LIMITS.iraCatchup50),
  stdSingle: String(STD_DED.single),
  stdMfj: String(STD_DED.mfj),
  stdMfs: String(STD_DED.mfs),
  stdHoh: String(STD_DED.hoh),
};

const n = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

export default function ShelterEngine() {
  const [profit, setProfit] = useState("180000");
  const [status, setStatus] = useState<FilingStatus>("mfj");
  const [age, setAge] = useState("38");
  const [other, setOther] = useState("0");
  const [isScorp, setIsScorp] = useState(true);
  const [salary, setSalary] = useState("80000");
  const [hsaCov, setHsaCov] = useState<HsaCoverage>("family");
  const [covered, setCovered] = useState(true);
  const [caps, setCaps] = useState(DEFAULT_CAPS);
  const [capsOpen, setCapsOpen] = useState(false);
  const [included, setIncluded] = useState<Record<PlanKey, boolean>>({
    solo: true,
    sep: false,
    ira: true,
    roth: true,
    hsa: true,
  });

  const setCap = (k: keyof typeof DEFAULT_CAPS) => (v: string) =>
    setCaps((p) => ({ ...p, [k]: v }));

  const m = useMemo(() => {
    const netProfit = n(profit);
    const otherInc = n(other);
    const ageN = Number(age) || 0;
    const wage = Math.min(n(salary), netProfit);

    const dcLimit = n(caps.dcLimit);
    const compCap = n(caps.compCap);
    const ssBase = n(caps.ssBase);
    const stdDed = {
      single: n(caps.stdSingle),
      mfj: n(caps.stdMfj),
      mfs: n(caps.stdMfs),
      hoh: n(caps.stdHoh),
    }[status];

    /* Earnings basis for plan contributions, plus the payroll-tax half that
       reduces income before the brackets are read. An S-corp contributes off
       W-2 wages; a sole prop off net SE earnings (profit less half SE tax). */
    let basis: number;
    let employerRate: number;
    let basisLabel: string;
    let incomeReduction: number;

    if (isScorp) {
      basis = Math.min(wage, compCap);
      employerRate = LIMITS.sepPctScorp;
      basisLabel = "W-2 wages";
      const ssW = Math.min(wage, ssBase) * SE.ss;
      const medW = wage * SE.medicare;
      incomeReduction = (ssW + medW) / 2; // employer half of FICA
    } else {
      const seBase = netProfit * SE.netAdj;
      const halfSE =
        (Math.min(seBase, ssBase) * SE.ss + seBase * SE.medicare) / 2;
      basis = Math.min(Math.max(0, netProfit - halfSE), compCap);
      employerRate = LIMITS.sepPctSoleProp;
      basisLabel = "net SE earnings";
      incomeReduction = halfSE;
    }

    // The rate applies *before* the retirement deduction — that's what "what
    // would this contribution save?" means. Federal only, by design.
    const taxableIncome = Math.max(
      0,
      netProfit - incomeReduction + otherInc - stdDed,
    );
    const rate = fedMarginalRate(taxableIncome, status);

    /* Solo 401(k). Per IRC 414(v) the catch-up sits ON TOP of the 415(c)
       total-plan limit rather than inside it, and 60–63 get the larger
       "super" catch-up — capping the sum at the plan limit would understate a
       high earner's room by the whole catch-up. */
    const cuAmt = deferralCatchup(ageN, n(caps.catchup), n(caps.superCatchup));
    const empDeferral = Math.min(n(caps.deferral), basis);
    const employer = basis * employerRate;
    const baseAddition = Math.min(empDeferral + employer, dcLimit);
    const cuUsable = Math.min(cuAmt, Math.max(0, basis - baseAddition));
    const solo = baseAddition + cuUsable;

    // SEP is employer-only: no salary deferral, and no catch-up at all.
    const sep = Math.min(basis * employerRate, dcLimit);

    let hsa = 0;
    let hsaLabel = "Not on an HDHP — no HSA contribution.";
    if (hsaCov !== "none") {
      hsa =
        (hsaCov === "family" ? n(caps.hsaFamily) : n(caps.hsaSelf)) +
        (ageN >= 55 ? n(caps.hsaCatchup) : 0);
      hsaLabel = `${hsaCov === "family" ? "Family" : "Self-only"} HDHP${
        ageN >= 55 ? ` + ${money(n(caps.hsaCatchup))} age-55 catch-up` : ""
      }. Deductible, grows tax-free, tax-free for medical.`;
    }

    const earnedForIra = isScorp ? wage : basis;
    const iraBase = n(caps.iraLimit) + (ageN >= 50 ? n(caps.iraCatchup) : 0);
    const ira = Math.min(iraBase, Math.max(0, earnedForIra));

    // Roth: same annual limit, after-tax now, and subject to a MAGI phase-out.
    const magi = Math.max(0, netProfit - incomeReduction + otherInc);
    const rothRange = ROTH_PHASEOUT[status];
    const rothCap = rothAllowed(iraBase, magi, rothRange);
    const roth = Math.min(rothCap, Math.max(0, earnedForIra));

    /* The stack. Solo and SEP share the self-employed plan slot, Traditional
       and Roth share one annual IRA limit — so each pair counts once. */
    const planAmt = Math.max(
      included.solo ? solo : 0,
      included.sep ? sep : 0,
    );
    const planName =
      planAmt === 0 ? null
      : (included.solo ? solo : 0) >= (included.sep ? sep : 0) ? "Solo 401(k)"
      : "SEP-IRA";

    const tradInc = included.ira ? ira : 0;
    const rothInc = included.roth ? roth : 0;
    const iraInc = Math.max(tradInc, rothInc);
    const iraName =
      iraInc === 0 ? null
      : tradInc > 0 && rothInc > 0 ? "Traditional/Roth IRA"
      : tradInc > 0 ? "Traditional IRA"
      : "Roth IRA";
    const hsaInc = included.hsa ? hsa : 0;

    const stackContrib = planAmt + hsaInc + iraInc;
    // Roth buys no current-year deduction, so it's excluded from tax saved.
    const stackSaved = (planAmt + hsaInc + tradInc) * rate;

    return {
      rate,
      taxableIncome,
      basis,
      basisLabel,
      employerRate,
      empDeferral,
      baseAddition,
      cuUsable,
      solo,
      sep,
      hsa,
      hsaLabel,
      ira,
      iraBase,
      roth,
      rothCap,
      rothRange,
      magi,
      planAmt,
      planName,
      iraInc,
      iraName,
      hsaInc,
      tradInc,
      rothInc,
      stackContrib,
      stackSaved,
    };
  }, [profit, status, age, other, isScorp, salary, hsaCov, caps, included]);

  /* Toggling Solo on turns SEP off and vice versa — they can't both be funded
     on the same earnings, and modelling both would double-count the stack. */
  const toggle = (k: PlanKey) => (on: boolean) => {
    setIncluded((p) => {
      const next = { ...p, [k]: on };
      if (on && k === "solo") next.sep = false;
      if (on && k === "sep") next.solo = false;
      return next;
    });
  };

  const savedFor = (v: number) => v * m.rate;
  const heroNote = (v: number) =>
    v > 0 ? `≈ ${money(savedFor(v))} tax saved` : "— not available";
  const roiLine = (amt: number) =>
    amt > 0 ? (
      <>
        Immediate tax return ≈ <b className="font-display font-bold text-teal">
          {(m.rate * 100).toFixed(1)}%
        </b>{" "}
        — {money(savedFor(amt))} saved on {money(amt)} contributed
      </>
    ) : null;

  return (
    <div>
      {/* ── inputs ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Your numbers">
          <Field label="Annual business net profit">
            <NumInput value={profit} onChange={setProfit} prefix="$" align="left" />
          </Field>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Filing status">
              <SelectInput
                value={status}
                onChange={(e) => setStatus(e.target.value as FilingStatus)}
              >
                <option value="single">Single</option>
                <option value="mfj">Married, joint</option>
                <option value="mfs">Married, separate</option>
                <option value="hoh">Head of household</option>
              </SelectInput>
            </Field>
            <Field label="Age">
              <NumInput value={age} onChange={setAge} align="left" />
            </Field>
          </div>

          <Field
            label="Other household taxable income"
            className="mt-4"
            hint="Optional — a spouse's W-2, investment income"
          >
            <NumInput value={other} onChange={setOther} prefix="$" align="left" />
          </Field>

          <div className="mt-4 rounded-[16px] border border-magenta/35 bg-gradient-to-b from-magenta/[0.08] to-transparent px-4 py-3.5">
            <Mono className="text-muted">
              Federal marginal rate · auto-calculated
            </Mono>
            <div className="mt-1.5 font-display text-[32px] font-bold leading-none tabular-nums text-grad">
              {Math.round(m.rate * 100)}%
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-dusk">
              2026 federal brackets · est. taxable income{" "}
              {money(m.taxableIncome)}
            </div>
          </div>
        </Panel>

        <Panel title="Entity &amp; coverage">
          <Field label="Tax entity">
            <Segmented
              value={isScorp ? "scorp" : "sole"}
              onChange={(v) => setIsScorp(v === "scorp")}
              options={[
                { value: "sole", label: "Sole prop / LLC" },
                { value: "scorp", label: "S-corp" },
              ]}
              className="w-full [&>button]:flex-1"
              ariaLabel="Tax entity"
            />
          </Field>

          {isScorp ? (
            <Field label="W-2 salary (S-corp wages)" className="mt-4">
              <NumInput value={salary} onChange={setSalary} prefix="$" align="left" />
            </Field>
          ) : null}

          <Field label="HSA — HDHP coverage" className="mt-4">
            <SelectInput
              value={hsaCov}
              onChange={(e) => setHsaCov(e.target.value as HsaCoverage)}
            >
              <option value="none">Not on an HDHP</option>
              <option value="self">Self-only</option>
              <option value="family">Family</option>
            </SelectInput>
          </Field>

          <Field
            label="Covered by a workplace retirement plan?"
            className="mt-4"
            hint="Affects whether your Traditional IRA deduction survives"
          >
            <Segmented
              value={covered ? "yes" : "no"}
              onChange={(v) => setCovered(v === "yes")}
              options={[
                { value: "no", label: "No" },
                { value: "yes", label: "Yes" },
              ]}
              className="w-full [&>button]:flex-1"
              ariaLabel="Covered by a workplace plan"
            />
          </Field>
        </Panel>
      </div>

      {/* ── the five vehicles ── */}
      <div className="mt-4 grid gap-3.5">
        <StrategyCard
          title="Solo 401(k)"
          badge="(Our #1 pick)"
          kind="Retirement"
          hero={money(m.solo)}
          heroNote={heroNote(m.solo)}
          heroMuted={m.solo <= 0}
          on={included.solo}
          onToggle={toggle("solo")}
          meta={roiLine(m.solo)}
        >
          <p className="text-[13px] leading-relaxed text-muted">
          {money(m.empDeferral)} salary deferral +{" "}
          {money(m.baseAddition - m.empDeferral)} employer
          {m.cuUsable > 0 ? ` + ${money(m.cuUsable)} catch-up` : ""} · on{" "}
          {m.basisLabel}
          </p>
        </StrategyCard>

        <StrategyCard
          title="SEP-IRA"
          kind="Retirement"
          hero={money(m.sep)}
          heroNote={heroNote(m.sep)}
          heroMuted={m.sep <= 0}
          on={included.sep}
          onToggle={toggle("sep")}
          meta={roiLine(m.sep)}
        >
          <p className="text-[13px] leading-relaxed text-muted">
          {(m.employerRate * 100).toFixed(0)}% of {m.basisLabel} (
          {money(m.basis)}), employer-only — no salary deferral, no catch-up.
          </p>
        </StrategyCard>

        <StrategyCard
          title="Traditional IRA"
          kind="Retirement"
          hero={money(m.ira)}
          heroNote={heroNote(m.ira)}
          heroMuted={m.ira <= 0}
          on={included.ira}
          onToggle={toggle("ira")}
          meta={roiLine(m.ira)}
        >
          <p className="text-[13px] leading-relaxed text-muted">
          Flat limit
          {m.iraBase > LIMITS.iraLimit
            ? ` + ${money(m.iraBase - LIMITS.iraLimit)} catch-up`
            : ""}
          .{" "}
          {covered ? (
            <span className="text-ember">
              You&rsquo;re covered by a workplace plan, so the deduction may be limited
              or phased out by income.
            </span>
          ) : (
            "Not covered by a workplace plan — fully deductible."
          )}
          </p>
        </StrategyCard>

        <StrategyCard
          title="Roth IRA"
          kind="Retirement · tax-free later"
          hero={money(m.roth)}
          heroNote={
            m.roth > 0 ? "Tax-free growth & withdrawals" : "— phased out at this income"
          }
          heroMuted={m.roth <= 0}
          on={included.roth}
          onToggle={toggle("roth")}
          meta={
            m.roth > 0 ? (
              <>
                No deduction today — the payoff is{" "}
                <b className="font-display font-bold text-teal">0% tax</b> on
                every dollar of growth and withdrawal in retirement.
              </>
            ) : null
          }
        >
          <p className="text-[13px] leading-relaxed text-muted">
          {m.rothCap === 0 ? (
            <>
              <span className="text-ember">
                Your estimated MAGI of {money(m.magi)} exceeds the 2026 Roth limit
                for this status (phase-out {money(m.rothRange[0])}–
                {money(m.rothRange[1])}).
              </span>{" "}
              No direct contribution — a &ldquo;backdoor Roth&rdquo; may still
              work. Pre-tax contributions lower MAGI and can restore eligibility.
            </>
          ) : m.rothCap < m.iraBase ? (
            <>
              <span className="text-ember">
                Reduced by the 2026 income phase-out ({money(m.rothRange[0])}–
                {money(m.rothRange[1])});
              </span>{" "}
              the full limit would be {money(m.iraBase)}. Shares the annual IRA
              limit with the Traditional IRA. After-tax now.
            </>
          ) : (
            <>
              Shares one annual limit with the Traditional IRA — fund one or
              split, not both in full. After-tax now; phase-out begins at MAGI{" "}
              {money(m.rothRange[0])}.
            </>
          )}
          </p>
        </StrategyCard>

        <StrategyCard
          title="HSA"
          kind="Health · triple tax-free"
          hero={money(m.hsa)}
          heroNote={heroNote(m.hsa)}
          heroMuted={m.hsa <= 0}
          on={included.hsa}
          onToggle={toggle("hsa")}
          meta={roiLine(m.hsa)}
        >
          <p className="text-[13px] leading-relaxed text-muted">{m.hsaLabel}</p>
        </StrategyCard>
      </div>

      {/* ── the stack ── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-magenta/35 bg-gradient-to-br from-magenta/[0.16] to-magenta/[0.02] px-6 py-6 shadow-[0_0_60px_-25px_rgba(255,45,120,0.7)]">
        <div>
          <Mono className="font-bold tracking-[2px] text-muted">
            Max stack — best retirement plan + HSA + IRA
          </Mono>
          <p className="mt-1.5 max-w-[48ch] text-[13px] text-muted">
            {m.stackContrib > 0 ? (
              <>
                {[
                  m.planName ? `${m.planName} (${money(m.planAmt)})` : null,
                  m.iraInc > 0 ? `${m.iraName} (${money(m.iraInc)})` : null,
                  m.hsaInc > 0 ? `HSA (${money(m.hsaInc)})` : null,
                ]
                  .filter(Boolean)
                  .join(" + ")}
                .
                {included.ira && included.roth
                  ? " Traditional & Roth IRA share one annual limit, so it counts once (Roth adds no current-year deduction)."
                  : ""}
              </>
            ) : (
              "No strategies selected — switch one on above."
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-[42px] font-bold leading-none tracking-[-1.5px] tabular-nums text-teal">
            {money(m.stackSaved)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted">
            est. tax saved on {money(m.stackContrib)} contributed
          </div>
          {m.stackContrib > 0 ? (
            <div className="mt-1.5 font-mono text-[11px] font-semibold text-teal">
              Immediate tax return ≈{" "}
              {((m.stackSaved / m.stackContrib) * 100).toFixed(1)}%
            </div>
          ) : null}
        </div>
      </div>

      {/* ── editable caps — setup, not part of the client story, hence the
          drawer: the label stays neutral because this is on screen too ── */}
      <div className="mt-5">
        <Drawer
          title="2026 contribution limits — advanced"
          icon={<CogIcon />}
          open={capsOpen}
          onToggle={setCapsOpen}
        >
          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Cap label="401(k) elective deferral" v={caps.deferral} set={setCap("deferral")} />
              <Cap label="401(k) catch-up (50–59, 64+)" v={caps.catchup} set={setCap("catchup")} />
              <Cap label="401(k) super catch-up (60–63)" v={caps.superCatchup} set={setCap("superCatchup")} />
              <Cap label="DC plan / SEP limit (415c)" v={caps.dcLimit} set={setCap("dcLimit")} />
              <Cap label="Compensation cap" v={caps.compCap} set={setCap("compCap")} />
              <Cap label="SS wage base (for SE tax)" v={caps.ssBase} set={setCap("ssBase")} />
              <Cap label="HSA — self-only" v={caps.hsaSelf} set={setCap("hsaSelf")} />
              <Cap label="HSA — family" v={caps.hsaFamily} set={setCap("hsaFamily")} />
              <Cap label="HSA catch-up (55+)" v={caps.hsaCatchup} set={setCap("hsaCatchup")} />
              <Cap label="Traditional IRA limit" v={caps.iraLimit} set={setCap("iraLimit")} />
              <Cap label="IRA catch-up (50+)" v={caps.iraCatchup} set={setCap("iraCatchup")} />
              <Cap label="Standard deduction — single" v={caps.stdSingle} set={setCap("stdSingle")} />
              <Cap label="Standard deduction — joint" v={caps.stdMfj} set={setCap("stdMfj")} />
              <Cap label="Standard deduction — separate" v={caps.stdMfs} set={setCap("stdMfs")} />
              <Cap label="Standard deduction — head of household" v={caps.stdHoh} set={setCap("stdHoh")} />
            </div>
            <button
              type="button"
              onClick={() => setCaps(DEFAULT_CAPS)}
              className="mt-4 cursor-pointer rounded-full border border-edge-bright px-4 py-1.5 font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted transition-colors duration-150 hover:border-magenta hover:text-fog"
            >
              Reset to defaults
            </button>
            <Note>
              Defaults are the <b className="text-mist">2026</b> IRS figures.
              The marginal rate comes from the 2026 federal brackets
              (10/12/22/24/32/35/37%), federal only. SEP-IRAs allow{" "}
              <b className="text-mist">no</b> catch-up. For sole props, plan
              contributions are computed on net SE earnings (profit less ½ SE
              tax); for S-corps, on W-2 wages. The Roth MAGI phase-out for 2026
              is built in.
            </Note>
          </div>
        </Drawer>
      </div>

      <Disclaimer>
        <b className="text-mist">For planning illustration only — not tax advice.</b>{" "}
        The marginal rate is auto-calculated from the 2026 federal brackets
        (federal only — no state tax is modeled), based on estimated taxable
        income. &ldquo;Tax saved&rdquo; is the deductible contribution times that
        single marginal rate — a simplification that slightly overstates the
        benefit when a large contribution spans more than one bracket. Three
        things to keep in mind: a Traditional IRA deduction phases out at
        higher income when you or your spouse are covered by a workplace plan;
        an HSA requires an HDHP for the months contributed; and you generally
        can&rsquo;t fund both a Solo 401(k) and a SEP on the same earnings. Your
        DeCypher preparer confirms eligibility and every figure before you act.
      </Disclaimer>
    </div>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

function Cap({
  label,
  v,
  set,
}: {
  label: string;
  v: string;
  set: (s: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-muted">{label}</span>
      <NumInput value={v} onChange={set} prefix="$" align="left" />
    </label>
  );
}
