import { NextResponse, type NextRequest } from "next/server";
import { isQuickBooksConfigured } from "@/lib/quickbooks/oauth";
import { keepAlive } from "@/lib/quickbooks/sync";
import { requireCronSecret } from "../_secret";

/**
 * Rotate every live connection's refresh token.
 *
 * This is the job that makes the integration unattended, and it is separate
 * from the report sync on purpose. A refresh token dies roughly 101 days after
 * its last use, so as long as this runs, nothing expires on its own — the only
 * reason a client ever needs re-authorising is that they actively revoked
 * access. Fold it into the report pass and a run that times out before reaching
 * the last companies would stop refreshing THEIR tokens too, quietly converting
 * a latency problem into 150 dead connections a quarter later.
 *
 * Cheap by comparison: one small POST per company, ~30s for 150 of them.
 */
export const maxDuration = 120;

const BUDGET_MS = Number(process.env.CRON_BUDGET_MS) || 90_000;

/**
 * Skip anything rotated in the last five hours, so this endpoint is safe to
 * call at any frequency — an external scheduler firing hourly still only
 * rotates each company every ~5h rather than 24 times a day.
 */
const MIN_AGE_MS = 5 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  if (!isQuickBooksConfigured()) {
    return NextResponse.json(
      { ok: false, message: "QuickBooks is not configured" },
      { status: 500 },
    );
  }

  const summary = await keepAlive(Date.now() + BUDGET_MS, MIN_AGE_MS);

  if (summary.failed.length) {
    // Worth shouting about: a connection that stops rotating is on a ~101-day
    // clock, and nobody finds that out by reading the dashboard.
    console.error(
      `[quickbooks] ${summary.failed.length}/${summary.attempted} token rotations failed:`,
      summary.failed,
    );
  }

  return NextResponse.json({ ok: true, ...summary });
}
