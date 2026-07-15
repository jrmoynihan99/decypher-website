/**
 * Targeted content patch for the thank-you redesign (July 2026): retitles the
 * Book a Call confirmation, seeds the "but first" video-wall heading, renumbers
 * the proof/reviews eyebrows for the new section order, and drops the fields
 * the schema no longer has (hero steps/readout, confirmation nextSteps/readout).
 *
 * Unlike migrate-to-sanity.mjs this does NOT overwrite the document — it only
 * touches the fields above, so Studio edits elsewhere survive.
 *
 *   node scripts/patch-thankyou-content.mjs
 */
import { createClient } from "@sanity/client";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const client = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  token: env.SANITY_API_WRITE_TOKEN,
  apiVersion: "2024-01-01",
  useCdn: false,
});

const SET = {
  "confirmation.title": "See you in our call.",
  "confirmation.body":
    "Request received — a real human reads every transmission and replies within one business day to lock in your time.",
  videoWallSection: {
    eyebrow: "[ but first ]",
    title: "Hear it from the creators.",
    sub: "// REAL CLIENTS. REAL RESULTS. TAP A VIDEO TO PLAY.",
  },
  "testimonialsSection.eyebrow": "[ 01 // reviews ]",
  "statsSection.eyebrow": "[ 02 // the proof ]",
};

const UNSET = [
  "hero.steps",
  "hero.readout",
  "confirmation.nextSteps",
  "confirmation.readout",
];

const ids = await client.fetch(
  `*[_id in ["schedulePage", "drafts.schedulePage"]]._id`,
);
if (!ids.length) {
  console.error("no schedulePage document found — run migrate-to-sanity first");
  process.exit(1);
}
for (const id of ids) {
  await client.patch(id).set(SET).unset(UNSET).commit();
  console.log(`patched ${id}`);
}
