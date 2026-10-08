import "server-only";
import { randomBytes } from "crypto";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import type { SurveyKind } from "./links";
import {
  EXPECTATION_OPTIONS,
  LINK_FIELDS,
  LINK_ROLES,
  SCORE_FIELDS,
  SURVEY_ID_RE,
  SURVEY_VERSION,
  TEAM_FIELD_KEYS,
  TEAM_KEYS,
  dedupeKey,
  deriveFlags,
  emptyTeam,
  familyOf,
  sameRound,
  sanitizeSettings,
  sectionsFor,
  segmentFor,
  type FeedbackResponse,
  type FeedbackSettings,
  type FeedbackTask,
  type LinkFields,
  type RoundInfo,
  type ScoreFields,
  type Submission,
  type TaskStatus,
  type TeamFields,
  type TeamKey,
} from "./schema";
import { buildTasks } from "./tasks";

/**
 * Client feedback, in Firestore. The only store: the prototype's local /
 * shared-database / Postgres layers are gone, and the survey page and the
 * portal both come through here.
 *
 *   feedbackResponses/{survey_id}  one per submission. What the client said is
 *                                  written once and never edited; the `team`
 *                                  map beside it (who worked with them, their
 *                                  package…) is the only thing staff can change.
 *   feedbackTasks/{task_id}        the follow-ups at-risk responses create.
 *   feedbackConfig/settings        dropdown lists, the founder on follow-ups,
 *                                  the survey's base URL.
 *
 * Every query is a single-field where or orderBy, so nothing here needs a
 * composite index; anything finer is filtered and sorted in memory (it's a
 * few hundred clients, not a firehose).
 *
 * Nothing reads these collections from the browser: firestore.rules denies all
 * client access and the Admin SDK bypasses rules, so no rules change.
 */

const RESPONSES = "feedbackResponses";
const TASKS = "feedbackTasks";
const CONFIG = "feedbackConfig";
const SETTINGS_DOC = "settings";

/** Ceiling on a list read. Well past a few years of surveys; raise it before it bites. */
const LIST_LIMIT = 5000;

export class FeedbackStoreError extends Error {
  constructor(
    message: string,
    /** The HTTP status a route should answer with. */
    readonly status = 400,
  ) {
    super(message);
    this.name = "FeedbackStoreError";
  }
}

type Data = FirebaseFirestore.DocumentData;

/** Firestore Timestamp (stored) or Date (just written) → ISO. */
const iso = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString();
  return (v as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? null;
};
const millis = (v: unknown) => {
  const s = iso(v);
  return s ? Date.parse(s) : 0;
};
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function idRef(collection: string, id: string) {
  if (!id || id.length > 200 || id.includes("/")) throw new FeedbackStoreError("Bad id");
  return adminDb().collection(collection).doc(id);
}

function toScores(d: Data): ScoreFields {
  const out = {} as Record<keyof ScoreFields, unknown>;
  for (const k of SCORE_FIELDS) {
    out[k] = k.endsWith("_text") ? strOrNull(d[k]) : numOrNull(d[k]);
  }
  out.expectation_match = EXPECTATION_OPTIONS.some(([v]) => v === d.expectation_match) ? d.expectation_match : null;
  return out as ScoreFields;
}

function toTeam(raw: unknown): TeamFields {
  const t = emptyTeam();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const k of TEAM_FIELD_KEYS) t[k] = strOrNull(r[k]);
  return t;
}

/**
 * A stored response as the portal sees it. Defensive about every field, and
 * the flags are re-derived from the scores rather than read back — the stored
 * copies are for whoever's reading the Firestore console.
 */
