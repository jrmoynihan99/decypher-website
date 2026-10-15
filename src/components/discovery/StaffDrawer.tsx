"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Field, SelectInput } from "@/components/portal/widgets/ui";
import { fieldCls } from "@/components/portal/widgets/scorp/parts";
import { LISTS, type DiscoveryTeam } from "@/lib/discovery/schema";

/**
 * The staff drawer on the call: advisor, fit, next step, notes, the Fathom
 * link, the talking points that build as the creator answers, and the
 * practice flag. Opened by the lock in the header or the \ key, closed by
 * default, and nothing of it is in the DOM while closed — this screen is
 * shared with the creator. Everything but the practice flag is also editable
 * afterwards in the Setter Answers tab; the practice flag is fixed at the
 * first save, so it locks once the call is saved.
 */

export type StaffState = DiscoveryTeam & {
  practice: boolean;
  /** The fit was set by the call (not a US filer), not by hand, so a changed answer may clear it. */
  autoFit: boolean;
};

const FIT_ON: Record<string, string> = {
  good: "bg-teal text-night",
  maybe: "bg-ember text-night",
  not_fit: "bg-magenta text-white",
};

export default function StaffDrawer({
  open,
  onClose,
  staff,
  onChange,
  advisors,
  points,
  saved,
}: {
  open: boolean;
  onClose: () => void;
  staff: StaffState;
  onChange: (patch: Partial<StaffState>) => void;
  advisors: string[];
  points: string[];
  saved: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => document.querySelector<HTMLElement>("[data-staff-drawer] select")?.focus({ preventScroll: true }), 300);
    return () => clearTimeout(t);
  }, [open]);

  const advisorOptions = [...new Set([...advisors, staff.advisor].filter((n): n is string => !!n))];

  return createPortal(
    <aside
      data-staff-drawer
      aria-label="Staff notes"
      aria-hidden={!open}
      className={`fixed inset-y-0 right-0 z-[50] w-[min(370px,100vw)] overflow-y-auto border-l border-edge bg-panel px-[18px] pb-[calc(20px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))] text-fog shadow-[-20px_0_50px_rgba(0,0,0,.35)] transition-[transform,visibility] duration-[280ms] ease-[cubic-bezier(.2,.7,.2,1)] ${
        open ? "visible translate-x-0" : "invisible translate-x-[102%]"
      }`}
    >
      {open ? (
        <>
          <div className="mb-3.5 flex items-start justify-between gap-2.5">
            <div>
              <b className="block text-[15px] font-semibold text-fog">Staff only</b>
              <span className="mt-0.5 block text-[12.5px] text-dusk">Close this before you share your screen.</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close staff notes"
              className="h-[34px] w-[34px] cursor-pointer rounded-full border-0 bg-transparent text-[1.4rem] leading-none text-dusk hover:bg-panel-2 hover:text-fog"
            >
              ×
            </button>
          </div>

          {saved ? <p className="m-0 mb-3 font-mono text-[10.5px] tracking-[0.08em] text-teal">[ SAVED // CHANGES SAVE AS YOU GO ]</p> : null}

          <Field label="Advisor" className="mb-3.5">
            <SelectInput value={staff.advisor ?? ""} onChange={(e) => onChange({ advisor: e.target.value || null })}>
              <option value="">Choose</option>
              {advisorOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SelectInput>
          </Field>

          <div className="mb-3.5">
            <span className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist">Fit</span>
            <div role="radiogroup" aria-label="Fit" className="grid grid-cols-3 gap-1 rounded-[10px] border border-edge-mid bg-panel-2 p-[3px]">
              {LISTS.fit.map(([v, label]) => {
                const on = staff.fit === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange({ fit: on ? null : v })}
                    className={`cursor-pointer rounded-[7px] border-0 px-1 py-2 text-[12.5px] transition-colors ${on ? FIT_ON[v] : "bg-transparent text-muted hover:text-fog"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {staff.fit === "not_fit" ? (
            <Field label="Why not" className="mb-3.5">
              <SelectInput value={staff.fitReason ?? ""} onChange={(e) => onChange({ fitReason: e.target.value || null })}>
                <option value="">Choose</option>
                {LISTS.fit_reason.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}

          <Field label="Next step" className="mb-3.5">
            <SelectInput value={staff.nextStep ?? ""} onChange={(e) => onChange({ nextStep: e.target.value || null })}>
              <option value="">Choose</option>
              {LISTS.next_step.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Call notes" className="mb-3.5">
            <textarea
              value={staff.notes ?? ""}
              onChange={(e) => onChange({ notes: e.target.value || null })}
              placeholder="What to recap on the next call"
              maxLength={5000}
              className={`${fieldCls} block min-h-[120px] w-full resize-y font-body text-[13.5px] leading-relaxed`}
            />
          </Field>

          <Field label="Fathom link" className="mb-3.5">
            <input
              type="text"
              value={staff.fathom ?? ""}
              onChange={(e) => onChange({ fathom: e.target.value || null })}
              placeholder="https://fathom.video/…"
              autoComplete="off"
              maxLength={200}
              className={`${fieldCls} w-full font-body text-[13.5px]`}
            />
          </Field>

          <div className="mb-3.5">
            <span className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist">Talking points</span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {points.length ? (
                points.map((t) => (
                  <li key={t} className="rounded-[9px] border-l-2 border-ember bg-panel-2 px-2.5 py-2 text-[13px] leading-[1.4] text-fog">
                    {t}
                  </li>
                ))
              ) : (
                <li className="rounded-[9px] border-l-2 border-edge bg-panel-2 px-2.5 py-2 text-[13px] text-dusk">These fill in as they answer.</li>
              )}
            </ul>
          </div>

          <label className={`inline-flex items-center gap-2.5 text-[13px] text-mist ${saved ? "opacity-60" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={staff.practice}
              disabled={saved}
              onChange={(e) => onChange({ practice: e.target.checked })}
              className="h-4 w-4 flex-none cursor-pointer accent-magenta disabled:cursor-default"
            />
            Practice call (kept out of real numbers){saved ? " · set at the first save" : ""}
          </label>
        </>
      ) : null}
    </aside>,
    document.body,
  );
}
