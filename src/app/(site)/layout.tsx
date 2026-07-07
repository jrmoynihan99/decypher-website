import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import { ConsultCtaProvider } from "@/context/ConsultCtaContext";
import { getSiteSettings } from "@/sanity/queries";
import Providers from "../Providers";

/** Site chrome (nav, footer, smooth scroll, view transitions) — the Studio
 *  at /studio lives outside this group and renders bare. */
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings();
  return (
    <Providers>
      <ConsultCtaProvider value={settings?.consultCta}>
        <Navbar links={settings?.navLinks ?? []} logo={settings?.logo} />
        {children}
        <Footer settings={settings} />
      </ConsultCtaProvider>
    </Providers>
  );
}
