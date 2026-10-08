"use client";

/**
 * Saved plans: the team's client records under the builder, and the viewer
 * that opens one.
 *
 * Hidden by default, because this tab gets screen-shared: one client must
 * never see another's plan scroll past. Typing two or more characters in the
 * search shows only the matches; "Show all plans" reveals the full list
 * until it's hidden again. The export/backup footer only appears with the
 * list revealed, for the same reason.
 */

import { useMemo, useRef } from "react";
import { TableCell, TableHead } from "@/components/portal/widgets/ui";
import {
  money,
  policyDocHtml,
  sanitizePlanState,
  type PlanRecord,
} from "@/lib/tax-strategy/accountable-plan";
import { greatVibes } from "./font";
import { Modal, btnCls, pillCls } from "./kit";
import { PaperSheet } from "./preview";

/** Fewer characters than this and a search reveals nothing — "a" would show half the book. */
export const SEARCH_MIN = 2;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return MONTHS_SHORT[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}

function planYear(c: PlanRecord): string {
  const src = c.effectiveDate || c.state?.effectiveDate || "";
  return /^\d{4}/.test(src) ? src.slice(0, 4) : "";
}

/** "actual + mileage", in first-seen order — the original's method summary. */
export function methodsOf(c: PlanRecord): string {
  const seen: string[] = [];
  (c.vehicles || []).forEach((v) => {
    const m = v.method === "actual" ? "actual" : "mileage";
    if (!seen.includes(m)) seen.push(m);
  });
  return seen.join(" + ");
}

function LockIcon() {
  return (
    <span
      aria-hidden
      className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border border-edge-mid text-dusk"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" stroke="none" />
        <path d="M8 11V8a4 4 0 018 0v3" />
      </svg>
    </span>
  );
}

