"use client";

/**
 * The Sales Flow tab — the replacement for the client's Airtable SALES base.
 *
 * THREE TABS, ONE COLLECTION. Booked Calls, Deal Desk and Referrals are filters
 * over the same documents, not separate tables:
 *
 *   Booked Calls  every booked call, with the two triage checkboxes
 *   Deal Desk     isSales || isReferral — the money view
 *   Referrals     isReferral — attribution and commission
 *
 * Airtable models them as three tables and pays for it: a referred deal's
 * status is typed into DEAL Desk and again into REFERRALS, the two drift apart,
 * and the same lead exists twice under two spellings. Here there is one status
 * field, edited from whichever tab you happen to be on. The client's own data
 * justified the collapse — of 4,532 booked calls, every one of the 130 flagged
 * Referral is also flagged Sales.
 *
 * That single-document model is also why delete works from every tab: there is
 * one row to archive, so removing it from Deal Desk removes it from Booked
 * Calls, from Referrals, and from every total, because they were never copies.
 *
 * Everything saves on change. No Save button, because the thing being replaced
 * doesn't have one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CALL_TYPES,
  CALL_TYPE_LABELS,
  CALL_TYPE_SHORT,
  type CallType,
  COMMISSION_PRESETS,
  DEAL_STATUS_META,
  type CommissionPreset,
  commissionTotal,
  optionLabel,
  partnerPayout,
  payoutDate,
} from "@/lib/sales/options";
import type {
  CreatorOption,
  ReferrerRow,
  SalesCallEdits,
  SalesCallRow,
  SalesOptionsConfig,
} from "@/lib/sales/types";
import {
  Kpi,
  KpiRow,
  Mono,
  Panel,
  Segmented,
} from "@/components/portal/widgets/ui";
import {
  CheckCell,
  DateCell,
  DeleteCell,
  MoneyCell,
  NotesCell,
  ReferrerCell,
  RestoreCell,
  SelectCell,
  Suggestion,
} from "./cells";
import {
  type ColumnDef,
  type ColumnWidths,
  GridCell,
  GridTable,
  SlackCell,
  useColumnWidths,
} from "./grid";
import AddCallRow, { type ManualCallDraft } from "./AddCallRow";
import SalesStats from "./SalesStats";
import OptionsEditor from "./OptionsEditor";

type Tab = "booked" | "deals" | "referrals" | "stats";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
      })
    : "—";

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * How many rows to put in the DOM at once.
 *
 * Not cosmetic — each row carries up to eleven form controls, so the full 824
 * is ~9,000 of them and switching tabs re-mounts the lot. Rendering a slice is
 * what makes the tab usable. Filtering and searching still run over EVERY row;
 * only the rendered window is capped, so a match from 2024 is always findable.
 */
const PAGE = 75;

/**
 * The date presets.
 *
 * The four calendar-anchored ones (this/last quarter, year to date, last year)
 * exist for the comparison selector below: "this quarter vs last quarter" is
 * only a meaningful question if a quarter is something the toolbar can name.
 */
const RANGES = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "3m", label: "Last 3 months" },
  { id: "6m", label: "Last 6 months" },
  { id: "qtd", label: "This quarter" },
  { id: "lastq", label: "Last quarter" },
  { id: "ytd", label: "Year to date" },
  { id: "lasty", label: "Last year" },
  { id: "12m", label: "Last 12 months" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom range…" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const RANGE_DAYS: Partial<Record<RangeId, number>> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "6m": 180,
  "12m": 365,
};

export interface Bounds {
  start: number | null;
  end: number | null;
}

const quarterStart = (d: Date) =>
  new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);

/**
 * Epoch ms bounds for a range. `null` on either side means unbounded.
 *
 * Custom returns whatever the two date inputs hold — either may be empty, so
 * "everything before 1 March" is expressible without inventing a start date.
 * The end is pushed to the end of its day: a bookedAt timestamp of 14:30 on
 * the chosen end date is inside the range a human means by it.
 */
function rangeBounds(id: RangeId, custom: { from: string; to: string }): Bounds {
  if (id === "custom") {
    const start = custom.from ? new Date(`${custom.from}T00:00:00`).getTime() : null;
    const end = custom.to ? new Date(`${custom.to}T23:59:59.999`).getTime() : null;
    return {
      start: Number.isFinite(start) ? start : null,
      end: Number.isFinite(end) ? end : null,
    };
  }
  if (id === "all") return { start: null, end: null };

  const now = new Date();
  if (id === "ytd") return { start: new Date(now.getFullYear(), 0, 1).getTime(), end: null };
  if (id === "lasty") {
    return {
      start: new Date(now.getFullYear() - 1, 0, 1).getTime(),
      end: new Date(now.getFullYear(), 0, 1).getTime() - 1,
    };
  }
  if (id === "qtd") return { start: quarterStart(now).getTime(), end: null };
  if (id === "lastq") {
    const qs = quarterStart(now);
    return {
      start: new Date(qs.getFullYear(), qs.getMonth() - 3, 1).getTime(),
      end: qs.getTime() - 1,
    };
  }
  const days = RANGE_DAYS[id];
  return { start: days ? Date.now() - days * 86_400_000 : null, end: null };
}

const COMPARISONS = [
  { id: "none", label: "No comparison" },
  { id: "prev", label: "Previous period" },
  { id: "prev-year", label: "Same period, last year" },
  { id: "custom", label: "Custom period…" },
] as const;
type CompareId = (typeof COMPARISONS)[number]["id"];

/**
 * "Previous period" means the previous CALENDAR unit for the calendar-anchored
 * ranges, and an equal-length window immediately before for everything else.
 *
 * The distinction is the whole point of the feature. A span shift applied to
 * "This quarter" on 15 November gives 17 August – 30 September — a 45-day
 * window straddling two quarters, which answers nothing anyone asked. Shifting
 * the window back one quarter gives 1 July – 15 August: the same many days into
 * the previous quarter, which is the like-for-like the question implies.
 */
