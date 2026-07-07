"use client";

import { useEffect, useState } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

/**
 * Lenis smooth scrolling, desktop-only.
 *
 * The provider is always mounted (in `root` mode it drives the real window
 * scroll and adds no wrapper element), so we never remount the page tree —
 * we just toggle `smoothWheel` via options. That avoids a flash on load.
 *
 * Smoothing is enabled only on desktop pointers (>= 768px + fine pointer) and
 * is left off when the user prefers reduced motion. Touch is never hijacked
 * (`syncTouch: false`), so phones and tablets keep 100% native scrolling.
 *
 * Lenis updates the native scroll position, so framer-motion `useScroll`
 * effects and the view-transition scroll restoration in Providers.tsx keep
 * working unchanged.
 */
export default function SmoothScroll({
  children,
}: {
  children: React.ReactNode;
}) {
  const [smooth, setSmooth] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSmooth(desktop.matches && !reduce.matches);

    update();
    desktop.addEventListener("change", update);
    reduce.addEventListener("change", update);
    return () => {
      desktop.removeEventListener("change", update);
      reduce.removeEventListener("change", update);
    };
  }, []);

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.15,
        wheelMultiplier: 1,
        smoothWheel: smooth,
        syncTouch: false,
        // Same-page hash links (#proof etc.) — CSS scroll-behavior:smooth
        // was removed (it fights Lenis and the view-transition scroll
        // restoration), so Lenis takes over anchor scrolling instead.
        anchors: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
