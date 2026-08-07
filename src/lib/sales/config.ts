import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { defaultOptionsConfig } from "./options";
import {
  OPEN_LISTS,
  type EditableList,
  type OptionItem,
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
 * Writes go through `sanitizeConfig`, which enforces the contract the rest of
 * the system depends on:
 *
 *  - Keys from the DEFAULT lists can never be removed or renamed — historical
 *    rows are written in them, and the closed lists (status/show/kind) have
 *    money semantics attached to specific keys. A default key missing from the
 *    submitted list is re-appended as retired rather than dropped.
 *  - The closed lists accept label + order changes only; submitted additions
 *    to them are discarded.
 *  - New keys on the open lists must not collide with an existing key.
 */

const DOC = "salesConfig";
const ID = "options";

export class SalesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesConfigError";
  }
}

function cleanItem(raw: unknown): OptionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const { key, label, retired } = raw as Record<string, unknown>;
  if (typeof key !== "string" || !key.trim()) return null;
  const cleanKey = key.trim().slice(0, 50);
  const cleanLabel =
    typeof label === "string" && label.trim() ? label.trim().slice(0, 80) : cleanKey;
  return retired ? { key: cleanKey, label: cleanLabel, retired: true } : { key: cleanKey, label: cleanLabel };
}

/**
 * Merge an untrusted list against its defaults. `open` lists may add and
 * retire; closed lists are re-ordered/re-labelled views of the default keys.
 */
function sanitizeList(raw: unknown, defaults: OptionItem[], open: boolean): OptionItem[] {
  const submitted = (Array.isArray(raw) ? raw : []).map(cleanItem).filter(
    (i): i is OptionItem => i !== null,
  );
  const defaultKeys = new Set(defaults.map((d) => d.key));
  const seen = new Set<string>();
  const out: OptionItem[] = [];

  for (const item of submitted) {
    if (seen.has(item.key)) continue; // a duplicate row would fork the key
    if (!open && !defaultKeys.has(item.key)) continue; // closed list: no additions
    if (!open && item.retired) {
      // Closed keys can't retire either — semantics hang off them.
      out.push({ key: item.key, label: item.label });
    } else {
      out.push(item);
    }
    seen.add(item.key);
  }

  // Anything from the defaults the submission dropped comes back — retired on
  // open lists (closest to the intent of deleting), verbatim on closed ones.
  for (const d of defaults) {
    if (seen.has(d.key)) continue;
    out.push(open ? { ...d, retired: true } : d);
  }
  return out;
}

export function sanitizeConfig(raw: unknown): SalesOptionsConfig {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaults = defaultOptionsConfig();
  const openSet = new Set<string>(OPEN_LISTS);
  const out = {} as SalesOptionsConfig;
  for (const list of Object.keys(defaults) as EditableList[]) {
    out[list] = sanitizeList(body[list], defaults[list], openSet.has(list));
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
