import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import {
  TEAM_KEYS,
  isValidCallId,
  sanitizeCall,
  sanitizeTeam,
  type DiscoveryCall,
  type DiscoveryRecord,
  type DiscoveryTeam,
} from "./schema";

/**
 * Saved discovery calls, in Firestore.
 *
 * One document per call in `discoveryCalls`: what the creator said under
 * `call` (written by the call itself — first on Save, again if the advisor
 * changes an answer or the creator picks what the next call reviews — and
 * never from the Setter Answers tab), the staff record under `team` (advisor,
 * fit, next step, notes, the Fathom link — the drawer during the call and the
 * table after), `isTest` for a practice run, and the stamps. The same split
 * as feedbackResponses: answers locked, `team` editable.
 *
 * `submittedAt` is the first save and is the call date; `savedAt` moves with
 * every re-save of the answers; `teamUpdatedAt` with every staff edit. Team
 * edits are dot-path updates, so two people on different columns of the same
 * call don't overwrite each other, and the answers are never part of the
 * write.
 *
 * Nothing reads this collection from the browser: firestore.rules denies all
 * client access and the Admin SDK bypasses rules, so no rules change. These
 * documents hold creators' names, revenue and tax figures — keep it that way.
 */

const COLLECTION = "discoveryCalls";

/** Enough for years of calls; the list isn't paged, so this is the ceiling. */
const LIST_LIMIT = 5000;

export class DiscoveryStoreError extends Error {
  constructor(
    message: string,
    /** The HTTP status a route should answer with. */
    readonly status = 400,
  ) {
    super(message);
    this.name = "DiscoveryStoreError";
  }
}

type Data = FirebaseFirestore.DocumentData;

/** Firestore Timestamp (stored) or Date (just written) → ISO. */
const iso = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString();
  return (v as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? null;
};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);

function ref(id: string) {
  if (!isValidCallId(id)) throw new DiscoveryStoreError("Bad call id");
  return adminDb().collection(COLLECTION).doc(id);
}

function requireConfigured() {
  if (!isConfigured()) throw new DiscoveryStoreError("Firebase is not configured", 500);
}

/** Stored → API shape, re-narrowed on the way out so an older document can't hand the browser a shape it doesn't expect. */
function toRecord(id: string, d: Data): DiscoveryRecord {
  return {
    id,
    call: sanitizeCall(d.call),
    team: sanitizeTeam(d.team),
    isTest: d.isTest === true,
    submittedAt: iso(d.submittedAt),
    savedAt: iso(d.savedAt),
    savedByName: str(d.savedByName),
    teamUpdatedAt: iso(d.teamUpdatedAt),
    teamUpdatedBy: strOrNull(d.teamUpdatedBy),
  };
}

/** Newest call first. */
export async function listCalls(): Promise<DiscoveryRecord[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb().collection(COLLECTION).orderBy("submittedAt", "desc").limit(LIST_LIMIT).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function createCall(
  call: DiscoveryCall,
  team: DiscoveryTeam,
  isTest: boolean,
  actor: string,
): Promise<DiscoveryRecord> {
  requireConfigured();
  const now = new Date();
  const doc = {
    call,
    team,
    isTest,
    submittedAt: now,
    savedAt: now,
    savedByName: actor,
    teamUpdatedAt: null,
    teamUpdatedBy: null,
  };
  const added = await adminDb().collection(COLLECTION).add(doc);
  return toRecord(added.id, doc);
}

/**
 * Replace a call's answers — the advisor went back and changed one, or the
 * creator picked what the next call reviews. The staff fields sent with it
 * (the drawer's) are merged; the call date and the practice flag stay.
 */
export async function replaceCall(
  id: string,
  call: DiscoveryCall,
  team: Partial<DiscoveryTeam> | null,
  actor: string,
): Promise<DiscoveryRecord> {
  requireConfigured();
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new DiscoveryStoreError("Call not found", 404);
  const updates: Record<string, unknown> = { call, savedAt: new Date(), savedByName: actor };
  if (team) {
    for (const k of TEAM_KEYS) if (k in team) updates[`team.${k}`] = team[k] ?? null;
    if (Object.keys(team).length) {
      updates.teamUpdatedAt = new Date();
      updates.teamUpdatedBy = actor;
    }
  }
  await r.update(updates);
  const after = await r.get();
  return toRecord(id, after.data() ?? {});
}

/** Save staff fields on one call — only the keys in the patch. */
export async function updateTeam(id: string, patch: Partial<DiscoveryTeam>, actor: string): Promise<DiscoveryRecord> {
  requireConfigured();
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new DiscoveryStoreError("Call not found", 404);
  const updates: Record<string, unknown> = { teamUpdatedAt: new Date(), teamUpdatedBy: actor };
  for (const k of TEAM_KEYS) if (k in patch) updates[`team.${k}`] = patch[k] ?? null;
  await r.update(updates);
  const after = await r.get();
  return toRecord(id, after.data() ?? {});
}

/**
 * One call, for good. A practice call can go by anyone with the tab; a real
 * one only when `allowReal` (the route passes admin), as with client
 * feedback — real calls feed the close rate. Returns who it was, for the
 * route's audit line.
 */
export async function deleteCall(id: string, { allowReal }: { allowReal: boolean }): Promise<{ creatorName: string; isTest: boolean }> {
  requireConfigured();
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new DiscoveryStoreError("Call not found", 404);
  const d = snap.data() ?? {};
  const isTest = d.isTest === true;
  if (!isTest && !allowReal) throw new DiscoveryStoreError("Only admins can delete a real call", 403);
  await r.delete();
  return { creatorName: str(d.call?.creatorName), isTest };
}

/** Every practice call. */
export async function deletePracticeCalls(): Promise<number> {
  requireConfigured();
  const db = adminDb();
  const snap = await db.collection(COLLECTION).where("isTest", "==", true).get();
  const refs = snap.docs.map((d) => d.ref);
  // A batch takes 500 writes; stay under it.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch();
    for (const x of refs.slice(i, i + 450)) batch.delete(x);
    await batch.commit();
  }
  return refs.length;
}
