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
 *
 * Every cell defaults to `w-full` and takes its size from the column it sits
 * in — the grid's columns are drag-resizable, so a width baked into a control
 * would just refuse to follow its header.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SearchSelect, type SearchOption } from "@/components/portal/widgets/ui";
import { useHydrated } from "@/hooks/useHydrated";
import { itemColorHex } from "@/lib/sales/options";
import type { OptionItem } from "@/lib/sales/types";

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

/**
 * A dropdown that wears its option's colour.
 *
 * The colour is on the CONTROL, not on a chip beneath it. The first version of
 * the Show column rendered both — a select to change the value and a pill
 * restating it — which is what the client meant by the column "stacking
 * entries": two things saying one thing, in double the row height. Tinting the
 * control itself gives the scannability the chip was there for and gives the
 * row back its height.
 *
 * The label always prints inside the tint, so colour is never carrying the
 * meaning by itself.
 */
export function SelectCell<T extends string = string>({
  value,
  items,
  onChange,
  saving,
  placeholder = "—",
  width = "w-full",
  title,
}: {
  value: T | null;
  /** From the editable options config — order is display order. */
  items: OptionItem[];
  onChange: (v: T | null) => void;
  saving?: boolean;
  placeholder?: string;
  width?: string;
  title?: string;
}) {
  // Retired options are hidden from new picks, but a row already holding one
  // must keep rendering it — and stay saveable — or retiring an option would
  // silently corrupt the historical rows written in it.
  const current = value ? items.find((i) => i.key === value) : undefined;
  const offered = items.filter((i) => !i.retired || i.key === value);
  const unknown = value && !current;
  const tint = itemColorHex(items, value);

  return (
    <select
      value={value ?? ""}
      disabled={saving}
      title={title}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
      className={`${cellSelectCls} ${width}`}
      style={
        tint
          ? // Hex + alpha suffix: 0d ≈ 5% fill, 66 ≈ 40% border. Light enough
            // that a full row of tinted cells still reads as a table.
            { ...caret, color: tint, borderColor: `${tint}66`, backgroundColor: `${tint}0d` }
          : caret
      }
    >
      <option value="">{placeholder}</option>
      {offered.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
          {o.retired ? " (retired)" : ""}
        </option>
      ))}
      {unknown ? <option value={value!}>{value}</option> : null}
    </select>
  );
}

/* ───────────────────────────── money ───────────────────────────── */

/**
 * Whole dollars. Commits on blur AND, since typing used to only persist once
 * focus moved somewhere else (the "I have to click another tab to save it"
 * complaint), on a debounced idle while typing.
 *
 * Per-keystroke saving would fire a write for every digit of "1995", so the
 * idle commit waits out the typing burst instead. It also deliberately does
 * NOT normalise the visible text — rewriting the field under a paused typist
 * eats their cursor; only the blur commit tidies the text. Enter commits
 * early, Escape abandons (and cancels any pending idle commit).
 */
const MONEY_IDLE_MS = 900;

function parseMoney(raw: string): number | null {
  const digits = raw.replace(/[^0-9.]/g, "");
  const next = digits === "" ? null : Math.round(Number(digits));
  return next == null || !Number.isFinite(next) || next < 0 ? null : next;
}

