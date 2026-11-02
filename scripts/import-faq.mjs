/**
 * One-time import of the Creator Tax FAQ into Sanity, from the "FAQ answers"
 * tab of the FAQ doc Acquisition.com's team wrote (downloaded as Markdown).
 * After the import, the FAQ is edited in Studio (sidebar → Creator Tax FAQ);
 * this script isn't part of the editing loop.
 *
 *   npm run faq:import -- path/to/faq-answers.md --dry        (check, write nothing)
 *   npm run faq:import -- path/to/faq-answers.md              (additive)
 *   npm run faq:import -- path/to/faq-answers.md --overwrite  (replace)
 *
 * Additive by default, like seed-careers.mjs: questions and categories use
 * createIfNotExists, so a re-run never clobbers a Studio edit. --overwrite
 * replaces every question in the export with the doc's version and resets the
 * Home picks and "Where are you?" rows — for re-importing over a test import,
 * not for after people have started editing in Studio.
 *
 * --allow-missing imports a partial export (the 3-question sample in
 * scripts/fixtures/faq-answers.sample.md); without it, a question in
 * scripts/data/faq-meta.json that's missing from the export is an error.
 *
 * What's published from each answer: the question, short answer, body,
 * related questions and next step. Never the "Source:" line or anything after
 * it — that's internal.
 */
import { createClient } from "@sanity/client";
import { markdownToPortableText } from "@portabletext/markdown";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const file = args.find((a) => !a.startsWith("--"));
const DRY = flag("--dry");
const OVERWRITE = flag("--overwrite");
const ALLOW_MISSING = flag("--allow-missing");

if (!file) {
  console.error("Usage: npm run faq:import -- <faq-answers.md> [--dry] [--overwrite] [--allow-missing]");
  process.exit(1);
}
// npm runs scripts from the repo root; INIT_CWD is where the command was typed.
const inputPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
if (!existsSync(inputPath)) {
  console.error(`Can't find ${inputPath}`);
  process.exit(1);
}

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

const meta = JSON.parse(readFileSync("scripts/data/faq-meta.json", "utf8"));

const key = (() => {
  let n = 0;
  const run = Date.now().toString(36).slice(-4);
  return () => `faq${run}${(n++).toString(36).padStart(4, "0")}`;
})();

// ── launch copy for the FAQ Page and Site Settings (from the package's config) ──

const HOME_PICKS = [
  "who-does-decypher-financials-work-with",
  "how-much-does-a-content-creator-accountant-cost",
  "how-much-can-a-tax-strategist-save-a-creator",
  "should-a-content-creator-be-an-s-corp",
  "how-much-to-set-aside-for-taxes-per-brand-deal",
  "what-can-i-write-off-as-a-content-creator",
  "can-a-new-accountant-take-over-mid-year",
  "can-i-cancel-my-creator-accounting-plan",
];

const WHERE_ARE_YOU = [
  ["I just went full-time and have no system", "do-i-need-bookkeeping-or-just-a-tax-preparer"],
  ["I got a tax bill I wasn't ready for", "i-owe-the-irs-can-you-help-with-a-payment-plan"],
  ["I have an S-Corp, or think I need one", "should-a-content-creator-be-an-s-corp"],
  ["My CPA went quiet or doesn't get creator income", "can-a-new-accountant-take-over-mid-year"],
  ["I moved states or work abroad", "i-moved-states-do-i-owe-tax-in-two-states"],
  ["I'm comparing creator accountants", "how-much-does-a-content-creator-accountant-cost"],
];

