"use client";

/**
 * Chrome shared by every portal widget.
 *
 * The five tools arrived as standalone HTML pages, each with its own palette
 * and its own idea of what a card looks like. Rather than port five skins,
 * everything here is re-expressed in the site's Tailwind tokens (panel / edge /
 * fog / mist / magenta / teal) so the tools read as one product, and so a
 * palette change lands everywhere at once.
 *
 * Radius is a four-step scale, assigned by role rather than by eye. Anything
 * outside it is drift — reach for the nearest step instead of a new value:
 *
 *   rounded-[20px]  hero / callout — the one number that matters
 *   rounded-[16px]  panel, card, tile
 *   rounded-[10px]  input, chip, button, small control
 *   rounded-full    pill, switch, badge
 *
 * Two deliberate exceptions: a control nested inside another rounds to
 * (outer − padding), so the segmented control's buttons are 7px inside its
 * 10px shell; and 12px legend swatches use 3px, where any step of the scale
 * would read as a circle.
 *
 * Keep this file presentational. Widget maths belongs in lib/widget-tax.ts.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import NumberFlow from "@number-flow/react";
import { toRaw, withCommas } from "@/lib/widget-format";

/**
 * Money that rolls when it changes — the count-up the prototypes hand-wrote
 * with requestAnimationFrame, using the NumberFlow already in the bundle.
 *
 * NB: NumberFlow renders its digits in Shadow DOM, so a `background-clip: text`
 * gradient can't reach them. Colour these with a solid `color` (which does
 * inherit across the boundary) — never with `text-grad`.
 */
export function MoneyFlow({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <NumberFlow
      value={Math.round(isFinite(value) ? value : 0)}
      locales="en-US"
      format={{
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }}
      className={className}
    />
  );
}

/* ─────────────────────────────── layout ─────────────────────────────── */

/** Bordered surface with a mono caps header strip. The workhorse container. */
export function Panel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-[16px] border border-edge bg-panel ${className}`}
    >
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-muted">
            {title}
          </h3>
          {action}
        </header>
      ) : null}
      <div className={`px-4 py-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Mono caps label — the recurring "little heading" across all five tools. */
