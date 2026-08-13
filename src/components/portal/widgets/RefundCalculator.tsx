"use client";

/**
 * Service Ledger — the cancellation calculator.
 *
 * Run on a call with a client who's leaving: pick the payment plan and the two
 * dates and the tool says what moves in which direction and, more usefully,
 * *why* — the plain-English block is the script. Tier pricing, prepay
 * discounts and the catch-up bonus sit in a collapsed drawer so staff can set
 * them before the call without them dominating the screen.
 *
 * The rule it encodes (the client's new model): the yearly price is the
 * selected tier's rate minus the prepay discount for the chosen cadence.
 * We charge for the months we actually worked in the current contract year at
 * that yearly price ÷ 12, and compare it against the installments the client
 * has paid so far this year (quarterly ×4, six-monthly ×2, or one annual
 * payment — an installment counts as paid the moment its period starts).
 * The catch-up bonus — free back-work done up front — is recovered IN FULL if
 * the client leaves inside their first two years, and waived from year 3.
 * Unlike the old calculator this can go past zero in either direction: the
 * result is a refund, a balance still owed, or a clean break.
 */

import { useMemo, useState } from "react";
import { money, shortDate, toNum } from "@/lib/widget-format";
import {
  CogIcon,
  Disclaimer,
  Drawer,
  Field,
  Kpi,
  KpiRow,
  LineRow,
  Mono,
  NumInput,
  Panel,
} from "@/components/portal/widgets/ui";

const TIERS = [
  { id: "core", label: "Core" },
  { id: "creator", label: "Creator" },
  { id: "csuite", label: "C-suite" },
] as const;
type TierId = (typeof TIERS)[number]["id"];

const CADENCES = [
  { id: "quarterly", label: "Quarterly", small: "4 payments / yr", installments: 4 },
  { id: "semi", label: "Every 6 months", small: "2 payments / yr", installments: 2 },
  { id: "annual", label: "Paid yearly", small: "1 payment / yr", installments: 1 },
] as const;
type CadenceId = (typeof CADENCES)[number]["id"];

/** Fractional months between two dates — the day remainder is prorated. */
function monthsBetween(d1: Date, d2: Date): number {
  const y = d2.getFullYear() - d1.getFullYear();
  const m = d2.getMonth() - d1.getMonth();
  const dim = new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate();
  const days = (d2.getDate() - d1.getDate()) / dim;
  return Math.max(0, y * 12 + m + days);
}

function addYears(d: Date, y: number): Date {
  const n = new Date(d);
  n.setFullYear(n.getFullYear() + y);
  return n;
}

/** "2 yr 3 mo" — 12 months rounds up into the next year rather than reading "1 yr 12 mo". */
function tenureLabel(mos: number): string {
  let y = Math.floor(mos / 12);
  let m = Math.round(mos - y * 12);
  if (m === 12) {
    y++;
    m = 0;
  }
  if (y <= 0) return `${m} mo`;
  return `${y} yr${m > 0 ? ` ${m} mo` : ""}`;
}

/** Installments considered paid by this point of the contract year — one the
 *  moment its period starts, so 0.1 months into a quarter counts that quarter. */
function installmentsPaidBy(cadence: CadenceId, mosUsed: number): number {
  if (cadence === "annual") return 1;
  if (cadence === "semi") return Math.min(2, Math.floor(mosUsed / 6) + 1);
  return Math.min(4, Math.floor(mosUsed / 3) + 1);
}

