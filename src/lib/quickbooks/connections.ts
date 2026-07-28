import "server-only";

/**
 * Where each client's QuickBooks credentials live, and the single-flight lease
 * that keeps refreshing them from destroying them.
 *
 * ── The failure this module exists to prevent ────────────────────────────────
 *
 * Intuit rotates refresh tokens: present token R and you may get back R', with
 * R force-expired. If two serverless invocations refresh the same company at
 * once, Intuit issues R1 to one and R2 to the other, both write to Firestore,
 * and last-write-wins. If the surviving row holds the older of the two, that
 * connection is dead — and nothing notices until the next refresh, up to a day
 * later, where it looks like a random unexplained failure.
 *
 * Rotation only actually happens every ~24h, so most concurrent refreshes
 * return the same token and are harmless. That makes this bug rare,
 * non-deterministic, and something that surfaces months into production. Hence
 * a lease rather than optimism.
 *
 * ── Shape of the solution ───────────────────────────────────────────────────
 *
 *   L0  in-process memo         same-lambda races, free
 *   L1  fast path               ~99% of calls: one read, no writes
 *   L2  acquire lease           a transaction that only does bookkeeping
 *   L3  the HTTP refresh        OUTSIDE any transaction — see below
 *   L4  commit, fenced          discard our result if someone else rotated
 *   L5  losers wait             polling beats refreshing anyway
 *
 * L3 being outside the transaction is not stylistic. The Admin SDK retries a
 * contended transaction, so a fetch inside one would re-issue the refresh —
 * causing the exact double-rotation the lease is here to prevent.
 *
 * In steady state none of this contends at all, because the keepalive cron
 * refreshes everything ahead of time. Locking you lean on daily is locking that
 * will surprise you; this is a backstop.
 */

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { QuickBooksAuthError, QuickBooksConfigError, QuickBooksError, humanMessage } from "./errors";
import { currentEnvironment, refreshTokens, type QuickBooksEnvironment, type TokenSet } from "./oauth";
import type { ConnectionStatus } from "./types";

const COLLECTION = "quickbooksConnections";

/** Refresh this far ahead of expiry, absorbing clock skew and slow requests. */
const SKEW_MS = 120_000;
/** Lease lifetime. Short enough that a crashed lambda can't wedge a connection. */
const LEASE_MS = 30_000;
const POLL_MS = 250;
const MAX_WAIT_MS = 8_000;
/** Don't re-rotate a connection rotated this recently — de-dupes overlapping crons. */
const ROTATE_COOLDOWN_MS = 5 * 60_000;

/* ────────────────────── encryption at rest ────────────────────── */

/**
 * These are live credentials to ~150 clients' accounting systems. Everything
 * else in the app is protected by deny-all rules plus Admin-SDK-only access,
 * which is sound — but a Firestore export or a leaked service-account key would
 * otherwise hand over read/write on every client's books.
 *
 * The "v1." prefix is a version tag: a key rotation can add a v2 read path
 * without forcing 150 reconnects. Unprefixed values are treated as plaintext so
 * that turning encryption on doesn't invalidate anything already stored.
 */
function tokenKey(): Buffer {
  const raw = process.env.QUICKBOOKS_TOKEN_KEY;
  if (!raw) {
    throw new QuickBooksConfigError(
      "QUICKBOOKS_TOKEN_KEY is not set — it encrypts OAuth tokens at rest. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new QuickBooksConfigError(
      `QUICKBOOKS_TOKEN_KEY must decode to 32 bytes, got ${key.length}.`,
    );
  }
  return key;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith("v1.")) return stored;
  const [, ivPart, tagPart, ctPart] = stored.split(".");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/* ────────────────────────── the row ────────────────────────── */

/**
 * The connection as the portal sees it. Deliberately carries NO token fields —
 * this shape crosses to the browser, and the type is the guardrail.
 */
