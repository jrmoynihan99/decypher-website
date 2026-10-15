"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { PrimaryButton } from "@/components/feedback/SurveyFrame";
import { glass, rowCls } from "@/components/feedback/survey-fx";
import { LINKS, LISTS, flagCopy, strOf, type Answers, type DialogKey, type FlagKey } from "@/lib/discovery/schema";

/**
 * The call's pop-ups, over the survey: a red flag or a recommendation after
 * an answer (one-line title, a sentence or two — scannable on a screen
 * share), the credit-card points question with the masterclass link, and
 * the "who decides?" question before the calendar opens. Portalled to <body>
 * so the frame's stacking context can't trap them.
 */
export default function CallDialog({
  kind,
  A,
  onOk,
  onPoints,
  onCopyMasterclass,
  onCopyGuide,
  onDecider,
  onDeciderWho,
  onBook,
  onCancel,
}: {
  kind: DialogKey;
  A: Answers;
  /** Got it / Continue — closes and moves to the next question. */
  onOk: () => void;
  onPoints: (v: "yes" | "no") => void;
  onCopyMasterclass: () => void;
  onCopyGuide: () => void;
  onDecider: (v: string) => void;
  onDeciderWho: (v: string) => void;
  /** The Calendly link was clicked. */
  onBook: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(() => document.getElementById("dc-dialog-ok")?.focus(), 30);
    return () => clearTimeout(t);
  }, [kind, A.points, A.decider]);

  let body: React.ReactNode;
  let tone: "red" | "mint" = "mint";

  if (kind === "points") {
    const yes = A.points === "yes";
    body = (
      <>
        <Eyebrow tone="mint">[ QUICK QUESTION ]</Eyebrow>
        <Title>Big into credit card points? Want to travel for free?</Title>
        {yes ? (
          <LinkOffer label="Here’s our free credit card masterclass." url={LINKS.masterclass} onCopy={onCopyMasterclass} onContinue={onOk} />
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-2.5">
            <PrimaryButton onClick={() => onPoints("yes")}>
              <span id="dc-dialog-ok">Yes</span>
            </PrimaryButton>
            <GhostButton onClick={() => onPoints("no")}>Not really</GhostButton>
          </div>
        )}
      </>
    );
  } else if (kind === "decider") {
    const d = strOf(A, "decider");
    body = (
      <>
        <Eyebrow tone="mint">[ BEFORE YOU BOOK ]</Eyebrow>
        <h2 className="m-0 mb-3.5 font-display text-[1.2rem] font-bold leading-[1.3] tracking-[-0.015em] text-fog">
          Is there anyone you want to include on the call that will be helping you make the decision, or are you the final
          decision maker?
        </h2>
        <div role="radiogroup" aria-label="Who decides" className="grid gap-2">
          {LISTS.decider.map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={d === v} onClick={() => onDecider(v)} className={rowCls(d === v)}>
              <span>{label}</span>
            </button>
          ))}
        </div>
        {d === "others" ? (
          <div className="mt-4">
            <label htmlFor="dc-decider-who" className="mb-2 block font-mono text-[11px] tracking-[0.12em] text-muted">
              [ WHO SHOULD BE ON THE CALL? ]
            </label>
            <input
              id="dc-decider-who"
              type="text"
              autoComplete="off"
              placeholder="Name, and who they are (spouse, manager…)"
              value={strOf(A, "decider_who")}
              onChange={(e) => onDeciderWho(e.target.value)}
              className={inputCls}
            />
            <p className="mb-0 mt-2.5 text-[14px] text-muted">Bring them to the call, and add them to the invite when you book.</p>
          </div>
        ) : null}
        <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
          {d ? (
            <a
              id="dc-dialog-ok"
              href={LINKS.calendly}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onBook}
              className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-magenta px-6 font-display text-[15.5px] font-semibold text-night no-underline shadow-[0_0_30px_rgba(255,45,120,.38)] transition-[filter] hover:brightness-110"
            >
              Book your next call
            </a>
          ) : (
            <PrimaryButton disabled onClick={() => {}}>
              Book your next call
            </PrimaryButton>
          )}
          <LinkButton onClick={onCancel}>Cancel</LinkButton>
        </div>
      </>
    );
  } else {
    const f = flagCopy(kind as FlagKey);
    tone = f.eyebrow === "Red flag" ? "red" : "mint";
    body = (
      <>
        <Eyebrow tone={tone}>[ {f.eyebrow.toUpperCase()} ]</Eyebrow>
        <Title>{f.title}</Title>
        {f.body.map((p) => (
          <p key={p} className="m-0 mb-3 text-[0.97rem] leading-[1.55] text-muted">
            {p}
          </p>
        ))}
        {f.good ? <p className="m-0 mb-3 text-[0.97rem] font-medium leading-[1.55] text-fog">{f.good}</p> : null}
        {f.guide ? (
          <LinkOffer label="Here’s our write-off guide." url={LINKS[f.guide]} onCopy={onCopyGuide} onContinue={onOk} />
        ) : (
          <PrimaryButton onClick={onOk} className="mt-2">
            <span id="dc-dialog-ok">Got it</span>
          </PrimaryButton>
        )}
      </>
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-night/60 p-5 backdrop-blur-[4px] max-[760px]:items-start"
    >
      <div
        className={`fb-enter w-full max-w-[480px] rounded-[18px] border bg-panel px-6 pb-[22px] pt-6 ${
          tone === "red"
            ? "border-magenta shadow-[0_20px_60px_rgba(0,0,0,.5),0_0_60px_rgba(255,45,120,.3)]"
            : "border-teal shadow-[0_20px_60px_rgba(0,0,0,.5),0_0_60px_rgba(61,214,196,.22)]"
        }`}
      >
        {body}
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

const inputCls = `w-full rounded-[12px] px-3.5 py-[13px] font-body text-[15.5px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,.14)] ${glass}`;

function Eyebrow({ tone, children }: { tone: "red" | "mint"; children: React.ReactNode }) {
  return <p className={`m-0 mb-2.5 font-mono text-[11.5px] tracking-[0.12em] ${tone === "red" ? "text-magenta" : "text-teal"}`}>{children}</p>;
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="m-0 mb-3.5 max-w-[24ch] font-display text-[1.5rem] font-bold leading-[1.15] tracking-[-0.02em] text-fog">{children}</h2>;
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[50px] cursor-pointer items-center justify-center rounded-full border border-white/15 bg-transparent px-6 font-display text-[15.5px] font-semibold text-fog transition-colors hover:border-mist"
    >
      {children}
    </button>
  );
}

function LinkButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] cursor-pointer border-0 bg-transparent px-1 font-body text-[15px] font-medium text-muted transition-colors hover:text-fog"
    >
      {children}
    </button>
  );
}

/** A Loom link with a copy button for the Zoom chat, then Continue. */
function LinkOffer({ label, url, onCopy, onContinue }: { label: string; url: string; onCopy: () => void; onContinue: () => void }) {
  return (
    <>
      <p className="m-0 mb-3 mt-1 text-[0.97rem] font-medium leading-[1.55] text-fog">{label}</p>
      <div className="break-all rounded-[10px] border border-edge bg-panel-2 px-3.5 py-3 font-mono text-[12.5px] text-fog">{url}</div>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <PrimaryButton onClick={onCopy}>
          <span id="dc-dialog-ok">Copy link for the Zoom chat</span>
        </PrimaryButton>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-white/15 px-6 font-display text-[15.5px] font-semibold text-fog no-underline transition-colors hover:border-mist"
        >
          Open
        </a>
      </div>
      <div className="mt-2">
        <LinkButton onClick={onContinue}>Continue</LinkButton>
      </div>
    </>
  );
}
