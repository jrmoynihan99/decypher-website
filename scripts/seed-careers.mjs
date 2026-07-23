/**
 * Additive seed for the Careers page + Book-a-Call thank-you copy.
 *
 * Unlike migrate-to-sanity.mjs (createOrReplace — overwrites Studio edits),
 * this script only ADDS: new documents use createIfNotExists and the
 * schedulePage gets its `confirmation` object via setIfMissing. Safe to
 * re-run any time; it never touches content that already exists.
 *
 *   node scripts/seed-careers.mjs
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

const key = (() => {
  let n = 0;
  return () => `careers${(n++).toString(36).padStart(3, "0")}`;
})();
const withKeys = (arr) => arr.map((item) => ({ _key: key(), ...item }));

// ── documents ───────────────────────────────────────────────────────

const CAREERS_EMAIL = "careers@wedecypher.com";

const careersPage = {
  _id: "careersPage",
  _type: "careersPage",
  title: "Careers",
  slug: { current: "careers" },
  seo: {
    title: "Careers — DeCypher Financials",
    description:
      "Join the remote-first team rewriting how creators handle money — tax strategy, bookkeeping, and CFO services for the creator economy.",
  },
  header: {
    eyebrow: "[ recruitment // join the team ]",
    title: "Build the firm creators trust.",
    sub: "We’re a remote-first crew of accountants, strategists, and builders rewriting how the creator economy handles money. If you want your work to actually ship, keep scrolling.",
    readout: "// {count} POSITIONS OPEN — APPLICATIONS REVIEWED WEEKLY",
  },
  openingsSection: {
    eyebrow: "[ 01 // open roles ]",
    title: "Open roles",
    sub: "// every role is remote-first — tap a card for the full brief",
  },
  noOpenings:
    "No open roles right now — but sharp people always get a reply. Pitch us below and tell us what you’re deadliest at.",
  whySection: {
    eyebrow: "[ 02 // why decypher ]",
    title: "Why you’ll want in.",
  },
  perks: withKeys([
    {
      tag: "REMOTE_FIRST.ENV",
      title: "Work from anywhere",
      body: "We hire for output, not hours in a chair. Async by default, cameras optional, results non-negotiable.",
    },
    {
      tag: "CREATOR_ECONOMY.NET",
      title: "The most interesting clients in tax",
      body: "Streamers, podcasters, million-follower founders — no two files look alike, and the strategies actually matter.",
    },
    {
      tag: "WEEKLY_MODEL.LOOP",
      title: "No busy-season martyrdom",
      body: "Our weekly cadence spreads the work across the year. April is just a month here.",
    },
    {
      tag: "LEVEL_UP.PATH",
      title: "Growth on the record",
      body: "Clear tiers, real ownership, and a team that teaches. Your codename is earned.",
    },
  ]),
  cta: {
    title: "Don’t see your role?",
    body: "We build seats for the right people. Tell us what you’re deadliest at and how you’d make our creators richer.",
    ctaLabel: "Pitch us your role",
    ctaHref: `mailto:${CAREERS_EMAIL}`,
    readout: "// ATTACH A RESUME — OR JUST SEND RECEIPTS",
  },
};

const jobs = [
  {
    order: 1,
    title: "Senior Tax Accountant",
    department: "Tax",
    location: "Remote — US",
    type: "Full-time",
    comp: "$85k–$110k",
    blurb:
      "Own a book of creator clients end to end — returns, quarterlies, and the strategy calls that save them five figures. CPA or EA preferred; creator-economy curiosity required.",
    tags: ["1040", "1120-S", "STRATEGY"],
  },
  {
    order: 2,
    title: "Staff Bookkeeper",
    department: "Bookkeeping",
    location: "Remote — US",
    type: "Full-time",
    comp: "$55k–$70k",
    blurb:
      "Keep creator books clean on a weekly cadence — categorization, reconciliation, and the write-off hunts our clients brag about.",
    tags: ["QBO", "RECONCILIATION", "WEEKLY_CLOSE"],
  },
  {
    order: 3,
    title: "Client Success Manager",
    department: "Operations",
    location: "Remote — US",
    type: "Full-time",
    comp: "$60k–$80k",
    blurb:
      "Be the voice in the group chat. Onboard new creators, run the check-in cadence, and make sure nothing sits unanswered past a business day.",
    tags: ["ONBOARDING", "CREATOR_COMMS"],
  },
].map((j) => ({
  _id: `jobOpening-${j.order}`,
  _type: "jobOpening",
  ...j,
  slug: { _type: "slug", current: slugify(j.title) },
  description: JOB_DESCRIPTIONS[j.title],
}));

const scheduleConfirmation = {
  eyebrow: "● CHANNEL OPEN",
  title: "Transmission received.",
  body: "Your request is in the queue. A real human reads every transmission and replies within one business day to lock in your time.",
  nextSteps: withKeys([
    {
      title: "We review your file",
      body: "Your channel, revenue, and asks — before we ever reply.",
    },
    {
      title: "You pick a time",
      body: "We send a booking link with slots that fit your schedule.",
    },
    {
      title: "We decrypt the savings",
      body: "Twenty minutes, zero jargon — and you keep the plan either way.",
    },
  ]),
  readout: "// AVG RESPONSE TIME < 24 HOURS — WATCH YOUR INBOX",
};

// ── run ─────────────────────────────────────────────────────────────
async function main() {
  const tx = client.transaction();
  tx.createIfNotExists(careersPage);
  for (const job of jobs) tx.createIfNotExists(job);
  tx.patch("schedulePage", (p) =>
    p.setIfMissing({ confirmation: scheduleConfirmation }),
  );
  await tx.commit();
  console.log(
    `seeded: careersPage + ${jobs.length} openings (createIfNotExists), schedulePage.confirmation (setIfMissing) ✔`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
