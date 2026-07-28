/**
 * Chrome for the legal pages.
 *
 * These documents live in the repo rather than in Sanity on purpose: a change to
 * a privacy policy or a licence agreement should go through review and leave a
 * commit behind, not be editable in a CMS by whoever happens to be logged in.
 *
 * Scope note — they cover the DeCypher PORTAL (the staff application), not the
 * marketing site, which has its own long-standing policy. Keeping them separate
 * is deliberate: the portal processes client financial data pulled from
 * QuickBooks, and Intuit's app review expects a policy that actually describes
 * that. A single blended document would end up vaguer about both.
 *
 * The typographic primitives live in components/legal/prose.
 */

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[760px] px-5 pb-28 pt-32 sm:px-8 sm:pt-40">
      <div className="text-[15px] leading-[1.75] text-muted">{children}</div>
    </main>
  );
}
