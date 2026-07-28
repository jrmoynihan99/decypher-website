import "server-only";

/**
 * Raw OAuth 2.0 against Intuit's identity service. Protocol only — this module
 * knows nothing about Firestore, connections or leases, which keeps the token
 * round-trip testable in isolation from the locking around it.
 *
 * Two facts about Intuit's tokens shape everything that uses this:
 *
 *  1. Refresh tokens ROTATE. Roughly every 24 hours the token endpoint returns
 *     a new refresh token and force-expires the one you presented. Whatever
 *     calls this MUST persist the new value, and must not let two callers
 *     refresh the same connection concurrently — the second rotation kills the
 *     first caller's token. See the lease in connections.ts.
 *
 *  2. The operative expiry is `x_refresh_token_expires_in`, about 101 days from
 *     last use. That's the number to store — not the 5-year ceiling Intuit
 *     quotes for a connection's lifetime. It means an unused connection dies in
 *     ~3 months, which is why a daily refresh cron is a correctness requirement
 *     rather than a freshness nicety.
 */

import { QuickBooksAuthError, QuickBooksConfigError, QuickBooksError } from "./errors";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

/**
 * Just the accounting scope. Adding `openid profile email` is tempting and
 * pointless — we already know who the staff member is from the Firebase
 * session, and the extra scopes only widen Intuit's consent screen.
 */
const SCOPE = "com.intuit.quickbooks.accounting";

export type QuickBooksEnvironment = "sandbox" | "production";

export type QuickBooksConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: QuickBooksEnvironment;
};

/**
 * Read inside the call rather than at module scope, matching lib/calendly.ts:
 * an unset variable then surfaces as a handled 500 on the request that needed
 * it, instead of an import-time crash that takes the whole app down.
 */
export function quickbooksConfig(): QuickBooksConfig {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new QuickBooksConfigError(
      "Set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET and QUICKBOOKS_REDIRECT_URI.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    environment: process.env.QUICKBOOKS_ENV === "production" ? "production" : "sandbox",
  };
}

export function isQuickBooksConfigured(): boolean {
  return Boolean(
    process.env.QUICKBOOKS_CLIENT_ID &&
      process.env.QUICKBOOKS_CLIENT_SECRET &&
      process.env.QUICKBOOKS_REDIRECT_URI,
  );
}

export function currentEnvironment(): QuickBooksEnvironment {
  return process.env.QUICKBOOKS_ENV === "production" ? "production" : "sandbox";
}

export type TokenSet = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

/**
 * Where staff get sent to pick a company.
 *
 * `redirect_uri` comes from config, never from the incoming request. It has to
 * match a URI registered on the Intuit app *exactly*, and be byte-identical
 * between here and the token exchange — so a Vercel preview's random origin
 * would fail, and silently substituting it would be worse than failing.
 */
export function authorizeUrl(state: string): string {
  const { clientId, redirectUri } = quickbooksConfig();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

function basicAuth(cfg: QuickBooksConfig): string {
  return Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
}

/**
 * Classify a token-endpoint failure. This is the single most consequential
 * branch in the integration — see the note in errors.ts about invalid_grant vs
 * invalid_client.
 */
function tokenError(status: number, body: TokenResponse | null): QuickBooksError {
  const code = body?.error ?? `http_${status}`;
  const detail = body?.error_description ?? "";

  if (code === "invalid_grant") {
    return new QuickBooksAuthError(
      `Refresh token rejected${detail ? `: ${detail}` : ""}. The company must be reconnected.`,
    );
  }
  if (code === "invalid_client" || status === 401) {
    return new QuickBooksConfigError(
      "Intuit rejected our client credentials — check QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET " +
        "and that QUICKBOOKS_ENV matches the keys in use.",
    );
  }
  // 429 and 5xx are worth another go on the next sync; a 400 that isn't
  // invalid_grant is our bug and won't fix itself.
  const retryable = status === 429 || status >= 500;
  return new QuickBooksError(
    `Token request failed (${status} ${code})${detail ? `: ${detail}` : ""}`,
    status,
    code,
    retryable,
  );
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const cfg = quickbooksConfig();

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(cfg)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
      cache: "no-store",
    });
  } catch (cause) {
    // A network failure must stay retryable — it is emphatically not a signal
    // that the client revoked us, and marking it as one would be destructive.
    throw new QuickBooksError(
      `Could not reach Intuit's token endpoint: ${(cause as Error).message}`,
      503,
      "network_error",
      true,
    );
  }

  const body = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok) throw tokenError(res.status, body);

  if (!body?.access_token || !body?.refresh_token) {
    throw new QuickBooksError(
      "Intuit returned a token response with no tokens in it.",
      502,
      "malformed_token_response",
      true,
    );
  }

  const now = Date.now();
  return {
    accessToken: body.access_token,
    // Default to the documented hour if Intuit omits it; a short-by-a-minute
    // guess just triggers one extra refresh, whereas a long guess means 401s.
    accessTokenExpiresAt: new Date(now + (body.expires_in ?? 3600) * 1000),
    refreshToken: body.refresh_token,
    refreshTokenExpiresAt: new Date(
      now + (body.x_refresh_token_expires_in ?? 8_726_400) * 1000,
    ),
  };
}

/** First leg of the connect flow: authorisation code → tokens. */
export function exchangeCode(code: string): Promise<TokenSet> {
  const { redirectUri } = quickbooksConfig();
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    // Must be byte-identical to the value sent to /authorize.
    redirect_uri: redirectUri,
  });
}

/**
 * Rotate. The returned refreshToken usually differs from the one passed in, and
 * when it does the old one is already dead at Intuit — persist the new one in
 * the same write that consumes this, or the connection is lost.
 */
export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/**
 * Tell Intuit to forget us. Worth doing on disconnect rather than just dropping
 * our copy: an unrevoked refresh token stays live on the client's account for
 * ~101 days after we stop using it.
 *
 * Best-effort — a failure here must not block the local disconnect, or a staff
 * member can end up unable to remove a connection they can no longer reach.
 */
export async function revokeToken(token: string): Promise<boolean> {
  const cfg = quickbooksConfig();
  try {
    const res = await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(cfg)}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
