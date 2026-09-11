/**
 * The client-facing recap pages. Outside the (site) group on purpose: a
 * client opening their recap shouldn't land inside the marketing nav and
 * footer, and the page carries none of the site's smooth-scroll / view-
 * transition machinery — same trick as /portal and /studio.
 */

export const metadata = {
  title: "Your Tax Recap — DeCypher Financials",
  // Each page is addressed by an unguessable token and holds one client's
  // tax figures. Not secret, but never for a search index.
  robots: { index: false, follow: false },
};

/** Every recap is a Firestore read keyed on the request — never prerender. */
export const dynamic = "force-dynamic";

export default function RecapLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-night">{children}</div>;
}
