import "server-only";
import { randomBytes } from "crypto";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import {
  sanitizeExtract,
  sanitizeNextSteps,
  sanitizeNumbers,
  sanitizeStrategies,
  type RecapDoc,
  type RecapInput,
} from "./schema";
import { computeRecap } from "./compute";

/**
 * Tax recaps, in Firestore.
 *
 * One document per recap in `taxRecaps`, holding the reviewed numbers for
 * both returns, the strategy list, and the raw extraction as an audit trail.
 * Deliberately NOT the PDFs: the returns carry SSNs, bank details and a home
 * address, and nothing on the recap needs them once the numbers are out. The
 * document is the record; the PDFs stay wherever the tax team keeps them.
 *
 * The public page is addressed by `token`, not by document id — an
 * unguessable 144-bit value, so a link can be handed to a client without
 * exposing the collection's other entries to anyone who can count. `revoked`
 * kills a link while keeping the numbers, which the marketing aggregate will
 * eventually read.
 *
 * Nothing reads this collection from the browser: firestore.rules denies all
 * client access and the Admin SDK bypasses rules, so no rules change.
 */

const COLLECTION = "taxRecaps";

export class TaxRecapStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxRecapStoreError";
  }
}

function newToken(): string {
  return randomBytes(18).toString("base64url");
}

const iso = (v: unknown): string | null =>
  (v as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? null;

function toDoc(id: string, d: FirebaseFirestore.DocumentData): RecapDoc {
  const extraction = (d.extraction ?? {}) as Record<string, unknown>;
  return {
    id,
    token: typeof d.token === "string" ? d.token : "",
    revoked: Boolean(d.revoked),
    clientName: typeof d.clientName === "string" ? d.clientName : "",
    taxYear: Number(d.taxYear) || 0,
    priorYearIncome: typeof d.priorYearIncome === "number" ? d.priorYearIncome : null,
    stateCode: typeof d.stateCode === "string" ? d.stateCode : null,
    before: sanitizeNumbers(d.before),
    after: sanitizeNumbers(d.after),
    strategies: sanitizeStrategies(d.strategies),
    nextSteps: sanitizeNextSteps(d.nextSteps),
    extraction: {
      before: sanitizeExtract(extraction.before),
      after: sanitizeExtract(extraction.after),
    },
    createdAt: iso(d.createdAt),
    createdBy: typeof d.createdBy === "string" ? d.createdBy : "",
    updatedAt: iso(d.updatedAt),
    updatedBy: typeof d.updatedBy === "string" ? d.updatedBy : "",
  };
}

function ref(id: string) {
  if (!id || id.length > 200 || id.includes("/")) throw new TaxRecapStoreError("Bad recap id");
  return adminDb().collection(COLLECTION).doc(id);
}

export async function createRecap(input: RecapInput, actor: string): Promise<RecapDoc> {
  if (!isConfigured()) throw new TaxRecapStoreError("Firebase is not configured");
  const now = new Date();
  const doc = {
    ...input,
    token: newToken(),
    revoked: false,
    // Denormalised for the list view and, later, the marketing aggregate —
    // one query, no per-row recompute. Always rewritten on update.
    savings: computeRecap(input).savings,
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor,
  };
  const added = await adminDb().collection(COLLECTION).add(doc);
  const snap = await added.get();
  return toDoc(added.id, snap.data() ?? {});
}

export type RecapEdits = Partial<RecapInput> & { revoked?: boolean };

export async function updateRecap(
  id: string,
  edits: RecapEdits,
  actor: string,
): Promise<RecapDoc> {
  if (!isConfigured()) throw new TaxRecapStoreError("Firebase is not configured");
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new TaxRecapStoreError("Recap not found");
  const current = toDoc(id, snap.data() ?? {});
  const merged: RecapInput = {
    clientName: edits.clientName ?? current.clientName,
    taxYear: edits.taxYear ?? current.taxYear,
    priorYearIncome:
      edits.priorYearIncome !== undefined ? edits.priorYearIncome : current.priorYearIncome,
    stateCode: edits.stateCode !== undefined ? edits.stateCode : current.stateCode,
    before: edits.before ?? current.before,
    after: edits.after ?? current.after,
    strategies: edits.strategies ?? current.strategies,
    nextSteps: edits.nextSteps ?? current.nextSteps,
    extraction: edits.extraction ?? current.extraction,
  };
  await r.update({
    ...merged,
    revoked: edits.revoked !== undefined ? edits.revoked : current.revoked,
    savings: computeRecap(merged).savings,
    updatedAt: new Date(),
    updatedBy: actor,
  });
  const after = await r.get();
  return toDoc(id, after.data() ?? {});
}

export async function getRecap(id: string): Promise<RecapDoc | null> {
  if (!isConfigured()) return null;
  const snap = await ref(id).get();
  return snap.exists ? toDoc(id, snap.data() ?? {}) : null;
}

/** The public page's lookup. Returns revoked recaps too — the page decides. */
export async function getRecapByToken(token: string): Promise<RecapDoc | null> {
  if (!isConfigured()) return null;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const snap = await adminDb().collection(COLLECTION).where("token", "==", token).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return toDoc(d.id, d.data());
}

/** What the portal's list shows — no extraction blob, no per-line numbers. */
export type RecapSummary = {
  id: string;
  token: string;
  revoked: boolean;
  clientName: string;
  taxYear: number;
  savings: number;
  totalBefore: number;
  totalAfter: number;
  createdAt: string | null;
  createdBy: string;
  updatedAt: string | null;
};

export async function listRecaps(limit = 100): Promise<RecapSummary[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb()
    .collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    const doc = toDoc(d.id, d.data());
    const c = computeRecap(doc);
    return {
      id: doc.id,
      token: doc.token,
      revoked: doc.revoked,
      clientName: doc.clientName,
      taxYear: doc.taxYear,
      savings: c.savings,
      totalBefore: c.before.totalTaxes,
      totalAfter: c.after.totalTaxes,
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
      updatedAt: doc.updatedAt,
    };
  });
}
