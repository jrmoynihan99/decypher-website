"use client";

/**
 * Form pieces the Accountable Plan Builder needs and the shared widget kit
 * (widgets/ui.tsx) doesn't have: inline validation, choice cards, a typed or
 * picked date, a confirm dialog and a toast. Built from the same tokens and
 * radius scale as the kit, so they read as the same product.
 *
 * Why not the kit's `NumInput` for money: it takes no placeholder and has no
 * invalid state, and this form leans on both — "e.g., 1150" is what tells
 * staff a field is per month rather than per year, and the purchase price
 * and capitalized cost carry inline errors. `MoneyInput` below is the same
 * caret-preserving grouped input with those two additions.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Switch } from "@/components/portal/widgets/ui";
import { toRaw, withCommas } from "@/lib/widget-format";
import { digitsToDisplay, digitsToIso, isoToDisplay } from "@/lib/tax-strategy/accountable-plan";

/* ─────────────────────────────── buttons ─────────────────────────────── */

const btnBase =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] font-mono uppercase tracking-[0.8px] transition-[opacity,border-color,color,background-color] duration-150 disabled:cursor-default disabled:opacity-40";

/** `primary` magenta, `teal` for save/confirm-safe, `ghost` outlined. */
export function btnCls(kind: "primary" | "teal" | "ghost", size: "md" | "sm" = "md"): string {
  const pad = size === "sm" ? "px-3.5 py-2 text-[10.5px]" : "px-5 py-2.5 text-[11px]";
  const look =
    kind === "primary" ? "bg-magenta font-bold text-white hover:opacity-90"
    : kind === "teal" ? "bg-teal font-bold text-night hover:opacity-90"
    : "border border-edge-mid text-muted hover:border-magenta hover:text-fog";
  return `${btnBase} ${pad} ${look}`;
}

/**
 * The small pill actions in the records table and the viewer header. Toned
 * here rather than by appending classes at the call site: two utilities for
 * the same property resolve by stylesheet order, not by class order.
 */
export function pillCls(tone: "plain" | "danger" | "on" = "plain"): string {
  const look =
    tone === "danger" ? "border-edge-mid text-mist hover:border-danger hover:text-danger"
    : tone === "on" ? "border-magenta/50 text-magenta hover:border-magenta"
    : "border-edge-mid text-mist hover:border-mist hover:text-fog";
  return `cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1px] no-underline transition-colors disabled:cursor-default disabled:opacity-50 ${look}`;
}

/* ─────────────────────────────── layout ─────────────────────────────── */

export function StepHeader({
  step,
  title,
  children,
}: {
  step: number;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-magenta">
        Step {step} of 5
      </div>
      <h2 className="mb-2 font-display text-[22px] font-bold text-fog">{title}</h2>
      <p className="mb-5 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">{children}</p>
    </>
  );
}

/** Mono caps divider between groups of questions. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 border-t border-edge pt-4 font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-dusk">
      {children}
    </div>
  );
}

/** The lead-in question above a row of choice cards. */
export function Prompt({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">{children}</p>;
}

export function Hint({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[12px] leading-relaxed text-dusk ${className}`}>{children}</p>;
}

/** An error that belongs to a group (choice cards, the vehicle list) rather than one input. */
export function GroupError({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={`-mt-2 mb-4 text-[12px] text-danger ${className}`}>{children}</p>;
}

/* ─────────────────────────────── callouts ─────────────────────────────── */

const calloutTone = {
  teal: { box: "border-teal/40 bg-teal/10", dot: "bg-teal", title: "text-teal" },
  amber: { box: "border-ember/40 bg-ember/10", dot: "bg-ember", title: "text-ember" },
  neutral: { box: "border-edge bg-panel-2", dot: "bg-dusk", title: "text-fog" },
} as const;

/** Dot + bold line + body. Teal for good news, amber (ember) for "not yet", neutral for facts. */
export function InfoCallout({
  tone,
  title,
  children,
  className = "",
}: {
  tone: keyof typeof calloutTone;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = calloutTone[tone];
  return (
    <div className={`mb-4 flex items-start gap-3 rounded-[10px] border px-4 py-3.5 text-[13px] leading-relaxed ${t.box} ${className}`}>
      <span aria-hidden className={`mt-[5px] h-[9px] w-[9px] flex-none rounded-full ${t.dot}`} />
      <div className="min-w-0">
        <strong className={`mb-0.5 block text-[13.5px] font-semibold ${t.title}`}>{title}</strong>
        {children ? <div className="text-mist">{children}</div> : null}
      </div>
    </div>
  );
}

/* ─────────────────────────────── controls ─────────────────────────────── */

/** A labelled switch on its own row — "Include home office reimbursement". */
export function ToggleRow({
  title,
  desc,
  checked,
  onChange,
  className = "mb-5",
}: {
  title: string;
  desc: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-[10px] border border-edge bg-panel-2 px-4 py-3.5 ${className}`}
    >
      <div className="min-w-0">
        <strong className="mb-0.5 block text-[14px] font-semibold text-fog">{title}</strong>
        <span className="block text-[12.5px] leading-relaxed text-dusk">{desc}</span>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** Two choice cards side by side (stacked on a phone), announced as a radio group. */
export function ChoiceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="mb-4 grid gap-2.5 sm:grid-cols-2">
      {children}
    </div>
  );
}

