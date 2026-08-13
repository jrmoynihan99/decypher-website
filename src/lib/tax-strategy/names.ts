import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";

/**
 * Admin-set display names for the Tax Strategy tools.
 *
 * The tools themselves are code (five components behind one permission), but
 * what the firm CALLS them is vocabulary — it changes with how they pitch,
 * so it lives in Firestore like the sales dropdowns do. One doc
 * (`taxStrategyConfig/names`) mapping tool id → custom name; a missing key
 * means the built-in name. Ids are the frozen literals in
 * TaxStrategyWorkbench.tsx — unknown ids are stored harmlessly and simply
 * never render.
 */

const COLLECTION = "taxStrategyConfig";
const DOC = "names";

export type ToolNames = Record<string, string>;

export class ToolNamesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolNamesError";
  }
}

/** Keep only slug→short-string pairs; everything else is dropped, not errored. */
export function sanitizeToolNames(raw: unknown): ToolNames {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: ToolNames = {};
  for (const [key, value] of Object.entries(body)) {
    if (!/^[a-z0-9-]{1,40}$/.test(key)) continue;
    if (typeof value !== "string") continue;
    const name = value.trim().slice(0, 60);
    if (name) out[key] = name;
  }
  return out;
}

export async function getToolNames(): Promise<ToolNames> {
  if (!isConfigured()) return {};
  const snap = await adminDb().collection(COLLECTION).doc(DOC).get();
  if (!snap.exists) return {};
  return sanitizeToolNames(snap.data()?.names);
}

export async function saveToolNames(raw: unknown, actor: string): Promise<ToolNames> {
  if (!isConfigured()) throw new ToolNamesError("Firebase is not configured");
  const names = sanitizeToolNames(raw);
  await adminDb()
    .collection(COLLECTION)
    .doc(DOC)
    .set({ names, updatedAt: new Date(), updatedBy: actor });
  return names;
}
