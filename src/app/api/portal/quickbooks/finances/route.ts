import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_PERIOD, parsePeriodKey } from "@/lib/quickbooks/periods";
import { listCreatorFinances } from "@/lib/quickbooks/snapshots";
import { guard } from "../_guard";

/**
 * The dashboard read. Serves entirely from cached snapshots — no QuickBooks
 * traffic on a page view, because every period in the selector is an exact
 * client-side slice of the one monthly report each sync already fetched.
 */
export async function GET(request: NextRequest) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const period = parsePeriodKey(request.nextUrl.searchParams.get("period")) ?? DEFAULT_PERIOD;
  // Cash basis is stored under its own snapshot id, so this is here and honoured
  // from day one even though only Accrual is synced today — adding it later is
  // a cron flag, not a migration.
  const basis = request.nextUrl.searchParams.get("basis") === "cash" ? "cash" : "accrual";

  try {
    const payload = await listCreatorFinances(period, basis);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    console.error("[quickbooks] finances read failed:", err);
    return NextResponse.json(
      { ok: false, message: "Couldn't load creator finances." },
      { status: 500 },
    );
  }
}
