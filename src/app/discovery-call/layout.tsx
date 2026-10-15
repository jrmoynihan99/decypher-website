/**
 * The sales discovery call — the screen the advisor shares with a creator.
 * Outside the (site) group and outside /portal, like the feedback survey: no
 * marketing nav, no portal sidebar for the creator to read, and none of the
 * portal's light theme (the survey skin is night-only). The page itself
 * gates on the Tax Strategy permission.
 */

export const metadata = {
  title: "Discovery call — DeCypher Financials",
  robots: { index: false, follow: false },
};

/** Gated per request — never prerender. */
export const dynamic = "force-dynamic";

export default function DiscoveryCallLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-night">{children}</div>;
}
