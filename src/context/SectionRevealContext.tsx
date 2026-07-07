"use client";

import { createContext, useContext } from "react";

/**
 * Broadcast from <SectionReveal> to every reveal component inside it: instead
 * of each reveal watching the viewport on its own, they all fire together the
 * moment the section crosses into view — per-reveal `delay` props then
 * choreograph the stagger.
 */
export type SectionRevealState = {
  triggered: boolean;
};

export const SectionRevealContext = createContext<SectionRevealState | null>(
  null,
);

/** Null outside a <SectionReveal>, so reveals fall back to self-triggering. */
export function useSectionReveal(): SectionRevealState | null {
  return useContext(SectionRevealContext);
}
