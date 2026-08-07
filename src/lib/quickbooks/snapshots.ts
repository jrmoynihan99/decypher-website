import "server-only";

/**
 * The report cache, and the join that produces the dashboard's rows.
 *
 * One snapshot per company per accounting basis — NOT per period. The sync
 * fetches a window wide enough to contain every period in the selector (see
 * syncWindow in periods.ts), and each period is then an exact client-side slice
 * of the monthly columns. So switching from "year to date" to "last quarter" is
 * arithmetic on cached data, not 150 more API calls.
 *
 * Document ids are deterministic (`realmId__basis`), which buys three things:
 * a sync can never create duplicates, re-running one is idempotent, and the
 * dashboard read is a single getAll() with no query, no index and no ordering
 * to keep in step with the connection list.
 */

import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { aggregateRows } from "./aggregate";
import { listConnections, type ConnectionRow } from "./connections";
import { slicePnl } from "./parse";
import {
  availableYears,
  resolvePeriod,
  sliceIndices,
  type PeriodKey,
} from "./periods";
import type {
  AccountingBasis,
  CreatorFinanceRow,
  DataStatus,
  FinancesPayload,
  ProfitAndLoss,
} from "./types";

const COLLECTION = "quickbooksSnapshots";

/**
 * Bumped whenever a parser change alters stored numbers. It's how we tell "this
 * client's figures predate the fix" from "these are current" — without it, the
 * only remedy after a parser bug is to re-sync everything and hope.
 */
const SCHEMA_VERSION = 1;

/** Older than this and the row is flagged stale. The cron runs daily. */
const STALE_MS = 36 * 60 * 60 * 1000;

export function snapshotId(realmId: string, basis: AccountingBasis): string {
  return `${realmId}__${basis}`;
}

function ref(realmId: string, basis: AccountingBasis) {
  return adminDb().collection(COLLECTION).doc(snapshotId(realmId, basis));
}

export type SnapshotWrite = {
  realmId: string;
  creatorId: string;
  displayName: string;
  environment: string;
  basis: AccountingBasis;
  status: "ok" | "empty" | "error";
  error: string | null;
  data: ProfitAndLoss | null;
  syncDurationMs: number;
};

export async function saveSnapshot(input: SnapshotWrite): Promise<void> {
  if (!isConfigured()) return;
  await ref(input.realmId, input.basis).set({
    ...input,
    syncedAt: new Date(),
    schemaVersion: SCHEMA_VERSION,
  });
}

/* ────────────────────────── reading back ────────────────────────── */

const s = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const nums = (v: unknown) => (Array.isArray(v) ? v.map(num) : []);

/**
 * Rebuild a stored P&L defensively. Snapshots outlive the shape that wrote them
 * — a doc from before a field existed must read as a zero, not as `undefined`
 * propagating into an aggregate and turning a total into NaN.
 */
function toPnl(v: unknown): ProfitAndLoss | null {
  const d = v as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;

  const monthlyRaw = (d.monthly ?? {}) as Record<string, unknown>;
  const line = (x: unknown) => {
    const l = x as Record<string, unknown>;
    return {
      accountId: typeof l?.accountId === "string" ? l.accountId : null,
      name: s(l?.name),
      subType: typeof l?.subType === "string" ? l.subType : null,
      category: s(l?.category) as ProfitAndLoss["revenueStreams"][number]["category"],
      total: num(l?.total),
      monthly: nums(l?.monthly),
    };
  };

  return {
    realmId: s(d.realmId),
    currency: s(d.currency) || "USD",
    basis: d.basis === "cash" ? "cash" : "accrual",
    startDate: s(d.startDate),
    endDate: s(d.endDate),
    months: Array.isArray(d.months) ? d.months.map(s) : [],
    monthly: {
      income: nums(monthlyRaw.income),
      costOfGoodsSold: nums(monthlyRaw.costOfGoodsSold),
      grossProfit: nums(monthlyRaw.grossProfit),
      expenses: nums(monthlyRaw.expenses),
      netOperatingIncome: nums(monthlyRaw.netOperatingIncome),
      otherIncome: nums(monthlyRaw.otherIncome),
      otherExpenses: nums(monthlyRaw.otherExpenses),
      netIncome: nums(monthlyRaw.netIncome),
    },
    revenueStreams: Array.isArray(d.revenueStreams) ? d.revenueStreams.map(line) : [],
    expenseLines: Array.isArray(d.expenseLines) ? d.expenseLines.map(line) : [],
    incomeByCategory: (d.incomeByCategory ?? {}) as ProfitAndLoss["incomeByCategory"],
    expensesByCategory: (d.expensesByCategory ?? {}) as ProfitAndLoss["expensesByCategory"],
    empty: d.empty === true,
    warnings: Array.isArray(d.warnings) ? d.warnings.map(s) : [],
    income: num(d.income),
    costOfGoodsSold: num(d.costOfGoodsSold),
    grossProfit: num(d.grossProfit),
    expenses: num(d.expenses),
    netOperatingIncome: num(d.netOperatingIncome),
    otherIncome: num(d.otherIncome),
    otherExpenses: num(d.otherExpenses),
    netIncome: num(d.netIncome),
  };
}

