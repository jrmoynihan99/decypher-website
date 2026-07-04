"use client";

import { useLayoutEffect, useRef } from "react";

/* ---- shared class strings (ported from the prototype's CSS) ---- */

export const fieldLabelCls =
  "mb-2 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist";
export const optNoteCls =
  "font-normal normal-case tracking-normal text-dusk";
export const errCls = "mt-1.5 text-xs text-danger";
export const btnBaseCls =
  "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-transparent px-5 py-[15px] font-display text-[15px] font-semibold no-underline transition-[transform,filter] duration-150 active:translate-y-px";
export const btnPrimaryCls = `${btnBaseCls} bg-grad text-white hover:brightness-[1.07]`;
export const btnGhostCls = `${btnBaseCls} border-white/15 bg-transparent text-fog hover:border-mist`;

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23A99FB8' stroke-width='2'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")";

/** Mono eyebrow with a leading dash, e.g. "Step 01 · Your numbers". */
export function Eyebrow({
  children,
  className = "",
  center = false,
}: {
  children: React.ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[2.5px] text-magenta before:inline-block before:h-px before:w-[26px] before:flex-none before:bg-magenta before:content-[''] ${
        center ? "justify-center" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function FieldError({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return <div className={errCls}>{children}</div>;
}

export function Select({
  invalid,
  className = "",
  ...props
}: React.ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      {...props}
      className={`w-full appearance-none rounded-[11px] border bg-panel-2 py-[11px] pl-3 pr-8 font-body text-base text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.22)] ${
        invalid
          ? "border-danger shadow-[0_0_0_3px_rgba(255,107,122,0.18)]"
          : "border-white/15"
      } ${className}`}
      style={{
        backgroundImage: CHEVRON,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
      }}
    />
  );
}

export function TextInput({
  invalid,
  className = "",
  ...props
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      className={`w-full rounded-[11px] border bg-panel-2 px-3 py-[11px] font-body text-base text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.22)] ${
        invalid
          ? "border-danger shadow-[0_0_0_3px_rgba(255,107,122,0.18)]"
          : "border-white/15"
      } ${className}`}
    />
  );
}

/**
 * Caret-preserving formatted input: applies `format` to the raw value on each
 * change and keeps the caret anchored to the same digit it was next to.
 */
function useFormattedInput(
  onChange: (v: string) => void,
  format: (raw: string) => { out: string; digitsShift?: number },
) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const raw = el.value;
    const caretPos = el.selectionStart ?? raw.length;
    let digitsBefore = raw.slice(0, caretPos).replace(/\D/g, "").length;
    const { out, digitsShift } = format(raw);
    if (digitsShift) digitsBefore = Math.max(0, digitsBefore + digitsShift);
    let pos = 0;
    let seen = 0;
    while (pos < out.length && seen < digitsBefore) {
      if (/\d/.test(out[pos])) seen++;
      pos++;
    }
    // sync the DOM immediately (in case React skips a re-render), then let
    // the layout effect restore the caret after any re-render
    el.value = out;
    try {
      el.setSelectionRange(pos, pos);
    } catch {}
    caret.current = pos;
    onChange(out);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (caret.current != null && el && document.activeElement === el) {
      try {
        el.setSelectionRange(caret.current, caret.current);
      } catch {}
    }
    caret.current = null;
  });

  return { ref, handleChange };
}

export function formatMoneyString(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const intp = (parts[0] || "").replace(/^0+(?=\d)/, "");
  const dec = parts.length > 1 ? `.${parts.slice(1).join("").slice(0, 2)}` : "";
  return intp.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + dec;
}

/** "$"-prefixed comma-grouped numeric input. */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
}) {
  const { ref, handleChange } = useFormattedInput(onChange, (raw) => ({
    out: formatMoneyString(raw),
  }));
  return (
    <div
      className={`flex items-center gap-2 rounded-[11px] border bg-panel-2 px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-magenta focus-within:shadow-[0_0_0_3px_rgba(255,45,120,0.22)] ${
        invalid
          ? "border-danger shadow-[0_0_0_3px_rgba(255,107,122,0.18)]"
          : "border-white/15"
      } ${className}`}
    >
      <span className="flex-none text-base text-dusk">$</span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        className="w-full border-none bg-transparent py-[11px] font-body text-base text-fog outline-none"
      />
    </div>
  );
}

export function formatPhoneString(raw: string): {
  out: string;
  digitsShift: number;
} {
  let d = raw.replace(/\D/g, "");
  let digitsShift = 0;
  if (d.length === 11 && d.charAt(0) === "1") {
    d = d.slice(1);
    digitsShift = -1;
  }
  d = d.slice(0, 10); // US 10-digit
  let out = "";
  if (d.length > 6) out = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  else if (d.length > 3) out = `(${d.slice(0, 3)}) ${d.slice(3)}`;
  else if (d.length > 0) out = `(${d}`;
  return { out, digitsShift };
}

/** US phone input formatted as (555) 123-4567. */
export function PhoneInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const { ref, handleChange } = useFormattedInput(onChange, formatPhoneString);
  return (
    <input
      ref={ref}
      id={id}
      type="tel"
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      className={`w-full rounded-[11px] border bg-panel-2 px-3 py-[11px] font-body text-base text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.22)] ${
        invalid
          ? "border-danger shadow-[0_0_0_3px_rgba(255,107,122,0.18)]"
          : "border-white/15"
      }`}
    />
  );
}
