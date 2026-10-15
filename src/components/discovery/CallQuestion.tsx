"use client";

import { useEffect, useState } from "react";
import { glass, rowCls } from "@/components/feedback/survey-fx";
import {
  LISTS,
  MONTHS,
  boolOf,
  countTotals,
  countsOf,
  currentYear,
  dateOf,
  listOf,
  numOf,
  strOf,
  type AnswerValue,
  type Answers,
  type Question,
} from "@/lib/discovery/schema";

/**
 * The answer controls for one discovery question, by type, in the feedback
 * survey's skin (the glass rows and squares of QuestionBody):
 *
 *   say      nothing to type — asked out loud, Fathom has the notes
 *   choice   numbered rows (digits pick them), or two big tiles for yes/no;
 *            an "other" answer opens a follow-up field
 *   multi    rows with a checkbox, pick all that apply
 *   date     month and year, or "not sure"
 *   counts   one row per bank or card issuer, a business and a personal count
 *   amount   a dollar figure, or "not sure"
 *   money    the same, under a strip of the real Form 1040 so the creator
 *            knows which line to read out
 *   revenue  an exact figure, or "not sure" and then a range
 */

export default function CallQuestion({
  q,
  A,
  onPick,
  onToggle,
  onSet,
  onMoney,
  onCount,
  onNone,
  onAdvance,
}: {
  q: Question;
  A: Answers;
  onPick: (v: string) => void;
  onToggle: (v: string) => void;
  onSet: (k: string, v: AnswerValue) => void;
  onMoney: (k: string, v: number | null) => void;
  onCount: (id: string, issuer: string, kind: "b" | "p", delta: number) => void;
  onNone: (id: string) => void;
  /** A control that stands in for a pick (a date's "not sure") asks to move on. */
  onAdvance: () => void;
}) {
  // On a desktop-width screen the cursor goes straight into a figure.
  useEffect(() => {
    if (!["amount", "money", "revenue"].includes(q.type)) return;
    if (window.matchMedia("(min-width: 700px)").matches) document.getElementById("dc-cash")?.focus({ preventScroll: true });
  }, [q.type, q.id]);

  if (q.type === "say") return null;

  if (q.type === "choice") {
    const a = strOf(A, q.id);
    const opts = q.options ?? [];
    if (q.tiles) {
      return (
        <div role="radiogroup" aria-label={questionLabel(q)} className="grid grid-cols-2 gap-2.5">
          {opts.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={a === v}
              onClick={() => onPick(v)}
              className={`${rowCls(a === v)} min-h-[104px] justify-center font-display text-[1.45rem] font-bold tracking-[-0.02em] max-[420px]:min-h-[84px] max-[420px]:text-[1.2rem]`}
            >
              {label}
            </button>
          ))}
        </div>
      );
    }
    return (
      <>
        <div role="radiogroup" aria-label={questionLabel(q)} className={`grid gap-2 ${opts.length > 6 ? "sm:grid-cols-2" : ""}`}>
          {opts.map(([v, label], i) => (
            <OptionRow key={v} n={i + 1} sel={a === v} badge={q.badges?.[v]} onClick={() => onPick(v)}>
              {label}
            </OptionRow>
          ))}
        </div>
        {q.reveal?.[a] ? <Reveal q={q} A={A} label={q.reveal[a]} onSet={onSet} /> : null}
      </>
    );
  }

  if (q.type === "multi") {
    const sel = listOf(A, q.id);
    const opts = q.options ?? [];
    const revealKey = q.reveal ? Object.keys(q.reveal).find((k) => sel.includes(k)) : undefined;
    return (
      <>
        <Hint>Pick all that apply</Hint>
        <div role="group" aria-label={questionLabel(q)} className={`grid gap-2 ${opts.length > 7 ? "sm:grid-cols-2" : ""}`}>
          {opts.map(([v, label]) => {
            const on = sel.includes(v);
            return (
              <button key={v} type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(v)} className={rowCls(on)}>
                <span
                  aria-hidden
                  className={`grid h-5 w-5 flex-none place-items-center rounded-[6px] border-[1.5px] transition-colors ${
                    on ? "border-magenta bg-magenta text-night" : "border-white/20 text-transparent"
                  }`}
                >
                  <Check />
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        {revealKey ? <Reveal q={q} A={A} label={q.reveal![revealKey]} onSet={onSet} /> : null}
      </>
    );
  }

  if (q.type === "date") {
    const d = dateOf(A, q.id);
    const set = (k: "m" | "y", v: string) => {
      const cur = { ...d };
      delete cur.unsure;
      cur[k] = v;
      onSet(q.id, cur);
    };
    const years = Array.from({ length: 21 }, (_, i) => String(currentYear() - i));
    const setCls = d.y && !d.unsure ? "border-teal/55" : "";
    return (
      <>
        <div className="grid max-w-[440px] grid-cols-[1.25fr_1fr] gap-2.5">
          <label>
            <Label>[ MONTH ]</Label>
            <select value={d.unsure ? "" : (d.m ?? "")} onChange={(e) => set("m", e.target.value)} aria-label="Month" className={`${selectCls} ${setCls}`} style={caret}>
              <option value="">Not sure</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, "0")}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Label>[ YEAR ]</Label>
            <select value={d.unsure ? "" : (d.y ?? "")} onChange={(e) => set("y", e.target.value)} aria-label="Year" className={`${selectCls} ${setCls}`} style={caret}>
              <option value="">Year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        <NotSure
          on={!!d.unsure}
          onClick={() => {
            const on = !d.unsure;
            onSet(q.id, on ? { unsure: true } : {});
            if (on) onAdvance();
          }}
        />
      </>
    );
  }

  if (q.type === "counts") return <CountsGrid q={q} A={A} onSet={onSet} onCount={onCount} onNone={onNone} />;

  if (q.type === "amount") {
    const un = boolOf(A, `${q.id}_unsure`);
    return (
      <>
        <Label htmlFor="dc-cash">[ {q.label?.toUpperCase()} ]</Label>
        <CashInput value={un ? null : numOf(A, q.id)} disabled={un} onChange={(n) => onMoney(q.id, n)} />
        <NotSure
          on={un}
          onClick={() => {
            onSet(`${q.id}_unsure`, !un);
            if (!un) onMoney(q.id, null);
          }}
        />
      </>
    );
  }

  if (q.type === "money") {
    const un = boolOf(A, "tax_unsure");
    const total = un ? null : numOf(A, "total_tax");
    return (
      <>
        <Form1040 value={total} />
        <Label htmlFor="dc-cash">
          [ TOTAL TAX <b className="font-normal text-magenta">{"// LINE 24"}</b> ]
        </Label>
        <CashInput value={total} disabled={un} onChange={(n) => onMoney("total_tax", n)} />
        <NotSure
          on={un}
          onClick={() => {
            onSet("tax_unsure", !un);
            if (!un) onMoney("total_tax", null);
          }}
        />
      </>
    );
  }

  // revenue
  const un = boolOf(A, `${q.id}_unsure`);
  const band = strOf(A, q.id);
  return (
    <>
      <Label htmlFor="dc-cash">[ {q.exactLabel?.(A).toUpperCase()} ]</Label>
      <CashInput value={un ? null : numOf(A, `${q.id}_exact`)} disabled={un} onChange={(n) => onMoney(`${q.id}_exact`, n)} />
      <NotSure
        on={un}
        onClick={() => {
          onSet(`${q.id}_unsure`, !un);
          if (!un) onMoney(`${q.id}_exact`, null);
          else onSet(q.id, null);
        }}
      />
      {un ? (
        <>
          <p className="mb-3 mt-[22px] font-mono text-[11px] tracking-[0.12em] text-muted">Roughly where does it land?</p>
          <div role="radiogroup" aria-label="Revenue range" className="grid gap-2 sm:grid-cols-2">
            {LISTS.revenue.map(([v, label], i) => (
              <OptionRow key={v} n={i + 1} sel={band === v} onClick={() => onPick(v)}>
                {label}
              </OptionRow>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

const questionLabel = (q: Question) => (typeof q.text === "string" ? q.text : q.id);

const inputCls = `w-full rounded-[12px] px-3.5 py-[13px] font-body text-[15.5px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,.14)] ${glass}`;

const selectCls = `w-full cursor-pointer appearance-none rounded-[12px] py-[14px] pl-3.5 pr-9 font-body text-[16px] text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,.14)] ${glass}`;

const caret: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' stroke='%239C98A8' stroke-width='1.6'%3E%3Cpath d='M1 1l4 4 4-4'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
};

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="-mt-4 mb-4 font-mono text-[11px] tracking-[0.12em] text-muted">{children}</p>;
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block font-mono text-[11px] tracking-[0.12em] text-muted">
      {children}
    </label>
  );
}

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** A numbered answer row — digits on a keyboard pick them. */
function OptionRow({
  n,
  sel,
  badge,
  onClick,
  children,
}: {
  n: number;
  sel: boolean;
  badge?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" role="radio" aria-checked={sel} onClick={onClick} className={rowCls(sel)}>
      <span className={`w-[1.4em] flex-none font-mono text-[14px] ${sel ? "text-magenta" : "text-muted"}`}>{n}</span>
      <span>{children}</span>
      {badge ? (
        <span
          className={`ml-auto flex-none rounded-full border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.1em] ${
            sel ? "border-magenta text-magenta" : "border-teal/55 text-teal"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/** The follow-up an "other" answer opens: "Who referred you?", "Which bank?". */
function Reveal({ q, A, label, onSet }: { q: Question; A: Answers; label: string; onSet: (k: string, v: AnswerValue) => void }) {
  const k = `${q.id}_detail`;
  return (
    <div className="mt-4">
      <Label htmlFor="dc-reveal">[ {label.toUpperCase()} ]</Label>
      <input id="dc-reveal" data-reveal type="text" autoComplete="off" value={strOf(A, k)} onChange={(e) => onSet(k, e.target.value)} className={inputCls} />
    </div>
  );
}

function NotSure({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-[9px] font-body text-[14.5px] transition-colors ${
        on ? "border-magenta bg-magenta/[0.14] text-fog" : `${glass} text-muted hover:border-magenta/50`
      }`}
    >
      {on ? <Check /> : null} Not sure
    </button>
  );
}

const parseMoney = (s: string): number | null => {
  const v = s.replace(/[$,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  return !Number.isFinite(n) || n < 0 ? null : Math.round(n);
};

/**
 * "$ 12,400" — big, mono. What's typed stays as typed and groups on blur, as
 * the original did; the parent holds the number. Keyed per question by the
 * screen, so the text never carries over.
 */
function CashInput({ value, disabled, onChange }: { value: number | null; disabled: boolean; onChange: (n: number | null) => void }) {
  const [text, setText] = useState(() => (value != null ? value.toLocaleString("en-US") : ""));
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-[15px] top-1/2 z-[2] -translate-y-1/2 font-mono text-[1.3rem] text-muted">
        $
      </span>
      <input
        id="dc-cash"
        data-money
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        disabled={disabled}
        value={disabled ? "" : text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoney(e.target.value));
        }}
        onBlur={() => {
          const n = parseMoney(text);
          setText(n != null ? n.toLocaleString("en-US") : "");
        }}
        className={`w-full rounded-[12px] py-[13px] pl-9 pr-3.5 font-mono text-[1.45rem] tracking-[-0.01em] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,.14)] disabled:cursor-not-allowed disabled:opacity-35 ${glass}`}
      />
    </div>
  );
}

/** One row per bank or card company, with a business and a personal count (3 Amex, 1 Chase, 1 Capital One…). */
function CountsGrid({
  q,
  A,
  onSet,
  onCount,
  onNone,
}: {
  q: Question;
  A: Answers;
  onSet: (k: string, v: AnswerValue) => void;
  onCount: (id: string, issuer: string, kind: "b" | "p", delta: number) => void;
  onNone: (id: string) => void;
}) {
  const c = countsOf(A, q.id);
  const none = boolOf(A, `${q.id}_none`);
  const tot = countTotals(c);
  const list = q.list ? LISTS[q.list] : [];
  const other = !!(c.other && (c.other.b || c.other.p));
  const cols = "grid grid-cols-[1fr_112px_112px] items-center gap-2.5 max-[440px]:grid-cols-[1fr_92px_92px] max-[440px]:gap-1.5";

  const stepper = (issuer: string, label: string, kind: "b" | "p") => {
    const n = c[issuer]?.[kind] ?? 0;
    const what = `${label} ${kind === "b" ? "business" : "personal"} ${q.unit}`;
    return (
      <div
        className={`grid h-[38px] grid-cols-[34px_1fr_34px] items-center overflow-hidden rounded-[10px] border transition-colors max-[440px]:grid-cols-[28px_1fr_28px] ${
          n ? "border-magenta bg-magenta/[0.14]" : "border-white/10"
        }`}
      >
        <button type="button" aria-label={`One fewer ${what}`} disabled={!n} onClick={() => onCount(q.id, issuer, kind, -1)} className={stepBtn}>
          −
        </button>
        <b aria-live="polite" className={`text-center font-mono text-[15px] font-normal ${n ? "text-magenta" : "text-fog"}`}>
          {n}
        </b>
        <button type="button" aria-label={`One more ${what}`} onClick={() => onCount(q.id, issuer, kind, 1)} className={stepBtn}>
          +
        </button>
      </div>
    );
  };

  return (
    <>
      <div className={`overflow-hidden rounded-[14px] transition-opacity ${glass} ${none ? "opacity-40" : ""}`}>
        <div className={`${cols} px-4 pb-2 pt-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted max-[440px]:px-2.5`}>
          <span>{q.col}</span>
          <span className="text-center">Business</span>
          <span className="text-center">Personal</span>
        </div>
        {list.map(([v, label]) => (
          <div key={v} className={`${cols} min-h-[50px] border-t border-white/10 px-4 py-1.5 text-[15px] text-fog max-[440px]:px-2.5 max-[440px]:text-[13.5px]`}>
            <span>{label}</span>
            {stepper(v, label, "b")}
            {stepper(v, label, "p")}
          </div>
        ))}
      </div>
      {other ? <Reveal q={q} A={A} label={q.otherLabel ?? "Which?"} onSet={onSet} /> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted">{`[ ${tot.b} BUSINESS // ${tot.p} PERSONAL ]`}</span>
        {q.noneLabel ? (
          <button
            type="button"
            aria-pressed={none}
            onClick={() => onNone(q.id)}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-[9px] font-body text-[14.5px] transition-colors ${
              none ? "border-magenta bg-magenta/[0.14] text-fog" : `${glass} text-muted hover:border-magenta/50`
            }`}
          >
            {none ? <Check /> : null} {q.noneLabel}
          </button>
        ) : null}
      </div>
    </>
  );
}

const stepBtn =
  "h-full cursor-pointer border-0 bg-transparent text-[1.15rem] leading-none text-muted transition-colors hover:bg-magenta/[0.14] hover:text-fog disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted";

/**
 * The paper strip mirrors the real Form 1040 (lines 22–24) and fills in line
 * 24 as the figure is typed, so the creator reading their return knows which
 * number we mean. Paper colours on purpose — it's a facsimile, not chrome.
 */
function Form1040({ value }: { value: number | null }) {
  const row = (n: string, lg: React.ReactNode, sh: React.ReactNode, hot: boolean) => (
    <div
      className={`relative grid min-h-[33px] grid-cols-[24px_1fr_30px_minmax(96px,auto)] items-stretch gap-x-2 border-b border-[#DAD6DE] max-[520px]:grid-cols-[20px_1fr_26px_minmax(84px,auto)] max-[520px]:text-[0.78rem] ${
        hot ? "rounded-[3px] bg-[rgba(255,29,142,.05)] shadow-[inset_0_0_0_2px_#FF1D8E]" : "text-[#9A95A0]"
      }`}
    >
      <span className="flex items-center pl-1 font-bold">{n}</span>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        <em className="overflow-hidden text-ellipsis not-italic max-[520px]:hidden">{lg}</em>
        <em className="hidden overflow-hidden text-ellipsis not-italic max-[520px]:inline">{sh}</em>
        <i className="min-w-3 flex-1 translate-y-1 border-b-[1.5px] border-dotted border-[#A7A2AD]" />
      </span>
      <span className={`flex items-center justify-center border-x font-bold ${hot ? "border-[#17141C]" : "border-[#C9C4CE]"}`}>{n}</span>
      <span
        className={`flex items-center justify-end pr-0.5 font-mono text-[0.95rem] tracking-[0.02em] max-[520px]:text-[0.86rem] ${
          hot ? (value != null ? "font-bold text-[#D6106F]" : "text-[#B9B4BF]") : ""
        }`}
      >
        {hot ? (value != null ? `${value.toLocaleString("en-US")}.` : "—") : ""}
      </span>
    </div>
  );
  return (
    <div
      aria-hidden
      className="mb-[22px] overflow-hidden rounded-[12px] bg-white px-3 pb-2 pt-2.5 font-[Helvetica,Arial,sans-serif] text-[0.84rem] leading-[1.25] text-[#17141C] shadow-[0_12px_30px_rgba(10,10,14,.28)]"
    >
      <div className="flex items-baseline justify-between border-b-2 border-[#17141C] pb-1.5 text-[0.72rem] text-[#5b5662]">
        <b className="text-[0.8rem] text-[#17141C]">Form 1040 · prior year</b>
        <span>Page 2 · Tax and Credits</span>
      </div>
      {row("22", "Subtract line 21 from line 18", "Line 18 minus 21", false)}
      {row("23", "Other taxes, including self-employment tax", "Other taxes, incl. SE tax", false)}
      {row(
        "24",
        <>
          Add lines 22 and 23. This is your <b>total tax</b>
        </>,
        <>
          Your <b>total tax</b>
        </>,
        true,
      )}
    </div>
  );
}