/**
 * The connection's status message, phrased as something a bookkeeper can act
 * on. Never a raw Intuit code — "invalid_grant" in a table cell helps nobody.
 */
function connectionMessage(c: ConnectionRow): string {
  if (c.statusMessage) return c.statusMessage;
  switch (c.status) {
    case "reconnect-required":
      return "QuickBooks access was revoked or expired — reconnect this company.";
    case "disabled":
      return "Disconnected.";
    case "error":
      return "The last attempt to reach QuickBooks failed.";
    default:
      return "";
  }
}

function dataMessage(status: DataStatus, connection: ConnectionRow): string {
  switch (status) {
    case "never":
      return connection.status === "connected"
        ? "Connected — first sync hasn't run yet."
        : "Never synced.";
    case "empty":
      return "No transactions in this period.";
    case "error":
      return connection.lastSyncMessage || "The last sync failed.";
    default:
      return "";
  }
}

/**
 * Every creator's figures for one period, plus the aggregate and average.
 *
 * The join is connection-first: a company that's connected but never synced
 * still gets a row, because "connected, awaiting first sync" is a state the
 * firm needs to see rather than an absence.
 */
export async function listCreatorFinances(
  period: PeriodKey,
  basis: AccountingBasis,
  now = new Date(),
): Promise<FinancesPayload> {
  const connections = await listConnections();
  if (!connections.length) {
    return { period, basis, rows: [], aggregate: aggregateRows([]), years: [] };
  }

  const docs = await adminDb().getAll(...connections.map((c) => ref(c.realmId, basis)));
  const snapshots = new Map(docs.map((doc) => [doc.id, doc.data()]));

  // Union of every cached month, for the year selector. Collected while
  // slicing rather than in a second pass — the stored months are already in
  // hand and a company onboarded last month must not shrink the list.
  const allMonths = new Set<string>();

  const rows: CreatorFinanceRow[] = connections.map((c) => {
    const snap = snapshots.get(snapshotId(c.realmId, basis));
    const syncedAt = (snap?.syncedAt as { toDate?: () => Date })?.toDate?.() ?? null;

    let dataStatus: DataStatus = "never";
    let data: ProfitAndLoss | null = null;

    if (snap) {
      if (snap.status === "error") {
        dataStatus = "error";
      } else {
        const stored = toPnl(snap.data);
        if (stored) {
          for (const m of stored.months) allMonths.add(m);
          // The period selector is a slice of the cached window — exact, and
          // free of any further API traffic. See the module header.
          const resolved = resolvePeriod(period, now, c.fiscalYearStartMonth);
          const { from, to } = sliceIndices(stored.months, resolved);
          data = slicePnl(stored, from, to);
          dataStatus = data.empty ? "empty" : "ok";
        } else {
          dataStatus = snap.status === "empty" ? "empty" : "error";
        }
      }
    }

    return {
      realmId: c.realmId,
      creatorId: c.creatorId,
      displayName: c.displayName,
      companyName: c.companyName,
      currency: c.currency,
      connection: c.status,
      connectionMessage: connectionMessage(c),
      connectionCheckedAt: c.statusAt,
      dataStatus,
      dataMessage: dataMessage(dataStatus, c),
      data,
      lastSyncedAt: syncedAt?.toISOString() ?? null,
      // Computed here so the client never does date maths to count stale rows.
      stale: syncedAt ? now.getTime() - syncedAt.getTime() > STALE_MS : false,
    };
  });

  return {
    period,
    basis,
    rows,
    aggregate: aggregateRows(rows),
    years: availableYears([...allMonths]),
  };
}
