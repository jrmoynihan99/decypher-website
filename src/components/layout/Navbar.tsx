"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  const [open, setOpen] = useState(false);

  // the menu closes itself on navigation (view-transition clicks included)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Slide away on scroll down, return on any scroll up; always shown near the
  // top of the page. Small deadzone so trackpad jitter doesn't toggle it.
  // While the mobile menu is open the bar stays put.
  useEffect(() => {
    if (open) {
      setHidden(false);
      return;
    }
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
  }, [open]);

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
      <div className="flex h-[70px] items-center justify-between gap-6 px-5 md:px-7">
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

        {/* desktop row */}
        <div className="hidden flex-wrap items-center justify-end gap-[26px] md:flex">
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

        {/* mobile hamburger — 44px hit area */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="-mr-2 flex h-11 w-11 cursor-pointer flex-col items-center justify-center gap-[7px] border-0 bg-transparent p-0 md:hidden"
        >
          <span
            className={`block h-[1.5px] w-[22px] bg-fog transition-transform duration-300 ${
              open ? "translate-y-[4.25px] rotate-45" : ""
            }`}
          />
          <span
            className={`block h-[1.5px] w-[22px] bg-fog transition-transform duration-300 ${
              open ? "-translate-y-[4.25px] -rotate-45" : ""
            }`}
          />
        </button>
      </div>

      {/* mobile menu panel */}
      <AnimatePresence>
        {open && (
          <motion.nav
            key="mobile-menu"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            className="overflow-hidden border-t border-edge-soft md:hidden"
          >
            <div className="flex flex-col px-5 pb-6 pt-2">
              {links.map((l) => {
                const active = l.href === pathname;
                return (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`border-b border-edge-soft py-[14px] font-mono text-[13px] uppercase tracking-[0.16em] no-underline transition-colors ${
                      active ? "text-magenta" : "text-mist"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
              <div className="pt-5 text-center">
                <ConsultButton size="sm" />
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