export function SavedPlans({
  plans,
  loadError,
  revealed,
  onToggleReveal,
  search,
  onSearch,
  currentId,
  saveLabel,
  saving,
  importing,
  onSave,
  onNewClient,
  onOpen,
  onPdf,
  onEdit,
  onDelete,
  onExportCsv,
  onExportJson,
  onImportFile,
}: {
  /** null while the first load is in flight. */
  plans: PlanRecord[] | null;
  loadError: boolean;
  revealed: boolean;
  onToggleReveal: () => void;
  search: string;
  onSearch: (q: string) => void;
  currentId: string | null;
  saveLabel: string;
  saving: boolean;
  importing: boolean;
  onSave: () => void;
  onNewClient: () => void;
  onOpen: (rec: PlanRecord) => void;
  onPdf: (rec: PlanRecord) => void;
  onEdit: (rec: PlanRecord) => void;
  onDelete: (rec: PlanRecord) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onImportFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const q = search.trim().toLowerCase();
  const total = plans?.length ?? 0;
  const listing = revealed || q.length >= SEARCH_MIN;

  const matches = useMemo(
    () =>
      (plans ?? []).filter(
        (c) => !q || ((c.ownerName || "") + " " + (c.businessName || "")).toLowerCase().includes(q),
      ),
    [plans, q],
  );

  let body: React.ReactNode;
  if (!listing) {
    // Still loading counts as "hidden", not "none yet" — we don't know there are none.
    const any = plans === null || total > 0;
    body = (
      <div className="flex items-center gap-3.5 px-5 py-5">
        <LockIcon />
        <div>
          <strong className="block text-[14px] font-semibold text-fog">
            {any ? "Saved plans are hidden" : "No saved plans yet"}
          </strong>
          <span className="mt-0.5 block text-[12.5px] text-dusk">
            {any
              ? "Type a client’s name above to pull up just their plan, or use Show all plans to see the full list."
              : "Fill in the plan, then use Save this client."}
          </span>
        </div>
      </div>
    );
  } else if (plans === null) {
    body = (
      <p className="px-5 py-6 text-[13px] text-dusk">
        {loadError ? "Client records couldn’t be reached. Reload the page to try again." : "Loading saved plans…"}
      </p>
    );
  } else if (!matches.length) {
    body = (
      <p className="px-5 py-6 text-[13px] text-dusk">
        {q
          ? `No clients match “${search.trim()}”.`
          : "No saved plans yet. Fill in the plan, then use Save this client."}
      </p>
    );
  } else {
    body = (
      <div className="overflow-x-auto px-2.5">
        <table className="w-full min-w-[980px] border-collapse text-[13px]">
          <thead>
            <tr>
              <TableHead align="left">Client</TableHead>
              <TableHead>Year</TableHead>
              <TableHead align="left">Home office</TableHead>
              <TableHead align="left">Vehicles</TableHead>
              <TableHead>Est. benefit</TableHead>
              <TableHead align="left">Status</TableHead>
              <TableHead align="left">Created</TableHead>
              <TableHead align="left">Actions</TableHead>
            </tr>
          </thead>
          <tbody>
            {matches.map((c) => {
              const isCurrent = c.id === currentId;
              const by = c.createdByName || c.savedByName;
              return (
                <tr key={c.id} className={isCurrent ? "bg-magenta/[0.07]" : "hover:bg-panel-2"}>
                  <TableCell align="left">
                    <span className="block font-body text-[14px] font-medium text-fog">
                      {c.ownerName || "(unnamed)"}
                    </span>
                    <span className="mt-0.5 block font-body text-[12px] text-dusk">
                      {c.businessName || "[no business name]"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-mist">{planYear(c)}</span>
                  </TableCell>
                  <TableCell align="left">
                    {c.homeOfficeIncluded ? (
                      <>
                        <span className="block font-body text-mist">
                          {c.homeOfficePct ? c.homeOfficePct + "%" : "Included"}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-dusk">{money(c.homeOfficeAnnual || 0)}</span>
                      </>
                    ) : (
                      <span className="text-faint">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell align="left">
                    {c.vehicles?.length ? (
                      <>
                        <span className="block font-body text-mist">
                          {c.vehicles.length} &middot; {methodsOf(c)}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-dusk">{money(c.vehicleAnnual || 0)}</span>
                      </>
                    ) : (
                      <span className="text-faint">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-[14px] font-semibold text-teal">{money(c.estimatedAnnualBenefit || 0)}</span>
                  </TableCell>
                  <TableCell align="left">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1px] ${
                        c.signatureComplete ? "border-teal/40 text-teal" : "border-edge-mid text-dusk"
                      }`}
                    >
                      {c.signatureComplete ? "Signed" : "Draft"}
                    </span>
                  </TableCell>
                  <TableCell align="left">
                    <span className="block font-body text-mist">{fmtShortDate(c.createdAt || c.savedAt)}</span>
                    {by ? <span className="mt-0.5 block font-body text-[12px] text-dusk">{by}</span> : null}
                  </TableCell>
                  <TableCell align="left">
                    <div className="flex items-center gap-1.5">
                      <button type="button" className={pillCls()} onClick={() => onOpen(c)}>
                        Open
                      </button>
                      <button type="button" className={pillCls()} onClick={() => onPdf(c)}>
                        PDF
                      </button>
                      <button type="button" className={pillCls()} onClick={() => onEdit(c)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={pillCls("danger")}
                        onClick={() => onDelete(c)}
                      >
                        Delete
                      </button>
                    </div>
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section aria-label="Saved plans" className="mt-6 overflow-hidden rounded-[16px] border border-edge bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-3.5 border-b border-edge px-5 py-4">
        <div className="flex items-center gap-2.5">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-fog">Saved plans</h3>
          {plans && revealed ? (
            <span className="font-mono text-[11px] font-semibold text-muted">{total}</span>
          ) : null}
        </div>
        <div className="flex flex-[1_1_420px] flex-wrap items-center justify-end gap-2 max-md:justify-start">
          <button type="button" onClick={onSave} disabled={saving} className={btnCls("teal", "sm")}>
            {saving ? "Saving…" : saveLabel}
          </button>
          <button type="button" onClick={onNewClient} className={btnCls("ghost", "sm")}>
            New client
          </button>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Find a client by name or business"
            aria-label="Find a saved plan"
            autoComplete="off"
            className="min-w-0 flex-[0_1_280px] rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)] max-md:flex-[1_1_100%]"
          />
          <button
            type="button"
            aria-pressed={revealed}
            onClick={onToggleReveal}
            className={pillCls(revealed ? "on" : "plain")}
          >
            {revealed ? "Hide plans" : "Show all plans"}
          </button>
        </div>
      </header>

      {loadError && listing && plans !== null ? (
        <p className="mx-5 mt-4 rounded-[10px] border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-danger">
          Client records couldn&rsquo;t be reached. Reload the page to try again.
        </p>
      ) : null}

      {body}

      {revealed ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-5 py-3.5">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={pillCls()} onClick={onExportCsv}>
              Export CSV
            </button>
            <button type="button" className={pillCls()} onClick={onExportJson}>
              Backup JSON
            </button>
            <button
              type="button"
              className={pillCls()}
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? "Importing…" : "Import backup"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <p className="flex-[1_1_320px] text-right text-[11.5px] leading-relaxed text-dusk max-md:text-left">
            {loadError
              ? "Client records couldn’t be reached. Reload the page to try again."
              : plans === null
                ? "Connecting to client records…"
                : "Saved to the team’s shared records — everyone with the Tax Strategy tab sees the same plans."}
          </p>
        </footer>
      ) : null}
    </section>
  );
}

/** A saved plan's policy, read-only, with PDF and Edit to hand. */
export function PlanViewer({
  rec,
  onClose,
  onPdf,
  onEdit,
}: {
  rec: PlanRecord;
  onClose: () => void;
  onPdf: () => void;
  onEdit: () => void;
}) {
  const html = useMemo(() => policyDocHtml(sanitizePlanState(rec.state)), [rec]);
  const sub =
    (rec.businessName || "") +
    (rec.businessName ? " · " : "") +
    "Est. benefit " +
    money(rec.estimatedAnnualBenefit || 0) +
    (rec.signatureComplete ? " · Signed" : " · Draft");
  return (
    <Modal
      onClose={onClose}
      labelledBy="ap-viewer-title"
      className={`${greatVibes.variable} flex max-h-full w-full max-w-[860px] flex-col overflow-hidden`}
    >
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-edge px-[18px] py-3.5">
        <div className="min-w-0">
          <strong id="ap-viewer-title" className="block text-[15px] font-semibold text-fog">
            {rec.ownerName || rec.businessName || "Client"}
          </strong>
          <span className="mt-0.5 block text-[12px] text-dusk">{sub}</span>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={pillCls()} onClick={onPdf}>
            PDF
          </button>
          <button type="button" className={pillCls()} onClick={onEdit}>
            Edit
          </button>
          <button type="button" className={pillCls()} onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
      </div>
      <PaperSheet html={html} className="min-h-0 flex-auto" />
    </Modal>
  );
}
