"use client";

/**
 * One editable dropdown list: reorder, recolour, rename, and — on open lists —
 * add and retire.
 *
 * Lifted out of the Sales Flow ⚙ Options panel when the Applications tracker
 * needed the same control. Both tools store the same OptionItem shape and both
 * go through the same sanitizer (lib/option-list), so sharing the editor is
 * what keeps "retire, never delete" from being re-implemented differently in
 * two places.
 *
 * What it deliberately does NOT offer, matching the server's contract: renaming
 * a KEY (labels only — keys are what rows are written in), or deleting one
 * (retire hides it from new picks instead, so historical rows keep rendering).
 * Closed lists don't even get retire — their keys carry semantics the code
 * branches on.
 */

import { useEffect, useRef, useState } from "react";
import { OPTION_COLORS, optionColorHex, optionKey, type OptionItem } from "@/lib/option-list";
import { Mono, Panel } from "@/components/portal/widgets/ui";

const inputCls =
  "w-full rounded-[8px] border border-edge-mid bg-panel-2 px-2.5 py-1.5 font-body text-[13px] text-fog outline-none transition-[border-color] duration-150 focus:border-magenta disabled:opacity-50";

const iconBtnCls =
  "flex h-[26px] w-[26px] flex-none cursor-pointer items-center justify-center rounded-[6px] border border-edge-mid text-[12px] text-dusk transition-colors duration-150 hover:border-edge-bright hover:text-fog disabled:cursor-default disabled:opacity-30";

/** A key/label pair the list doesn't hold yet, offered as a one-click add. */
export interface OptionSuggestion {
  key: string;
  label: string;
  /** How many records already use it — printed so the useful one is obvious. */
  count?: number;
}

