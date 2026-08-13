"use client";

/**
 * Money Allocator — one month of business income, split into jobs.
 *
 * Client-facing: this gets screen-shared on a call, so the copy speaks to the
 * creator ("your numbers"), never about them.
 *
 * The maths lives in lib/widget-allocator.ts. What's here is the three ways of
 * looking at the same result:
 *
 *   Breakdown  — the editor. Every figure on the page is typed here.
 *   Money map  — the same allocation as the transfers you'd actually set up.
 *   Projection — box 3 compounded to retirement.
 *
 * ── Why every amount takes dollars OR percent ──────────────────────────────
 * People think about taxes in percent ("thirty percent off the top") and about
 * rent in dollars. Forcing either one turns the call into mental arithmetic, so
 * each bucket takes both and `DualAmount` keeps them in sync. Percent of INCOME
 * is the stored truth everywhere except Essentials, which is a bill rather than
 * a preference and is therefore tied to the living-expenses figure in box 1 —
 * type in either place and the other follows.
 */

import { useRef, useState } from "react";
import { money, moneyShort, toRaw } from "@/lib/widget-format";
import {
  ALLOCATOR_DEFAULTS,
  OHCRAP_MONTHS_TARGET,
  allocate,
  futureValue,
  ohCrapStatus,
  wealthStatus,
  type AllocatorResult,
  type Bucket,
  type CustomFund,
  type StatusTone,
} from "@/lib/widget-allocator";
import {
  Callout,
  Chip,
  Disclaimer,
  Field,
  Kpi,
  KpiRow,
  Mono,
  MoneyFlow,
  Note,
  NumInput,
  Panel,
  Segmented,
} from "@/components/portal/widgets/ui";
import { CHART, LineChart } from "@/components/portal/widgets/charts";

/* ─────────────────────────── small helpers ─────────────────────────── */

const n = (raw: string): number => {
  const v = parseFloat(raw);
  return isFinite(v) ? v : 0;
};

/** A number as the shortest string that round-trips through the inputs. */
const trim = (v: number): string =>
  isFinite(v) ? String(Math.round(v * 100) / 100) : "0";

const pctLabel = (share: number): string => {
  const v = share * 100;
  return `${Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : v.toFixed(1)}%`;
};

/* ─────────────────────────── dual entry ─────────────────────────── */

/** Either half of a dual control resolves to one canonical update. */
type DualChange = { dollars: number } | { pct: number };

/**
 * A figure you can type as dollars or as a percentage of income.
 *
 * Both halves keep a local draft while focused and snap back to the canonical
 * value on blur. Without that, "12." on its way to "12.5" round-trips through
 * the parent as 12 and the decimal point is eaten as you type it; and clearing
 * the field would immediately refill it with "0".
 *
 * React's onBlur bubbles, so one handler on the wrapper clears whichever draft
 * was live.
 */
