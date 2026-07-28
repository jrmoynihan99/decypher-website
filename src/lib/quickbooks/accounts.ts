import "server-only";

/**
 * The cached chart of accounts, one document per company.
 *
 * Cached on a different rhythm from the reports on purpose: a client's numbers
 * change every day, but their chart of accounts changes maybe monthly. Refetching
 * it on every sync would double the API calls to re-learn something that almost
 * never moves.
 *
 * The exception that matters is self-healing. When the parser meets an account
 * id that isn't in this cache, the account was created since the last fetch —
 * and that is exactly the moment someone is looking at it. So sync.ts forces a
 * refresh and reparses rather than leaving a brand-new account sitting in
 * "uncategorised" until tomorrow.
 */

import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { fetchAccounts } from "./client";
import type { AccountMeta } from "./types";

const COLLECTION = "quickbooksAccounts";
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Firestore documents cap at 1 MiB. At ~150 bytes per account that's ~7,000
 * accounts, which no real company file approaches — but truncating loudly beats
 * a write that fails and leaves the whole sync broken.
 */
const MAX_ACCOUNTS = 5000;

const s = (v: unknown) => (typeof v === "string" ? v : "");

function ref(realmId: string) {
  return adminDb().collection(COLLECTION).doc(realmId);
}

function toMeta(v: unknown): AccountMeta | null {
  const d = v as Record<string, unknown> | null;
  const id = s(d?.id);
  if (!id) return null;
  return {
    id,
    name: s(d?.name),
    fullyQualifiedName: s(d?.fullyQualifiedName) || s(d?.name),
    accountType: typeof d?.accountType === "string" ? d.accountType : null,
    subType: typeof d?.subType === "string" ? d.subType : null,
    classification: typeof d?.classification === "string" ? d.classification : null,
    active: d?.active !== false,
  };
}

function toIndex(accounts: AccountMeta[]): Map<string, AccountMeta> {
  return new Map(accounts.map((a) => [a.id, a]));
}

/**
 * The account index for a company, from cache when it's fresh.
 *
 * `force` skips the TTL — used after the parser reports unknown account ids.
 * Returns an empty map rather than throwing when Firebase isn't configured, so
 * a misconfigured environment degrades to "everything uncategorised" instead of
 * failing the whole dashboard.
 */
export async function getAccountIndex(
  realmId: string,
  opts: { force?: boolean } = {},
): Promise<Map<string, AccountMeta>> {
  if (!isConfigured()) return new Map();

  if (!opts.force) {
    const snap = await ref(realmId).get();
    const data = snap.data();
    const fetchedAt = (data?.fetchedAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
    if (Date.now() - fetchedAt < TTL_MS && Array.isArray(data?.accounts)) {
      return toIndex(data.accounts.map(toMeta).filter((a): a is AccountMeta => a !== null));
    }
  }

  const accounts = await fetchAccounts(realmId);
  const stored = accounts.slice(0, MAX_ACCOUNTS);
  if (accounts.length > MAX_ACCOUNTS) {
    console.warn(
      `[quickbooks] company ${realmId} has ${accounts.length} accounts; caching the first ${MAX_ACCOUNTS}.`,
    );
  }

  await ref(realmId).set({ realmId, fetchedAt: new Date(), accounts: stored });
  return toIndex(stored);
}

/**
 * Accounts that can appear on a P&L, for the category mapping screen. Inactive
 * accounts are kept: they still carry historical transactions, so they still
 * show up on a report for a past period.
 */
export async function listPnlAccounts(realmId: string): Promise<AccountMeta[]> {
  const index = await getAccountIndex(realmId);
  return [...index.values()]
    .filter((a) => a.classification === "Revenue" || a.classification === "Expense")
    .sort((a, b) => a.fullyQualifiedName.localeCompare(b.fullyQualifiedName));
}
