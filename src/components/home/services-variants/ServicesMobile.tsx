"use client";

import SectionHeading from "@/components/ui/SectionHeading";
import { HUB_COLORS } from "@/components/home/services-variants/NeuralStage";
import type { CmsService, SectionHeadingContent } from "@/sanity/types";

/**
 * SERVICES — MOBILE CUT
 *
 * The neural-map variants (Atlas / Flyover) render the 1600×1000 world at
 * ~0.23 scale on a phone — node labels come out ~4px tall, so the map is
 * unusable below md. This is the phone replacement: the same NODE language
 * and per-hub colors as the map, laid out as a plain readable stack. The
 * ambient NeuralWeb (touch-reactive) runs behind it via ServicesShowcase,
 * so the section still feels like part of the web.
 */
export default function ServicesMobile({
  content,
  services,
}: {
  content: SectionHeadingContent;
  services: CmsService[];
}) {
  return (
    <section id="services" className="relative px-4 pb-14 pt-14 md:px-6 md:pb-[90px] md:pt-[96px]">
      <SectionHeading
        eyebrow={content.eyebrow ?? ""}
        title={content.title ?? ""}
        sub="Five services, one network."
      />
      <div className="mx-auto max-w-[640px]">
        <div className="mt-8 space-y-5">
          {services.map((svc, i) => {
            const color = HUB_COLORS[i % HUB_COLORS.length];
            return (
              <article
                key={svc.num}
                className="relative overflow-hidden rounded-[20px] border border-edge-mid bg-panel/90 p-6"
              >
                {/* node-colored corner glow — each card reads as one lit hub
                    from the desktop map. Filter-FREE: softness is baked into the
                    gradient stops instead of a blur() (same reasoning as GlowOrb's
                    coarse branch). These sit over the always-on NeuralWeb canvas,
                    so a real blur() would mean 5 blurred layers re-compositing
                    every scroll frame — a mobile fill-rate wall for zero benefit. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-12 -top-12 h-[160px] w-[160px] rounded-full"
                  style={{
                    background: `radial-gradient(circle, ${color}33 0%, ${color}1f 38%, ${color}0d 58%, transparent 76%)`,
                  }}
                />
                <p
                  className="relative m-0 font-mono text-[10px] tracking-[0.26em]"
                  style={{ color, textShadow: `0 0 12px ${color}55` }}
                >
                  NODE {svc.num} — {svc.nodeTag}
                </p>
                <h3 className="relative mt-2.5 font-display text-[24px] font-semibold leading-[1.15] tracking-[-0.015em] text-fog">
                  {svc.title}
                </h3>
                <p className="relative mb-0 mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-magenta">
                  {svc.promise}
                </p>
                <p className="relative mb-0 mt-3 text-[15px] leading-[1.65] text-mist">
                  {svc.body}
                </p>
                {svc.chips && (
                  <div className="relative mt-4 flex flex-wrap gap-2">
                    {svc.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-edge-bright px-3 py-1.5 font-mono text-[10.5px] tracking-[0.1em] text-mist"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
