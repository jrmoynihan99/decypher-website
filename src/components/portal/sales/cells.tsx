"use client";

/**
 * The editable cells of the sales grid.
 *
 * Every one follows the same contract: show the stored value, save the moment
 * the operator finishes with it, and never hold an edit hostage behind a Save
 * button. That's what replacing a spreadsheet requires — Airtable commits on
 * change and anything slower will feel broken by comparison.
 *
 * Saving is per-cell, not per-row. Two people editing different columns of the
 * same deal is normal here, and a row-shaped write would make the second save
 * silently undo the first.
 */

import { useEffect, useRef, useState } from "react";
import { SearchSelect, type SearchOption } from "@/components/portal/widgets/ui";

/** Shared select styling, sized for a dense grid rather than a form. */
const cellSelectCls =
  "w-full appearance-none rounded-[8px] border border-edge-mid bg-panel-2 py-1.5 pl-2 pr-6 font-body text-[12.5px] text-fog outline-none transition-[border-color,box-shadow,opacity] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)] disabled:opacity-50";

const caret: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='none' stroke='%238f88a0' stroke-width='2'%3E%3Cpath d='M1 3l4 4 4-4'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 7px center",
};

const cellInputCls =
  "w-full rounded-[8px] border border-edge-mid bg-panel-2 px-2 py-1.5 font-mono text-[12.5px] tabular-nums text-fog outline-none transition-[border-color,box-shadow,opacity] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)] disabled:opacity-50";

/* ───────────────────────────── select ───────────────────────────── */

export function SelectCell<T extends string>({
  value,
  options,
  labels,
  onChange,
  saving,
  placeholder = "—",
  width = "w-[150px]",
  title,
}: {
  value: T | null;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T | null) => void;
  saving?: boolean;
  placeholder?: string;
  width?: string;
  title?: string;
}) {
  return (
    <select
      value={value ?? ""}
      disabled={saving}
      title={title}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
      className={`${cellSelectCls} ${width}`}
      style={caret}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o]}
        </option>
      ))}
    </select>
  );
}

/* ───────────────────────────── money ───────────────────────────── */

/**
 * Whole dollars, committed on blur rather than on keystroke.
 *
 * Per-keystroke saving would fire a write for every digit of "1995" and let a
 * half-typed "19" briefly become the stored offer. Local state holds the text
 * while typing; Enter commits early, Escape abandons.
 */
export function MoneyCell({
  value,
  onChange,
  saving,
  width = "w-[92px]",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  saving?: boolean;
  width?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const dirty = useRef(false);

  // Re-sync when the row changes underneath us (a refresh, another editor) —
  // but never while this cell is mid-edit, which would eat what's being typed.
  useEffect(() => {
    if (!dirty.current) setText(value == null ? "" : String(value));
  }, [value]);

  const commit = () => {
    dirty.current = false;
    const raw = text.replace(/[^0-9.]/g, "");
    const next = raw === "" ? null : Math.round(Number(raw));
    const clean = next == null || !Number.isFinite(next) || next < 0 ? null : next;
    setText(clean == null ? "" : String(clean));
    if (clean !== value) onChange(clean);
  };

  return (
    <div className={`relative ${width}`}>
      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[12px] text-dusk">
        $
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        disabled={saving}
        onChange={(e) => {
          dirty.current = true;
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            dirty.current = false;
            setText(value == null ? "" : String(value));
            e.currentTarget.blur();
          }
        }}
        className={`${cellInputCls} pl-5 text-right`}
      />
    </div>
  );
}

/* ───────────────────────────── date ───────────────────────────── */

export function DateCell({
  value,
  onChange,
  saving,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  saving?: boolean;
}) {
  return (
    <input
      type="date"
      value={value ?? ""}
      disabled={saving}
      onChange={(e) => onChange(e.target.value || null)}
      className={`${cellInputCls} w-[132px] [color-scheme:dark]`}
    />
  );
}

/* ───────────────────────────── check ───────────────────────────── */

export function CheckCell({
  checked,
  onChange,
  saving,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  saving?: boolean;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={saving}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer accent-magenta disabled:opacity-40"
    />
  );
}

