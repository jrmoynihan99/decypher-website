import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import type { DeriveMeta, DeriveMore, EntityInput, Mismatch, OtherStateInput } from "./derive";
import {
  MAX_OTHER_ENTITIES,
  MAX_OTHER_STATES,
  asMoney,
  parseEntityForm,
  sanitizeEntityExtract,
  sanitizeEntityNumbers,
  sanitizeExtract,
  sanitizeNumbers,
  sanitizeStateNumbers,
  type EntityExtract,
  type EntityNumbers,
  type ReturnExtract,
  type ReturnNumbers,
} from "./schema";

/**
 * Refused derivations, kept so the engine can be fixed without asking the
 * tax team to send the return again.
 *
 * Until now a refusal left no trace: the engine runs in the browser, the
 * extraction lives in React state, the staged PDF is deleted the moment the
 * read finishes, and nothing is written unless a recap is saved. Every
 * failure the team hit had to be screenshotted and the files forwarded.
 *
 * One document per refusal in `taxRecapFailures`: everything the engine was
 * handed — the numbers as read, the raw extraction with the reader's notes,
 * the meta (year, status, state, form), the cross-check warnings — plus
 * what it said. `deriveBefore` is a pure function of exactly that, so a
 * failure replays locally (`npm run recap:replay`) and turns into a
 * `recap:check` fixture without the PDF.
 *
 * Two kinds of PDF can ride along:
 *
 *  - The original files staff dropped, byte for byte (`originals`), sent by
 *    the builder the moment the engine refuses — the site owner's call
 *    (2026-10-22): a refusal is debugged from the return itself, and the
 *    Refused returns page downloads them all as one zip. These are the
 *    client's real returns, SSNs and bank details included: they sit behind
 *    the Tax Recap gate, in Firestore beside the record, and they don't
 *    expire (the owner's call too) — they go when the record is deleted.
 *  - The redacted copies that went to the reader (`files`), when staff press
 *    "keep" — trimmed to the pages read, identities painted over: what the
 *    model saw, which is what a reader bug needs. Swept after KEEP_DAYS.
 */

const COLLECTION = "taxRecapFailures";
const FILES = "files";
const ORIGINALS = "originals";
const CHUNKS = "chunks";

/** The most original files one refusal keeps: the 1040, a city return, every entity return, a before print. */
export const MAX_ORIGINALS = 12;

export const FAILURE_FILE_KINDS = ["after", "entity", "before"] as const;
export type FailureFileKind = (typeof FAILURE_FILE_KINDS)[number];

/** How long a kept PDF stays. */
export const KEEP_DAYS = 14;
/** Per-chunk payload — Firestore's document ceiling is 1MiB with overhead (same as uploads.ts). */
export const FAILURE_CHUNK_BYTES = 750 * 1024;
export const FAILURE_FILE_MAX_BYTES = 24 * 1024 * 1024;

export class TaxRecapFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxRecapFailureError";
  }
}

export type FailureStatus = "open" | "fixed" | "dismissed";

export type KeptFile = {
  name: string;
  size: number;
  /** Pages in the kept copy. */
  pages: number | null;
  /** ISO; the chunks are swept after this. */
  expiresAt: string;
  keptAt: string;
  keptBy: string;
};

/** One file as it was dropped on the builder, kept unchanged. */
export type KeptOriginal = { index: number; name: string; size: number };

/** What the builder sends when the engine refuses. */
export type FailureInput = {
  /** Where it was refused: the first derivation, or a recompute from the edited grid. */
  stage: "derive" | "rederive";
  clientName: string;
  engineVersion: string;
  meta: DeriveMeta;
  reasons: string[];
  mismatches: Mismatch[];
  after: ReturnNumbers;
  entity: EntityNumbers | null;
  /** The entity returns beyond the first and the state returns beyond the main one (engine v13). */
  more: DeriveMore;
  extraction: { after: ReturnExtract | null; entity: EntityExtract | null; city?: EntityExtract | null };
  /** The reader's and cross-check's warnings, per return. */
  warnings: { after: string[]; entity: string[] };
  pages: { after: { total: number; sent: number } | null; entity: { total: number; sent: number } | null };
};

