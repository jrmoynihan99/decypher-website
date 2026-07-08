"use client";

import DecryptOnView from "@/components/ui/DecryptOnView";
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
    <section id="services" className="relative px-6 pb-[90px] pt-[96px]">
      <div className="mx-auto max-w-[640px]">
        <div className="text-center">
          <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            {content.eyebrow}
          </p>
          <DecryptOnView
            as="h2"
            text={content.title ?? ""}
            className="mt-4 font-display text-[clamp(30px,8.5vw,44px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
          />
          <p className="mx-auto mb-0 mt-4 max-w-[46ch] text-[15px] leading-relaxed text-mist">
            Five services, one network.
          </p>
        </div>

        <div className="mt-10 space-y-5">
          {services.map((svc, i) => {
            const color = HUB_COLORS[i % HUB_COLORS.length];
            return (
              <article
                key={svc.num}
                className="relative overflow-hidden rounded-[20px] border border-edge-mid bg-panel/90 p-6"
              >
                {/* node-colored corner glow — each card reads as one lit hub
                    from the desktop map */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-12 -top-12 h-[150px] w-[150px] rounded-full opacity-20 blur-2xl"
                  style={{ background: color }}
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
