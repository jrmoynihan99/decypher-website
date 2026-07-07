"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import fallbackLogo from "@/assets/decypher-mark.png";
import ConsultButton from "@/components/ui/ConsultButton";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { LinkItem } from "@/sanity/types";

export default function Navbar({
  links,
  logo,
}: {
  links: LinkItem[];
  logo?: { url: string; width: number; height: number };
}) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [hidden, setHidden] = useState(false);

  // Slide away on scroll down, return on any scroll up; always shown near the
  // top of the page. Small deadzone so trackpad jitter doesn't toggle it.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const dy = y - lastY;
      lastY = y;
      if (y < 80) setHidden(false);
      else if (dy > 2) setHidden(true);
      else if (dy < -2) setHidden(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.div
      initial={reduced ? false : { y: "-100%" }}
      animate={{ y: !reduced && hidden ? "-100%" : 0 }}
      transition={{
        duration: reduced ? 0 : 0.6,
        ease: [0.08, 0.82, 0.17, 1] as [number, number, number, number],
      }}
      className="sticky top-0 z-[100] border-b border-edge-soft bg-night/40 backdrop-blur-[24px]"
    >
      <div className="flex h-[70px] items-center justify-between gap-6 px-7">
        <Link href="/" className="flex flex-none items-center no-underline">
          {logo ? (
            <Image
              src={logo.url}
              alt="DeCypher Financials"
              width={logo.width}
              height={logo.height}
              className="block h-9 w-auto"
              priority
            />
          ) : (
            <Image
              src={fallbackLogo}
              alt="DeCypher Financials"
              className="block h-9 w-auto"
              priority
            />
          )}
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-[26px]">
          {links.map((l) => {
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
    </motion.div>
  );
}
