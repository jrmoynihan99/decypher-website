"use client";

/**
 * Resizable columns for the sales grid.
 *
 * The client's complaint was that a column can't be shortened or widened — an
 * Airtable habit, and a reasonable one: the useful width of "Service sold"
 * versus "Offer" depends entirely on what you're looking at today.
 *
 * ── Why widths live in CSS variables ─────────────────────────────────────────
 * The obvious implementation puts the width in React state and updates it on
 * every pointermove. That re-renders seventy-five rows and up to nine hundred
 * form controls per frame, and the drag visibly lags the cursor.
 *
 * So the drag writes `--c-<id>` straight onto the wrapper element and the
 * `<col>` elements read it. No React render happens until pointerup, when the
 * final width is committed to state and to localStorage. The variable the DOM
 * already holds and the value state then re-renders with are identical, so the
 * commit is invisible.
 *
 * ── Why there is a trailing slack column ─────────────────────────────────────
 * `table-fixed` is what makes a `<col>` width authoritative. But a fixed-layout
 * table still stretches to `width: 100%`, and any slack gets distributed across
 * the columns — so shrinking one column would silently widen the others, which
 * is the opposite of what "resize this column" means. An unsized column at the
 * end absorbs the slack instead, and collapses to nothing once the real columns
 * add up to more than the panel, at which point the wrapper scrolls.
 *
 * ── Why the horizontal scrollbar is drawn by hand ────────────────────────────
 * A scroll container's own scrollbar sits at the BOTTOM of the container. Deal
 * Desk is thirteen columns and seventy-five rows, so "scroll right" meant
 * scrolling down past two thousand pixels of table to reach the bar, dragging
 * it, and scrolling back up. The bar at the end of this file is `position:
 * sticky`, so it stays at the bottom of the viewport for as long as any part of
 * the table is on screen; the container's own bar is hidden, so there is still
 * exactly one.
 *
 * The thumb is a div, not a real scrollbar, and that is not decoration. macOS
 * renders overlay scrollbars that fade out when you stop scrolling — a proxy
 * bar built from one would be invisible until you already knew to scroll, which
 * is precisely the knowledge this thing exists to supply. Drawing it means it
 * looks and behaves the same on every platform, and it can be screenshotted.
 *
 * It never triggers a React render: the thumb is positioned by writing to the
 * DOM from the scroll handler, the same discipline the column widths follow.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export interface ColumnDef {
  /** Stable id — also the CSS custom-property name, so keep it identifier-ish. */
  id: string;
  label: React.ReactNode;
  /** Default width in px. */
  width: number;
  align?: "left" | "right";
  /** Floor for the drag. Defaults to 64, or 44 for a label-less action column. */
  min?: number;
  /** Header text exists for screen readers only — the ✕/Restore columns. */
  hiddenLabel?: boolean;
}

const STORAGE = "salesflow:cols:v1:";

export interface ColumnWidths {
  /** Inline style for the wrapper: every column's width as a custom property. */
  vars: React.CSSProperties;
  width: (col: ColumnDef) => number;
  commit: (id: string, px: number) => void;
  reset: () => void;
  /** True once anything has been dragged — gates the "reset widths" affordance. */
  customised: boolean;
}

const floor = (col: ColumnDef) => col.min ?? (col.hiddenLabel ? 44 : 64);

/* ── the saved widths, as an external store ──
 *
 * localStorage IS external state, so it's read through useSyncExternalStore
 * rather than copied into React state by an effect. That gets the SSR split
 * right for free — `getServerSnapshot` returns the defaults, so the markup
 * React renders on the server matches the markup it hydrates with, and the
 * stored widths land on the very next render instead of after a paint.
 *
 * The cache is what makes it legal: `getSnapshot` has to return the same
 * reference until something actually changes, and re-parsing the JSON each call
 * would hand React a new object every render and spin forever.
 */
const EMPTY: Record<string, number> = {};
const cache = new Map<string, Record<string, number>>();
const listeners = new Set<() => void>();

function readWidths(tableId: string): Record<string, number> {
  const hit = cache.get(tableId);
  if (hit) return hit;
  let parsed: Record<string, number> = EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE + tableId);
    const value = raw ? JSON.parse(raw) : null;
    if (value && typeof value === "object") parsed = value as Record<string, number>;
  } catch {
    // A blocked or corrupt store just means default widths.
  }
  cache.set(tableId, parsed);
  return parsed;
}

