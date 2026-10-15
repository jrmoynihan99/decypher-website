"use client";

import Headline from "@/components/feedback/Headline";
import { BackButton, DoneMark, PrimaryButton } from "@/components/feedback/SurveyFrame";
import { glass, rowCls } from "@/components/feedback/survey-fx";
import {
  LINKS,
  SESSION_NAME,
  fmtDateAnswer,
  fmtMoney,
  label,
  named,
  nextCallSteps,
  parseDateStr,
  revenueText,
  short,
  type Counts,
  type DiscoveryCall,
  type ListKey,
} from "@/lib/discovery/schema";

/**
 * The end of the call, for a creator we can help: they qualify for the
 * strategy session, pick what it reviews (their own return opens TaxDome to
 * set up their account), see what happens on it, book it — and can open
 * "what we heard today" to check their answers back.
 */

const eyebrowCls = "m-0 mb-4 font-mono text-[11.5px] tracking-[0.12em] text-magenta";
const ledeCls = "fb-enter m-0 mb-2 max-w-[40ch] text-[16.5px] leading-relaxed text-mist";

export default function CallRecap({
  call,
  first,
  reviewChoice,
  onReview,
  onBook,
  onBack,
  onNew,
}: {
  call: DiscoveryCall;
  first: string;
  reviewChoice: string | null;
  onReview: (v: "return" | "example") => void;
  onBook: () => void;
  onBack: () => void;
  onNew: () => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <>
      <p className={eyebrowCls}>[ NEXT CALL ]</p>
      <Headline variant="hero" text={`I think we can help${first ? `, ${first}` : ""}.`} />

      <div className="fb-enter relative my-2 flex flex-col gap-1.5 overflow-hidden rounded-[18px] border border-teal/55 bg-[linear-gradient(135deg,rgba(61,214,196,.12),rgba(255,45,120,.14))] px-[22px] py-5 shadow-[0_0_40px_rgba(61,214,196,.18)]">
        <span className="font-mono text-[11px] tracking-[0.14em] text-teal">[ YOU QUALIFY FOR ]</span>
        <b className="font-display text-[clamp(1.45rem,5.4vw,2rem)] font-bold leading-[1.1] tracking-[-0.025em] text-fog">{SESSION_NAME}</b>
        <span className="text-[15px] text-muted">A private session with one of our co-founders.</span>
      </div>

      <h2 className="fb-enter mb-4 mt-[30px] max-w-[34ch] font-display text-[clamp(1.15rem,4vw,1.45rem)] font-semibold leading-[1.3] tracking-[-0.015em] text-fog">
        What should we review together?
      </h2>
      <div role="radiogroup" aria-label="What to review" className="fb-enter grid gap-2.5 sm:grid-cols-2">
        <a
          role="radio"
          aria-checked={reviewChoice === "return"}
          href={LINKS.taxdome}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onReview("return")}
          className={`${rowCls(reviewChoice === "return")} flex-col items-start justify-start gap-1.5 px-[18px] py-4 no-underline`}
        >
          <Badge sel={reviewChoice === "return"}>Most common</Badge>
          <span className="font-display text-[1.1rem] font-bold leading-[1.25] tracking-[-0.01em]">Your tax return</span>
          <span className="text-[0.84rem] leading-[1.4] text-muted">Improvements based on your actual return. Opens TaxDome to set up your account.</span>
        </a>
        <button
          type="button"
          role="radio"
          aria-checked={reviewChoice === "example"}
          onClick={() => onReview("example")}
          className={`${rowCls(reviewChoice === "example")} flex-col items-start justify-start gap-1.5 px-[18px] py-4`}
        >
          <span className="font-display text-[1.1rem] font-bold leading-[1.25] tracking-[-0.01em]">A creator example</span>
          <span className="text-[0.84rem] leading-[1.4] text-muted">We’ll walk you through a real creator’s return.</span>
        </button>
      </div>
      {reviewChoice === "return" ? (
        <p className="fb-enter m-0 mt-3 text-[14px] text-muted">
          TaxDome didn’t open?{" "}
          <a href={LINKS.taxdome} target="_blank" rel="noopener noreferrer" className="font-semibold text-magenta">
            Open it here
          </a>
          .
        </p>
      ) : null}

      <p className={`${ledeCls} mt-8`}>Here’s what happens in your session.</p>
      <ol className="fb-enter m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {nextCallSteps(reviewChoice).map((s, i) => (
          <li key={s} className={`grid grid-cols-[34px_1fr] items-baseline gap-2.5 rounded-[14px] px-4 py-3.5 ${glass}`}>
            <b className="font-mono text-[0.86rem] font-normal text-magenta">{pad(i + 1)}</b>
            <span className="text-[1.02rem] leading-[1.45] text-fog">{s}</span>
          </li>
        ))}
      </ol>
      <p className="fb-enter m-0 mt-4 max-w-[48ch] text-[15.5px] leading-[1.55] text-muted">
        If you’re interested by the end of that call, we’ll go over packages. We work with creators of all sizes, so there’s a
        package for each.
      </p>

      <div className="fb-enter mt-7">
        <PrimaryButton onClick={onBook} className="min-h-[58px] w-full text-[1.05rem]">
          Book your next call
        </PrimaryButton>
      </div>

      <Heard call={call} />

      <div className="fb-enter mt-6 flex flex-wrap justify-between gap-3">
        <BackButton onClick={onBack}>Change an answer</BackButton>
        <BackButton onClick={onNew}>Start a new call</BackButton>
      </div>
    </>
  );
}

