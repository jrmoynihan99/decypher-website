"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import fallbackLogo from "@/assets/decypher-mark.png";
import ConsultButton from "@/components/ui/ConsultButton";
import { useIsMobile } from "@/hooks/useIsMobile";
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
  const isMobile = useIsMobile();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  // the menu closes itself on navigation (view-transition clicks included)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // the overlay is mobile-only markup — leaving the breakpoint discards it
  useEffect(() => {
    if (!isMobile) setOpen(false);
  }, [isMobile]);

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

  // Scroll lock while the overlay is up. Touch scrolling is native (Lenis
  // never hijacks it), so overflow:hidden on both roots is enough.
  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Mobile bar is transparent (glass is md+ only), so a hidden bar must also
  // stop eating taps — it fades in place instead of sliding off-screen.
  const tap = hidden ? "pointer-events-none" : "pointer-events-auto";

  return (
    <>
      <motion.div
        initial={reduced ? false : { y: "-100%" }}
        animate={
          isMobile
            ? { y: 0, opacity: !reduced && hidden ? 0 : 1 }
            : { y: !reduced && hidden ? "-100%" : 0, opacity: 1 }
        }
        transition={{
          duration: reduced ? 0 : isMobile ? 0.3 : 0.6,
          ease: [0.08, 0.82, 0.17, 1] as [number, number, number, number],
        }}
        className="pointer-events-none sticky top-0 z-[100] md:pointer-events-auto md:border-b md:border-edge-soft md:bg-night/40 md:backdrop-blur-[24px]"
      >
        <div className="flex h-[70px] items-center justify-between gap-6 px-5 md:px-7">
          <Link
            href="/"
            className={`flex flex-none items-center no-underline ${tap}`}
          >
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

          {/* mobile hamburger — 44px hit area, morphs to an X */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className={`relative -mr-2 flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 md:hidden ${tap}`}
          >
            <span
              className={`absolute h-[1.5px] w-[22px] bg-fog transition-all duration-300 ease-in-out ${
                open ? "rotate-45" : "-translate-y-[7px]"
              }`}
            />
            <span
              className={`absolute h-[1.5px] w-[22px] bg-fog transition-all duration-300 ease-in-out ${
                open ? "scale-x-0 opacity-0" : ""
              }`}
            />
            <span
              className={`absolute h-[1.5px] w-[22px] bg-fog transition-all duration-300 ease-in-out ${
                open ? "-rotate-45" : "translate-y-[7px]"
              }`}
            />
          </button>
        </div>
      </motion.div>

      {/* mobile menu — full-screen overlay below the bar (z-[90] < z-[100])
          so the logo and X stay visible and tappable on top of it. Near-solid
          night instead of backdrop-blur: the canvases keep animating behind
          it, and blur over a live canvas re-filters every frame on phones. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[90] bg-night/95 md:hidden"
            onClick={() => setOpen(false)}
          >
            <nav className="flex h-full flex-col overflow-y-auto px-6 pb-12 pt-24">
              {links.map((l, i) => {
                const active = l.href === pathname;
                return (
                  <motion.div
                    key={l.label}
                    initial={reduced ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: reduced ? 0 : 0.4,
                      ease: "easeOut",
                      delay: reduced ? 0 : 0.08 + i * 0.05,
                    }}
                  >
                    <Link
                      href={l.href}
                      className={`block py-3 font-display text-3xl font-semibold no-underline transition-colors ${
                        active ? "text-magenta" : "text-fog"
                      }`}
                    >
                      {l.label}
                    </Link>
                  </motion.div>
                );
              })}
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduced ? 0 : 0.4,
                  ease: "easeOut",
                  delay: reduced ? 0 : 0.08 + links.length * 0.05,
                }}
                className="pt-8"
              >
                <ConsultButton size="sm" />
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