export type FailureDoc = FailureInput & {
  id: string;
  status: FailureStatus;
  note: string;
  files: Partial<Record<FailureFileKind, KeptFile>>;
  /** The files as dropped, in drop order (see the header). */
  originals: KeptOriginal[];
  createdAt: string | null;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string;
};

/** What the list shows — no extraction blob. */
export type FailureSummary = {
  id: string;
  status: FailureStatus;
  stage: FailureInput["stage"];
  clientName: string;
  taxYear: number | null;
  stateCode: string | null;
  entityForm: string | null;
  filingStatus: string | null;
  engineVersion: string;
  reasons: string[];
  mismatches: Mismatch[];
  warnings: FailureInput["warnings"];
  readerNotes: { after: string | null; entity: string | null };
  files: Partial<Record<FailureFileKind, KeptFile>>;
  originals: KeptOriginal[];
  note: string;
  createdAt: string | null;
  createdBy: string;
};

const iso =(v: unknown): string | null =>
  (v as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? null;
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strings = (v: unknown, count: number, max: number): string[] =>
  Array.isArray(v) ? v.map((s) => text(s, max)).filter(Boolean).slice(0, count) : [];

export function isFailureFileKind(v: unknown): v is FailureFileKind {
  return typeof v === "string" && (FAILURE_FILE_KINDS as readonly string[]).includes(v);
}

export function sanitizeMeta(raw: unknown): DeriveMeta {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const year = Number(r.taxYear);
  const stateCode = text(r.stateCode, 2).toUpperCase();
  const entityForm = text(r.entityForm, 10);
  const entityStateCode = text(r.entityStateCode, 2).toUpperCase();
  return {
    taxYear: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    filingStatus: text(r.filingStatus, 60) || null,
    stateCode: /^[A-Z]{2}$/.test(stateCode) ? stateCode : null,
    stateForm: text(r.stateForm, 40) || null,
    entityForm: entityForm === "1120-S" || entityForm === "1065" ? entityForm : null,
    entityStateCode: /^[A-Z]{2}$/.test(entityStateCode) ? entityStateCode : null,
    entityName: text(r.entityName, 120) || null,
    unverified: strings(r.unverified, 80, 60),
  };
}

/** The other entity and state returns the engine was handed, narrowed. */
export function sanitizeMore(raw: unknown): DeriveMore {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const code = (v: unknown) => {
    const c = text(v, 2).toUpperCase();
    return /^[A-Z]{2}$/.test(c) ? c : null;
  };
  const entities = (Array.isArray(r.entities) ? r.entities : [])
    .map((e): EntityInput | null => {
      const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      const numbers = sanitizeEntityNumbers(o.numbers);
      return numbers ? { numbers, form: parseEntityForm(o.form), stateCode: code(o.stateCode), name: text(o.name, 120) || null } : null;
    })
    .filter((e): e is EntityInput => e !== null)
    .slice(0, MAX_OTHER_ENTITIES);
  const states = (Array.isArray(r.states) ? r.states : [])
    .map((s): OtherStateInput | null => {
      const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const c = code(o.stateCode);
      return c ? { stateCode: c, stateForm: text(o.stateForm, 40) || null, numbers: sanitizeStateNumbers(o.numbers) } : null;
    })
    .filter((s): s is OtherStateInput => s !== null)
    .slice(0, MAX_OTHER_STATES);
  return { entities, states };
}

function sanitizeMismatches(raw: unknown): Mismatch[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => {
      const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
      const line = text(o.line, 160);
      const read = asMoney(o.read);
      const computed = asMoney(o.computed);
      return line && read !== null && computed !== null ? { line, read, computed } : null;
    })
    .filter((m): m is Mismatch => m !== null)
    .slice(0, 30);
}

function pagesOf(raw: unknown): { total: number; sent: number } | null {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!o) return null;
  const total = Number(o.total);
  const sent = Number(o.sent);
  return Number.isInteger(total) && total > 0 ? { total, sent: Number.isInteger(sent) && sent > 0 ? sent : total } : null;
}

