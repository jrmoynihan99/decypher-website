/**
 * Additive backfill for the job detail pages: gives every jobOpening a slug
 * (from its title) and, for the three seeded roles, a rich-text full
 * description — both via setIfMissing, so Studio edits are never overwritten.
 * Also retunes the careers openings subline ("tap a card to apply" → the
 * detail-page wording) only if it still holds the original seeded string.
 * Safe to re-run any time.
 *
 *   node scripts/patch-job-details.mjs
 */
import { createClient } from "@sanity/client";
import { readFileSync } from "node:fs";
import { JOB_DESCRIPTIONS, slugify } from "./job-descriptions.mjs";

// ── env (.env.local, no dotenv dep) ─────────────────────────────────
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

const OLD_OPENINGS_SUB = "// every role is remote-first — tap a card to apply";
const NEW_OPENINGS_SUB =
  "// every role is remote-first — tap a card for the full brief";

async function main() {
  const jobs = await client.fetch(
    `*[_type == "jobOpening"]{ _id, title, "slug": slug.current, "hasDescription": defined(description) }`,
  );
  if (!jobs.length) {
    console.log("no jobOpening documents found — nothing to patch");
    return;
  }

  const tx = client.transaction();
  for (const job of jobs) {
    const patch = {};
    if (!job.slug) patch.slug = { _type: "slug", current: slugify(job.title) };
    if (!job.hasDescription && JOB_DESCRIPTIONS[job.title]) {
      patch.description = JOB_DESCRIPTIONS[job.title];
    }
    if (Object.keys(patch).length) {
      tx.patch(job._id, (p) => p.setIfMissing(patch));
      console.log(`patching ${job._id} (${job.title}): ${Object.keys(patch).join(", ")}`);
    } else {
      console.log(`skipping ${job._id} (${job.title}): already complete`);
    }
  }

  const careersPage = await client.fetch(
    `*[_id == "careersPage"][0]{ "sub": openingsSection.sub }`,
  );
  if (careersPage?.sub === OLD_OPENINGS_SUB) {
    tx.patch("careersPage", (p) =>
      p.set({ "openingsSection.sub": NEW_OPENINGS_SUB }),
    );
    console.log("retuning careersPage openings subline for the detail pages");
  }

  await tx.commit();
  console.log("done ✔");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
