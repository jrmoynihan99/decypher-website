/**
 * Prove the Tax Recap redaction against real prints, before a change ships.
 *
 *   npm run recap:redact-check -- <pdf-or-folder>... [--render <out-dir>] [--all-pages]
 *
 * Runs the builder's own redaction (lib/tax-recap/redact.ts, the same code
 * the browser runs) on each PDF and audits what would leave against an
 * independent oracle:
 *
 *  - the client's names, from the file's own name — the firm names exports
 *    "<client> - <year> 1040 INDIVIDUAL TAX RETURN.pdf", so the words before
 *    the dash are the people (or the business) the return is about;
 *  - every SSN printed in full anywhere in the print, by pattern.
 *
 * A leak is a run on a page that would be sent, NOT covered by a paint box,
 * that carries one of those names, or a line whose unpainted digits still
 * spell an SSN, its first five, or carry a pattern. Prints the builder would
 * refuse to send (a scan, a text layer scrambled throughout) are reported as
 * blocked, which is the right answer for them.
 *
 * `--render` writes each sent page as it would leave (JPEG, boxes painted,
 * images painted) for a look by eye. The PDFs are client returns: keep them
 * and the renders out of the repo.
 *
 * Runs on plain Node (24+) with `--import ./scripts/lib/resolve-ts.mjs`.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createRequire } from "node:module";
import {
  PATTERNS,
  imageBoxes,
  inBox,
  learnIdentity,
  pageFromTextContent,
  redactPage,
} from "../src/lib/tax-recap/redact.ts";
import { detectReturnKind, isGarbledText, selectPages, textLayerUnusable } from "../src/lib/tax-recap/pages.ts";

const require = createRequire(import.meta.url);
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { OPS } = pdfjs;

const args = process.argv.slice(2);
const renderAt = args.includes("--render") ? args[args.indexOf("--render") + 1] : null;
const allPages = args.includes("--all-pages");
const inputs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--render");
if (!inputs.length) {
  console.error("usage: npm run recap:redact-check -- <pdf-or-folder>... [--render <out-dir>] [--all-pages]");
  process.exit(2);
}

/** Each file with its drop group: files found in one folder are dropped together, sharing tokens the way the builder shares them. */
const files = [];
for (const input of inputs) {
  if (statSync(input).isDirectory()) {
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (name.startsWith("__MACOSX")) continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.pdf$/i.test(name)) files.push({ path: p, group: dir });
      }
    };
    walk(input);
  } else files.push({ path: input, group: input });
}

const OP_CODES = {
  save: OPS.save,
  restore: OPS.restore,
  transform: OPS.transform,
  paintFormXObjectBegin: OPS.paintFormXObjectBegin,
  paintFormXObjectEnd: OPS.paintFormXObjectEnd,
  images: [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat].filter((x) => x !== undefined),
};

