"use client";

/**
 * S-Corp self-employment tax savings — and the salary review that follows.
 *
 * Models the one thing an S-corp election actually buys: SE tax on the whole
 * profit becomes payroll tax on a salary. Everything else — payroll costs,
 * the extra return, state fees — is out of scope and called out on screen.
 * The risk meter is why the saving is never shown alone: the salary that
 * saves the most is also the one the IRS is most likely to reclassify.
 *
 * Four tabs. Client, Calculator and Summary are client-facing — screen-shared
 * on the call, so the copy speaks to the creator, and the Summary is the sheet
 * they keep. Saved clients is the tax team's: every saved salary is re-checked
 * six months later, and a changed salary drafts a note to send the client.
 *
 * Ported from the client team's standalone page. What changed in the port is
 * persistence: their page kept clients in the browser or in a hosted runtime;
 * here the scorp-clients routes keep them in Firestore. The list loads once on
 * mount and each write's response replaces the local copy — no live sync,
 * hence the Refresh button on the Saved clients tab.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/hooks/useHydrated";
import { money } from "@/lib/widget-format";
import { downloadFile, printHtml } from "@/lib/print-html";
import {
  Check,
  Chip,
  Disclaimer,
  Field,
  Mono,
  MoneyFlow,
  NumInput,
  Panel,
  Segmented,
  Slider,
} from "@/components/portal/widgets/ui";
import {
  CHECK_MONTHS,
  GREEN_LIGHT,
  LOW_DIST_CUTOFF,
  WAGE_BASE,
  addMonths,
  analyze,
  buildNotice,
  clientName,
  fmtDate,
  longToday,
  newScorpId,
  reviewQueues,
  todayISO,
  type BasisMode,
  type HistoryEntry,
  type RiskLevel,
  type ScorpClient,
} from "@/lib/tax-strategy/scorp";
import {
  StatusDot,
  fieldCls,
  ghostBtn,
  primaryBtn,
  tweakBtn,
  type SaveStatus,
} from "@/components/portal/widgets/scorp/parts";
import SavedClients, { type SortKey } from "@/components/portal/widgets/scorp/SavedClients";
import {
  summaryDocument,
  summarySheetHtml,
  type SheetData,
} from "@/components/portal/widgets/scorp/summary-sheet";

type Tab = "client" | "calc" | "summary" | "saved";

/** A record on its way to the server — new ones get their id there. */
type ScorpDraft = Omit<ScorpClient, "id"> & { id?: string };

type Toast = { text: string; undo?: () => void };

const API = "/api/portal/tax-strategy/scorp-clients";

const DEFAULTS = {
  revenue: "200000",
  expenses: "50000",
  salaryPct: 40,
  distribution: "37500",
};

const RISK_SEGMENTS: { level: RiskLevel; label: string; on: string }[] = [
  { level: "low", label: "Conservative", on: "bg-teal text-teal" },
  { level: "medium", label: "Getting Aggressive", on: "bg-ember text-ember" },
  { level: "high", label: "Aggressive", on: "bg-danger text-danger" },
];

const TONE_TEXT = { pos: "text-teal", warn: "text-ember", neg: "text-danger" } as const;

/** Money fields hold whole dollars, as the original's did — no minus, no cents. */
const digits = (raw: string) => raw.replace(/\D/g, "");
const num = (s: string) => Number(s) || 0;

/**
 * One reading of the clock per write, so a history entry's day and stamp and
 * the record's own stamps can't straddle midnight. Module-level so the React
 * Compiler doesn't mistake the write handlers for render code.
 */
const clock = () => ({ now: Date.now(), today: todayISO() });

/** Carries the server's message, or "" for a network failure. */
class ApiError extends Error {}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError("");
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!res.ok || !data.ok) throw new ApiError(data.message || `Request failed (${res.status})`);
  return data as T;
}

const fetchClients = () => api<{ clients: ScorpClient[]; me: string }>(API);

