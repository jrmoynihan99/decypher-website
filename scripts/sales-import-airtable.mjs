/**
 * Import the client's Airtable SALES base into the sales pipeline.
 *
 *   AIRTABLE_TOKEN=pat... node scripts/sales-import-airtable.mjs --dry
 *   AIRTABLE_TOKEN=pat... node scripts/sales-import-airtable.mjs
 *
 * RUN --dry FIRST. It writes nothing and prints the match rate, every value it
 * couldn't map, and the duplicate-partner report. Those three numbers are how
 * you decide whether the import is trustworthy before it touches anything.
 *
 * Order of operations matters: run scripts/sales-backfill.mjs BEFORE this. The
 * backfill creates rows from Calendly, which carry the real invitee id, phone,
 * answers and booking timestamps; this then layers the client's manual columns
 * on top by matching on email. Run in the other order and every row is an
 * Airtable orphan with no Calendly identity, and the webhook will later create
 * a second copy of each one.
 *
 * WHAT IT WRITES: only operator-owned fields (the triage checkboxes and the
 * Deal Desk / Referral columns) plus, for unmatched rows, a minimal
 * source:"airtable" document. It never overwrites a Calendly-owned field.
 *
 * The token is read from AIRTABLE_TOKEN in the environment, not from .env.local
 * — it's needed once for a migration and should not be left on disk afterwards.
 * Revoke it at airtable.com/create/tokens when this is done.
 */
import { args, db, rule } from "./_sales-env.mjs";

const argv = args();
const DRY = Boolean(argv.dry);
const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = typeof argv.base === "string" ? argv.base : "appP8cXs7sdicj0E3";

if (!TOKEN) {
  console.error("Set AIRTABLE_TOKEN in the environment (not .env.local).");
  console.error('  AIRTABLE_TOKEN=pat... node scripts/sales-import-airtable.mjs --dry');
  process.exit(1);
}

async function air(path) {
  const res = await fetch(`https://api.airtable.com/v0${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${body?.error?.message ?? res.statusText}`);
  return body;
}

