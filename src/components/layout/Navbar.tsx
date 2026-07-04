"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import logo from "@/assets/decypher-mark.png";
import ConsultButton from "@/components/ui/ConsultButton";

const LINKS = [
  { href: "/creators", label: "Our Creators" },
  { href: "/#services", label: "Services" },
  { href: "/team", label: "Our Team" },
  { href: "#", label: "Client Portal ↗" },
];

export default function Navbar() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-[100] border-b border-edge-soft bg-night/40 backdrop-blur-[24px]">
      <div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between gap-6 px-7">
        <Link href="/" className="flex flex-none items-center no-underline">
          <Image
            src={logo}
            alt="DeCypher Financials"
            className="block h-9 w-auto"
            priority
          />
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-[26px]">
          {LINKS.map((l) => {
            const active = l.href === pathname;
            return (
              <Link
                key={l.label}
                href={l.href}
                className={`font-mono text-[11.5px] uppercase tracking-[0.16em] no-underline transition-colors ${
                  active ? "text-magenta" : "text-muted hover:text-fog"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <ConsultButton size="sm" />
        </div>
      </div>
    </div>
  );
}
