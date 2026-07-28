/**
 * QuickBooks failure taxonomy.
 *
 * Three classes rather than one, because the three demand genuinely different
 * responses and conflating them causes real damage:
 *
 *   QuickBooksAuthError   — this ONE company needs a human to reconnect.
 *   QuickBooksConfigError — OUR credentials are wrong. Affects every company.
 *   QuickBooksError       — transient, or a company-specific API failure.
 *
 * The distinction that matters most is auth vs config. Intuit returns
 * `invalid_grant` (the client revoked us) and `invalid_client` (our own client
 * secret is wrong) from the same endpoint, and both look like "authentication
 * failed". Treating a config typo as an auth failure would mark all ~150
 * connections `reconnect-required` and send the firm off to re-authorise every
 * client book over a mistyped env var.
 *
 * Isomorphic — route handlers `instanceof` these to pick a status code.
 */

export class QuickBooksError extends Error {
  readonly status: number;
  /** Intuit's own error code where it gave one, else a short slug of ours. */
  readonly code: string;
  /** Safe to retry on the next sync without human involvement. */
  readonly retryable: boolean;

  constructor(
    message: string,
    status = 502,
    code = "quickbooks_error",
    retryable = false,
  ) {
    super(message);
    this.name = "QuickBooksError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * The connection is dead and only re-running OAuth for this company will fix
 * it — the client revoked access, cancelled QuickBooks, removed the firm from
 * their books, or the refresh token sat unused past its ~101-day life.
 *
 * Never retry these. A retry loop against `invalid_grant` accomplishes nothing
 * and buries the one signal the dashboard needs to show a Reconnect button.
 */
export class QuickBooksAuthError extends QuickBooksError {
  constructor(message: string, code = "invalid_grant") {
    super(message, 401, code, false);
    this.name = "QuickBooksAuthError";
  }
}

/**
 * Our app credentials or environment are wrong. Nothing about any individual
 * connection will fix it, so callers must NOT mark connections as needing
 * reconnection when they see this.
 */
export class QuickBooksConfigError extends QuickBooksError {
  constructor(message: string) {
    super(message, 500, "quickbooks_misconfigured", false);
    this.name = "QuickBooksConfigError";
  }
}

/**
 * The message shown to staff next to a broken connection. Written here so the
 * wording is decided once, in terms of what someone should DO about it — a row
 * reading "invalid_grant" tells a bookkeeper nothing.
 */
export function humanMessage(err: unknown): string {
  if (err instanceof QuickBooksAuthError) {
    return "QuickBooks access was revoked or expired — reconnect this company.";
  }
  if (err instanceof QuickBooksConfigError) {
    return "The QuickBooks app credentials are misconfigured — this affects every client.";
  }
  if (err instanceof QuickBooksError) {
    return err.retryable
      ? "QuickBooks was unavailable — the next sync will retry."
      : `QuickBooks returned an error: ${err.message}`;
  }
  return "Sync failed unexpectedly.";
}
