/**
 * Targeted content patch for the thank-you hero video (July 2026): the
 * "But first…" body line now trails straight into the big pre-call video, so
 * the creator wall loses its old "[ but first ]" eyebrow and the optional
 * kicker over the video stays empty. The video URL itself is left for the
 * Studio (Book a Call → Thank You → Hero video) — a placeholder frame
 * renders until it's set.
 *
 * Leaf-path sets/unsets only, so re-running never clobbers a URL added in
 * Studio.
 *
 *   node scripts/patch-thankyou-hero-video.mjs
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
  "videoWallSection.eyebrow": "[ the receipts ]",
};

const UNSET = ["confirmation.video.eyebrow", "confirmation.video.title"];

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
