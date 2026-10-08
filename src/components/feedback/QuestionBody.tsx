"use client";

import { useEffect, useRef } from "react";
import type { Question } from "@/lib/feedback/schema";
import { MAGENTA, TEAL, mixRgb } from "./survey-fx";

/**
 * The answer controls for one question, by type:
 *
 *   scale    labelled rows, 1 to 5
 *   squares  five big squares, the two ends captioned under them
 *   nps      0–10; a pick lights the scale from magenta up to teal, so a 9
 *            reads as "most of the way to teal" before the number does
 *   choice   labelled rows
 *   text     a textarea, optional or "in your own words"
 *
 * Frosted only from md up: a backdrop blur on a phone re-blurs every frame
 * the page scrolls, for a look nobody can see at that size.
 */

const glass = "border border-white/10 bg-white/[0.035] md:backdrop-blur-[6px]";

const rowCls = (sel: boolean) =>
  `flex min-h-[58px] w-full cursor-pointer items-center gap-3.5 rounded-[12px] px-4 py-3 text-left font-body text-[15.5px] text-fog transition-[border-color,background-color,box-shadow] duration-150 ${
    sel
      ? "border border-magenta bg-magenta/[0.14] shadow-[0_0_0_1px_#ff2d78,0_0_26px_rgba(255,45,120,.28)]"
      : `${glass} hover:border-magenta/50`
  }`;

export default function QuestionBody({
  q,
  value,
  onPick,
  onText,
}: {
  q: Question;
  value: number | string | undefined;
  onPick: (v: number | string) => void;
  onText: (v: string) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // On a desktop-width screen the cursor goes straight into a written answer.
  useEffect(() => {
    if (q.type === "text" && window.matchMedia("(min-width: 700px)").matches) taRef.current?.focus();
  }, [q.type]);

  const optional = q.optional && q.type === "scale" ? <Hint>Optional</Hint> : null;

  if (q.type === "squares") {
    const [lo, hi] = q.ends ?? ["", ""];
    return (
      <>
        <div role="radiogroup" aria-label={q.text} className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((v) => {
            const sel = value === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={sel}
                aria-label={`${v}${v === 1 ? ` – ${lo}` : ""}${v === 5 ? ` – ${hi}` : ""}`}
                onClick={() => onPick(v)}
                className={`aspect-[1/.95] cursor-pointer rounded-[14px] font-display text-[1.7rem] font-bold tracking-[-0.03em] transition-[border-color,background-color,color,box-shadow,transform] duration-200 ${
                  sel
                    ? "fb-sel -translate-y-[3px] border border-magenta bg-magenta text-night shadow-[0_0_30px_rgba(255,45,120,.5)]"
                    : `${glass} text-fog hover:border-magenta/50`
                }`}
              >
                {v}
              </button>
            );
          })}
        </div>
        <Ends lo={`1 · ${lo}`} hi={`5 · ${hi}`} />
      </>
    );
  }

  if (q.type === "choice") {
    return (
      <div role="radiogroup" aria-label={q.text} className="flex flex-col gap-2">
        {(q.options ?? []).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(v)} className={rowCls(value === v)}>
            <span>{label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (q.type === "scale") {
    return (
      <>
        {optional}
        <div role="radiogroup" aria-label={q.text} className="flex flex-col gap-2">
          {(q.labels ?? []).map((label, i) => {
            const v = i + 1;
            const sel = value === v;
            return (
              <button key={v} type="button" role="radio" aria-checked={sel} onClick={() => onPick(v)} className={rowCls(sel)}>
                <span className={`w-[1.4em] flex-none font-mono text-[14px] ${sel ? "text-magenta" : "text-muted"}`}>{v}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (q.type === "nps") {
    const [lo, hi] = q.ends ?? ["", ""];
    const picked = typeof value === "number" ? value : -1;
    return (
      <>
        <div role="radiogroup" aria-label={q.text} className="grid grid-cols-6 gap-1.5 min-[441px]:grid-cols-11">
          {Array.from({ length: 11 }, (_, v) => {
            const lit = v <= picked;
            const sel = v === picked;
            const c = lit ? `rgb(${mixRgb(MAGENTA, TEAL, v / 10)})` : undefined;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={sel}
                aria-label={`${v}${v === 0 ? ` – ${lo}` : ""}${v === 10 ? ` – ${hi}` : ""}`}
                onClick={() => onPick(v)}
                style={lit ? { background: c, boxShadow: sel ? `0 0 26px ${c}` : undefined } : undefined}
                className={`aspect-square cursor-pointer rounded-[10px] p-0 font-display text-[1.1rem] font-bold transition-[background-color,border-color,color,box-shadow,transform] duration-200 min-[441px]:aspect-[1/1.2] ${
                  lit ? "border border-transparent text-night" : `${glass} text-fog hover:border-teal/50`
                } ${sel ? "fb-sel -translate-y-1" : ""}`}
              >
                {v}
              </button>
            );
          })}
        </div>
        <Ends lo={`0 · ${lo}`} hi={`10 · ${hi}`} />
      </>
    );
  }

  // text
  return (
    <>
      <Hint>{q.required ? "In your own words" : "Optional"}</Hint>
      <textarea
        ref={taRef}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onText(e.target.value)}
        placeholder={q.placeholder}
        aria-label={q.text}
        aria-required={q.required || undefined}
        maxLength={2000}
        className={`min-h-[124px] w-full resize-y rounded-[12px] px-3.5 py-[13px] font-body text-[15.5px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,.14)] ${glass}`}
      />
    </>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="-mt-4 mb-4 font-mono text-[11px] tracking-[0.12em] text-muted">{children}</p>;
}

function Ends({ lo, hi }: { lo: string; hi: string }) {
  return (
    <div className="mt-3 flex justify-between gap-4 text-[13px] text-muted">
      <span>{lo}</span>
      <span className="text-right">{hi}</span>
    </div>
  );
}
