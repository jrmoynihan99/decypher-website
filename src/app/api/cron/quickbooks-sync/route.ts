import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isQuickBooksConfigured } from "@/lib/quickbooks/oauth";
import { syncAll } from "@/lib/quickbooks/sync";
import { requireCronSecret } from "../_secret";

/**
 * The nightly report pass: pull each client's profit & loss into the cache.
 *
 * A deliberate, isolated deviation from the repo's "no route segment config"
 * rule. `maxDuration` is a resource declaration rather than a runtime switch,
 * and raising the ceiling is the only way a run over ~150 companies fits.
 */
export const maxDuration = 300;

/**
 * Our own budget rather than the platform's, because a run that assumes 300s
 * and actually gets 60s is killed mid-company with nothing recorded — no clean
 * stop, no resume marker.
 *
 * It has to be configurable because the real ceiling depends on where this
 * runs: Vercel Hobby caps functions at 60s, Pro defaults to 300s. Set
 * CRON_BUDGET_MS to ~45000 on Hobby (and schedule the job more often — the
 * oldest-synced-first queue means short frequent runs cover the same ground).
 */
const BUDGET_MS = Number(process.env.CRON_BUDGET_MS) || 240_000;

/** Don't start another company without at least this much time left. */
const RESERVE_MS = 15_000;

/**
 * Page size. Larger than a normal night's work so one run covers everything,
 * but bounded so a backlog can't produce an unbounded query.
 */
const PAGE = 80;

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  if (!isQuickBooksConfigured()) {
    return NextResponse.json(
      { ok: false, message: "QuickBooks is not configured" },
      { status: 500 },
    );
  }

  const summary = await syncAll({
    basis: "accrual",
    deadline: Date.now() + BUDGET_MS,
    reserveMs: RESERVE_MS,
    limit: PAGE,
  });

  // Never a silent truncation. Companies left over keep the oldest `lastSyncAt`,
  // so the next run resumes exactly where this one stopped — but it says so.
  if (summary.skipped) {
    console.warn(
      `[quickbooks] ran out of time with ${summary.skipped} companies left; the next run resumes there.`,
    );
  }
  if (summary.failed) {
    console.error(
      `[quickbooks] ${summary.failed}/${summary.attempted} companies failed to sync:`,
      summary.results.filter((r) => !r.ok).map((r) => `${r.displayName}: ${r.message}`),
    );
  }

  // The home page renders these figures (revenue graph + stat token), so a run
  // that refreshed anything invalidates it — "live" within one sync rather
  // than one ISR window. "/" is a real route, not the catch-all, so this works.
  if (summary.attempted > 0) revalidatePath("/");

  // 200 as long as the RUN completed. Individual company failures are recorded
  // on their own rows, so a non-2xx here means "the cron itself is broken" —
  // which is what makes Vercel's cron alerting worth anything.
  return NextResponse.json({ ok: true, ...summary });
}