export function MoneyCell({
  value,
  onChange,
  saving,
  width = "w-full",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  saving?: boolean;
  width?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const dirty = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelIdle = () => {
    if (idle.current) {
      clearTimeout(idle.current);
      idle.current = null;
    }
  };
  useEffect(() => cancelIdle, []);

  // Re-sync when the row changes underneath us (a refresh, another editor) —
  // but never while this cell is mid-edit, which would eat what's being typed.
  useEffect(() => {
    if (!dirty.current) setText(value == null ? "" : String(value));
  }, [value]);

  const commit = () => {
    cancelIdle();
    dirty.current = false;
    const clean = parseMoney(text);
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
          const raw = e.target.value;
          setText(raw);
          cancelIdle();
          idle.current = setTimeout(() => {
            const clean = parseMoney(raw);
            if (clean !== value) onChange(clean);
          }, MONEY_IDLE_MS);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelIdle();
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
      className={`${cellInputCls} w-full [color-scheme:dark]`}
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
  width = "w-full",
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

/* ─────────────────────────── notes ─────────────────────────── */

/**
 * Notes, as a preview that opens into something you can actually write in.
 *
 * A one-line `<input>` in a grid column is fine for a phone number and useless
 * for the paragraph a deal note actually is: you can see about six words of it,
 * there's nowhere to put a line break, and widening the column to fix that
 * costs every other column on the row. The client asked for a popup; the popup
 * is also the only way this column can be narrow.
 *
 * Committed on Save, not on keystroke — the opposite of every other cell here,
 * and deliberately. Multi-line prose typed over a minute would otherwise fire a
 * write per character, and unlike a dropdown there's no natural moment that
 * means "done" until the editor is closed. Escape and the backdrop discard.
 */
export function NotesCell({
  value,
  onChange,
  saving,
  who,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  saving?: boolean;
  /** Whose note this is — the editor's heading. */
  who: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ?? "");
  // createPortal needs a real document.body, which the server render hasn't got.
  const hydrated = useHydrated();

  const start = () => {
    setText(value ?? "");
    setOpen(true);
  };

  const commit = () => {
    const next = text.trim() || null;
    if (next !== value) onChange(next);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={saving}
        onClick={start}
        title={value ?? "Add a note"}
        className={`w-full truncate rounded-[8px] border px-2 py-1.5 text-left font-body text-[12.5px] transition-colors duration-150 disabled:opacity-50 ${
          value
            ? "border-edge-mid bg-panel-2 text-mist hover:border-magenta"
            : "border-dashed border-edge-mid text-faint hover:border-magenta hover:text-dusk"
        }`}
      >
        {value || "+ note"}
      </button>

      {/* Portalled to the body: the grid's ancestors carry transforms and
          `will-change`, either of which re-roots a fixed element to that
          container instead of the viewport — the modal would end up trapped
          inside a scrolling table cell. */}
      {open && hydrated
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Notes for ${who}`}
                className="w-full max-w-[560px] rounded-[16px] border border-edge-mid bg-panel shadow-2xl"
              >
                <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
                  <h3 className="truncate font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-muted">
                    Notes — {who}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="cursor-pointer text-[15px] leading-none text-dusk hover:text-fog"
                  >
                    ✕
                  </button>
                </header>
                <div className="px-4 py-4">
                  <textarea
                    autoFocus
                    rows={9}
                    value={text}
                    placeholder="What happened on the call, what they need, what to do next…"
                    onChange={(e) => setText(e.target.value)}
                    className="w-full resize-y rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2.5 font-body text-[13px] leading-relaxed text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="font-mono text-[10.5px] text-faint">
                      {text.length}/2000
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="cursor-pointer rounded-[10px] border border-edge-mid px-4 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk hover:text-fog"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={commit}
                        className="cursor-pointer rounded-[10px] bg-magenta px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.8px] text-white"
                      >
                        Save note
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
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

/* ─────────────────────────── delete ─────────────────────────── */

/**
 * Two-click delete: `×` arms it, "Delete?" confirms.
 *
 * A confirm dialog would be heavier than the action deserves and a bare `×`
 * next to a checkbox is a misclick waiting to happen. Arming disarms itself
 * after a few seconds so a stray first click doesn't leave a live trigger
 * sitting in the row. The undo banner upstream is the real safety net.
 */
export function DeleteCell({
  onDelete,
  saving,
  label,
}: {
  onDelete: () => void;
  saving?: boolean;
  label: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (armed) {
    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          setArmed(false);
          onDelete();
        }}
        className="cursor-pointer rounded-[6px] border border-danger/50 bg-danger/10 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.8px] text-danger transition-colors duration-150 hover:bg-danger/20 disabled:opacity-40"
      >
        Delete?
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={saving}
      aria-label={label}
      title={label}
      onClick={() => setArmed(true)}
      className="cursor-pointer rounded-[6px] border border-transparent px-2 py-1 text-[14px] leading-none text-faint transition-colors duration-150 hover:border-danger/40 hover:text-danger disabled:opacity-40"
    >
      ×
    </button>
  );
}

/** Bring an archived row back. */
export function RestoreCell({
  onRestore,
  saving,
  label,
}: {
  onRestore: () => void;
  saving?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={saving}
      aria-label={label}
      onClick={onRestore}
      className="cursor-pointer rounded-[6px] border border-teal/40 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.8px] text-teal transition-colors duration-150 hover:bg-teal/10 disabled:opacity-40"
    >
      Restore
    </button>
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
      <div className="flex w-full items-center gap-1">
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
    <div className="w-full">
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