export type ConnectionRow = {
  realmId: string;
  creatorId: string;
  displayName: string;
  companyName: string;
  legalName: string;
  country: string;
  currency: string;
  /** 1–12, from the company file. Drives what "year to date" means. */
  fiscalYearStartMonth: number;
  environment: QuickBooksEnvironment;
  status: ConnectionStatus;
  statusMessage: string;
  statusAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  lastSyncMessage: string;
  /** When the refresh token last rotated — the ~101-day expiry clock. */
  refreshedAt: string | null;
  connectedAt: string | null;
  connectedBy: string;
};

const s = (v: unknown) => (typeof v === "string" ? v : "");
const iso = (v: unknown) =>
  (v as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null;

const STATUSES: ConnectionStatus[] = ["connected", "reconnect-required", "error", "disabled"];

/** Defensive per-field coercion — docs outlive the shape that wrote them. */
function toRow(id: string, d: FirebaseFirestore.DocumentData): ConnectionRow {
  const status = d.status;
  const month = Number(d.fiscalYearStartMonth);
  return {
    realmId: id,
    creatorId: s(d.creatorId) || id,
    displayName: s(d.displayName) || s(d.companyName) || id,
    companyName: s(d.companyName),
    legalName: s(d.legalName),
    country: s(d.country),
    currency: s(d.currency) || "USD",
    fiscalYearStartMonth: month >= 1 && month <= 12 ? month : 1,
    environment: d.environment === "production" ? "production" : "sandbox",
    status: STATUSES.includes(status) ? status : "error",
    statusMessage: s(d.statusMessage),
    statusAt: iso(d.statusAt),
    lastSyncAt: iso(d.lastSyncAt),
    lastSyncStatus: s(d.lastSyncStatus),
    lastSyncMessage: s(d.lastSyncMessage),
    refreshedAt: iso(d.refreshTokenUpdatedAt),
    connectedAt: iso(d.connectedAt),
    connectedBy: s(d.connectedBy),
  };
}

function ref(realmId: string) {
  return adminDb().collection(COLLECTION).doc(realmId);
}

/* ────────────────────────── reads ────────────────────────── */

export async function getConnection(realmId: string): Promise<ConnectionRow | null> {
  if (!isConfigured()) return null;
  const snap = await ref(realmId).get();
  return snap.exists ? toRow(snap.id, snap.data()!) : null;
}

/**
 * Every connection in the active environment. Sandbox and production realmIds
 * are different companies entirely, so mixing them would point the dashboard at
 * a set of dead connections the moment QUICKBOOKS_ENV flips.
 */
export async function listConnections(): Promise<ConnectionRow[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("environment", "==", currentEnvironment())
    .get();
  return snap.docs
    .map((doc) => toRow(doc.id, doc.data()))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * The sync queue, oldest-synced first.
 *
 * This ordering IS the resume cursor: never-synced companies lead, and a run
 * that dies partway through leaves the companies it didn't reach holding the
 * oldest timestamps — so the next run starts exactly there. No cursor document,
 * no state machine, and it self-rebalances after an outage.
 *
 * Filtered and sorted in memory rather than by Firestore, deliberately. The
 * query version (two equality filters plus an orderBy on a third field) needs a
 * COMPOSITE INDEX, which means a human has to click a link in the Firebase
 * console before the very first scheduled run can ever succeed. That's a poor
 * prerequisite for a job whose entire purpose is to run unattended for months
 * without anyone looking at it — and at ~150 documents the index buys nothing.
 *
 * Revisit if the client roster reaches the low thousands, where reading every
 * connection to sync a page of them stops being free.
 */
export async function listConnectionsToSync(limit: number): Promise<ConnectionRow[]> {
  const connections = await listConnections();
  return connections
    // Everything except the two states a machine can't fix. A company whose
    // last sync errored stays IN the queue so it self-heals — the alternative
    // is that one bad night quietly drops a client out of the rotation until
    // someone notices.
    .filter((c) => c.status !== "reconnect-required" && c.status !== "disabled")
    .sort((a, b) => {
      // Never-synced first: they're the ones a human is most likely waiting on.
      if (!a.lastSyncAt) return b.lastSyncAt ? -1 : 0;
      if (!b.lastSyncAt) return 1;
      return Date.parse(a.lastSyncAt) - Date.parse(b.lastSyncAt);
    })
    .slice(0, limit);
}

/* ────────────────────────── writes ────────────────────────── */

export type NewConnection = {
  realmId: string;
  creatorId: string;
  companyName: string;
  legalName: string;
  country: string;
  currency: string;
  fiscalYearStartMonth: number;
  connectedBy: string;
  tokens: TokenSet;
};

/**
 * Idempotent by construction — realmId is the document id, so reconnecting a
 * company overwrites its credentials in place rather than creating a duplicate
 * with a stale twin. `displayName` is merged, not overwritten, so a name the
 * firm edited survives a reconnect.
 */
export async function saveConnection(input: NewConnection): Promise<void> {
  if (!isConfigured()) return;
  const now = new Date();
  const existing = await ref(input.realmId).get();

  await ref(input.realmId).set(
    {
      realmId: input.realmId,
      creatorId: input.creatorId,
      displayName: s(existing.data()?.displayName) || input.companyName,
      companyName: input.companyName,
      legalName: input.legalName,
      country: input.country,
      currency: input.currency,
      fiscalYearStartMonth: input.fiscalYearStartMonth,
      environment: currentEnvironment(),

      accessToken: encryptToken(input.tokens.accessToken),
      accessTokenExpiresAt: input.tokens.accessTokenExpiresAt,
      refreshToken: encryptToken(input.tokens.refreshToken),
      refreshTokenExpiresAt: input.tokens.refreshTokenExpiresAt,
      refreshTokenUpdatedAt: now,

      lock: { holder: null, expiresAt: null },
      status: "connected" satisfies ConnectionStatus,
      statusMessage: "",
      statusAt: now,

      connectedAt: existing.data()?.connectedAt ?? now,
      connectedBy: input.connectedBy,
      updatedAt: now,
    },
    { merge: true },
  );
}

export async function setDisplayName(realmId: string, displayName: string): Promise<void> {
  if (!isConfigured()) return;
  await ref(realmId).update({ displayName, updatedAt: new Date() });
}

export async function markStatus(
  realmId: string,
  status: ConnectionStatus,
  message: string,
): Promise<void> {
  if (!isConfigured()) return;
  await ref(realmId).update({
    status,
    statusMessage: message,
    statusAt: new Date(),
    updatedAt: new Date(),
    "lock.holder": null,
    "lock.expiresAt": null,
  });
}

export async function recordSync(
  realmId: string,
  outcome: { status: "ok" | "empty" | "error"; message: string },
): Promise<void> {
  if (!isConfigured()) return;
  await ref(realmId).update({
    lastSyncAt: new Date(),
    lastSyncStatus: outcome.status,
    lastSyncMessage: outcome.message,
    updatedAt: new Date(),
  });
}

/**
 * Disconnect. Keeps the document — the firm wants the history, and snapshots
 * reference it — but drops our copy of the credentials.
 */
export async function disableConnection(realmId: string, by: string): Promise<void> {
  if (!isConfigured()) return;
  await ref(realmId).update({
    status: "disabled" satisfies ConnectionStatus,
    statusMessage: `Disconnected by ${by}`,
    statusAt: new Date(),
    accessToken: "",
    refreshToken: "",
    lock: { holder: null, expiresAt: null },
    updatedAt: new Date(),
  });
}

/** The stored refresh token, for revoking at Intuit before we forget it. */
export async function peekRefreshToken(realmId: string): Promise<string | null> {
  if (!isConfigured()) return null;
  const snap = await ref(realmId).get();
  const stored = s(snap.data()?.refreshToken);
  return stored ? decryptToken(stored) : null;
}

/* ──────────────────── the access-token path ──────────────────── */

const inflight = new Map<string, Promise<string>>();

/**
 * A live access token for `realmId`.
 *
 * Throws QuickBooksAuthError when only a human re-running OAuth can fix it —
 * callers should let that propagate rather than retrying, so the row renders
 * "reconnect required" instead of "error".
 */
export function getAccessToken(
  realmId: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  // L0: two requests inside one lambda would otherwise both reach Firestore
  // before either wrote a lease. Keyed on `force` so a keepalive rotation and a
  // read-path call can't be served each other's answer.
  const key = opts.force ? `${realmId}:force` : realmId;
  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = resolveAccessToken(realmId, opts.force ?? false).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

/**
 * Rotate this connection's tokens now, whether or not the access token is still
 * valid.
 *
 * The keepalive cron's real job isn't a warm access token — those live an hour
 * and are cheap to get on demand. It's exercising the REFRESH token, which dies
 * ~101 days after its last use. Four forced rotations a day keeps every
 * connection permanently far from that cliff, so a fortnight of broken cron is
 * an inconvenience rather than 150 re-authorisations.
 */
export async function rotateConnection(realmId: string): Promise<void> {
  await getAccessToken(realmId, { force: true });
}

function expiryOf(d: FirebaseFirestore.DocumentData | undefined): number {
  return (d?.accessTokenExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
}

function assertUsable(realmId: string, d: FirebaseFirestore.DocumentData): void {
  if (d.status === "disabled") {
    throw new QuickBooksAuthError(`QuickBooks company ${realmId} is disconnected.`, "disabled");
  }
  if (d.status === "reconnect-required") {
    throw new QuickBooksAuthError(
      s(d.statusMessage) || `QuickBooks company ${realmId} needs to be reconnected.`,
    );
  }
}

async function resolveAccessToken(realmId: string, force: boolean): Promise<string> {
  if (!isConfigured()) {
    throw new QuickBooksConfigError("Firebase admin is not configured.");
  }

  // L1: the overwhelmingly common path — one read, zero writes, no contention.
  const snap = await ref(realmId).get();
  if (!snap.exists) {
    throw new QuickBooksAuthError(`No QuickBooks connection for company ${realmId}.`, "not_connected");
  }
  const data = snap.data()!;
  assertUsable(realmId, data);
  if (!force && expiryOf(data) - Date.now() > SKEW_MS) return decryptToken(s(data.accessToken));

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const lease = await acquireLease(realmId, force);

    if (!lease.won) {
      // Someone else finished the refresh while we queued.
      if (lease.accessToken) return lease.accessToken;
      // Someone else is mid-flight. Waiting is correct; refreshing anyway is
      // precisely the bug this module exists to prevent.
      await sleep(POLL_MS);
      continue;
    }

    // L3: outside every transaction.
    let tokens: TokenSet;
    try {
      tokens = await refreshTokens(lease.refreshToken);
    } catch (err) {
      await handleRefreshFailure(realmId, err);
      throw err;
    }

    await commitTokens(realmId, tokens, lease.fencedAt);
    return tokens.accessToken;
  }

  throw new QuickBooksError(
    `Timed out waiting for a QuickBooks token refresh on company ${realmId}.`,
    503,
    "refresh_timeout",
    true,
  );
}

type Lease =
  | { won: true; refreshToken: string; fencedAt: number }
  | { won: false; accessToken: string | null };

/**
 * Bookkeeping only — no I/O beyond Firestore. Single-document transactions
 * serialise under optimistic concurrency with automatic retry, so exactly one
 * concurrent caller comes away with `won: true`.
 */
async function acquireLease(realmId: string, force: boolean): Promise<Lease> {
  const holder = randomUUID();
  const docRef = ref(realmId);

  return adminDb().runTransaction<Lease>(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) {
      throw new QuickBooksAuthError(`No QuickBooks connection for company ${realmId}.`, "not_connected");
    }
    const d = snap.data()!;
    assertUsable(realmId, d);

    // Re-check inside the transaction: another invocation may have refreshed
    // while we were queued behind it.
    //
    // The two modes need different questions. Normally we're asking "is the
    // access token still good?". A forced rotation can't ask that — the access
    // token has ~55 minutes left, which is the whole point — so it asks "was
    // the refresh token rotated recently?" instead. That still de-duplicates
    // an overlapping cron run without ever short-circuiting the rotation the
    // keepalive exists to perform.
    const rotatedAt =
      (d.refreshTokenUpdatedAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
    const settled = force
      ? Date.now() - rotatedAt < ROTATE_COOLDOWN_MS
      : expiryOf(d) - Date.now() > SKEW_MS;
    if (settled) return { won: false, accessToken: decryptToken(s(d.accessToken)) };

    const lockExpiry =
      (d.lock?.expiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
    if (lockExpiry > Date.now()) return { won: false, accessToken: null };

    const refreshToken = s(d.refreshToken);
    if (!refreshToken) {
      throw new QuickBooksAuthError(
        `QuickBooks company ${realmId} has no stored refresh token — reconnect it.`,
        "no_refresh_token",
      );
    }

    tx.update(docRef, {
      lock: { holder, expiresAt: new Date(Date.now() + LEASE_MS) },
    });

    return {
      won: true,
      refreshToken: decryptToken(refreshToken),
      // The fencing token: whose rotation is newest.
      fencedAt:
        (d.refreshTokenUpdatedAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0,
    };
  });
}

/**
 * One atomic update, so there is no instant where a new refresh token exists at
 * Intuit but not here.
 *
 * The fence handles the case where our lease was stolen (we were slow, it
 * expired, someone else refreshed): their token is live and ours is already
 * dead at Intuit, so we discard ours silently. That's the correct outcome, not
 * an error worth surfacing.
 */
async function commitTokens(realmId: string, tokens: TokenSet, fencedAt: number): Promise<void> {
  const docRef = ref(realmId);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const current =
      (snap.data()?.refreshTokenUpdatedAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
    if (current > fencedAt) return;

    tx.update(docRef, {
      accessToken: encryptToken(tokens.accessToken),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshToken: encryptToken(tokens.refreshToken),
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      refreshTokenUpdatedAt: new Date(),
      status: "connected" satisfies ConnectionStatus,
      statusMessage: "",
      statusAt: new Date(),
      lock: { holder: null, expiresAt: null },
      updatedAt: new Date(),
    });
  });
}

/**
 * Classify and record. The branch that matters: a config error must NOT mark
 * the connection as needing reconnection — that would tell the firm to
 * re-authorise every client book over a mistyped environment variable.
 */
async function handleRefreshFailure(realmId: string, err: unknown): Promise<void> {
  try {
    if (err instanceof QuickBooksAuthError) {
      await markStatus(realmId, "reconnect-required", humanMessage(err));
      return;
    }
    if (err instanceof QuickBooksConfigError) {
      console.error(`[quickbooks] misconfigured while refreshing ${realmId}:`, err.message);
      await releaseLock(realmId);
      return;
    }
    // Transient. Leave `status` alone so a blip doesn't look like a revocation.
    await releaseLock(realmId);
  } catch (cause) {
    console.error(`[quickbooks] could not record refresh failure for ${realmId}:`, cause);
  }
}

async function releaseLock(realmId: string): Promise<void> {
  await ref(realmId).update({ "lock.holder": null, "lock.expiresAt": null });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Does this connection need a refresh soon? Used by the keepalive cron, which
 * exists to guarantee no refresh token ever approaches its ~101-day expiry.
 */
export async function needsRefresh(realmId: string, withinMs: number): Promise<boolean> {
  if (!isConfigured()) return false;
  const snap = await ref(realmId).get();
  if (!snap.exists || snap.data()?.status !== "connected") return false;
  return expiryOf(snap.data()) - Date.now() < withinMs;
}
