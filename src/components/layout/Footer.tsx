import Image from "next/image";
import fallbackLogo from "@/assets/decypher-mark.png";
import type { SiteSettings } from "@/sanity/types";

const footerLink =
  "text-[14.5px] text-mist no-underline transition-colors hover:text-fog";
const footerHeading =
  "m-0 mb-1 font-mono text-[11px] uppercase tracking-[0.22em] text-magenta";

/** Strip a display phone like "(978) 409-4901" down to a tel: href. */
const telHref = (phone: string) => `tel:+1${phone.replace(/\D/g, "")}`;

export default function Footer({ settings }: { settings: SiteSettings | null }) {
  const f = settings?.footer;
  const logo = settings?.logo;
  return (
    <footer className="relative z-[1] border-t border-edge-soft bg-night px-6 pb-[70px] pt-[60px]">
      <div className="mx-auto grid max-w-[1160px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-10">
        <div className="flex flex-col gap-3.5">
          {logo ? (
            <Image
              src={logo.url}
              alt="DeCypher Financials"
              width={logo.width}
              height={logo.height}
              className="block h-8 w-auto self-start"
            />
          ) : (
            <Image
              src={fallbackLogo}
              alt="DeCypher Financials"
              className="block h-8 w-auto self-start"
            />
          )}
          {f?.tagline && (
            <p className="m-0 font-mono text-[11.5px] tracking-[0.14em] text-dusk">
              {f.tagline}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          <p className={footerHeading}>Explore</p>
          {(f?.exploreLinks ?? []).map((l) => (
            <a key={l.label} href={l.href} className={footerLink}>
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <p className={footerHeading}>Stay in touch</p>
          {f?.phone && (
            <a href={telHref(f.phone)} className={footerLink}>
              {f.phone}
            </a>
          )}
          {f?.address && (
            <span className="text-[14.5px] text-mist">{f.address}</span>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          <p className={footerHeading}>Follow us</p>
          {(f?.socialLinks ?? []).map((l) => (
            <a key={l.label} href={l.href} className={footerLink}>
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <p className={footerHeading}>Legal</p>
          {(f?.legalLinks ?? []).map((l) => (
            <a key={l.label} href={l.href} className={footerLink}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
      {f?.copyright && (
        <p className="mx-auto mt-11 max-w-[1160px] border-t border-edge-soft pt-6 font-mono text-[11px] tracking-[0.12em] text-faint">
          {f.copyright}
        </p>
      )}
    </footer>
  );
}
