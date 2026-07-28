"use client";

import { createContext, useContext } from "react";

export interface ConsultCta {
  label: string;
  href: string;
}

const DEFAULTS: ConsultCta = {
  label: "Free Consultation",
  href: "/schedule-team",
};

const ConsultCtaContext = createContext<ConsultCta>(DEFAULTS);

/**
 * Site Settings → Consultation button, provided from the root layout so
 * every ConsultButton across the tree picks up the CMS label/link without
 * threading props through each section.
 */
export function ConsultCtaProvider({
  value,
  children,
}: {
  value?: Partial<ConsultCta> | null;
  children: React.ReactNode;
}) {
  return (
    <ConsultCtaContext.Provider
      value={{
        label: value?.label || DEFAULTS.label,
        href: value?.href || DEFAULTS.href,
      }}
    >
      {children}
    </ConsultCtaContext.Provider>
  );
}

export const useConsultCta = () => useContext(ConsultCtaContext);
