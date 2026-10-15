/**
 * Adds a PDF to the staff Tools Hub's resource library — the same thing as
 * uploading it in the Studio under Portal Resources, from the command line.
 *
 *   npm run resources:add -- <file.pdf> --category "Phone numbers" [options]
 *
 *   --title "…"                 the card's name (default: the file name, tidied)
 *   --description "…"           what's in it and when to reach for it
 *   --category-description "…"  one line under the category heading, used only
 *                               when the category is created here
 *   --order N                   position within the category (default: last)
 *
 * The category is matched by title, case-insensitively, and created when
 * missing. Additive, like the other seed scripts: a resource that already
 * exists (same title in the same category) is left alone, so re-running
 * never clobbers a Studio edit — delete it in the Studio first to replace it.
 *
 * Needs SANITY_API_WRITE_TOKEN in .env.local. And mind the trust boundary:
 * the dataset is public-read, so nothing with a client's data, a password or
 * a key belongs here.
 */
import { createClient } from "@sanity/client";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

// ── env (.env.local, no dotenv dep) ─────────────────────────────────
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

// ── args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) opts[a.slice(2)] = argv[++i] ?? "";
  else positional.push(a);
}
const file = positional[0];
if (!file || !opts.category) {
  console.error('Usage: npm run resources:add -- <file.pdf> --category "Name" [--title "…"] [--description "…"] [--category-description "…"] [--order N]');
  process.exit(1);
}
let size;
try {
  size = statSync(file).size;
} catch {
  console.error(`Can't read ${file}`);
  process.exit(1);
}
if (extname(file).toLowerCase() !== ".pdf") {
  console.error("Only PDFs go in the library.");
  process.exit(1);
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "x";
const tidy = (s) => s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

const categoryTitle = opts.category.trim();
const title = (opts.title ?? "").trim() || tidy(basename(file, extname(file)));
const description = (opts.description ?? "").trim();

const client = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  token: env.SANITY_API_WRITE_TOKEN,
  apiVersion: "2024-01-01",
  useCdn: false,
});

// ── the category ────────────────────────────────────────────────────
let category = await client.fetch(`*[_type == "resourceCategory" && lower(title) == $t][0]{ _id, title }`, {
  t: categoryTitle.toLowerCase(),
});
if (!category) {
  const last = await client.fetch(`*[_type == "resourceCategory"] | order(order desc)[0].order`);
  const doc = {
    _id: `resourceCategory-${slug(categoryTitle)}`,
    _type: "resourceCategory",
    title: categoryTitle,
    description: (opts["category-description"] ?? "").trim() || undefined,
    order: typeof last === "number" ? last + 1 : 1,
  };
  category = await client.createIfNotExists(doc);
  console.log(`Created category "${category.title}" (${category._id})`);
} else {
  console.log(`Using category "${category.title}" (${category._id})`);
}

// ── the resource ────────────────────────────────────────────────────
const existing = await client.fetch(
  `*[_type == "resource" && lower(title) == $t && category._ref == $c][0]{ _id }`,
  { t: title.toLowerCase(), c: category._id },
);
if (existing) {
  console.log(`"${title}" is already in ${category.title} (${existing._id}) — nothing uploaded. Delete it in the Studio to replace it.`);
  process.exit(0);
}

console.log(`Uploading ${basename(file)} (${Math.round(size / 1000)} KB)…`);
const asset = await client.assets.upload("file", createReadStream(file), {
  filename: basename(file),
  contentType: "application/pdf",
});

let order = opts.order !== undefined ? Number(opts.order) : NaN;
if (!Number.isFinite(order)) {
  const last = await client.fetch(`*[_type == "resource" && category._ref == $c] | order(order desc)[0].order`, { c: category._id });
  order = typeof last === "number" ? last + 1 : 1;
}

const resource = await client.create({
  _type: "resource",
  title,
  description: description || undefined,
  order,
  category: { _type: "reference", _ref: category._id },
  file: { _type: "file", asset: { _type: "reference", _ref: asset._id } },
});

console.log(`Added "${resource.title}" to ${category.title} (${resource._id})`);
console.log(`File: ${asset.url}`);
console.log("It's on the Tools Hub now; edit it in the Studio under Portal Resources → Resources.");
