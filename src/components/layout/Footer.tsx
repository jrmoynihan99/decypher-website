import Image from "next/image";
import logo from "@/assets/decypher-mark.png";

const footerLink =
  "text-[14.5px] text-mist no-underline transition-colors hover:text-fog";
const footerHeading =
  "m-0 mb-1 font-mono text-[11px] uppercase tracking-[0.22em] text-magenta";

export default function Footer() {
  return (
    <footer className="relative z-[1] border-t border-edge-soft bg-night px-6 pb-[70px] pt-[60px]">
      <div className="mx-auto grid max-w-[1160px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-10">
        <div className="flex flex-col gap-3.5">
          <Image
            src={logo}
            alt="DeCypher Financials"
            className="block h-8 w-auto self-start"
          />
          <p className="m-0 font-mono text-[11.5px] tracking-[0.14em] text-dusk">
            ACCOUNTING FOR CREATORS
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className={footerHeading}>Explore</p>
          <a href="/services" className={footerLink}>
            Services
          </a>
          <a href="/creators" className={footerLink}>
            Our Creators
          </a>
          <a href="/team" className={footerLink}>
            Our Team
          </a>
          <a href="/schedule" className={footerLink}>
            Book a Call
          </a>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className={footerHeading}>Stay in touch</p>
          <a href="tel:+19784094901" className={footerLink}>
            (978) 409-4901
          </a>
          <span className="text-[14.5px] text-mist">975 Chestnut St</span>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className={footerHeading}>Follow us</p>
          <a
            href="https://www.instagram.com/we.decypher/"
            className={footerLink}
          >
            Instagram ↗
          </a>
          <a href="https://www.youtube.com/@WeDecypher" className={footerLink}>
            YouTube ↗
          </a>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className={footerHeading}>Legal</p>
          <a href="#" className={footerLink}>
            Privacy Policy
          </a>
          <a href="#" className={footerLink}>
            Terms and Conditions
          </a>
        </div>
      </div>
      <p className="mx-auto mt-11 max-w-[1160px] border-t border-edge-soft pt-6 font-mono text-[11px] tracking-[0.12em] text-faint">
        © 2026 DECYPHER FINANCIALS. ALL RIGHTS RESERVED.
      </p>
    </footer>
  );
}
