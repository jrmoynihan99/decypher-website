import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { SCORP_ID_RE, sanitizeScorpClient, type ScorpClient } from "./scorp";

/**
 * The S-Corp Analyzer's saved clients, in Firestore.
 *
 * One document per client in `scorpClients`, doc id = record id, holding the
 * whole record: the calculator inputs, the decided salary, the review dates
 * and the history. The analyzer reads the list once on mount and writes whole
 * records back — the team is a handful of people, and last-write-wins on a
 * record two people happen to edit at once is an acceptable price for no
 * merge logic.
 *
 * Every read goes back through sanitizeScorpClient(), so a document written by
 * an older version (or edited by hand in the console) can't hand the browser a
 * shape it doesn't expect.
 *
 * Nothing reads this collection from the browser: firestore.rules denies all
 * client access and the Admin SDK bypasses rules, so no rules change. These
 * documents hold client income figures — don't open a hole.
 */

const COLLECTION = "scorpClients";

/** Enough for years of clients; the list isn't paged, so this is the ceiling. */
const LIST_LIMIT = 2000;

export class ScorpStoreError extends Error {
  constructor(
    message: string,
    readonly code: "config" | "bad-id" | "exists",
  ) {
    super(message);
    this.name = "ScorpStoreError";
  }
}

function ref(id: string) {
  if (!SCORP_ID_RE.test(id)) throw new ScorpStoreError("Bad client id", "bad-id");
  return adminDb().collection(COLLECTION).doc(id);
}

function assertConfigured() {
  if (!isConfigured()) throw new ScorpStoreError("Firebase is not configured", "config");
}

/**
 * Every saved client, most recently updated first. No orderBy — ordering in
 * memory needs no index, and the analyzer re-sorts for each of its views.
 */
export async function listScorpClients(): Promise<ScorpClient[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb().collection(COLLECTION).limit(LIST_LIMIT).get();
  const out: ScorpClient[] = [];
  for (const d of snap.docs) {
    const rec = sanitizeScorpClient({ ...d.data(), id: d.id });
    if (rec) out.push(rec);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Add a client. Refuses an id that's already taken rather than overwriting —
 * a backup import must never clobber a record someone has since changed.
 */
export async function createScorpClient(rec: ScorpClient, actor: string): Promise<ScorpClient> {
  assertConfigured();
  const now = Date.now();
  const doc: ScorpClient = {
    ...rec,
    createdAt: rec.createdAt || now,
    createdBy: rec.createdBy || actor,
    updatedAt: now,
    updatedBy: actor,
  };
  try {
    await ref(rec.id).create(doc);
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    if (code === 6 || code === "already-exists") {
      throw new ScorpStoreError("A client with that id already exists", "exists");
    }
    throw e;
  }
  return doc;
}

/**
 * Replace a client's record whole (creating it if it's gone). The creation
 * stamp survives from the stored copy, so a stale or hand-built body can't
 * rewrite who added the client; the update stamp is always the server's.
 */
export async function upsertScorpClient(
  id: string,
  rec: ScorpClient,
  actor: string,
): Promise<ScorpClient> {
  assertConfigured();
  const r = ref(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(r);
    const prev = snap.exists ? snap.data() : undefined;
    const now = Date.now();
    const doc: ScorpClient = {
      ...rec,
      id,
      createdAt:
        typeof prev?.createdAt === "number" && prev.createdAt > 0
          ? prev.createdAt
          : rec.createdAt || now,
      createdBy:
        typeof prev?.createdBy === "string" && prev.createdBy
          ? prev.createdBy
          : rec.createdBy || actor,
      updatedAt: now,
      updatedBy: actor,
    };
    tx.set(r, doc);
    return doc;
  });
}

/**
 * Delete a client for good. Idempotent: two people clearing the same stale
 * record shouldn't see an error for the second click. No undo; the table asks
 * first.
 */
export async function removeScorpClient(id: string): Promise<void> {
  assertConfigured();
  await ref(id).delete();
}