function toResponse(id: string, d: Data): FeedbackResponse {
  const survey = d.survey === "service" ? "service" : "onboarding";
  const stored = Array.isArray(d.sections)
    ? (d.sections as unknown[]).filter((s): s is TeamKey => TEAM_KEYS.includes(s as TeamKey))
    : [];
  // The kind is stored; the fallbacks are for a record that somehow lost it.
  const kind: SurveyKind =
    survey === "onboarding"
      ? "onb"
      : d.kind === "bk" || d.kind === "tax" || d.kind === "both"
        ? d.kind
        : stored.includes("bookkeeping") && stored.includes("tax")
          ? "both"
          : stored.includes("tax")
            ? "tax"
            : "bk";
  const sections = stored;
  const scores = toScores(d);
  const link = Object.fromEntries(LINK_FIELDS.map((f) => [f, strOrNull(d[f])])) as LinkFields;
  return {
    ...scores,
    ...link,
    ...deriveFlags({ ...scores, survey }),
    id,
    survey,
    kind,
    sections: sections.length ? sections : sectionsFor(kind),
    survey_version: typeof d.survey_version === "string" ? d.survey_version : "",
    client_id: strOrNull(d.client_id),
    recap_id: strOrNull(d.recap_id),
    client_name: typeof d.client_name === "string" ? d.client_name : "",
    escalation: strOrNull(d.escalation),
    bookkeeping_period: strOrNull(d.bookkeeping_period),
    tax_year: d.tax_year == null ? null : String(d.tax_year),
    submitted_at: iso(d.submitted_at),
    duration_sec: numOrNull(d.duration_sec),
    review_prompt_shown: d.review_prompt_shown === true,
    review_link_clicked: d.review_link_clicked === true,
    review_link_clicked_at: iso(d.review_link_clicked_at),
    is_test: d.is_test === true,
    onboarding_completed_at: iso(d.onboarding_completed_at),
    team: toTeam(d.team),
    team_updated_at: iso(d.team_updated_at),
    team_updated_by: strOrNull(d.team_updated_by),
  };
}

function toTask(id: string, d: Data): FeedbackTask {
  return {
    task_id: id,
    team: TEAM_KEYS.includes(d.team) ? d.team : "onboarding",
    kind: "at_risk",
    survey_id: typeof d.survey_id === "string" ? d.survey_id : "",
    client_id: strOrNull(d.client_id),
    priority: "high",
    status: d.status === "done" ? "done" : "open",
    title: typeof d.title === "string" ? d.title : "",
    assignees: Array.isArray(d.assignees) ? (d.assignees as unknown[]).filter((v): v is string => typeof v === "string") : [],
    due_date: typeof d.due_date === "string" ? d.due_date : "",
    body: typeof d.body === "string" ? d.body : "",
    created_at: iso(d.created_at),
    completed_at: iso(d.completed_at),
    is_test: d.is_test === true,
  };
}

const roundOfDoc = (d: Data): RoundInfo => ({
  survey: d.survey === "service" ? "service" : "onboarding",
  sections: Array.isArray(d.sections) ? d.sections : [],
  bookkeeping_period: strOrNull(d.bookkeeping_period),
  tax_year: d.tax_year == null ? null : String(d.tax_year),
});

/* ───────────────────────────── the survey side ───────────────────────────── */

export type SubmitOutcome =
  | { ok: true; response: FeedbackResponse; tasks: FeedbackTask[]; replay: boolean }
  | { ok: false; reason: "already" | "conflict" };

/**
 * Save one submission, with its follow-ups, in one transaction.
 *
 * Inside it: the dedupe check (a real client answers each round once — see
 * sameRound), the team carried forward from their latest earlier responses
 * (so the bookkeeping lead set at onboarding is already on their bookkeeping
 * check-in), and the task writes. The dedupe query runs inside the
 * transaction, so two sends racing each other can't both get in.
 *
 * The document id is the survey's own submission id: a send retried after a
 * dropped response finds its first copy and returns it rather than tripping
 * the dedupe and telling the client they'd already answered.
 */
