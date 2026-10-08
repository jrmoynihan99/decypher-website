import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import {
  buildRecordSummary,
  isValidPlanId,
  sanitizePlanState,
  type ImportedPlan,
  type PlanRecord,
  type PlanState,
} from "./accountable-plan";

/**
 * Saved accountable plans, in Firestore.
 *
 * One document per client plan in `accountablePlans`: the full wizard state
 * under `state` (every answer, so Edit reopens it exactly), plus the summary
 * the records table and CSV read — re-derived here from that state on every
 * write, never taken from the request. The standalone builder kept these in a
 * per-artifact database; here the team shares one collection behind the Tax
 * Strategy tab.
 *
 * Who saved is stored as the staff member's display name, not a uid: the
 * table shows it, and a name survives the staff list changing under it.
 *
 * Nothing reads this collection from the browser: firestore.rules denies all
 * client access and the Admin SDK bypasses rules, so no rules change. These
 * documents hold client names, EINs and household costs — keep it that way.
 */

const COLLECTION = "accountablePlans";

export class AccountablePlanStoreError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AccountablePlanStoreError";
  }
}

const iso = (v: unknown): string | null => {
  const d = (v as { toDate?: () => Date } | undefined)?.toDate?.();
  if (d) return d.toISOString();
  return typeof v === "string" && isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
};

/**
 * Stored → API shape. The summary is recomputed from the stored state rather
 * than read back, so a rates change or a fixed rounding rule shows up on old
 * records without a migration.
 */
function toRecord(id: string, d: FirebaseFirestore.DocumentData): PlanRecord {
  const state = sanitizePlanState(d.state);
  state._clientId = id;
  return {
    id,
    ...buildRecordSummary(state),
    createdAt: iso(d.createdAt),
    createdByName: typeof d.createdByName === "string" ? d.createdByName : "",
    savedAt: iso(d.savedAt),
    savedByName: typeof d.savedByName === "string" ? d.savedByName : "",
    state,
  };
}

/** What gets written: the plan without its draft link, and the summary beside it. */
function body(state: PlanState) {
  const clean = { ...state };
  delete clean._clientId;
  return { ...buildRecordSummary(clean), state: clean };
}

function ref(id: string) {
  if (!isValidPlanId(id)) throw new AccountablePlanStoreError("Bad plan id");
  return adminDb().collection(COLLECTION).doc(id);
}

function requireConfigured() {
  if (!isConfigured()) throw new AccountablePlanStoreError("Firebase is not configured", 500);
}

/**
 * Every saved plan, most recently saved first. Sorted in memory: the
 * collection is one document per client, and an orderBy would hide any
 * document missing the field rather than sort it last.
 */
export async function listPlans(): Promise<PlanRecord[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb().collection(COLLECTION).get();
  const out = snap.docs.map((d) => toRecord(d.id, d.data()));
  out.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
  return out;
}

export async function createPlan(state: PlanState, actor: string): Promise<PlanRecord> {
  requireConfigured();
  const now = new Date();
  const added = await adminDb()
    .collection(COLLECTION)
    .add({
      ...body(state),
      createdAt: now,
      createdByName: actor,
      savedAt: now,
      savedByName: actor,
    });
  const snap = await added.get();
  return toRecord(added.id, snap.data() ?? {});
}

/** Replace a plan's answers. Who created it, and when, stay as they were. */
export async function updatePlan(id: string, state: PlanState, actor: string): Promise<PlanRecord> {
  requireConfigured();
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new AccountablePlanStoreError("Plan not found", 404);
  await r.update({ ...body(state), savedAt: new Date(), savedByName: actor });
  const after = await r.get();
  return toRecord(id, after.data() ?? {});
}

export async function deletePlan(id: string): Promise<void> {
  requireConfigured();
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new AccountablePlanStoreError("Plan not found", 404);
  await r.delete();
}

/**
 * Restore one record from a backup file. A record whose id is valid lands
 * on that id — re-importing a backup overwrites the same plans rather than
 * duplicating them, as the original's merge did. Its provenance (who
 * created and last saved it, and when) comes along; anything missing is
 * stamped as the importer, now.
 */
export async function importPlan(rec: ImportedPlan, actor: string): Promise<PlanRecord> {
  requireConfigured();
  const now = new Date();
  const created = rec.createdAt ? new Date(rec.createdAt) : now;
  const saved = rec.savedAt ? new Date(rec.savedAt) : now;
  const doc = {
    ...body(rec.state),
    createdAt: created,
    createdByName: rec.createdByName || actor,
    savedAt: saved,
    savedByName: rec.savedByName || actor,
  };
  const r = rec.id ? ref(rec.id) : adminDb().collection(COLLECTION).doc();
  await r.set(doc);
  const snap = await r.get();
  return toRecord(r.id, snap.data() ?? {});
}
