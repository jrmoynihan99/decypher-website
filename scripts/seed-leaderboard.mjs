/**
 * Seed the Referral Leaderboard page document.
 *
 *   npm run leaderboard:seed
 *
 * Creates the singleton with its default copy and Justine's Instagram post as
 * the first spotlight. Idempotent: `createIfNotExists` then a patch that only
 * sets fields still missing, so re-running never overwrites edited copy.
 *
 * Spotlights are keyed by DISPLAY NAME, matched loosely (case and punctuation
 * ignored) against the name on the board. "JUSTINE" here finds "Justine" there
 * after the client renames her in the portal, and vice versa.
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

const ID = "leaderboardPage";

const DOC = {
  _id: ID,
  _type: "leaderboardPage",
  title: "Referral Leaderboard",
  header: {
    eyebrow: "[ 01 // race to hawaii ]",
    title: "Referral Leaderboard",
    sub: "Every closed referral moves you up the board. The top ten make the cut — hit 10 and you're on the plane to Hawaii.",
    readout:
      "// **$750** PER CLOSED REFERRAL · THE CREATOR YOU REFER GETS **$250** IN CREDIT",
  },
  hawaiiSection: {
    eyebrow: "[ 02 // the hawaii club ]",
    title: "Hawaii Trip Unlocked",
    sub: "Cleared 10 closed referrals. Seat booked.",
  },
  hawaiiEmpty:
    "The first creator to close 10 referrals gets the trip. The seat is still open.",
  standingsSection: {
    eyebrow: "[ 03 // standings ]",
    title: "Top 10",
    sub: "// RANKED BY CLOSED REFERRALS · UPDATED CONTINUOUSLY",
  },
  riseSection: {
    eyebrow: "[ 04 // on the rise ]",
    title: "Creators on the Rise",
    sub: "Not in the top ten yet? Find your name and see exactly how far you are from the plane.",
  },
  spotlights: [
    {
      _key: "justine",
      name: "Justine",
      postUrl: "https://www.instagram.com/p/DZm-o82RcEQ/",
      caption: "Why she sends her creator friends to DeCypher",
    },
  ],
  cta: {
    title: "Know a creator who needs this?",
    body: "Send them our way. When they close, you earn $750 and they start with $250 in credit — and your name moves up this page.",
    ctaLabel: "Book a call",
    readout: "// HAWAII UNLOCKS AT 10 CLOSED REFERRALS",
  },
};

const existing = await client.getDocument(ID).catch(() => null);

await client.createIfNotExists({ _id: ID, _type: "leaderboardPage" });

// Only fill what's missing, so re-running is safe on an edited document.
const patch = {};
for (const [key, value] of Object.entries(DOC)) {
  if (key.startsWith("_")) continue;
  if (existing && existing[key] !== undefined) continue;
  patch[key] = value;
}

if (Object.keys(patch).length) {
  await client.patch(ID).set(patch).commit();
  console.log(`Seeded ${Object.keys(patch).length} field(s): ${Object.keys(patch).join(", ")}`);
} else {
  console.log("Already seeded — nothing to fill in.");
}

console.log(`\nStudio: /studio/structure/pages;leaderboardPage`);
console.log(`Live:   /leaderboard`);
