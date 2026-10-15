"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import Headline from "@/components/feedback/Headline";
import { HoldToBegin, NameField, type HoldHandle, type NameFieldHandle } from "@/components/feedback/IntroControls";
import SurveyFrame, { BackButton, PrimaryButton } from "@/components/feedback/SurveyFrame";
import { copyText } from "@/components/portal/feedback/bits";
import {
  GATE_OF,
  LINKS,
  LISTS,
  QUESTION_BY_ID,
  SECTIONS,
  answered,
  boolOf,
  buildCall,
  countsOf,
  emptyAnswers,
  emptyTeam,
  flagCopy,
  flagForPick,
  gateFor,
  listOf,
  questionText,
  strOf,
  talkingPoints,
  visibleQuestions,
  type AnswerValue,
  type Answers,
  type DialogKey,
  type DiscoveryRecord,
  type DiscoveryTeam,
  type FlagKey,
} from "@/lib/discovery/schema";
import CallDialog from "./CallDialog";
import CallQuestion from "./CallQuestion";
import CallRecap, { NotFit } from "./CallRecap";
import StaffDrawer, { type StaffState } from "./StaffDrawer";

/**
 * The sales discovery call — what the advisor shares with a creator. The
 * feedback survey's skin and structure (SurveyFrame, one question per screen,
 * auto-advance after a tap, digits and Enter on a keyboard), with the
 * discovery call's own questions: branches that open on the answers, the
 * red-flag pop-ups, and a recap that books the next call.
 *
 * STAFF   The lock in the header (or the \ key) opens the staff drawer:
 *         advisor, fit, next step, notes, the Fathom link, the talking points
 *         that build as the creator answers, and the practice flag. Closed by
 *         default so nothing internal is on a screen share. Everything in it
 *         except the practice flag is also editable afterwards in the Setter
 *         Answers tab; the practice flag is fixed at the first save.
 *
 * SAVING  "Save call" on the last question creates the record; "Change an
 *         answer" and the next-call choices on the end screen save it again
 *         in place. Drawer edits after the save go straight to the record.
 */

type Step = "intro" | "end" | string;

const AUTO_ADVANCE_MS = 300;
const API = "/api/portal/setter-answers/calls";

const pad = (n: number) => String(n).padStart(2, "0");
const firstName = (s: string) => s.trim().split(/\s+/)[0] ?? "";

const eyebrowCls = "m-0 mb-4 font-mono text-[11.5px] tracking-[0.12em] text-magenta";
const ledeCls = "fb-enter m-0 mb-2 max-w-[40ch] text-[16.5px] leading-relaxed text-mist";

const teamOf = (s: StaffState): DiscoveryTeam => ({
  advisor: s.advisor,
  fit: s.fit,
  fitReason: s.fit === "not_fit" ? s.fitReason : null,
  nextStep: s.nextStep,
  notes: s.notes,
  fathom: s.fathom,
});

async function send<T>(url: string, init: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) return { ok: false, status: res.status, message: data?.message ?? "" };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, message: "" };
  }
}

