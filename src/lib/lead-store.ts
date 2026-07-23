import "server-only";
import { adminDb, isConfigured } from "./firebase/admin";
import type { Lead } from "./lead";
import { EstimateInputs, EstimateResult } from "./tax";

/**
 * The estimator's leads, in Firestore.
 *
 * This is the record of record. Email and Slack are both deliveries — they can
 * bounce, be muted, be missed, or fail while the provider is down — and before
 * this existed a lead that failed both channels survived only in a log line.
 * The write happens before either delivery for that reason.
 *
 * Nothing reads this collection from the browser: firestore.rules denies all
 * client access and the Admin SDK bypasses rules, so adding this collection
 * needs no rules change. Don't "fix" that by opening a hole — these documents
 * hold contact details and income figures.
 */

/** Only collection besides `users`. camelCase plural, matching field style. */
const COLLECTION = "leadMagnetLeads";

export type SaveOutcome = { id: string } | "skipped";

export class LeadStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadStoreError";
  }
}

const money = (v: number) => Math.round(v);

/**
 * Record the lead. Resolves to "skipped" when Firebase isn't configured — the
 * same posture as Slack, so a half-configured environment still emails people
 * rather than failing their submission outright.
 */
export async function saveLead(
  lead: Lead,
  inputs: EstimateInputs,
  r: EstimateResult,
): Promise<SaveOutcome> {
  if (!isConfigured()) {
    console.warn("[lead] Firebase is not configured — not recording the lead");
    return "skipped";
  }

  const doc = {
    // Contact first: this is what someone scanning the console needs.
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    isCreator: lead.isCreator,
    platform: lead.platform,
    username: lead.username,
    /** Self-reported band from the modal — not the same as inputs.creator. */
    revenueBand: lead.revenueBand,
    consent: lead.consent,
    // The exact wording agreed to, frozen at submission time. See lib/lead.
    consentText: lead.consentText,

    estimate: {
      total: money(r.total),
      netSE: money(r.netSE),
      seTax: money(r.seTax),
      fed: money(r.fed),
      stateTax: money(r.stateTax),
      effRate: +r.effRate.toFixed(1),
      setAside: Math.round(r.setAside),
      savingsLow: money(r.savingsLow),
      savingsHigh: money(r.savingsHigh),
      solePropRisk: r.solePropRisk,
      needSCorp: r.needSCorp,
    },
    // Kept raw so an estimate can be rebuilt later — the tax tables change
    // every year, and a stored total is only meaningful next to its inputs.
    inputs,

    source: "tax-estimator",
    createdAt: new Date(),
    // Filled in by recordDelivery once the sends settle. Null means the write
    // landed but nothing reported back — distinct from an explicit false.
    emailed: null as boolean | null,
    notified: null as boolean | null,
  };

  try {
    const ref = await adminDb().collection(COLLECTION).add(doc);
    return { id: ref.id };
  } catch (e) {
    throw new LeadStoreError(e instanceof Error ? e.message : String(e));
  }
}

/**
 * One lead as the portal's Leads tab consumes it: flattened, serialisable, and
 * defensive about missing fields — these documents arrived over the wire across
 * schema versions, so nothing here trusts a field to exist. `entity`, `state`,
 * `revenue` and `sCorpNoPayroll` are lifted out of the raw inputs blob because
 * they're what Slack shows and what the table sorts a glance by.
 */
export type LeadRow = {
  id: string;
  createdAt: string | null;
  name: string;
  email: string;
  phone: string;
  isCreator: boolean;
  platform: string;
  username: string;
  revenueBand: string;
  entity: string;
  state: string;
  revenue: number;
  sCorpNoPayroll: boolean;
  estimate: {
    total: number;
    netSE: number;
    seTax: number;
    fed: number;
    stateTax: number;
    effRate: number;
    setAside: number;
    savingsLow: number;
    savingsHigh: number;
    solePropRisk: boolean;
    needSCorp: boolean;
  };
  emailed: boolean | null;
  notified: boolean | null;
};

/** Newest first. The portal reads this; nothing else should. */
export async function listLeads(limit = 200): Promise<LeadRow[]> {
  if (!isConfigured()) return [];

  const snap = await adminDb()
    .collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    const e = d.estimate ?? {};
    const inputs = d.inputs ?? {};
    return {
      id: doc.id,
      createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
      name: d.name ?? "",
      email: d.email ?? "",
      phone: d.phone ?? "",
      isCreator: Boolean(d.isCreator),
      platform: d.platform ?? "",
      username: d.username ?? "",
      revenueBand: d.revenueBand ?? "",
      entity: inputs.entity ?? "unanswered",
      state: inputs.state ?? "",
      revenue: Number(inputs.creator) || 0,
      sCorpNoPayroll: Boolean(inputs.sCorpNoPayroll),
      estimate: {
        total: Number(e.total) || 0,
        netSE: Number(e.netSE) || 0,
        seTax: Number(e.seTax) || 0,
        fed: Number(e.fed) || 0,
        stateTax: Number(e.stateTax) || 0,
        effRate: Number(e.effRate) || 0,
        setAside: Number(e.setAside) || 0,
        savingsLow: Number(e.savingsLow) || 0,
        savingsHigh: Number(e.savingsHigh) || 0,
        solePropRisk: Boolean(e.solePropRisk),
        needSCorp: Boolean(e.needSCorp),
      },
      emailed: typeof d.emailed === "boolean" ? d.emailed : null,
      notified: typeof d.notified === "boolean" ? d.notified : null,
    };
  });
}

/**
 * Stamp how the deliveries actually went. Best-effort by design: the lead is
 * already saved, and losing this annotation is not worth failing a request over.
 * An `emailed: false` here is the trail for "why didn't this person hear back".
 */
export async function recordDelivery(
  id: string,
  outcome: { emailed: boolean; notified: boolean },
): Promise<void> {
  if (!isConfigured()) return;
  try {
    await adminDb().collection(COLLECTION).doc(id).update(outcome);
  } catch (e) {
    console.error(`[lead] couldn't stamp delivery on ${id}:`, e);
  }
}
