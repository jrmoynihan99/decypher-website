import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { mergeTables, sanitizeYearCard, seedFor, type TableSet, type YearCard } from "./tables";

/**
 * Tax tables edited on the Tax Tables page, in Firestore.
 *
 * One document per tax year in `taxTables`, id = the year, holding the whole
 * YearCard (federal + every state) plus who saved it and when. A stored year
 * replaces the seed in tables.ts for that year; deleting it falls back to
 * the seed. Reads go through `loadTables`, which is what the builder page
 * hands to the browser, so a saved change is live on the next recap.
 *
 * Nothing reads this collection from the browser: firestore.rules denies
 * client access and the Admin SDK bypasses rules.
 */

const COLLECTION = "taxTables";

export class TaxTablesStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxTablesStoreError";
  }
}

export type StoredYear = {
  taxYear: number;
  card: YearCard;
  updatedAt: string | null;
  updatedBy: string;
};

const iso = (v: unknown): string | null =>
  (v as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? null;

function ref(taxYear: number) {
  if (!Number.isInteger(taxYear) || taxYear < 2015 || taxYear > 2040) {
    throw new TaxTablesStoreError("Tax year must be a four-digit year");
  }
  return adminDb().collection(COLLECTION).doc(String(taxYear));
}

export async function listStoredYears(): Promise<StoredYear[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb().collection(COLLECTION).get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      const taxYear = Number(d.id);
      if (!Number.isInteger(taxYear)) return null;
      return {
        taxYear,
        // A card saved before a rule existed takes the seed's value for it.
        card: sanitizeYearCard(data.card, seedFor(taxYear)),
        updatedAt: iso(data.updatedAt),
        updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "",
      };
    })
    .filter((y): y is StoredYear => y !== null)
    .sort((a, b) => a.taxYear - b.taxYear);
}

/** Seeds with every stored year laid over them — what the engine runs on. */
export async function loadTables(): Promise<TableSet> {
  const stored = await listStoredYears();
  return mergeTables(Object.fromEntries(stored.map((y) => [y.taxYear, y.card])));
}

export async function putYear(taxYear: number, card: YearCard, actor: string): Promise<StoredYear> {
  if (!isConfigured()) throw new TaxTablesStoreError("Firebase is not configured");
  const r = ref(taxYear);
  // JSON round-trip: Firestore rejects undefined, and the card must survive
  // it anyway since the browser reads it back as JSON.
  await r.set({ card: JSON.parse(JSON.stringify(card)), updatedAt: new Date(), updatedBy: actor });
  const snap = await r.get();
  const data = snap.data() ?? {};
  return {
    taxYear,
    card: sanitizeYearCard(data.card, seedFor(taxYear)),
    updatedAt: iso(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "",
  };
}

export async function deleteYear(taxYear: number): Promise<void> {
  if (!isConfigured()) throw new TaxTablesStoreError("Firebase is not configured");
  await ref(taxYear).delete();
}