export function Mono({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10.5px] uppercase tracking-[1.2px] ${className}`}
    >
      {children}
    </span>
  );
}

/** Body copy for footnotes and explanations. */
export function Note({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`mt-3 text-[12.5px] leading-relaxed text-dusk ${className}`}>
      {children}
    </p>
  );
}

/* ─────────────────────────────── readouts ────────────────────────────── */

/** One tile in a KPI strip. */
export function Kpi({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "plain" | "pos" | "neg" | "brand";
}) {
  const toneCls =
    tone === "pos" ? "text-teal"
    : tone === "neg" ? "text-danger"
    : tone === "brand" ? "text-magenta"
    : "text-fog";
  return (
    <div className="bg-panel px-4 py-3.5">
      <Mono className="text-dusk">{label}</Mono>
      <div
        className={`mt-1.5 font-display text-[22px] font-bold tabular-nums ${toneCls}`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-[11px] text-dusk">{sub}</div> : null}
    </div>
  );
}

/** Hairline grid of KPI tiles — the 1px gap is the border showing through. */
export function KpiRow({
  cols = 3,
  children,
  className = "",
}: {
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
}) {
  const colCls =
    cols === 4 ? "sm:grid-cols-4"
    : cols === 2 ? "sm:grid-cols-2"
    : "sm:grid-cols-3";
  return (
    <div
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-edge bg-edge ${colCls} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Label-left / value-right ledger row — the single row primitive.
 *
 * `total` draws the heavier rule above it and promotes the value. `size` sets
 * how loud the value is: `sm` for dense schedules, `md` for ordinary ledgers,
 * `lg` for the closing figure a client's eye should land on. `display` swaps
 * the value to the display face, for rows that read as a statement rather than
 * a column of figures.
 */
export function LineRow({
  label,
  value,
  total = false,
  tone = "plain",
  size = "md",
  display = false,
  divider = true,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  total?: boolean;
  tone?: "plain" | "pos" | "neg" | "brand";
  size?: "sm" | "md" | "lg";
  display?: boolean;
  /** Off for standalone rows that shouldn't draw their own hairline. */
  divider?: boolean;
}) {
  const toneCls =
    tone === "pos" ? "text-teal"
    : tone === "neg" ? "text-danger"
    : tone === "brand" ? "text-magenta"
    : total ? "text-fog"
    : "text-mist";
  const valueSize =
    size === "lg" ? "text-[19px] font-semibold"
    : size === "sm" ? "text-[12.5px]"
    : "text-[14px]";
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2 text-[13.5px] ${
        total
          ? "mt-1 border-t-2 border-edge-mid pt-2.5 font-semibold"
          : divider
            ? "border-t border-edge first:border-t-0"
            : ""
      }`}
    >
      <span className={total ? "text-mist" : "text-muted"}>{label}</span>
      <span
        className={`tabular-nums ${
          display ? "font-display font-semibold" : "font-mono"
        } ${valueSize} ${toneCls}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────── tables ─────────────────────────────── */

export function TableHead({
  children,
  align = "right",
  ariaSort,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  /** For sortable columns. Belongs on the th, not on the button inside it. */
  ariaSort?: "ascending" | "descending" | "none";
}) {
  return (
    <th
      aria-sort={ariaSort}
      className={`whitespace-nowrap border-b border-edge-mid px-2.5 py-2.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.8px] text-dusk ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`whitespace-nowrap border-b border-edge px-2.5 py-2 font-mono tabular-nums ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {children}
    </td>
  );
}

/** Tinted hero card — the "one number that matters" on a page. */
export function Callout({
  label,
  value,
  children,
  tone = "brand",
  className = "",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  children?: React.ReactNode;
  tone?: "brand" | "pos";
  className?: string;
}) {
  const pos = tone === "pos";
  return (
    <div
      className={`overflow-hidden rounded-[20px] border px-5 py-4 ${
        pos
          ? "border-teal/40 bg-gradient-to-b from-teal/10 to-teal/[0.03]"
          : "border-magenta/40 bg-gradient-to-b from-magenta/10 to-magenta/[0.03]"
      } ${className}`}
    >
      <Mono className={pos ? "text-teal" : "text-magenta"}>{label}</Mono>
      <div
        className={`mt-1 font-display text-[34px] font-bold leading-none tabular-nums ${
          pos ? "text-teal" : "text-magenta"
        }`}
      >
        {value}
      </div>
      {children ? (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">
          {children}
        </p>
      ) : null}
    </div>
  );
}

/** Status pill — the deal-check chips and the S-corp risk badge. */
export function Chip({
  tone,
  children,
}: {
  tone: "pos" | "warn" | "neg" | "mute";
  children: React.ReactNode;
}) {
  const cls =
    tone === "pos" ? "border-teal/40 bg-teal/10 text-teal"
    : tone === "warn" ? "border-ember/40 bg-ember/10 text-ember"
    : tone === "neg" ? "border-danger/40 bg-danger/10 text-danger"
    : "border-white/10 bg-white/[0.03] text-dusk";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${cls}`}
    >
      <span className="h-[6px] w-[6px] flex-none rounded-full bg-current" />
      {children}
    </span>
  );
}

/* ──────────────────────────────── inputs ─────────────────────────────── */

/**
 * Caret-preserving formatted input. Formatting a controlled value on every
 * keystroke normally throws the caret to the end; this re-anchors it to the
 * same digit the user was typing next to.
 */
function useGroupedInput(onChange: (raw: string) => void) {
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
    el.value = out;
    try {
      el.setSelectionRange(pos, pos);
    } catch {}
    caret.current = pos;
    onChange(raw);
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

const inputCls =
  "w-full rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2.5 font-mono text-[14px] tabular-nums text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

/**
 * A grouped numeric input. `value` is the raw string ("470000"); what the user
 * sees is comma-grouped. Raw strings rather than numbers so a half-typed
 * "1,2" or a trailing "." survives the round trip.
 */
export function NumInput({
  value,
  onChange,
  prefix,
  suffix,
  align = "right",
  className = "",
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (raw: string) => void;
  prefix?: string;
  suffix?: string;
  align?: "left" | "right";
  className?: string;
  id?: string;
  /** For inputs not wrapped in a `Field` — e.g. the Allocator's dual controls. */
  ariaLabel?: string;
}) {
  const { ref, handleChange } = useGroupedInput(onChange);
  return (
    <div className={`relative ${className}`}>
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-dusk">
          {prefix}
        </span>
      ) : null}
      <input
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        type="text"
        inputMode="decimal"
        value={withCommas(value)}
        onChange={handleChange}
        className={`${inputCls} ${align === "right" ? "text-right" : ""} ${
          prefix ? "pl-7" : ""
        } ${suffix ? "pr-8" : ""}`}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-dusk">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/** Stacked label + grouped number input. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11.5px] text-dusk">{hint}</span> : null}
    </label>
  );
}