/** The one automatic "not a fit": they don't file in the US. */
export function NotFit({ onBack, onNew }: { onBack: () => void; onNew: () => void }) {
  return (
    <>
      <DoneMark />
      <Headline variant="hero" text="Unfortunately, we can’t help." />
      <p className={ledeCls}>
        DeCypher only works with creators who file taxes in the United States. Thank you for taking the time to walk us through
        your business.
      </p>
      <div className="fb-enter mt-6 flex flex-wrap justify-between gap-3">
        <BackButton onClick={onBack}>Change an answer</BackButton>
        <BackButton onClick={onNew}>Start a new call</BackButton>
      </div>
    </>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

function Badge({ sel, children }: { sel: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.1em] ${sel ? "border-magenta text-magenta" : "border-teal/55 text-teal"}`}>
      {children}
    </span>
  );
}

type Row = [string, React.ReactNode] | null;

const when = (s: string | null) => (s ? fmtDateAnswer(parseDateStr(s)) : "");

function tags(items: string[]) {
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {items.map((t) => (
        <span key={t} className="rounded-full border border-white/10 px-2.5 py-[3px] text-[13px]">
          {t}
        </span>
      ))}
    </span>
  );
}

function countTags(c: Counts, list: ListKey, detail: string | null) {
  return tags(
    Object.entries(c).map(
      ([k, x]) => `${k === "other" ? detail || "Other" : short(list, k)} ${[x.b && `${x.b} biz`, x.p && `${x.p} personal`].filter(Boolean).join(" · ")}`,
    ),
  );
}

/** "What we heard today" — the creator's answers read back, closed by default. */
function Heard({ call: c }: { call: DiscoveryCall }) {
  const biz: Row[] = [
    c.entity ? ["Entity", label("entity", c.entity)] : null,
    c.llcFiled ? ["LLC filed", when(c.llcFiled)] : null,
    c.scorpElected ? ["S corp election", when(c.scorpElected)] : null,
    c.payroll ? ["Payroll", c.payroll === "yes" ? `Yes${c.payrollProvider ? `, ${named("payroll_provider", c.payrollProvider, c.payrollProviderDetail)}` : ""}` : "No"] : null,
    c.salary != null ? ["Salary", fmtMoney(c.salary)] : c.salaryUnsure ? ["Salary", "Not sure"] : null,
    c.partnershipFiled ? ["Partnership filed", when(c.partnershipFiled)] : null,
  ];
  const bank: Row[] = [
    Object.keys(c.banks).length ? ["Bank accounts", countTags(c.banks, "bank", c.banksDetail)] : null,
    c.cardsNone ? ["Credit cards", "None"] : Object.keys(c.cards).length ? ["Credit cards", countTags(c.cards, "issuers", c.cardsDetail)] : null,
    c.commingle ? ["Business and personal", short("commingle", c.commingle)] : null,
  ];
  const tax: Row[] = [
    c.filedPrior ? ["Prior-year return", c.filedPrior === "yes" ? "Filed" : c.filedPrior === "extension" ? "On extension" : "Not filed"] : null,
    c.filedHow ? ["Prepared with", named("filed_how", c.filedHow, c.filedHowDetail)] : null,
    c.totalTaxUnsure ? ["Total tax", "Not sure"] : null,
  ];
  const income: Row[] = [
    c.streams.length ? ["Income from", tags(c.streams.map((s) => label("streams", s)))] : null,
    revenueText(c.priorRevenueExact, c.priorRevenueBand) ? ["Prior year", revenueText(c.priorRevenueExact, c.priorRevenueBand)] : null,
    revenueText(c.revenueExact, c.revenueBand) ? ["Current year", revenueText(c.revenueExact, c.revenueBand)] : null,
    c.tracking.length ? ["Tracked in", tags(c.tracking.map((v) => (v === "other_tool" ? c.trackingDetail || "Other tool" : short("tracking", v))))] : null,
  ];
  const taxHero =
    c.totalTax != null ? (
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-3">
        <b className="font-mono text-[clamp(1.9rem,8vw,2.6rem)] font-normal tracking-[-0.03em] text-teal [text-shadow:0_0_28px_rgba(61,214,196,.45)]">{fmtMoney(c.totalTax)}</b>
        <span className="text-[14px] text-muted">total tax on your prior-year return</span>
      </div>
    ) : null;

  const cards = [
    ["YOUR BUSINESS", biz, null],
    ["BANKING", bank, null],
    ["TAXES", tax, taxHero],
    ["INCOME", income, null],
  ] as const;
  const any = cards.some(([, rows, pre]) => pre || rows.some(Boolean));
  if (!any) return null;

  return (
    <details className={`fb-enter mt-7 rounded-[14px] ${glass}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-[13px] font-mono text-[11.5px] tracking-[0.12em] text-magenta [&::-webkit-details-marker]:hidden">
        [ WHAT WE HEARD TODAY ]<span className="text-[1rem] text-muted">+</span>
      </summary>
      <div className="grid gap-2.5 px-2.5 pb-2.5">
        {cards.map(([title, rows, pre]) => {
          const shown = rows.filter((r): r is [string, React.ReactNode] => !!r);
          if (!shown.length && !pre) return null;
          return (
            <section key={title} className="rounded-[14px] border border-white/10 px-4 py-3.5">
              <h3 className="m-0 mb-2 font-mono text-[11px] font-normal tracking-[0.12em] text-magenta">[ {title} ]</h3>
              {pre}
              {shown.length ? (
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-[7px] text-[15px]">
                  {shown.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd className="m-0 text-right text-fog">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          );
        })}
      </div>
    </details>
  );
}
