import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
const snap = await db.collection("leadMagnetLeads").get();
console.log("doc count:", snap.size);
snap.forEach((d) => {
  const v = d.data();
  console.log("--- id:", d.id);
  console.log(
    JSON.stringify(
      { ...v, createdAt: v.createdAt?.toDate?.()?.toISOString?.() ?? v.createdAt },
      null,
      2,
    ),
  );
});
process.exit(0);