export async function submitResponse(sub: Submission, settings: FeedbackSettings): Promise<SubmitOutcome> {
  if (!isConfigured()) throw new FeedbackStoreError("Firebase is not configured");
  const db = adminDb();
  const now = new Date();
  const survey = familyOf(sub.kind);
  const sections = sectionsFor(sub.kind);
  const key = dedupeKey(sub.client_id, sub.recap_id);
  // The link's founder wins; otherwise whoever Team & setup names.
  const escalation = sub.escalation || settings.escalation || null;
  const flags = deriveFlags({ ...sub.scores, survey });
  // Re-scored here, never taken from the page: this is what the review funnel counts.
  const review_prompt_shown = segmentFor(sub.kind, sub.answers) === "promoter";
  const round: RoundInfo = {
    survey,
    sections,
    bookkeeping_period: sub.bookkeeping_period,
    tax_year: sub.tax_year,
  };
  const ref = db.collection(RESPONSES).doc(sub.survey_id);

  return db.runTransaction(async (tx): Promise<SubmitOutcome> => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      const d = existing.data() ?? {};
      if (d.client_name === sub.client_name && d.kind === sub.kind) {
        return { ok: true, response: toResponse(ref.id, d), tasks: [], replay: true };
      }
      return { ok: false, reason: "conflict" };
    }

    let prior: Data[] = [];
    if (key && !sub.is_test) {
      const snap = await tx.get(db.collection(RESPONSES).where("dedupe_key", "==", key).limit(500));
      prior = snap.docs.map((s) => s.data()).filter((d) => d.is_test !== true);
      if (prior.some((d) => sameRound(roundOfDoc(d), round))) return { ok: false, reason: "already" };
    }

    // The client's most recent value for each team field, across every survey
    // they've answered; anything the link names takes priority.
    prior.sort((a, b) => millis(b.submitted_at) - millis(a.submitted_at));
    const team = emptyTeam();
    for (const k of TEAM_FIELD_KEYS) {
      const hit = prior.find((d) => typeof d.team?.[k] === "string" && d.team[k]);
      if (hit) team[k] = hit.team[k];
    }
    for (const lr of LINK_ROLES) {
      const v = sub.link[lr.field];
      if (v) team[lr.role] = v;
    }

    const doc = {
      survey_id: sub.survey_id,
      survey,
      kind: sub.kind,
      sections,
      survey_version: SURVEY_VERSION,
      client_id: sub.client_id,
      recap_id: sub.recap_id,
      client_name: sub.client_name,
      escalation,
      dedupe_key: key,
      bookkeeping_period: sub.bookkeeping_period,
      tax_year: sub.tax_year,
      submitted_at: now,
      duration_sec: sub.duration_sec,
      review_prompt_shown,
      review_link_clicked: false,
      review_link_clicked_at: null,
      is_test: sub.is_test,
      ...sub.link,
      ...sub.scores,
      ...flags,
      team,
      // Locked like the answers: onboarding is "complete" when its survey comes back.
      onboarding_completed_at: survey === "onboarding" ? now : null,
      team_updated_at: null,
      team_updated_by: null,
    };
    tx.create(ref, doc);

    const drafts = buildTasks(
      {
        ...sub.scores,
        ...sub.link,
        survey_id: sub.survey_id,
        client_id: sub.client_id,
        client_name: sub.client_name,
        escalation,
        bookkeeping_period: sub.bookkeeping_period,
        tax_year: sub.tax_year,
        is_test: sub.is_test,
      },
      flags,
      now,
    );
    const tasks: FeedbackTask[] = [];
    for (const draft of drafts) {
      const id = `task_${randomBytes(10).toString("hex")}`;
      const t = { ...draft, task_id: id, created_at: now, completed_at: null };
      tx.create(db.collection(TASKS).doc(id), t);
      tasks.push(toTask(id, t));
    }

    return { ok: true, response: toResponse(ref.id, doc), tasks, replay: false };
  });
}

/** Has this client already answered the round a link is about? Test responses never count. */
export async function hasSubmitted(cid: string | null, rid: string | null, round: RoundInfo): Promise<boolean> {
  const key = dedupeKey(cid, rid);
  if (!key || !isConfigured()) return false;
  const snap = await adminDb().collection(RESPONSES).where("dedupe_key", "==", key).limit(500).get();
  return snap.docs.some((s) => {
    const d = s.data();
    return d.is_test !== true && sameRound(roundOfDoc(d), round);
  });
}

/**
 * The client tapped the Google review button. Flips false → true once, and
 * only on a response that was shown the ask; nothing else on the record is
 * reachable from here.
 */
export async function markReviewClicked(id: string): Promise<boolean> {
  if (!isConfigured() || !SURVEY_ID_RE.test(id)) return false;
  const ref = adminDb().collection(RESPONSES).doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!snap.exists || !d || d.review_prompt_shown !== true || d.review_link_clicked === true) return false;
    tx.update(ref, { review_link_clicked: true, review_link_clicked_at: new Date() });
    return true;
  });
}

/* ───────────────────────────── the portal side ───────────────────────────── */

/** Newest first. */
export async function listResponses(): Promise<FeedbackResponse[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb().collection(RESPONSES).orderBy("submitted_at", "desc").limit(LIST_LIMIT).get();
  return snap.docs.map((d) => toResponse(d.id, d.data()));
}

