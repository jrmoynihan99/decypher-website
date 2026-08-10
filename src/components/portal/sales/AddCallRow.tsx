"use client";

/**
 * Add a row by hand.
 *
 * Almost every row in this tool arrives from Calendly. This is for the ones
 * that don't: a call booked in a DM, a lead that came in by phone, a deal being
 * back-filled from memory. Without it the only way to get such a deal into the
 * pipeline is to not have it there at all, which is how a parallel spreadsheet
 * starts.
 *
 * It collects the identity half of a row only — who, when, which call type, and
 * the two triage checkboxes. Everything on the Deal Desk and Referrals tabs is
 * left empty and filled in through the grid like any other row: one code path
 * for operator fields, one set of rules validating them.
 *
 * THE DUPLICATE WARNING IS A PROMPT, NOT A BLOCK. The same person legitimately
 * books twice, and a second discovery call six months later is a second row
 * everywhere else in this system. So a matching email surfaces the row it
 * matched, with its date, and lets a human decide — rather than silently
 * merging, or silently refusing.
 */

import { useMemo, useState } from "react";
import { CALL_TYPES, CALL_TYPE_LABELS } from "@/lib/sales/options";
import type { CallType } from "@/lib/sales/options";
import type { SalesCallRow } from "@/lib/sales/types";
import { Mono, Panel } from "@/components/portal/widgets/ui";

export interface ManualCallDraft {
  name: string;
  email: string;
  phone: string;
  socials: string;
  callType: CallType;
  bookedAt: string;
  isSales: boolean;
  isReferral: boolean;
}

const inputCls =
  "w-full rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

/** Today as yyyy-mm-dd in the operator's own timezone, not UTC's. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function AddCallRow({
  calls,
  onAdd,
  onClose,
}: {
  /** Every row in memory — the duplicate check runs against it, no round trip. */
  calls: SalesCallRow[];
  onAdd: (draft: ManualCallDraft) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ManualCallDraft>({
    name: "",
    email: "",
    phone: "",
    socials: "",
    // The qualified discovery call is the overwhelming majority of the pipeline.
    callType: "qualified",
    bookedAt: today(),
    isSales: true,
    isReferral: false,
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ManualCallDraft>(key: K, value: ManualCallDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const duplicates = useMemo(() => {
    const email = draft.email.trim().toLowerCase();
    if (!email.includes("@")) return [];
    return calls.filter((c) => c.email.toLowerCase() === email).slice(0, 3);
  }, [calls, draft.email]);

  const valid =
    (draft.name.trim() || draft.email.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(draft.bookedAt);

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const ok = await onAdd(draft);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Panel
      title="Add a row by hand"
      action={
        <Mono className="text-faint">not from calendly · never overwritten by a sync</Mono>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <Mono className="text-dusk">Name</Mono>
          <input
            autoFocus
            value={draft.name}
            placeholder="Who booked"
            onChange={(e) => set("name", e.target.value)}
            className={`mt-1.5 ${inputCls}`}
          />
        </label>

        <label className="block">
          <Mono className="text-dusk">Email</Mono>
          <input
            type="email"
            value={draft.email}
            placeholder="name@example.com"
            onChange={(e) => set("email", e.target.value)}
            className={`mt-1.5 ${inputCls}`}
          />
        </label>

        <label className="block">
          <Mono className="text-dusk">Phone</Mono>
          <input
            value={draft.phone}
            placeholder="Optional"
            onChange={(e) => set("phone", e.target.value)}
            className={`mt-1.5 ${inputCls}`}
          />
        </label>

        <label className="block">
          <Mono className="text-dusk">Call type</Mono>
          <select
            value={draft.callType}
            onChange={(e) => set("callType", e.target.value as CallType)}
            className={`mt-1.5 cursor-pointer appearance-none ${inputCls}`}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%238f88a0' stroke-width='2'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 11px center",
            }}
          >
            {CALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {CALL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <Mono className="text-dusk">Date booked</Mono>
          <input
            type="date"
            value={draft.bookedAt}
            onChange={(e) => set("bookedAt", e.target.value)}
            className={`mt-1.5 ${inputCls} font-mono tabular-nums [color-scheme:dark]`}
          />
        </label>

        <label className="block">
          <Mono className="text-dusk">Website / social</Mono>
          <input
            value={draft.socials}
            placeholder="Optional"
            onChange={(e) => set("socials", e.target.value)}
            className={`mt-1.5 ${inputCls}`}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-edge pt-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={draft.isSales}
            onChange={(e) => set("isSales", e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-magenta"
          />
          <span className="font-body text-[13px] text-mist">Sales call</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={draft.isReferral}
            onChange={(e) => set("isReferral", e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-magenta"
          />
          <span className="font-body text-[13px] text-mist">Referral</span>
        </label>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[10px] border border-edge-mid px-4 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk hover:text-fog"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || saving}
            onClick={submit}
            className="cursor-pointer rounded-[10px] bg-magenta px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.8px] text-white transition-opacity disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add row"}
          </button>
        </div>
      </div>

      {duplicates.length ? (
        <div className="mt-4 rounded-[10px] border border-ember/40 bg-ember/[0.07] px-3.5 py-2.5 text-[12.5px] text-mist">
          <span className="font-medium text-ember">Already in the pipeline.</span>{" "}
          {duplicates.length === 1 ? "One row uses" : `${duplicates.length} rows use`} that
          email:{" "}
          {duplicates.map((d, i) => (
            <span key={d.id}>
              {i > 0 ? ", " : ""}
              <span className="text-fog">{d.name || "—"}</span>
              {d.bookedAt
                ? ` (${new Date(d.bookedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })})`
                : ""}
            </span>
          ))}
          . Adding this creates a second row — fine for a repeat booking, not for
          a correction.
        </div>
      ) : null}
    </Panel>
  );
}
