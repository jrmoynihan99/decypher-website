"use client";

/**
 * Accountable Plan Builder — the S-corp home office and vehicle
 * reimbursement plan, from questions to a signed policy.
 *
 * Staff walk the client through five steps; the right column recommends the
 * method that gets the strongest defensible deduction (Actual Expense for a
 * dedicated office; mileage vs actual, depreciation included, per vehicle),
 * totals the estimated annual benefit, and drafts the written policy live.
 * Review & Sign adds the e-signature, and the plan leaves as a printed PDF,
 * HTML or text, plus an .xlsx tracker the client fills in each period.
 *
 * Ported from a standalone page that kept its records in an artifact
 * database. The server is the store now — the team's saved plans live in
 * Firestore behind the Tax Strategy tab, and the engine (rates, maths, the
 * policy wording) lives in lib/tax-strategy/accountable-plan so the API can
 * recompute every record's figures itself.
 *
 * The plan in progress autosaves to this browser as a draft — a reload or a
 * dropped call doesn't lose an hour's answers — and `_clientId` ties that
 * draft to the saved record it came from, so Save updates rather than
 * duplicates. Storage is optional: blocked or full, the builder still works,
 * it just forgets on reload.
 *
 * Errors show once a field has been edited or Continue has been tried, not on
 * a blank form — the tab is screen-shared, and a fresh plan shouldn't open
 * in red. The validation rules themselves are the original's.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { downloadFile, printHtml, safeFileBase } from "@/lib/print-html";
import { XLSX_MIME } from "@/lib/xlsx-lite";
import {
  STEPS,
  computeAll,
  defaultPlanState,
  documentPlainText,
  documentStandaloneHtml,
  isValidPlanId,
  policyDocHtml,
  sanitizePlanState,
  todayIso,
  validateStep,
  type PlanRecord,
  type PlanState,
} from "@/lib/tax-strategy/accountable-plan";
import * as api from "./accountable-plan/api";
import { greatVibes } from "./accountable-plan/font";
import { ConfirmModal, Toast, btnCls, useToast, type ConfirmOptions } from "./accountable-plan/kit";
import { PAPER_CSS, ResultsColumn } from "./accountable-plan/preview";
import { PlanViewer, SavedPlans } from "./accountable-plan/records";
import {
  BusinessStep,
  HomeOfficeStep,
  ReviewStep,
  TimingStep,
  VehicleStep,
  type StepProps,
} from "./accountable-plan/steps";
import { buildTrackerXlsx } from "./accountable-plan/tracker";

const DRAFT_KEY = "dcy-accountable-plan-draft-v1";

function readDraft(): PlanState {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw) return sanitizePlanState(JSON.parse(raw));
  } catch {
    /* storage blocked, or a corrupt draft — start fresh */
  }
  return defaultPlanState();
}

function writeDraft(state: PlanState): boolean {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage blocked */
  }
}

const NONE_ATTEMPTED = STEPS.map(() => false);

/** Newest save first — the order the server lists them in. */
function upsert(list: PlanRecord[] | null, rec: PlanRecord): PlanRecord[] {
  return [rec, ...(list ?? []).filter((r) => r.id !== rec.id)].sort((a, b) =>
    (b.savedAt ?? "").localeCompare(a.savedAt ?? ""),
  );
}

/** A cell a spreadsheet won't execute: a leading = + - @ tab or CR is defused with a quote. */
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function formatSavedDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.getMonth() + 1 + "/" + d.getDate() + "/" + d.getFullYear();
}

const scrollToTop = () => {
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    window.scrollTo(0, 0);
  }
};

/**
 * Client-only: the draft lives in localStorage and the dialogs portal to
 * <body>, neither of which exists in a server render. The workbench mounts
 * tools on click anyway; this keeps the builder honest if that changes.
 */
export default function AccountablePlanBuilder() {
  const hydrated = useHydrated();
  if (!hydrated) return <div aria-busy="true" className="min-h-[60vh]" />;
  return <Builder />;
}

