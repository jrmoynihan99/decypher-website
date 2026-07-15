/**
 * Sets up the affiliate landing pages:
 *
 *   1. Moves the FAQ from the Home document to Site Settings, so Home and every
 *      affiliate page read one shared list.
 *   2. Seeds the UGC Foundations page — the port of the GoHighLevel funnel at
 *      wedecypher.co/ugc-foundations.
 *
 * Both steps are safe to re-run and neither clobbers Studio edits:
 *   - the FAQ move only writes if Site Settings has no questions yet, and it
 *     copies whatever is CURRENTLY on the Home doc rather than a hardcoded
 *     list, so any edits the client made in the Studio carry over intact.
 *   - the page seed is createIfNotExists. Pass --force to overwrite it (that
 *     DOES discard Studio edits to that one page).
 *
 *   node scripts/seed-affiliate.mjs [--force]
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
const key = (() => {
  let n = 0;
  return () => `k${(n++).toString(36).padStart(4, "0")}`;
})();
const withKeys = (arr) => arr.map((item) => ({ _key: key(), ...item }));

/* ─────────────────── 1. FAQ → Site Settings ─────────────────── */

async function moveFaqs() {
  const settings = await client.fetch(
    `*[_id == "siteSettings"][0]{ "faqs": faqs[]{question, answer} }`,
  );
  if (settings?.faqs?.length) {
    console.log(`FAQ  · Site Settings already has ${settings.faqs.length} — skipped.`);
    return;
  }

  const home = await client.fetch(
    `*[_id == "homePage"][0]{ "items": faqSection.items[]{question, answer} }`,
  );
  const items = home?.items ?? [];
  if (!items.length) {
    console.log("FAQ  · nothing on the Home doc to move — skipped.");
    return;
  }

  await client
    .patch("siteSettings")
    .set({ faqs: withKeys(items.map((q) => ({ _type: "faqItem", ...q }))) })
    .commit();
  console.log(`FAQ  · moved ${items.length} questions to Site Settings.`);
}

/* ─────────────────── 2. UGC Foundations page ─────────────────── */

const UGC = {
  _id: "affiliate-ugc-foundations",
  _type: "affiliatePage",
  partnerName: "UGC Foundations",
  slug: { _type: "slug", current: "ugc-foundations" },
  seo: {
    _type: "seoBlock",
    title: "Your Free Tax Strategy Call — Included with UGC Foundations VIP",
    description:
      "UGC Foundations VIP members get a complimentary tax strategy consultation with DeCypher Financials — the tax and bookkeeping team built for content creators.",
  },
  hero: {
    badge: "Included with your VIP membership",
    headlineLine1: "Your free tax strategy call.",
    headlineLine2: "Already paid for.",
    body: "As a UGC Foundations VIP member, you get a complimentary consultation with DeCypher Financials — the tax and bookkeeping team built specifically for content creators. We'll tell you exactly what to do to improve your financial situation, grow your business, and reduce your biggest expense: taxes.",
    ctaLabel: "Book your free call",
    ctaNote: "Takes 30 seconds to book.",
    quote: {
      text: "You were the only one who said: let's actually look at your specific numbers, your business, your income streams.",
      attribution: "Baotran Tran — UGC Foundations",
    },
  },
  valueStack: {
    eyebrow: "[ 01 // itemized ]",
    title: "Your VIP onboarding, priced out.",
    items: withKeys([
      {
        label: "Tax Strategy Consultation",
        sublabel: "1:1 call with a DeCypher tax strategist",
        price: "$500.00",
      },
      {
        label: "Creator Write-Off Masterclass",
        sublabel: "Custom video, built for this community",
        price: "$297.00",
      },
      {
        label: "Personalized Action Plan",
        sublabel: "Your exact next steps, mapped on the call",
        price: "$150.00",
      },
    ]),
    subtotal: "$947.00",
    totalLabel: "Total due — VIP members",
    totalValue: "$0.00",
    footnote: "Covered in full as part of your VIP membership onboarding.",
  },
  partnerQuotes: {
    eyebrow: "[ 04 // in her words ]",
    title: "Why Tran sends her VIPs to DeCypher.",
    quotes: withKeys([
      {
        quote:
          "I was really impressed with the tax mock-up on our first call. Nobody else even offered it.",
        attribution: "Baotran Tran — UGC Foundations",
      },
      {
        quote:
          "It feels personalized — like you're actually looking at my life as a whole. Not just “here's your P&L, okay, bye.”",
      },
      {
        quote:
          "More personal, more intimate, more timely and punctual. And in general, just better.",
      },
    ]),
  },
};

async function seedPage() {
  if (force) {
    await client.createOrReplace(UGC);
    console.log("PAGE · /ugc-foundations replaced (--force).");
    return;
  }
  const res = await client.createIfNotExists(UGC);
  console.log(
    res._createdAt && Date.now() - Date.parse(res._createdAt) < 10_000
      ? "PAGE · /ugc-foundations created."
      : "PAGE · /ugc-foundations already exists — left alone (use --force to replace).",
  );
}

await moveFaqs();
await seedPage();
console.log("\nDone. Studio → Affiliate Pages → UGC Foundations");
