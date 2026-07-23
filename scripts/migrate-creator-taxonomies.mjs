/**
 * One-time migration (July 2026): Creator "category" and "group" moved from
 * hardcoded string dropdowns to references (creatorCategory / creatorGroup
 * documents) so editors can add new options inline from the picker. This:
 *
 *   1. creates one taxonomy doc per option — the old dropdown lists plus any
 *      value found on existing creators — with deterministic ids, then
 *   2. rewrites every creator whose category/group is still a string into a
 *      reference to the matching taxonomy doc.
 *
 * Idempotent — safe to re-run, e.g. after migrate-to-sanity.mjs reseeds
 * creators with plain strings again. Creators already holding references are
 * left untouched.
 *
 *   node scripts/migrate-creator-taxonomies.mjs
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

// The old dropdowns from schemaTypes/collections.ts — seeded so the pickers
// offer the same options the fixed lists did, used or not.
const CATEGORIES = [
  "Lifestyle", "Beauty", "Gaming", "UGC", "Comedy", "Coaching", "Food",
  "Finance", "Fashion", "Music", "Sports", "Mixology", "Editor",
  "TikTok Shop", "Tech", "Management Company", "Podcast", "Storytelling",
  "Fitness", "Travel", "Trickshots",
];
const GROUPS = [
  "Lifestyle", "Beauty", "Coaching", "Comedy", "UGC", "Food", "Finance",
  "Gaming", "Fashion", "Music", "Other",
];

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const catId = (title) => `creatorCategory-${slug(title)}`;
const groupId = (title) => `creatorGroup-${slug(title)}`;

const creators = await client.fetch(
  `*[_type == "creator"]{ _id, category, group }`,
);

const catTitles = new Set(CATEGORIES);
const groupTitles = new Set(GROUPS);
for (const c of creators) {
  if (typeof c.category === "string" && c.category) catTitles.add(c.category);
  if (typeof c.group === "string" && c.group) groupTitles.add(c.group);
}

let tx = client.transaction();
for (const t of catTitles)
  tx = tx.createIfNotExists({ _id: catId(t), _type: "creatorCategory", title: t });
for (const t of groupTitles)
  tx = tx.createIfNotExists({ _id: groupId(t), _type: "creatorGroup", title: t });
await tx.commit();
console.log(
  `taxonomies ensured: ${catTitles.size} categories, ${groupTitles.size} groups`,
);

let patched = 0;
for (const c of creators) {
  const set = {};
  if (typeof c.category === "string" && c.category)
    set.category = { _type: "reference", _ref: catId(c.category) };
  if (typeof c.group === "string" && c.group)
    set.group = { _type: "reference", _ref: groupId(c.group) };
  if (Object.keys(set).length) {
    await client.patch(c._id).set(set).commit();
    patched++;
  }
}
console.log(`creators rewritten to references: ${patched}/${creators.length}`);
