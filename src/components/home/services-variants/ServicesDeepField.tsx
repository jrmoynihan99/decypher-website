"use client";

import { useEffect, useRef, useState } from "react";
import DecryptOnView from "@/components/ui/DecryptOnView";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SERVICES_FIVE } from "@/lib/content";
import { cancelDecrypt, decryptTo } from "@/lib/decrypt";
import NeuralStage, {
  HUBS,
  HUB_COLORS,
  NODE_TAGS,
  OVERVIEW,
  focusZoom,
  type Cam,
  type StageMetrics,
} from "@/components/home/services-variants/NeuralStage";

/**
 * SERVICES VARIANT 11 — "DEEP FIELD"
 *
 * No popups, no reveals: the five service dossiers physically live on the
 * neural map, wired into the backbone, at all times. From orbit you can read
 * every headline and promise — the body copy is simply too far away. Hover a
 * dossier and the camera closes the distance until it fills your view, its
 * strands igniting as you arrive; pull away and you drift back to orbit.
 * The information was always there — you just fly closer.
 */

const PANE_W = 420;
const BASE_ENERGY = 0.12;

export default function ServicesDeepField() {
  const reduced = useReducedMotion();
  const target = useRef<Cam>({ ...OVERVIEW });
  const energy = useRef<number[]>(HUBS.map(() => BASE_ENERGY));
  const metrics = useRef<StageMetrics>({ fit: 0.75, sw: 1200, sh: 800 });
  const promiseRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const rangeRef = useRef<HTMLSpanElement>(null);

  const [focus, setFocus] = useState(-1);
  const focusRef = useRef(-1);
  const outTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flyIn = (i: number) => {
    clearTimeout(outTimer.current);
    if (focusRef.current === i) return;
    focusRef.current = i;
    setFocus(i);
    const hub = HUBS[i];
    target.current = {
      x: hub.x,
      y: hub.y,
      z: focusZoom(metrics.current, 640, 480),
    };
    energy.current = HUBS.map((_, j) => (j === i ? 1 : 0.04));
    decryptTo(promiseRefs.current[i], SERVICES_FIVE[i].promise, 460);
  };

  const pullBack = () => {
    clearTimeout(outTimer.current);
    focusRef.current = -1;
    setFocus(-1);
    target.current = { ...OVERVIEW };
    energy.current = HUBS.map(() => BASE_ENERGY);
  };

  const scheduleOut = () => {
    clearTimeout(outTimer.current);
    outTimer.current = setTimeout(pullBack, 160);
  };

  // While locked on, the pane slides out from under the cursor as the camera
  // centers it — so pane mouseleave can't drive the pull-back (it would
  // oscillate). The lock holds until the cursor drifts into the edge band.
  const onStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (focusRef.current < 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    if (Math.abs(dx) > 0.86 || Math.abs(dy) > 0.88) scheduleOut();
    else clearTimeout(outTimer.current);
  };

  useEffect(() => {
    const promises = [...promiseRefs.current];
    return () => {
      clearTimeout(outTimer.current);
      promises.forEach(cancelDecrypt);
    };
  }, []);

  const onFrame = (cam: Readonly<Cam>) => {
    // "range to target" readout — pure flavor, driven by real camera altitude
    if (rangeRef.current)
      rangeRef.current.textContent = `ALT ${(1000 / cam.z).toFixed(0)} · Z ×${cam.z.toFixed(2)}`;
  };

  /* reduced motion: flat, fully readable grid */
  if (reduced) {
    return (
      <section id="services" className="relative z-[1] px-6 pb-[120px] pt-[110px]">
        <div className="mx-auto max-w-[1180px]">
          <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            [ 05 // services ]
          </p>
          <h2 className="mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog">
            One stop shop for your creator business.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES_FIVE.map((svc) => (
              <article
                key={svc.num}
                className="rounded-[20px] border border-edge-mid bg-panel p-6"
              >
                <div className="font-mono text-[12.5px] tracking-[0.14em] text-magenta">
                  {svc.num}
                </div>
                <h3 className="mt-2.5 font-display text-[22px] font-semibold tracking-[-0.01em] text-fog">
                  {svc.title}
                </h3>
                <p className="mb-0 mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-magenta">
                  {svc.promise}
                </p>
                <p className="mb-0 mt-3 text-[14.5px] leading-[1.62] text-mist">
                  {svc.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="services" className="relative z-[1] px-6 pb-[120px] pt-[110px]">
      <div className="mx-auto max-w-[1320px]">
        <div className="mx-auto max-w-[760px] text-center">
          <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            [ 05 // services ]
          </p>
          <DecryptOnView
            as="h2"
            text="One stop shop for your creator business."
            className="mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
          />
          <p className="mx-auto mt-[18px] max-w-[54ch] text-base leading-relaxed text-mist">
            Everything is already on the map &mdash; hover a dossier to fly
            close enough to read the fine print.
          </p>
        </div>

        <div
          className="relative mt-10 h-[min(82vh,820px)] overflow-hidden rounded-[24px] border border-edge bg-night/40"
          onMouseMove={onStageMove}
          onMouseLeave={() => {
            if (focusRef.current >= 0) scheduleOut();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") pullBack();
          }}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("[data-pane]")) pullBack();
          }}
        >
          <NeuralStage
            target={target}
            energy={energy}
            onMetrics={(m) => {
              metrics.current = m;
            }}
            onFrame={onFrame}
          >
            {SERVICES_FIVE.map((svc, i) => {
              const hub = HUBS[i];
              const focused = focus === i;
              const dimmed = focus >= 0 && !focused;
              return (
                <article
                  key={svc.num}
                  data-pane
                  tabIndex={0}
                  role="button"
                  aria-label={`Fly into ${svc.title}`}
                  onMouseEnter={() => flyIn(i)}
                  onFocus={() => flyIn(i)}
                  onBlur={scheduleOut}
                  onClick={() => (focused ? pullBack() : flyIn(i))}
                  className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-[12px] border p-[20px] outline-none transition-[opacity,border-color,box-shadow] duration-400 ${
                    focused
                      ? "border-magenta/60 bg-[#141319]/90 shadow-[0_0_70px_rgba(255,45,120,.16)]"
                      : "border-edge-mid bg-[#141319]/80"
                  } ${dimmed ? "opacity-35" : "opacity-100"}`}
                  style={{ left: hub.x, top: hub.y, width: PANE_W }}
                >
                  {/* corner brackets in the node's accent color */}
                  <span
                    aria-hidden
                    className="absolute left-[-1px] top-[-1px] h-[14px] w-[14px] rounded-tl-[12px] border-l-2 border-t-2"
                    style={{ borderColor: HUB_COLORS[i] }}
                  />
                  <span
                    aria-hidden
                    className="absolute bottom-[-1px] right-[-1px] h-[14px] w-[14px] rounded-br-[12px] border-b-2 border-r-2"
                    style={{ borderColor: HUB_COLORS[i] }}
                  />

                  {/* header — sized to read from orbit */}
                  <div className="flex items-center gap-[8px]">
                    <span
                      className="h-[8px] w-[8px] rounded-full"
                      style={{
                        background: HUB_COLORS[i],
                        boxShadow: `0 0 10px ${HUB_COLORS[i]}`,
                      }}
                    />
                    <p className="m-0 font-mono text-[9px] tracking-[0.22em] text-faint">
                      {svc.num} — {NODE_TAGS[i]}
                    </p>
                  </div>
                  <h3 className="mt-[10px] font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.015em] text-fog">
                    {svc.title}
                  </h3>
                  <p
                    ref={(el) => {
                      promiseRefs.current[i] = el;
                    }}
                    className="mb-0 mt-[8px] font-mono text-[12.5px] uppercase tracking-[0.2em] text-magenta"
                  >
                    {svc.promise}
                  </p>

                  {/* fine print — only legible once the camera closes in */}
                  <div className="mt-[12px] border-t border-edge pt-[12px]">
                    <p className="mb-0 mt-0 text-[10px] leading-[1.62] text-mist">
                      {svc.body}
                    </p>
                    {svc.chips && (
                      <div className="mt-[10px] flex flex-wrap gap-[6px]">
                        {svc.chips.map((chip) => (
                          <span
                            key={chip}
                            className="rounded-full border border-edge-bright px-[9px] py-[3px] font-mono text-[8.5px] tracking-[0.1em] text-mist"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </NeuralStage>

          {/* HUD chrome */}
          <div className="pointer-events-none absolute left-5 top-4 font-mono text-[11px] tracking-[0.22em] text-faint">
            [ DEEP FIELD — 05 DOSSIERS ]
          </div>
          <span
            ref={rangeRef}
            className="pointer-events-none absolute right-5 top-4 font-mono text-[11px] tracking-[0.18em] text-faint"
          >
            ALT 1000 · Z ×1.00
          </span>
          <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center font-mono text-[11px] tracking-[0.22em] text-faint">
            {focus >= 0 ? (
              <>
                ON STATION —{" "}
                <span className="text-magenta">
                  {NODE_TAGS[focus]}
                </span>{" "}
                · MOVE TO THE EDGE TO ASCEND
              </>
            ) : (
              "HOVER A DOSSIER TO DESCEND"
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
