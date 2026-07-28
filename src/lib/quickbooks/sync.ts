import "server-only";

/**
 * Sync orchestration: pull each client's profit & loss and cache it.
 *
 * Two jobs, deliberately separate, because token health and report freshness
 * have different costs and very different consequences:
 *
 *   keepAlive()  cheap, one POST per company, guarantees no refresh token ever
 *                approaches its ~101-day expiry.
 *   syncAll()    expensive, allocates a multi-megabyte JSON tree per company.
 *
 * Running them as one job is the trap. A report pass that times out before
 * reaching the last companies would also stop refreshing THEIR tokens — turning
 * a latency problem into 150 dead connections three months later, with nothing
 * in between to notice.
 */

import { getAccountIndex } from "./accounts";
import { fetchProfitAndLoss } from "./client";
import {
  listConnections,
  listConnectionsToSync,
  markStatus,
  recordSync,
  rotateConnection,
  type ConnectionRow,
} from "./connections";
import { QuickBooksAuthError, humanMessage } from "./errors";
import { parseProfitAndLoss } from "./parse";
import { getOverridesFor } from "./overrides";
import { syncWindow } from "./periods";
import { saveSnapshot } from "./snapshots";
import type { AccountingBasis } from "./types";
import type { CategoryOverrides } from "./categories";

/**
 * Concurrency for the report pass. This is a memory budget more than a rate
 * limit: each report allocates a large JSON tree and then writes ~40KB to
 * Firestore. At ~4s per company, 6 at a time clears 150 companies in under two
 * minutes — comfortably inside the function's time budget, against Intuit's cap
 * of 200 report requests per minute.
 */
const SYNC_CONCURRENCY = 6;

/** Token rotations are sub-second and touch different documents — no contention. */
const KEEPALIVE_CONCURRENCY = 8;

export type SyncResult = {
  realmId: string;
  displayName: string;
  ok: boolean;
  status: "ok" | "empty" | "error";
  message: string;
  durationMs: number;
  warnings: number;
};

export type RunSummary = {
  attempted: number;
  succeeded: number;
  failed: number;
  /** Left for the next run because the time budget ran out. */
  skipped: number;
  durationMs: number;
  results: SyncResult[];
};

/**
 * Bounded-concurrency map. Ten lines beats a dependency, and it gives us the
 * one thing `Promise.all` over a sliced array doesn't: a worker picks up the
 * next item the instant it's free, so one slow company doesn't stall a batch.
 *
 * `stop()` is checked before dispatching each item, never mid-flight — killing
 * a company halfway through would leave its snapshot inconsistent.
 */
