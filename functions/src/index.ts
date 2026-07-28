/**
 * Scheduled triggers for the QuickBooks sync.
 *
 * These are deliberately THIN. All the work — token rotation, report fetching,
 * parsing, caching — lives in the Next app under src/lib/quickbooks and is
 * exposed at /api/cron/*. These functions do nothing but call those routes on a
 * schedule with the shared secret.
 *
 * Why a scheduler here rather than Vercel's:
 *
 *   Vercel Hobby caps functions at 60 seconds and cron at ONE run per day,
 *   guaranteed only to the hour. At ~150 client companies that's roughly 15
 *   synced per day — the queue would never drain. Vercel's own cron needs Pro.
 *
 *   Cloud Scheduler has neither limit. Running the sync hourly against a 45s
 *   budget covers the same ground, because the sync queue is ordered
 *   oldest-synced-first: each short run resumes exactly where the last stopped,
 *   with no cursor to maintain.
 *
 * Keeping them thin is the point. Porting the sync logic in here would escape
 * Vercel's execution limit entirely, but at the cost of a second deploy
 * pipeline, a duplicate set of credentials, and two copies of the parser to
 * keep in step. Not worth it at this scale.
 */

import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * Same value as CRON_SECRET in the Vercel environment. Stored in Secret Manager
 * rather than as a plain config value — it's the only thing standing between
 * the open internet and a sync run.
 *
 *   firebase functions:secrets:set CRON_SECRET
 */
const CRON_SECRET = defineSecret("CRON_SECRET");

/** The deployed site, no trailing slash — e.g. https://wedecypher.co */
const SITE_URL = defineString("SITE_URL");

const REGION = "us-central1";

type CronResult = {
  ok?: boolean;
  attempted?: number;
  succeeded?: number;
  failed?: number;
  skipped?: number;
  rotated?: number;
  durationMs?: number;
  message?: string;
};

/**
 * Call one of the app's cron routes.
 *
 * Throws on failure so the run is marked failed in the Cloud Functions console
 * and Cloud Scheduler retries — a silent success on a broken sync is the one
 * outcome worth avoiding, since the whole reason this job exists is that nobody
 * is watching it.
 */
async function trigger(path: string): Promise<CronResult> {
  const base = SITE_URL.value().replace(/\/+$/, "");
  if (!base) {
    throw new Error("SITE_URL is not configured — set it in functions/.env or via params.");
  }

  const url = `${base}${path}`;
  const started = Date.now();

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CRON_SECRET.value()}` },
  });

  const body = (await res.json().catch(() => null)) as CronResult | null;
  const elapsed = Date.now() - started;

  if (!res.ok || !body?.ok) {
    throw new Error(
      `${path} returned ${res.status} after ${elapsed}ms: ${body?.message ?? "no body"}`,
    );
  }

  logger.info(`${path} ok in ${elapsed}ms`, body);
  return body;
}

/**
 * Pull each client's profit & loss into the cache.
 *
 * Hourly rather than nightly so a 45–60s execution window is enough: the run
 * stops cleanly when its budget runs out and the next one picks up the
 * companies it didn't reach. Set CRON_BUDGET_MS=45000 in the Vercel environment
 * if the app is on a Hobby plan.
 */
export const quickbooksSync = onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "Etc/UTC",
    region: REGION,
    secrets: [CRON_SECRET],
    // Generous: this awaits a request that itself may run for a minute.
    timeoutSeconds: 300,
    memory: "256MiB",
    retryCount: 0,
  },
  async () => {
    const result = await trigger("/api/cron/quickbooks-sync");
    if (result.skipped) {
      logger.warn(
        `${result.skipped} companies left for the next run — the queue is ordered ` +
          `oldest-synced-first, so nothing is lost.`,
      );
    }
    if (result.failed) {
      logger.error(`${result.failed}/${result.attempted} companies failed to sync.`);
    }
  },
);

/**
 * Rotate every live connection's refresh token.
 *
 * This is the job that makes the integration unattended. A QuickBooks refresh
 * token dies roughly 101 days after its last use, so as long as this runs,
 * nothing expires on its own and the only reason a client ever needs
 * re-authorising is that they actively revoked access.
 *
 * If it stops for over 101 days, EVERY connection dies at once and all of them
 * need reconnecting by hand. Nothing else in the system has that property.
 *
 * The endpoint skips anything rotated in the last five hours, so this schedule
 * can be tightened without turning into thousands of pointless rotations.
 */
export const quickbooksKeepalive = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "Etc/UTC",
    region: REGION,
    secrets: [CRON_SECRET],
    timeoutSeconds: 300,
    memory: "256MiB",
    retryCount: 1,
  },
  async () => {
    const result = await trigger("/api/cron/quickbooks-keepalive");
    logger.info(`Rotated ${result.rotated ?? 0} of ${result.attempted ?? 0} connections.`);
  },
);
