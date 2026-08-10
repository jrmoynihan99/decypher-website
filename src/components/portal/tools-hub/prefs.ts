"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Which departments a person has switched off, and which sections they've
 * collapsed. Per-user, per-browser.
 *
 * localStorage rather than a field on the user document, deliberately: this is
 * a view preference, not access. Getting it wrong costs one click, and a
 * Firestore write on every pill toggle would be a round trip to store which
 * headings someone likes.
 *
 * Stored as the DEVIATIONS from the default — everything shown, everything open
 * — so a department added to the catalog next month arrives visible and
 * expanded for people who set their preferences today. Storing the positive
 * ("these are the ones I want") would silently hide every future department
 * from everyone who has ever touched a pill.
 *
 * Read through useSyncExternalStore rather than copied into state by an effect,
 * matching sales/grid.tsx: getServerSnapshot returns the defaults, so the markup
 * the server renders matches the markup React hydrates with, and the stored
 * preference lands on the very next render instead of after a paint. The cache
 * is what makes it legal — getSnapshot has to return the same reference until
 * something actually changes, and re-parsing the JSON each call would hand React
 * a new object every render and spin forever.
 */

export type HubPrefs = {
  /** Department ids whose pill is off. */
  hidden: string[];
  /** Department ids whose section is collapsed. */
  collapsed: string[];
};

const STORAGE = "toolshub:prefs:v1:";
const EMPTY: HubPrefs = { hidden: [], collapsed: [] };

const cache = new Map<string, HubPrefs>();
const listeners = new Set<() => void>();

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

function read(userId: string): HubPrefs {
  const hit = cache.get(userId);
  if (hit) return hit;
  let parsed = EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE + userId);
    const value = raw ? JSON.parse(raw) : null;
    if (value && typeof value === "object") {
      parsed = {
        hidden: strings((value as HubPrefs).hidden),
        collapsed: strings((value as HubPrefs).collapsed),
      };
    }
  } catch {
    // A blocked or corrupt store just means the defaults.
  }
  cache.set(userId, parsed);
  return parsed;
}

function write(userId: string, next: HubPrefs) {
  cache.set(userId, next);
  try {
    if (next.hidden.length || next.collapsed.length) {
      window.localStorage.setItem(STORAGE + userId, JSON.stringify(next));
    } else {
      // Back to the defaults — leave nothing behind to go stale.
      window.localStorage.removeItem(STORAGE + userId);
    }
  } catch {
    // Non-fatal: the preference still applies for this session.
  }
  for (const notify of listeners) notify();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

const toggled = (list: string[], id: string): string[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export function useHubPrefs(userId: string) {
  const prefs = useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => EMPTY,
  );

  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const collapsed = useMemo(() => new Set(prefs.collapsed), [prefs.collapsed]);

  const toggleDepartment = useCallback(
    (id: string) => {
      const current = read(userId);
      write(userId, { ...current, hidden: toggled(current.hidden, id) });
    },
    [userId],
  );

  const toggleSection = useCallback(
    (id: string) => {
      const current = read(userId);
      write(userId, { ...current, collapsed: toggled(current.collapsed, id) });
    },
    [userId],
  );

  /** Expand-all / collapse-all. `ids` is only the departments on screen. */
  const setAllCollapsed = useCallback(
    (ids: string[], value: boolean) => {
      const current = read(userId);
      const rest = current.collapsed.filter((id) => !ids.includes(id));
      write(userId, { ...current, collapsed: value ? [...rest, ...ids] : rest });
    },
    [userId],
  );

  return { hidden, collapsed, toggleDepartment, toggleSection, setAllCollapsed };
}
