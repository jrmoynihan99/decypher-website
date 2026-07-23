"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLenis } from "lenis/react";

/**
 * Tab state for the job detail page's role file: OVERVIEW (VSL + posting) vs
 * APPLICATION (the inline form that replaces it). Lives in context because the
 * switchers are scattered — the hero CTA, the sticky sidebar, the overview
 * panel footer, and the closing band all open the application in place of the
 * old modal. `openApplication` also scrolls the role file into view (via Lenis
 * when it's driving the window scroll), since most of those buttons sit far
 * from the panel. `/careers/<slug>#apply` deep-links straight to the form.
 */

type JobTab = "overview" | "application";

const JobTabsContext = createContext<{
  tab: JobTab;
  setTab: (tab: JobTab) => void;
  openApplication: () => void;
} | null>(null);

export function JobTabsProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<JobTab>("overview");
  const lenis = useLenis();

  useEffect(() => {
    if (window.location.hash === "#apply") setTab("application");
  }, []);

  const openApplication = useCallback(() => {
    setTab("application");
    // after the panel swap has painted, bring the role file into view
    requestAnimationFrame(() => {
      const el = document.getElementById("role-file");
      if (!el) return;
      if (lenis) lenis.scrollTo(el, { offset: -90 });
      else
        window.scrollTo({
          top: el.getBoundingClientRect().top + window.scrollY - 90,
          behavior: "smooth",
        });
    });
  }, [lenis]);

  return (
    <JobTabsContext.Provider value={{ tab, setTab, openApplication }}>
      {children}
    </JobTabsContext.Provider>
  );
}

export function useJobTabs() {
  const ctx = useContext(JobTabsContext);
  if (!ctx) throw new Error("useJobTabs must be used inside JobTabsProvider");
  return ctx;
}
