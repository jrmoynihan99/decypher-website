import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl } from "@/lib/quickbooks/oauth";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, guard } from "../_guard";

/**
 * "Add a client" — the entire onboarding flow for a new creator's books.
 *
 * Staff land on Intuit's company picker, and because the firm signs in with a
 * QuickBooks Online Accountant login, every client file they have access to is
 * already listed there. Pick one, approve, done: the callback fills in the
 * company name, currency and fiscal year from the API. Nothing is typed by hand.
 *
 * There is no bulk-connect at Intuit — one OAuth grant per company file is the
 * platform's rule, not a limitation of this implementation.
 */
export async function GET(request: NextRequest) {
  const session = await guard({ requireQuickBooks: true });
  if (session instanceof NextResponse) {
    /**
     * Unlike every other route here, this one is a top-level browser
     * navigation — it's registered with Intuit as the app's connect/reconnect
     * URL, so someone can land on it cold from inside QuickBooks. Handing a
     * browser a raw JSON 401 is a dead end; send them to sign in and come back.
     *
     * Only for 401. A 403 means they're signed in without the permission, and
     * bouncing them to a login they've already completed would just loop.
     */
    const wantsHtml = request.headers.get("accept")?.includes("text/html");
    if (wantsHtml && session.status === 401) {
      const login = new URL("/portal/login", request.nextUrl);
      login.searchParams.set("next", "/portal/creator-finances");
      return NextResponse.redirect(login);
    }
    return session;
  }

  const nonce = randomUUID();
  const response = NextResponse.redirect(authorizeUrl(nonce));

  /**
   * CSRF as a double submit. The `state` parameter carries only the nonce; the
   * authoritative values live in this httpOnly cookie, which a cross-site
   * attacker can neither read nor set.
   *
   * sameSite "lax" is load-bearing and not laziness: the callback arrives as a
   * top-level GET navigation from intuit.com, which Lax permits and Strict
   * drops — under Strict the cookie would simply never arrive and every connect
   * would fail state validation.
   */
  response.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({
      nonce,
      uid: session.uid,
      email: session.email,
      creatorId: request.nextUrl.searchParams.get("creatorId") ?? "",
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: OAUTH_COOKIE_PATH,
      maxAge: 600,
    },
  );

  return response;
}
