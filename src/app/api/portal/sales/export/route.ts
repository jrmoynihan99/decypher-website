import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { getOptionsConfig } from "@/lib/sales/config";
import { buildSalesCsv } from "@/lib/sales/csv";
import { listSalesCallsForExport } from "@/lib/sales/store";

/**
 * The grid, as a CSV.
 *
 * POST rather than GET, and the body is a list of row ids. The filters that
 * decide WHAT gets exported — date range, call type, tab, search, the per-tab
 * selects — all live in the grid and are all client-side, so the honest way to
 * export "what's on screen" is for the screen to say which rows those are. The
 * alternative is a second implementation of every filter in this file, free to
 * disagree with the one the operator can actually see.
 *
 * What the server owns is the part the browser can't do: the intake Q&A, which
 * never travels to it, and the live option labels.
 *
 * Not a GET with a query string, incidentally, because 2,000 ids is well past
 * what a URL can carry.
 */

/**
 * Ceiling on one export.
 *
 * `listSalesCalls` caps the grid at 2,000 rows, so this is that with headroom
 * for the cap being raised without anyone remembering this file. It's a bound
 * on request size, not a business rule.
 */
const MAX_ROWS = 5000;

/** An IANA zone, loosely — enough to keep junk out of Intl. */
const TZ_RE = /^[A-Za-z0-9_+\-/]{1,64}$/;

export async function POST(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const ids = Array.isArray(raw.ids)
    ? raw.ids.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
  if (!ids.length) {
    return NextResponse.json({ ok: false, message: "Nothing to export" }, { status: 400 });
  }
  if (ids.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, message: `That's more than ${MAX_ROWS.toLocaleString()} rows — narrow the date range and try again.` },
      { status: 413 },
    );
  }

  const timeZone =
    typeof raw.timeZone === "string" && TZ_RE.test(raw.timeZone) ? raw.timeZone : "UTC";

  try {
    const [rows, config] = await Promise.all([
      listSalesCallsForExport(ids),
      getOptionsConfig(),
    ]);
    const csv = buildSalesCsv(rows, { timeZone, config });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // The file holds names, emails, phone numbers and deal values. Nothing
        // should be caching it anywhere between here and the operator.
        "Cache-Control": "no-store, private",
        // The browser names the download; this is the fallback for anything
        // that hits the endpoint directly.
        "Content-Disposition": 'attachment; filename="decypher-sales-export.csv"',
        // So the client can tell "exported 412 rows" from "exported the 400
        // that still exist" without parsing the body.
        "X-Row-Count": String(rows.length),
      },
    });
  } catch (e) {
    console.error("[sales] export failed:", e);
    return NextResponse.json(
      { ok: false, message: "Couldn't build that export" },
      { status: 500 },
    );
  }
}