function DualAmount({
  dollars,
  pct,
  onChange,
  label,
  compact = false,
}: {
  /** Canonical dollar figure, derived by the parent. */
  dollars: number;
  /** Canonical share of income, 0–100. Derived by the parent too — the two
   *  halves are pure display here; the parent owns which one is the truth. */
  pct: number;
  onChange: (change: DualChange) => void;
  label: string;
  /** Drop the percent pill — for the tight tiles in the money map. */
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<{ field: "dollars" | "pct"; value: string } | null>(
    null,
  );

  const dollarValue = draft?.field === "dollars" ? draft.value : trim(Math.round(dollars));
  const pctValue = draft?.field === "pct" ? draft.value : trim(pct);

  return (
    <div className="flex items-center gap-2" onBlur={() => setDraft(null)}>
      <NumInput
        value={dollarValue}
        onChange={(raw) => {
          setDraft({ field: "dollars", value: raw });
          onChange({ dollars: n(raw) });
        }}
        prefix="$"
        align="left"
        className="min-w-0 flex-1"
        ariaLabel={`${label} in dollars`}
      />
      {compact ? null : (
        <label className="inline-flex flex-none items-center gap-1 rounded-[10px] border border-edge-mid bg-panel-2 px-2.5 py-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-magenta focus-within:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]">
          <input
            value={pctValue}
            inputMode="decimal"
            aria-label={`${label} as a percent of income`}
            onChange={(e) => {
              const raw = toRaw(e.target.value);
              setDraft({ field: "pct", value: raw });
              onChange({ pct: n(raw) });
            }}
            className="w-[42px] bg-transparent text-right font-mono text-[13px] font-semibold tabular-nums text-magenta outline-none"
          />
          <span aria-hidden className="font-mono text-[12px] text-dusk">
            %
          </span>
        </label>
      )}
    </div>
  );
}

/* ─────────────────────────── bucket card ─────────────────────────── */

/**
 * One destination for money. `step` numbers the waterfall, so the order money
 * fills these in is legible without reading the copy.
 */
function BucketCard({
  step,
  title,
  blurb,
  bucket,
  income,
  onChange,
  note,
  children,
}: {
  step?: number;
  title: React.ReactNode;
  blurb: string;
  bucket: Bucket;
  income: number;
  onChange: (change: DualChange) => void;
  note?: React.ReactNode;
  /** Extra controls in the title row — the custom funds' remove button. */
  children?: React.ReactNode;
}) {
  const short = bucket.target - bucket.funded > 1;
  return (
    <div className="flex flex-col rounded-[16px] border border-edge bg-white/[0.02] p-4">
      <div className="flex items-center gap-2.5">
        {step != null ? (
          <span
            aria-hidden
            className="flex h-[21px] w-[21px] flex-none items-center justify-center rounded-full bg-magenta font-mono text-[11px] font-bold text-night"
          >
            {step}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 font-display text-[15px] font-semibold text-fog">
          {title}
        </span>
        {children}
      </div>

      <p className="mt-2 min-h-[34px] text-[12.5px] leading-relaxed text-muted">
        {blurb}
      </p>

      <div className="mt-3.5">
        <DualAmount
          dollars={bucket.target}
          pct={income > 0 ? (bucket.target / income) * 100 : 0}
          onChange={onChange}
          label={typeof title === "string" ? title : "Amount"}
        />
      </div>

      {short ? (
        <p className="mt-2.5 font-mono text-[10.5px] leading-relaxed text-ember">
          Only {money(bucket.funded)} flows — not enough owner pay left
        </p>
      ) : note ? (
        <p className="mt-2.5 font-mono text-[10.5px] leading-relaxed text-dusk">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── progress meter ─────────────────────────── */

/**
 * A filled bar with labelled ticks. Not in widgets/ui.tsx because it's the only
 * place in the portal that needs one — if a second tool wants it, move it there
 * rather than copying it.
 */
function Meter({
  label,
  value,
  fill,
  ticks,
  status,
}: {
  label: string;
  value: React.ReactNode;
  /** 0–1. */
  fill: number;
  ticks: { at: number; label: string }[];
  status: { label: string; tone: StatusTone };
}) {
  return (
    <Panel title={label} action={<Chip tone={status.tone}>{status.label}</Chip>}>
      <div className="mb-3 text-right font-mono text-[14px] tabular-nums text-fog">
        {value}
      </div>
      <div className="h-3 overflow-hidden rounded-full border border-edge bg-panel-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-magenta to-violet transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, fill * 100)).toFixed(1)}%` }}
        />
      </div>
      <div className="relative mt-1.5 h-4">
        {ticks.map((t) => (
          <span
            key={t.label}
            className="absolute -translate-x-1/2 font-mono text-[10px] text-faint"
            style={{ left: `${t.at * 100}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </Panel>
  );
}

/* ─────────────────────────── the widget ─────────────────────────── */

const RATES = [
  { value: 0.07, label: "7% market" },
  { value: 0.1, label: "10% growth" },
  { value: 0.13, label: "13% aggressive" },
];

type View = "breakdown" | "map" | "projection";

export default function MoneyAllocator() {
  const [view, setView] = useState<View>("breakdown");

  const [income, setIncome] = useState("10000");
  const [living, setLiving] = useState("4000");
  const [balance, setBalance] = useState("0");

  const pctDefault = (v: number) => trim(v * 100);
  const [taxPct, setTaxPct] = useState(pctDefault(ALLOCATOR_DEFAULTS.taxPct));
  const [opsPct, setOpsPct] = useState(pctDefault(ALLOCATOR_DEFAULTS.opsPct));
  const [discPct, setDiscPct] = useState(pctDefault(ALLOCATOR_DEFAULTS.discPct));
  const [wealthPct, setWealthPct] = useState(pctDefault(ALLOCATOR_DEFAULTS.wealthPct));
  const [ohPct, setOhPct] = useState(pctDefault(ALLOCATOR_DEFAULTS.ohCrapPct));

  const [funds, setFunds] = useState<CustomFund[]>([]);
  const nextFundId = useRef(1);

  const [ageNow, setAgeNow] = useState("30");
  const [ageRetire, setAgeRetire] = useState("65");
  const [rate, setRate] = useState(0.1);

  const inc = n(income);

  const result = allocate({
    monthlyIncome: inc,
    monthlyLiving: n(living),
    ohCrapBalance: n(balance),
    taxPct: n(taxPct) / 100,
    opsPct: n(opsPct) / 100,
    discPct: n(discPct) / 100,
    wealthPct: n(wealthPct) / 100,
    ohCrapPct: n(ohPct) / 100,
    extras: funds.map((f) => ({ ...f, pct: f.pct / 100 })),
  });

  /** A bucket whose stored truth is a share of income. */
  const bindPct =
    (set: (raw: string) => void) =>
    (change: DualChange) =>
      set(
        trim(
          "pct" in change ? change.pct : inc > 0 ? (change.dollars / inc) * 100 : 0,
        ),
      );

  /** Essentials is the living-expenses figure itself — box 1 and box 3 are one. */
  const bindLiving = (change: DualChange) =>
    setLiving(
      trim("dollars" in change ? change.dollars : (change.pct / 100) * inc),
    );

  const bindFund = (id: string) => (change: DualChange) =>
    setFunds((list) =>
      list.map((f) =>
        f.id === id
          ? {
              ...f,
              pct:
                "pct" in change
                  ? change.pct
                  : inc > 0
                    ? (change.dollars / inc) * 100
                    : 0,
            }
          : f,
      ),
    );

  const addFund = () => {
    const id = `fund-${nextFundId.current++}`;
    setFunds((list) => [...list, { id, name: "New fund", pct: 5 }]);
  };

  return (
    <div>
      <Panel
        title="Your numbers"
        action={<Mono className="text-faint">updates live</Mono>}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Monthly business income"
            hint="Average, or what you expect this month"
          >
            <NumInput value={income} onChange={setIncome} prefix="$" align="left" />
          </Field>
          <Field
            label="Monthly living expenses"
            hint="Bare-minimum rent, utilities, food"
          >
            <NumInput value={living} onChange={setLiving} prefix="$" align="left" />
          </Field>
          <Field
            label="Current Oh Crap fund"
            hint="Emergency savings across every account"
          >
            <NumInput value={balance} onChange={setBalance} prefix="$" align="left" />
          </Field>
        </div>
      </Panel>

      <div className="mt-5 flex justify-center">
        <Segmented
          value={view}
          onChange={setView}
          ariaLabel="View"
          options={[
            { value: "breakdown" as const, label: "Breakdown" },
            { value: "map" as const, label: "Money map" },
            { value: "projection" as const, label: "Projection" },
          ]}
        />
      </div>

      <div className="mt-5">
        {view === "breakdown" ? (
          <Breakdown
            r={result}
            income={inc}
            taxPct={taxPct}
            opsPct={opsPct}
            discPct={discPct}
            wealthPct={wealthPct}
            ohPct={ohPct}
            funds={funds}
            bindPct={bindPct}
            bindLiving={bindLiving}
            bindFund={bindFund}
            setTaxPct={setTaxPct}
            setOpsPct={setOpsPct}
            setDiscPct={setDiscPct}
            setWealthPct={setWealthPct}
            setOhPct={setOhPct}
            setFunds={setFunds}
            addFund={addFund}
          />
        ) : null}

        {view === "map" ? (
          <MoneyMap
            r={result}
            income={inc}
            bindPct={bindPct}
            bindLiving={bindLiving}
            bindFund={bindFund}
            setTaxPct={setTaxPct}
            setOpsPct={setOpsPct}
            setDiscPct={setDiscPct}
            setWealthPct={setWealthPct}
            setOhPct={setOhPct}
          />
        ) : null}

        {view === "projection" ? (
          <Projection
            monthly={result.wealth.funded}
            ageNow={ageNow}
            setAgeNow={setAgeNow}
            ageRetire={ageRetire}
            setAgeRetire={setAgeRetire}
            rate={rate}
            setRate={setRate}
          />
        ) : null}
      </div>

      <Disclaimer>
        A planning model, not advice. The tax line is a set-aside percentage you
        choose — not a computed liability — and the projection assumes a constant
        return with no fees, taxes on gains, or missed months. For the
        conversation, not for filing.
      </Disclaimer>
    </div>
  );
}

/* ─────────────────────────── breakdown view ─────────────────────────── */

type Binders = {
  bindPct: (set: (raw: string) => void) => (change: DualChange) => void;
  bindLiving: (change: DualChange) => void;
  bindFund: (id: string) => (change: DualChange) => void;
  setTaxPct: (raw: string) => void;
  setOpsPct: (raw: string) => void;
  setDiscPct: (raw: string) => void;
  setWealthPct: (raw: string) => void;
  setOhPct: (raw: string) => void;
};

function Breakdown({
  r,
  income,
  taxPct,
  opsPct,
  discPct,
  wealthPct,
  ohPct,
  funds,
  setFunds,
  addFund,
  ...bind
}: Binders & {
  r: AllocatorResult;
  income: number;
  taxPct: string;
  opsPct: string;
  discPct: string;
  wealthPct: string;
  ohPct: string;
  funds: CustomFund[];
  setFunds: React.Dispatch<React.SetStateAction<CustomFund[]>>;
  addFund: () => void;
}) {
  const oh = ohCrapStatus(r.progress.ohCrapMonths);
  const w = wealthStatus(r.progress.wealthPctOfIncome);
  const months = r.progress.ohCrapMonths;
  const ohFull = r.ohCrap.target <= 1 && r.progress.ohCrapPct >= 1;

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="Off the top"
        action={<Mono className="text-faint">business first</Mono>}
      >
        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          Taxes and business ops come out before you pay yourself. Set each in
          dollars or percent — they stay in sync. What&rsquo;s left is owner pay.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <BucketCard
            title="Business Ops &amp; Growth"
            blurb="Software, editors, ads — everything it takes to keep the revenue coming in."
            bucket={{ target: r.business.ops, funded: r.business.ops }}
            income={income}
            onChange={bind.bindPct(bind.setOpsPct)}
            note={`${opsPct}% of income`}
          />
          <BucketCard
            title="Taxes / Savings"
            blurb="Set aside for the IRS and your state so tax time doesn’t hurt."
            bucket={{ target: r.business.taxes, funded: r.business.taxes }}
            income={income}
            onChange={bind.bindPct(bind.setTaxPct)}
            note={`${taxPct}% of income`}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-magenta/35 bg-magenta/[0.07] px-4 py-3.5">
          <div>
            <Mono className="text-magenta">Owner pay</Mono>
            <p className="mt-0.5 text-[12.5px] text-mist">
              What reaches you, and what section 2 divides up.
            </p>
          </div>
          <div className="text-right">
            <MoneyFlow
              value={r.business.ownerPay}
              className="font-display text-[28px] font-bold tabular-nums text-magenta"
            />
            <div className="font-mono text-[11px] text-dusk">
              {pctLabel(r.business.ownerPayPct)} of income
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Owner pay, allocated"
        action={
          <Mono className="text-faint">
            {pctLabel(r.business.ownerPayPct)} of income to divide
          </Mono>
        }
      >
        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          These fund <strong className="font-semibold text-mist">in order</strong>{" "}
          — each takes its target, then the rest flows down. Set any of them in
          dollars or percent.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <BucketCard
            step={1}
            title="Essentials"
            blurb="Rent, groceries, the cost of keeping life running."
            bucket={r.essentials}
            income={income}
            onChange={bind.bindLiving}
            note={
              r.livingShort > 1
                ? undefined
                : "Covered first · tied to your living expenses above"
            }
          />
          <BucketCard
            step={2}
            title="Discretionary Fun"
            blurb="Trips, restaurants, entertainment — guilt-free spending."
            bucket={r.discretionary}
            income={income}
            onChange={bind.bindPct(bind.setDiscPct)}
            note={`${discPct}% of income`}
          />
          <BucketCard
            step={3}
            title="Long-Term Wealth"
            blurb="Retirement accounts and long-term investing for future you."
            bucket={r.wealth}
            income={income}
            onChange={bind.bindPct(bind.setWealthPct)}
            note={`${wealthPct}% of income`}
          />
          <BucketCard
            step={4}
            title="Oh Crap Fund"
            blurb={`Emergency savings, capped at ${OHCRAP_MONTHS_TARGET} months of bare-minimum living costs.`}
            bucket={r.ohCrap}
            income={income}
            onChange={bind.bindPct(bind.setOhPct)}
            note={
              ohFull
                ? "Fund is full — nothing needed this month"
                : `Asking ${ohPct}% · cap ${money(r.ohCrapTarget)}`
            }
          />

          {funds.map((fund, i) => (
            <BucketCard
              key={fund.id}
              step={5 + i}
              title={
                <input
                  value={fund.name}
                  maxLength={24}
                  aria-label="Fund name"
                  onChange={(e) =>
                    setFunds((list) =>
                      list.map((f) =>
                        f.id === fund.id ? { ...f, name: e.target.value } : f,
                      ),
                    )
                  }
                  className="w-full min-w-0 border-b border-dashed border-edge-mid bg-transparent pb-0.5 font-display text-[15px] font-semibold text-fog outline-none transition-colors duration-150 hover:border-dusk focus:border-magenta"
                />
              }
              blurb="Custom savings goal — funded from whatever is left."
              bucket={r.extras[i] ?? { target: 0, funded: 0 }}
              income={income}
              onChange={bind.bindFund(fund.id)}
              note={`${trim(fund.pct)}% of income`}
            >
              <button
                type="button"
                aria-label={`Remove ${fund.name}`}
                onClick={() =>
                  setFunds((list) => list.filter((f) => f.id !== fund.id))
                }
                className="flex-none cursor-pointer px-1 text-[18px] leading-none text-dusk transition-colors duration-150 hover:text-danger"
              >
                ×
              </button>
            </BucketCard>
          ))}
        </div>

        <button
          type="button"
          onClick={addFund}
          className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-dashed border-edge-mid px-4 py-4 font-mono text-[11px] uppercase tracking-[1.2px] text-dusk transition-colors duration-150 hover:border-magenta/50 hover:bg-magenta/[0.06] hover:text-fog"
        >
          <span aria-hidden className="text-[15px] font-bold text-magenta">
            +
          </span>
          Add a fund (travel, house, car…)
        </button>

        <Leftover r={r} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Meter
          label="Oh Crap runway"
          value={
            <>
              {months >= OHCRAP_MONTHS_TARGET
                ? `${OHCRAP_MONTHS_TARGET}+`
                : (Math.round(months * 10) / 10).toString()}
              <span className="text-dusk"> / {OHCRAP_MONTHS_TARGET} months</span>
            </>
          }
          fill={r.progress.ohCrapPct}
          ticks={[
            { at: 1 / 6, label: "1" },
            { at: 0.5, label: "3" },
            { at: 1, label: "6" },
          ]}
          status={oh}
        />
        <Meter
          label="Long-Term Wealth"
          value={
            <>
              {pctLabel(r.progress.wealthPctOfIncome)}
              <span className="text-dusk"> of income</span>
            </>
          }
          fill={r.progress.wealthPctOfIncome / 0.3}
          ticks={[
            { at: 1 / 3, label: "10%" },
            { at: 0.5, label: "15%" },
            { at: 1, label: "30%" },
          ]}
          status={w}
        />
      </div>
    </div>
  );
}

/**
 * Where owner pay stands against the plan — the one line that says whether this
 * month works. Four states, and they are genuinely different problems: the
 * business isn't paying you enough to live; the plan is bigger than the pay;
 * there's money spare; or it balances.
 */
function Leftover({ r }: { r: AllocatorResult }) {
  const state =
    r.livingShort > 1
      ? {
          tone: "bad" as const,
          label: "Living costs exceed take-home",
          sub: "The business isn’t paying enough to cover essentials — grow income, or cut the tax and ops percentages.",
          figure: money(r.livingShort),
          unit: "short",
        }
      : r.squeeze > 1
        ? {
            tone: "bad" as const,
            label: "Owner pay maxed out",
            sub: "The full plan needs more than take-home — lower a target, or grow income.",
            figure: money(r.squeeze),
            unit: "short of plan",
          }
        : r.surplus > 1
          ? {
              tone: "spare" as const,
              label: "Surplus to assign",
              sub: "Owner pay covers the whole plan — send the extra to wealth or the Oh Crap fund.",
              figure: money(r.surplus),
              unit: `left · ${pctLabel(r.income > 0 ? r.surplus / r.income : 0)}`,
            }
          : {
              tone: "good" as const,
              label: "Owner pay fully allocated",
              sub: "Every dollar of take-home has a job.",
              figure: "$0",
              unit: "left",
            };

  const cls =
    state.tone === "bad"
      ? "border-ember/45 bg-ember/[0.07]"
      : state.tone === "spare"
        ? "border-magenta/40 bg-magenta/[0.07]"
        : "border-teal/40 bg-teal/[0.06]";
  const figureCls =
    state.tone === "bad"
      ? "text-ember"
      : state.tone === "spare"
        ? "text-magenta"
        : "text-teal";

  return (
    <div
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border px-4 py-3.5 ${cls}`}
    >
      <div className="min-w-0">
        <div className="font-display text-[15px] font-semibold text-fog">
          {state.label}
        </div>
        <p className="mt-0.5 max-w-lg text-[12.5px] leading-relaxed text-muted">
          {state.sub}
        </p>
      </div>
      <div className="text-right">
        <div
          className={`font-display text-[24px] font-bold tabular-nums ${figureCls}`}
        >
          {state.figure}
        </div>
        <div className="font-mono text-[11px] text-dusk">{state.unit}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────── money map view ─────────────────────────── */

/**
 * The same allocation drawn as the transfers you'd set up at the bank — every
 * tile is one standing monthly move.
 *
 * Built from real elements and hairline rules rather than an SVG: the tree has
 * a variable number of leaves (custom funds), and a laid-out SVG would need a
 * fixed viewBox wide enough for the worst case and a horizontal scrollbar on
 * every screen narrower than that. Boxes and connectors reflow instead, and the
 * amounts stay editable because they're ordinary inputs.
 */
function MoneyMap({
  r,
  income,
  ...bind
}: Binders & { r: AllocatorResult; income: number }) {
  const leaves = [
    { label: "Essentials", amount: r.essentials, onChange: bind.bindLiving },
    {
      label: "Discretionary",
      amount: r.discretionary,
      onChange: bind.bindPct(bind.setDiscPct),
    },
    { label: "Wealth", amount: r.wealth, onChange: bind.bindPct(bind.setWealthPct) },
    { label: "Emergency", amount: r.ohCrap, onChange: bind.bindPct(bind.setOhPct) },
    ...r.extras.map((e) => ({
      label: e.name || "Fund",
      amount: { target: e.target, funded: e.funded },
      onChange: bind.bindFund(e.id),
    })),
  ];

  return (
    <Panel
      title="Money map"
      action={<Mono className="text-faint">one arrow = one transfer</Mono>}
    >
      <p className="mb-5 text-[12.5px] leading-relaxed text-muted">
        Set these up as automatic transfers on the day income lands. Any amount
        here is editable — it&rsquo;s the same figure the breakdown holds.
      </p>

      {/* The tree is three columns wide at its narrowest and a phone can't give
          each one enough room for a dollar field — the labels truncate and the
          amounts clip. So it keeps its own width and scrolls inside the panel,
          rather than the page scrolling sideways. The negative inset bleeds the
          scroll area out to the panel's edges so nothing looks cut off. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="min-w-[520px]">
          {/* income */}
          <div className="mx-auto max-w-[280px] rounded-[16px] border border-magenta/40 bg-magenta/[0.08] px-4 py-3 text-center">
            <Mono className="text-magenta">Business income</Mono>
            <div className="mt-0.5 font-display text-[24px] font-bold tabular-nums text-fog">
              {money(r.income)}
            </div>
          </div>

          <Trunk />
          <Bus />

          {/* tier one */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <MapTile
              label="Taxes / Savings"
              amount={r.business.taxes}
              income={income}
              onChange={bind.bindPct(bind.setTaxPct)}
            />
            <div className="rounded-[16px] border border-magenta/40 bg-magenta/[0.07] px-3 py-3 text-center">
              <Mono className="text-magenta">Owner pay</Mono>
              <div className="mt-1 font-display text-[19px] font-bold tabular-nums text-fog">
                {money(r.business.ownerPay)}
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-dusk">
                {pctLabel(r.business.ownerPayPct)}
              </div>
            </div>
            <MapTile
              label="Business Ops"
              amount={r.business.ops}
              income={income}
              onChange={bind.bindPct(bind.setOpsPct)}
            />
          </div>

          {/* owner pay drops into the buckets */}
          <Trunk />
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-edge-mid" />
            <Mono className="flex-none text-faint">funded in this order</Mono>
            <div className="h-px flex-1 bg-edge-mid" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {leaves.map((leaf, i) => (
              <MapTile
                key={leaf.label + i}
                step={i + 1}
                label={leaf.label}
                amount={leaf.amount.target}
                funded={leaf.amount.funded}
                income={income}
                onChange={leaf.onChange}
              />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** The single rule dropping out of a node. */
function Trunk() {
  return <div className="mx-auto h-6 w-px bg-edge-mid" />;
}

/**
 * Three-way split: one rule in, three drops out, each landing on the centre of
 * a column in the grid below.
 *
 * Laid out as the same 3-column grid so the drops line up with the tiles
 * whatever the gap is. The horizontal segments overhang into the gutters by
 * exactly the gap (the negative insets), which is what joins them into one
 * continuous rule instead of three floating dashes.
 */
function Bus() {
  return (
    <div aria-hidden className="grid grid-cols-3 gap-2 sm:gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="relative h-6">
          <div
            className={`absolute top-0 h-px bg-edge-mid ${
              i === 0 ? "left-1/2 -right-2 sm:-right-4"
              : i === 2 ? "-left-2 right-1/2 sm:-left-4"
              : "-left-2 -right-2 sm:-left-4 sm:-right-4"
            }`}
          />
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-edge-mid" />
        </div>
      ))}
    </div>
  );
}

function MapTile({
  step,
  label,
  amount,
  funded,
  income,
  onChange,
}: {
  step?: number;
  label: string;
  amount: number;
  /** What actually arrives, when the waterfall couldn't fill the target. */
  funded?: number;
  income: number;
  onChange: (change: DualChange) => void;
}) {
  const short = funded != null && amount - funded > 1;
  return (
    <div
      className={`rounded-[16px] border px-3 py-3 ${
        short ? "border-ember/45 bg-ember/[0.05]" : "border-edge bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-center gap-1.5">
        {step != null ? (
          <span aria-hidden className="font-mono text-[10.5px] text-magenta">
            {step}
          </span>
        ) : null}
        <Mono className="truncate text-dusk">{label}</Mono>
      </div>
      <div className="mt-2">
        <DualAmount
          dollars={amount}
          pct={income > 0 ? (amount / income) * 100 : 0}
          onChange={onChange}
          label={label}
          compact
        />
      </div>
      <div className="mt-1.5 text-center font-mono text-[10px] text-faint">
        {short ? `only ${money(funded)} flows` : pctLabel(income > 0 ? amount / income : 0)}
      </div>
    </div>
  );
}

/* ─────────────────────────── projection view ─────────────────────────── */

/**
 * Box 3 compounded to retirement.
 *
 * Deliberately projects only the Long-Term Wealth line. The emergency fund is
 * cash by design and the other buckets get spent, so compounding the whole
 * allocation would flatter the number by counting money that was never
 * invested.
 */
function Projection({
  monthly,
  ageNow,
  setAgeNow,
  ageRetire,
  setAgeRetire,
  rate,
  setRate,
}: {
  monthly: number;
  ageNow: string;
  setAgeNow: (v: string) => void;
  ageRetire: string;
  setAgeRetire: (v: string) => void;
  rate: number;
  setRate: (v: number) => void;
}) {
  const start = Math.max(0, Math.floor(n(ageNow)));
  const end = Math.max(0, Math.floor(n(ageRetire)));
  const years = Math.max(0, end - start);

  const values = Array.from({ length: years + 1 }, (_, y) =>
    futureValue(monthly, rate, y * 12),
  );
  const final = values[values.length - 1] ?? 0;
  const invested = monthly * years * 12;
  const growth = Math.max(0, final - invested);

  const problem =
    monthly < 1
      ? "Long-Term Wealth is funding $0 right now — free up owner pay to start investing."
      : years <= 0
        ? "Set a retirement age above the current age to project growth."
        : null;

  return (
    <div className="flex flex-col gap-5">
      <Panel title="The long game">
        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          Every dollar in box 3 —{" "}
          <strong className="font-semibold text-mist">Long-Term Wealth</strong> —
          invested each month and left to compound.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current age">
            <NumInput value={ageNow} onChange={setAgeNow} align="left" />
          </Field>
          <Field label="Retirement age">
            <NumInput value={ageRetire} onChange={setAgeRetire} align="left" />
          </Field>
        </div>
        <div className="mt-4">
          <Mono className="mb-2 block text-mist">Assumed annual return</Mono>
          <Segmented
            value={rate}
            onChange={setRate}
            ariaLabel="Assumed annual return"
            options={RATES.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
      </Panel>

      <Callout label="Projected value at retirement" value={money(final)}>
        {problem ??
          `${money(monthly)}/mo for ${years} ${years === 1 ? "year" : "years"} at ${Math.round(rate * 100)}%, compounded monthly.`}
      </Callout>

      <KpiRow cols={2}>
        <Kpi label="You invested" value={money(invested)} sub="out of pocket" />
        <Kpi
          label="Market growth"
          value={money(growth)}
          sub="what compounding added"
          tone="pos"
        />
      </KpiRow>

      <Panel title="Growth curve">
        {years > 0 && monthly >= 1 ? (
          <>
            <LineChart
              series={[
                {
                  key: "wealth",
                  label: "Portfolio value",
                  color: CHART.gain,
                  kind: "line",
                  values,
                },
              ]}
              xLabel={(i) => `Age ${start + i}`}
              labelForIndex={(i) => `Age ${start + i}`}
              fillFirst
              endLabel={money(final)}
              height={260}
            />
            <Note>
              Assumes {money(monthly)} invested every month for {years}{" "}
              {years === 1 ? "year" : "years"} at a constant{" "}
              {Math.round(rate * 100)}%, ending at {moneyShort(final)}. Real
              returns are never constant.
            </Note>
          </>
        ) : (
          <p className="py-10 text-center font-mono text-[11.5px] uppercase tracking-[1px] text-faint">
            Nothing to project yet
          </p>
        )}
      </Panel>
    </div>
  );
}