/** Narrow an untrusted body into a FailureInput. */
export function sanitizeFailureInput(raw: unknown): FailureInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ex = (r.extraction && typeof r.extraction === "object" ? r.extraction : {}) as Record<string, unknown>;
  const w = (r.warnings && typeof r.warnings === "object" ? r.warnings : {}) as Record<string, unknown>;
  const p = (r.pages && typeof r.pages === "object" ? r.pages : {}) as Record<string, unknown>;
  const reasons = strings(r.reasons, 20, 800);
  if (!reasons.length) throw new TaxRecapFailureError("A failure needs at least one reason");
  return {
    stage: r.stage === "rederive" ? "rederive" : "derive",
    clientName: text(r.clientName, 80),
    engineVersion: text(r.engineVersion, 20),
    meta: sanitizeMeta(r.meta),
    reasons,
    mismatches: sanitizeMismatches(r.mismatches),
    after: sanitizeNumbers(r.after),
    entity: sanitizeEntityNumbers(r.entity),
    more: sanitizeMore(r.more),
    extraction: { after: sanitizeExtract(ex.after), entity: sanitizeEntityExtract(ex.entity), city: sanitizeEntityExtract(ex.city) },
    warnings: { after: strings(w.after, 30, 1200), entity: strings(w.entity, 30, 1200) },
    pages: { after: pagesOf(p.after), entity: pagesOf(p.entity) },
  };
}

function keptFile(raw: unknown): KeptFile | null {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!o || typeof o.expiresAt !== "string") return null;
  const pages = Number(o.pages);
  return {
    name: text(o.name, 200),
    size: Number(o.size) || 0,
    pages: Number.isInteger(pages) && pages > 0 ? pages : null,
    expiresAt: o.expiresAt,
    keptAt: text(o.keptAt, 40),
    keptBy: text(o.keptBy, 120),
  };
}

function filesOf(raw: unknown): FailureDoc["files"] {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: FailureDoc["files"] = {};
  for (const k of FAILURE_FILE_KINDS) {
    const f = keptFile(o[k]);
    if (f) out[k] = f;
  }
  return out;
}

/** The originals' map on the record ({ "0": { name, size }, … }) as a list in drop order. */
function originalsOf(raw: unknown): KeptOriginal[] {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.entries(o)
    .map(([k, v]) => {
      const f = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
      const index = Number(k);
      return f && Number.isInteger(index) ? { index, name: text(f.name, 200) || `file-${index + 1}.pdf`, size: Number(f.size) || 0 } : null;
    })
    .filter((f): f is KeptOriginal => f !== null)
    .sort((a, b) => a.index - b.index);
}

function toDoc(id: string, d: FirebaseFirestore.DocumentData): FailureDoc {
  const input = sanitizeFailureInputLoose(d);
  return {
    ...input,
    id,
    status: d.status === "fixed" || d.status === "dismissed" ? d.status : "open",
    note: text(d.note, 2000),
    files: filesOf(d.files),
    originals: originalsOf(d.originals),
    createdAt: iso(d.createdAt),
    createdBy: text(d.createdBy, 120),
    updatedAt: iso(d.updatedAt),
    updatedBy: text(d.updatedBy, 120),
  };
}

/** A stored document always has reasons; this reads one back without throwing on an odd old record. */
function sanitizeFailureInputLoose(d: FirebaseFirestore.DocumentData): FailureInput {
  try {
    return sanitizeFailureInput(d);
  } catch {
    return sanitizeFailureInput({ ...d, reasons: ["(no reasons recorded)"] });
  }
}

function toSummary(doc: FailureDoc): FailureSummary {
  return {
    id: doc.id,
    status: doc.status,
    stage: doc.stage,
    clientName: doc.clientName,
    taxYear: doc.meta.taxYear,
    stateCode: doc.meta.stateCode,
    entityForm: doc.meta.entityForm ?? null,
    filingStatus: doc.meta.filingStatus,
    engineVersion: doc.engineVersion,
    reasons: doc.reasons,
    mismatches: doc.mismatches,
    warnings: doc.warnings,
    readerNotes: { after: doc.extraction.after?.notes ?? null, entity: doc.extraction.entity?.notes ?? null },
    files: doc.files,
    originals: doc.originals,
    note: doc.note,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy,
  };
}

function ref(id: string) {
  if (!id || id.length > 200 || id.includes("/")) throw new TaxRecapFailureError("Bad failure id");
  return adminDb().collection(COLLECTION).doc(id);
}

