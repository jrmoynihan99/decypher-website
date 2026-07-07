"use client";

/**
 * Module-level flag tracking whether a page transition is in progress.
 * Reveal animations read this on mount to delay their start until
 * the view transition completes.
 */

import { useState, useEffect } from "react";

// Seconds — how long reveals hold after a navigation starts. Deliberately
// independent of the CSS transition duration: reveals kicking in before the
// transition fully settles is the intended feel. Tune by eye, not by math.
const TRANSITION_DURATION = 0.4;

let transitioning = false;
let transitionEndTime = 0;

export function markTransitionStart() {
  transitioning = true;
  transitionEndTime = Date.now() + TRANSITION_DURATION * 1000;
  setTimeout(() => {
    transitioning = false;
  }, TRANSITION_DURATION * 1000);
}

/** Returns the delay (in seconds) reveals should add if a transition is active. */
export function getRevealDelay(): number {
  return transitioning ? TRANSITION_DURATION : 0;
}

/**
 * Hook version of getRevealDelay. Returns TRANSITION_DURATION during a
 * page transition, then drops to 0 once the transition ends.
 * Above-the-fold reveals keep the delay (they trigger before it resets).
 * Below-the-fold reveals get 0 by the time the user scrolls to them.
 */
export function useRevealDelay(): number {
  const [delay, setDelay] = useState(getRevealDelay);

  useEffect(() => {
    if (delay > 0) {
      const remaining = Math.max(0, transitionEndTime - Date.now());
      const timer = setTimeout(() => setDelay(0), remaining);
      return () => clearTimeout(timer);
    }
  }, [delay]);

  return delay;
}