/**
 * Label-left / input-right row, stacked with hairlines — the Deal Desk's
 * dense input style, where a form of thirty fields has to stay scannable.
 */
export function InlineField({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  width = "w-[132px]",
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  value: string;
  onChange: (raw: string) => void;
  prefix?: string;
  suffix?: string;
  width?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 border-t border-edge py-2 first:border-t-0">
      <span className="text-[13px] text-mist">
        {label}
        {hint ? (
          <small className="mt-0.5 block text-[11px] text-dusk">{hint}</small>
        ) : null}
      </span>
      <NumInput
        value={value}
        onChange={onChange}
        prefix={prefix}
        suffix={suffix}
        className={`flex-none ${width}`}
      />
    </label>
  );
}

/** The shell both the native select and the searchable one wear. */
const selectCls =
  "w-full appearance-none rounded-[10px] border border-edge-mid bg-panel-2 py-2.5 pl-3 pr-8 font-body text-[14px] text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

const caretStyle: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%238f88a0' stroke-width='2'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 11px center",
};

export function SelectInput({
  className = "",
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={`${selectCls} ${className}`}
      style={caretStyle}
    />
  );
}

export type SearchOption = { value: string; label: string };

/**
 * A select you can type into.
 *
 * A native `<select>` is the right control up to a couple of dozen options. At
 * ~150 connected clients it's a scroll hunt, and the browser's own type-ahead
 * only matches from the first character — so "acme" never finds "The Acme Co",
 * and the operator ends up scrolling anyway.
 *
 * The label is rendered here rather than by wrapping this in `Field`, because
 * `Field` is a `<label>`: inside one, a click on an option in the popup also
 * counts as a click on the input, and the two fight over focus.
 */
