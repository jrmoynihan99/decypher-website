"use client";

import { useEffect, useSyncExternalStore } from "react";

/** localStorage key — also read pre-paint by the inline script in portal/layout.tsx. */
const STORAGE_KEY = "dcy-portal-theme";
/** Fired after every toggle so all subscribed toggles re-read the attribute. */
const THEME_EVENT = "dcy-portal-theme-change";

type PortalTheme = "dark" | "light";

function readStored(): PortalTheme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function apply(theme: PortalTheme) {
  document.documentElement.dataset.portalTheme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Owns the data-portal-theme attribute on <html> for the lifetime of the
 * portal. It must live on <html>, not the portal wrapper: portal modals
 * createPortal to <body> and would escape a wrapper-scoped theme. And it
 * must come off again on unmount — the token overrides in globals.css would
 * otherwise leak onto marketing pages after a client-side nav out of /portal.
 */
export function PortalThemeScope() {
  useEffect(() => {
    apply(readStored());
    return () => {
      delete document.documentElement.dataset.portalTheme;
    };
  }, []);
  return null;
}

/* The <html> attribute is the store; the toggle subscribes rather than
   keeping its own state, so it can't drift from what the inline script or
   PortalThemeScope stamped. The server snapshot says "dark" — after
   hydration React re-reads the client snapshot and corrects the icon. */
function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function snapshot(): PortalTheme {
  return document.documentElement.dataset.portalTheme === "light"
    ? "light"
    : "dark";
}

export function PortalThemeToggle() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "dark");

  const flip = () => {
    const next: PortalTheme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the theme just won't persist */
    }
    apply(next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-[8px] border border-edge-bright bg-transparent text-mist transition-colors hover:border-mist hover:text-fog"
    >
      {theme === "dark" ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