const CALENDAR_SHIFT: Partial<Record<RangeId, { months?: number; years?: number }>> = {
  qtd: { months: 3 },
  lastq: { months: 3 },
  ytd: { years: 1 },
  lasty: { years: 1 },
};

function shift(ms: number, by: { months?: number; years?: number }): number {
  const d = new Date(ms);
  if (by.years) d.setFullYear(d.getFullYear() - by.years);
  if (by.months) d.setMonth(d.getMonth() - by.months);
  return d.getTime();
}

/**
 * The window to measure the current range against, or null for "don't".
 *
 * An unbounded start (All time, or a custom range with no From) has no
 * comparable predecessor, so it returns null rather than inventing one — the
 * selector disables itself and says why.
 */
function comparisonBounds(
  range: RangeId,
  base: Bounds,
  mode: CompareId,
  compareCustom: { from: string; to: string },
): Bounds | null {
  if (mode === "none") return null;
  if (mode === "custom") {
    const b = rangeBounds("custom", compareCustom);
    return b.start == null && b.end == null ? null : b;
  }
  if (base.start == null) return null;
  const end = base.end ?? Date.now();

  if (mode === "prev-year") {
    return { start: shift(base.start, { years: 1 }), end: shift(end, { years: 1 }) };
  }
  const calendar = CALENDAR_SHIFT[range];
  if (calendar) {
    return { start: shift(base.start, calendar), end: shift(end, calendar) };
  }
  return { start: base.start - (end - base.start) - 1, end: base.start - 1 };
}

const inBounds = (iso: string | null, { start, end }: Bounds) => {
  if (start == null && end == null) return true;
  // Rows are ordered by bookedAt in Firestore, so a null can't reach here;
  // excluding one would be right anyway — it can't be placed in a range.
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (start != null && t < start) return false;
  if (end != null && t > end) return false;
  return true;
};