/** Every record in a table, following pagination. */
async function all(table) {
  const out = [];
  let offset;
  do {
    const qs = new URLSearchParams({ pageSize: "100" });
    if (offset) qs.set("offset", offset);
    const page = await air(`/${BASE}/${encodeURIComponent(table)}?${qs}`);
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}

/* ─────────────────────── value mapping ─────────────────────── */

const unmapped = new Map();
function note(kind, value) {
  const key = `${kind}: ${value}`;
  unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
}

const clean = (s) => (typeof s === "string" ? s.trim() : "");
const key = (s) => clean(s).toLowerCase();

const LEAD_SOURCE = {
  "cold email": "cold-email",
  referral: "referral",
  newsletter: "newsletter",
  ads: "ads",
  linkedin: "linkedin",
  affiliate: "affiliate",
  "organic content": "organic-content",
  event: "event",
  "google seo": "google-seo",
  "organic relationship": "organic-relationship",
};

const SHOW = {
  show: "showed",
  "no show": "no-show",
  cancelled: "cancelled",
  "we missed call": "we-missed",
};

/**
 * Airtable's Status column is two axes in one. The five real outcomes map to a
 * status; NO SHOW and CANCELLED are attendance facts that belong in the Show
 * column, so they set that instead and leave the outcome genuinely unknown —
 * which it is. See the DEAL_STATUSES comment in src/lib/sales/options.ts.
 */
const STATUS = {
  "won closed": { status: "won" },
  lost: { status: "lost" },
  "thinking about it": { status: "thinking" },
  "won then backed out": { status: "won-backed-out" },
  "not a fit": { status: "not-a-fit" },
  "follow up later": { status: "follow-up-later" },
  "no show": { showStatus: "no-show" },
  cancelled: { showStatus: "cancelled" },
  // REFERRALS spells the same outcomes its own way.
  closed: { status: "won" },
  "not fit": { status: "not-a-fit" },
  thinking: { status: "thinking" },
};

const PLAN = {
  pif: "pif",
  "2 payments": "2-pay",
  "3 payments": "3-pay",
  "4 payments": "4-pay",
};

const SERVICE = {
  "decypher launch implementation": "launch-imp",
  "decypher grow implementation": "grow-imp",
  "decypher scale implementation": "scale-imp",
  "llc implementation": "llc-imp",
  "decypher core partnership program": "core-partnership",
  "decypher creator partnership program": "creator-partnership",
  "decypher c-suite partnership program": "csuite-partnership",
  "decypher basic partnership program": "basic-partnership",
  "single member/sole prop tax package": "sole-prop-tax",
  "s-corp/partnership tax package": "scorp-tax",
  "c-corp tax package": "ccorp-tax",
  "tax only": "tax-only",
  "n/a": "none",
  "x. thinking about it": "none",
  // REFERRALS → Offer Type Closed, a coarser spelling of the same catalogue.
  "core imp": "core-partnership",
  "creator imp": "creator-partnership",
  "llc only": "llc-imp",
};

const REFERRAL_KIND = { "decypher client": "client", "outside referral": "outside" };
const PRESET = { "750/250": "750-250", 250: "250", "250": "250" };

function map(table, value, kind) {
  const k = key(value);
  if (!k) return null;
  const hit = table[k];
  if (hit === undefined) {
    note(kind, clean(value));
    return null;
  }
  return hit;
}

const money = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/* ─────────────────────── load ─────────────────────── */

rule(`AIRTABLE IMPORT${DRY ? "  (DRY RUN — no writes)" : ""}`);
console.log(`base: ${BASE}\n`);

const [bookedRows, dealRows, referralRows] = await Promise.all([
  all("Booked Calls"),
  all("DEAL Desk"),
  all("REFERRALS"),
]);
console.log(
  `loaded  Booked Calls ${bookedRows.length}   DEAL Desk ${dealRows.length}   REFERRALS ${referralRows.length}`,
);

const firestore = db();

/** Existing pipeline rows, indexed for matching. */
const snap = await firestore.collection("salesCalls").get();
const byEmail = new Map();
const byName = new Map();
const push = (index, k, entry) => {
  if (!k) return;
  const bucket = index.get(k);
  if (bucket) bucket.push(entry);
  else index.set(k, [entry]);
};
for (const doc of snap.docs) {
  const d = doc.data();
  const entry = { id: doc.id, at: d.bookedAt?.toDate?.()?.getTime() ?? null };
  push(byEmail, key(d.email), entry);
  push(byName, key(d.name), entry);
}
console.log(`pipeline currently holds ${snap.size} calls\n`);

const DAY = 86_400_000;

/**
 * Closest row with the same email, preferring one booked near the same date.
 *
 * Email alone isn't enough — a lead who booked three times has three rows and
 * the Deal Desk entry belongs to one of them. Date proximity picks the right
 * one; a generous window because Airtable's Date Booked is a date and ours is a
 * timestamp in the invitee's zone, so they legitimately differ by a day.
 */
function findMatch(index, lookup, when) {
  const rows = index.get(key(lookup));
  if (!rows?.length) return null;
  if (!when) return rows[0];
  const target = new Date(when).getTime();
  if (Number.isNaN(target)) return rows[0];
  let best = null;
  let bestGap = Infinity;
  for (const r of rows) {
    const gap = r.at == null ? DAY * 5 : Math.abs(r.at - target);
    if (gap < bestGap) {
      best = r;
      bestGap = gap;
    }
  }
  return bestGap <= DAY * 4 ? best : (best ?? null);
}

/* ─────────────────────── referrers ─────────────────────── */

rule("REFERRAL PARTNERS");

const partnerCounts = new Map();
for (const r of referralRows) {
  const name = clean(r.fields["Referral Partner"]);
  if (name) partnerCounts.set(name, (partnerCounts.get(name) ?? 0) + 1);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * One record per distinct partner, keyed by slug — which alone collapses pure
 * case variants ("MEGHAN" and "Meghan" are one row).
 *
 * Anything beyond that is NOT merged automatically. "MEGHAN" vs "MEGHAN LIM",
 * "TRAN" vs "BAO TRAN", "CHOCTO" vs "CHOCTOPUS" are probably the same people
 * and probably is not good enough when the output is a public leaderboard and
 * a commission payout. They're printed below for a human to merge in the UI by
 * adding one as an alias of the other.
 */
const referrers = new Map();
for (const [name, count] of partnerCounts) {
  const id = slug(name);
  if (!id) continue;
  const existing = referrers.get(id);
  if (existing) {
    existing.count += count;
    if (!existing.aliases.includes(name) && existing.name !== name) existing.aliases.push(name);
  } else {
    referrers.set(id, { id, name, aliases: [], count });
  }
}
console.log(`${partnerCounts.size} distinct spellings → ${referrers.size} partner records`);

/**
 * Likely-same-person pairs, on whole words only.
 *
 * A bare substring test is useless here: "ALI" is inside "natALIa joy", so it
 * reported NATALIA JOY ~ ALI and NATALIE ODELL ~ ALI and buried the three pairs
 * that are actually real. Comparing word sets instead means "MEGHAN" and
 * "MEGHAN LIM" pair, and "ALI" and "NATALIA" don't.
 */
const words = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
const suspects = [];
const list = [...referrers.values()];
for (let i = 0; i < list.length; i++) {
  for (let j = i + 1; j < list.length; j++) {
    const a = words(list[i].name);
    const b = words(list[j].name);
    if (!a.size || !b.size) continue;
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    if ([...small].every((w) => big.has(w))) suspects.push([list[i], list[j]]);
  }
}
if (suspects.length) {
  console.log(`\nPOSSIBLE DUPLICATES — review and merge by hand, not merged here:`);
  for (const [a, b] of suspects) {
    console.log(`  "${a.name}" (${a.count})   ~   "${b.name}" (${b.count})`);
  }
}

if (!DRY) {
  const batch = firestore.batch();
  for (const r of referrers.values()) {
    batch.set(
      firestore.collection("salesReferrers").doc(r.id),
      { name: r.name, aliases: r.aliases, active: true, createdAt: new Date() },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`\nwrote ${referrers.size} partner records`);
}

/* ─────────────────────── booked calls ─────────────────────── */

rule("BOOKED CALLS → triage flags");

const triage = new Map();
for (const r of bookedRows) {
  const f = r.fields;
  const sales = Boolean(f.Sales);
  const referral = Boolean(f.Referral);
  if (!sales && !referral) continue;
  const email = key(f["Prospect Email"]);
  if (!email) continue;
  triage.set(`${email}|${date(f["Date Booked"]) ?? ""}`, { email, when: f["Date Booked"], sales, referral });
}
console.log(`${triage.size} rows flagged Sales or Referral`);

/* ─────────────────────── deal desk ─────────────────────── */

rule("DEAL DESK → pipeline");

let dealMatched = 0;
let dealOrphan = 0;
const writes = new Map();

function stage(id, patch) {
  writes.set(id, { ...(writes.get(id) ?? {}), ...patch });
}

const orphans = [];

let blank = 0;

for (const r of dealRows) {
  const f = r.fields;
  const email = clean(f["Guests Email"]);
  const when = f["Date Booked"];
  // Empty Airtable rows — no name, no email, nothing to identify or import.
  // Without this they'd all slug to the same document id and pile into one
  // junk record.
  if (!email && !clean(f.Name)) {
    blank += 1;
    continue;
  }
  const statusMapped = f.Status ? map(STATUS, f.Status, "status") : null;

  const patch = {
    isSales: true,
    isReferral: Boolean(f.Referral),
    leadSource: f["Lead Source"] ? map(LEAD_SOURCE, f["Lead Source"], "leadSource") : null,
    showStatus: f.Show ? map(SHOW, f.Show, "show") : null,
    status: statusMapped?.status ?? null,
    offer: money(f.Offer),
    paymentPlan: f["Pmt PLAN"] ? map(PLAN, f["Pmt PLAN"], "plan") : null,
    service: f["Service sold"] ? map(SERVICE, f["Service sold"], "service") : null,
    onboardingDate: date(f["OB Date"]),
    notes: clean(f.Notes) || null,
  };
  // An attendance-flavoured Status only wins when Show didn't already say.
  if (statusMapped?.showStatus && !patch.showStatus) patch.showStatus = statusMapped.showStatus;

  const match = email ? findMatch(byEmail, email, when) : null;
  if (match) {
    dealMatched += 1;
    stage(match.id, patch);
  } else {
    dealOrphan += 1;
    orphans.push({
      kind: "deal",
      name: clean(f.Name),
      email,
      when: date(when),
      callName: clean(f["Meeting Booked"]),
      phone: clean(f["Phone Number"]) || null,
      socials: clean(f.Socials) || null,
      patch,
    });
  }
}
console.log(`matched to a Calendly row : ${dealMatched}`);
console.log(`no match (import as-is)   : ${dealOrphan}`);
console.log(`blank rows skipped        : ${blank}`);

/* ─────────────────────── referrals ─────────────────────── */

rule("REFERRALS → pipeline");

let refMatched = 0;
let refOrphan = 0;

for (const r of referralRows) {
  const f = r.fields;
  const name = clean(f.Name);
  const when = f["Date Booked"];
  if (!name) {
    blank += 1;
    continue;
  }
  const partner = clean(f["Referral Partner"]);
  const partnerId = partner ? slug(partner) : null;
  const statusMapped = f.Status ? map(STATUS, f.Status, "status") : null;

  const patch = {
    isReferral: true,
    isSales: true,
    referrerId: partnerId,
    referrerName: partner || null,
    referralKind: f["Referral Type"] ? map(REFERRAL_KIND, f["Referral Type"], "referralKind") : null,
    commissionPreset: f["Commission type"] ? map(PRESET, f["Commission type"], "preset") : null,
    partnerCommission: money(f["Referral Commission"]),
    refereeCommission: money(f["Referree Commission"]),
    paid: Boolean(f.PAID),
  };
  if (statusMapped?.status) patch.status = statusMapped.status;
  if (f["Offer Type Closed"]) {
    const svc = map(SERVICE, f["Offer Type Closed"], "service");
    if (svc) patch.service = svc;
  }

  // REFERRALS carries no email, so this matches on name — the weakest join in
  // the import, and why --dry prints the rate. A miss creates a standalone row
  // rather than risking attaching a commission to the wrong person.
  const match = name ? findMatch(byName, name, when) : null;
  if (match) {
    refMatched += 1;
    stage(match.id, patch);
  } else {
    refOrphan += 1;
    orphans.push({
      kind: "referral",
      name,
      email: "",
      when: date(when),
      callName: "Referral Discovery Call 📱",
      phone: null,
      socials: null,
      patch,
    });
  }
}
console.log(`matched by name : ${refMatched}`);
console.log(`no match        : ${refOrphan}`);

/* ─────────────────────── report / write ─────────────────────── */

if (unmapped.size) {
  rule("VALUES THAT DIDN'T MAP (left null)");
  for (const [k, n] of [...unmapped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${k}`);
  }
}

rule(DRY ? "WOULD WRITE" : "WRITING");
console.log(`updates to existing rows : ${writes.size}`);
console.log(`new rows from Airtable   : ${orphans.length}`);

if (DRY) {
  // Orphans by year: if they cluster before the backfill window, the fix is to
  // re-run sales-backfill.mjs with an earlier --since rather than to accept
  // hundreds of Calendly-less rows.
  const byYear = new Map();
  for (const o of orphans) {
    const y = o.when?.slice(0, 4) ?? "no date";
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  console.log(`\nOrphans by year (are these older than the backfill window?):`);
  for (const [y, n] of [...byYear.entries()].sort()) {
    console.log(`  ${y}  ${n}`);
  }

  console.log(`\nSample orphans (first 10):`);
  for (const o of orphans.slice(0, 10)) {
    console.log(`  [${o.kind}] ${o.when ?? "—"}  ${(o.name || "—").slice(0, 28).padEnd(28)} ${o.email}`);
  }
  console.log(`\nNothing was written. Re-run without --dry to apply.`);
  process.exit(0);
}

/* Firestore batches cap at 500 operations. */
async function commitAll(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = firestore.batch();
    for (const op of ops.slice(i, i + 400)) op(batch);
    await batch.commit();
    process.stdout.write(`\r  committed ${Math.min(i + 400, ops.length)}/${ops.length}   `);
  }
  console.log();
}

const ops = [];
for (const [id, patch] of writes) {
  ops.push((b) => b.set(firestore.collection("salesCalls").doc(id), patch, { merge: true }));
}
for (const o of orphans) {
  // Deterministic id so re-running the import updates rather than duplicates.
  const id = `airtable-${slug(`${o.email || o.name}-${o.when ?? ""}`)}`.slice(0, 120);
  ops.push((b) =>
    b.set(
      firestore.collection("salesCalls").doc(id),
      {
        source: "airtable",
        callType: /referral/i.test(o.callName) ? "referral"
          : /☎️/.test(o.callName) ? "unqualified"
          : "qualified",
        callName: o.callName,
        name: o.name,
        email: o.email,
        phone: o.phone,
        socials: o.socials,
        revenueBand: null,
        timezone: null,
        bookedAt: o.when ? new Date(o.when) : null,
        scheduledAt: o.when ? new Date(o.when) : null,
        calendlyStatus: null,
        rescheduled: false,
        answers: [],
        leadSourceRaw: null,
        referrerRaw: null,
        suggestedLeadSource: null,
        paid: false,
        createdAt: new Date(),
        ...o.patch,
      },
      { merge: true },
    ),
  );
}

await commitAll(ops);

rule("DONE");
console.log(`Run the portal's Sales Flow tab and spot-check a few deals against Airtable.`);
console.log(`Then revoke the token at airtable.com/create/tokens.`);