const faqPage = {
  _id: "faqPage",
  _type: "faqPage",
  eyebrow: "[ creator tax faq ]",
  title: "Creator Tax FAQ: Answers for Full-Time Content Creators",
  intro: [
    "These are the questions creators ask us on real calls, answered the way we answer them on those calls.",
    "Start with the situation that sounds like you, or jump to any question below.",
  ],
  author: { name: "Otavio Mayole", jobTitle: "Co-founder" },
  generalNote: "These are general answers. Every creator's situation is different.",
  cta: {
    booking: {
      prompt: "Full-time creator? Book a free consultation and see what you could be saving.",
      button: "Book a free consultation",
    },
    masterClass: {
      prompt: "Want the full list of what creators can write off?",
      button: "Watch the free Write Off Master Class",
    },
    estimator: {
      prompt: "Want a number for your own year? The estimator takes 60 seconds, no login.",
      button: "Try the tax estimator",
    },
  },
  disclaimer:
    "These answers are general information, not tax or legal advice, and not guarantees. Every creator's situation is different.",
  footerLine:
    "This answer is part of the DeCypher Financials Creator Tax FAQ, a collection of the questions our clients ask us most.",
  seo: {
    title: "Creator Tax FAQ | DeCypher Financials",
    description:
      "Real tax questions from full-time content creators, answered by the DeCypher Financials team: S-Corps, write-offs, quarterly taxes, pricing and more.",
  },
};

// ── parse the export ────────────────────────────────────────────────

const errors = [];
const warnings = [];

// Markdown exporters escape punctuation (\(, \., \-). Undo that for parsing.
const unescape = (s) => s.replace(/\\([\\`*_{}\[\]()#+\-.!|>~<"'$])/g, "$1");
const stripEmphasis = (s) => s.replace(/^[*_]{1,3}|[*_]{1,3}$/g, "").trim();

// Google Docs ends some lines with an escaped space (&#32;); drop it.
const lines = readFileSync(inputPath, "utf8")
  .replace(/\r\n?/g, "\n")
  .replace(/\u00a0/g, " ")
  .split("\n")
  .map((l) => l.replace(/(?:\s*&#32;)+\s*$/, ""));

// Reviewer flags ("[Attorney review]") are notes to the team, not answer text.
const REVIEW_FLAG = /\s*\\?\[[A-Za-z]+ review\\?\]/g;

const HEADING = /^#{1,6}\s+(?:[*_]{1,2})?Q:\s*(.+?)\s*\((F\d{2,3})\)\s*(?:[*_]{1,2})?\s*$/;
const label = (name) => new RegExp(`^\\s*(?:[*_]{1,2})?${name}:(?:[*_]{1,2})?\\s*(.*)$`, "i");
const SHORT = label("Short answer");
const RELATED = label("Related");
const NEXT = label("Next step");
const SOURCE = label("Source");

const sections = [];
const flagged = new Set();
let current = null;
for (const line of lines) {
  const m = unescape(line).match(HEADING);
  if (m) {
    current = { question: stripEmphasis(m[1]).trim(), id: m[2], lines: [] };
    sections.push(current);
  } else if (current) {
    if (/^#{1,2}\s+/.test(line)) {
      // A non-question top-level heading ends the current answer. Say so: if it
      // was meant to sit inside the answer, everything under it is dropped.
      warnings.push(`${current.id} ends at the heading "${line.trim()}". Anything under it isn't imported.`);
      current = null;
    } else {
      const unflagged = line.replace(REVIEW_FLAG, "");
      if (unflagged !== line) flagged.add(current.id);
      current.lines.push(unflagged);
    }
  }
}
for (const id of flagged) {
  warnings.push(`${id} is flagged for review in the doc. Flag removed from the text; get the review before it goes live.`);
}

function nextStepFor(id, text) {
  if (!text || /book|consult|call/i.test(text)) return "booking";
  if (/master\s*class/i.test(text)) return "masterClass";
  if (/estimat/i.test(text)) return "estimator";
  warnings.push(`${id} next step "${text}" isn't a known destination. Set to booking.`);
  return "booking";
}

const plain = (blocks) =>
  (blocks ?? []).map((b) => (b.children ?? []).map((c) => c.text ?? "").join("")).join(" ").trim();

