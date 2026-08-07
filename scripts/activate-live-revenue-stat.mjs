/**
 * Flip the "Creator lifetime revenue" stat from its hand-typed value to the
 * live {{creatorRevenue}} token, resolved server-side from QuickBooks by
 * lib/quickbooks/public-stats.ts.
 *
 *   npm run stats:activate-live
 *
 * RUN THIS AFTER THE TOKEN RESOLVER IS DEPLOYED. Sanity content is shared by
 * every deployment — flip it early and the production build that predates the
 * resolver renders the literal token text on the live stat card.
 *
 * Idempotent: finds the stat whose label mentions "lifetime revenue"; if its
 * value already carries the token, does nothing. To roll back, type the old
 * value back into Studio → Site Settings → Stats.
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

const doc = await client.getDocument("siteSettings");
if (!doc?.stats?.length) {
  console.error("siteSettings has no stats array");
  process.exit(1);
}

const idx = doc.stats.findIndex((s) => /lifetime revenue/i.test(s.label ?? ""));
if (idx === -1) {
  console.error(
    "No stat labelled like 'lifetime revenue'. Current stats:",
    doc.stats.map((s) => s.label),
  );
  process.exit(1);
}

const current = doc.stats[idx].value;
if (/\{\{\s*creatorRevenue\s*\}\}/i.test(current)) {
  console.log(`Already live: "${doc.stats[idx].label}" = ${current}. Nothing to do.`);
  process.exit(0);
}

const stats = doc.stats.map((s, i) =>
  i === idx ? { ...s, value: "{{creatorRevenue}}" } : s,
);
await client.patch("siteSettings").set({ stats }).commit();
console.log(
  `Done. "${doc.stats[idx].label}": ${current} → {{creatorRevenue}} (resolved live at render).`,
);
