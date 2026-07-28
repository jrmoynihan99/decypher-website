import { NextResponse, type NextRequest } from "next/server";
import { getConnection } from "@/lib/quickbooks/connections";
import { syncOne } from "@/lib/quickbooks/sync";
import { REALM_ID_RE, guard } from "../_guard";

/**
 * "Sync now", and the first pull after a company is connected.
 *
 * Same code path as the cron — one implementation of syncRealm, so a bug can't
 * hide in whichever of the two is exercised less.
 *
 * One company at a time by design. A "sync everything" button over ~150
 * companies would sit there for minutes and time out; the nightly run and the
 * oldest-first ordering already cover the bulk case.
 */
export async function POST(request: NextRequest) {
  const session = await guard({ requireQuickBooks: true });
  if (session instanceof NextResponse) return session;

  let realmId = "";
  let basis: "accrual" | "cash" = "accrual";
  try {
    const body = await request.json();
    realmId = typeof body?.realmId === "string" ? body.realmId : "";
    if (body?.basis === "cash") basis = "cash";
  } catch {
    // falls through to validation
  }

  if (!REALM_ID_RE.test(realmId)) {
    return NextResponse.json({ ok: false, message: "Invalid company id" }, { status: 400 });
  }

  const connection = await getConnection(realmId);
  if (!connection) {
    return NextResponse.json({ ok: false, message: "Not connected" }, { status: 404 });
  }
  if (connection.status === "disabled") {
    return NextResponse.json(
      { ok: false, message: "This company is disconnected — reconnect it first." },
      { status: 409 },
    );
  }

  // syncOne never throws: a failure comes back as a result with ok:false, and
  // has already been recorded on the connection and the snapshot. So the HTTP
  // status reflects whether the request was handled, and the body carries what
  // happened to the company.
  const result = await syncOne(connection, basis);
  return NextResponse.json({ ok: true, result });
}
