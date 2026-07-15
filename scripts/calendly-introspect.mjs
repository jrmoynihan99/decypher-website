/**
 * Read-only Calendly introspection — answers three things before we build the
 * booking form: which account/org the token belongs to, which event types it can
 * actually see, and what custom questions the consult event asks (so the form on
 * /schedule-team can mirror them in our own design).
 *
 * Makes GET requests only. Never prints the token.
 *
 *   node scripts/calendly-introspect.mjs
 */
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const TOKEN = env.CALENDLY_API_TOKEN;
if (!TOKEN) {
  console.error("Missing CALENDLY_API_TOKEN in .env.local");
  process.exit(1);
}

/** The event type the live /schedule-team page books into. */
const LIVE_SLUG = process.argv[2] ?? "creator-support1/creator-discovery-call-1-2";
const API = "https://api.calendly.com";

async function get(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.message ?? body?.title ?? res.statusText;
    throw Object.assign(new Error(`${res.status} ${detail}`), {
      status: res.status,
      body,
    });
  }
  return body;
}

const rule = (label) => console.log(`\n${"─".repeat(64)}\n${label}\n`);

/* ===================== 1. who am I ===================== */
rule("1. WHO THIS TOKEN IS");

let me;
try {
  me = (await get("/users/me")).resource;
} catch (e) {
  console.error(`Failed: ${e.message}`);
  if (e.status === 401) console.error("→ Token is invalid, expired, or revoked.");
  process.exit(1);
}

console.log(`name:         ${me.name}`);
console.log(`email:        ${me.email}`);
console.log(`user uri:     ${me.uri}`);
console.log(`organization: ${me.current_organization}`);
console.log(
  `\n→ If that email is NOT the one your client invited, you generated the`,
);
console.log(`  token from your personal account and it can't see his events.`);

/* ===================== 2. what can it see ===================== */
rule("2. EVENT TYPES VISIBLE TO THIS TOKEN");

const mine = await get(
  `/event_types?user=${encodeURIComponent(me.uri)}&count=100`,
);
console.log(`As user (${mine.collection.length} found):`);
for (const et of mine.collection) {
  console.log(`  • ${et.name} — ${et.duration}min — ${et.scheduling_url}`);
}

let org = { collection: [] };
try {
  org = await get(
    `/event_types?organization=${encodeURIComponent(me.current_organization)}&count=100`,
  );
  console.log(`\nAcross the org (${org.collection.length} found):`);
  for (const et of org.collection) {
    const owner = et.profile?.name ?? "?";
    console.log(`  • ${et.name} — ${owner} — ${et.scheduling_url}`);
  }
} catch (e) {
  console.log(`\nAcross the org: ${e.message}`);
  if (e.status === 403) {
    console.log("→ You're a member, not an admin. Ask your client to make you");
    console.log("  an admin on the Calendly org, then re-run this.");
  }
}

/* ===================== 3. the consult event ===================== */
rule("3. THE CONSULT EVENT + ITS QUESTIONS");

const all = [...org.collection, ...mine.collection];
const target =
  all.find((et) => et.scheduling_url?.includes(LIVE_SLUG)) ?? all[0];

if (!target) {
  console.log("No event types visible at all — see the notes above.");
  process.exit(0);
}

if (!target.scheduling_url?.includes(LIVE_SLUG)) {
  console.log(`Nothing matched the live /d/${LIVE_SLUG} link.`);
  console.log(`That link is likely a one-off meeting, which has no reusable`);
  console.log(`event type to book against. Showing the first visible event`);
  console.log(`type instead so you can see the shape:\n`);
}

console.log(`name:        ${target.name}`);
console.log(`uri:         ${target.uri}`);
console.log(`duration:    ${target.duration} min`);
console.log(`kind:        ${target.kind} / ${target.pooling_type ?? "—"}`);
console.log(`active:      ${target.active}`);
console.log(`url:         ${target.scheduling_url}`);

const full = (await get(`/event_types/${target.uri.split("/").pop()}`)).resource;

console.log(`\nlocation:`);
console.log(JSON.stringify(full.locations ?? full.location ?? null, null, 2));

console.log(`\ncustom questions — THIS IS THE FORM WE MIRROR:`);
if (!full.custom_questions?.length) {
  console.log("  (none configured — only the standard name/email fields)");
} else {
  for (const q of full.custom_questions) {
    const bits = [q.type, q.required ? "required" : "optional"];
    if (!q.enabled) bits.push("DISABLED");
    console.log(`\n  [${q.position}] ${q.name}`);
    console.log(`      ${bits.join(" · ")}`);
    if (q.answer_choices?.length) {
      console.log(`      choices: ${q.answer_choices.join(", ")}`);
    }
    if (q.include_other) console.log(`      + "other" free-text option`);
  }
}

/* ===================== 4. routing forms ===================== */
rule("4. ROUTING FORMS — the questions asked BEFORE time selection");

try {
  const forms = await get(
    `/routing_forms?organization=${encodeURIComponent(me.current_organization)}&count=100`,
  );
  if (!forms.collection.length) {
    console.log("(none in this org)");
  }
  for (const f of forms.collection) {
    console.log(`\n▸ ${f.name}  [${f.status}]`);
    console.log(`  uri: ${f.uri}`);
    for (const q of f.questions ?? []) {
      const bits = [q.type, q.required ? "required" : "optional"];
      console.log(`    • ${q.name}`);
      console.log(`      ${bits.join(" · ")}  (uuid ${q.uuid})`);
      if (q.answer_choices?.length) {
        console.log(`      choices: ${q.answer_choices.join(", ")}`);
      }
    }
  }
} catch (e) {
  console.log(`Failed: ${e.message}`);
  if (e.status === 403 || e.status === 404) {
    console.log("→ Routing forms may need an admin role or a higher plan.");
  }
}

rule("RAW EVENT TYPE (full shape, for building against)");
console.log(JSON.stringify(full, null, 2));