/**
 * A big radio. Yes/no and own/rent answers select teal, as the original;
 * meeting cadence selects magenta.
 */
export function ChoiceCard({
  selected,
  onSelect,
  tone = "teal",
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  tone?: "teal" | "magenta";
  children: React.ReactNode;
}) {
  const on =
    tone === "teal"
      ? { card: "border-teal bg-teal/10 text-fog", ring: "border-teal", dot: "bg-teal" }
      : { card: "border-magenta bg-magenta/10 text-fog", ring: "border-magenta", dot: "bg-magenta" };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border-[1.5px] px-4 py-3 text-left text-[13.5px] font-semibold transition-colors duration-150 ${
        selected ? on.card : "border-edge-mid bg-panel-2 text-muted hover:border-faint hover:text-mist"
      }`}
    >
      <span
        aria-hidden
        className={`relative h-[15px] w-[15px] flex-none rounded-full border-2 ${selected ? on.ring : "border-faint"}`}
      >
        {selected ? <span className={`absolute inset-[2.5px] rounded-full ${on.dot}`} /> : null}
      </span>
      {children}
    </button>
  );
}

/* ─────────────────────────────── fields ─────────────────────────────── */

/**
 * Label, control, hint, error — the original's `.field`. A div with a
 * `<label htmlFor>` rather than the kit's wrapping `<label>`, because the
 * date field holds a button and a second input that a wrapping label would
 * also claim.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  className = "mb-4",
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[11.5px] leading-relaxed text-dusk">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const shellCls =
  "w-full rounded-[10px] border bg-panel-2 px-3 py-2.5 text-[14px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

const borderFor = (invalid: boolean) => (invalid ? "border-danger" : "border-edge-mid");

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  invalid = false,
  inputMode,
  maxLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      maxLength={maxLength}
      autoComplete="off"
      aria-invalid={invalid}
      aria-describedby={invalid ? `${id}-error` : undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`${shellCls} font-body ${borderFor(invalid)}`}
    />
  );
}

/**
 * A native number input — square footage and monthly miles, as the original.
 * A wheel over it while focused would nudge the value; the builder blurs
 * focused number inputs on wheel for that reason.
 */
export function NumberInput({
  id,
  value,
  onChange,
  placeholder,
  step = 1,
  invalid = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: number;
  invalid?: boolean;
}) {
  return (
    <input
      id={id}
      type="number"
      min={0}
      step={step}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid}
      aria-describedby={invalid ? `${id}-error` : undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`${shellCls} font-mono tabular-nums [color-scheme:dark] ${borderFor(invalid)}`}
    />
  );
}

/**
 * "$ 1,150" — a grouped money input holding the raw string ("1150"), with
 * the caret kept beside the digit being typed as commas come and go. The
 * kit's NumInput logic, plus a placeholder and an invalid state.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  invalid = false,
}: {
  id: string;
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const typed = el.value;
    const caretPos = el.selectionStart ?? typed.length;
    const digitsBefore = typed.slice(0, caretPos).replace(/\D/g, "").length;
    const raw = toRaw(typed);
    const out = withCommas(raw);
    let pos = 0;
    let seen = 0;
    while (pos < out.length && seen < digitsBefore) {
      if (/\d/.test(out[pos])) seen++;
      pos++;
    }
    // Written straight away too: a keystroke that doesn't change the raw
    // value (a letter) never re-renders, and the field must still drop it.
    el.value = out;
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* not a text input in this browser */
    }
    caret.current = pos;
    onChange(raw);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (caret.current != null && el && document.activeElement === el) {
      try {
        el.setSelectionRange(caret.current, caret.current);
      } catch {
        /* not a text input in this browser */
      }
    }
    caret.current = null;
  });

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-[13px] text-dusk">
        $
      </span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={withCommas(value)}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={handleChange}
        className={`${shellCls} pl-7 font-mono tabular-nums ${borderFor(invalid)}`}
      />
    </div>
  );
}

/** A money field: label, $ input, optional hint and error. */
export function MoneyField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  className,
}: {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
}) {
  return (
    <FormField label={label} htmlFor={id} hint={hint} error={error} className={className}>
      <MoneyInput id={id} value={value} onChange={onChange} placeholder={placeholder} invalid={!!error} />
    </FormField>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/**
 * A date you can type (MM/DD/YYYY, digits only — the slashes arrive on
 * their own) or pick: the calendar button opens a hidden native date input's
 * picker. `value` is YYYY-MM-DD, or "" while the typing is incomplete or the
 * digits aren't a real date — exactly what the validation keys on.
 *
 * What's typed is local state seeded from `value`; the builder remounts the
 * form when it swaps in a different plan, so the two never need reconciling.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  className,
}: {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (iso: string) => void;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      /* fall through — older engines */
    }
    el.focus();
    el.click();
  };

  return (
    <FormField label={label} htmlFor={id} hint={hint} error={error} className={className}>
      <div
        className={`relative flex items-center rounded-[10px] border bg-panel-2 transition-[border-color,box-shadow] duration-150 focus-within:border-magenta focus-within:shadow-[0_0_0_3px_rgba(255,45,120,0.18)] ${borderFor(!!error)}`}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="MM/DD/YYYY"
          maxLength={10}
          value={text}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
            setText(digitsToDisplay(digits));
            onChange(digits.length === 8 ? digitsToIso(digits) || "" : "");
          }}
          className="w-full min-w-0 bg-transparent px-3 py-2.5 font-mono text-[14px] tracking-[0.02em] tabular-nums text-fog outline-none placeholder:text-faint"
        />
        <button
          type="button"
          aria-label="Pick a date"
          onClick={openPicker}
          className="mr-1 flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[7px] text-dusk transition-colors duration-150 hover:bg-panel-2 hover:text-fog"
        >
          <CalendarIcon />
        </button>
        <input
          ref={nativeRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={value || ""}
          onChange={(e) => {
            const iso = e.target.value || "";
            setText(isoToDisplay(iso));
            onChange(iso);
          }}
          className="pointer-events-none absolute bottom-0 right-0 h-px w-px border-0 p-0 opacity-0 [color-scheme:dark]"
        />
      </div>
    </FormField>
  );
}

/* ─────────────────────────────── overlays ─────────────────────────────── */

/**
 * Backdrop + dialog, portalled to <body>: the portal's ancestors carry
 * transforms and will-change, either of which would re-root a fixed overlay
 * to that container instead of the viewport. Escape and a backdrop click
 * close it.
 */
export function Modal({
  onClose,
  labelledBy,
  className = "",
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`m-auto rounded-[16px] border border-edge-mid bg-panel shadow-2xl ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  /** Destructive actions confirm in magenta; safe ones in teal. */
  danger: boolean;
  onConfirm: () => void;
};