function Builder() {
  const [plan, setPlan] = useState<PlanState>(readDraft);
  const [step, setStep] = useState(0);
  /** Steps whose Continue/Finalize has been tried — their errors all show. */
  const [attempted, setAttempted] = useState<boolean[]>(NONE_ATTEMPTED);
  /** Fields edited since the plan was loaded — their errors show live. */
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  /** Bumped when a different plan is swapped in, remounting the form's local state. */
  const [formKey, setFormKey] = useState(0);
  const { message, visible, showToast } = useToast();
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const [plans, setPlans] = useState<PlanRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [search, setSearch] = useState("");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  /** Only edits autosave — loading or clearing a plan writes (or clears) the draft itself. */
  const dirty = useRef(false);
  /** The next autosave is bookkeeping (linking the draft to its record), not an edit: no toast. */
  const quietDraft = useRef(false);

  const all = useMemo(() => computeAll(plan), [plan]);
  const docHtml = useMemo(() => policyDocHtml(plan), [plan]);
  const errs = useMemo(() => validateStep(plan, step), [plan, step]);

  const update = useCallback((fn: (p: PlanState) => PlanState) => {
    dirty.current = true;
    setPlan(fn);
  }, []);

  const touch = useCallback((key: string) => {
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const err = (key: string) => (attempted[step] || touched.has(key) ? errs[key] : undefined);

  // Draft autosave, debounced as the original (400ms after the last edit).
  useEffect(() => {
    if (!dirty.current) return;
    const quiet = quietDraft.current;
    quietDraft.current = false;
    const t = setTimeout(
      () => {
        if (writeDraft(plan) && !quiet) showToast("Draft saved on this device");
      },
      quiet ? 0 : 400,
    );
    return () => clearTimeout(t);
  }, [plan, showToast]);

  // The team's saved plans, once per mount.
  useEffect(() => {
    let alive = true;
    api
      .listPlans()
      .then((list) => {
        if (alive) setPlans(list);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // A wheel over a focused number input would nudge its value; blur it so
  // the wheel scrolls the page instead (passive — never blocks scrolling).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === "number") t.blur();
    };
    root.addEventListener("wheel", onWheel, { passive: true });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  /* ───────────────────────────── navigation ───────────────────────────── */

  const goToStep = (i: number) => {
    setStep(i);
    scrollToTop();
  };

  /** Show every error on the current step and put the cursor in the first bad field. */
  const flagStep = () => {
    setAttempted((a) => a.map((v, i) => (i === step ? true : v)));
    requestAnimationFrame(() => {
      stepRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  };

  const next = () => {
    if (Object.keys(errs).length) return flagStep();
    goToStep(step + 1);
  };

  const finalize = () => {
    if (Object.keys(errs).length) return flagStep();
    showToast("Looks good — use the document panel to print or download");
  };

  /** Swap in a whole plan (a saved record, or a blank one) and start it at step 1. */
  const loadPlan = (incoming: PlanState, persist: boolean) => {
    dirty.current = false;
    setPlan(incoming);
    setStep(0);
    setAttempted(NONE_ATTEMPTED);
    setTouched(new Set());
    setFormKey((k) => k + 1);
    if (persist) writeDraft(incoming);
    else clearDraft();
  };

  /** Point the draft at a record (or at none) without an edit toast. */
  const linkDraft = (id: string | null) => {
    dirty.current = true;
    quietDraft.current = true;
    setPlan((p) => ({ ...p, _clientId: id }));
  };

  const hideRecords = () => {
    setRevealed(false);
    setSearch("");
  };

  const startOver = () =>
    setConfirm({
      title: "Start over?",
      message: "This clears everything you've entered on this device. This can't be undone.",
      confirmLabel: "Clear everything",
      danger: true,
      onConfirm: () => loadPlan(defaultPlanState(), false),
    });

  const newClient = () =>
    setConfirm({
      title: "Start a new client?",
      message:
        "This clears the form so you can start fresh. Saved client records aren't affected — save the current client first if you've made changes.",
      confirmLabel: "Start new client",
      danger: false,
      onConfirm: () => {
        hideRecords();
        loadPlan(defaultPlanState(), false);
      },
    });

  /* ───────────────────────────── documents ───────────────────────────── */

  const fileBase = () => safeFileBase(plan.businessName, "Accountable_Plan");

  const downloadPolicy = (kind: "html" | "txt") => {
    const filename = fileBase() + "_Accountable_Plan_Policy." + kind;
    if (kind === "html") downloadFile(documentStandaloneHtml(plan), filename, "text/html;charset=utf-8");
    else downloadFile(documentPlainText(plan), filename, "text/plain;charset=utf-8");
    showToast("Saved " + filename);
  };

  const downloadTracker = () => {
    if (!plan.homeOffice.included && !plan.vehicles.included) {
      showToast("Add a home office or vehicle first");
      return;
    }
    try {
      const bytes = buildTrackerXlsx(plan);
      const filename = fileBase() + "_Reimbursement_Tracker.xlsx";
      downloadFile(new Blob([bytes], { type: XLSX_MIME }), filename);
      showToast("Saved " + filename);
    } catch (e) {
      console.error("[accountable-plan] tracker build failed:", e);
      showToast("Couldn't build the tracker");
    }
  };

  /* ───────────────────────────── records ───────────────────────────── */

  // While the list is loading, a linked draft is assumed to still have its record.
  const recordExists = plan._clientId
    ? plans
      ? plans.some((r) => r.id === plan._clientId)
      : true
    : false;

  const saveClient = async () => {
    if (!plan.ownerName.trim() && !plan.businessName.trim()) {
      showToast("Add the client's name or business first");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      let rec: PlanRecord | "missing" = "missing";
      if (plan._clientId) rec = await api.updatePlan(plan._clientId, plan);
      const updated = rec !== "missing";
      // No link yet, or the record was deleted underneath this draft: a new one.
      if (rec === "missing") rec = await api.createPlan(plan);
      const saved = rec;
      setPlans((list) => upsert(list, saved));
      if (saved.id !== plan._clientId) linkDraft(saved.id);
      showToast((updated ? "Updated " : "Saved ") + (saved.ownerName || saved.businessName || "client"));
    } catch (e) {
      showToast(api.failureMessage(e, "Couldn't save — try again"));
    } finally {
      setSaving(false);
    }
  };

  const editRecord = (rec: PlanRecord) => {
    setViewerId(null);
    hideRecords();
    loadPlan({ ...sanitizePlanState(rec.state), _clientId: rec.id }, true);
    showToast("Opened " + (rec.ownerName || rec.businessName || "client"));
    scrollToTop();
  };

  const printRecord = (rec: PlanRecord) => printHtml(documentStandaloneHtml(sanitizePlanState(rec.state)));

  const deleteRecord = (rec: PlanRecord) => {
    const who = rec.ownerName || rec.businessName || "this client";
    setConfirm({
      title: "Delete this client record?",
      message:
        "This removes " +
        who +
        " from the team's client records for everyone. This can't be undone — export a backup first if you might need it.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        try {
          await api.deletePlan(rec.id);
        } catch (e) {
          // Already gone (a teammate got there first) is the outcome we wanted.
          if (!(e instanceof api.ApiError && e.status === 404)) {
            showToast(api.failureMessage(e, "Couldn't delete — try again"));
            return;
          }
        }
        setPlans((list) => (list ?? []).filter((r) => r.id !== rec.id));
        if (plan._clientId === rec.id) linkDraft(null);
        setViewerId((v) => (v === rec.id ? null : v));
        showToast("Deleted");
      },
    });
  };

  // `plans` is kept newest-save-first (server order, upsert keeps it), as the exports want.
  const exportCsv = () => {
    const list = plans ?? [];
    if (!list.length) {
      showToast("No client records to export yet");
      return;
    }
    const head = ["Client", "Business", "State", "Effective date", "Reimbursement frequency", "Home office", "Home office %", "Home office annual", "Vehicles", "Vehicle methods", "Vehicle annual", "Depreciation (year 1)", "Est. annual benefit", "Signer", "Signer title", "Date signed", "Signature complete", "Last saved", "Saved by"];
    const rows = [head.map(csvCell).join(",")];
    list.forEach((c) => {
      rows.push(
        [
          c.ownerName, c.businessName, c.entityState, c.effectiveDate, c.reimbursementFrequency,
          c.homeOfficeIncluded ? "Yes" : "No", c.homeOfficeIncluded ? c.homeOfficePct : "", c.homeOfficeAnnual,
          c.vehicleCount || 0, (c.vehicles || []).map((v) => (v.label || "Vehicle") + ": " + v.method).join("; "),
          c.vehicleAnnual, c.depreciationAnnual, c.estimatedAnnualBenefit,
          c.signerName, c.signerTitle, c.signDate, c.signatureComplete ? "Yes" : "No",
          formatSavedDate(c.savedAt), c.savedByName,
        ]
          .map(csvCell)
          .join(","),
      );
    });
    const filename = "accountable_plan_client_records_" + todayIso() + ".csv";
    // The BOM is for Excel, which otherwise reads UTF-8 names as Latin-1.
    downloadFile("﻿" + rows.join("\r\n"), filename, "text/csv;charset=utf-8");
    showToast("Saved " + filename);
  };

  const exportJson = () => {
    const list = plans ?? [];
    if (!list.length) {
      showToast("No client records to export yet");
      return;
    }
    const clients: Record<string, PlanRecord> = {};
    list.forEach((r) => {
      clients[r.id] = r;
    });
    const payload = { kind: "accountablePlanClientsBackup", version: 3, exportedAt: new Date().toISOString(), clients };
    const filename = "accountable_plan_clients_backup_" + todayIso() + ".json";
    downloadFile(JSON.stringify(payload, null, 2), filename, "application/json");
    showToast("Saved " + filename);
  };

  /**
   * Merge a backup into the team's records, one record at a time (as the
   * original did) so a failure partway keeps what already landed. Accepts
   * this tool's backups and the standalone builder's — anything shaped
   * { clients: { id: { state, … } } }.
   */
  const importBackup = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      showToast("Couldn't read that file");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      showToast("That file isn't valid backup JSON");
      return;
    }
    const clients = (parsed as { clients?: unknown } | null)?.clients;
    if (!clients || typeof clients !== "object") {
      showToast("That file isn't a recognized backup");
      return;
    }
    const entries = Object.entries(clients as Record<string, unknown>).filter(
      ([, r]) => r && typeof r === "object" && (r as { state?: unknown }).state,
    );
    setImporting(true);
    let count = 0;
    try {
      for (const [key, raw] of entries) {
        const r = raw as Record<string, unknown>;
        const id = isValidPlanId(r.id) ? r.id : isValidPlanId(key) ? key : undefined;
        const rec = await api.importPlan({ ...r, id });
        count++;
        setPlans((list) => upsert(list, rec));
      }
      if (!count) showToast("No clients found in that file");
      else showToast("Imported " + count + " client" + (count === 1 ? "" : "s"));
    } catch (e) {
      console.error("[accountable-plan] import stopped:", e);
      showToast("Import stopped partway — try again");
    } finally {
      setImporting(false);
    }
  };

  const viewerRec = viewerId ? (plans?.find((r) => r.id === viewerId) ?? null) : null;

  /* ───────────────────────────── render ───────────────────────────── */

  const stepProps: StepProps = { plan, all, err, touch, update };
  const stepId = STEPS[step].id;

  return (
    <div ref={rootRef} className={greatVibes.variable}>
      <style>{PAPER_CSS}</style>

      {/* The baseline is on the wrapper: the scroller clips its own border box,
          so tabs couldn't overlap a border drawn on it. */}
      <div className="border-b border-edge">
        <nav
          aria-label="Plan steps"
          className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {STEPS.map((s, i) => {
            const active = i === step;
            const done = i < step && Object.keys(validateStep(plan, i)).length === 0;
            return (
              <button
                key={s.id}
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => goToStep(i)}
                className={`flex flex-none cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.8px] transition-colors duration-150 ${
                  active ? "border-magenta text-fog" : "border-transparent text-dusk hover:text-mist"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold ${
                    active ? "bg-magenta text-white" : done ? "bg-teal text-night" : "bg-panel-2 text-dusk"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                {s.label}
                {done ? <span className="sr-only"> (complete)</span> : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div ref={stepRef} className="min-w-0 rounded-[16px] border border-edge bg-panel px-5 pb-5 pt-6 sm:px-6">
          <div key={formKey}>
            {stepId === "business" ? <BusinessStep {...stepProps} /> : null}
            {stepId === "homeoffice" ? <HomeOfficeStep {...stepProps} /> : null}
            {stepId === "vehicle" ? <VehicleStep {...stepProps} /> : null}
            {stepId === "substantiation" ? <TimingStep {...stepProps} /> : null}
            {stepId === "review" ? <ReviewStep {...stepProps} onDownloadTracker={downloadTracker} /> : null}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div>
              {step > 0 ? (
                <button type="button" onClick={() => goToStep(step - 1)} className={btnCls("ghost")}>
                  Back
                </button>
              ) : (
                <button type="button" onClick={startOver} className={btnCls("ghost")}>
                  Start over
                </button>
              )}
            </div>
            <div>
              {stepId === "review" ? (
                <button type="button" onClick={finalize} className={btnCls("teal")}>
                  Finalize
                </button>
              ) : (
                <button type="button" onClick={next} className={btnCls("primary")}>
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>

        <ResultsColumn
          plan={plan}
          all={all}
          docHtml={docHtml}
          saveLabel={recordExists ? "Update client record" : "Save to client records"}
          saving={saving}
          onPrint={() => printHtml(documentStandaloneHtml(plan))}
          onSave={() => void saveClient()}
          onDownloadHtml={() => downloadPolicy("html")}
          onDownloadText={() => downloadPolicy("txt")}
        />
      </div>

      <SavedPlans
        plans={plans}
        loadError={loadError}
        revealed={revealed}
        onToggleReveal={() => {
          if (revealed) setSearch("");
          setRevealed(!revealed);
        }}
        search={search}
        onSearch={setSearch}
        currentId={plan._clientId ?? null}
        saveLabel={recordExists ? "Update this client’s record" : "Save this client"}
        saving={saving}
        importing={importing}
        onSave={() => void saveClient()}
        onNewClient={newClient}
        onOpen={(rec) => setViewerId(rec.id)}
        onPdf={printRecord}
        onEdit={editRecord}
        onDelete={deleteRecord}
        onExportCsv={exportCsv}
        onExportJson={exportJson}
        onImportFile={(f) => void importBackup(f)}
      />

      {viewerRec ? (
        <PlanViewer
          rec={viewerRec}
          onClose={() => setViewerId(null)}
          onPdf={() => printRecord(viewerRec)}
          onEdit={() => editRecord(viewerRec)}
        />
      ) : null}

      {confirm ? <ConfirmModal opts={confirm} onClose={() => setConfirm(null)} /> : null}
      <Toast message={message} visible={visible} />
    </div>
  );
}