export default function RefundCalculator() {
  const [setupOpen, setSetupOpen] = useState(false);

  // ── staff setup ──
  const [tier, setTier] = useState<TierId>("core");
  const [rates, setRates] = useState<Record<TierId, string>>({
    core: "12000",
    creator: "17000",
    csuite: "30000",
  });
  const [discAnnual, setDiscAnnual] = useState("2000");
  const [discSemi, setDiscSemi] = useState("1000");
  const [catchPer, setCatchPer] = useState("5000");
  const [catchYears, setCatchYears] = useState("1");

  // ── client-facing inputs ──
  const [cadence, setCadence] = useState<CadenceId>("quarterly");
  const [signDate, setSignDate] = useState("");
  const [cancelDate, setCancelDate] = useState("");

  const tierLabel = TIERS.find((t) => t.id === tier)!.label;
  const catchTotal = toNum(catchPer) * Math.max(0, Math.floor(toNum(catchYears)));

  /** Yearly price for the chosen tier and cadence — prepay discount applied. */
  const yearly = useMemo(() => {
    const base = toNum(rates[tier]);
    if (cadence === "annual") return Math.max(0, base - toNum(discAnnual));
    if (cadence === "semi") return Math.max(0, base - toNum(discSemi));
    return base;
  }, [rates, tier, cadence, discAnnual, discSemi]);

  const result = useMemo(() => {
    if (!signDate || !cancelDate) return { state: "empty" as const };
    const sd = new Date(`${signDate}T00:00:00`);
    const cd = new Date(`${cancelDate}T00:00:00`);
    if (cd < sd) return { state: "invalid" as const };

    const totalMos = monthsBetween(sd, cd);
    const contractYear = Math.floor(totalMos / 12) + 1;
    const mosUsed = totalMos - (contractYear - 1) * 12;
    const mosLeft = Math.max(0, 12 - mosUsed);

    const rate = yearly / 12;
    const installments = CADENCES.find((c) => c.id === cadence)!.installments;
    const instAmt = yearly / installments;
    const instPaid = installmentsPaidBy(cadence, mosUsed);
    const paid = instPaid * instAmt;

    const worked = mosUsed * rate;
    // The catch-up bonus is recoverable IN FULL inside years 1–2 (the total
    // can go underwater), and waived entirely from year 3.
    const clawback = contractYear <= 2 ? catchTotal : 0;
    const owed = worked + clawback;

    const net = paid - owed;
    const refund = Math.max(0, net);
    const due = Math.max(0, -net);

    const yearStart = addYears(sd, contractYear - 1);
    const yearEnd = new Date(addYears(sd, contractYear).getTime() - 86400000);

    return {
      state: "ok" as const,
      sd,
      cd,
      totalMos,
      contractYear,
      rate,
      mosUsed,
      mosLeft,
      installments,
      instAmt,
      instPaid,
      paid,
      worked,
      clawback,
      owed,
      refund,
      due,
      yearStart,
      yearEnd,
    };
  }, [signDate, cancelDate, yearly, cadence, catchTotal]);

  return (
    <div>
      {/* ── staff-only pricing setup ── */}
      <Drawer
        title="Staff setup — plan &amp; pricing (set before the call)"
        icon={<CogIcon />}
        open={setupOpen}
        onToggle={setSetupOpen}
      >
        <div>
          <Mono className="text-dusk">
            Plan tiers — set each tier&rsquo;s current yearly rate
          </Mono>
          <div className="mt-2 flex flex-col gap-2">
            {TIERS.map((t) => {
              const on = tier === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2 transition-colors duration-150 ${
                    on
                      ? "border-magenta bg-magenta/[0.07]"
                      : "border-edge-bright hover:border-magenta/60"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`relative h-4 w-4 flex-none rounded-full border-2 ${
                      on ? "border-magenta" : "border-edge-bright"
                    }`}
                  >
                    {on ? (
                      <span className="absolute inset-[2.5px] rounded-full bg-grad" />
                    ) : null}
                  </span>
                  <span className="flex-1 text-[13.5px] font-medium text-fog">
                    {t.label}
                  </span>
                  <div
                    className="w-[150px] flex-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <NumInput
                      value={rates[t.id]}
                      onChange={(v) => setRates((r) => ({ ...r, [t.id]: v }))}
                      prefix="$"
                      align="left"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <Mono className="mt-5 block text-dusk">Prepay discounts</Mono>
          <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
            <Field label="Pay-yearly discount">
              <NumInput
                value={discAnnual}
                onChange={setDiscAnnual}
                prefix="$"
                align="left"
              />
            </Field>
            <Field label="6-month discount">
              <NumInput
                value={discSemi}
                onChange={setDiscSemi}
                prefix="$"
                align="left"
              />
            </Field>
          </div>

          <Mono className="mt-5 block text-dusk">
            Catch-up bonus — free back-work done up front, recovered if they
            leave within 2 years
          </Mono>
          <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
            <Field label="Value per year of catch-up">
              <NumInput
                value={catchPer}
                onChange={setCatchPer}
                prefix="$"
                align="left"
              />
            </Field>
            <Field label="Years of catch-up">
              <NumInput value={catchYears} onChange={setCatchYears} align="left" />
            </Field>
            <Field label="Total bonus value">
              <div className="flex h-[42px] items-center rounded-[10px] border border-dashed border-magenta/40 bg-magenta/[0.06] px-3.5 font-mono text-[14px] font-bold tabular-nums text-magenta">
                {money(catchTotal)}
              </div>
            </Field>
          </div>
        </div>
      </Drawer>

      {/* ── payment plan ── */}
      <div className="mt-4">
        <Mono className="mb-2 block text-muted">Payment plan</Mono>
        <div className="grid gap-2 sm:grid-cols-3">
          {CADENCES.map((c) => {
            const on = cadence === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCadence(c.id)}
                className={`cursor-pointer rounded-[10px] border px-3.5 py-2.5 text-center transition-colors duration-150 ${
                  on
                    ? "border-transparent bg-grad font-semibold text-white"
                    : "border-edge-bright bg-panel-2 text-muted hover:border-magenta hover:text-fog"
                }`}
              >
                <span className="block text-[13.5px]">{c.label}</span>
                <span
                  className={`mt-0.5 block text-[11px] font-normal ${on ? "text-white/80" : "text-dusk"}`}
                >
                  {c.small}
                </span>
              </button>
            );
          })}
        </div>

        {/* the pill restating what the chosen plan costs */}
        <div className="mt-3 inline-block rounded-full border border-edge bg-panel-2 px-4 py-2 font-mono text-[12px] tabular-nums text-muted">
          <span className="font-bold text-magenta">{tierLabel}</span>
          {" · "}
          {cadence === "quarterly"
            ? `Quarterly · ${money(yearly / 4)} × 4 · ${money(yearly)}/yr`
            : cadence === "semi"
              ? `Every 6 months · ${money(yearly / 2)} × 2 · ${money(yearly)}/yr`
              : `Paid yearly · ${money(yearly)}/yr`}
          {cadence !== "quarterly" ? (
            <span className="text-teal">
              {" "}
              ({money(toNum(cadence === "annual" ? discAnnual : discSemi))} off)
            </span>
          ) : null}
        </div>
      </div>

      {/* ── the two dates ── */}
      <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
        <DateField label="When you joined" value={signDate} onChange={setSignDate} />
        <DateField
          label="Cancellation date"
          value={cancelDate}
          onChange={setCancelDate}
        />
      </div>

      {result.state !== "ok" ? (
        <div className="mt-5 rounded-[16px] border border-dashed border-white/12 px-6 py-14 text-center text-[13.5px] text-dusk">
          {result.state === "invalid"
            ? "The cancellation date needs to be after the join date."
            : "Pick both dates above to see the result."}
        </div>
      ) : (
        /* Two columns once there's an answer: the number and its shape on the
           left, the arithmetic and the script to read out on the right. */
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            {/* hero — refund, balance due, or a clean break */}
            <div
              className={`rounded-[20px] p-[2px] ${
                result.due > 0
                  ? "bg-gradient-to-br from-danger to-magenta"
                  : result.refund > 0
                    ? "bg-grad"
                    : "bg-edge-bright"
              }`}
            >
              <div className="rounded-[20px] bg-night px-6 py-7 text-center">
                <Mono className="tracking-[2px] text-muted">
                  {result.due > 0
                    ? "Balance still owed"
                    : result.refund > 0
                      ? "Money back to you"
                      : "All squared up"}
                </Mono>
                <div
                  className={`mt-1.5 font-display text-[52px] font-bold leading-none tracking-[-1.5px] tabular-nums ${
                    result.due > 0
                      ? "text-danger"
                      : result.refund > 0
                        ? "text-grad"
                        : "text-fog"
                  }`}
                >
                  {money(result.due > 0 ? result.due : result.refund)}
                </div>
                <p className="mt-2.5 text-[13.5px] text-muted">
                  {result.due > 0
                    ? "This covers work and catch-up bonus we delivered before you paid for it."
                    : result.refund > 0
                      ? `For the ${result.mosLeft.toFixed(1)} months left in your current year.`
                      : "Nothing owed either way — your payments match the work done."}
                </p>
              </div>
            </div>

            {/* 12-month timeline */}
            <div className="rounded-[16px] border border-edge bg-panel px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-muted">
                  Your current year with us
                </span>
                <span className="font-mono text-[12.5px] tabular-nums text-fog">
                  {result.mosUsed.toFixed(1)} of 12 months used
                </span>
              </div>
              <div className="mt-2.5 grid h-[30px] grid-cols-12 overflow-hidden rounded-[10px] border border-edge">
                {Array.from({ length: 12 }, (_, i) => (
                  <div
                    key={i}
                    className={`h-full border-r border-black/35 last:border-r-0 ${
                      i < Math.round(result.mosUsed) ? "bg-grad" : "bg-violet/25"
                    }`}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[11px] text-dusk">
                <span>{shortDate(result.yearStart)}</span>
                <span>{shortDate(result.yearEnd)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-[3px] bg-grad" />
                  Months we worked
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-[3px] bg-violet/25" />
                  Unused months
                </span>
              </div>
            </div>

            <KpiRow cols={3}>
              <Kpi label="Time with us" value={tenureLabel(result.totalMos)} />
              <Kpi
                label="Payments made this yr"
                value={`${result.instPaid} of ${result.installments}`}
              />
              <Kpi
                label="Catch-up bonus"
                value={money(catchTotal)}
                sub={result.clawback > 0 ? "recoverable — inside 2 years" : "waived — past 2 years"}
                tone={result.clawback > 0 ? "neg" : "pos"}
              />
            </KpiRow>
          </div>

          <div className="flex flex-col gap-5">
            {/* breakdown */}
            <Panel title="How we got there">
              <Mono className="block text-magenta">
                1 · Money you&rsquo;ve paid us
              </Mono>
              <LineRow
                label={
                  <>
                    Your payments this year{" "}
                    <span className="text-dusk">
                      ({result.instPaid} of {result.installments} payment
                      {result.installments > 1 ? "s" : ""})
                    </span>
                  </>
                }
                value={money(result.paid)}
              />

              <Mono className="mt-4 block text-magenta">
                2 · What you owe us for
              </Mono>
              <LineRow
                label={
                  <>
                    Bookkeeping we did{" "}
                    <span className="text-dusk">
                      ({result.mosUsed.toFixed(1)} mo × {money(result.rate)})
                    </span>
                  </>
                }
                value={money(result.worked)}
              />
              {result.clawback > 0 ? (
                <LineRow
                  label="Catch-up work, taken back since you're leaving early"
                  value={money(result.clawback)}
                />
              ) : null}
              <LineRow label="Total you owe us for" value={money(result.owed)} total />

              <p className="mt-4 rounded-[10px] bg-white/[0.03] px-4 py-3 text-[13.5px] leading-relaxed text-mist [&_b]:font-semibold [&_b]:text-fog">
                {result.due > 0 ? (
                  <>
                    You owe us for <b>{money(result.owed)}</b> so far, but
                    you&rsquo;ve only paid <b>{money(result.paid)}</b>. The
                    difference is what&rsquo;s left for you to pay us.
                  </>
                ) : result.refund > 0 ? (
                  <>
                    You&rsquo;ve paid <b>{money(result.paid)}</b>, but you only
                    owe us for <b>{money(result.owed)}</b>. The difference goes
                    back to you.
                  </>
                ) : (
                  <>
                    What you&rsquo;ve paid (<b>{money(result.paid)}</b>) and what
                    you owe us for (<b>{money(result.owed)}</b>) are the same —
                    so nothing is owed either way.
                  </>
                )}
              </p>

              <LineRow
                label={
                  result.due > 0
                    ? "Balance due (you pay us)"
                    : result.refund > 0
                      ? "Your refund (we pay you)"
                      : "All settled up"
                }
                value={money(result.due > 0 ? result.due : result.refund)}
                total
                size="lg"
                display
                tone={result.due > 0 ? "neg" : result.refund > 0 ? "brand" : undefined}
              />
            </Panel>

            {/* the script */}
            <div className="rounded-[16px] border border-edge bg-gradient-to-br from-magenta/[0.06] to-violet/[0.04] px-6 py-5">
              <h3 className="flex items-center gap-2.5 text-[14px] font-semibold text-fog">
                <span className="h-4 w-1 rounded-full bg-grad" />
                In plain terms
              </h3>
              <div className="mt-3 space-y-3 text-[14px] leading-[1.8] text-mist [&_b]:font-semibold [&_b]:text-fog">
                <PlainEnglish
                  r={result}
                  yearly={yearly}
                  cadence={cadence}
                  hasDiscount={cadence !== "quarterly"}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <Disclaimer>
        Pro-rated on whole and partial months from the anniversary of the join
        date; an installment counts as paid once its period starts. The catch-up
        bonus is recovered in full inside the first two contract years and
        waived from year three. Confirm against the signed agreement before
        committing to a figure.
      </Disclaimer>
    </div>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <Mono className="mb-2 block text-muted">{label}</Mono>
      <div className="flex h-[52px] items-center gap-2.5 rounded-[10px] border border-edge-mid bg-panel-2 px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-magenta focus-within:shadow-[0_0_0_3px_rgba(255,45,120,0.18)] [color-scheme:dark]">
        <svg
          aria-hidden
          className="h-5 w-5 flex-none text-magenta"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full cursor-pointer border-none bg-transparent font-mono text-[15px] text-fog outline-none"
        />
      </div>
    </label>
  );
}

const CADENCE_NAMES: Record<string, string> = {
  quarterly: "quarterly",
  semi: "every-6-months",
  annual: "paid-yearly",
};

/** Three scripts — balance due, refund, or a clean break. */
function PlainEnglish({
  r,
  yearly,
  cadence,
  hasDiscount,
}: {
  r: {
    sd: Date;
    cd: Date;
    contractYear: number;
    mosUsed: number;
    mosLeft: number;
    rate: number;
    installments: number;
    instPaid: number;
    paid: number;
    worked: number;
    clawback: number;
    refund: number;
    due: number;
  };
  yearly: number;
  cadence: string;
  hasDiscount: boolean;
}) {
  const joined = shortDate(r.sd);
  const cancelled = shortDate(r.cd);

  const opener = (
    <p>
      You joined on <b>{joined}</b> and are cancelling on <b>{cancelled}</b> —
      that&rsquo;s <b>{r.mosUsed.toFixed(1)} months</b> into your current year,
      with <b>{r.mosLeft.toFixed(1)}</b> left. You&rsquo;re on the{" "}
      <b>{CADENCE_NAMES[cadence]}</b> plan at <b>{money(yearly)}/year</b>
      {hasDiscount ? " (after the prepay discount)" : ""}, which works out to{" "}
      <b>{money(r.rate)}/month</b>.
    </p>
  );

  if (r.due > 0) {
    return (
      <>
        {opener}
        <p>
          So far you&rsquo;ve made{" "}
          <b>
            {r.instPaid} of {r.installments}
          </b>{" "}
          payment{r.installments > 1 ? "s" : ""} this year (
          <b>{money(r.paid)}</b>). But we&rsquo;ve already delivered{" "}
          <b>{money(r.worked)}</b> of monthly work
          {r.clawback > 0 ? (
            <>
              {" "}
              plus your <b>{money(r.clawback)}</b> catch-up bonus
            </>
          ) : null}
          .
        </p>
        <p>
          Because you&rsquo;re leaving early, that work is more than
          you&rsquo;ve paid so far — so instead of a refund, there&rsquo;s a{" "}
          <b>balance due of {money(r.due)}</b>. After two full years the
          catch-up bonus drops off entirely.
        </p>
      </>
    );
  }

  if (r.refund > 0) {
    return (
      <>
        {opener}
        <p>
          You&rsquo;ve paid <b>{money(r.paid)}</b> so far this year. We keep{" "}
          <b>{money(r.worked)}</b> for the months we worked
          {r.clawback > 0 ? (
            <>
              , plus your <b>{money(r.clawback)}</b> catch-up bonus
            </>
          ) : null}
          .
        </p>
        <p>
          That leaves a refund of <b>{money(r.refund)}</b> coming back to you.
          {r.contractYear <= 2
            ? " Once you pass two full years, the catch-up bonus goes away and you'd get every unused month back."
            : " You're past two years, so there's no catch-up deduction — thanks for being a long-term client."}
        </p>
      </>
    );
  }

  return (
    <>
      {opener}
      <p>
        You&rsquo;ve paid <b>{money(r.paid)}</b> so far this year, and the work
        we&rsquo;ve delivered
        {r.clawback > 0 ? " (including your catch-up bonus)" : ""} comes to the
        same amount.
      </p>
      <p>
        So it&rsquo;s a clean break — <b>no refund and nothing owed</b>.
      </p>
    </>
  );
}
