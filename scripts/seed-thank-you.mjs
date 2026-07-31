/**
 * Moves the thank-you takeover off the Book a Call document and onto a
 * thank-you page of its own — the first of however many the client ends up
 * making, one per ad campaign.
 *
 *   1. Creates a "Default" thankYouPage from whatever is CURRENTLY in
 *      schedulePage.confirmation, so any copy edited in the Studio carries over
 *      intact rather than being replaced by a hardcoded version of it.
 *   2. Points schedulePage.thankYou at it — the page the booking form falls
 *      back to when a link carries no ?ty= parameter.
 *   3. Clears the old confirmation field, which the schema no longer declares.
 *
 * Safe to re-run: the page is createIfNotExists and the reference is only set
 * if it isn't already pointing somewhere. Once step 3 has run there is nothing
 * left to copy, so a second run is a no-op.
 *
 *   node scripts/seed-thank-you.mjs [--force]
 *
 * --force replaces the default page's content with what's on the schedule doc
 * (or the built-in copy if that's empty). That DOES discard Studio edits to
 * that one page.
 */
import { createClient } from "@sanity/client";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

if (!env.SANITY_API_WRITE_TOKEN) {
  console.error("Missing SANITY_API_WRITE_TOKEN in .env.local");
  process.exit(1);
}

const client = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  token: env.SANITY_API_WRITE_TOKEN,
  apiVersion: "2024-10-01",
  useCdn: false,
});

const force = process.argv.includes("--force");

const PAGE_ID = "thank-you-default";

/** Matches the fallbacks in ThankYouHero, so the seeded page reads the same. */
const FALLBACK = {
  eyebrow: "● CHANNEL OPEN",
  title: "See you in our call.",
  body: "But first…",
};

const schedule = await client.fetch(
  `*[_id == "schedulePage"][0]{ confirmation, "thankYouRef": thankYou._ref }`,
);
const old = schedule?.confirmation ?? {};

const page = {
  _id: PAGE_ID,
  _type: "thankYouPage",
  title: "Default",
  slug: { _type: "slug", current: "default" },
  header: {
    eyebrow: old.eyebrow ?? FALLBACK.eyebrow,
    title: old.title ?? FALLBACK.title,
    body: old.body ?? FALLBACK.body,
  },
  // Only carried over if there's something to carry — an object of three
  // undefined keys would show as a set-but-empty video block in the Studio.
  ...(old.video?.videoUrl || old.video?.eyebrow || old.video?.title
    ? { video: old.video }
    : {}),
};

/* ─────────────────── 1. the default thank-you page ─────────────────── */

if (force) {
  await client.createOrReplace(page);
  console.log("PAGE · /thank-you/default replaced (--force).");
} else {
  const res = await client.createIfNotExists(page);
  console.log(
    res._createdAt && Date.now() - Date.parse(res._createdAt) < 10_000
      ? "PAGE · /thank-you/default created."
      : "PAGE · /thank-you/default already exists — left alone (use --force to replace).",
  );
}

/* ─────────── 2 + 3. point Book a Call at it, drop the old field ─────────── */

const patch = client.patch("schedulePage").unset(["confirmation"]);
if (schedule?.thankYouRef) {
  console.log(`REF  · Book a Call already points at ${schedule.thankYouRef} — left alone.`);
} else {
  patch.set({
    thankYou: { _type: "reference", _ref: PAGE_ID },
  });
  console.log("REF  · Book a Call → /thank-you/default.");
}
await patch.commit();
if (old.eyebrow || old.title || old.body || old.video) {
  console.log("OLD  · confirmation field cleared off Book a Call.");
}

console.log("\nDone. Studio → Thank You Pages");
console.log("New campaign: add a page there, then link the ad to");
console.log("  /schedule-team?ty=<its route>");