export async function recordFailure(input: FailureInput, actor: string): Promise<FailureDoc> {
  if (!isConfigured()) throw new TaxRecapFailureError("Firebase is not configured");
  const now = new Date();
  // JSON round-trip: Firestore rejects undefined.
  const doc = {
    ...JSON.parse(JSON.stringify(input)),
    status: "open",
    note: "",
    files: {},
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor,
  };
  const added = await adminDb().collection(COLLECTION).add(doc);
  const snap = await added.get();
  await sweepExpiredFiles().catch((e) => console.error("[tax-recap] failure sweep:", e));
  return toDoc(added.id, snap.data() ?? {});
}

export async function getFailure(id: string): Promise<FailureDoc | null> {
  if (!isConfigured()) return null;
  const snap = await ref(id).get();
  return snap.exists ? toDoc(id, snap.data() ?? {}) : null;
}

export async function listFailures(limit = 200): Promise<FailureSummary[]> {
  if (!isConfigured()) return [];
  await sweepExpiredFiles().catch((e) => console.error("[tax-recap] failure sweep:", e));
  const snap = await adminDb().collection(COLLECTION).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => toSummary(toDoc(d.id, d.data())));
}

export async function updateFailure(
  id: string,
  edits: { status?: FailureStatus; note?: string },
  actor: string,
): Promise<FailureDoc> {
  if (!isConfigured()) throw new TaxRecapFailureError("Firebase is not configured");
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new TaxRecapFailureError("Failure not found");
  const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: actor };
  if (edits.status) patch.status = edits.status;
  if (edits.note !== undefined) patch.note = edits.note.slice(0, 2000);
  await r.update(patch);
  const after = await r.get();
  return toDoc(id, after.data() ?? {});
}

async function deleteFileChunks(id: string, kind: FailureFileKind): Promise<void> {
  const fileRef = ref(id).collection(FILES).doc(kind);
  const chunks = await fileRef.collection(CHUNKS).listDocuments();
  await Promise.all(chunks.map((c) => c.delete()));
  await fileRef.delete();
}

/** Every original kept with a failure, and the record's map of them. */
async function deleteOriginals(id: string): Promise<void> {
  const files = await ref(id).collection(ORIGINALS).listDocuments();
  for (const f of files) {
    const chunks = await f.collection(CHUNKS).listDocuments();
    await Promise.all(chunks.map((c) => c.delete()));
    await f.delete();
  }
}

export async function deleteFailure(id: string): Promise<void> {
  if (!isConfigured()) throw new TaxRecapFailureError("Firebase is not configured");
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new TaxRecapFailureError("Failure not found");
  for (const kind of FAILURE_FILE_KINDS) await deleteFileChunks(id, kind);
  await deleteOriginals(id);
  await r.delete();
}

/**
 * Keep one original file with a failure, unchanged, in pieces — the same
 * protocol as the redacted copies. The first batch of a file writes its
 * name and size to the record; the download refuses a file until every
 * piece is in. Kept until the record is deleted.
 */
export async function keepOriginalChunks(
  id: string,
  index: number,
  meta: { total: number; size: number; name: string },
  parts: { index: number; bytes: Buffer }[],
  actor: string,
): Promise<void> {
  if (!isConfigured()) throw new TaxRecapFailureError("Firebase is not configured");
  if (!Number.isInteger(index) || index < 0 || index >= MAX_ORIGINALS) throw new TaxRecapFailureError("Bad file index");
  if (meta.size > FAILURE_FILE_MAX_BYTES) throw new TaxRecapFailureError("PDF must be under 24MB");
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new TaxRecapFailureError("Failure not found");
  const now = new Date();
  const fileRef = r.collection(ORIGINALS).doc(String(index));
  const batch = adminDb().batch();
  if (parts.some((p) => p.index === 0)) {
    const name = meta.name.slice(0, 200);
    batch.set(fileRef, { name, size: meta.size, total: meta.total, keptAt: now.toISOString(), keptBy: actor });
    batch.update(r, { [`originals.${index}`]: { name, size: meta.size }, updatedAt: now, updatedBy: actor });
  }
  for (const p of parts) {
    batch.set(fileRef.collection(CHUNKS).doc(String(p.index)), { bytes: p.bytes });
  }
  await batch.commit();
}

