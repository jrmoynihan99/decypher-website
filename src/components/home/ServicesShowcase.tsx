"use client";

import { useRef } from "react";
import NeuralWeb from "@/components/effects/NeuralWeb";
import ServicesAtlas from "@/components/home/services-variants/ServicesAtlas";
import ServicesMobile from "@/components/home/services-variants/ServicesMobile";
import { useHydrated } from "@/hooks/useHydrated";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { CmsService, SectionHeadingContent } from "@/sanity/types";

/**
 * Home-page services section: the Neural Atlas. It also owns the sections
 * BELOW services (passed as children — Testimonials/FAQ/CTA) so the Atlas
 * stage's own canvas (camera, hubs, dot simulation and all) can bleed down
 * behind them — ONE mesh from the map to the final CTA, no separate
 * NeuralWeb.
 */
export default function ServicesShowcase({
  content,
  services,
  children,
}: {
  content: SectionHeadingContent;
  services: CmsService[];
  children?: React.ReactNode;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  // useIsMobile hydrates as false, so without this gate a PHONE's first
  // client render mounts the full Atlas stage (camera, hubs, dot sim) just
  // to throw it away a frame later. Serve the cheap stacked cut until we
  // actually know the viewport; on desktop the swap happens right after
  // hydration, well below the fold.
  const hydrated = useHydrated();

  // phones get the readable stacked cut — the neural map's world renders far
  // too small below md (see ServicesMobile). The touch-reactive background
  // web keeps the section (and the children below it) part of the mesh.
  if (!hydrated || mobile) {
    return (
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 260px, #000 calc(100% - 220px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 260px, #000 calc(100% - 220px), transparent 100%)",
          }}
        />
        <ServicesMobile content={content} services={services} />
        {children}
      </div>
    );
  }

  return (
    <div ref={groupRef} className="relative z-[1]">
      <ServicesAtlas content={content} services={services} bleedTo={groupRef} />
      {children}
    </div>
  );
}