function writeWidths(tableId: string, next: Record<string, number>) {
  cache.set(tableId, next);
  try {
    if (Object.keys(next).length) {
      window.localStorage.setItem(STORAGE + tableId, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(STORAGE + tableId);
    }
  } catch {
    // Non-fatal: the widths still apply for this session.
  }
  for (const notify of listeners) notify();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Stored widths for one table. */
export function useColumnWidths(tableId: string, columns: ColumnDef[]): ColumnWidths {
  const stored = useSyncExternalStore(
    subscribe,
    () => readWidths(tableId),
    () => EMPTY,
  );

  const width = useCallback(
    (col: ColumnDef) => stored[col.id] ?? col.width,
    [stored],
  );

  const commit = useCallback(
    (id: string, px: number) =>
      writeWidths(tableId, { ...readWidths(tableId), [id]: Math.round(px) }),
    [tableId],
  );

  const reset = useCallback(() => writeWidths(tableId, {}), [tableId]);

  const vars: React.CSSProperties = {};
  for (const col of columns) {
    (vars as Record<string, string>)[`--c-${col.id}`] = `${width(col)}px`;
  }
  return {
    vars,
    width,
    commit,
    reset,
    customised: columns.some((c) => stored[c.id] != null),
  };
}

/**
 * The table shell: the wrapper that carries the width variables, the colgroup
 * the widths drive, and a header row whose right edges are drag handles.
 *
 * Rows go in as `children` — one `<tbody>` — and each must end with a
 * `<SlackCell />` so the body lines up with the header's slack column.
 */
export function GridTable({
  columns,
  widths,
  children,
}: {
  columns: ColumnDef[];
  widths: ColumnWidths;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const drag = useRef<{ col: ColumnDef; startX: number; startW: number; live: number } | null>(
    null,
  );
  const pan = useRef<{ startX: number; startScroll: number } | null>(null);

  const total = columns.reduce((sum, c) => sum + widths.width(c), 0);

  /**
   * Does the table need a horizontal scrollbar at all?
   *
   * Measured off the container rather than the table so this only re-renders
   * when the window or the sidebar changes — the table's own width changes on
   * every frame of a drag, and observing that would put a React render inside
   * the exact loop the CSS variables exist to keep out of it.
   */
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailable(entry.contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const overflowing = available > 0 && total > available + 1;

  /** Shortest thumb we'll draw. Below this it stops being grabbable. */
  const MIN_THUMB = 44;

  /** Where the thumb sits, given where the table is scrolled to. */
  const geometry = (wrap: HTMLDivElement) => {
    const track = wrap.clientWidth;
    const width = Math.max(MIN_THUMB, track * (wrap.clientWidth / wrap.scrollWidth));
    const scrollable = wrap.scrollWidth - wrap.clientWidth;
    return { track, width, travel: track - width, scrollable };
  };

  /** Paint the thumb from the DOM. Deliberately not a render. */
  const paintThumb = useCallback(() => {
    const wrap = wrapRef.current;
    const thumb = thumbRef.current;
    if (!wrap || !thumb) return;
    const { width, travel, scrollable } = geometry(wrap);
    thumb.style.width = `${width}px`;
    thumb.style.transform = `translateX(${
      scrollable > 0 ? (wrap.scrollLeft / scrollable) * travel : 0
    }px)`;
  }, []);

  // Re-paint whenever the geometry changes underneath the thumb: first render,
  // a window resize, a committed column width, switching which table is shown.
  useEffect(paintThumb, [paintThumb, available, total, overflowing]);

  const scrollTo = (left: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.scrollLeft = left;
    paintThumb();
  };

  const onThumbDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !wrapRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { startX: e.clientX, startScroll: wrapRef.current.scrollLeft };
    setGrabbing(true);
  };

  const onThumbMove = (e: React.PointerEvent) => {
    const p = pan.current;
    const wrap = wrapRef.current;
    if (!p || !wrap) return;
    const { travel, scrollable } = geometry(wrap);
    if (travel <= 0) return;
    // One pixel of thumb is `scrollable / travel` pixels of table.
    scrollTo(p.startScroll + ((e.clientX - p.startX) * scrollable) / travel);
  };

  const endPan = () => {
    pan.current = null;
    setGrabbing(false);
  };

  /** Clicking the track jumps, centring the thumb on the click. */
  const onTrackDown = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (e.button !== 0 || !wrap || !track) return;
    const { width, travel, scrollable } = geometry(wrap);
    if (travel <= 0) return;
    const x = e.clientX - track.getBoundingClientRect().left - width / 2;
    scrollTo((Math.min(Math.max(x, 0), travel) / travel) * scrollable);
  };

  const setVar = (id: string, px: number) =>
    wrapRef.current?.style.setProperty(`--c-${id}`, `${px}px`);

  const onPointerDown = (e: React.PointerEvent, col: ColumnDef) => {
    // Left button only; a right-click drag would strand the handler.
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startW = widths.width(col);
    drag.current = { col, startX: e.clientX, startW, live: startW };
    setDragging(col.id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.max(floor(d.col), d.startW + (e.clientX - d.startX));
    d.live = next;
    setVar(d.col.id, next);
    // The table just got wider or narrower; the thumb has to agree, and this
    // is a DOM write rather than a render for the same reason the width is.
    paintThumb();
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    if (d && d.live !== d.startW) widths.commit(d.col.id, d.live);
  };

  /** Double-click a handle to put that one column back to its default. */
  const onDoubleClick = (col: ColumnDef) => {
    setVar(col.id, col.width);
    widths.commit(col.id, col.width);
  };

  return (
    // The sticky bar's travel is bounded by this element, so it comes to rest
    // under the last row rather than floating on past the table.
    <div style={widths.vars} className="relative">
      <div
        ref={wrapRef}
        onScroll={paintThumb}
        className={`overflow-x-auto ${overflowing ? "scrollbar-none" : ""} ${
          dragging ? "select-none" : ""
        }`}
      >
        <table className="w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            {columns.map((c) => (
              <col key={c.id} style={{ width: `var(--c-${c.id})` }} />
            ))}
            {/* Slack. Unsized on purpose — see the header note. */}
            <col />
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className={`group relative border-b border-edge-mid px-2.5 py-2.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.8px] text-dusk ${
                    c.align === "left" ? "text-left" : "text-right"
                  }`}
                >
                  {c.hiddenLabel ? (
                    <span className="sr-only">{c.label}</span>
                  ) : (
                    <span className="block truncate">{c.label}</span>
                  )}
                  <span
                    role="separator"
                    aria-label="Resize column"
                    onPointerDown={(e) => onPointerDown(e, c)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onDoubleClick={() => onDoubleClick(c)}
                    title="Drag to resize · double-click to reset"
                    // Straddles the border rather than sitting inside one cell,
                    // which is where a hand aims.
                    className={`absolute -right-[3px] top-0 z-10 h-full w-[7px] cursor-col-resize touch-none after:absolute after:inset-y-1.5 after:left-[3px] after:w-px after:transition-colors after:duration-150 ${
                      dragging === c.id
                        ? "after:bg-magenta"
                        : "after:bg-transparent group-hover:after:bg-edge-bright"
                    }`}
                  />
                </th>
              ))}
              <th className="border-b border-edge-mid" />
            </tr>
          </thead>
          {children}
        </table>
      </div>

      {/* The scrollbar, pinned to the bottom of the viewport for as long as any
          of the table is on screen. z-10 keeps it under the shell's sticky
          header (z-20) and well under the notes dialog.

          aria-hidden because it duplicates scrolling the container itself,
          which keyboard and trackpad still reach directly; a second focusable
          control for the same thing is noise in a screen reader. */}
      {overflowing ? (
        <div
          ref={trackRef}
          aria-hidden
          onPointerDown={onTrackDown}
          className="sticky bottom-0 z-10 cursor-pointer border-t border-edge bg-panel px-0 py-[3px]"
        >
          <div
            ref={thumbRef}
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            className={`h-[7px] rounded-full transition-colors duration-150 ${
              grabbing
                ? "cursor-grabbing bg-magenta"
                : "cursor-grab bg-dusk hover:bg-mist"
            }`}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A grid cell.
 *
 * Separate from the shared TableCell because this one clips: under
 * `table-fixed` a value wider than its column would otherwise paint straight
 * across its neighbour. The 10px horizontal padding is what keeps a focused
 * control's 3px ring inside the clip.
 */
export function GridCell({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`overflow-hidden border-b border-edge px-2.5 py-2 font-mono tabular-nums ${
        align === "left" ? "text-left" : "text-right"
      } ${className}`}
    >
      {children}
    </td>
  );
}

/** The body-side partner of the header's slack column. */
export function SlackCell() {
  return <td className="border-b border-edge" />;
}
