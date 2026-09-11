import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";

/**
 * Staging for return PDFs too big for one request.
 *
 * Vercel caps a request body at ~4.5MB and a scanned client copy runs
 * 15-20MB, so the browser slices such a file into sub-1MiB pieces and posts
 * them a few at a time; the extract route reassembles and then deletes them.
 * Firestore rather than a bucket for the same reason resumes live there
 * (application-store.ts): the Firebase project has no billing account, so
 * Cloud Storage isn't available.
 *
 * These are tax returns — SSNs, bank details — so the staging is as
 * short-lived as it can be made: deleted the moment the read finishes,
 * successful or not, and anything older than two hours (an abandoned upload,
 * a crashed tab) is swept on the next upload. Every chunk is owned: a
 * different signed-in user can't assemble someone else's file by guessing
 * the id, because the id is a v4 UUID and the owner is checked anyway.
 */

const COLLECTION = "taxRecapUploads";
const CHUNKS = "chunks";

/** Per-chunk payload. Firestore's doc ceiling is 1MiB including overhead. */
export const UPLOAD_CHUNK_BYTES = 750 * 1024;
/** Matches PDF_MAX_BYTES in extract.ts — the model's own request ceiling. */
export const UPLOAD_MAX_BYTES = 24 * 1024 * 1024;
export const UPLOAD_MAX_CHUNKS = Math.ceil(UPLOAD_MAX_BYTES / UPLOAD_CHUNK_BYTES);

const STALE_MS = 2 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TaxRecapUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxRecapUploadError";
  }
}

export function isUploadId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export type UploadMeta = { total: number; size: number; name: string };

export async function saveUploadChunks(
  uploadId: string,
  owner: string,
  meta: UploadMeta,
  parts: { index: number; bytes: Buffer }[],
): Promise<void> {
  if (!isConfigured()) throw new TaxRecapUploadError("Firebase is not configured");
  const ref = adminDb().collection(COLLECTION).doc(uploadId);
  const snap = await ref.get();
  if (snap.exists && snap.get("owner") !== owner) {
    throw new TaxRecapUploadError("That upload belongs to someone else");
  }
  const batch = adminDb().batch();
  if (!snap.exists) {
    batch.set(ref, { owner, ...meta, createdAt: new Date() });
  }
  for (const p of parts) {
    batch.set(ref.collection(CHUNKS).doc(String(p.index)), { bytes: p.bytes });
  }
  await batch.commit();
}

/** Reassemble a finished upload. Throws if it's missing, partial, or not yours. */
export async function assembleUpload(
  uploadId: string,
  owner: string,
): Promise<{ bytes: Buffer; name: string }> {
  if (!isConfigured()) throw new TaxRecapUploadError("Firebase is not configured");
  const ref = adminDb().collection(COLLECTION).doc(uploadId);
  const snap = await ref.get();
  if (!snap.exists) throw new TaxRecapUploadError("Upload not found — try the file again");
  const d = snap.data() ?? {};
  if (d.owner !== owner) throw new TaxRecapUploadError("That upload belongs to someone else");

  const total = Number(d.total);
  const chunks = await ref.collection(CHUNKS).get();
  if (chunks.size !== total) {
    throw new TaxRecapUploadError(`Upload incomplete (${chunks.size} of ${total} parts) — try again`);
  }
  const bytes = Buffer.concat(
    chunks.docs
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((c) => c.get("bytes") as Buffer),
  );
  if (bytes.length !== Number(d.size) || bytes.length > UPLOAD_MAX_BYTES) {
    throw new TaxRecapUploadError("Upload size doesn't match — try again");
  }
  return { bytes, name: typeof d.name === "string" ? d.name : "" };
}

/** Best effort. Nothing here is worth failing a request over. */
export async function deleteUpload(uploadId: string): Promise<void> {
  if (!isConfigured()) return;
  try {
    const ref = adminDb().collection(COLLECTION).doc(uploadId);
    const chunks = await ref.collection(CHUNKS).listDocuments();
    await Promise.all(chunks.map((c) => c.delete()));
    await ref.delete();
  } catch (e) {
    console.error(`[tax-recap] couldn't delete upload ${uploadId}:`, e);
  }
}

/** Clear out abandoned uploads. Called at the start of a new one; best effort. */
export async function sweepStaleUploads(): Promise<void> {
  if (!isConfigured()) return;
  try {
    const stale = await adminDb()
      .collection(COLLECTION)
      .where("createdAt", "<", new Date(Date.now() - STALE_MS))
      .limit(10)
      .get();
    await Promise.all(stale.docs.map((d) => deleteUpload(d.id)));
  } catch (e) {
    console.error("[tax-recap] stale upload sweep failed:", e);
  }
}