export function ConfirmModal({ opts, onClose }: { opts: ConfirmOptions; onClose: () => void }) {
  return (
    <Modal onClose={onClose} labelledBy="ap-confirm-title" className="w-full max-w-[400px] p-6">
      <h3 id="ap-confirm-title" className="mb-2.5 font-display text-[18px] font-bold text-fog">
        {opts.title}
      </h3>
      <p className="mb-5 text-[13.5px] leading-relaxed text-muted">{opts.message}</p>
      <div className="flex justify-end gap-2.5">
        {/* Focus lands on Cancel, so a reflexive Enter never deletes anything. */}
        <button type="button" autoFocus onClick={onClose} className={btnCls("ghost", "sm")}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            opts.onConfirm();
          }}
          className={btnCls(opts.danger ? "primary" : "teal", "sm")}
        >
          {opts.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** One toast at a time; a new message replaces the old and restarts the 2.2s clock. */
export function useToast() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 2200);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { message, visible, showToast };
}

/** Always mounted (so it can fade), portalled for the same reason as the modal. */
export function Toast({ message, visible }: { message: string; visible: boolean }) {
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] left-1/2 z-[130] -translate-x-1/2 rounded-[10px] border border-edge-mid bg-panel-2 px-5 py-2.5 text-[12.5px] font-semibold text-fog shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)] transition-[opacity,translate] duration-200 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
      }`}
    >
      {message}
    </div>,
    document.body,
  );
}
