import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession, type StaffSession } from "@/lib/firebase/session";
import { isQuickBooksConfigured } from "@/lib/quickbooks/oauth";

/**
 * The auth ladder every /api/portal/quickbooks/* handler runs first.
 *
 * Factored out because six routes need the identical check, but each still
 * calls it — docs/PORTAL.md is explicit that src/proxy.ts is redirect UX and is
 * not a security boundary. A route handler is reachable directly over HTTP, so
 * its own gate is the only one that counts.
 *
 * Returns either the session or the response to send back, checked with
 * `instanceof` at the call site, matching the pattern in api/portal/users.
 */
export async function guard(
  opts: { requireQuickBooks?: boolean } = {},
): Promise<StaffSession | NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Server missing Firebase credentials" },
      { status: 500 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  }
  if (!session.permissions.includes("creator-finances")) {
    return NextResponse.json(
      { ok: false, message: "No access to creator finances" },
      { status: 403 },
    );
  }
  // Deliberately after the session checks, unlike the Firebase check above.
  // Which third-party integrations we have configured isn't sensitive, but an
  // anonymous caller has no business learning it either — and staff are the
  // only people who can act on the message.
  if (opts.requireQuickBooks && !isQuickBooksConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "QuickBooks isn't configured — set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET and QUICKBOOKS_REDIRECT_URI.",
      },
      { status: 500 },
    );
  }
  return session;
}

/**
 * Intuit's company id. It becomes a Firestore document id, so it is validated
 * before it is ever used as a path — this is the only value in the flow that
 * arrives from a redirect rather than from our own session.
 */
export const REALM_ID_RE = /^\d{1,32}$/;

/** The cookie carrying the authoritative half of the OAuth state. */
export const OAUTH_COOKIE = "qbo_oauth";
export const OAUTH_COOKIE_PATH = "/api/portal/quickbooks";

/** Where the connect flow returns staff to, with an outcome to render. */
export function backToDashboard(base: URL, params: Record<string, string>): URL {
  const url = new URL("/portal/creator-finances", base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}
