import "server-only";
import { adminDb, isConfigured } from "./firebase/admin";
import type { Application, ResumeMeta } from "./application";

/**
 * Job applications, in Firestore. Same posture as lib/lead-store: this is the
 * record of record, written before the Slack notification, so a buried or
 * failed message never means a lost applicant. Nothing reads it from the
 * browser — firestore.rules denies all client access and the Admin SDK bypasses
 * rules, so no rules change is needed.
 *
 * The resume PDF lives HERE too, not in a storage bucket: the Firebase project
 * has no billing account, so Cloud Storage can't be enabled. The file is split
 * into <1MiB byte chunks under jobApplications/{id}/resume/{n} (Firestore's
 * doc-size ceiling), reassembled by the portal's download route. That keeps
 * resumes truly private — admin-SDK-only, never on a public CDN — at the cost
 * of a few extra reads per download. If billing ever lands, swap saveResume /
 * readResume for bucket calls and nothing else changes.
 */

const COLLECTION = "jobApplications";
const RESUME_SUBCOLLECTION = "resume";
// Firestore's limit is 1MiB per doc including field names and overhead; 750KiB
// of payload leaves comfortable headroom.
const CHUNK_BYTES = 750 * 1024;

export type SaveOutcome = { id: string } | "skipped";

export class ApplicationStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationStoreError";
  }
}

/**
 * Record the application, with its resume when one was uploaded. Resolves to
 * "skipped" when Firebase isn't configured, matching the Slack posture so a
 * half-configured environment still notifies rather than failing the
 * submission outright.
 *
 * Chunks are written before the main doc: the portal lists main docs, so a
 * half-written resume with no parent is invisible, while a parent claiming a
 * resume that isn't there would be a lie. If the chunk writes fail, the
 * application is still recorded — just with resume: null and a log line.
 */
export async function saveApplication(
  a: Application,
  resume?: { meta: ResumeMeta; bytes: Buffer },
): Promise<SaveOutcome> {
  if (!isConfigured()) {
    console.warn("[apply] Firebase is not configured — not recording the application");
    return "skipped";
  }

  const ref = adminDb().collection(COLLECTION).doc();

  let storedResume: ResumeMeta | null = null;
  if (resume) {
    try {
      const batch = adminDb().batch();
      for (let i = 0; i * CHUNK_BYTES < resume.bytes.length; i++) {
        batch.set(ref.collection(RESUME_SUBCOLLECTION).doc(String(i)), {
          bytes: resume.bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES),
        });
      }
      await batch.commit();
      storedResume = resume.meta;
    } catch (e) {
      console.error(`[apply] resume upload failed for ${a.email}:`, e);
    }
  }

  const doc = {
    // The whole Application is written as-is, so new fields on the interface
    // land here automatically — no change needed in this file to grow the form.
    ...a,
    resume: storedResume,
    source: "careers-form",
    createdAt: new Date(),
    // Stamped by recordDelivery once the Slack post settles. Null = the write
    // landed but nothing reported back, distinct from an explicit false.
    notified: null as boolean | null,
  };

  try {
    await ref.set(doc);
    return { id: ref.id };
  } catch (e) {
    throw new ApplicationStoreError(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Reassemble a stored resume. Null when the application has none (or the id is
 * unknown). Chunk docs are fetched in index order — doc ids are "0","1",… so
 * the numeric sort has to be explicit, string order would put "10" before "2".
 */
export async function readResume(
  id: string,
): Promise<{ meta: ResumeMeta; bytes: Buffer } | null> {
  if (!isConfigured()) return null;

  const ref = adminDb().collection(COLLECTION).doc(id);
  const doc = await ref.get();
  const meta = doc.data()?.resume as ResumeMeta | null | undefined;
  if (!doc.exists || !meta) return null;

  const snap = await ref.collection(RESUME_SUBCOLLECTION).get();
  const chunks = snap.docs
    .sort((x, y) => Number(x.id) - Number(y.id))
    .map((d) => d.get("bytes") as Buffer);
  if (!chunks.length) return null;

  return { meta, bytes: Buffer.concat(chunks) };
}

/** One application as the portal's Applications tab consumes it. */
export type ApplicationRow = {
  id: string;
  createdAt: string | null;
  role: string;
  department: string;
  // 01
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  heardAbout: string;
  // 02
  employmentType: string;
  experience: string;
  currentRole: string;
  desiredComp: string;
  startDate: string;
  // 03
  tools: string[];
  handled: string[];
  // 04
  whyUs: string;
  ownershipStory: string;
  boringWork: string;
  // 05
  availability: string;
  remoteCameras: boolean | null;
  internet: boolean | null;
  backgroundCheck: boolean | null;
  // 06
  workAuth: boolean | null;
  needsSponsorship: boolean | null;
  conflicts: string;
  message: string;
  resume: ResumeMeta | null;
  notified: boolean | null;
};

const s = (v: unknown) => (typeof v === "string" ? v : "");
const b = (v: unknown) => (typeof v === "boolean" ? v : null);
const arr = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Newest first. The portal reads this; nothing else should. */
export async function listApplications(limit = 200): Promise<ApplicationRow[]> {
  if (!isConfigured()) return [];

  const snap = await adminDb()
    .collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
      role: s(d.role),
      department: s(d.department),
      name: s(d.name),
      email: s(d.email),
      phone: s(d.phone),
      location: s(d.location),
      // Pre-resume rows stored their one link as `link`; show it in the same slot.
      linkedin: s(d.linkedin) || s(d.link),
      heardAbout: s(d.heardAbout),
      employmentType: s(d.employmentType),
      experience: s(d.experience),
      currentRole: s(d.currentRole),
      desiredComp: s(d.desiredComp),
      startDate: s(d.startDate),
      tools: arr(d.tools),
      handled: arr(d.handled),
      whyUs: s(d.whyUs),
      ownershipStory: s(d.ownershipStory),
      boringWork: s(d.boringWork),
      availability: s(d.availability),
      remoteCameras: b(d.remoteCameras),
      internet: b(d.internet),
      backgroundCheck: b(d.backgroundCheck),
      workAuth: b(d.workAuth),
      needsSponsorship: b(d.needsSponsorship),
      conflicts: s(d.conflicts),
      message: s(d.message),
      resume:
        d.resume && typeof d.resume.filename === "string"
          ? {
              filename: d.resume.filename,
              contentType: s(d.resume.contentType) || "application/octet-stream",
              size: typeof d.resume.size === "number" ? d.resume.size : 0,
            }
          : null,
      notified: typeof d.notified === "boolean" ? d.notified : null,
    };
  });
}

/**
 * Stamp whether Slack was notified. Best-effort: the application is already
 * saved, and losing this annotation isn't worth failing a request over. A
 * `notified: false` here is the trail for "why didn't recruiting see this".
 */
export async function recordDelivery(
  id: string,
  outcome: { notified: boolean },
): Promise<void> {
  if (!isConfigured()) return;
  try {
    await adminDb().collection(COLLECTION).doc(id).update(outcome);
  } catch (e) {
    console.error(`[apply] couldn't stamp delivery on ${id}:`, e);
  }
}

/**
 * Delete an application and its resume chunks. Used by cleanup tooling, not by
 * any route — the portal is read-only over this collection today.
 */
export async function deleteApplication(id: string): Promise<void> {
  if (!isConfigured()) return;
  const ref = adminDb().collection(COLLECTION).doc(id);
  const chunks = await ref.collection(RESUME_SUBCOLLECTION).listDocuments();
  await Promise.all(chunks.map((c) => c.delete()));
  await ref.delete();
}