export function OptionListEditor({
  title,
  items,
  open,
  onChange,
  suggestions = [],
  suggestionsLabel = "Seen in your data",
  className = "",
}: {
  title: string;
  items: OptionItem[];
  /** Open lists may add + retire; closed ones only rename, recolour + reorder. */
  open: boolean;
  onChange: (next: OptionItem[]) => void;
  /** Only meaningful on an open list; ignored on a closed one. */
  suggestions?: OptionSuggestion[];
  suggestionsLabel?: string;
  className?: string;
}) {
  const [adding, setAdding] = useState("");

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const rename = (i: number, label: string) => {
    const next = [...items];
    next[i] = { ...next[i], label };
    onChange(next);
  };

  const toggleRetired = (i: number) => {
    const next = [...items];
    const { retired, ...rest } = next[i];
    next[i] = retired ? rest : { ...next[i], retired: true };
    onChange(next);
  };

  const recolour = (i: number, color: string | null) => {
    const next = [...items];
    const item = { ...next[i] };
    if (color) item.color = color;
    else delete item.color;
    next[i] = item;
    onChange(next);
  };

  const push = (key: string, label: string) => {
    if (!key || items.some((i) => i.key === key)) return;
    onChange([...items, { key, label }]);
  };

  const add = () => {
    const label = adding.trim();
    if (!label) return;
    push(optionKey(label), label);
    setAdding("");
  };

  const fresh = open
    ? suggestions.filter((s) => !items.some((i) => i.key === s.key))
    : [];

  return (
    <Panel
      title={title}
      action={open ? undefined : <Mono className="text-faint">fixed set</Mono>}
      className={className}
    >
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Move ${item.label} up`}
              className={iconBtnCls}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              aria-label={`Move ${item.label} down`}
              className={iconBtnCls}
            >
              ↓
            </button>
            <ColorPicker
              value={item.color ?? null}
              label={item.label}
              onChange={(c) => recolour(i, c)}
            />
            <input
              value={item.label}
              onChange={(e) => rename(i, e.target.value)}
              className={`${inputCls} ${item.retired ? "line-through opacity-50" : ""}`}
              aria-label={`Label for ${item.key}`}
            />
            {open ? (
              <button
                type="button"
                onClick={() => toggleRetired(i)}
                title={
                  item.retired
                    ? "Bring back"
                    : "Retire — hidden from new picks, old rows keep it"
                }
                className={`${iconBtnCls} ${item.retired ? "" : "hover:border-danger/50 hover:text-danger"}`}
              >
                {item.retired ? "↺" : "✕"}
              </button>
            ) : null}
          </div>
        ))}
        {items.length === 0 ? (
          <p className="py-3 text-center text-[12.5px] text-dusk">
            Nothing here yet — add the first one below.
          </p>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 border-t border-edge pt-3">
          <div className="flex items-center gap-1.5">
            <input
              value={adding}
              placeholder="Add an option…"
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              className={inputCls}
            />
            <button
              type="button"
              onClick={add}
              disabled={!adding.trim()}
              className="flex-none cursor-pointer rounded-[8px] border border-magenta/50 px-3 py-1.5 font-mono text-[11px] uppercase text-magenta disabled:opacity-30"
            >
              Add
            </button>
          </div>

          {/* Values the records already carry that the list doesn't offer yet.
              Typing them back in by hand is how two spellings of one role get
              created, so they're one click instead. */}
          {fresh.length ? (
            <div className="mt-3">
              <Mono className="text-faint">{suggestionsLabel}</Mono>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {fresh.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => push(s.key, s.label)}
                    className="cursor-pointer rounded-full border border-edge-mid px-2.5 py-1 font-body text-[11.5px] text-mist transition-colors duration-150 hover:border-magenta/60 hover:text-fog"
                  >
                    + {s.label}
                    {s.count ? <span className="ml-1.5 text-dusk">{s.count}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

/* ─────────────────────────── colour ─────────────────────────── */

/**
 * Pick an option's colour from the fixed palette.
 *
 * A swatch grid rather than an `<input type="color">` on purpose. These colours
 * don't only tint a cell — they become the bars on a stats tab, where two
 * adjacent categories separated by nothing but hue is the exact situation a
 * free colour field produces and a colourblind reader can't resolve. The ten
 * swatches were checked against the panel surface and against each other; the
 * picker's job is to make choosing one of them easy, not to allow more.
 */
function ColorPicker({
  value,
  label,
  onChange,
}: {
  value: string | null;
  label: string;
  onChange: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hex = optionColorHex(value);

  // Click-away and Escape, so an open palette can't be left behind while the
  // list scrolls under it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Colour for ${label}`}
        aria-expanded={open}
        title={hex ? "Change colour" : "No colour — click to pick one"}
        className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[6px] border border-edge-mid transition-colors duration-150 hover:border-edge-bright"
      >
        <span
          aria-hidden
          className="h-[13px] w-[13px] rounded-full border"
          style={
            hex
              ? { background: hex, borderColor: hex }
              : {
                  borderColor: "rgba(255,255,255,0.22)",
                  // A diagonal hairline: the universal "nothing set", and it
                  // can't be mistaken for a very dark swatch.
                  backgroundImage:
                    "linear-gradient(135deg, transparent 45%, rgba(255,255,255,0.3) 45%, rgba(255,255,255,0.3) 55%, transparent 55%)",
                }
          }
        />
      </button>

      {open ? (
        <div className="absolute left-0 top-[30px] z-30 w-[168px] rounded-[10px] border border-edge-mid bg-panel p-2 shadow-2xl">
          <div className="grid grid-cols-5 gap-1.5">
            {OPTION_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={value === c.key}
                onClick={() => {
                  onChange(c.key);
                  setOpen(false);
                }}
                className={`h-[24px] w-[24px] cursor-pointer rounded-[6px] border-2 transition-transform duration-150 hover:scale-110 ${
                  value === c.key ? "border-fog" : "border-transparent"
                }`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-2 w-full cursor-pointer rounded-[6px] border border-edge-mid py-1 font-mono text-[10px] uppercase tracking-[0.8px] text-dusk hover:text-fog"
          >
            No colour
          </button>
        </div>
      ) : null}
    </div>
  );
}
