"use client";

/**
 * Small pieces the Client Feedback tabs share: score chips, flag pills, the
 * toolbar controls, distribution bars, the dense table selects.
 *
 * Portal chrome, so palette tokens only (the portal has a light theme that
 * re-binds them) and the UI kit's radius scale: 16 panels, 10 controls/chips,
 * full for pills. Scores read the same everywhere: CSAT ≥ 4 teal, 3 amber,
 * ≤ 2 danger; NPS promoter teal, passive amber, detractor danger — always
 * with the number printed, never colour alone.
 */

import { npsBand } from "@/lib/feedback/schema";

export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      className={`inline-block flex-none ${className}`}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export type Tone = "pos" | "warn" | "neg" | "brand" | "mute";

const TONE: Record<Tone, string> = {
  pos: "border-teal/45 bg-teal/10 text-teal",
  warn: "border-tier-warn/45 bg-tier-warn/10 text-tier-warn",
  neg: "border-danger/45 bg-danger/10 text-danger",
  brand: "border-magenta/45 bg-magenta/10 text-magenta",
  mute: "border-edge-mid text-dusk",
};

/** A score in a box, coloured by how good it is. */
function Score({ v, tone }: { v: number | null; tone: Tone }) {
  if (v == null) return <span className="font-mono text-faint">–</span>;
  return (
    <span
      className={`inline-grid h-6 min-w-[28px] place-items-center rounded-[7px] border px-1.5 font-mono text-[12px] tabular-nums ${TONE[tone]}`}
    >
      {v}
    </span>
  );
}

export const csatTone = (v: number): Tone => (v >= 4 ? "pos" : v >= 3 ? "warn" : "neg");

export function ScoreChip({ v }: { v: number | null }) {
  return <Score v={v} tone={v == null ? "mute" : csatTone(v)} />;
}

export function NpsChip({ v }: { v: number | null }) {
  const b = npsBand(v);
  return <Score v={v} tone={b === "promoter" ? "pos" : b === "passive" ? "warn" : "neg"} />;
}

/** The small mono pills: flags, rounds, task state. */
export function Pill({ tone = "mute", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`mr-1 inline-block whitespace-nowrap rounded-full border px-[7px] py-[2px] font-mono text-[10.5px] tracking-[0.06em] ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

const caret: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%238f88a0' stroke-width='2'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
};

/** Toolbar select — the filters above the tables, not the editable cells in them. */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
  width = "w-[160px]",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-dusk">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={caret}
        className={`${width} cursor-pointer appearance-none rounded-[10px] border border-edge-mid bg-panel-2 py-2 pl-3 pr-8 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]`}
      >
        {children}
      </select>
    </label>
  );
}

export function ToolButton({
  children,
  onClick,
  disabled = false,
  danger = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`cursor-pointer whitespace-nowrap rounded-[10px] border border-edge-mid bg-transparent px-3 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk transition-colors duration-150 disabled:cursor-default disabled:opacity-40 ${
        danger ? "hover:border-danger hover:text-danger" : "hover:border-magenta hover:text-fog"
      } disabled:hover:border-edge-mid disabled:hover:text-dusk`}
    >
      {children}
    </button>
  );
}

/** A dense select for a table cell. Teal edge once it holds a value. */
export function CellSelect({
  value,
  options,
  onChange,
  disabled,
  label,
  wide = false,
}: {
  value: string | null;
  /** [value, label]. A stored value not in here still shows, marked. */
  options: [string, string][];
  onChange: (v: string | null) => void;
  disabled?: boolean;
  label: string;
  wide?: boolean;
}) {
  const has = !!value;
  const known = !has || options.some(([v]) => v === value);
  return (
    <select
      value={value ?? ""}
      aria-label={label}
      title={label}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      style={{ ...caret, backgroundPosition: "right 8px center" }}
      className={`${wide ? "w-full" : "w-[150px]"} cursor-pointer appearance-none rounded-[8px] border bg-panel-2 py-1.5 pl-2 pr-6 font-body text-[12.5px] text-fog outline-none transition-[border-color,box-shadow,opacity] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)] disabled:cursor-not-allowed disabled:opacity-50 ${
        has ? "border-teal/45" : "border-edge-mid"
      }`}
    >
      <option value="">—</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
      {known ? null : <option value={value!}>{value} (not in list)</option>}
    </select>
  );
}

export type BarItem = { label: string; n: number; sub?: string; color?: string };

/**
 * Distribution bars in a fixed order (5 → 1, promoters → detractors), each a
 * share of `total` — not ranked, not scaled to the biggest: "how many of
 * everyone said 5" is the question.
 */
export function Bars({ items, total }: { items: BarItem[]; total: number }) {
  if (!items.length) return <p className="m-0 text-[12.5px] text-dusk">No data yet.</p>;
  return (
    <div>
      {items.map((it) => {
        const p = total ? it.n / total : 0;
        return (
          <div key={it.label} className="py-[7px]">
            <div className="flex justify-between gap-2.5 text-[13px] text-mist">
              <span className="min-w-0 truncate" title={it.label}>
                {it.label}
              </span>
              <span className="whitespace-nowrap font-mono text-[12.5px] tabular-nums text-fog">
                {it.n}
                <em className="ml-1.5 not-italic text-[11px] text-dusk">{Math.round(p * 100)}%</em>
              </span>
            </div>
            {it.sub ? <div className="mt-0.5 text-[11.5px] text-dusk">{it.sub}</div> : null}
            <div className="mt-[7px] h-[5px] overflow-hidden rounded-full bg-panel-2">
              <i
                className="block h-full rounded-[inherit]"
                style={{ width: `${p ? Math.max(p * 100, 1.5) : 0}%`, background: it.color ?? "var(--color-magenta)" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const scoreColor = (v: number | null) =>
  v == null ? "transparent" : v >= 4 ? "var(--color-teal)" : v >= 3 ? "var(--color-tier-warn)" : "var(--color-danger)";

/** Averages out of 5, each on its own track. */
export function AvgRows({ items }: { items: { label: string; v: number | null }[] }) {
  return (
    <div>
      {items.map((it) => (
        <div key={it.label} className="py-[7px]">
          <div className="flex justify-between gap-2.5 text-[13px] text-mist">
            <span>{it.label}</span>
            <span className="whitespace-nowrap font-mono text-[12.5px] tabular-nums text-fog">
              {it.v == null ? "–" : (Math.round(it.v * 10) / 10).toFixed(1)}
              <em className="ml-1.5 not-italic text-[11px] text-dusk">of 5</em>
            </span>
          </div>
          <div className="mt-[7px] h-[5px] overflow-hidden rounded-full bg-panel-2">
            <i className="block h-full rounded-[inherit]" style={{ width: `${it.v == null ? 0 : (it.v / 5) * 100}%`, background: scoreColor(it.v) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Copy to the clipboard, falling back to the old select-and-copy. True on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