async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  stop?: () => boolean,
): Promise<{ results: R[]; completed: number }> {
  const results: R[] = [];
  let cursor = 0;
  let completed = 0;

  const worker = async () => {
    for (;;) {
      if (stop?.()) return;
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
      completed++;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return { results: results.filter((r) => r !== undefined), completed };
}

/* ────────────────────────── one company ────────────────────────── */

/**
 * Fetch, parse and cache one company's P&L.
 *
 * Never throws. A failure is a result with `ok: false`, recorded on both the
 * snapshot and the connection — one client's broken books must not take down a
 * run covering the other 149.
 */
export async function syncRealm(
  connection: ConnectionRow,
  basis: AccountingBasis,
  overrides: CategoryOverrides,
  now = new Date(),
): Promise<SyncResult> {
  const started = Date.now();
  const base = { realmId: connection.realmId, displayName: connection.displayName };

  try {
    const window = syncWindow(now, connection.fiscalYearStartMonth);
    const [accounts, raw] = await Promise.all([
      getAccountIndex(connection.realmId),
      fetchProfitAndLoss(connection.realmId, {
        startDate: window.startDate,
        endDate: window.endDate,
        basis,
      }),
    ]);

    let parsed = parseProfitAndLoss(raw, {
      realmId: connection.realmId,
      accounts,
      overrides,
      requestedBasis: basis,
    });

    // Self-heal a stale account cache. An account created this morning would
    // otherwise sit uncategorised until tomorrow — and this morning is exactly
    // when someone is looking for it.
    if (parsed.unknownAccountIds.length) {
      const fresh = await getAccountIndex(connection.realmId, { force: true });
      parsed = parseProfitAndLoss(raw, {
        realmId: connection.realmId,
        accounts: fresh,
        overrides,
        requestedBasis: basis,
      });
    }

    const status = parsed.pnl.empty ? "empty" : "ok";
    await saveSnapshot({
      realmId: connection.realmId,
      creatorId: connection.creatorId,
      displayName: connection.displayName,
      environment: connection.environment,
      basis,
      status,
      error: null,
      data: parsed.pnl,
      syncDurationMs: Date.now() - started,
    });
    await recordSync(connection.realmId, { status, message: "" });

    /**
     * A successful sync is proof the connection works, so clear any stale
     * failure on it.
     *
     * Without this a connection can stay stuck showing an old error forever:
     * the only other place that resets status is the token-refresh commit,
     * which doesn't run while the access token is still valid. So a company
     * that failed once and then started succeeding would keep a red row and an
     * obsolete message on the dashboard, with `lastSyncStatus: "ok"` sitting
     * right next to it.
     */
    if (connection.status !== "connected") {
      await markStatus(connection.realmId, "connected", "").catch(() => {});
    }

    return {
      ...base,
      ok: true,
      status,
      message: "",
      durationMs: Date.now() - started,
      warnings: parsed.pnl.warnings.length,
    };
  } catch (err) {
    const message = humanMessage(err);
    console.error(`[quickbooks] sync failed for ${connection.realmId}:`, err);

    /**
     * ONLY an auth failure changes the connection's status. Everything else —
     * including a non-retryable 400 — is recorded on the snapshot and on
     * lastSyncStatus, leaving the connection itself `connected` so the next run
     * tries again.
     *
     * The earlier version also marked non-retryable errors as `status: "error"`,
     * which excluded the company from the sync queue. That's the wrong shape:
     * a 400 from a malformed request is OUR bug, and quarantining the client's
     * connection over it means shipping the fix doesn't un-stick anything —
     * someone has to go and manually reset each affected row. Caught exactly
     * that way by sending `summarize_column_by=Months` instead of `Month`.
     */
    if (err instanceof QuickBooksAuthError) {
      await markStatus(connection.realmId, "reconnect-required", message).catch(() => {});
    }

    await saveSnapshot({
      realmId: connection.realmId,
      creatorId: connection.creatorId,
      displayName: connection.displayName,
      environment: connection.environment,
      basis,
      status: "error",
      error: message,
      // Deliberately not null-ing the cached figures: last-good numbers stay
      // readable while the connection is broken. See CreatorFinanceRow's two
      // status axes in types.ts.
      data: null,
      syncDurationMs: Date.now() - started,
    }).catch(() => {});
    await recordSync(connection.realmId, { status: "error", message }).catch(() => {});

    return {
      ...base,
      ok: false,
      status: "error",
      message,
      durationMs: Date.now() - started,
      warnings: 0,
    };
  }
}

/** The "Sync now" button, and the post-connect first load. */
export async function syncOne(
  connection: ConnectionRow,
  basis: AccountingBasis,
): Promise<SyncResult> {
  const overrides = await getOverridesFor([connection.realmId]);
  return syncRealm(connection, basis, overrides.get(connection.realmId)!);
}

/* ────────────────────────── the run ────────────────────────── */

export type SyncAllOptions = {
  basis: AccountingBasis;
  /** Wall-clock ceiling. Own the budget rather than trusting the platform's. */
  deadline: number;
  /** Don't dispatch another company without at least this much time left. */
  reserveMs?: number;
  limit?: number;
};

export async function syncAll(opts: SyncAllOptions): Promise<RunSummary> {
  const started = Date.now();
  const reserve = opts.reserveMs ?? 15_000;
  const connections = await listConnectionsToSync(opts.limit ?? 80);

  if (!connections.length) {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: 0, durationMs: 0, results: [] };
  }

  // One read of the shared global overrides document instead of 150.
  const overrides = await getOverridesFor(connections.map((c) => c.realmId));
  const now = new Date();

  const { results, completed } = await pool(
    connections,
    SYNC_CONCURRENCY,
    (connection) =>
      syncRealm(connection, opts.basis, overrides.get(connection.realmId)!, now),
    () => Date.now() > opts.deadline - reserve,
  );

  return {
    attempted: connections.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    // Not silently dropped: the caller logs this, and the oldest-first ordering
    // in listConnectionsToSync means the next run resumes exactly here.
    skipped: connections.length - completed,
    durationMs: Date.now() - started,
    results,
  };
}

/* ────────────────────────── keepalive ────────────────────────── */

export type KeepAliveSummary = {
  attempted: number;
  rotated: number;
  failed: { realmId: string; message: string }[];
  durationMs: number;
};

/**
 * Rotate every live connection's refresh token.
 *
 * This is the job that makes the whole integration unattended. A refresh token
 * dies ~101 days after its last use, so as long as this runs, nothing ever
 * expires on its own and the only reason a client ever needs re-authorising is
 * that they actively revoked access. Miss it for three months and all ~150 need
 * reconnecting by hand.
 *
 * Cheap enough to be generous with: one small POST per company.
 *
 * `minAgeMs` skips connections rotated recently, which makes this endpoint safe
 * to call at ANY frequency — hit it hourly and it still only rotates each
 * company every ~5 hours. That matters because the scheduler may not be ours:
 * an external trigger firing more often than intended shouldn't turn into 3,600
 * pointless token rotations a day.
 */
export async function keepAlive(
  deadline: number,
  minAgeMs = 5 * 60 * 60 * 1000,
): Promise<KeepAliveSummary> {
  const started = Date.now();
  const cutoff = Date.now() - minAgeMs;
  const connections = (await listConnections()).filter(
    (c) =>
      c.status === "connected" &&
      (!c.refreshedAt || Date.parse(c.refreshedAt) < cutoff),
  );
  const failed: { realmId: string; message: string }[] = [];

  await pool(
    connections,
    KEEPALIVE_CONCURRENCY,
    async (connection) => {
      try {
        await rotateConnection(connection.realmId);
      } catch (err) {
        // connections.ts has already recorded the status; this is just the
        // run-level tally so the caller can see the shape of a bad night.
        failed.push({ realmId: connection.realmId, message: humanMessage(err) });
      }
    },
    () => Date.now() > deadline,
  );

  return {
    attempted: connections.length,
    rotated: connections.length - failed.length,
    failed,
    durationMs: Date.now() - started,
  };
}
