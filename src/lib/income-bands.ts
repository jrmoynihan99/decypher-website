/**
 * The income bands the live Calendly "Ads Routing Form" offers, in its order.
 *
 * Lives apart from lib/calendly.ts so the client form can import them without
 * dragging the server-only Calendly client (and its token access) into the
 * browser bundle. The server's routing rule reads them from here too, so the
 * dropdown and the rule can't drift apart.
 */
export const INCOME_BANDS = [
  "Under $50k",
  "$50K to $100k",
  "$100K to $250k",
  "$250K to $1M",
  "$1M+",
] as const;

export type IncomeBand = (typeof INCOME_BANDS)[number];

/** The only band that routes to the ☎️ call. See eventTypeForBand. */
export const UNQUALIFIED_BAND: IncomeBand = "Under $50k";
