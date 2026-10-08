/**
 * Replay a recorded Tax Recap failure through the engine as it is now.
 *
 *   npm run recap:replay -- path/to/tax-recap-failure-<id>.json [--fixture]
 *
 * The JSON is what the Failures page downloads (or GET
 * /api/portal/tax-recap/failures/<id>?download=1): the numbers as read, the
 * meta, the entity's numbers, the reader's notes, and what the engine said
 * at the time. `deriveBefore` is a pure function of those, so this is the
 * failure exactly as the builder saw it, against the current code and the
 * seeded tables — no PDF, no model.
 *
 * Prints the refusal (or the derived before and the strategy split), and
 * with --fixture a block ready to paste into tax-recap-derive-check.mjs.
 *
 * Runs on plain Node (24+): `--import ./scripts/lib/resolve-ts.mjs` lets it
 * load the app's TypeScript without a build.
 */
import { readFileSync } from "node:fs";
import { attributeStrategies, deriveBefore } from "../src/lib/tax-recap/derive.ts";
import { computeRecap } from "../src/lib/tax-recap/compute.ts";
import { ENTITY_FIELD_KEYS, RETURN_FIELD_KEYS, emptyEntityNumbers, emptyNumbers } from "../src/lib/tax-recap/schema.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const wantFixture = args.includes("--fixture");
if (!file) {
  console.error("usage: npm run recap:replay -- <failure.json> [--fixture]");
  process.exit(2);
}

const doc = JSON.parse(readFileSync(file, "utf8"));
const after = { ...emptyNumbers() };
for (const k of RETURN_FIELD_KEYS) if (doc.after && typeof doc.after[k] === "number") after[k] = doc.after[k];
let entity = null;
if (doc.entity && typeof doc.entity === "object") {
  entity = { ...emptyEntityNumbers() };
  let any = false;
  for (const k of ENTITY_FIELD_KEYS) {
    if (typeof doc.entity[k] === "number") {
      entity[k] = doc.entity[k];
      any = true;
    }
  }
  if (!any) entity = null;
}
const meta = doc.meta ?? {};

const money = (v) => (v === null || v === undefined ? "—" : `$${v.toLocaleString("en-US")}`);
console.log(`${doc.clientName || "(client)"} · ${meta.taxYear ?? "?"} · ${meta.filingStatus ?? "?"} · ${meta.stateCode ?? "no state"}${meta.entityForm ? ` · ${meta.entityForm}` : ""} · recorded with engine v${doc.engineVersion ?? "?"} by ${doc.createdBy ?? "?"}`);
if (Array.isArray(doc.reasons)) console.log("recorded refusal:\n - " + doc.reasons.join("\n - "));
if (doc.extraction?.after?.notes) console.log(`reader notes (1040): ${doc.extraction.after.notes}`);
if (doc.extraction?.entity?.notes) console.log(`reader notes (entity): ${doc.extraction.entity.notes}`);

console.log("\nnow:");
const r = deriveBefore(after, meta, undefined, entity);
if (!r.ok) {
  console.log("REFUSED:\n - " + r.reasons.join("\n - "));
  if (r.mismatches.length) for (const m of r.mismatches) console.log(`   ${m.line}: read ${money(m.read)}, tables ${money(m.computed)}`);
} else {
  console.log("DERIVES");
  for (const [k, v] of Object.entries(r.before)) if (v !== null) console.log("  " + k.padEnd(28) + money(v).padStart(12));
  if (r.entityBefore) {
    console.log("  entity before:");
    for (const [k, v] of Object.entries(r.entityBefore)) if (v !== null) console.log("  " + k.padEnd(28) + money(v).padStart(12));
  }
  console.log("  notes:\n   - " + r.derived.notes.join("\n   - "));
  const c = computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity });
  console.log(`  savings ${money(c.savings)} (before ${money(c.before.totalTaxes)}, after ${money(c.after.totalTaxes)})`);
  const analysis = attributeStrategies(after, meta, undefined, entity);
  if (analysis) {
    for (const a of analysis.attribution) console.log(`   - ${a.label.padEnd(44)} ${money(a.savings).padStart(10)}`);
  }
}

if (wantFixture) {
  const lines = (obj, keys) => keys.filter((k) => obj[k] !== null && obj[k] !== undefined).map((k) => `    ${k}: ${obj[k]},`).join("\n");
  const name = `${(doc.clientName || "client").replace(/[^A-Za-z0-9 ]+/g, "")} ${meta.taxYear ?? ""}`.trim();
  console.log(`\n/* ── ${name}: recorded failure ${doc.id ?? ""} ── */\nconst FIXTURE = {\n  meta: ${JSON.stringify({ taxYear: meta.taxYear ?? null, filingStatus: meta.filingStatus ?? null, stateCode: meta.stateCode ?? null, stateForm: meta.stateForm ?? null, ...(meta.entityForm ? { entityForm: meta.entityForm } : {}) })},\n  after: numbers({\n${lines(after, RETURN_FIELD_KEYS)}\n  }),${
    entity ? `\n  entity: entityNumbers({\n${lines(entity, ENTITY_FIELD_KEYS)}\n  }),` : ""
  }\n};`);
}
process.exit(r.ok ? 0 : 1);