/** Clipboard first; select-and-execCommand where the clipboard API is refused. */
async function copyText(text: string, el: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      if (el) {
        el.focus();
        el.select();
      }
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

export default function ScorpAnalyzer() {
  // calculator
  const [revenue, setRevenue] = useState(DEFAULTS.revenue);
  const [expenses, setExpenses] = useState(DEFAULTS.expenses);
  const [salaryPct, setSalaryPct] = useState(DEFAULTS.salaryPct);
  const [distribution, setDistribution] = useState(DEFAULTS.distribution);
  const [basisMode, setBasisMode] = useState<BasisMode>("auto");

  // client details
  const [tab, setTab] = useState<Tab>("calc");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bizName, setBizName] = useState("");
  const [callDate, setCallDate] = useState("");
  const [noCall, setNoCall] = useState(true);
  const [notes, setNotes] = useState("");
  const [beginningBasis, setBeginningBasis] = useState("0");

  // the saved list and the review workflow
  const [clients, setClients] = useState<ScorpClient[]>([]);
  const [me, setMe] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [tweakId, setTweakId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("next");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Saved clients stay hidden until someone clicks Show — safe for screen
  // sharing. They hide again whenever you leave the Saved clients tab (except
  // mid-tweak) and on every reload.
  const [showSaved, setShowSaved] = useState(false);

  // The toast portals to <body>, which the server render hasn't got.
  const hydrated = useHydrated();

  useEffect(() => {
    let live = true;
    fetchClients()
      .then((r) => {
        if (!live) return;
        setClients(r.clients);
        setMe(r.me);
        setLoadError("");
      })
      .catch((e: unknown) => {
        if (live) setLoadError((e as Error).message || "check your connection and refresh");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  // Each toast clears itself; a new one restarts the clock. Undo gets longer.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 8000 : 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (text: string, undo?: () => void) => setToast({ text, undo });

  /**
   * Every tab / tweak change goes through here, so the hide-on-leave rule
   * lives in one place: leaving Saved clients re-hides it, unless a tweak is
   * in progress (you'll be sent back to it).
   */
  const go = (next: Tab, nextTweak: string | null = tweakId) => {
    setTab(next);
    setTweakId(nextTweak);
    if (next !== "saved" && !nextTweak) setShowSaved(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await fetchClients();
      setClients(r.clients);
      setMe(r.me);
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message || "check your connection and refresh");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  /* ── write / delete one record ── */

  const putLocal = (c: ScorpClient) =>
    setClients((prev) =>
      prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev],
    );

  const writeRec = async (
    rec: ScorpDraft,
    mode: "create" | "update",
  ): Promise<ScorpClient | null> => {
    try {
      const { client } =
        mode === "create" || !rec.id
          ? await api<{ client: ScorpClient }>(API, { method: "POST", body: JSON.stringify(rec) })
          : await api<{ client: ScorpClient }>(`${API}/${encodeURIComponent(rec.id)}`, {
              method: "PUT",
              body: JSON.stringify(rec),
            });
      putLocal(client);
      return client;
    } catch (e) {
      const msg = (e as Error).message;
      showToast(
        msg ? `Couldn't save — ${msg}.` : "Couldn't save. Check your connection and try again.",
      );
      return null;
    }
  };

  const removeRec = async (id: string): Promise<boolean> => {
    try {
      await api(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
      setClients((prev) => prev.filter((c) => c.id !== id));
      return true;
    } catch {
      showToast("Couldn't delete. Check your connection and try again.");
      return false;
    }
  };

  /** Run a per-client write with that client's buttons disabled, so a double click is one write. */
  const withBusy = async <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    setBusyIds((b) => ({ ...b, [id]: true }));
    try {
      return await fn();
    } finally {
      setBusyIds((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
    }
  };

  /* ── derived ── */

  const hasName = !!(firstName.trim() || lastName.trim() || bizName.trim());
  const activeLabel = [
    [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
    bizName.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  const currentRec = clients.find((c) => c.id === currentId) ?? null;
  const tweakRec = tweakId ? (clients.find((c) => c.id === tweakId) ?? null) : null;
  const savedBiz = (currentRec?.bizName || "").trim();
  const profitLabel = savedBiz ? `${savedBiz} profit` : "Business profit";
  const distNum = num(distribution);

  const a = analyze({ revenue, expenses, salaryPct, distribution, beginningBasis, basisMode });
  const {
    profit,
    greenLight,
    salary,
    before,
    after,
    savings,
    distPct,
    belowThreshold,
    autoLowDist,
    lowDist,
    ratioPct,
    targetText,
    risk,
    profitAfterPayroll,
    overDistributing,
    excessOverBasis,
    retained,
  } = a;

  const queues = reviewQueues(clients);

  const status: SaveStatus = loading
    ? { tone: "mute", text: "Loading the team's client list…" }
    : loadError
      ? { tone: "neg", text: `Couldn't load the team's client list — ${loadError}` }
      : { tone: "pos", text: "Saved to the team's client list" };

  /* ── save from the Client tab or the calculator ── */

  const saveClient = async () => {
    if (!hasName) {
      setNote("Add a first name, last name, or business name on the Client tab to save.");
      go("client");
      return;
    }
    if (loading) {
      setNote("Still connecting to the client list — try again in a moment.");
      return;
    }
    const existing = currentRec;
    const { now, today } = clock();
    const fields = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      bizName: bizName.trim(),
      callDate: noCall ? "" : callDate,
      notes,
      beginningBasis: num(beginningBasis),
      revenue: num(revenue),
      expenses: num(expenses),
      salaryPct,
      distribution: distNum,
      basisMode,
      salary: a.salary,
      profit: a.profit,
      savings: Math.round(a.savings),
      riskLevel: a.risk ? a.risk.level : null,
      updatedAt: now,
      updatedBy: me,
      savedAt: now,
    };

    let rec: ScorpDraft;
    let message: string;
    if (!existing) {
      rec = {
        ...fields,
        createdAt: now,
        createdBy: me,
        salarySetOn: today,
        nextCheckOn: addMonths(today, CHECK_MONTHS),
        lastCheckOn: null,
        history: [
          { type: "set", on: today, at: now, by: me, salary: a.salary, distribution: distNum },
        ],
        clientNotice: null,
      };
      message = `Saved. First salary check ${fmtDate(rec.nextCheckOn)}.`;
    } else {
      const fromDist = Number(existing.distribution) || 0;
      const changed = existing.salary !== a.salary || fromDist !== distNum;
      rec = { ...existing, ...fields };
      const change: HistoryEntry = {
        type: "tweak",
        on: today,
        at: now,
        by: me,
        fromSalary: existing.salary,
        salary: a.salary,
        fromDistribution: fromDist,
        distribution: distNum,
      };
      if (tweakId === existing.id) {
        if (changed) {
          rec.history = [...existing.history, change];
          rec.clientNotice = {
            status: "pending",
            createdOn: today,
            fromSalary: existing.salary,
            salary: a.salary,
            fromDistribution: fromDist,
            distribution: distNum,
            message: buildNotice(rec, existing.salary, a.salary, fromDist, distNum),
            sentOn: null,
            sentBy: null,
          };
          rec.salarySetOn = today;
          message = `Salary tweaked to ${money(a.salary)}. Let the client know from Saved clients.`;
        } else {
          rec.history = [
            ...existing.history,
            { type: "check", on: today, at: now, by: me, salary: a.salary, distribution: distNum },
          ];
          message =
            "Salary and distributions didn't change, so this was logged as a completed check.";
        }
        rec.lastCheckOn = today;
        rec.nextCheckOn = addMonths(today, CHECK_MONTHS);
      } else if (changed) {
        rec.history = [...existing.history, { ...change, type: "update" }];
        rec.salarySetOn = today;
        rec.nextCheckOn = addMonths(today, CHECK_MONTHS);
        message = `Updated. New salary is set, so the next check moved to ${fmtDate(rec.nextCheckOn)}.`;
      } else {
        message = "Updated.";
      }
    }

    setBusy(true);
    const saved = await writeRec(rec, existing ? "update" : "create");
    setBusy(false);
    if (!saved) {
      setNote("Not saved.");
      return;
    }
    setCurrentId(saved.id);
    setNote(message);
    if (tweakId) {
      go("saved", null);
      showToast(message);
    }
  };

  /* ── moving between the list and the calculator ── */

  const loadIntoCalculator = (c: ScorpClient) => {
    setFirstName(c.firstName);
    setLastName(c.lastName);
    setBizName(c.bizName);
    setCallDate(c.callDate);
    setNoCall(!c.callDate);
    setNotes(c.notes);
    setBeginningBasis(String(c.beginningBasis));
    setRevenue(String(c.revenue));
    setExpenses(String(c.expenses));
    setSalaryPct(c.salaryPct);
    setDistribution(String(c.distribution));
    setBasisMode(c.basisMode);
    setCurrentId(c.id);
    setNote("");
    setConfirmId(null);
  };

  const openClient = (c: ScorpClient) => {
    loadIntoCalculator(c);
    go("calc", null);
  };

  const startTweak = (c: ScorpClient) => {
    loadIntoCalculator(c);
    go("calc", c.id);
    window.scrollTo(0, 0);
  };

  const cancelTweak = () => go("saved", null);

  const newClient = () => {
    setFirstName("");
    setLastName("");
    setBizName("");
    setCallDate("");
    setNoCall(true);
    setNotes("");
    setBeginningBasis("0");
    setRevenue(DEFAULTS.revenue);
    setExpenses(DEFAULTS.expenses);
    setSalaryPct(DEFAULTS.salaryPct);
    setDistribution(DEFAULTS.distribution);
    setBasisMode("auto");
    setCurrentId(null);
    go(tab, null);
    setNote("");
    setConfirmId(null);
  };

  /* ── the review workflow ── */

  const checkComplete = (c: ScorpClient) =>
    withBusy(c.id, async () => {
      const { now, today } = clock();
      const prev = c;
      const rec: ScorpClient = {
        ...c,
        lastCheckOn: today,
        nextCheckOn: addMonths(today, CHECK_MONTHS),
        updatedAt: now,
        updatedBy: me,
        history: [
          ...c.history,
          {
            type: "check",
            on: today,
            at: now,
            by: me,
            salary: c.salary,
            distribution: Number(c.distribution) || 0,
          },
        ],
      };
      if (await writeRec(rec, "update")) {
        showToast(
          `Check complete for ${clientName(c)}. Next check ${fmtDate(rec.nextCheckOn)}.`,
          async () => {
            await writeRec(prev, "update");
            setToast(null);
          },
        );
      }
    });

  const noticeText = (c: ScorpClient) => drafts[c.id] ?? c.clientNotice?.message ?? "";

  const markNotified = (c: ScorpClient) =>
    withBusy(c.id, async () => {
      if (!c.clientNotice) return;
      const { now, today } = clock();
      const prev = c;
      const rec: ScorpClient = {
        ...c,
        updatedAt: now,
        updatedBy: me,
        clientNotice: {
          ...c.clientNotice,
          message: noticeText(c),
          status: "sent",
          sentOn: today,
          sentBy: me,
        },
        history: [
          ...c.history,
          {
            type: "notified",
            on: today,
            at: now,
            by: me,
            salary: c.salary,
            distribution: Number(c.distribution) || 0,
          },
        ],
      };
      if (await writeRec(rec, "update")) {
        setDrafts((d) => {
          const n = { ...d };
          delete n[c.id];
          return n;
        });
        showToast(`Marked ${clientName(c)} as notified.`, async () => {
          await writeRec(prev, "update");
          setToast(null);
        });
      }
    });

  /** The note is edited in place and saved when the field loses focus. */
  const saveDraft = async (c: ScorpClient) => {
    const draft = drafts[c.id];
    if (draft == null || !c.clientNotice || draft === c.clientNotice.message) return;
    await writeRec({ ...c, clientNotice: { ...c.clientNotice, message: draft } }, "update");
  };

  const copyNote = async (c: ScorpClient, el: HTMLTextAreaElement | null) => {
    showToast(
      (await copyText(noticeText(c), el)) ? "Note copied." : "Select the note and copy it manually.",
    );
  };

  const deleteClient = (id: string) =>
    withBusy(id, async () => {
      if (await removeRec(id)) {
        setConfirmId(null);
        if (currentId === id) setCurrentId(null);
        if (tweakId === id) setTweakId(null);
      }
    });

  /* ── backups ── */

  const exportClients = () => {
    try {
      downloadFile(
        JSON.stringify(clients, null, 2),
        "scorp-clients-backup.json",
        "application/json",
      );
    } catch {
      showToast("Export didn't finish.");
    }
  };

  /**
   * Merge a backup into the team list: clients whose id is already here are
   * skipped, never overwritten. Ids are narrowed to what the server accepts
   * (the browser-only version allowed a few more characters).
   */
  const importClients = async (file: File) => {
    let arr: unknown;
    try {
      arr = JSON.parse(await file.text());
    } catch {
      arr = null;
    }
    if (!Array.isArray(arr)) {
      showToast("That file isn't a valid backup.");
      return;
    }
    const have = new Set(clients.map((c) => c.id));
    let n = 0;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const rawId = (item as { id?: unknown }).id;
      if (!rawId) continue;
      const id = String(rawId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || newScorpId();
      if (have.has(String(rawId)) || have.has(id)) continue;
      try {
        const { client } = await api<{ client: ScorpClient }>(API, {
          method: "POST",
          body: JSON.stringify({ ...item, id }),
        });
        have.add(client.id);
        putLocal(client);
        n++;
      } catch {
        // Taken on the server since the list loaded, or rejected — skipped, like a duplicate.
      }
    }
    showToast(`Imported ${n} client${n === 1 ? "" : "s"}.`);
  };

  /* ── render ── */

  const summarySheet = (): SheetData => {
    const person = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    return {
      title: person || bizName.trim() || "Your S corp estimate",
      subtitle: person && bizName.trim() ? bizName.trim() : "",
      date: longToday(),
      a,
    };
  };

  const saveLabel = tweakRec ? "Save new salary" : currentId ? "Update saved client" : "Save client";
  const statusSentence = `${status.text}${/[.…]$/.test(status.text) ? "" : "."} Saving stores these details plus the calculator numbers, and schedules a salary check ${CHECK_MONTHS} months out.`;

  return (
    <div>
      <Segmented<Tab>
        value={tab}
        onChange={(t) => {
          go(t);
          setConfirmId(null);
        }}
        ariaLabel="S-Corp Analyzer view"
        options={[
          { value: "client", label: "Client" },
          { value: "calc", label: "Calculator" },
          { value: "summary", label: "Summary" },
          {
            value: "saved",
            label: (
              <>
                Saved clients
                {queues.attention > 0 ? (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] font-bold ${
                      tab === "saved" ? "bg-white/25 text-white" : "bg-magenta text-white"
                    }`}
                  >
                    {queues.attention}
                  </span>
                ) : null}
              </>
            ),
          },
        ]}
      />

      <div className="mt-5">
        {/* ───────────────────────────── client ───────────────────────────── */}
        {tab === "client" ? (
          <div className="max-w-[720px]">
            <Panel title={currentId ? "Editing saved client" : "New client"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <input
                    type="text"
                    value={firstName}
                    placeholder="First"
                    onChange={(e) => setFirstName(e.target.value)}
                    className={`${fieldCls} w-full font-body text-[14px]`}
                  />
                </Field>
                <Field label="Last name">
                  <input
                    type="text"
                    value={lastName}
                    placeholder="Last"
                    onChange={(e) => setLastName(e.target.value)}
                    className={`${fieldCls} w-full font-body text-[14px]`}
                  />
                </Field>
              </div>
              <Field label="Business name" className="mt-3">
                <input
                  type="text"
                  value={bizName}
                  placeholder="Business name"
                  onChange={(e) => setBizName(e.target.value)}
                  className={`${fieldCls} w-full font-body text-[14px]`}
                />
              </Field>

              {/* Not a Field: Field is a <label>, and the checkbox is one too. */}
              <div className="mt-3">
                <span
                  id="scorp-call-date"
                  className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist"
                >
                  Call date
                </span>
                <div className="flex flex-wrap items-center gap-3.5">
                  <input
                    type="date"
                    aria-labelledby="scorp-call-date"
                    value={callDate}
                    disabled={noCall}
                    onChange={(e) => setCallDate(e.target.value)}
                    className={`${fieldCls} min-w-[150px] flex-1 font-mono text-[14px] tabular-nums [color-scheme:dark] disabled:opacity-40`}
                  />
                  <Check checked={noCall} onChange={setNoCall}>
                    Not scheduled
                  </Check>
                </div>
              </div>

              <Field label="Beginning basis" className="mt-3">
                <NumInput
                  value={beginningBasis}
                  onChange={(r) => setBeginningBasis(digits(r))}
                  prefix="$"
                  align="left"
                />
              </Field>

              <Field label="Notes" className="mt-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything relevant to this client's situation…"
                  className={`${fieldCls} block min-h-[96px] w-full resize-y font-body text-[13.5px] leading-[1.45]`}
                />
              </Field>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void saveClient()}
                  disabled={busy}
                  className={primaryBtn}
                >
                  {tweakRec && tweakRec.id === currentId
                    ? "Save new salary"
                    : currentId
                      ? "Update saved client"
                      : "Save client"}
                </button>
                <button type="button" onClick={() => go("calc")} className={ghostBtn}>
                  Go to calculator
                </button>
                <button type="button" onClick={newClient} className={ghostBtn}>
                  New client
                </button>
              </div>
              {note ? <p className="mt-2.5 text-[12px] text-muted">{note}</p> : null}
              <div className="mt-3 flex items-center gap-2 text-[11px] leading-snug text-faint">
                <StatusDot tone={status.tone} />
                <span>{statusSentence}</span>
              </div>
            </Panel>
          </div>
        ) : null}

        {/* ─────────────────────────── calculator ─────────────────────────── */}
        {tab === "calc" ? (
          <>
            {tweakRec ? (
              <div className="mb-4 rounded-[16px] border border-magenta/50 bg-magenta/[0.08] px-4 py-3.5">
                <div className="font-display text-[15px] font-bold text-fog">
                  Tweaking {clientName(tweakRec)}&rsquo;s salary
                </div>
                <p className="mt-1 text-[12.5px] leading-normal text-muted">
                  Current salary {money(tweakRec.salary)} with {money(tweakRec.distribution)} in
                  distributions. Update revenue and expenses to this year&rsquo;s numbers, move
                  the salary slider, then save. A note for the client is drafted for you.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveClient()}
                    disabled={busy}
                    className={primaryBtn}
                  >
                    Save new salary
                  </button>
                  <button type="button" onClick={cancelTweak} className={ghostBtn}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : activeLabel ? (
              <Mono className="mb-4 block text-muted">
                Client: <span className="text-fog">{activeLabel}</span>
              </Mono>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <Panel title="Profit &amp; loss">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Total revenue">
                      <NumInput
                        value={revenue}
                        onChange={(r) => setRevenue(digits(r))}
                        prefix="$"
                        align="left"
                      />
                    </Field>
                    <Field label="Expenses">
                      <NumInput
                        value={expenses}
                        onChange={(r) => setExpenses(digits(r))}
                        prefix="$"
                        align="left"
                      />
                    </Field>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-edge pt-3.5">
                    <Mono className="text-muted">{profitLabel}</Mono>
                    <span className="font-display text-[30px] font-bold tabular-nums text-fog">
                      {money(profit)}
                    </span>
                  </div>
                </Panel>

                {/* go / no-go */}
                <div
                  className={`flex items-center gap-3.5 rounded-[16px] border px-4 py-3.5 ${
                    greenLight ? "border-teal/50 bg-teal/10" : "border-edge bg-panel"
                  }`}
                >
                  <span
                    className={`h-3.5 w-3.5 flex-none rounded-full ${
                      greenLight ? "bg-teal shadow-[0_0_14px_var(--color-teal)]" : "bg-dusk"
                    }`}
                  />
                  <div>
                    <div
                      className={`font-display text-[15px] font-bold ${
                        greenLight ? "text-teal" : "text-muted"
                      }`}
                    >
                      {greenLight
                        ? "Green light for the S corp election"
                        : "Hold off on the S corp for now"}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {greenLight
                        ? `Profit is above ${money(GREEN_LIGHT)} — a strong candidate.`
                        : `S corp makes sense once profit clears ${money(GREEN_LIGHT)}.`}
                    </div>
                  </div>
                </div>

                {/* salary + risk meter */}
                <Panel
                  title="Your salary (W-2 payroll)"
                  action={!belowThreshold && risk ? <Chip tone={risk.tone}>{risk.pill}</Chip> : null}
                >
                  <div className="mb-3.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="font-display text-[30px] font-bold tabular-nums text-magenta">
                      {money(salary)}
                    </span>
                    <span className="font-mono text-[12px] text-dusk">
                      {lowDist ? `${ratioPct}% of net income` : `${ratioPct}% of distributions`}
                    </span>
                    {tweakRec && salary !== tweakRec.salary ? (
                      <span className="font-mono text-[11px] text-ember">
                        was {money(tweakRec.salary)}
                      </span>
                    ) : null}
                  </div>
                  <Slider
                    value={salaryPct}
                    onChange={setSalaryPct}
                    ariaLabel="Salary as a percent of profit"
                  />
                  {profit * (salaryPct / 100) > WAGE_BASE ? (
                    <p className="mt-2 font-mono text-[10.5px] leading-snug text-faint">
                      Salary is capped at the {money(WAGE_BASE)} Social Security wage base.
                    </p>
                  ) : null}

                  {belowThreshold || !risk ? (
                    <p className="mt-3 text-[12px] leading-relaxed text-muted">
                      Below this profit level, S-corp usually isn&rsquo;t worth the complexity.
                    </p>
                  ) : (
                    <>
                      <div className="mt-3.5">
                        <Mono className="mb-1.5 block text-faint">Compare salary against</Mono>
                        <Segmented<BasisMode>
                          size="sm"
                          value={basisMode}
                          onChange={setBasisMode}
                          ariaLabel="Compare salary against"
                          className="w-full [&>button]:flex-1"
                          options={[
                            {
                              value: "auto",
                              label:
                                basisMode === "auto"
                                  ? `Auto · ${autoLowDist ? "Net income" : "Dist."}`
                                  : "Auto",
                            },
                            { value: "profit", label: "Net income" },
                            { value: "distributions", label: "Distributions" },
                          ]}
                        />
                      </div>

                      <div className="mt-3.5 flex gap-1.5">
                        {RISK_SEGMENTS.map((seg) => {
                          const on = risk.level === seg.level;
                          const [bg, text] = seg.on.split(" ");
                          return (
                            <div key={seg.level} className="flex-1 text-center">
                              <div
                                className={`h-1.5 rounded transition-colors duration-200 ${
                                  on ? bg : "bg-edge-mid"
                                }`}
                              />
                              <div
                                className={`mt-1.5 font-mono text-[8.5px] uppercase tracking-[0.5px] ${
                                  on ? text : "text-faint"
                                }`}
                              >
                                {seg.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className={`mt-3 text-[12px] leading-relaxed ${TONE_TEXT[risk.tone]}`}>
                        {risk.message}
                      </p>
                      <p className="mt-2 font-mono text-[10.5px] leading-snug text-faint">
                        {basisMode === "auto"
                          ? lowDist
                            ? `Auto: low distributions (${LOW_DIST_CUTOFF}% of profit or less) — measured against net income. Target ${targetText}.`
                            : `Auto: distributions above ${LOW_DIST_CUTOFF}% of profit — measured against distributions. Target ${targetText}.`
                          : `Manual: measured against ${lowDist ? "net income" : "distributions"}. Target ${targetText}.`}
                      </p>
                    </>
                  )}
                </Panel>
              </div>

              <div className="flex flex-col gap-4">
                {/* before / after / savings */}
                <div className="rounded-[20px] border border-magenta/35 bg-gradient-to-br from-magenta/10 to-white/[0.02] p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <Mono className="text-muted">Before · Single-member LLC</Mono>
                    <span className="font-display text-[15px] font-bold tabular-nums text-fog">
                      {money(before)}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-baseline justify-between gap-3 border-b border-edge pb-3.5">
                    <Mono className="text-muted">After · S corp</Mono>
                    <span className="font-display text-[15px] font-bold tabular-nums text-fog">
                      {money(after)}
                    </span>
                  </div>
                  <div className="pt-4 text-center">
                    <Mono className="text-muted">You save per year</Mono>
                    <div className="mt-1 font-display text-[52px] font-bold leading-none tracking-[-2px] tabular-nums text-teal">
                      <MoneyFlow value={savings} />
                    </div>
                  </div>
                </div>

                {/* distributions */}
                <Panel title="Distributions (actual or projected)">
                  <NumInput
                    value={distribution}
                    onChange={(r) => setDistribution(digits(r))}
                    prefix="$"
                    align="left"
                    ariaLabel="Distributions (actual or projected)"
                  />
                  <p className="mb-3 mt-2.5 font-mono text-[12px] text-faint">
                    {distPct}% of profit
                    {tweakRec && Number(tweakRec.distribution) !== distNum
                      ? ` · was ${money(tweakRec.distribution)}`
                      : ""}
                  </p>
                  <Slider
                    value={Math.min(100, Math.max(0, distPct))}
                    onChange={(v) => setDistribution(String(Math.round((profit * v) / 100)))}
                    ariaLabel="Distributions as a percent of profit"
                  />
                  {overDistributing ? (
                    <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-ember/40 bg-ember/10 px-3 py-2.5">
                      <span aria-hidden className="text-[14px] leading-tight">
                        ⚠️
                      </span>
                      <span className="text-[11.5px] leading-relaxed text-ember">
                        Distributions exceed basis by {money(excessOverBasis)} — more than the
                        profit left after salary and employer payroll tax (
                        {money(profitAfterPayroll)}) plus beginning basis (
                        {money(a.beginningBasis)}). The excess may be taxable.
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2.5 text-[11.5px] text-faint">
                      {retained >= 0
                        ? `${money(retained)} stays in the business.`
                        : `${money(-retained)} of distributions comes from beginning basis.`}
                    </p>
                  )}
                </Panel>

                {/* save */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-edge bg-panel px-4 py-4">
                  <div className="min-w-0">
                    <div className="font-display text-[14px] font-bold text-fog">
                      {activeLabel || "No client name yet"}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      {activeLabel
                        ? `Saves ${money(salary)} salary and ${money(distNum)} in distributions`
                        : "Add a name on the Client tab to save"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveClient()}
                    disabled={busy}
                    className={primaryBtn}
                  >
                    {saveLabel}
                  </button>
                  {note ? <p className="w-full text-[12px] text-muted">{note}</p> : null}
                </div>
              </div>
            </div>

            <Disclaimer>
              Estimated self-employment / payroll tax savings only — before payroll and filing
              costs, and not a reasonable-compensation determination. Uses the 2026 SS wage base (
              {money(WAGE_BASE)}). An estimate for the conversation, not tax advice.
            </Disclaimer>
          </>
        ) : null}

        {/* ───────────────────────────── summary ──────────────────────────── */}
        {tab === "summary" ? (
          <SummaryTab sheet={summarySheet()} onBack={() => go("calc")} />
        ) : null}

        {/* ────────────────────────── saved clients ───────────────────────── */}
        {tab === "saved" ? (
          <SavedClients
            clients={clients}
            queues={queues}
            loading={loading}
            refreshing={refreshing}
            status={status}
            currentId={currentId}
            busyIds={busyIds}
            showSaved={showSaved}
            onShow={() => setShowSaved(true)}
            onHide={() => {
              setShowSaved(false);
              setExpanded({});
              setSearch("");
              setToast(null);
            }}
            onRefresh={() => void refresh()}
            expanded={expanded}
            onToggle={(key) => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
            search={search}
            onSearch={setSearch}
            sortKey={sortKey}
            onSort={setSortKey}
            noticeText={noticeText}
            onDraft={(id, text) => setDrafts((d) => ({ ...d, [id]: text }))}
            onSaveDraft={(c) => void saveDraft(c)}
            onCopyNote={(c, el) => void copyNote(c, el)}
            onNotified={(c) => void markNotified(c)}
            onCheckComplete={(c) => void checkComplete(c)}
            onTweak={startTweak}
            onOpen={openClient}
            confirmId={confirmId}
            onConfirmDelete={setConfirmId}
            onDelete={(id) => void deleteClient(id)}
            onExport={exportClients}
            onImport={(f) => void importClients(f)}
          />
        ) : null}
      </div>

      {toast && hydrated
        ? createPortal(
            <div
              role="status"
              className="fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-[120] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3.5 rounded-[10px] border border-edge-mid bg-panel-2 px-3.5 py-2.5 text-[13px] text-fog shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)]"
            >
              <span>{toast.text}</span>
              {toast.undo ? (
                <button type="button" onClick={toast.undo} className={tweakBtn}>
                  Undo
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * The client-facing summary, as the sheet they'll keep. The on-screen paper
 * and the printed page are the same HTML (see summary-sheet.ts); printing
 * hands just that document to a throwaway frame, so nothing else on the
 * portal ends up in the PDF.
 */
function SummaryTab({ sheet, onBack }: { sheet: SheetData; onBack: () => void }) {
  return (
    <div className="max-w-[760px]">
      <div
        className="overflow-hidden rounded-[16px] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] ring-1 ring-edge"
        // Safe: every user-typed string in the sheet is escaped by summarySheetHtml().
        dangerouslySetInnerHTML={{ __html: summarySheetHtml(sheet) }}
      />
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => printHtml(summaryDocument(sheet))}
          className={primaryBtn}
        >
          Print / Save as PDF
        </button>
        <button type="button" onClick={onBack} className={ghostBtn}>
          Back to calculator
        </button>
      </div>
    </div>
  );
}
