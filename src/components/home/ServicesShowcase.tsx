"use client";

import { useRef, useState } from "react";
import NeuralWeb from "@/components/effects/NeuralWeb";
import ServicesAtlas from "@/components/home/services-variants/ServicesAtlas";
import ServicesFlyover from "@/components/home/services-variants/ServicesFlyover";

/**
 * Home-page services section: the two neural-web finalists with a small
 * temporary toggle for side-by-side evaluation. It also owns the sections
 * BELOW services (passed as children — Testimonials/FAQ/CTA) because the
 * web treatment differs per variant:
 *
 * - NEURAL ATLAS: truly unified — the stage's own canvas (camera, hubs,
 *   dot simulation and all) bleeds down behind the children, so it's ONE
 *   mesh from the map to the final CTA. No separate NeuralWeb.
 * - THE FLYOVER: its mesh is pinned inside a sticky viewport and can't
 *   bleed, so the children get the classic background NeuralWeb and the
 *   seam crossfades like every other section boundary on the page.
 *
 * Once a winner is picked, delete the toggle and the losing branch.
 */
export default function ServicesShowcase({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [mode, setMode] = useState<"atlas" | "flyover">("atlas");
  const groupRef = useRef<HTMLDivElement>(null);

  const toggle = (
    <div className="relative flex items-center justify-center gap-2.5 px-6 pb-16 pt-5">
      <span className="mr-1.5 font-mono text-[10px] tracking-[0.24em] text-faint">
        [ VARIANT ]
      </span>
      {(["atlas", "flyover"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`rounded-full border px-4 py-1.5 font-mono text-[11px] tracking-[0.12em] transition-colors ${
            mode === m
              ? "border-magenta bg-panel text-fog shadow-[0_0_18px_rgba(255,45,120,.18)]"
              : "border-edge-bright text-mist hover:border-magenta/60 hover:text-fog"
          }`}
        >
          {m === "atlas" ? "NEURAL ATLAS" : "THE FLYOVER"}
        </button>
      ))}
    </div>
  );

  return mode === "atlas" ? (
    <div ref={groupRef} className="relative z-[1]">
      <ServicesAtlas key="atlas" bleedTo={groupRef} />
      {toggle}
      {children}
    </div>
  ) : (
    <>
      <ServicesFlyover key="flyover" />
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 320px, #000 calc(100% - 220px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 320px, #000 calc(100% - 220px), transparent 100%)",
          }}
        />
        {toggle}
        {children}
      </div>
    </>
  );
}
