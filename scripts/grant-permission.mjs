/**
 * Grant a portal tab to every existing account — the backfill that has to run
 * whenever a new PermissionKey ships.
 *
 * Why it's needed: lib/permissions.ts grandfathers a user document with NO
 * `permissions` field to full access, so shipping the feature can't lock anyone
 * out. But every account created through /portal/admin/users has an EXPLICIT
 * array, and an explicit array means exactly that set — so a new key arrives
 * switched OFF for all of them until something adds it.
 *
 * Accordingly:
 *  - docs with an explicit array get the key appended (rewritten in canonical
 *    order, matching what parsePermissions returns on read)
 *  - docs with no `permissions` field are left alone. They already resolve to
 *    everything, and writing an array would opt them out of that for the NEXT
 *    tab we add.
 *  - admins are updated too. resolvePermissions ignores their stored array, but
 *    the Staff tab's checkboxes render from it, and an admin seeing the box
 *    unticked for a tab they can open is just confusing.
 *
 * Idempotent — re-running touches nothing.
 *
 *   npm run portal:grant -- tools-hub
 *   npm run portal:grant -- tools-hub --dry
 */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── env (.env.local, no dotenv dep) ─────────────────────────────────────────
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  // Values may be quoted (the PEM has to be) — strip one layer if present.
  if (m) env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const key = args.find((a) => !a.startsWith("--"));

/**
 * The canonical key list, read out of the TypeScript rather than duplicated
 * here. A copy in this file would drift the first time a tab is renamed, and
 * this script's whole job is writing those strings into user documents.
 */
const source = readFileSync("src/lib/permissions.ts", "utf8");
const block = source.match(/export const PERMISSION_KEYS = \[([\s\S]*?)\] as const;/);
if (!block) {
  console.error("Couldn't find PERMISSION_KEYS in src/lib/permissions.ts");
  process.exit(1);
}
const PERMISSION_KEYS = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

if (!key || !PERMISSION_KEYS.includes(key)) {
  console.error("Usage: npm run portal:grant -- <permission-key> [--dry]\n");
  console.error(`Known keys: ${PERMISSION_KEYS.join(", ")}`);
  process.exit(1);
}

for (const name of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) {
  if (!env[name]) {
    console.error(`Missing ${name} in .env.local`);
    process.exit(1);
  }
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore();
const snap = await db.collection("users").get();

let granted = 0;
let already = 0;
let grandfathered = 0;

for (const doc of snap.docs) {
  const data = doc.data();
  const label = data.email || doc.id;

  if (!Array.isArray(data.permissions)) {
    grandfathered++;
    console.log(`  skip      ${label} — no permissions field, already sees everything`);
    continue;
  }
  if (data.permissions.includes(key)) {
    already++;
    console.log(`  ok        ${label} — already has it`);
    continue;
  }

  // Canonical order, and unknown strings dropped — the same normalisation
  // parsePermissions applies on read, so the stored array stops drifting.
  const wanted = new Set([...data.permissions, key]);
  const next = PERMISSION_KEYS.filter((k) => wanted.has(k));

  if (!dryRun) await doc.ref.update({ permissions: next });
  granted++;
  console.log(`  ${dryRun ? "would" : "GRANT"}     ${label} — ${next.length} tabs`);
}

console.log(
  `\n${dryRun ? "Dry run — nothing written." : "Done."} ` +
    `${granted} granted, ${already} already had it, ${grandfathered} grandfathered.`,
);

process.exit(0);
