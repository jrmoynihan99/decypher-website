"use client";

/**
 * Cancellation refund calculator.
 *
 * Run on a call with a client who's leaving: pick the two dates and the tool
 * says what comes back and, more usefully, *why* — the plain-English block at
 * the bottom is the script. Plan pricing sits in a collapsed drawer so staff
 * can set it before the call without it dominating the screen.
 *
 * The rule it encodes: we keep the months we worked in the current contract
 * year, refund the rest, and in years 1 and 2 also keep the one-time
 * onboarding fee. From year 3 the onboarding deduction goes away entirely.
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

const PLANS = [
  { id: "core", label: "Core", fee: 12000 },
  { id: "creator", label: "Creator", fee: 17000 },
  { id: "csuite", label: "C-suite", fee: 30000 },
] as const;

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

export default function RefundCalculator() {
  const [setupOpen, setSetupOpen] = useState(false);
  const [plan, setPlan] = useState<string>("core");
  const [fee1, setFee1] = useState("12000");
  const [fee2, setFee2] = useState("12000");
  const [fee3, setFee3] = useState("12000");
  const [onboarding, setOnboarding] = useState("5000");
  const [signDate, setSignDate] = useState("");
  const [cancelDate, setCancelDate] = useState("");

  const applyPlan = (id: string, fee: number) => {
    setPlan(id);
    const v = String(fee);
    setFee1(v);
    setFee2(v);
    setFee3(v);
  };

  // Editing a fee by hand means the preset no longer describes the numbers.
  const editFee = (set: (v: string) => void) => (v: string) => {
    setPlan("");
    set(v);
  };

  const result = useMemo(() => {
    if (!signDate || !cancelDate) return { state: "empty" as const };
    const sd = new Date(`${signDate}T00:00:00`);
    const cd = new Date(`${cancelDate}T00:00:00`);
    if (cd < sd) return { state: "invalid" as const };

    const totalMos = monthsBetween(sd, cd);
    const contractYear = Math.floor(totalMos / 12) + 1;
    const feeForYear = [fee1, fee2, fee3][Math.min(contractYear, 3) - 1];
    const fee = toNum(feeForYear);

    const mosUsed = totalMos - (contractYear - 1) * 12;
    const mosLeft = Math.max(0, 12 - mosUsed);

    const rate = fee / 12;
    const onboardingFee = toNum(onboarding);
    // Onboarding is only deducted while the client is inside their first two years.
    const onboardingDue = contractYear <= 2 ? onboardingFee : 0;

    const worked = mosUsed * rate;
    const proRata = mosLeft * rate;
    const net = Math.max(0, proRata - onboardingDue);

    const yearStart = addYears(sd, contractYear - 1);
    const yearEnd = new Date(addYears(sd, contractYear).getTime() - 86400000);

    return {
      state: "ok" as const,
      sd,
      cd,
      totalMos,
      contractYear,
      fee,
      rate,
      mosUsed,
      mosLeft,
      onboardingFee,
      onboardingDue,
      worked,
      net,
      yearStart,
      yearEnd,
    };
  }, [signDate, cancelDate, fee1, fee2, fee3, onboarding]);

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
            <Mono className="text-dusk">Plan preset</Mono>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPlan(p.id, p.fee)}
                className={`cursor-pointer rounded-[10px] border px-3.5 py-2 text-[13px] transition-colors duration-150 ${
                  plan === p.id
                    ? "border-transparent bg-grad font-semibold text-white"
                    : "border-edge-bright text-muted hover:border-magenta hover:text-fog"
                }`}
              >
                {p.label} — {money(p.fee)}
              </button>
            ))}
          </div>

          <Mono className="mt-5 block text-dusk">
            Annual contract value by year
          </Mono>
          <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
            <Field label="Year 1">
              <NumInput value={fee1} onChange={editFee(setFee1)} prefix="$" align="left" />
            </Field>
            <Field label="Year 2">
              <NumInput value={fee2} onChange={editFee(setFee2)} prefix="$" align="left" />
            </Field>
            <Field label="Year 3+">
              <NumInput value={fee3} onChange={editFee(setFee3)} prefix="$" align="left" />
            </Field>
          </div>

          <div className="mt-4 max-w-[220px]">
            <Field
              label="One-time onboarding fee"
              hint="Deducted in years 1 and 2 only"
            >
              <NumInput
                value={onboarding}
                onChange={setOnboarding}
                prefix="$"
                align="left"
              />
            </Field>
          </div>
        </div>
      </Drawer>

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
            : "Pick both dates above to see the refund."}
        </div>
      ) : (
        /* Two columns once there's an answer: the number and its shape on the
           left, the arithmetic and the script to read out on the right. */
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            {/* hero */}
            <div className="rounded-[20px] bg-grad p-[2px]">
              <div className="rounded-[20px] bg-night px-6 py-7 text-center">
                <Mono className="tracking-[2px] text-muted">
                  Money back to you
                </Mono>
                <div className="mt-1.5 font-display text-[52px] font-bold leading-none tracking-[-1.5px] tabular-nums text-grad">
                  {money(result.net)}
                </div>
                <p className="mt-2.5 text-[13.5px] text-muted">
                  {result.net > 0
                    ? `For the ${result.mosLeft.toFixed(1)} months left in your current contract year.`
                    : result.onboardingDue > 0
                      ? "The months we worked plus the one-time onboarding use up this year's payment."
                      : "This contract year is fully used."}
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
                  Months we worked (kept)
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-[3px] bg-violet/25" />
                  Unused (refundable)
                </span>
              </div>
            </div>

            <KpiRow cols={3}>
              <Kpi label="Time with us" value={tenureLabel(result.totalMos)} />
              <Kpi
                label="Months left this yr"
                value={`${result.mosLeft.toFixed(1)} mo`}
              />
              <Kpi
                label="Onboarding fee"
                value={result.onboardingDue > 0 ? "Applies" : "Waived"}
                tone={result.onboardingDue > 0 ? "neg" : "pos"}
              />
            </KpiRow>
          </div>

          <div className="flex flex-col gap-5">
            {/* breakdown */}
            <Panel title="How we got there">
              <LineRow label="You paid for this year" value={money(result.fee)} />
              <LineRow
                label={
                  <>
                    Months we worked{" "}
                    <span className="text-dusk">
                      ({result.mosUsed.toFixed(1)} mo × {money(result.rate)})
                    </span>
                  </>
                }
                value={`− ${money(result.worked)}`}
                tone="neg"
              />
              {result.onboardingDue > 0 ? (
                <LineRow
                  label="One-time onboarding (already done)"
                  value={`− ${money(result.onboardingFee)}`}
                  tone="neg"
                />
              ) : null}
              <LineRow
                label="Your refund"
                value={money(result.net)}
                total
                size="lg"
                display
                tone="brand"
              />
            </Panel>

            {/* the script */}
            <div className="rounded-[16px] border border-edge bg-gradient-to-br from-magenta/[0.06] to-violet/[0.04] px-6 py-5">
              <h3 className="flex items-center gap-2.5 text-[14px] font-semibold text-fog">
                <span className="h-4 w-1 rounded-full bg-grad" />
                In plain terms
              </h3>
              <div className="mt-3 space-y-3 text-[14px] leading-[1.8] text-mist [&_b]:font-semibold [&_b]:text-fog">
                <PlainEnglish r={result} />
              </div>
            </div>
          </div>
        </div>
      )}

      <Disclaimer>
        Pro-rated on whole and partial months from the anniversary of the join
        date. Onboarding is deducted inside the first two contract years only.
        Confirm against the signed agreement before committing to a figure.
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