export function SearchSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Search…",
  emptyLabel = "No matches",
  className = "",
  disabled = false,
}: {
  label?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const uid = useId();
  const listId = `${uid}-list`;
  const inputId = `${uid}-input`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const matches = useMemo(() => rankOptions(options, query), [options, query]);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const openList = () => {
    if (open || disabled) return;
    // Start on the current selection, so arrow keys move from where you are
    // rather than from the top of a 150-row list.
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const commit = (option: SearchOption) => {
    onChange(option.value);
    close();
  };

  // A pointerdown anywhere else is a dismissal — including on another control,
  // which then still receives its own click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({
      block: "nearest",
    });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.min(matches.length - 1, Math.max(0, i + dir)));
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      const pick = matches[active];
      if (pick) commit(pick);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
      return;
    }
    // Tabbing away commits nothing — the same as leaving a select alone.
    if (e.key === "Tab" && open) close();
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label ? (
        <label
          htmlFor={inputId}
          className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist"
        >
          {label}
        </label>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? optionId(active) : undefined}
        // Closed, it reads as the current value; open, it's an empty search box
        // with that value still legible behind it as the placeholder.
        value={open ? query : selectedLabel}
        placeholder={open ? selectedLabel || placeholder : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
        className={`${selectCls} cursor-pointer placeholder:text-dusk disabled:cursor-default disabled:opacity-50`}
        style={caretStyle}
      />

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={typeof label === "string" ? label : undefined}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[280px] overflow-y-auto rounded-[10px] border border-edge-mid bg-panel-2 py-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)]"
        >
          {matches.length ? (
            matches.map((option, i) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  // pointerdown, not click: mousedown would blur the input and
                  // the outside-click handler would close the list first.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    commit(option);
                  }}
                  onPointerMove={() => setActive(i)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[13.5px] ${
                    i === active ? "bg-white/[0.06] text-fog" : "text-mist"
                  }`}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {isSelected ? (
                    <span aria-hidden className="flex-none text-[12px] text-magenta">
                      ✓
                    </span>
                  ) : null}
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2.5 text-[13px] text-dusk">{emptyLabel}</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Substring search across the whole name, best-anchored match first.
 *
 * Ranking earns its keep at this list length: typing "media" should offer
 * "Media House" before "Multimedia Co", and every token has to match somewhere
 * so "acme media" finds the one client whether or not those words are adjacent.
 */
function rankOptions(options: SearchOption[], query: string): SearchOption[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return options;

  const hits: { option: SearchOption; tier: number; index: number }[] = [];
  options.forEach((option, index) => {
    const hay = option.label.toLowerCase();
    if (!tokens.every((t) => hay.includes(t))) return;
    hits.push({ option, tier: anchorTier(hay, tokens[0]), index });
  });
  // Ties keep the incoming order, which is the order the list already had.
  hits.sort((a, b) => a.tier - b.tier || a.index - b.index);
  return hits.map((h) => h.option);
}

/** 0 = the name starts with it, 1 = a word does, 2 = mid-word only. */
function anchorTier(hay: string, token: string): number {
  let best = 2;
  for (let i = hay.indexOf(token); i !== -1; i = hay.indexOf(token, i + 1)) {
    const tier = i === 0 ? 0 : /[a-z0-9]/.test(hay[i - 1]) ? 2 : 1;
    if (tier < best) best = tier;
    if (best === 0) break;
  }
  return best;
}

/* ─────────────────────────────── controls ────────────────────────────── */

/** Pill toggle group — entity type, scenario, unit count. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  size = "md",
  className = "",
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex rounded-[10px] border border-edge-mid bg-panel-2 p-[3px] ${className}`}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer rounded-[7px] font-mono uppercase tracking-[0.8px] transition-colors duration-150 ${
              size === "sm"
                ? "px-2.5 py-1.5 text-[10.5px]"
                : "px-3.5 py-2 text-[11.5px]"
            } ${
              on
                ? "bg-magenta font-bold text-white"
                : "text-muted hover:text-fog"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Sliding switch. `role="switch"` so it announces its state to a reader. */
export function Switch({
  checked,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[25px] w-[44px] flex-none cursor-pointer rounded-full border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta ${
        checked ? "border-transparent bg-grad" : "border-edge-mid bg-panel-2"
      } ${className}`}
    >
      <span
        className={`absolute top-[3px] h-[17px] w-[17px] rounded-full transition-[left,background-color] duration-200 ${
          checked ? "left-[23px] bg-white" : "left-[3px] bg-dusk"
        }`}
      />
    </button>
  );
}

/** Magenta-filled range slider; the fill tracks the value. */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className = "",
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const filled = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`widget-range h-2 w-full cursor-pointer appearance-none rounded-full outline-none ${className}`}
      style={{
        background: `linear-gradient(90deg, var(--color-magenta) 0%, var(--color-violet) ${filled}%, rgba(255,255,255,0.07) ${filled}%, rgba(255,255,255,0.07) 100%)`,
      }}
    />
  );
}

/** Checkbox with the site's magenta accent. */
export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-mist">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 flex-none cursor-pointer accent-magenta"
      />
      {children}
    </label>
  );
}

/* ──────────────────────── composite patterns ───────────────────────── */

/**
 * A strategy the operator switches into the plan: title, what it's worth, and
 * a body of inputs that only exists while it's on.
 *
 * Switched off it collapses to a name and a switch, so a long stack stays
 * scannable — the point of the screen is which levers are pulled, not the
 * settings behind ones that aren't.
 */
export function StrategyCard({
  title,
  badge,
  kind,
  note,
  gain,
  gainLabel = "per year",
  hero,
  heroNote,
  heroMuted = false,
  meta,
  on,
  onToggle,
  footnote,
  children,
}: {
  title: React.ReactNode;
  /** Inline flag next to the title, e.g. "(Our #1 pick)". */
  badge?: React.ReactNode;
  /** Mono sub-label shown while open, e.g. "Retirement". */
  kind?: React.ReactNode;
  /** One-line description, shown whether open or closed. */
  note?: React.ReactNode;
  /** Compact figure in the top-right — for cards read as a list of gains. */
  gain?: React.ReactNode;
  gainLabel?: string;
  /** Large figure opening the body — for cards read one at a time. */
  hero?: React.ReactNode;
  /** Line under the hero, e.g. "≈ $5,390 tax saved". */
  heroNote?: React.ReactNode;
  /** Greys the heroNote, for "— not available". */
  heroMuted?: boolean;
  /** Dashed-rule mono line under the hero, e.g. the immediate-return figure. */
  meta?: React.ReactNode;
  on: boolean;
  onToggle: (v: boolean) => void;
  /** Teal caveat pill under the body, e.g. "Conservative estimate". */
  footnote?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const hasBody = on && (hero != null || meta != null || children != null);
  return (
    <div
      className={`rounded-[16px] border transition-[border-color,box-shadow] duration-200 ${
        on
          ? "border-transparent bg-gradient-to-r from-magenta/[0.09] to-violet/[0.09] px-5 py-4 shadow-[inset_0_0_0_1px_rgba(168,75,224,0.35)] hover:shadow-[inset_0_0_0_1px_rgba(168,75,224,0.5),0_0_40px_-18px_rgba(255,45,120,0.6)]"
          : "border-edge px-5 py-3.5 hover:border-edge-mid"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div className="min-w-0 flex-1">
          <p
            className={`font-display font-semibold ${
              on ? "text-[15.5px] text-fog" : "text-[15px] text-mist"
            }`}
          >
            {title}
            {badge && on ? (
              <span className="ml-2 align-middle font-mono text-[11px] font-bold text-magenta">
                {badge}
              </span>
            ) : null}
          </p>
          {kind && on ? <Mono className="mt-0.5 block text-faint">{kind}</Mono> : null}
          {note ? <p className="mt-0.5 text-[13px] text-muted">{note}</p> : null}
        </div>

        {gain != null ? (
          <div className="whitespace-nowrap text-right font-display text-[16px] font-semibold text-teal">
            {gain}
            <small className="mt-0.5 block font-body text-[10px] font-medium uppercase tracking-[1px] text-faint">
              {gainLabel}
            </small>
          </div>
        ) : null}

        <Switch checked={on} onChange={onToggle} label={`Include ${title}`} />
      </div>

      {hasBody ? (
        <div className="mt-3.5 border-t border-edge pt-3.5">
          {hero != null ? (
            <>
              <div className="font-display text-[34px] font-bold leading-none tracking-[-1.5px] tabular-nums text-grad">
                {hero}
              </div>
              {heroNote ? (
                <div
                  className={`mt-1 text-[14px] ${
                    heroMuted ? "text-faint" : "font-semibold text-teal"
                  }`}
                >
                  {heroNote}
                </div>
              ) : null}
            </>
          ) : null}

          {meta ? (
            <div className="mt-2.5 border-t border-dashed border-edge pt-2.5 font-mono text-[11px] leading-relaxed text-muted">
              {meta}
            </div>
          ) : null}

          {children ? (
            <div className={hero != null || meta != null ? "mt-2.5" : ""}>
              {children}
            </div>
          ) : null}

          {footnote ? (
            <span className="mt-2.5 inline-block rounded-full border border-teal/40 px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[1px] text-teal">
              {footnote}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Collapsed-by-default disclosure for settings that aren't the point of the
 * screen — pricing to set before a call, IRS caps to check once a year.
 *
 * Closed by default on purpose: these are staff-only controls, and several of
 * these tools get screen-shared with a client.
 */
export function Drawer({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-edge bg-white/[0.02]">
      <button
        type="button"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-3.5 text-left text-[13px] text-muted transition-colors duration-150 hover:text-fog"
      >
        {icon}
        {title}
        <span
          aria-hidden
          className={`ml-auto text-[15px] text-dusk transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        >
          ›
        </span>
      </button>
      {open ? (
        <div className="border-t border-edge px-4 pb-5 pt-4">{children}</div>
      ) : null}
    </div>
  );
}

/** The cog that marks a drawer as staff-only setup. */
export function CogIcon() {
  return (
    <svg
      aria-hidden
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="flex-none"
    >
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

/** Small-print block that closes a widget. Every tool carries one. */
export function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-7 border-t border-edge pt-4 text-[11.5px] leading-relaxed text-faint">
      {children}
    </p>
  );
}
