"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedbackLinkContext } from "@/lib/feedback/links";
import {
  ALL_QUESTIONS,
  AUTO_ADVANCE_MS,
  LINK_ROLES,
  TEAMS,
  joinNames,
  questionsFor,
  sectionsFor,
  segmentFor,
  textOK,
  type Segment,
  type SurveyKind,
  type TeamKey,
} from "@/lib/feedback/schema";
import Headline from "./Headline";
import { HoldToBegin, NameField, type HoldHandle, type NameFieldHandle } from "./IntroControls";
import QuestionBody from "./QuestionBody";
import ReviewAsk from "./ReviewAsk";
import SurveyFrame, { BackButton, DoneMark, PrimaryButton } from "./SurveyFrame";
import { MAGENTA } from "./survey-fx";

/**
 * The client feedback survey — the public page a TaxDome email or a tax recap
 * links to. It wears the recap's skin on purpose (SurveyFrame): night
 * background, cipher rain, decrypting headlines, a hold-to-begin ring. A
 * client who's just seen their recap should feel they're still in the same
 * place.
 *
 * One question per screen, auto-advancing ~340ms after a tap, with digits and
 * Enter on a keyboard. A glow behind it drifts from magenta toward teal as the
 * ratings climb (and dims on the at-risk thank-you). The end screen depends on
 * the scores (lib/feedback/schema segmentFor):
 *
 *   promoter  every team CSAT ≥ 4 and NPS ≥ 7 → the review ask, as a full-bleed
 *             magenta slide like the recap's: Google review button and a QR
 *   at risk   any team CSAT ≤ 3 or NPS ≤ 6 → a plain, quiet thank-you (the
 *             server files the follow-up)
 *   passive   everyone else → thanks
 *   already   the server says this client answered this round already
 *
 * A link with preview=1 is a staff preview: answers save flagged as test
 * data, and a slim bar lets staff switch which survey they're trying.
 */

type Step = "intro" | "already" | "end" | number;

const KIND_TABS: [SurveyKind, string][] = [
  ["onb", "Onboarding"],
  ["bk", "Bookkeeping"],
  ["tax", "Tax"],
  ["both", "Both"],
];

const pad = (n: number) => String(n).padStart(2, "0");

