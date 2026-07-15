/**
 * Bootstraps a portal admin — the escape hatch for the chicken-and-egg problem
 * that /portal/admin/users is itself admin-only. Use it once to make yourself
 * an admin; after that, add everyone else through the UI.
 *
 * Idempotent: promotes the account if it already exists, creates it (with no
 * password) if it doesn't, and prints a set-password link either way.
 *
 *   npm run portal:admin -- jason@decypher.com "Jason Moynihan"
 */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ── env (.env.local, no dotenv dep) ─────────────────────────────────────────
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  // Values may be quoted (the PEM has to be) — strip one layer if present.
  if (m) env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
}

const [email, ...nameParts] = process.argv.slice(2);
const displayName = nameParts.join(" ").trim();

if (!email || !displayName) {
  console.error('Usage: npm run portal:admin -- <email> "<Full Name>"');
  process.exit(1);
}

for (const key of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) {
  if (!env[key]) {
    console.error(`Missing ${key} in .env.local`);
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

const auth = getAuth();
const db = getFirestore();
const normalised = email.trim().toLowerCase();

let user;
try {
  user = await auth.getUserByEmail(normalised);
  console.log(`Found existing account for ${normalised}`);
} catch {
  user = await auth.createUser({ email: normalised, displayName, emailVerified: false });
  console.log(`Created account for ${normalised}`);
}

// merge:true so re-running on an existing admin doesn't clobber createdAt
await db.collection("users").doc(user.uid).set(
  {
    email: normalised,
    displayName,
    role: "admin",
    disabled: false,
    createdAt: new Date(),
    createdBy: "portal-admin script",
  },
  { merge: true },
);

const link = await auth.generatePasswordResetLink(normalised);

console.log(`\n${displayName} is now a portal admin.`);
console.log(`\nSet a password with this link (it expires — re-run if it lapses):\n`);
console.log(link);
console.log(`\nThen sign in at /portal/login\n`);

process.exit(0);