export default function DiscoveryCall({
  me,
  advisors,
  prefill,
}: {
  /** The signed-in staff member — the default advisor. */
  me: string;
  advisors: string[];
  prefill: { name: string; practice: boolean };
}) {
  const [answers, setAnswers] = useState<Answers>(() => ({ ...emptyAnswers(), name: prefill.name }));
  const [step, setStep] = useState<Step>("intro");
  const [first, setFirst] = useState(firstName(prefill.name));
  const [dialog, setDialog] = useState<DialogKey | null>(null);
  const [staff, setStaff] = useState<StaffState>(() => ({ ...emptyTeam(), advisor: me, practice: prefill.practice, autoFit: false }));
  const [saved, setSaved] = useState<{ id: string; at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** Set once, on begin — the call's duration runs from here to the first save. */
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  // The drawer and the pop-ups portal to <body>, which the server render hasn't got.
  const hydrated = useHydrated();

  /** Pop-ups that fire on leaving a question show once; a changed answer re-arms them. */
  const seen = useRef(new Set<DialogKey>());
  const advance = useRef(0);
  const staffTimer = useRef(0);
  const toastTimer = useRef(0);
  const nameRef = useRef<NameFieldHandle>(null);
  const holdRef = useRef<HoldHandle>(null);

  const vis = useMemo(() => visibleQuestions(answers), [answers]);
  const q = typeof step === "string" && QUESTION_BY_ID[step] ? QUESTION_BY_ID[step] : null;
  const idx = q ? vis.findIndex((x) => x.id === q.id) : -1;
  const total = vis.length;
  const isLast = idx >= 0 && idx === total - 1;
  const notFit = answers.us_filer === "no";
  const ok = q ? answered(q, answers) : false;
  const blocked = !!q?.required && !ok;

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  useEffect(
    () => () => {
      clearTimeout(advance.current);
      clearTimeout(staffTimer.current);
      clearTimeout(toastTimer.current);
    },
    [],
  );
  // A block body, not `() => window.scrollTo(…)`: browsers that return a
  // Promise from scrollTo would hand React a non-function "cleanup" and crash.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // A call in progress that hasn't been saved is fifteen minutes of answers.
  useEffect(() => {
    if (step === "intro" || saved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step, saved]);

  const go = (next: Step) => {
    clearTimeout(advance.current);
    setError(null);
    setStep(next);
  };

  const setAnswer = (k: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [k]: v }));

  /* ── the staff record ── */

  const call = useMemo(
    () => buildCall(answers, { startedAt, savedAt: saved ? new Date(saved.at) : new Date() }),
    [answers, saved, startedAt],
  );
  const points = useMemo(() => talkingPoints(call), [call]);

  /** Drawer edits after the save go straight to the record, a beat after the last keystroke. */
  const pushStaff = (next: StaffState) => {
    if (!saved) return;
    clearTimeout(staffTimer.current);
    const id = saved.id;
    staffTimer.current = window.setTimeout(() => {
      void send(`${API}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(teamOf(next)) }).then((r) => {
        if (!r.ok) flash("Couldn’t save the staff notes");
      });
    }, 400);
  };

  const changeStaff = (patch: Partial<StaffState>) => {
    const next = { ...staff, ...patch };
    if ("fit" in patch) {
      next.autoFit = false;
      if (next.fit !== "not_fit") next.fitReason = null;
    }
    setStaff(next);
    pushStaff(next);
  };

  /** Not filing in the US is the one automatic "not a fit"; the advisor can still change it in the drawer. */
  const autoFit = (usFiler: string) => {
    const next = { ...staff };
    if (usFiler === "no" && (!next.fit || next.autoFit)) {
      next.fit = "not_fit";
      next.fitReason = "not_us";
      next.autoFit = true;
    } else if (usFiler === "yes" && next.autoFit) {
      next.fit = null;
      next.fitReason = null;
      next.autoFit = false;
    } else return;
    setStaff(next);
    pushStaff(next);
  };

  /* ── moving through the questions ── */

  // The handlers below read the latest state through this ref, so a timer
  // or a key event never acts on a stale screen.
  const nextRef = useRef<() => void>(() => {});
  const scheduleNext = () => {
    clearTimeout(advance.current);
    advance.current = window.setTimeout(() => nextRef.current(), AUTO_ADVANCE_MS);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const at = saved ? new Date(saved.at) : new Date();
    const body = buildCall(answers, { startedAt, savedAt: at });
    const r = saved
      ? await send<{ call: DiscoveryRecord }>(`${API}/${encodeURIComponent(saved.id)}`, {
          method: "PUT",
          body: JSON.stringify({ call: body, team: teamOf(staff) }),
        })
      : await send<{ call: DiscoveryRecord }>(API, {
          method: "POST",
          body: JSON.stringify({ call: body, team: teamOf(staff), isTest: staff.practice }),
        });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 404) {
        // Deleted from Setter Answers underneath this call: the next save starts a new record.
        setSaved(null);
        setError("That call was deleted from Setter Answers. Tap Save again to save it as a new call.");
      } else if (r.status === 401) setError("Your session expired. Sign in again in another tab, then tap Save.");
      else if (r.status === 403) setError("This login can’t save calls. Ask an admin for the Tax Strategy tab.");
      else setError(r.message ? `${r.message}.` : "Couldn’t save. Check your connection and tap Save again.");
      return;
    }
    const rec = r.data.call;
    setSaved({ id: rec.id, at: rec.submittedAt ?? at.toISOString() });
    go("end");
    flash(rec.isTest ? "Practice call saved" : "Call saved");
  };

  /** The end screen's choices (what to review, who decides) land on the saved record. */
  const resave = (next: Answers) => {
    if (!saved) return;
    const body = buildCall(next, { startedAt, savedAt: new Date(saved.at) });
    void send(`${API}/${encodeURIComponent(saved.id)}`, { method: "PUT", body: JSON.stringify({ call: body }) }).then((r) => {
      if (!r.ok) flash("Couldn’t save that choice. Check your connection.");
    });
  };

  const next = () => {
    clearTimeout(advance.current);
    if (!q) return;
    const g = gateFor(q.id, answers);
    if (g && !seen.current.has(g)) {
      seen.current.add(g);
      setDialog(g);
      return;
    }
    const i = vis.findIndex((x) => x.id === q.id);
    if (i + 1 < vis.length) go(vis[i + 1].id);
    else void save();
  };
  useEffect(() => {
    nextRef.current = next;
  });

  const back = () => {
    if (step === "end") return go(vis[vis.length - 1].id);
    const i = vis.findIndex((x) => x.id === step);
    go(i <= 0 ? "intro" : vis[i - 1].id);
  };

  const focusReveal = () => window.setTimeout(() => document.getElementById("dc-reveal")?.focus(), 0);

  const pick = (v: string) => {
    if (!q) return;
    const nextAnswers = { ...answers, [q.id]: v };
    setAnswers(nextAnswers);
    clearTimeout(advance.current);
    if (q.id === "us_filer") autoFit(v);
    // Stop and explain before moving on: S corp with no payroll, no entity at all, mixed spending.
    const flag = flagForPick(q, v, nextAnswers);
    if (flag) {
      setDialog(flag);
      return;
    }
    if (q.reveal?.[v]) {
      focusReveal();
      return;
    }
    if (isLast) return; // the last question waits for Save
    scheduleNext();
  };

  const toggle = (v: string) => {
    if (!q) return;
    const cur = listOf(answers, q.id);
    let nextVal = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    // "Not tracking it at all" stands alone.
    if (q.id === "tracking") nextVal = v === "none" && nextVal.includes("none") ? ["none"] : nextVal.filter((x) => x !== "none");
    setAnswer(q.id, nextVal);
    if (q.reveal?.[v] && nextVal.includes(v)) focusReveal();
  };

  /** One more / one fewer account or card. A change re-arms the question's pop-up. */
  const bump = (id: string, issuer: string, kind: "b" | "p", delta: number) => {
    const c = { ...countsOf(answers, id) };
    const prev = c[issuer];
    const cur = { b: prev?.b ?? 0, p: prev?.p ?? 0 };
    cur[kind] = Math.max(0, Math.min(20, cur[kind] + delta));
    c[issuer] = cur;
    seen.current.delete(GATE_OF[id]);
    setAnswers((a) => ({ ...a, [id]: c, [`${id}_none`]: false }));
  };

  const none = (id: string) => {
    const on = !boolOf(answers, `${id}_none`);
    setAnswers((a) => ({ ...a, [`${id}_none`]: on, ...(on ? { [id]: {} } : {}) }));
  };

  const setMoney = (k: string, v: number | null) => {
    if (k === "salary") seen.current.delete("wage_base");
    setAnswer(k, v);
  };

  /* ── the pop-ups ── */

  const closeDialog = (andNext: boolean) => {
    setDialog(null);
    if (andNext) nextRef.current();
  };

  const copyLink = async (url: string, flagKey: string, label: string) => {
    setAnswer(flagKey, true);
    flash((await copyText(url)) ? `${label} copied` : "Select and copy it by hand");
  };

  /* ── keyboard ── */

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT");
      if (dialog === "decider") {
        if (e.key === "Escape") setDialog(null);
        return;
      }
      if (dialog) {
        const hasGuide = dialog !== "points" && !!flagCopy(dialog as FlagKey).guide;
        if (e.key === "Escape" || (e.key === "Enter" && !typing && dialog !== "points" && !hasGuide)) {
          e.preventDefault();
          closeDialog(true);
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "\\" && !typing) {
        e.preventDefault();
        setDrawerOpen((o) => !o);
        return;
      }
      if (e.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
        return;
      }
      if (t?.closest?.("[data-staff-drawer]")) return;
      if (typing) {
        // Enter in a follow-up or money field moves on, as the button would.
        if (e.key === "Enter" && t?.tagName === "INPUT" && (t.dataset.reveal !== undefined || t.dataset.money !== undefined)) {
          e.preventDefault();
          if (q && !blocked && !busy) nextRef.current();
        }
        return;
      }
      if (!q) return;
      if (/^[1-9]$/.test(e.key)) {
        const n = Number(e.key);
        if (q.type === "choice" || q.type === "multi") {
          const o = q.options?.[n - 1];
          if (o) (q.type === "multi" ? toggle : pick)(o[0]);
        } else if (q.type === "revenue" && boolOf(answers, `${q.id}_unsure`)) {
          // The range rows under "not sure" are numbered too.
          const o = LISTS.revenue[n - 1];
          if (o) pick(o[0]);
        }
        return;
      }
      if (e.key === "Enter" && !t?.closest?.("button, a") && !blocked && !busy) nextRef.current();
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  /* ── start over ── */

  const newCall = () => {
    if (!saved && step !== "intro" && !window.confirm("Start over? This call hasn’t been saved.")) return;
    clearTimeout(advance.current);
    setAnswers(emptyAnswers());
    setFirst("");
    setStaff((s) => ({ ...emptyTeam(), advisor: s.advisor, practice: s.practice, autoFit: false }));
    setSaved(null);
    setDialog(null);
    setDrawerOpen(false);
    setError(null);
    seen.current.clear();
    setStartedAt(null);
    go("intro");
  };

  /* ── the mood glow: magenta at the start, teal by the end; dim on "not a fit" ── */
  const glow = useMemo(() => {
    const t = step === "end" ? 1 : idx < 0 ? 0 : idx / Math.max(1, total - 1);
    const endNotFit = step === "end" && notFit;
    return { lift: endNotFit ? 0 : t * 0.85, dim: endNotFit ? 0.55 : 1 };
  }, [step, idx, total, notFit]);

  const pct = idx < 0 ? (step === "end" ? 100 : 0) : Math.round((idx / total) * 100);
  const readout = q ? `[ ${pad(idx + 1)} / ${pad(total)} ]` : staff.practice ? "[ PRACTICE CALL ]" : "[ DISCOVERY CALL ]";

  /* ── screens ── */

  let screen: React.ReactNode = null;

  if (step === "intro") {
    const ready = answers.name.trim().length >= 2;
    screen = (
      <>
        <p className={eyebrowCls}>[ DISCOVERY CALL ]</p>
        <Headline variant="hero" text={first ? `Hi ${first}, let’s see where you stand.` : "Let’s see where you stand."} />
        <p className={ledeCls}>
          A few questions about how you got here, how your business is set up, and how taxes have gone so far. About fifteen
          minutes, and there are no wrong answers.
        </p>
        <NameField
          ref={nameRef}
          value={answers.name}
          onChange={(v) => setAnswer("name", v)}
          onEnter={() => holdRef.current?.begin()}
          label="[ CREATOR’S FIRST NAME ]"
          placeholder="First name"
          hint="Type it in before you share your screen."
          autoComplete="off"
        />
        <HoldToBegin
          ref={holdRef}
          ready={ready}
          ariaLabel="Start the call"
          lockedText="[ ADD THEIR FIRST NAME TO BEGIN ]"
          onLocked={() => nameRef.current?.nudge()}
          onBegin={() => {
            const clean = answers.name.trim().replace(/\s+/g, " ");
            setAnswer("name", clean);
            setFirst(firstName(clean));
            if (!startedAt) setStartedAt(new Date());
            go(vis[0].id);
          }}
        />
      </>
    );
  } else if (q) {
    const label = busy ? "Saving…" : isLast ? "Save call" : ok || q.required ? "Next" : "Skip";
    screen = (
      <>
        <p className={eyebrowCls}>{`[ ${pad(idx + 1)} // ${SECTIONS[q.sec].toUpperCase()} ]`}</p>
        <Headline variant="q" text={questionText(q, answers)} />
        {q.sub ? (
          <p className="fb-enter -mt-4 mb-7 max-w-[34ch] font-display text-[clamp(1.1rem,3.9vw,1.42rem)] font-semibold leading-[1.3] tracking-[-0.015em] text-fog/80">
            {q.sub}
          </p>
        ) : null}
        <div className="fb-enter">
          <CallQuestion
            q={q}
            A={answers}
            onPick={pick}
            onToggle={toggle}
            onSet={setAnswer}
            onMoney={setMoney}
            onCount={bump}
            onNone={none}
            onAdvance={() => {
              if (!isLast) scheduleNext();
            }}
          />
        </div>
        {error ? (
          <p role="alert" className="mb-0 mt-4 text-[14px] text-danger">
            {error}
          </p>
        ) : null}
        <nav className="mt-auto flex items-center justify-between gap-3 pt-[30px]">
          <BackButton onClick={back} />
          <PrimaryButton disabled={blocked || busy} onClick={next}>
            {label}
          </PrimaryButton>
        </nav>
      </>
    );
  } else if (step === "end") {
    screen = notFit ? (
      <NotFit onBack={back} onNew={newCall} />
    ) : (
      <CallRecap
        call={call}
        first={first}
        reviewChoice={strOf(answers, "review_choice") || null}
        onReview={(v) => {
          const nextAnswers = { ...answers, review_choice: v };
          setAnswers(nextAnswers);
          resave(nextAnswers);
        }}
        onBook={() => setDialog("decider")}
        onBack={back}
        onNew={newCall}
      />
    );
  }

  const lockButton = (
    <button
      type="button"
      onClick={() => setDrawerOpen((o) => !o)}
      aria-label="Staff notes (shortcut: backslash)"
      aria-expanded={drawerOpen}
      title="Staff notes ( \\ )"
      className={`grid h-[34px] w-[34px] flex-none cursor-pointer place-items-center rounded-full border transition-colors ${
        drawerOpen ? "border-teal/60 bg-teal/10 text-teal" : "border-white/10 bg-white/[0.035] text-muted hover:text-fog"
      }`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    </button>
  );

  return (
    <>
      <SurveyFrame
        glow={glow}
        count={readout}
        pct={pct}
        progress={idx >= 0 ? { idx, keys: vis.map((x) => x.id) } : step === "end" ? { idx: total, keys: vis.map((x) => x.id) } : null}
        screenKey={String(step)}
        headerExtra={lockButton}
      >
        {screen}
      </SurveyFrame>

      {dialog && hydrated ? (
        <CallDialog
          kind={dialog}
          A={answers}
          onOk={() => closeDialog(true)}
          onPoints={(v) => {
            setAnswer("points", v);
            if (v === "no") closeDialog(true);
          }}
          onCopyMasterclass={() => void copyLink(LINKS.masterclass, "masterclass_copied", "Masterclass link")}
          onCopyGuide={() => void copyLink(LINKS.writeoffs, "writeoffs_copied", "Write-off guide link")}
          onDecider={(v) => setAnswer("decider", v)}
          onDeciderWho={(v) => setAnswer("decider_who", v)}
          onBook={() => {
            // The link opens Calendly; the answer saves after the click goes through.
            if (!staff.nextStep) changeStaff({ nextStep: "followup" });
            window.setTimeout(() => {
              setDialog(null);
              resave(answers);
            }, 0);
          }}
          onCancel={() => setDialog(null)}
        />
      ) : null}

      {hydrated ? (
        <StaffDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          staff={staff}
          onChange={changeStaff}
          advisors={advisors}
          points={points}
          saved={!!saved}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] left-1/2 z-[70] -translate-x-1/2 rounded-full bg-fog px-4 py-2.5 font-body text-[13.5px] font-medium text-night shadow-[0_10px_30px_rgba(0,0,0,.3)]"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