export async function listTasks(): Promise<FeedbackTask[]> {
  if (!isConfigured()) return [];
  const snap = await adminDb().collection(TASKS).orderBy("created_at", "desc").limit(LIST_LIMIT).get();
  return snap.docs.map((d) => toTask(d.id, d.data()));
}

/**
 * Save team fields on one response. Dot-path updates, so two people editing
 * different columns of the same client don't overwrite each other, and the
 * client's answers are never part of the write.
 */
export async function updateResponseTeam(
  id: string,
  patch: Partial<TeamFields>,
  actor: string,
): Promise<FeedbackResponse> {
  if (!isConfigured()) throw new FeedbackStoreError("Firebase is not configured");
  const ref = idRef(RESPONSES, id);
  const updates: Record<string, unknown> = { team_updated_at: new Date(), team_updated_by: actor };
  for (const k of TEAM_FIELD_KEYS) if (k in patch) updates[`team.${k}`] = patch[k] ?? null;
  const snap = await ref.get();
  if (!snap.exists) throw new FeedbackStoreError("Response not found");
  await ref.update(updates);
  const after = await ref.get();
  return toResponse(id, after.data() ?? {});
}

/**
 * One response and its follow-ups, for good. A test response can go by anyone
 * with the tab; a real one only when `allowReal` (the route passes admin):
 * real answers feed the per-person scorecard, so whoever a bad review is
 * about mustn't be able to make it disappear. Returns who it was, for the
 * route's audit line.
 */
export async function deleteResponse(
  id: string,
  { allowReal }: { allowReal: boolean },
): Promise<{ client_name: string; is_test: boolean }> {
  if (!isConfigured()) throw new FeedbackStoreError("Firebase is not configured", 500);
  const ref = idRef(RESPONSES, id);
  const snap = await ref.get();
  if (!snap.exists) throw new FeedbackStoreError("Response not found", 404);
  const d = snap.data() ?? {};
  const is_test = d.is_test === true;
  if (!is_test && !allowReal) {
    throw new FeedbackStoreError("Only admins can delete a client’s response", 403);
  }
  const tasks = await adminDb().collection(TASKS).where("survey_id", "==", id).get();
  const batch = adminDb().batch();
  batch.delete(ref);
  for (const t of tasks.docs) batch.delete(t.ref);
  await batch.commit();
  return { client_name: typeof d.client_name === "string" ? d.client_name : "", is_test };
}

/** Every test response and every test follow-up. */
export async function deleteTestData(): Promise<{ responses: number; tasks: number }> {
  if (!isConfigured()) throw new FeedbackStoreError("Firebase is not configured");
  const db = adminDb();
  const [responses, tasks] = await Promise.all([
    db.collection(RESPONSES).where("is_test", "==", true).get(),
    db.collection(TASKS).where("is_test", "==", true).get(),
  ]);
  const refs = [...responses.docs, ...tasks.docs].map((d) => d.ref);
  // A batch takes 500 writes; stay under it.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch();
    for (const r of refs.slice(i, i + 450)) batch.delete(r);
    await batch.commit();
  }
  return { responses: responses.size, tasks: tasks.size };
}

export async function setTaskStatus(id: string, status: TaskStatus, actor: string): Promise<FeedbackTask> {
  if (!isConfigured()) throw new FeedbackStoreError("Firebase is not configured");
  const ref = idRef(TASKS, id);
  const snap = await ref.get();
  if (!snap.exists) throw new FeedbackStoreError("Follow-up not found");
  await ref.update({
    status,
    completed_at: status === "done" ? new Date() : null,
    updated_at: new Date(),
    updated_by: actor,
  });
  const after = await ref.get();
  return toTask(id, after.data() ?? {});
}

export async function getSettings(): Promise<FeedbackSettings> {
  if (!isConfigured()) return sanitizeSettings(null);
  const snap = await adminDb().collection(CONFIG).doc(SETTINGS_DOC).get();
  return sanitizeSettings(snap.exists ? snap.data() : null);
}

/** The whole settings object, sanitized; returns what was stored. */
export async function saveSettings(raw: unknown, actor: string): Promise<FeedbackSettings> {
  if (!isConfigured()) throw new FeedbackStoreError("Firebase is not configured");
  const clean = sanitizeSettings(raw);
  await adminDb()
    .collection(CONFIG)
    .doc(SETTINGS_DOC)
    .set({ ...clean, updated_at: new Date(), updated_by: actor });
  return clean;
}
