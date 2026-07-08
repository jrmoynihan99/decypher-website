"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  ViewTransitions,
  useTransitionRouter,
} from "next-view-transitions";
import { markTransitionStart } from "@/lib/transition-timing";
import { freezeCanvasLayers, unfreezeCanvasLayers } from "@/lib/canvas-freeze";
import SmoothScroll from "@/components/layout/SmoothScroll";

/**
 * Intercepts clicks on internal <a> tags and wraps the navigation
 * with document.startViewTransition() via useTransitionRouter().
 * Also manages scroll position manually so it doesn't conflict
 * with the view transition animation.
 */
let pendingScroll: number | null = null;
let currentPath = "";
const scrollPositions = new Map<string, number>();

function TransitionInterceptor() {
  const router = useTransitionRouter();
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  // Apply pending scroll inside the view transition's update window.
  // useLayoutEffect fires after React commits the new route but before
  // the library's useEffect resolves the transition promise — so the
  // old snapshot is already captured and the new snapshot hasn't been yet.
  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (pendingScroll !== null) {
      const scroll = pendingScroll;
      pendingScroll = null;
      // Defer scroll by one frame so Safari's view-transition pseudo-elements
      // are fully composited before we move the real DOM underneath.
      requestAnimationFrame(() => {
        window.scrollTo(0, scroll);
        // Remove the overflow clip after the pseudo-elements are composited
        document.documentElement.classList.remove("vt-transitioning");
      });
    }
  }, [pathname]);

  useEffect(() => {
    // On fresh page load (or refresh), ensure browser handles scroll natively.
    // Only switch to "manual" on the first in-app navigation (click/popstate).
    history.scrollRestoration = "auto";
    currentPath = window.location.pathname;

    // Continuously track scroll position for the current page
    let scrollTimer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrollPositions.set(currentPath, window.scrollY);
      }, 100);
    };

    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Let browser handle modified clicks (new tab, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = anchor.getAttribute("target");
      if (target && target !== "_self") return;

      // Same-page hash links (#proof, /#proof while on "/") must NOT hit the
      // browser's fragment navigation: the history entry it pushes fires a
      // popstate that next-view-transitions turns into a spurious page
      // transition. Prevent the default — Lenis (anchors: true) still scrolls.
      const hashIndex = href.indexOf("#");
      if (hashIndex !== -1) {
        const path = href.slice(0, hashIndex);
        if (path === "" || path === window.location.pathname) {
          e.preventDefault();
          return;
        }
      }

      if (!href.startsWith("/")) return;

      // Don't transition to the page we're already on
      const cleanHref = href.split("?")[0].split("#")[0];
      if (cleanHref === currentPath) return;

      // Switch to manual scroll restoration on first navigation
      history.scrollRestoration = "manual";

      // Save scroll for the page we're leaving
      scrollPositions.set(currentPath, window.scrollY);
      currentPath = href.split("?")[0].split("#")[0];
      pendingScroll = 0; // New page starts at top

      // Clip overflow during transition to prevent Safari's single-frame
      // scroll-to-top flash (its compositor doesn't overlay the transition
      // pseudo-elements synchronously on the first frame).
      document.documentElement.classList.add("vt-transitioning");

      e.preventDefault();
      // Bake canvas layers into backgrounds so they survive the snapshot
      // (must run before the transition captures the old page — see
      // canvas-freeze). The leaving page unmounts, so unfreeze is just a
      // safety net for anything that outlives the wipe.
      freezeCanvasLayers();
      markTransitionStart();
      router.push(href, { scroll: false });
      window.setTimeout(unfreezeCanvasLayers, 1000);
    };

    const onPopState = () => {
      // Switch to manual scroll restoration on first back/forward
      history.scrollRestoration = "manual";

      // Save scroll for the page we're leaving
      scrollPositions.set(currentPath, window.scrollY);
      currentPath = window.location.pathname;
      pendingScroll = scrollPositions.get(currentPath) ?? 0;

      document.documentElement.classList.add("vt-transitioning");
      freezeCanvasLayers();
      markTransitionStart();
      window.setTimeout(unfreezeCanvasLayers, 1000);
    };

    // ── Hover prefetch ──────────────────────────────────────
    // Pre-warm routes on hover so the RSC payload is cached by
    // click-time, making view transition animations start instantly.
    const prefetched = new Set<string>();
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;

    const handlePointerEnter = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      const anchor = e.target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;

      const cleanHref = href.split("?")[0].split("#")[0];
      if (cleanHref === currentPath) return;
      if (prefetched.has(cleanHref)) return;

      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        prefetched.add(cleanHref);
        router.prefetch(href);
      }, 65);
    };

    const handlePointerLeave = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest("a")) clearTimeout(hoverTimer);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("pointerenter", handlePointerEnter, true);
    document.addEventListener("pointerleave", handlePointerLeave, true);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(hoverTimer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("pointerenter", handlePointerEnter, true);
      document.removeEventListener("pointerleave", handlePointerLeave, true);
    };
  }, [router]);

  return null;
}

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ViewTransitions>
      <TransitionInterceptor />
      {/* Parked offscreen; snapshotted and animated by the "slide" variant */}
      <div aria-hidden className="vt-curtain" />
      {/* Parked offscreen; snapshotted and animated by the "wipe" variant */}
      <div aria-hidden className="vt-scanline" />
      <SmoothScroll>{children}</SmoothScroll>
    </ViewTransitions>
  );
}
