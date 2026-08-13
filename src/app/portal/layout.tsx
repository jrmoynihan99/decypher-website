/** Staff portal chrome. Lives outside the (site) group, so it inherits the root
 *  layout's fonts and tokens but none of the marketing nav/footer/smooth-scroll
 *  — same trick as /studio. */

import { PortalThemeScope } from "@/components/portal/PortalTheme";

export const metadata = {
  title: "DeCypher Portal",
  // The portal isn't secret — it's protected — but there's no reason for it to
  // turn up in search results either.
  robots: { index: false, follow: false },
};

/**
 * Never prerender anything under /portal.
 *
 * Not belt-and-braces — load-bearing. The session check short-circuits before
 * it reads cookies() when Firebase env vars are absent, so a build without them
 * gives Next no dynamic signal and it happily bakes these pages into a static
 * redirect. That would make the gate depend on build-time env rather than on
 * the request. Pin it instead of relying on inference.
 */
export const dynamic = "force-dynamic";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-night">
      {/* Stamp the stored theme before first paint — PortalThemeScope re-stamps
          on hydration and cleans up on the way out, but only this inline script
          prevents a dark flash on a hard load of a light-theme portal. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{document.documentElement.dataset.portalTheme=localStorage.getItem("dcy-portal-theme")==="light"?"light":"dark"}catch(e){}`,
        }}
      />
      <PortalThemeScope />
      {children}
    </div>
  );
}
