import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { sanitizeOptionList } from "@/lib/option-list";
import {
  APPLICATION_OPEN_LISTS,
  defaultApplicationOptions,
  type ApplicationList,
  type ApplicationOptionsConfig,
} from "./pipeline";

/**
 * The recruiting tracker's editable lists, in Firestore.
 *
 * Same shape and same posture as lib/sales/config.ts: one document
 * (`applicationConfig/options`) holding every list, written only once someone
 * edits, so a fresh install needs no seeding and a later change to the
 * defaults reaches every un-edited install for free.
 *
 * A list ABSENT from the stored document means "never edited" and returns the
 * defaults verbatim. An empty/omitted list run through the sanitizer would
 * come back with every default retired, so adding a new list later would
 * otherwise arrive switched off on every install that had already saved.
 *
 * `role` is the exception in the other direction: it's an open list whose
 * default is empty, so a stored empty array is a real, meaningful state.
 */

const DOC = "applicationConfig";
const ID = "options";

export class ApplicationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationConfigError";
  }
}

export function sanitizeApplicationOptions(raw: unknown): ApplicationOptionsConfig {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaults = defaultApplicationOptions();
  const openSet = new Set<string>(APPLICATION_OPEN_LISTS);
  const out = {} as ApplicationOptionsConfig;
  for (const list of Object.keys(defaults) as ApplicationList[]) {
    out[list] =
      body[list] === undefined
        ? defaults[list]
        : sanitizeOptionList(body[list], defaults[list], openSet.has(list));
  }
  return out;
}

export async function getApplicationOptions(): Promise<ApplicationOptionsConfig> {
  if (!isConfigured()) return defaultApplicationOptions();
  const snap = await adminDb().collection(DOC).doc(ID).get();
  if (!snap.exists) return defaultApplicationOptions();
  // Stored docs pass through the same sanitizer as writes, so a hand-edited or
  // stale document can never surface a broken list to the UI or the validator.
  return sanitizeApplicationOptions(snap.data());
}

export async function saveApplicationOptions(
  raw: unknown,
  actor: string,
): Promise<ApplicationOptionsConfig> {
  if (!isConfigured()) {
    throw new ApplicationConfigError("Firebase is not configured");
  }
  const config = sanitizeApplicationOptions(raw);
  await adminDb()
    .collection(DOC)
    .doc(ID)
    .set({ ...config, updatedAt: new Date(), updatedBy: actor });
  return config;
}

/** Valid keys for a list — retired included, because old rows still hold them. */
export function applicationKeysOf(
  config: ApplicationOptionsConfig,
  list: ApplicationList,
): string[] {
  return config[list].map((i) => i.key);
}
