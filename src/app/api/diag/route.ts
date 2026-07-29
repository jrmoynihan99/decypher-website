import { createRequire } from "node:module";
import { NextResponse } from "next/server";

/**
 * TEMPORARY — delete once the portal login runtime question is settled.
 *
 * Every route that imports firebase-admin 500s in production while working
 * locally. The runtime log blames `require()` of the ESM-only `jose` from
 * `jwks-rsa/src/utils.js`, which only fails on Node without require(esm)
 * support (< 20.19 / < 22.12) — but the Vercel dashboard reports 22.x/24.x,
 * and two redeploys changed nothing. This reports what the function process
 * ACTUALLY is, rather than what the dashboard claims.
 *
 * Deliberately does not import firebase-admin at module scope: that is the
 * thing that crashes, and a crash here would produce the same opaque 500 this
 * route exists to explain.
 */

export const dynamic = "force-dynamic";

function describe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return `${code ?? err.name}: ${err.message.split("\n")[0]}`;
  }
  return String(err);
}

export async function GET() {
  // Resolved against cwd (/var/task on Vercel) rather than import.meta.url, so
  // this works whether the route is emitted as ESM or CJS.
  const req = createRequire(`${process.cwd()}/package.json`);

  const probe = (specifier: string) => {
    try {
      req(specifier);
      return "ok";
    } catch (err) {
      return describe(err);
    }
  };

  let joseVersion: string | null = null;
  let josePath: string | null = null;
  try {
    josePath = req.resolve("jose");
    joseVersion = req("jose/package.json").version ?? null;
  } catch {
    // reported via the probe below
  }

  return NextResponse.json({
    node: process.version,
    // require(esm) landed in 20.19 and 22.12 — this is the whole question
    supportsRequireEsm: (() => {
      const [maj, min] = process.versions.node.split(".").map(Number);
      return maj > 22 || (maj === 22 && min >= 12) || (maj === 20 && min >= 19);
    })(),
    region: process.env.VERCEL_REGION ?? null,
    jose: { version: joseVersion, resolved: josePath },
    require: {
      jose: probe("jose"),
      "jwks-rsa": probe("jwks-rsa"),
      "firebase-admin/auth": probe("firebase-admin/auth"),
    },
    firebaseEnv: {
      projectId: Boolean(process.env.FIREBASE_PROJECT_ID),
      clientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
      privateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    },
  });
}
