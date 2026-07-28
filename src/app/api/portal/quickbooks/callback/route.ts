import { NextResponse, type NextRequest } from "next/server";
import { fetchCompanyInfo } from "@/lib/quickbooks/client";
import { getConnection, saveConnection } from "@/lib/quickbooks/connections";
import { exchangeCode } from "@/lib/quickbooks/oauth";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  REALM_ID_RE,
  backToDashboard,
  guard,
} from "../_guard";

/**
 * Where Intuit sends staff back after they pick a company.
 *
 * Every exit from here is a redirect to the dashboard carrying a `qbo=` outcome
 * rather than a bare error page — this is the middle of an onboarding flow, and
 * the person doing it needs to know what to try next, not read a stack trace.
 */

type OAuthState = { nonce?: string; uid?: string; email?: string; creatorId?: string };

export async function GET(request: NextRequest) {
  const base = request.nextUrl;
  const done = (params: Record<string, string>) => {
    const response = NextResponse.redirect(backToDashboard(base, params));
    response.cookies.delete({ name: OAUTH_COOKIE, path: OAUTH_COOKIE_PATH });
    return response;
  };

  // The callback is a plain GET anyone can hit. The state cookie proves the
  // request originated from our connect flow; it does not prove who's asking,
  // so the session check still runs.
  const session = await guard({ requireQuickBooks: true });
  if (session instanceof NextResponse) return session;

  // Staff clicked cancel on Intuit's consent screen. An ordinary outcome.
  const denied = base.searchParams.get("error");
  if (denied) {
    return done({ qbo: denied === "access_denied" ? "cancelled" : "error", detail: denied });
  }

  let state: OAuthState = {};
  try {
    state = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    // Malformed cookie is handled by the nonce check below.
  }

  const returnedNonce = base.searchParams.get("state");
  if (!state.nonce || !returnedNonce || state.nonce !== returnedNonce) {
    // Far and away the most common cause is a stale tab — the cookie lives ten
    // minutes — so this is worded as "try again", not as an attack.
    return done({ qbo: "expired" });
  }

  const code = base.searchParams.get("code");
  const realmId = base.searchParams.get("realmId");
  if (!code || !realmId || !REALM_ID_RE.test(realmId)) {
    return done({ qbo: "error", detail: "missing_code" });
  }

  /**
   * Guard against attaching the wrong books to a creator. Staff picking the
   * wrong company from Intuit's list is an ordinary mistake, and silently
   * rebinding an existing realm would show one client's finances under another
   * client's name — with no error anywhere.
   */
  const creatorId = state.creatorId || realmId;
  const existing = await getConnection(realmId);
  if (existing && existing.creatorId !== creatorId && existing.status !== "disabled") {
    return done({ qbo: "already-connected", name: existing.displayName });
  }

  try {
    const tokens = await exchangeCode(code);

    // Done here rather than deferred to the first sync so the company's real
    // name, currency and fiscal year are on screen immediately — and so nothing
    // about a client's identity is ever typed in by hand.
    //
    // Passing the token explicitly because the connection doesn't exist yet;
    // saving a placeholder first and reading it back would strand a broken row
    // whenever this call failed. A failure here is survivable — the tokens are
    // good, we just don't know the name — so it falls back rather than aborting.
    const info = await fetchCompanyInfo(realmId, tokens.accessToken).catch((err) => {
      console.warn(`[quickbooks] companyinfo failed for ${realmId}:`, err);
      return null;
    });

    await saveConnection({
      realmId,
      creatorId,
      companyName: info?.companyName || `Company ${realmId}`,
      legalName: info?.legalName ?? "",
      country: info?.country ?? "",
      currency: info?.currency ?? "USD",
      fiscalYearStartMonth: info?.fiscalYearStartMonth ?? 1,
      connectedBy: state.email || session.email,
      tokens,
    });

    // The first sync is kicked off by the dashboard on arrival, not awaited
    // here. Awaiting it would leave staff watching a spinner through two more
    // round trips; firing and forgetting would silently not run at all, because
    // the serverless function is frozen once this response is returned.
    return done({ qbo: "connected", realm: realmId });
  } catch (err) {
    console.error(`[quickbooks] connect failed for realm ${realmId}:`, err);
    return done({ qbo: "error", detail: "exchange_failed" });
  }
}

