import "server-only";
import { adminDb, isConfigured } from "./firebase/admin";
import type { Application } from "./application";

/**
 * Job applications, in Firestore. Same posture as lib/lead-store: this is the
 * record of record, written before the Slack notification, so a buried or
 * failed message never means a lost applicant. Nothing reads it from the
 * browser — firestore.rules denies all client access and the Admin SDK bypasses
 * rules, so no rules change is needed.
 */

const COLLECTION = "jobApplications";

export type SaveOutcome = { id: string } | "skipped";

export class ApplicationStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationStoreError";
  }
}

/**
 * Record the application. Resolves to "skipped" when Firebase isn't configured,
 * matching the Slack posture so a half-configured environment still notifies
 * rather than failing the submission outright.
 */
export async function saveApplication(a: Application): Promise<SaveOutcome> {
  if (!isConfigured()) {
    console.warn("[apply] Firebase is not configured — not recording the application");
    return "skipped";
  }

  const doc = {
    // The whole Application is written as-is, so new fields on the interface
    // land here automatically — no change needed in this file to grow the form.
    ...a,
    source: "careers-form",
    createdAt: new Date(),
    // Stamped by recordDelivery once the Slack post settles. Null = the write
    // landed but nothing reported back, distinct from an explicit false.
    notified: null as boolean | null,
  };

  try {
    const ref = await adminDb().collection(COLLECTION).add(doc);
    return { id: ref.id };
  } catch (e) {
    throw new ApplicationStoreError(e instanceof Error ? e.message : String(e));
  }
}

/** One application as the portal's Applications tab consumes it. */
export type ApplicationRow = {
  id: string;
  createdAt: string | null;
  role: string;
  department: string;
  name: string;
  email: string;
  link: string;
  message: string;
  notified: boolean | null;
};

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
      role: d.role ?? "",
      department: d.department ?? "",
      name: d.name ?? "",
      email: d.email ?? "",
      link: d.link ?? "",
      message: d.message ?? "",
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