/** One original as it was dropped. Null when it was never kept; throws when pieces are missing. */
export async function readOriginal(id: string, index: number): Promise<{ bytes: Buffer; name: string } | null> {
  if (!isConfigured()) return null;
  const fileRef = ref(id).collection(ORIGINALS).doc(String(index));
  const snap = await fileRef.get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  const total = Number(d.total);
  const chunks = await fileRef.collection(CHUNKS).get();
  if (!total || chunks.size !== total) {
    throw new TaxRecapFailureError(`${text(d.name, 200) || "A file"} is incomplete (${chunks.size} of ${total} pieces)`);
  }
  const bytes = Buffer.concat(chunks.docs.sort((a, b) => Number(a.id) - Number(b.id)).map((c) => c.get("bytes") as Buffer));
  if (bytes.length !== Number(d.size)) throw new TaxRecapFailureError(`${text(d.name, 200) || "A file"} doesn't add up to its size`);
  return { bytes, name: text(d.name, 200) || `file-${index + 1}.pdf` };
}

/**
 * Keep one redacted PDF with a failure, in pieces. Called once per batch of
 * pieces, like the upload route; the first batch writes the file's meta and
 * the expiry, and the download refuses until every piece is in.
 */
export async function keepFileChunks(
  id: string,
  kind: FailureFileKind,
  meta: { total: number; size: number; name: string; pages: number | null },
  parts: { index: number; bytes: Buffer }[],
  actor: string,
): Promise<KeptFile> {
  if (!isConfigured()) throw new TaxRecapFailureError("Firebase is not configured");
  if (meta.size > FAILURE_FILE_MAX_BYTES) throw new TaxRecapFailureError("PDF must be under 24MB");
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new TaxRecapFailureError("Failure not found");
  const now = new Date();
  const kept: KeptFile = {
    name: meta.name.slice(0, 200),
    size: meta.size,
    pages: meta.pages,
    expiresAt: new Date(now.getTime() + KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    keptAt: now.toISOString(),
    keptBy: actor,
  };
  const fileRef = r.collection(FILES).doc(kind);
  const batch = adminDb().batch();
  if (parts.some((p) => p.index === 0)) {
    batch.set(fileRef, { ...kept, total: meta.total });
    batch.update(r, { [`files.${kind}`]: kept, updatedAt: now, updatedBy: actor });
  }
  for (const p of parts) {
    batch.set(fileRef.collection(CHUNKS).doc(String(p.index)), { bytes: p.bytes });
  }
  await batch.commit();
  return kept;
}

/** Reassemble a kept PDF. Null when it was never kept or has expired. */
export async function readKeptFile(
  id: string,
  kind: FailureFileKind,
): Promise<{ bytes: Buffer; name: string } | null> {
  if (!isConfigured()) return null;
  const fileRef = ref(id).collection(FILES).doc(kind);
  const snap = await fileRef.get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  if (typeof d.expiresAt === "string" && new Date(d.expiresAt).getTime() < Date.now()) return null;
  const total = Number(d.total);
  const chunks = await fileRef.collection(CHUNKS).get();
  if (!total || chunks.size !== total) throw new TaxRecapFailureError(`The kept copy is incomplete (${chunks.size} of ${total} pieces)`);
  const bytes = Buffer.concat(
    chunks.docs.sort((a, b) => Number(a.id) - Number(b.id)).map((c) => c.get("bytes") as Buffer),
  );
  return { bytes, name: text(d.name, 200) || `${kind}.pdf` };
}

/** Drop every kept redacted copy past its expiry. Best effort; the record itself stays, and so do the originals. */
export async function sweepExpiredFiles(): Promise<void> {
  if (!isConfigured()) return;
  const now = new Date().toISOString();
  for (const kind of FAILURE_FILE_KINDS) {
    const expired = await adminDb()
      .collection(COLLECTION)
      .where(`files.${kind}.expiresAt`, "<", now)
      .limit(10)
      .get();
    for (const d of expired.docs) {
      await deleteFileChunks(d.id, kind);
      await d.ref.update({ [`files.${kind}`]: null });
    }
  }
}