/** Three scripts, picked by whether onboarding applies and whether anything is owed. */
function PlainEnglish({
  r,
}: {
  r: {
    sd: Date;
    cd: Date;
    mosUsed: number;
    mosLeft: number;
    totalMos: number;
    fee: number;
    worked: number;
    net: number;
    onboardingFee: number;
    onboardingDue: number;
  };
}) {
  const joined = shortDate(r.sd);
  const cancelled = shortDate(r.cd);

  if (r.onboardingDue > 0 && r.net > 0) {
    return (
      <>
        <p>
          You joined DeCypher on <b>{joined}</b> and are cancelling on{" "}
          <b>{cancelled}</b>. That&rsquo;s <b>{r.mosUsed.toFixed(1)} months</b>{" "}
          into your current year, with <b>{r.mosLeft.toFixed(1)} months</b> left.
        </p>
        <p>
          You paid <b>{money(r.fee)}</b> for the year. We keep{" "}
          <b>{money(r.worked)}</b> for the months we worked, plus your one-time{" "}
          <b>{money(r.onboardingFee)}</b> onboarding — the setup work we did
          before your regular service started.
        </p>
        <p>
          That leaves a refund of <b>{money(r.net)}</b>. After your first two
          years the onboarding fee goes away completely — you&rsquo;d get every
          unused month back.
        </p>
      </>
    );
  }

  if (r.onboardingDue > 0) {
    return (
      <>
        <p>
          You joined on <b>{joined}</b> and are cancelling on <b>{cancelled}</b>{" "}
          — <b>{r.mosUsed.toFixed(1)} months</b> into your current year.
        </p>
        <p>
          The <b>{money(r.worked)}</b> for months worked plus your one-time{" "}
          <b>{money(r.onboardingFee)}</b> onboarding fee add up to what
          you&rsquo;ve already paid this year, so there&rsquo;s{" "}
          <b>no refund due</b>. Nothing extra is owed, either.
        </p>
        <p>
          Good to know: after two full years with us, the onboarding fee is
          waived entirely.
        </p>
      </>
    );
  }

  return (
    <>
      <p>
        You joined on <b>{joined}</b> and are cancelling on <b>{cancelled}</b> —
        you&rsquo;ve been with us <b>{tenureLabel(r.totalMos)}</b>.
      </p>
      <p>
        Because you&rsquo;re past your first two years, there&rsquo;s{" "}
        <b>no onboarding deduction</b>. We simply keep <b>{money(r.worked)}</b>{" "}
        for the {r.mosUsed.toFixed(1)} months we worked this year and refund the
        rest.
      </p>
      <p>
        Your refund is <b>{money(r.net)}</b> for the {r.mosLeft.toFixed(1)}{" "}
        unused months. Thanks for being a long-term client.
      </p>
    </>
  );
}
