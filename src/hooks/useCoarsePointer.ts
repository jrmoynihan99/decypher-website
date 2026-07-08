"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Reactive coarse-pointer (touch) flag. Server-renders as false and, on a
 * client-side navigation, resolves to the real value on the FIRST render (the
 * component mounts client-only, so there's no post-hydration correction) — so
 * touch-tuned styles don't swap a frame late mid page-transition. On the very
 * first page load it still corrects once right after hydration, like
 * [[useIsMobile]].
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
