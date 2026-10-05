// TEMP (delete after verifying): seed test recaps from the engine's fixtures.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PAIRINGS } from "./scripts/.tmp-pairings.mjs";
import { attributeStrategies, deriveBefore } from "./src/lib/tax-recap/derive.ts";
import { computeRecap } from "./src/lib/tax-recap/compute.ts";
import { DEFAULT_NEXT_STEPS, DEFAULT_STRATEGIES } from "./src/lib/tax-recap/schema.ts";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
}
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

const mode = process.argv[2];
if (mode === "delete") {
  const ids = JSON.parse(readFileSync(process.argv[3], "utf8")).map((d) => d.id);
  for (const id of ids) await db.collection("taxRecaps").doc(id).delete();
  console.log("deleted", ids);
  process.exit(0);
}

const out = [];
async function seed(p, name, legacy = false) {
  const entity = p.entity ?? null;
  const r = deriveBefore(p.after, p.meta, undefined, entity);
  if (!r.ok) throw new Error(`${name}: ${r.reasons.join("; ")}`);
  let analysis = attributeStrategies(p.after, p.meta, undefined, entity);
  if (legacy && analysis) {
    // as a v7 save: kids beside, not in the before or the split
    analysis = {
      ...analysis,
      version: "7",
      attribution: analysis.attribution.filter((a) => !/^Claiming your/.test(a.label)),
      kids: analysis.kids ? { ...analysis.kids, inBefore: null } : null,
    };
  }
  const input = {
    clientName: name,
    taxYear: p.meta.taxYear,
    priorYearIncome: null,
    stateCode: p.meta.stateCode,
    before: r.before,
    after: p.after,
    entityBefore: r.entityBefore,
    entityAfter: entity,
    strategies: DEFAULT_STRATEGIES,
    nextSteps: DEFAULT_NEXT_STEPS,
    extraction: { before: null, after: null, entity: null },
    derivedBefore: r.derived,
    analysis,
  };
  const now = new Date();
  const token = randomBytes(18).toString("base64url");
  const ref = await db.collection("taxRecaps").add(
    JSON.parse(
      JSON.stringify({
        ...input,
        token,
        revoked: false,
        savings: computeRecap(input).savings,
        createdBy: "claude-verify",
        updatedBy: "claude-verify",
      }),
    ),
  );
  await ref.update({ createdAt: now, updatedAt: now });
  const c = computeRecap(input);
  out.push({ id: ref.id, token, name, before: c.before.totalTaxes, after: c.after.totalTaxes, savings: c.savings });
}

await seed(PAIRINGS[3], "Wilson ZZTEST");
await seed(PAIRINGS[0], "Inha ZZTEST");
await seed(PAIRINGS[3], "Legacy ZZTEST", true);
writeFileSync(process.argv[2] ?? ".tmp-seeded.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(0);
