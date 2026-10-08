/**
 * The client feedback survey. Outside the (site) group on purpose, like the
 * recap pages: a client answering a survey shouldn't land inside the
 * marketing nav and footer, and the page carries none of the site's
 * smooth-scroll / view-transition machinery.
 */

export const metadata = {
  title: "Your feedback — DeCypher Financials",
  // Every link is one client's, with their name (and their team's) in it.
  // Never for a search index.
  robots: { index: false, follow: false },
};

/** The page reads its link and checks Firestore per request — never prerender. */
export const dynamic = "force-dynamic";

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-night">{children}</div>;
}