/** Names the file says the return is about: the words before " - " (or before the year). */
function oracleNames(file) {
  const stem = basename(file).replace(/\.pdf$/i, "");
  const head = stem.split(/ - |\s(?=20\d\d\b)|\(/)[0];
  const skip = new Set(["AND", "LLC", "INC", "THE", "TAX", "RETURN", "RETURNS", "FINAL", "AMENDED", "INDIVIDUAL", "SCORP", "CORP", "FORM", "FOR", "JASON", "OUTPUT", "NEW", "ZERO", "WRITEOFFS"]);
  return [...new Set(head.toUpperCase().split(/[^A-Z']+/).map((w) => w.replace(/'/g, "")).filter((w) => w.length >= 3 && !skip.has(w)))];
}

const covered = (r, boxes) => boxes.some((b) => inBox(r, b));
const digitsOf = (s) => s.replace(/\D/g, "");

// First pass: open every file and learn its identity, so files dropped
// together can share their tokens as they do in the builder.
const loaded = [];
for (const { path: file, group } of files) {
  const bytes = new Uint8Array(readFileSync(file));
  const task = pdfjs.getDocument({ data: bytes, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    console.log(`?? ${basename(file)}: pdfjs couldn't open it`);
    continue;
  }
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    pages.push(pageFromTextContent(await page.getTextContent(), vp.width, vp.height));
  }
  const texts = pages.map((p) => p.text);
  const chars = texts.reduce((s, t) => s + t.trim().length, 0);
  const unsendable = chars < 2000 ? "no text layer (a scan)" : textLayerUnusable(texts) ? "text layer scrambled on every page" : null;
  loaded.push({ file, group, task, doc, pages, texts, unsendable, id: unsendable ? null : learnIdentity(pages) });
}
const groupTokens = new Map();
for (const f of loaded) {
  if (!f.id) continue;
  const g = groupTokens.get(f.group) ?? { tokens: new Set(), short: new Set() };
  for (const t of f.id.tokens) g.tokens.add(t);
  for (const t of f.id.shortTokens) g.short.add(t);
  groupTokens.set(f.group, g);
}

let totalLeaks = 0;
let blocked = 0;
for (const { file, group, task, doc, pages, texts, unsendable, id } of loaded) {
  const label = `${basename(file).slice(0, 70)} (${pages.length}p)`;
  if (unsendable) {
    blocked++;
    console.log(`BLOCKED  ${label}: ${unsendable} — the builder asks for a ProSeries export`);
    await task.destroy();
    continue;
  }
  const shared = groupTokens.get(group);
  const tokens = [...new Set([...id.tokens, ...shared.tokens])];
  const shortTokens = [...new Set([...id.shortTokens, ...shared.short])];
  const kind = detectReturnKind(texts, basename(file)) ?? "individual";
  const sel = selectPages(texts, kind, id.valueCounts, id.filledCounts);
  const send = allPages || sel.fallback ? pages.map((_, i) => i + 1) : sel.pages;

  // The oracle's SSNs: every one printed in full anywhere in the print.
  const ssns = new Set();
  for (const t of texts) for (const m of t.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) ssns.add(digitsOf(m[0]));
  const names = oracleNames(file);

  const leaks = [];
  let boxCount = 0;
  let imageCount = 0;
  for (const p of send) {
    const page = pages[p - 1];
    const r = redactPage(page, {
      tokens,
      shortTokens,
      bands: id.bands.get(p) ?? [],
      garbled: isGarbledText(page.text),
      dataFonts: id.dataFonts,
      knownIds: id.knownIds,
    });
    const pdfPage = await doc.getPage(p);
    const imgs = imageBoxes(await pdfPage.getOperatorList(), OP_CODES, page.width * page.height);
    imageCount += imgs.length;
    const boxes = [...r.boxes, ...imgs];
    boxCount += boxes.length;

    const open = page.runs.filter((run) => !covered(run, boxes));
    for (const run of open) {
      const words = run.str.toUpperCase().split(/[^A-Z']+/).map((w) => w.replace(/'/g, ""));
      const hit = names.find((n) => words.includes(n));
      if (hit) leaks.push(`p${p} name ${hit}: ${JSON.stringify(run.str.slice(0, 60))}`);
      if (PATTERNS.slice(0, 4).some((re) => re.test(run.str))) leaks.push(`p${p} pattern: ${JSON.stringify(run.str.slice(0, 40))}`);
    }
    // Unpainted digits along each line, left to right: an SSN can't survive split across boxes.
    const lines = new Map();
    for (const run of open) {
      if (!/\d/.test(run.str)) continue;
      const k = Math.round(run.y / 3);
      lines.set(k, [...(lines.get(k) ?? []), run]);
    }
    for (const line of lines.values()) {
      line.sort((a, b) => a.x - b.x);
      const stream = line.map((run) => digitsOf(run.str)).join("");
      for (const s of ssns) {
        if (stream.includes(s)) leaks.push(`p${p} SSN in full across runs`);
        // The first five as two neighbouring fields ("231" "97"), the last four elsewhere.
        for (let i = 0; i + 1 < line.length; i++) {
          if (/^\d{3}$/.test(line[i].str.trim()) && /^\d{2}$/.test(line[i + 1].str.trim()) && digitsOf(line[i].str + line[i + 1].str) === s.slice(0, 5)) {
            leaks.push(`p${p} SSN first five across runs`);
          }
        }
      }
    }

    if (renderAt) {
      const { createCanvas } = require("@napi-rs/canvas");
      const vp = pdfPage.getViewport({ scale: 1.4 });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      ctx.fillStyle = "#000";
      for (const b of boxes) {
        const [x0, y0] = vp.convertToViewportPoint(b.x, b.y + b.h);
        const [x1, y1] = vp.convertToViewportPoint(b.x + b.w, b.y);
        ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }
      const dir = join(renderAt, basename(file).replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9 _-]+/g, "").slice(0, 60));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `p${String(p).padStart(2, "0")}.jpg`), canvas.toBuffer("image/jpeg", 78));
    }
  }
  totalLeaks += leaks.length;
  const unique = [...new Set(leaks)];
  console.log(
    `${unique.length ? "LEAK    " : "ok      "} ${label}: ${kind}, sends ${send.length}${sel.fallback ? ` (${sel.fallback})` : ""}, name ${id.name ? "found" : "NOT found"}, ${id.tokens.length} tokens, ${boxCount} boxes, ${imageCount} images painted, oracle ${names.join("/")} + ${ssns.size} SSNs`,
  );
  for (const l of unique.slice(0, 25)) console.log(`           ${l}`);
  if (unique.length > 25) console.log(`           … ${unique.length - 25} more`);
  await task.destroy();
}
console.log(`\n${files.length} file(s): ${blocked} blocked, ${totalLeaks ? `${totalLeaks} leak(s)` : "no leaks"}`);
process.exit(totalLeaks ? 1 : 0);
