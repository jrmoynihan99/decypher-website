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
