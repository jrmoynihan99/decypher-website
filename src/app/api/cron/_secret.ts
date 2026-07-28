import { NextResponse, type NextRequest } from "next/server";

/**
 * Machine authentication for cron endpoints, following the bearer-or-query
 * pattern already established by api/revalidate.
 *
 * The missing-env case returns 500 rather than skipping the check, and that is
 * load-bearing rather than pedantic: Vercel only sends the `Authorization:
 * Bearer $CRON_SECRET` header when the variable is set, so an unset variable
 * means no header at all. Treating "no secret configured" as "no check needed"
 * would leave the sync endpoints publicly triggerable, silently. A 500 makes
 * the misconfiguration loud.
 */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, message: "Server missing CRON_SECRET" },
      { status: 500 },
    );
  }

  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const provided = bearer || request.nextUrl.searchParams.get("secret");

  if (provided !== secret) {
    return NextResponse.json({ ok: false, message: "Invalid secret" }, { status: 401 });
  }
  return null;
}