/* ───────────────────────────── text ───────────────────────────── */

export function TextCell({
  value,
  onChange,
  saving,
  placeholder = "—",
  width = "w-[180px]",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  saving?: boolean;
  placeholder?: string;
  width?: string;
}) {
  const [text, setText] = useState(value ?? "");
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setText(value ?? "");
  }, [value]);

  const commit = () => {
    dirty.current = false;
    const next = text.trim() || null;
    if (next !== value) onChange(next);
  };

  return (
    <input
      type="text"
      value={text}
      disabled={saving}
      placeholder={placeholder}
      onChange={(e) => {
        dirty.current = true;
        setText(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          dirty.current = false;
          setText(value ?? "");
          e.currentTarget.blur();
        }
      }}
      className={`${cellInputCls} ${width} font-body placeholder:text-faint`}
    />
  );
}

/* ─────────────────────────── suggestion ─────────────────────────── */

/**
 * The one-click way to accept what Calendly implied, shown only while the field
 * is still empty.
 *
 * This is the compromise the client asked for: the answers to "How did you hear
 * about us?" are useful and not trustworthy, so nothing is auto-filled — but
 * re-typing a value that's sitting right there is exactly the friction that
 * makes an operator stop filling the column in at all. Offer it, don't apply it.
 */
export function Suggestion({
  label,
  onApply,
  title,
}: {
  label: string;
  onApply: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onApply}
      title={title}
      className="mt-1 block max-w-full cursor-pointer truncate rounded-[6px] border border-teal/35 bg-teal/[0.07] px-1.5 py-0.5 text-left font-body text-[10.5px] text-teal transition-colors duration-150 hover:bg-teal/15"
    >
      ↑ {label}
    </button>
  );
}

/** Verbatim answer, for when we can't map it to anything offerable. */
export function RawHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="mt-1 block max-w-[170px] truncate font-body text-[10.5px] text-faint"
    >
      said: {text}
    </span>
  );
}

/* ─────────────────────────── referrer ─────────────────────────── */

/**
 * Partner picker with an inline "add" escape hatch.
 *
 * Adding from the row matters: the alternative is a separate admin screen, and
 * that is precisely how the client's Airtable ended up with 64 free-text
 * partner spellings across 126 referrals — several of them the same person —
 * which is why those commission totals can't be trusted today.
 */
export function ReferrerCell({
  value,
  options,
  onChange,
  onCreate,
  saving,
  raw,
}: {
  value: string | null;
  options: SearchOption[];
  onChange: (v: string | null) => void;
  onCreate: (name: string) => Promise<string | null>;
  saving?: boolean;
  raw?: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    const id = await onCreate(clean);
    setBusy(false);
    if (id) {
      onChange(id);
      setAdding(false);
      setName("");
    }
  };

  if (adding) {
    return (
      <div className="flex w-[200px] items-center gap-1">
        <input
          autoFocus
          value={name}
          disabled={busy}
          placeholder="Partner name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") {
              setAdding(false);
              setName("");
            }
          }}
          className={`${cellInputCls} font-body`}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !name.trim()}
          className="flex-none cursor-pointer rounded-[6px] border border-magenta/50 px-1.5 py-1 text-[11px] text-magenta disabled:opacity-40"
        >
          {busy ? "…" : "✓"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAdding(false);
            setName("");
          }}
          className="flex-none cursor-pointer px-1 text-[12px] text-dusk hover:text-fog"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="w-[200px]">
      <SearchSelect
        value={value ?? ""}
        onChange={(v) => onChange(v || null)}
        options={options}
        disabled={saving}
        placeholder="Who referred?"
        emptyLabel="No partner matches"
      />
      <div className="mt-1 flex items-baseline gap-2">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex-none cursor-pointer font-body text-[10.5px] text-magenta hover:underline"
        >
          + add
        </button>
        {raw && !value ? (
          <span title={raw} className="min-w-0 truncate font-body text-[10.5px] text-faint">
            said: {raw}
          </span>
        ) : null}
      </div>
    </div>
  );
}
