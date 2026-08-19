import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { defaultOptionsConfig } from "./options";
import { sanitizeOptionList } from "@/lib/option-list";
import {
  OPEN_LISTS,
  type EditableList,
  type SalesOptionsConfig,
} from "./types";

/**
 * The editable dropdown lists, in Firestore.
 *
 * One document (`salesConfig/options`) holding every list. Absent means "the
 * defaults" — the doc is only written once someone edits, so a fresh install
 * needs no seeding step and a future change to the defaults reaches every
 * un-edited install automatically.
 *
 * Writes go through `sanitizeConfig` — a thin per-list wrapper over
 * sanitizeOptionList in lib/option-list — which enforces the contract the rest
 * of the system depends on:
 *
 *  - Keys from the DEFAULT lists can never be removed or renamed — historical
 *    rows are written in them, and the closed lists (status/show/kind) have
 *    money semantics attached to specific keys. A default key missing from the
 *    submitted list is re-appended as retired rather than dropped.
 *  - The closed lists accept label + order changes only; submitted additions
 *    to them are discarded.
 *  - New keys on the open lists must not collide with an existing key.
 *  - Colours are swatch keys from OPTION_COLORS, never raw hex. Anything else
 *    is dropped, so a hand-edited document can't put an unreadable colour on a
 *    chart.
 *
 * A list ABSENT from the stored document means "never edited" and returns the
 * defaults verbatim. That distinction matters: an empty/omitted list run
 * through sanitizeOptionList would come back with every default retired, so adding a
 * new list (objection) to the defaults would silently arrive switched off on
 * every install that had already saved a config.
 */

const DOC = "salesConfig";
const ID = "options";

export class SalesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesConfigError";
  }
}

export function sanitizeConfig(raw: unknown): SalesOptionsConfig {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaults = defaultOptionsConfig();
  const openSet = new Set<string>(OPEN_LISTS);
  const out = {} as SalesOptionsConfig;
  for (const list of Object.keys(defaults) as EditableList[]) {
    // Absent ≠ emptied. See the note at the top of the file.
    out[list] =
      body[list] === undefined
        ? defaults[list]
        : sanitizeOptionList(body[list], defaults[list], openSet.has(list));
  }
  return out;
}

export async function getOptionsConfig(): Promise<SalesOptionsConfig> {
  if (!isConfigured()) return defaultOptionsConfig();
  const snap = await adminDb().collection(DOC).doc(ID).get();
  if (!snap.exists) return defaultOptionsConfig();
  // Stored docs pass through the same sanitizer as writes, so a hand-edited or
  // stale document can never surface a broken list to the UI or the validator.
  return sanitizeConfig(snap.data());
}

export async function saveOptionsConfig(
  raw: unknown,
  actor: string,
): Promise<SalesOptionsConfig> {
  if (!isConfigured()) throw new SalesConfigError("Firebase is not configured");
  const config = sanitizeConfig(raw);
  await adminDb()
    .collection(DOC)
    .doc(ID)
    .set({ ...config, updatedAt: new Date(), updatedBy: actor });
  return config;
}

/** Valid keys for a list — retired included, because old rows still hold them. */
export function keysOf(config: SalesOptionsConfig, list: EditableList): string[] {
  return config[list].map((i) => i.key);
}