/** Links to our own domain become site paths, so they stay in-app (and work on previews). */
const localize = (href) => href.replace(/^https?:\/\/(?:www\.)?wedecypher\.co(?=[/?#]|$)/i, "") || "/";

/** Markdown body → Portable Text in the faqQuestion.body shape. */
function toBody(md) {
  const blocks = markdownToPortableText(md, {
    keyGenerator: key,
    types: {
      // @sanity/table holds plain-text cells; the first row renders as the header.
      table: ({ value }) => ({
        _type: "table",
        _key: key(),
        rows: value.rows.map((row) => ({
          _type: "tableRow",
          _key: key(),
          cells: row.cells.map((cell) => plain(cell.value)),
        })),
      }),
    },
  });
  return blocks
    .filter((b) => b._type === "block" || b._type === "table")
    .map((b) => {
      if (b._type !== "block") return b;
      // the schema offers h2–h4: the question is the page's h1
      const style = b.style === "h1" ? "h2" : b.style === "h5" || b.style === "h6" ? "h4" : b.style;
      const markDefs = (b.markDefs ?? []).map((d) => (d._type === "link" ? { ...d, href: localize(d.href) } : d));
      return { ...b, style, markDefs };
    });
}

const parsed = new Map();
for (const s of sections) {
  let shortAnswer = "";
  let related = [];
  let nextStep = "";
  const body = [];
  let seenShort = false;
  let stop = false;

  for (const line of s.lines) {
    const u = unescape(line);
    if (stop) continue;
    let m;
    if (!seenShort && (m = u.match(SHORT))) {
      shortAnswer = m[1].trim();
      seenShort = true;
      continue;
    }
    if ((m = u.match(RELATED))) {
      related = m[1].split(/\s*[·•|,]\s*/).map((x) => x.replace(/[`*_]/g, "").trim()).filter(Boolean);
      continue;
    }
    if ((m = u.match(NEXT))) {
      nextStep = m[1].trim();
      continue;
    }
    if (u.match(SOURCE)) {
      stop = true; // Source and anything after it is internal; never imported.
      continue;
    }
    if (seenShort) body.push(line);
  }

  if (parsed.has(s.id)) errors.push(`${s.id} appears twice in the export.`);
  if (!shortAnswer) errors.push(`${s.id} has no "Short answer:" line.`);
  const bodyMd = body.join("\n").trim();
  if (!bodyMd) warnings.push(`${s.id} has a short answer but no body.`);
  const words = shortAnswer.split(/\s+/).filter(Boolean).length;
  if (words > 60) warnings.push(`${s.id} short answer is ${words} words (aim for under 50).`);

  parsed.set(s.id, {
    question: s.question,
    shortAnswer: unescape(shortAnswer),
    body: bodyMd ? toBody(bodyMd) : [],
    related,
    nextStep: nextStepFor(s.id, nextStep),
  });
}

const metaById = new Map(meta.questions.map((q) => [q.id, q]));
const idBySlug = new Map(meta.questions.map((q) => [q.slug, q.id]));
for (const q of meta.questions) {
  if (!parsed.has(q.id)) {
    (ALLOW_MISSING ? warnings : errors).push(`${q.id} (${q.slug}) is in faq-meta.json but not in the export.`);
  }
}
for (const id of parsed.keys()) {
  if (!metaById.has(id)) errors.push(`${id} is in the export but not in faq-meta.json. Add its slug and category there.`);
}

warnings.forEach((w) => console.warn("warning:", w));
const printedWarnings = warnings.length;
if (errors.length) {
  errors.forEach((e) => console.error("error:", e));
  console.error(`\n${errors.length} error(s). Nothing was written.`);
  process.exit(1);
}

// ── build the documents ─────────────────────────────────────────────

const anchor = (title) =>
  title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const categoryId = (title) => `faqCategory-${anchor(title)}`;
const questionId = (id) => `faqQuestion-${id}`;
const ref = (_ref) => ({ _type: "reference", _ref, _key: key() });

const categories = meta.categories.map((title, i) => ({
  _id: categoryId(title),
  _type: "faqCategory",
  title,
  order: i + 1,
}));

const questions = [...parsed.entries()].map(([id, p]) => {
  const m = metaById.get(id);
  return {
    _id: questionId(id),
    _type: "faqQuestion",
    question: p.question,
    slug: { _type: "slug", current: m.slug },
    category: { _type: "reference", _ref: categoryId(m.category) },
    order: m.order,
    shortAnswer: p.shortAnswer,
    body: p.body,
    nextStep: p.nextStep,
  };
});

// Related links only to questions that will exist, or the reference fails.
const existing = new Set(await client.fetch(`*[_type == "faqQuestion" && !(_id in path("drafts.**"))]._id`));
questions.forEach((q) => existing.add(q._id));
const refFor = (slug, from) => {
  const id = idBySlug.get(slug);
  if (!id) {
    warnings.push(`${from} links to "${slug}", which isn't a known slug. Dropped.`);
    return null;
  }
  return existing.has(questionId(id)) ? questionId(id) : null;
};

const relatedById = new Map(
  [...parsed.entries()].map(([id, p]) => [
    questionId(id),
    p.related.filter((s) => s !== metaById.get(id).slug).map((s) => refFor(s, id)).filter(Boolean),
  ]),
);
const homePicks = HOME_PICKS.map((s) => refFor(s, "Home picks")).filter(Boolean);
const whereRows = WHERE_ARE_YOU.map(([situation, slug]) => [situation, refFor(slug, "Where are you?")])
  .filter(([, id]) => id)
  .map(([situation, id]) => ({ _type: "faqWhereRow", _key: key(), situation, question: { _type: "reference", _ref: id } }));

warnings.slice(printedWarnings).forEach((w) => console.warn("warning:", w));
console.log(
  `${questions.length} questions, ${categories.length} categories; ${homePicks.length}/${HOME_PICKS.length} Home picks, ${whereRows.length}/${WHERE_ARE_YOU.length} "Where are you?" rows${OVERWRITE ? " (overwrite)" : ""}.`,
);
const tables = questions.reduce((n, q) => n + q.body.filter((b) => b._type === "table").length, 0);
console.log(`${tables} table(s) converted.`);

if (DRY) {
  console.log("\n--dry: nothing written. First question as it would be stored:\n");
  console.log(JSON.stringify(questions[0], null, 2).slice(0, 2500));
  process.exit(0);
}

// ── write ───────────────────────────────────────────────────────────

// Pass 1: categories, questions (no related yet), the FAQ Page.
const tx = client.transaction();
categories.forEach((c) => tx.createIfNotExists(c));
questions.forEach((q) => (OVERWRITE ? tx.createOrReplace(q) : tx.createIfNotExists(q)));
tx.createIfNotExists(faqPage);
await tx.commit();

// Pass 2: the cross-links, now that every target exists. Additive runs only
// fill what's empty; --overwrite resets them.
const tx2 = client.transaction();
for (const [id, related] of relatedById) {
  if (!related.length) continue;
  const value = related.map(ref);
  tx2.patch(id, (p) => (OVERWRITE ? p.set({ related: value }) : p.setIfMissing({ related: value })));
}
if (whereRows.length) {
  tx2.patch("faqPage", (p) => (OVERWRITE ? p.set({ whereAreYou: whereRows }) : p.setIfMissing({ whereAreYou: whereRows })));
}
if (homePicks.length) {
  const picks = homePicks.map(ref);
  tx2.patch("siteSettings", (p) => (OVERWRITE ? p.set({ featuredFaqs: picks }) : p.setIfMissing({ featuredFaqs: picks })));
}
await tx2.commit();

console.log("Imported. Edit in Studio: sidebar → Creator Tax FAQ.");
