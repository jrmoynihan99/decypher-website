/**
 * One-time content migration: pushes everything that was hardcoded in
 * src/lib/content.ts + src/data/*.json into Sanity, and uploads the
 * creator/team photos + logo to the Sanity asset store.
 *
 * Idempotent — documents use deterministic _ids (createOrReplace) and
 * Sanity dedupes asset uploads by content hash, so re-running is safe.
 * NOTE: re-running OVERWRITES edits made in the Studio for these docs.
 *
 *   node scripts/migrate-to-sanity.mjs
 */
import { createClient } from "@sanity/client";
import { createReadStream, readFileSync } from "node:fs";
import { basename, join } from "node:path";

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
  return () => `k${(n++).toString(36).padStart(4, "0")}`;
})();
const withKeys = (arr) => arr.map((item) => ({ _key: key(), ...item }));
const imageRef = (assetId) => ({
  _type: "image",
  asset: { _type: "reference", _ref: assetId },
});

// ── asset uploads (concurrency-limited) ─────────────────────────────
async function uploadAll(files) {
  const out = new Map();
  const queue = [...files];
  let done = 0;
  const worker = async () => {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      const asset = await client.assets.upload("image", createReadStream(file), {
        filename: basename(file),
      });
      out.set(file, asset._id);
      done++;
      if (done % 20 === 0 || done === files.length)
        console.log(`  uploaded ${done}/${files.length}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

// ── source data ─────────────────────────────────────────────────────
const creatorsJson = JSON.parse(readFileSync("src/data/creators.json", "utf8"));
const teamJson = JSON.parse(readFileSync("src/data/team.json", "utf8"));

const SERVICES = [
  {
    order: 1,
    title: "Tax Filing + Strategy",
    promise: "PAY LESS TO THE IRS",
    body: "We understand creator deductions — and we go on offense. A proactive plan built around your channels and revenue, with live support all year so you never overpay.",
    nodeTag: "TAX_STRATEGY.NODE",
    imgLabel: "// TAX_FILING_STRATEGY.IMG",
  },
  {
    order: 2,
    title: "LLC Filing + Course",
    promise: "STRUCTURED TO SAVE",
    body: "File your business the right way — completely done for you. Then take our crash course and learn how to structure and maintain it to reduce taxes.",
    chips: ["LLC", "EIN", "BOI", "BANK"],
    nodeTag: "LLC_FILING.NODE",
    imgLabel: "// LLC_FILING_COURSE.IMG",
  },
  {
    order: 3,
    title: "Bookkeeping",
    promise: "THE KEY TO HIGHER SAVINGS",
    body: "We specialize in the creator economy. Your finances are done weekly — so you can make decisions when you need to, and capture every write-off you're owed.",
    nodeTag: "BOOKKEEPING.NODE",
    imgLabel: "// BOOKKEEPING.IMG",
  },
  {
    order: 4,
    title: "S-Corp + Payroll",
    promise: "KEEP MORE OF EVERY DOLLAR",
    body: "When the numbers say it's time, we handle the S-corp election, set a reasonable salary, and run your payroll on autopilot — so the savings actually land.",
    chips: ["ELECTION", "PAYROLL", "QUARTERLIES"],
    nodeTag: "SCORP_PAYROLL.NODE",
    imgLabel: "// SCORP_PAYROLL.IMG",
  },
  {
    order: 5,
    title: "Fractional CFO",
    promise: "A FINANCE TEAM ON SPEED DIAL",
    body: "Forecasting, brand-deal pricing, cash-flow planning — senior finance help in your corner for every decision bigger than a spreadsheet.",
    nodeTag: "FRACTIONAL_CFO.NODE",
    imgLabel: "// FRACTIONAL_CFO.IMG",
  },
];

const ACCENT_TO_PRESET = {
  "#FF2D78": "magenta",
  "#B06CFF": "violet",
  "#FF7A4D": "orange",
};

const TESTIMONIALS = {
  a: [
    {
      quote:
        "DeCypher found $23K in deductions my old CPA never even mentioned. Paid for itself in the first month.",
      name: "Maya Chen",
      handle: "@mayamakesup",
      followers: "890K followers",
      category: "Beauty",
      accent: "#FF2D78",
    },
    {
      quote:
        "First April ever that I didn't panic. S-corp set up, quarterlies on autopilot, and I actually understand my numbers now.",
      name: "Jordan Reyes",
      handle: "@jayplaysgames",
      followers: "1.2M followers",
      category: "Gaming",
      accent: "#B06CFF",
    },
    {
      quote:
        "They rebuilt two years of books in three weeks and found write-offs I didn't know existed. Weekly updates, zero chasing.",
      name: "Tasha Bell",
      handle: "@tashacooks",
      followers: "640K followers",
      category: "Food",
      accent: "#FF7A4D",
    },
  ],
  b: [
    {
      quote:
        "I went from a shoebox of 1099s to a real business. LLC, EIN, bank — done in a week. The crash course actually stuck.",
      name: "Devon Price",
      handle: "@devon.ugc",
      followers: "210K followers",
      category: "UGC",
      accent: "#FF2D78",
    },
    {
      quote:
        "My tax bill dropped $31K the first year. Same income. That's not an ad — that's just what a real strategy does.",
      name: "Liv Marsh",
      handle: "@livlifts",
      followers: "480K followers",
      category: "Fitness",
      accent: "#B06CFF",
    },
    {
      quote:
        "It feels like having a CFO in the group chat. I ask, they answer, my money moves right.",
      name: "Andre Sims",
      handle: "@simstalksmoney",
      followers: "350K followers",
      category: "Finance",
      accent: "#FF7A4D",
    },
  ],
};

const FAQS = [
  {
    question: "How often do I meet with the DeCypher team?",
    answer:
      "We have planned meetings depending on the package you choose — and every client can book one-off meetings with any member of the team about bookkeeping, taxes, or business consulting.",
  },
  {
    question: "What is the investment to work with DeCypher?",
    answer:
      "We're innovating the way accounting firms work. We have a custom investment model built for creators depending on the services you need. Book a discovery call so we can see if we can support you.",
  },
  {
    question: "Can I cancel my subscription any time?",
    answer:
      "Yes. We run a weekly model, so you can cancel whenever you'd like. No yearly contracts like old-school accountants — we want you to get weekly value.",
  },
  {
    question: "Can I get an estimate on how much I will owe in taxes?",
    answer:
      "Exact estimates are nearly impossible given the complexity of tax calculations. As a rule of thumb, we recommend putting 20% of your income away for taxes.",
  },
  {
    question: "Will I get tax strategy?",
    answer:
      "Long story short: yes. We work on a partnership model — we act as your finance team inside your creator business. Because we understand your finances, we know exactly which tax strategies work for you.",
  },
  {
    question: "Does DeCypher do financial advising?",
    answer:
      "We're not licensed to advise on stocks. We advise on tax strategies and financial vehicles that create tax savings — for example, setting up a Solo 401(k).",
  },
];

// ── documents ───────────────────────────────────────────────────────
function pageDocs() {
  const consultLabel = "Free Consultation";
  return [
    {
      _id: "homePage",
      _type: "homePage",
      title: "Home",
      slug: { current: "/" },
      seo: {},
      hero: {
        eyebrow: "[ Accounting for creators ]",
        headlineLine1: "We decrypt",
        headlineLine2: "your tax savings.",
        body: "Tax is a creator’s biggest expense. We find the strategies hiding in your numbers — so you keep more of every brand deal, sponsorship, and payout.",
        ctaLabel: consultLabel,
        secondaryCtaLabel: "See the proof",
        scrollHint: "SCROLL TO DECRYPT",
      },
      statsSection: {
        eyebrow: "[ 01 // proof of work ]",
        title: "Receipts, decrypted.",
      },
      estimatorSection: {
        eyebrow: "[ 02 // run the numbers ]",
        title: "Decrypt your tax bill.",
        sub: "A 60-second, no-login estimate of your self-employment, federal, and state taxes — plus what you could be saving. 2026 tax year, US self-employed.",
      },
      videoSection: {
        eyebrow: "[ 03 // transmission ]",
        title: "Watch the method.",
        sub: "Three minutes on how DeCypher turns creator chaos into a tax strategy that pays for itself.",
      },
      rosterSection: {
        eyebrow: "[ 04 // the roster ]",
        title: "The creators we work with.",
        sub: "// {count} records on file — browse the full database on Our Creators",
      },
      servicesSection: {
        eyebrow: "[ 05 // services ]",
        title: "One stop shop for your creator business.",
      },
      testimonialsSection: {
        eyebrow: "[ 06 // reviews ]",
        title: "Creators who cracked the code.",
        sub: "// grab and throw the reel",
      },
      faqSection: {
        eyebrow: "[ 07 // faq ]",
        title: "Questions, decrypted on demand.",
        sub: "// answers ship encrypted — open one to decrypt",
        items: withKeys(FAQS.map((f) => ({ _type: "faqItem", ...f }))),
      },
      cta: {
        title: "Ready to decrypt your savings?",
        body: "Book a free consultation. If we can’t find you savings, you’ll know in one call.",
        ctaLabel: consultLabel,
        readout: "// WEEKLY MODEL — CANCEL ANYTIME. NO YEARLY CONTRACTS.",
      },
    },
    {
      _id: "servicesPage",
      _type: "servicesPage",
      title: "Services",
      slug: { current: "services" },
      seo: {
        title: "Services — DeCypher Financials",
        description:
          "Tax strategy, LLC filing, bookkeeping, S-corp + payroll, and fractional CFO — the full stack for your creator business, on one team.",
      },
      header: {
        eyebrow: "[ services // the full stack ]",
        title: "One stop shop for your creator business.",
        sub: "Five services, one team. Every layer of your money handled by people who speak creator — from the first LLC to a CFO on speed dial.",
        readout: "// 05 MODULES LOADED — ALL SYSTEMS ONLINE",
      },
      primaryCtaLabel: consultLabel,
      secondaryCtaLabel: "Browse the stack ▼",
      cta: {
        title: "Ready to decrypt your savings?",
        body: "Book a free consultation. If we can’t find you savings, you’ll know in one call.",
        ctaLabel: consultLabel,
        readout: "// WEEKLY MODEL — CANCEL ANYTIME. NO YEARLY CONTRACTS.",
      },
    },
    {
      _id: "creatorsPage",
      _type: "creatorsPage",
      title: "Our Creators",
      slug: { current: "creators" },
      seo: {
        title: "Our Creators — DeCypher Financials",
        description:
          "From lifestyle to gaming to finance, we handle the books and the tax strategy so our creators can focus on what they do best.",
      },
      header: {
        eyebrow: "[ database // our creators ]",
        title: "The creators we keep in the black.",
        sub: "From lifestyle to gaming to finance, we handle the books and the tax strategy so our creators can focus on what they do best.",
        readout: "// DATABASE ONLINE — {count} RECORDS",
      },
      cta: {
        title: "Your name belongs in this database.",
        body: "Join 150+ creators who keep more of every brand deal, sponsorship, and payout.",
        ctaLabel: consultLabel,
        secondaryCtaLabel: "See what we do",
        secondaryCtaHref: "/services",
        readout: "// WEEKLY MODEL — CANCEL ANYTIME",
      },
    },
    {
      _id: "teamPage",
      _type: "teamPage",
      title: "Our Team",
      slug: { current: "team" },
      seo: {
        title: "Our Team — DeCypher Financials",
        description:
          "The experts who help creators build generational wealth through finance and tax strategy.",
      },
      header: {
        eyebrow: "[ personnel file // our team ]",
        title: "The team behind creator wealth.",
        sub: "The experts who help creators build generational wealth through finance and tax strategy. Each one runs a codename — the thing they’re deadliest at.",
        readout:
          "// {count} OPERATIVES · {tiers} TIERS — HOVER A CARD TO **DECRYPT** THEIR CODENAME",
      },
      tierTaglines: {
        managers: "The strategists who own your file.",
        seniors: "Deep in your numbers every single week.",
        staff: "The engine room — books, filings, follow-through.",
      },
      cta: {
        title: "Want this team in your corner?",
        body: "Every client gets the full bench — bookkeeping, tax, and strategy on one thread. No hand-offs, no black boxes.",
        ctaLabel: consultLabel,
        readout: "// ONE TEAM. EVERY SERVICE. ZERO YEARLY CONTRACTS.",
      },
    },
    {
      _id: "schedulePage",
      _type: "schedulePage",
      title: "Book a Call",
      slug: { current: "schedule" },
      seo: {
        title: "Book a Call — DeCypher Financials",
        description:
          "Book a free consultation. Twenty minutes, zero jargon — we look at your creator business and tell you exactly where the savings are hiding.",
      },
      hero: {
        eyebrow: "[ schedule // free consultation ]",
        title: "Book your decryption call.",
        body: "Twenty minutes, zero jargon. We look at your numbers, tell you exactly what we’d do, and you decide if we’re your team.",
      },
      confirmation: {
        eyebrow: "● CHANNEL OPEN",
        title: "See you in our call.",
        body: "Request received — a real human reads every transmission and replies within one business day to lock in your time.",
      },
      videoWallSection: {
        eyebrow: "[ but first ]",
        title: "Hear it from the creators.",
        sub: "// REAL CLIENTS. REAL RESULTS. TAP A VIDEO TO PLAY.",
      },
      testimonialsSection: {
        eyebrow: "[ 01 // reviews ]",
        title: "Creators who cracked the code.",
        sub: "// grab and throw the reel",
      },
      statsSection: {
        eyebrow: "[ 02 // the proof ]",
        title: "Receipts, decrypted.",
      },
    },
    {
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
        sub: "// every role is remote-first — tap a card to apply",
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
        ctaHref: "mailto:careers@wedecypher.com",
        readout: "// ATTACH A RESUME — OR JUST SEND RECEIPTS",
      },
    },
  ];
}

const JOBS = [
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
];

function settingsDoc(logoAssetId) {
  return {
    _id: "siteSettings",
    _type: "siteSettings",
    logo: logoAssetId ? imageRef(logoAssetId) : undefined,
    defaultSeo: {
      title: "DeCypher Financials — Accounting for Creators",
      description:
        "Tax is a creator's biggest expense. We find the strategies hiding in your numbers — so you keep more of every brand deal, sponsorship, and payout.",
    },
    consultCta: { label: "Free Consultation", href: "/schedule" },
    navLinks: withKeys([
      { _type: "navLink", label: "Our Creators", href: "/creators" },
      { _type: "navLink", label: "Services", href: "/services" },
      { _type: "navLink", label: "Our Team", href: "/team" },
      { _type: "navLink", label: "Client Portal ↗", href: "#" },
    ]),
    footer: {
      tagline: "ACCOUNTING FOR CREATORS",
      exploreLinks: withKeys([
        { _type: "navLink", label: "Services", href: "/services" },
        { _type: "navLink", label: "Our Creators", href: "/creators" },
        { _type: "navLink", label: "Our Team", href: "/team" },
        { _type: "navLink", label: "Book a Call", href: "/schedule" },
      ]),
      phone: "(978) 409-4901",
      address: "975 Chestnut St",
      socialLinks: withKeys([
        {
          _type: "navLink",
          label: "Instagram ↗",
          href: "https://www.instagram.com/we.decypher/",
        },
        {
          _type: "navLink",
          label: "YouTube ↗",
          href: "https://www.youtube.com/@WeDecypher",
        },
      ]),
      legalLinks: withKeys([
        { _type: "navLink", label: "Privacy Policy", href: "#" },
        { _type: "navLink", label: "Terms and Conditions", href: "#" },
      ]),
      copyright: "© 2026 DECYPHER FINANCIALS. ALL RIGHTS RESERVED.",
    },
    stats: withKeys([
      { _type: "statItem", value: "150+", label: "Creators helped" },
      { _type: "statItem", value: "$120M+", label: "Creator lifetime revenue" },
      { _type: "statItem", value: "$4.6M+", label: "Creator tax savings" },
      { _type: "statItem", value: "600+", label: "Tax strategies set" },
    ]),
    statsDisclaimer: "// placeholder figures — swap in your real numbers",
    leadEmail: {
      fromName: "DeCypher Financials",
      fromAddress: "otavio@wedecypher.co",
      replyTo: "otavio@wedecypher.co",
    },
  };
}

// ── run ─────────────────────────────────────────────────────────────
async function main() {
  console.log("uploading images…");
  const files = [
    "public/assets/decypher-mark.png",
    ...creatorsJson.map((c) => join("public", c.img)),
    ...teamJson.map((t) => join("public", t.img)),
  ];
  const assets = await uploadAll(files);

  const docs = [
    ...pageDocs(),
    settingsDoc(assets.get("public/assets/decypher-mark.png")),
    ...SERVICES.map((s) => ({
      _id: `service-${s.order}`,
      _type: "service",
      ...s,
    })),
    ...JOBS.map((j) => ({
      _id: `jobOpening-${j.order}`,
      _type: "jobOpening",
      ...j,
    })),
    ...TESTIMONIALS.a.concat(TESTIMONIALS.b).map((t, i) => ({
      _id: `testimonial-${i < 3 ? "a" : "b"}-${(i % 3) + 1}`,
      _type: "testimonial",
      ...t,
      accent: ACCENT_TO_PRESET[t.accent],
      row: i < 3 ? "a" : "b",
      order: (i % 3) + 1,
    })),
    ...creatorsJson.map((c, i) => ({
      _id: `creator-${basename(c.img, ".jpeg")}`,
      _type: "creator",
      name: c.name,
      category: c.cat,
      group: c.group,
      description: c.desc || undefined,
      links: withKeys(
        (c.links || []).map((l) => ({ platform: l.plat, url: l.url })),
      ),
      image: imageRef(assets.get(join("public", c.img))),
      order: i + 1,
    })),
    ...teamJson.map((t, i) => ({
      _id: `teamMember-${basename(t.img, ".jpeg")}`,
      _type: "teamMember",
      name: t.name,
      tag: t.tag || undefined,
      role: t.role,
      tier: t.tier,
      codename: t.codename || undefined,
      image: imageRef(assets.get(join("public", t.img))),
      order: i + 1,
    })),
  ];

  console.log(`writing ${docs.length} documents…`);
  // batches of 40 keep each transaction well under the API payload limit
  for (let i = 0; i < docs.length; i += 40) {
    const tx = client.transaction();
    for (const doc of docs.slice(i, i + 40)) tx.createOrReplace(doc);
    await tx.commit();
    console.log(`  committed ${Math.min(i + 40, docs.length)}/${docs.length}`);
  }
  console.log("done ✔");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
