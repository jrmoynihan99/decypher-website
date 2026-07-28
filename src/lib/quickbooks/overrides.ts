import "server-only";

/**
 * The firm's category map — how a given client's accounts roll up into the
 * shared vocabulary the aggregate row is built from.
 *
 * This is not a power-user nicety, it's load-bearing. QuickBooks files AdSense,
 * sponsorships, integrations and affiliate income under the same one or two
 * income subtypes, so without a map the aggregate's income breakdown collapses
 * into a single meaningless bar. Expenses normalise well from subtypes; income
 * essentially doesn't. See categories.ts.
 *
 * Two scopes, because the firm makes two different kinds of decision:
 *
 *   per-account  (doc id = realmId)  "THIS client's 'YT Money' is platform revenue"
 *   per-subtype  (doc id = _global)  "DuesSubscriptions is software, for everyone"
 *
 * The global scope is what stops onboarding from being 150 identical decisions.
 */

import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { NO_OVERRIDES, parseCategoryKey, type CategoryKey, type CategoryOverrides } from "./categories";

const COLLECTION = "quickbooksCategoryOverrides";
const GLOBAL_DOC = "_global";

function ref(id: string) {
  return adminDb().collection(COLLECTION).doc(id);
}

/** Drop anything that isn't a known category — a stale key from a renamed
 *  category should vanish rather than silently mis-bucket money forever. */
function toMap(value: unknown): Record<string, CategoryKey> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, CategoryKey> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const category = parseCategoryKey(raw);
    if (category) out[key] = category;
  }
  return out;
}

export async function getOverrides(realmId: string): Promise<CategoryOverrides> {
  if (!isConfigured()) return NO_OVERRIDES;
  const [global, perRealm] = await Promise.all([ref(GLOBAL_DOC).get(), ref(realmId).get()]);
  return {
    byAccount: toMap(perRealm.data()?.byAccount),
    bySubType: toMap(global.data()?.bySubType),
  };
}

/**
 * Both scopes for many companies in one round trip. The sync fans out over ~150
 * companies, and fetching the global document 150 times would be 150 reads of
 * the same unchanging doc.
 */
export async function getOverridesFor(realmIds: string[]): Promise<Map<string, CategoryOverrides>> {
  const out = new Map<string, CategoryOverrides>();
  if (!isConfigured() || !realmIds.length) {
    for (const id of realmIds) out.set(id, NO_OVERRIDES);
    return out;
  }

  const db = adminDb();
  const docs = await db.getAll(ref(GLOBAL_DOC), ...realmIds.map(ref));
  const bySubType = toMap(docs[0]?.data()?.bySubType);

  realmIds.forEach((realmId, i) => {
    out.set(realmId, { byAccount: toMap(docs[i + 1]?.data()?.byAccount), bySubType });
  });
  return out;
}

/** Passing `null` clears the override, falling back to the built-in subtype map. */
export async function setAccountOverride(
  realmId: string,
  accountId: string,
  category: CategoryKey | null,
): Promise<void> {
  if (!isConfigured()) return;
  const { FieldValue } = await import("firebase-admin/firestore");
  await ref(realmId).set(
    {
      realmId,
      byAccount: { [accountId]: category ?? FieldValue.delete() },
      updatedAt: new Date(),
    },
    { merge: true },
  );
}

export async function setSubTypeOverride(
  subType: string,
  category: CategoryKey | null,
): Promise<void> {
  if (!isConfigured()) return;
  const { FieldValue } = await import("firebase-admin/firestore");
  await ref(GLOBAL_DOC).set(
    {
      bySubType: { [subType]: category ?? FieldValue.delete() },
      updatedAt: new Date(),
    },
    { merge: true },
  );
}
