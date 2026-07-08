"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False during SSR and the hydration render, true immediately after. Use to
 * defer trees whose real variant depends on client-only signals (viewport,
 * pointer type) — the server-rendered fallback stays up until we can tell.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
