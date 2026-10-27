/**
 * Flip the two remaining hand-typed proof stats to their live tokens,
 * resolved server-side by lib/quickbooks/public-stats.ts:
 *
 *   "Creators helped"      → {{creatorCount}}   connected creators in Creator Finances, as "150+"
 *   "Creator tax savings"  → {{taxSavings}}     every tax recap's savings, added up
 *
 * (The revenue stat has its own script, stats:activate-live, from when it
 * went live first.)
 *
 *   npm run stats:activate-live-all
 *
 * RUN THIS AFTER THE RESOLVER IS DEPLOYED. Sanity content is shared by every
 * deployment — flip it early and the production build that predates the
 * resolver renders the literal token text on the live stat cards.
 *
 * Idempotent: a stat already carrying its token is left alone. To roll back,
 * type the old value back into Studio → Site Settings → Stats.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@sanity/client";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
}

for (const key of ["NEXT_PUBLIC_SANITY_PROJECT_ID", "NEXT_PUBLIC_SANITY_DATASET", "SANITY_API_WRITE_TOKEN"]) {
  if (!env[key]) {
    console.error(`Missing ${key} in .env.local`);
    process.exit(1);
  }
}

const client = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  token: env.SANITY_API_WRITE_TOKEN,
  apiVersion: "2024-10-01",
  useCdn: false,
});

const FLIPS = [
  { match: /creators? helped|creators on the books/i, token: "{{creatorCount}}" },
  { match: /tax savings/i, token: "{{taxSavings}}" },
];

const doc = await client.getDocument("siteSettings");
if (!doc?.stats?.length) {
  console.error("siteSettings has no stats array");
  process.exit(1);
}

let patch = client.patch("siteSettings");
let changes = 0;
for (const { match, token } of FLIPS) {
  const idx = doc.stats.findIndex((s) => match.test(s.label ?? ""));
  if (idx === -1) {
    console.warn(`No stat labelled like ${match}. Current stats:`, doc.stats.map((s) => s.label));
    continue;
  }
  const current = doc.stats[idx].value;
  if (current.includes(token)) {
    console.log(`Already live: "${doc.stats[idx].label}" = ${current}.`);
    continue;
  }
  patch = patch.set({ [`stats[${idx}].value`]: token });
  changes++;
  console.log(`"${doc.stats[idx].label}": ${current} → ${token}`);
}

if (!changes) {
  console.log("Nothing to do.");
  process.exit(0);
}
await patch.commit();
console.log(`Done — ${changes} stat${changes === 1 ? "" : "s"} now live. The home page shows it on its next revalidation.`);