/** The send's id, made here so a retried send lands on the same document. */
function newSurveyId(kind: SurveyKind): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return `${kind === "onb" ? "onb" : "svc"}_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export default function FeedbackSurvey({ link, already }: { link: FeedbackLinkContext; already: boolean }) {
  const [kind, setKind] = useState<SurveyKind>(link.kind);
  const [step, setStep] = useState<Step>(already ? "already" : "intro");
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [name, setName] = useState(link.name);
  const [first, setFirst] = useState(link.first);
  const [result, setResult] = useState<{ id: string; segment: Segment } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const submissionId = useRef<string | null>(null);
  const advance = useRef(0);
  const nameRef = useRef<NameFieldHandle>(null);
  const holdRef = useRef<HoldHandle>(null);

  const questions = useMemo(() => questionsFor(kind), [kind]);
  const sections = useMemo(() => sectionsFor(kind), [kind]);
  const total = questions.length;
  const q = typeof step === "number" ? questions[step] : null;
  const pink = step === "end" && result?.segment === "promoter";
  const onb = kind === "onb";

  const go = (next: Step) => {
    clearTimeout(advance.current);
    setError(null);
    setStep(next);
  };

  useEffect(() => () => clearTimeout(advance.current), []);
  // A block body, not `() => window.scrollTo(…)`: browsers that return a
  // Promise from scrollTo would hand React a non-function "cleanup" and crash.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // The magenta slide is the whole page, overscroll included: the root
  // container covers the layout, the html/body tint covers the rubber-band.
  useEffect(() => {
    if (!pink) return;
    const els = [document.documentElement, document.body];
    const prev = els.map((el) => el.style.backgroundColor);
    els.forEach((el) => (el.style.backgroundColor = MAGENTA));
    return () => els.forEach((el, i) => (el.style.backgroundColor = prev[i]));
  }, [pink]);

  /** Who the link named, per section. */
  const named = (t: TeamKey) =>
    [...new Set(LINK_ROLES.filter((r) => r.team === t).map((r) => link.team[r.role]).filter(Boolean))];
  const linkTeamNames = [...new Set(sections.flatMap(named))];

  const pick = (v: number | string) => {
    if (!q || typeof step !== "number") return;
    setAnswers((a) => ({ ...a, [q.id]: v }));
    clearTimeout(advance.current);
    if (step >= total - 1) return; // the last question waits for Send
    const here = step;
    advance.current = window.setTimeout(
      () => setStep((s) => (s === here ? here + 1 : s)),
      AUTO_ADVANCE_MS + (q.type === "nps" ? 120 : 0),
    );
  };

  const answered = (() => {
    if (!q) return false;
    const a = answers[q.id];
    if (q.type === "text") return !q.required || textOK(a);
    return !!q.optional || (a !== undefined && a !== "");
  })();
  const blank = (v: unknown) => v === undefined || (typeof v === "string" && !v.trim());

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const segment = segmentFor(kind, answers);
    const id = submissionId.current ?? (submissionId.current = newSurveyId(kind));
    const team = Object.fromEntries(
      LINK_ROLES.filter((r) => sections.includes(r.team) && link.team[r.role]).map((r) => [r.role, link.team[r.role]]),
    );
    const body = {
      survey_id: id,
      kind,
      name: name.trim().replace(/\s+/g, " "),
      cid: link.cid,
      rid: link.rid,
      esc: link.esc,
      bq: link.bq,
      ty: link.ty,
      duration_sec: startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : null,
      preview: link.preview,
      team,
      answers,
    };
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409 && data?.already) {
        go("already");
        return;
      }
      if (!res.ok || !data?.ok) {
        // The id belongs to a different send (the name changed after one that
        // saved but never answered): the next tap goes out under a fresh one,
        // and the round check takes it from there.
        if (res.status === 409) submissionId.current = null;
        // A 400 names what's wrong; anything else reads as a connection problem.
        setError(
          res.status === 400 && data?.message
            ? `${data.message}.`
            : "Couldn’t send. Check your connection and tap Send again.",
        );
        return;
      }
      setResult({ id: data.survey_id, segment });
      go("end");
    } catch {
      setError("Couldn’t send. Check your connection and tap Send again.");
    } finally {
      setBusy(false);
    }
  };

  const logReviewClick = () => {
    if (!result) return;
    fetch(`/api/feedback/${encodeURIComponent(result.id)}/review-click`, { method: "POST", keepalive: true }).catch(
      () => {},
    );
  };

  /** Staff preview: try another survey, keeping the typed name. */
  const switchKind = (k: SurveyKind) => {
    clearTimeout(advance.current);
    setKind(k);
    setAnswers({});
    setResult(null);
    setError(null);
    startedAt.current = null;
    submissionId.current = null;
    setStep("intro");
    try {
      const url = new URL(window.location.href);
      if (k === "onb") url.searchParams.delete("s");
      else url.searchParams.set("s", k);
      window.history.replaceState(null, "", url);
    } catch {
      /* the switch still works; a reload just lands on the old kind */
    }
  };

  // Digits answer, Enter moves on — unless focus is in a field or on a control
  // that Enter already means something to.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (typeof step !== "number" || !q) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        const n = Number(e.key);
        if ((q.type === "scale" || q.type === "squares") && n >= 1 && n <= 5) pick(n);
        else if (q.type === "nps") pick(n);
        return;
      }
      if (e.key === "Enter" && !t?.closest?.("button, a") && answered && step < total - 1) go(step + 1);
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  /* ── the mood glow: the brand orb crossfades to a teal one as the ratings climb ── */
  const glow = useMemo(() => {
    const parts: number[] = [];
    for (const qq of ALL_QUESTIONS) {
      const v = answers[qq.id];
      if (typeof v !== "number") continue;
      parts.push(qq.type === "nps" ? v / 10 : (v - 1) / 4);
    }
    const t = parts.length ? parts.reduce((x, y) => x + y, 0) / parts.length : 0;
    const lift = Math.max(0, (t - 0.5) / 0.5) * 0.85;
    const dim = step === "end" && result?.segment === "at_risk" ? 0.55 : 1;
    return { lift, dim };
  }, [answers, step, result]);

  const idx = typeof step === "number" ? step : step === "end" ? total : -1;
  const pct = idx < 0 ? 0 : Math.round((idx / total) * 100);
  const both = kind === "both";
  const count = q
    ? `[ ${pad(idx + 1)} / ${total} ]`
    : onb
      ? "[ ONBOARDING ]"
      : both
        ? "[ BOOKS + TAX ]"
        : kind === "tax"
          ? "[ TAX ]"
          : "[ BOOKKEEPING ]";

  const sectionWords = onb ? "onboarding" : both ? "bookkeeping and taxes" : kind === "tax" ? "tax season" : "bookkeeping";
  const reviewTeamWords = both ? "bookkeeping and tax team" : kind === "tax" ? "tax team" : "bookkeeping team";
  const reviewHint = onb
    ? "What onboarding helped you understand or fix"
    : sections.includes("tax")
      ? "How we handled your taxes and planning"
      : "How we keep your books clean and current";

  const eyebrowCls = `m-0 mb-4 font-mono text-[11.5px] tracking-[0.12em] ${pink ? "text-night" : "text-magenta"}`;
  const ledeCls = `fb-enter m-0 mb-2 max-w-[40ch] text-[16.5px] leading-relaxed ${pink ? "text-night/70" : "text-mist"}`;

  /* ── screens ── */

  let screen: React.ReactNode = null;

  if (step === "intro") {
    const question = onb
      ? "how did onboarding go?"
      : both
        ? "how are your books and taxes going?"
        : kind === "tax"
          ? "how did tax season go?"
          : "how are your books going?";
    const title = first ? `Hi ${first}, ${question}` : question.charAt(0).toUpperCase() + question.slice(1);
    const eyebrow = onb ? "ONBOARDING" : both ? "BOOKKEEPING + TAX" : kind === "tax" ? `TAX // ${link.ty}` : `BOOKKEEPING // ${link.bq}`;
    const lede = onb
      ? "Nine quick questions, about a minute. Most are a single tap, and the two written ones are optional."
      : `${total === 8 ? "Eight" : "Four"} quick questions${both ? " in two short sections" : ""}, about a minute. Most are a single tap, and ${both ? "one in each section asks" : "one asks"} why, in your own words.`;
    const who = sections.map((t) => ({ t, names: named(t) })).filter((w) => w.names.length);
    const ready = name.trim().length >= 2;
    screen = (
      <>
        <p className={eyebrowCls}>{`[ ${eyebrow} // CHECK-IN ]`}</p>
        <Headline variant="hero" text={title} />
        <p className={ledeCls}>{lede}</p>
        {who.length ? (
          <p className="fb-enter mt-[22px] inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 self-start rounded-full border border-white/10 bg-white/[0.035] px-3.5 py-[9px] text-[14px] text-muted">
            <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)]" />
            <span>
              Your {onb ? "onboarding " : ""}team:{" "}
              {who.map((w, i) => (
                <span key={w.t}>
                  {i ? " · " : ""}
                  {onb ? "" : `${TEAMS[w.t].label}: `}
                  {w.names.map((n, j) => (
                    <span key={n}>
                      {j ? (onb ? " · " : " + ") : ""}
                      <b className="font-semibold text-fog">{n}</b>
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </p>
        ) : null}
        <NameField ref={nameRef} value={name} onChange={setName} onEnter={() => holdRef.current?.begin()} />
        <HoldToBegin
          ref={holdRef}
          ready={ready}
          onLocked={() => nameRef.current?.nudge()}
          onBegin={() => {
            const clean = name.trim().replace(/\s+/g, " ");
            setName(clean);
            setFirst(clean.split(" ")[0]);
            startedAt.current = Date.now();
            go(0);
          }}
        />
      </>
    );
  } else if (step === "already") {
    screen = (
      <>
        <DoneMark />
        <Headline variant="hero" text={`You’re all set${first ? `, ${first}` : ""}.`} />
        <p className={ledeCls}>
          We already have your {sectionWords} feedback{onb ? "" : " for this round"}. Thank you for taking the time.
        </p>
      </>
    );
  } else if (q && typeof step === "number") {
    const a = answers[q.id];
    const isLast = step === total - 1;
    const sec = TEAMS[q.team];
    screen = (
      <>
        <p className={eyebrowCls}>{`[ ${pad(step + 1)} // ${q.tag} ]`}</p>
        {both ? (
          <p className="fb-enter -mt-1.5 mb-3 font-mono text-[11.5px] uppercase tracking-[0.12em] text-muted">
            <b className="font-normal text-magenta">Section {sec.letter}</b> · {sec.label} team
          </p>
        ) : null}
        <Headline variant="q" text={q.text} />
        <div className="fb-enter">
          <QuestionBody
            q={q}
            value={a}
            onPick={pick}
            onText={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
          />
        </div>
        {error ? (
          <p role="alert" className="mb-0 mt-4 text-[14px] text-danger">
            {error}
          </p>
        ) : null}
        <nav className="mt-auto flex items-center justify-between gap-3 pt-[30px]">
          <BackButton onClick={() => go(step === 0 ? "intro" : step - 1)} />
          {isLast ? (
            <PrimaryButton disabled={!answered || busy} onClick={() => void submit()}>
              {busy ? "Sending…" : q.optional && blank(a) ? "Skip and send" : "Send feedback"}
            </PrimaryButton>
          ) : q.optional ? (
            <PrimaryButton onClick={() => go(step + 1)}>{blank(a) ? "Skip" : "Next"}</PrimaryButton>
          ) : (
            <PrimaryButton disabled={!answered} onClick={() => go(step + 1)}>
              Next
            </PrimaryButton>
          )}
        </nav>
      </>
    );
  } else if (step === "end") {
    if (result?.segment === "promoter") {
      screen = (
        <>
          <p className={eyebrowCls}>{`[ ${pad(total + 1)} // ONE LAST FAVOR ]`}</p>
          <Headline variant="ask" ink text={`Thank you${first ? `, ${first}` : ""}! One last favor?`} />
          <p className={ledeCls}>
            Most creators find us from referrals and reviews. If you can spare 30 seconds, would you leave a quick
            Google review {onb ? "sharing your experience with onboarding" : `about working with our ${reviewTeamWords}`}?
          </p>
          <div className="fb-enter my-[18px] rounded-r-[12px] border-l-2 border-night bg-night/[0.08] px-[18px] py-4">
            <p className="m-0 mb-2 font-mono text-[11px] tracking-[0.12em]">[ IDEAS FOR WHAT TO MENTION ]</p>
            <ul className="m-0 list-disc pl-[18px] font-medium">
              <li className="my-[5px]">
                {linkTeamNames.length ? `What it’s like working with ${joinNames(linkTeamNames)}` : "Why you chose DeCypher"}
              </li>
              <li className="my-[5px]">{reviewHint}</li>
              <li className="my-[5px]">Why you’d recommend us to other creators</li>
            </ul>
          </div>
          <ReviewAsk onClicked={logReviewClick} />
        </>
      );
    } else if (result?.segment === "at_risk") {
      screen = (
        <>
          <DoneMark />
          <Headline variant="hero" text="Thanks for the honest feedback." />
          <p className={ledeCls}>We read every response. Our team will review this and follow up if needed.</p>
        </>
      );
    } else {
      screen = (
        <>
          <DoneMark />
          <Headline variant="hero" text={`Thanks${first ? `, ${first}` : ""}.`} />
          <p className={ledeCls}>
            Your feedback is in. We read every response, and it shapes how we {onb ? "onboard" : "work with"} every
            creator.
          </p>
        </>
      );
    }
  }

  const previewBar = link.preview ? (
    <div
      className={`mb-1.5 flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border px-3 py-2 text-[12.5px] ${
        pink ? "border-night/25 text-night/70" : "border-white/10 bg-white/[0.035] text-muted"
      }`}
    >
      <span>Preview · answers save as test data</span>
      <div
        role="radiogroup"
        aria-label="Survey to preview"
        className={`inline-flex flex-wrap rounded-full border p-[3px] ${pink ? "border-night/25 bg-night/10" : "border-white/10 bg-panel"}`}
      >
        {KIND_TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => switchKind(k)}
            className={`cursor-pointer rounded-full border-0 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] ${
              kind === k
                ? pink
                  ? "bg-night text-magenta"
                  : "bg-magenta text-night"
                : `bg-transparent ${pink ? "text-night/70" : "text-muted hover:text-fog"}`
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <SurveyFrame
      pink={pink}
      glow={glow}
      count={count}
      pct={pct}
      progress={idx >= 0 ? { idx, keys: questions.map((qq) => qq.id) } : null}
      screenKey={`${kind}:${String(step)}`}
      topBar={previewBar}
    >
      {screen}
    </SurveyFrame>
  );
}