export default function SalesFlow({
  initialCalls,
  initialReferrers,
  initialConfig,
  creators,
}: {
  initialCalls: SalesCallRow[];
  initialReferrers: ReferrerRow[];
  initialConfig: SalesOptionsConfig;
  creators: CreatorOption[];
}) {
  const [calls, setCalls] = useState(initialCalls);
  const [referrers, setReferrers] = useState(initialReferrers);
  const [config, setConfig] = useState(initialConfig);
  const [editingOptions, setEditingOptions] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<Tab>("booked");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeId>("ytd");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [compare, setCompare] = useState<CompareId>("none");
  const [compareCustom, setCompareCustom] = useState({ from: "", to: "" });
  const [callType, setCallType] = useState<CallType | "all">("all");
  const [visible, setVisible] = useState(PAGE);
  const [showArchived, setShowArchived] = useState(false);
  /* Per-tab segment filters. "" = all. Status is shared by Deal Desk and
     Referrals — it is the same field, so one selection following you across
     the two tabs is the behaviour that matches the data model. */
  const [statusFilter, setStatusFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [referrerFilter, setReferrerFilter] = useState("");
  /** The last row archived, so it can be put straight back. */
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** `${id}:${field}` while a write is in flight, so one cell greys, not the row. */
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const busy = useCallback(
    (id: string, field: string) => saving.has(`${id}:${field}`),
    [saving],
  );

  /**
   * Latest rows, for the save rollback, without making `saveMany` depend on
   * `calls`. It would otherwise get a new identity on every keystroke and
   * re-render all seventy-five rows and their controls each time.
   */
  const callsRef = useRef(calls);
  useEffect(() => {
    callsRef.current = calls;
  }, [calls]);

  /**
   * Changing what's being looked at resets the render window — otherwise
   * switching to a narrow filter after paging deep leaves a "load more" button
   * with nothing behind it.
   *
   * Done in the handlers rather than in an effect on [tab, query, range, type]:
   * an effect that setStates would render once with the old window and again
   * with the reset one, and the first of those is a full re-render of every
   * visible row.
   */
  const withReset =
    <T,>(set: (v: T) => void) =>
    (value: T) => {
      set(value);
      setVisible(PAGE);
    };

  /**
   * Optimistic save of one or more fields on a row, as a single request.
   *
   * The value lands locally first so the grid never lags a keystroke behind,
   * and the previous row is captured for the rollback — a failed save that left
   * the wrong number on screen would be worse than no save at all, because the
   * operator would believe it.
   *
   * MULTI-FIELD EDITS MUST GO IN ONE CALL. Firing a request per field races:
   * each response carries the whole server row as it looked when that write
   * finished, and applying them in completion order lets the slowest response
   * overwrite fields the other two had already set. Applying a commission
   * preset touches three fields and hit exactly that.
   */
  const saveMany = useCallback(
    async (id: string, patch: Partial<SalesCallEdits>) => {
      const before = callsRef.current.find((c) => c.id === id);
      if (!before) return;
      const keys = Object.keys(patch).map((f) => `${id}:${f}`);

      setCalls((rows) =>
        rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
      setSaving((s) => {
        const next = new Set(s);
        for (const k of keys) next.add(k);
        return next;
      });
      setError(null);

      try {
        const res = await fetch(
          `/api/portal/sales/calls/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok)
          throw new Error(body?.message ?? `Save failed (${res.status})`);
        // Take the server's row: it also refreshes derived fields like
        // referrerName that this component didn't compute.
        setCalls((rows) =>
          rows.map((r) => (r.id === id ? (body.call as SalesCallRow) : r)),
        );
      } catch (e) {
        setCalls((rows) => rows.map((r) => (r.id === id ? before : r)));
        setError(e instanceof Error ? e.message : "Couldn't save");
      } finally {
        setSaving((s) => {
          const next = new Set(s);
          for (const k of keys) next.delete(k);
          return next;
        });
      }
    },
    [],
  );

  const save = useCallback(
    <K extends keyof SalesCallEdits>(
      id: string,
      field: K,
      value: SalesCallEdits[K],
    ) => {
      void saveMany(id, { [field]: value } as Partial<SalesCallEdits>);
    },
    [saveMany],
  );

  const archive = useCallback(
    (row: SalesCallRow) => {
      setUndo({ id: row.id, name: row.name || row.email || "that row" });
      void saveMany(row.id, { archived: true });
    },
    [saveMany],
  );

  const restore = useCallback(
    (id: string) => {
      setUndo(null);
      void saveMany(id, { archived: false });
    },
    [saveMany],
  );

  /**
   * Add a row that never came from Calendly.
   *
   * Spliced into place by bookedAt rather than appended: the list is sorted
   * newest-first everywhere else, and a back-dated row landing at the top would
   * look like a bug until the next reload moved it.
   */
  const addCall = useCallback(async (draft: ManualCallDraft): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch("/api/portal/sales/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.message ?? "Couldn't add that row");
      const call = body.call as SalesCallRow;
      setCalls((rows) => {
        const next = [...rows, call];
        next.sort(
          (a, b) =>
            new Date(b.bookedAt ?? 0).getTime() - new Date(a.bookedAt ?? 0).getTime(),
        );
        return next;
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that row");
      return false;
    }
  }, []);

  const addReferrer = useCallback(
    async (name: string): Promise<string | null> => {
      setError(null);
      try {
        const res = await fetch("/api/portal/sales/referrers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok)
          throw new Error(body?.message ?? "Couldn't add partner");
        const referrer = body.referrer as ReferrerRow;
        setReferrers((rs) =>
          rs.some((r) => r.id === referrer.id)
            ? rs
            : [...rs, referrer].sort((a, b) => a.name.localeCompare(b.name)),
        );
        return referrer.id;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add partner");
        return null;
      }
    },
    [],
  );

  /* ── options-editor handlers ── */

  const saveConfig = useCallback(async (next: SalesOptionsConfig) => {
    setError(null);
    try {
      const res = await fetch("/api/portal/sales/options", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.message ?? "Couldn't save options");
      // Adopt the server's sanitized copy, not the draft — it's the one that
      // re-appends any default key the draft tried to drop.
      setConfig(body.config as SalesOptionsConfig);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save options");
      return false;
    }
  }, []);

  const patchReferrer = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<ReferrerRow, "name" | "active" | "showOnLeaderboard" | "sanityCreatorId">
      >,
    ) => {
      setError(null);
      try {
        const res = await fetch(`/api/portal/sales/referrers/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) throw new Error(body?.message ?? "Couldn't save partner");
        const updated = body.referrer as ReferrerRow;
        setReferrers((rs) =>
          rs.map((r) => (r.id === id ? updated : r)).sort((a, b) => a.name.localeCompare(b.name)),
        );
        // A rename propagates to referrerName server-side; mirror it locally
        // so the grid doesn't show the old spelling until the next refresh.
        if (patch.name) {
          setCalls((rows) =>
            rows.map((r) => (r.referrerId === id ? { ...r, referrerName: updated.name } : r)),
          );
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save partner");
        return false;
      }
    },
    [],
  );

  const removeReferrer = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/portal/sales/referrers/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.message ?? "Couldn't remove partner");
      if (body.outcome === "deleted") {
        setReferrers((rs) => rs.filter((r) => r.id !== id));
      } else {
        // Deactivated: keep the row so the roster explains itself, greyed out.
        setReferrers((rs) =>
          rs.map((r) =>
            r.id === id ? { ...r, active: false, showOnLeaderboard: false } : r,
          ),
        );
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove partner");
      return false;
    }
  }, []);

  const referrerOptions = useMemo(
    () =>
      referrers
        .filter((r) => r.active)
        .map((r) => ({ value: r.id, label: r.name })),
    [referrers],
  );

  /* ── filtering ──
   *
   * Four stages, in this order, and the order matters:
   *   scoped   date range + call type — this is what the KPIs count
   *   searched the text query, over EVERY scoped row, not just rendered ones
   *   rows     the tab's own filter
   *   page     the render window
   *
   * Search sitting above the window is the point: capping the DOM must not cap
   * what's findable.
   */

  const archivedCount = useMemo(
    () => calls.filter((c) => c.archived).length,
    [calls],
  );

  const bounds = useMemo(() => rangeBounds(range, custom), [range, custom]);

  /** Date range + call type, archived state not yet applied. */
  const inRange = useMemo(
    () =>
      calls.filter(
        (c) =>
          (callType === "all" || c.callType === callType) && inBounds(c.bookedAt, bounds),
      ),
    [calls, callType, bounds],
  );

  // Archived rows are out of every tab, every count and every total until
  // explicitly asked for — an archived deal must not show up in revenue.
  const scoped = useMemo(
    () => inRange.filter((c) => c.archived === showArchived),
    [inRange, showArchived],
  );

  /**
   * What the Stats tab aggregates. Archived is always excluded here regardless
   * of the toggle — "show me what I deleted" is a grid affordance, and a stats
   * page that silently reported on deleted deals would be a trap.
   */
  const statsRows = useMemo(
    () => inRange.filter((c) => !c.archived),
    [inRange],
  );

  /** By-year only: the whole history, date filter deliberately not applied. */
  const allTimeRows = useMemo(
    () =>
      calls.filter(
        (c) => !c.archived && (callType === "all" || c.callType === callType),
      ),
    [calls, callType],
  );

  /* ── the comparison window ── */

  const compareTo = useMemo(
    () => comparisonBounds(range, bounds, compare, compareCustom),
    [range, bounds, compare, compareCustom],
  );

  /** Same filters as `statsRows`, over the comparison window. */
  const compareRows = useMemo(() => {
    if (!compareTo) return null;
    return calls.filter(
      (c) =>
        !c.archived &&
        (callType === "all" || c.callType === callType) &&
        inBounds(c.bookedAt, compareTo),
    );
  }, [calls, callType, compareTo]);

  /** True when the current range has no predecessor to measure against. */
  const compareImpossible = bounds.start == null;

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((c) =>
      [c.name, c.email, c.phone, c.referrerName, c.callName, c.socials, c.notes]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [scoped, query]);

  const rows = useMemo(() => {
    let r = searched;
    if (tab === "deals") {
      r = r.filter((c) => c.isSales || c.isReferral);
      if (serviceFilter) r = r.filter((c) => c.service === serviceFilter);
      if (statusFilter) r = r.filter((c) => c.status === statusFilter);
    } else if (tab === "referrals") {
      r = r.filter((c) => c.isReferral);
      if (referrerFilter) r = r.filter((c) => c.referrerId === referrerFilter);
      if (statusFilter) r = r.filter((c) => c.status === statusFilter);
    }
    return r;
  }, [searched, tab, serviceFilter, statusFilter, referrerFilter]);

  const page = useMemo(() => rows.slice(0, visible), [rows, visible]);

  /* ── headline numbers, over the current date range and call type ── */

  const stats = useMemo(() => {
    const deals = scoped.filter((c) => c.isSales || c.isReferral);
    const won = deals.filter(
      (c) => c.status && DEAL_STATUS_META[c.status].counts,
    );
    const referrals = scoped.filter((c) => c.isReferral);
    return {
      booked: scoped.length,
      deals: deals.length,
      won: won.length,
      revenue: won.reduce((sum, c) => sum + (c.offer ?? 0), 0),
      referrals: referrals.length,
      owed: referrals
        .filter((c) => !c.paid)
        .reduce((sum, c) => sum + commissionTotal(c), 0),
    };
  }, [scoped]);

  const boundsLabel = useCallback((b: Bounds) => {
    if (b.start == null && b.end == null) return "All time";
    if (b.start != null && b.end != null) return `${longDate(b.start)} – ${longDate(b.end)}`;
    if (b.start != null) return `Since ${longDate(b.start)}`;
    return `Up to ${longDate(b.end!)}`;
  }, []);

  const rangeLabel = useMemo(() => {
    if (range !== "custom") return RANGES.find((r) => r.id === range)?.label ?? "";
    return boundsLabel(bounds) === "All time" ? "Custom range" : boundsLabel(bounds);
  }, [range, bounds, boundsLabel]);

  const compareLabel = useMemo(
    () => (compareTo ? boundsLabel(compareTo) : null),
    [compareTo, boundsLabel],
  );

  /* ── column widths, one saved set per table ── */

  const bookedCols = useColumnWidths("booked", BOOKED_COLUMNS);
  const dealCols = useColumnWidths("deals", DEAL_COLUMNS);
  const referralCols = useColumnWidths("referrals", REFERRAL_COLUMNS);
  const activeCols =
    tab === "deals" ? dealCols : tab === "referrals" ? referralCols : bookedCols;

  if (editingOptions) {
    return (
      <div className="space-y-5">
        {error ? (
          <div className="rounded-[10px] border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-danger">
            {error}
          </div>
        ) : null}
        <OptionsEditor
          config={config}
          onSaveConfig={saveConfig}
          referrers={referrers}
          onPatchReferrer={patchReferrer}
          onDeleteReferrer={removeReferrer}
          creators={creators}
          onClose={() => setEditingOptions(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <KpiRow cols={4}>
        <Kpi label="Booked calls" value={stats.booked} />
        <Kpi label="In deal desk" value={stats.deals} />
        <Kpi
          label="Closed won"
          value={stats.won}
          tone="pos"
          sub={money(stats.revenue)}
        />
        <Kpi
          label="Referrals"
          value={stats.referrals}
          tone="brand"
          sub={
            stats.owed ? `${money(stats.owed)} unpaid` : "nothing outstanding"
          }
        />
      </KpiRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={withReset(setTab)}
          ariaLabel="Pipeline view"
          options={[
            { value: "booked", label: "Booked Calls" },
            { value: "deals", label: "Deal Desk" },
            { value: "referrals", label: "Referrals" },
            { value: "stats", label: "Stats" },
          ]}
        />
        {tab === "stats" ? null : (
          <input
            type="search"
            value={query}
            placeholder="Search name, email, partner…"
            onChange={(e) => withReset(setQuery)(e.target.value)}
            className="w-full max-w-[280px] rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <Mono className="text-dusk">Booked</Mono>
          <FilterSelect
            value={range}
            onChange={(v) => withReset(setRange)(v as RangeId)}
            width="w-[160px]"
            ariaLabel="Date range"
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </FilterSelect>
        </label>

        {/* Only mounted while Custom is selected — two permanently-visible date
            inputs would crowd a toolbar that already carries four controls. */}
        {range === "custom" ? (
          <DateRange
            value={custom}
            onChange={(next) => {
              setCustom(next);
              setVisible(PAGE);
            }}
          />
        ) : null}

        <label className="flex items-center gap-2">
          <Mono className="text-dusk">Call</Mono>
          <FilterSelect
            value={callType}
            onChange={(v) => withReset(setCallType)(v as CallType | "all")}
            width="w-[210px]"
            ariaLabel="Call type"
          >
            <option value="all">All 3 call types</option>
            {CALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {CALL_TYPE_LABELS[t]}
              </option>
            ))}
          </FilterSelect>
        </label>

        {/* The comparison only means anything against aggregates, so it lives
            with the Stats tab rather than in the permanent toolbar. */}
        {tab === "stats" ? (
          <label className="flex items-center gap-2">
            <Mono className="text-dusk">Compare</Mono>
            <FilterSelect
              value={compare}
              onChange={(v) => setCompare(v as CompareId)}
              width="w-[200px]"
              ariaLabel="Compare against"
            >
              {COMPARISONS.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                  // "All time" has nothing before it, and neither does a custom
                  // range with an open start.
                  disabled={compareImpossible && c.id !== "none" && c.id !== "custom"}
                >
                  {c.label}
                </option>
              ))}
            </FilterSelect>
          </label>
        ) : null}

        {tab === "stats" && compare === "custom" ? (
          <DateRange value={compareCustom} onChange={setCompareCustom} />
        ) : null}

        {tab === "deals" ? (
          <label className="flex items-center gap-2">
            <Mono className="text-dusk">Service</Mono>
            <FilterSelect
              value={serviceFilter}
              onChange={(v) => withReset(setServiceFilter)(v)}
              width="w-[190px]"
              ariaLabel="Service sold"
            >
              <option value="">All services</option>
              {config.service
                .filter((o) => !o.retired)
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
            </FilterSelect>
          </label>
        ) : null}

        {tab === "referrals" ? (
          <label className="flex items-center gap-2">
            <Mono className="text-dusk">Referred by</Mono>
            <FilterSelect
              value={referrerFilter}
              onChange={(v) => withReset(setReferrerFilter)(v)}
              width="w-[180px]"
              ariaLabel="Referred by"
            >
              <option value="">All partners</option>
              {referrers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </FilterSelect>
          </label>
        ) : null}

        {tab === "deals" || tab === "referrals" ? (
          <label className="flex items-center gap-2">
            <Mono className="text-dusk">Status</Mono>
            <FilterSelect
              value={statusFilter}
              onChange={(v) => withReset(setStatusFilter)(v)}
              width="w-[170px]"
              ariaLabel="Deal status"
            >
              <option value="">All statuses</option>
              {config.dealStatus.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </FilterSelect>
          </label>
        ) : null}

        {tab !== "stats" && !showArchived ? (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className={`cursor-pointer rounded-[10px] border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.8px] transition-colors duration-150 ${
              adding
                ? "border-magenta/50 bg-magenta/10 text-magenta"
                : "border-edge-mid text-dusk hover:border-magenta hover:text-fog"
            }`}
          >
            ＋ Add row
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setEditingOptions(true)}
          title="Edit dropdown options, colours and referral partners"
          className="cursor-pointer rounded-[10px] border border-edge-mid px-3 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk transition-colors duration-150 hover:border-magenta hover:text-fog"
        >
          ⚙ Options
        </button>

        {tab !== "stats" && (archivedCount > 0 || showArchived) ? (
          <button
            type="button"
            onClick={() => withReset(setShowArchived)(!showArchived)}
            className={`cursor-pointer rounded-[10px] border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.8px] transition-colors duration-150 ${
              showArchived
                ? "border-magenta/50 bg-magenta/10 text-magenta"
                : "border-edge-mid text-dusk hover:text-fog"
            }`}
          >
            {showArchived ? "← Back to active" : `Deleted (${archivedCount})`}
          </button>
        ) : null}

        {query.trim() ? (
          <span className="font-body text-[11.5px] text-dusk">
            searching all {scoped.length.toLocaleString()} rows in{" "}
            {rangeLabel.toLowerCase()}
          </span>
        ) : null}
      </div>

      {adding && tab !== "stats" ? (
        <AddCallRow calls={calls} onAdd={addCall} onClose={() => setAdding(false)} />
      ) : null}

      {undo ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-edge-mid bg-panel-2 px-3.5 py-2.5 text-[12.5px] text-mist">
          <span>
            Deleted <span className="font-medium text-fog">{undo.name}</span>.
            It&rsquo;s hidden from all three tabs, and stays hidden through
            future Calendly syncs.
          </span>
          <button
            type="button"
            onClick={() => restore(undo.id)}
            className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.8px] text-magenta hover:underline"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            className="ml-auto cursor-pointer text-[13px] text-dusk hover:text-fog"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[10px] border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-danger">
          {error}
        </div>
      ) : null}

      {tab === "stats" ? (
        <SalesStats
          rows={statsRows}
          allRows={allTimeRows}
          compareRows={compareRows}
          compareLabel={compareLabel}
          rangeLabel={rangeLabel}
          config={config}
        />
      ) : (
        <Panel
          title={
            <>
              {tab === "booked"
                ? "Booked calls"
                : tab === "deals"
                  ? "Deal desk"
                  : "Referrals"}
              {showArchived ? (
                <span className="ml-2 text-magenta">· deleted</span>
              ) : null}
            </>
          }
          action={
            <span className="flex items-center gap-3">
              {activeCols.customised ? (
                <button
                  type="button"
                  onClick={activeCols.reset}
                  title="Put every column back to its default width"
                  className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1.2px] text-dusk hover:text-fog"
                >
                  ↔ Reset widths
                </button>
              ) : null}
              <Mono className="text-dusk">
                {page.length < rows.length
                  ? `${page.length} of ${rows.length.toLocaleString()}`
                  : `${rows.length.toLocaleString()} rows`}
              </Mono>
            </span>
          }
          bodyClassName="px-0 py-0"
        >
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-dusk">
              {calls.length === 0
                ? "No calls yet. Run the Calendly backfill, or wait for the next booking."
                : showArchived && archivedCount === 0
                  ? "Nothing deleted."
                  : scoped.length === 0
                    ? `Nothing ${showArchived ? "deleted" : "booked"} in ${rangeLabel.toLowerCase()}. Try a wider date range.`
                    : "Nothing matches that filter."}
            </p>
          ) : (
            <>
              {tab === "booked" ? (
                <BookedTable
                  rows={page}
                  widths={bookedCols}
                  save={save}
                  busy={busy}
                  archive={archive}
                  restore={restore}
                  showArchived={showArchived}
                />
              ) : tab === "deals" ? (
                <DealTable
                  rows={page}
                  widths={dealCols}
                  save={save}
                  busy={busy}
                  config={config}
                  archive={archive}
                  restore={restore}
                  showArchived={showArchived}
                />
              ) : (
                <ReferralTable
                  rows={page}
                  widths={referralCols}
                  save={save}
                  saveMany={saveMany}
                  busy={busy}
                  config={config}
                  referrerOptions={referrerOptions}
                  addReferrer={addReferrer}
                  archive={archive}
                  restore={restore}
                  showArchived={showArchived}
                />
              )}

              {page.length < rows.length ? (
                <div className="flex items-center justify-center gap-3 border-t border-edge px-4 py-3.5">
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE)}
                    className="cursor-pointer rounded-[10px] border border-edge-mid bg-panel-2 px-4 py-2 font-mono text-[11.5px] uppercase tracking-[0.8px] text-mist transition-colors duration-150 hover:border-magenta hover:text-fog"
                  >
                    Load {Math.min(PAGE, rows.length - page.length)} more
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisible(rows.length)}
                    className="cursor-pointer font-body text-[12px] text-dusk hover:text-fog hover:underline"
                  >
                    Show all {rows.length.toLocaleString()}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

/* ═══════════════════════════ shared bits ═══════════════════════════ */

/** Toolbar select — the filters above the grid, not the editable cells in it. */
function FilterSelect({
  value,
  onChange,
  children,
  width,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  width: string;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={`${width} cursor-pointer appearance-none rounded-[10px] border border-edge-mid bg-panel-2 py-2 pl-3 pr-8 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%238f88a0' stroke-width='2'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 11px center",
      }}
    >
      {children}
    </select>
  );
}

/** A from/to pair. Either side may be empty — an open-ended range is valid. */
function DateRange({
  value,
  onChange,
}: {
  value: { from: string; to: string };
  onChange: (next: { from: string; to: string }) => void;
}) {
  const cls =
    "rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-mono text-[12.5px] tabular-nums text-fog outline-none transition-[border-color] duration-150 [color-scheme:dark] focus:border-magenta";
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={value.from}
        max={value.to || undefined}
        aria-label="Range start"
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        className={cls}
      />
      <span className="font-mono text-[11px] text-dusk">→</span>
      <input
        type="date"
        value={value.to}
        min={value.from || undefined}
        aria-label="Range end"
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        className={cls}
      />
      {value.from || value.to ? (
        <button
          type="button"
          onClick={() => onChange({ from: "", to: "" })}
          className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[0.8px] text-dusk hover:text-fog"
        >
          Clear
        </button>
      ) : null}
    </span>
  );
}

type SaveFn = <K extends keyof SalesCallEdits>(
  id: string,
  field: K,
  value: SalesCallEdits[K],
) => void;
type BusyFn = (id: string, field: string) => boolean;

interface TableProps {
  rows: SalesCallRow[];
  widths: ColumnWidths;
  save: SaveFn;
  busy: BusyFn;
  config: SalesOptionsConfig;
}

/** Delete and restore, on every tab — there is one row behind all three. */
interface RowActionProps {
  archive: (row: SalesCallRow) => void;
  restore: (id: string) => void;
  showArchived: boolean;
}

function RowActions({
  row,
  busy,
  archive,
  restore,
  showArchived,
}: RowActionProps & { row: SalesCallRow; busy: BusyFn }) {
  return showArchived ? (
    <RestoreCell
      onRestore={() => restore(row.id)}
      saving={busy(row.id, "archived")}
      label={`Restore ${row.name}`}
    />
  ) : (
    <DeleteCell
      onDelete={() => archive(row)}
      saving={busy(row.id, "archived")}
      label={`Delete ${row.name || row.email}`}
    />
  );
}

/** Name plus the identifying details that would otherwise need their own columns. */
function Who({ row }: { row: SalesCallRow }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-body text-[13px] font-medium text-fog">
        {row.name || "—"}
      </div>
      <div
        className="truncate font-body text-[11px] text-dusk"
        title={row.email}
      >
        {row.email || "—"}
      </div>
      {row.phone ? (
        <div className="truncate font-mono text-[10.5px] text-faint">{row.phone}</div>
      ) : null}
    </div>
  );
}

function CallTypeChip({ row }: { row: SalesCallRow }) {
  const canceled = row.calendlyStatus === "canceled";
  return (
    <div className="min-w-0">
      <span
        title={row.callName || CALL_TYPE_LABELS[row.callType]}
        className="block truncate font-body text-[12px] text-mist"
      >
        {CALL_TYPE_SHORT[row.callType] ?? row.callType}
      </span>
      {canceled ? (
        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[1px] text-danger">
          canceled
        </span>
      ) : null}
      {/* Manual rows have no Calendly behind them; say so rather than let a
          reader assume the booking is verifiable upstream. */}
      {row.source === "manual" ? (
        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[1px] text-faint">
          added by hand
        </span>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════ booked calls ═══════════════════════════ */

const BOOKED_COLUMNS: ColumnDef[] = [
  { id: "booked", label: "Booked", width: 92, align: "left" },
  { id: "call", label: "Call", width: 130, align: "left" },
  { id: "name", label: "Name", width: 210, align: "left" },
  { id: "sales", label: "Sales", width: 66, align: "left" },
  { id: "referral", label: "Referral", width: 80, align: "left" },
  { id: "socials", label: "Website / social", width: 220, align: "left" },
  { id: "actions", label: "Delete", width: 84, align: "right", hiddenLabel: true },
];

/**
 * The triage tab. Its whole job is the two checkboxes: everything else is
 * context for deciding them.
 *
 * Both arrive pre-set — Sales on every discovery call, Referral on the Referral
 * Discovery Call — and both stay editable, which is the point. The client was
 * explicit that the auto-detection is a starting position, not a verdict.
 */
function BookedTable({
  rows,
  widths,
  save,
  busy,
  archive,
  restore,
  showArchived,
}: Omit<TableProps, "config"> & RowActionProps) {
  return (
    <GridTable columns={BOOKED_COLUMNS} widths={widths}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="align-top hover:bg-white/[0.02]">
            <GridCell>
              <span className="text-[12px] text-mist">{shortDate(row.bookedAt)}</span>
            </GridCell>
            <GridCell>
              <CallTypeChip row={row} />
            </GridCell>
            <GridCell>
              <Who row={row} />
            </GridCell>
            {/* The two checkboxes are the point of this tab, so they sit against
                the name rather than across the table from it — the eye travels
                name → sales → referral in one move. */}
            <GridCell>
              <CheckCell
                checked={row.isSales}
                saving={busy(row.id, "isSales")}
                label={`Sales call for ${row.name}`}
                onChange={(v) => save(row.id, "isSales", v)}
              />
            </GridCell>
            <GridCell>
              <CheckCell
                checked={row.isReferral}
                saving={busy(row.id, "isReferral")}
                label={`Referral for ${row.name}`}
                onChange={(v) => save(row.id, "isReferral", v)}
              />
            </GridCell>
            <GridCell>
              <span
                title={row.socials ?? ""}
                className="block truncate font-body text-[11.5px] text-dusk"
              >
                {row.socials || "—"}
              </span>
            </GridCell>
            <GridCell align="right">
              <RowActions
                row={row}
                busy={busy}
                archive={archive}
                restore={restore}
                showArchived={showArchived}
              />
            </GridCell>
            <SlackCell />
          </tr>
        ))}
      </tbody>
    </GridTable>
  );
}

/* ═══════════════════════════ deal desk ═══════════════════════════ */

const DEAL_COLUMNS: ColumnDef[] = [
  { id: "booked", label: "Booked", width: 92, align: "left" },
  { id: "call", label: "Call", width: 130, align: "left" },
  { id: "name", label: "Name", width: 200, align: "left" },
  { id: "leadSource", label: "Lead source", width: 160, align: "left" },
  { id: "show", label: "Show", width: 130, align: "left" },
  { id: "status", label: "Status", width: 165, align: "left" },
  { id: "offer", label: "Offer", width: 100, align: "right" },
  { id: "paymentPlan", label: "Pmt plan", width: 122, align: "left" },
  { id: "service", label: "Service sold", width: 200, align: "left" },
  { id: "objection", label: "Objection", width: 175, align: "left" },
  { id: "onboarding", label: "Onboarding", width: 136, align: "left" },
  { id: "notes", label: "Notes", width: 150, align: "left" },
  { id: "actions", label: "Delete", width: 84, align: "right", hiddenLabel: true },
];

function DealTable({
  rows,
  widths,
  save,
  busy,
  config,
  archive,
  restore,
  showArchived,
}: TableProps & RowActionProps) {
  return (
    <GridTable columns={DEAL_COLUMNS} widths={widths}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="align-top hover:bg-white/[0.02]">
            <GridCell>
              <span className="text-[12px] text-mist">{shortDate(row.bookedAt)}</span>
            </GridCell>
            <GridCell>
              <CallTypeChip row={row} />
            </GridCell>
            <GridCell>
              <Who row={row} />
            </GridCell>

            <GridCell>
              <SelectCell
                value={row.leadSource}
                items={config.leadSource}
                saving={busy(row.id, "leadSource")}
                title={row.leadSourceRaw ?? undefined}
                onChange={(v) => save(row.id, "leadSource", v)}
              />
              {/* Only while empty — a filled cell is the operator's answer. */}
              {!row.leadSource && row.suggestedLeadSource ? (
                <Suggestion
                  label={optionLabel(config.leadSource, row.suggestedLeadSource)}
                  title={row.leadSourceRaw ?? undefined}
                  onApply={() =>
                    save(row.id, "leadSource", row.suggestedLeadSource)
                  }
                />
              ) : null}
            </GridCell>

            {/* One control, not a control and a chip restating it — the colour
                is on the select itself. See the note on SelectCell. */}
            <GridCell>
              <SelectCell
                value={row.showStatus}
                items={config.showStatus}
                saving={busy(row.id, "showStatus")}
                onChange={(v) => save(row.id, "showStatus", v)}
              />
            </GridCell>

            <GridCell>
              <SelectCell
                value={row.status}
                items={config.dealStatus}
                saving={busy(row.id, "status")}
                onChange={(v) => save(row.id, "status", v)}
              />
            </GridCell>

            <GridCell align="right">
              <MoneyCell
                value={row.offer}
                saving={busy(row.id, "offer")}
                onChange={(v) => save(row.id, "offer", v)}
              />
            </GridCell>

            <GridCell>
              <SelectCell
                value={row.paymentPlan}
                items={config.paymentPlan}
                saving={busy(row.id, "paymentPlan")}
                onChange={(v) => save(row.id, "paymentPlan", v)}
              />
            </GridCell>

            <GridCell>
              <SelectCell
                value={row.service}
                items={config.service}
                saving={busy(row.id, "service")}
                onChange={(v) => save(row.id, "service", v)}
              />
            </GridCell>

            <GridCell>
              <SelectCell
                value={row.objection}
                items={config.objection}
                saving={busy(row.id, "objection")}
                onChange={(v) => save(row.id, "objection", v)}
              />
            </GridCell>

            <GridCell>
              <DateCell
                value={row.onboardingDate}
                saving={busy(row.id, "onboardingDate")}
                onChange={(v) => save(row.id, "onboardingDate", v)}
              />
            </GridCell>

            <GridCell>
              <NotesCell
                value={row.notes}
                saving={busy(row.id, "notes")}
                who={row.name || row.email || "this row"}
                onChange={(v) => save(row.id, "notes", v)}
              />
            </GridCell>

            <GridCell align="right">
              <RowActions
                row={row}
                busy={busy}
                archive={archive}
                restore={restore}
                showArchived={showArchived}
              />
            </GridCell>
            <SlackCell />
          </tr>
        ))}
      </tbody>
    </GridTable>
  );
}

/* ═══════════════════════════ referrals ═══════════════════════════ */

const REFERRAL_COLUMNS: ColumnDef[] = [
  { id: "booked", label: "Booked", width: 92, align: "left" },
  { id: "name", label: "Name", width: 200, align: "left" },
  { id: "referredBy", label: "Referred by", width: 215, align: "left" },
  { id: "kind", label: "Type", width: 145, align: "left" },
  { id: "status", label: "Status", width: 165, align: "left" },
  { id: "structure", label: "Structure", width: 122, align: "left" },
  { id: "partner", label: "Partner", width: 104, align: "right" },
  { id: "referee", label: "Referee", width: 104, align: "right" },
  { id: "payout", label: "Payout", width: 128, align: "right" },
  { id: "due", label: "Due", width: 112, align: "left" },
  { id: "paid", label: "Paid", width: 62, align: "right" },
  { id: "actions", label: "Delete", width: 84, align: "right", hiddenLabel: true },
];

/**
 * Attribution and payout.
 *
 * Status is the SAME field the Deal Desk edits, not a copy — change it here and
 * the Deal Desk agrees, because there is only one. That's the bug this design
 * exists to kill: Airtable keeps a status in DEAL Desk and another in
 * REFERRALS, and nothing keeps them honest.
 *
 * Commission presets fill the two amounts and then get out of the way. The live
 * data has 42 referrals carrying a preset with $0/$0 and partner amounts of
 * 160, 300, 350 and 500 filed under the "250" preset, so the preset can only
 * ever be a shortcut — the two stored figures are the truth.
 */
function ReferralTable({
  rows,
  widths,
  save,
  saveMany,
  busy,
  config,
  referrerOptions,
  addReferrer,
  archive,
  restore,
  showArchived,
}: TableProps &
  RowActionProps & {
    saveMany: (id: string, patch: Partial<SalesCallEdits>) => void;
    referrerOptions: { value: string; label: string }[];
    addReferrer: (name: string) => Promise<string | null>;
  }) {
  const applyPreset = (row: SalesCallRow, preset: CommissionPreset | null) => {
    const patch: Partial<SalesCallEdits> = { commissionPreset: preset };
    const hit = COMMISSION_PRESETS.find((p) => p.id === preset);
    if (hit && hit.partner != null) {
      // Seed the amounts only where the operator hasn't already put a figure —
      // picking a preset must never silently overwrite a negotiated exception,
      // and the live data is full of them.
      if (row.partnerCommission == null) patch.partnerCommission = hit.partner;
      if (row.refereeCommission == null) patch.refereeCommission = hit.referee;
    }
    // One request, not three — see the note on saveMany.
    saveMany(row.id, patch);
  };

  return (
    <GridTable columns={REFERRAL_COLUMNS} widths={widths}>
      <tbody>
        {rows.map((row) => {
          const total = commissionTotal(row);
          const counts = row.status ? DEAL_STATUS_META[row.status].counts : false;
          return (
            <tr key={row.id} className="align-top hover:bg-white/[0.02]">
              <GridCell>
                <span className="text-[12px] text-mist">{shortDate(row.bookedAt)}</span>
              </GridCell>
              <GridCell>
                <Who row={row} />
              </GridCell>

              <GridCell>
                <ReferrerCell
                  value={row.referrerId}
                  options={referrerOptions}
                  raw={row.referrerRaw}
                  saving={busy(row.id, "referrerId")}
                  onChange={(v) => save(row.id, "referrerId", v)}
                  onCreate={addReferrer}
                />
              </GridCell>

              <GridCell>
                <SelectCell
                  value={row.referralKind}
                  items={config.referralKind}
                  saving={busy(row.id, "referralKind")}
                  onChange={(v) => save(row.id, "referralKind", v)}
                />
              </GridCell>

              <GridCell>
                <SelectCell
                  value={row.status}
                  items={config.dealStatus}
                  saving={busy(row.id, "status")}
                  onChange={(v) => save(row.id, "status", v)}
                />
              </GridCell>

              <GridCell>
                <select
                  value={row.commissionPreset ?? ""}
                  disabled={busy(row.id, "commissionPreset")}
                  aria-label={`Commission structure for ${row.name}`}
                  onChange={(e) =>
                    applyPreset(
                      row,
                      (e.target.value || null) as CommissionPreset | null,
                    )
                  }
                  className="w-full appearance-none rounded-[8px] border border-edge-mid bg-panel-2 py-1.5 pl-2 pr-6 font-body text-[12.5px] text-fog outline-none focus:border-magenta disabled:opacity-50"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='none' stroke='%238f88a0' stroke-width='2'%3E%3Cpath d='M1 3l4 4 4-4'/%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 7px center",
                  }}
                >
                  <option value="">—</option>
                  {COMMISSION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </GridCell>

              <GridCell align="right">
                <MoneyCell
                  value={row.partnerCommission}
                  saving={busy(row.id, "partnerCommission")}
                  onChange={(v) => save(row.id, "partnerCommission", v)}
                />
              </GridCell>
              <GridCell align="right">
                <MoneyCell
                  value={row.refereeCommission}
                  saving={busy(row.id, "refereeCommission")}
                  onChange={(v) => save(row.id, "refereeCommission", v)}
                />
              </GridCell>

              <GridCell align="right">
                {/* Zero until the deal actually closes — a lost referral pays
                    nothing however the amounts are filled in. */}
                <span
                  className={`font-mono text-[13px] font-semibold tabular-nums ${
                    counts && total ? "text-teal" : "text-faint"
                  }`}
                  title={counts ? undefined : "Only a closed-won deal pays out"}
                >
                  {counts && total ? money(total) : "—"}
                </span>
                {counts && total ? (
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-faint">
                    {money(partnerPayout(row))} to partner
                  </span>
                ) : null}
              </GridCell>

              <GridCell>
                <span className="font-mono text-[11.5px] text-dusk">
                  {counts ? (payoutDate(row.bookedAt) ?? "—") : "—"}
                </span>
              </GridCell>

              <GridCell align="right">
                <CheckCell
                  checked={row.paid}
                  saving={busy(row.id, "paid")}
                  label={`Commission paid for ${row.name}`}
                  onChange={(v) => save(row.id, "paid", v)}
                />
              </GridCell>

              <GridCell align="right">
                <RowActions
                  row={row}
                  busy={busy}
                  archive={archive}
                  restore={restore}
                  showArchived={showArchived}
                />
              </GridCell>
              <SlackCell />
            </tr>
          );
        })}
      </tbody>
    </GridTable>
  );
}
