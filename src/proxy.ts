import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap redirect routing for /portal. This is a *convenience*, not a security
 * boundary — it only checks that a session cookie exists, never that it's valid,
 * because verifying it means a network call to Firebase on every request
 * including prefetches.
 *
 * The real gate is requireSession() in the portal layout and in each API route.
 * That split is deliberate and is what Next's own auth guidance recommends:
 * anyone who forges a `dcy_session=anything` cookie gets past this file and
 * straight into a server-side verify that rejects them. Nothing here is trusted.
 *
 * (Next 16 renamed middleware.ts → proxy.ts; it runs on the Node runtime now.)
 */

const SESSION_COOKIE = "dcy_session";

/** Set by requireSession()'s redirect when the cookie failed verification.
 *  Duplicated as a literal rather than imported, for the same reason
 *  SESSION_COOKIE is: this file must not pull in firebase-admin. */
const STALE_PARAM = "stale";

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const isLogin = pathname === "/portal/login";

  // The real gate on the other side just rejected this cookie. Bin it and let
  // the login screen render. Skipping this check would send them back to
  // /portal — which redirects here again — and the browser would spin until it
  // gave up with ERR_TOO_MANY_REDIRECTS. A Server Component can't clear a
  // cookie, so this is the only place the dead one can be dropped.
  if (isLogin && request.nextUrl.searchParams.has(STALE_PARAM)) {
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (!hasCookie && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    // Remember where they were headed so login can bounce them back.
    if (pathname !== "/portal") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasCookie && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*"],
};
