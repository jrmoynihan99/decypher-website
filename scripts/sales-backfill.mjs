/**
 * Backfill the sales pipeline from Calendly's own history.
 *
 *   node scripts/sales-backfill.mjs --since=2024-01-01
 *   node scripts/sales-backfill.mjs --since=2024-01-01 --dry
 *
 * A webhook only fires for bookings made after it was subscribed, so this is
 * what puts everything before that into the pipeline. It is also the repair
 * tool: re-run it any time and it reconciles, because writes are keyed on the
 * invitee UUID and merge.
 *
 * SAFE TO RE-RUN. Only the Calendly-owned half of a document is written; every
 * field an operator filled in is absent from the payload, so a merge cannot
 * touch it. That is enforced by the shape of the write, not by a filter — see
 * the comment on upsertFromCalendly in src/lib/sales/store.ts.
 *
 * Slow by nature: /scheduled_events has no event-type filter, so it pages
 * through every meeting in the org and drops the ~90% that aren't sales calls.
 * Expect a few minutes for a couple of years of history.
 */
import { args, calendly, callTypeForEventType, db, rule } from "./_sales-env.mjs";

const argv = args();
const DRY = Boolean(argv.dry);
const since = typeof argv.since === "string" ? argv.since : null;

if (!since || Number.isNaN(new Date(since).getTime())) {
  console.error("Usage: node scripts/sales-backfill.mjs --since=YYYY-MM-DD [--dry]");
  process.exit(1);
}

const minStartTime = new Date(since).toISOString();
const me = (await calendly("/users/me")).resource;
const organization = me.current_organization;

rule(`BACKFILL from ${minStartTime}${DRY ? "  (DRY RUN — no writes)" : ""}`);
console.log(`org: ${organization}\n`);

const firestore = DRY ? null : db();

/* ---- questions we lift out of the answers, mirroring lib/sales/options ---- */
const find = (answers, re) => {
  const hit = answers.find((a) => re.test(a.question));
  const v = hit?.answer?.trim();
  return v || null;
};
const REFERRER_Q = /who\s+referred\s+you/i;
const SOURCE_Q = /how\s+did\s+you\s+hear/i;

const SOURCE_HINTS = [
  ["ugc foundations", "referral"],
  ["creator perks", "affiliate"],
  ["creator referral", "referral"],
  ["referral", "referral"],
  ["newsletter", "newsletter"],
  ["publish press", "newsletter"],
  ["linkedin", "linkedin"],
  ["google", "google-seo"],
  ["website", "google-seo"],
  ["email", "cold-email"],
  ["ad", "ads"],
];
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function suggestLeadSource(answer) {
  if (!answer) return null;
  for (const part of answer.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean)) {
    const hay = norm(part);
    for (const [needle, source] of SOURCE_HINTS) if (hay.includes(needle)) return source;
  }
  return null;
}

/* ---------------------------- the walk ---------------------------- */

let nextPage = null;
let scanned = 0;
let matched = 0;
let created = 0;
let updated = 0;
let pages = 0;
const byType = {};

do {
  const qs = new URLSearchParams({
    organization,
    count: "100",
    sort: "start_time:asc",
    min_start_time: minStartTime,
  });
  // Follow Calendly's own next_page URL rather than rebuilding the query with
  // page_token — see the note on calendly() in _sales-env.mjs.
  const page = await calendly(nextPage ?? `/scheduled_events?${qs}`);
  pages += 1;
  scanned += page.collection.length;

  const relevant = page.collection
    .map((ev) => ({ ev, callType: callTypeForEventType(ev.event_type) }))
    .filter((x) => x.callType);

  for (const { ev, callType } of relevant) {
    matched += 1;
    byType[callType] = (byType[callType] ?? 0) + 1;

    const uuid = ev.uri.split("/").pop();
    let invitees;
    try {
      invitees = (await calendly(`/scheduled_events/${uuid}/invitees?count=100`)).collection;
    } catch (e) {
      console.error(`  ! invitees for ${uuid}: ${e.message}`);
      continue;
    }

    for (const inv of invitees) {
      const answers = inv.questions_and_answers ?? [];
      const leadSourceRaw = find(answers, SOURCE_Q) ?? find(answers, REFERRER_Q);
      const id = inv.uri.split("?")[0].split("/").pop();

      const payload = {
        source: "calendly",
        callType,
        callName: ev.name ?? "",
        name: inv.name ?? "",
        email: inv.email ?? "",
        phone: inv.text_reminder_number ?? find(answers, /phone|call\s*back|callback/i),
        socials: find(answers, /website|social media handle/i),
        revenueBand: find(answers, /projected\s+yearly\s+revenue/i),
        timezone: inv.timezone ?? null,
        bookedAt: new Date(inv.created_at),
        scheduledAt: new Date(ev.start_time),
        calendlyStatus: inv.status === "canceled" || ev.status === "canceled" ? "canceled" : "active",
        rescheduled: Boolean(inv.rescheduled),
        answers,
        leadSourceRaw,
        referrerRaw: find(answers, REFERRER_Q) ?? find(answers, SOURCE_Q),
        suggestedLeadSource: suggestLeadSource(leadSourceRaw),
        syncedAt: new Date(),
      };

      if (DRY) {
        created += 1;
        if (created <= 12) {
          console.log(
            `  ${payload.bookedAt.toISOString().slice(0, 10)}  ${callType.padEnd(11)}  ` +
              `${(payload.name || "—").slice(0, 26).padEnd(26)}  ${payload.email}`,
          );
        }
        continue;
      }

      const ref = firestore.collection("salesCalls").doc(id);
      const existing = await ref.get();
      if (existing.exists) {
        await ref.set(payload, { merge: true });
        updated += 1;
      } else {
        await ref.set({
          isSales: true,
          isReferral: callType === "referral",
          leadSource: null,
          showStatus: null,
          status: null,
          offer: null,
          paymentPlan: null,
          service: null,
          onboardingDate: null,
          notes: null,
          referrerId: null,
          referrerName: null,
          referralKind: null,
          commissionPreset: null,
          partnerCommission: null,
          refereeCommission: null,
          paid: false,
          ...payload,
          createdAt: new Date(),
        });
        created += 1;
      }
    }
  }

  nextPage = page.pagination?.next_page ?? null;
  process.stdout.write(
    `\r  page ${pages}  scanned ${scanned}  sales calls ${matched}  ` +
      `${DRY ? "would create" : "created"} ${created}  updated ${updated}   `,
  );
} while (nextPage);

rule("DONE");
console.log(`events scanned : ${scanned}`);
console.log(`sales calls    : ${matched}`);
for (const [k, n] of Object.entries(byType)) console.log(`  ${k.padEnd(12)} ${n}`);
console.log(`${DRY ? "would create" : "created"}   : ${created}`);
if (!DRY) console.log(`updated        : ${updated}`);
if (DRY) console.log(`\nNothing was written. Re-run without --dry to apply.`);
