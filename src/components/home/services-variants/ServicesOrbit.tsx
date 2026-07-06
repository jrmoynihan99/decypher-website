"use client";

import { useEffect, useRef, useState } from "react";
import ServicesTicker from "@/components/home/services-variants/ServicesTicker";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { SERVICES } from "@/lib/content";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cancelDecrypt, decryptTo, encrypt, scramble } from "@/lib/decrypt";

/**
 * SERVICES VARIANT 04 — "THE ORBITAL VAULT"
 *
 * The three service files orbit a holographic core in real 3D. Grab the ring
 * and throw it — momentum spins it, then it snaps to the nearest detent. Only
 * the card facing you decrypts; the others stay veiled in cipher. Tap a side
 * card to swing it to the front, use ‹ › / arrow keys / horizontal scroll,
 * or just wait: the vault slowly rotates on its own. A compass tape tracks
 * the azimuth. Falls back to a flat grid under prefers-reduced-motion.
 */

const STEP = 120; // degrees between cards
const TH0 = -58; // initial azimuth — swings to detent 0 on first view
const R0 = 440; // server-render orbit radius (re-measured on mount)

const norm180 = (a: number) => ((a % 360) + 540) % 360 - 180;

const facingOf = (i: number, th: number) =>
  Math.cos((norm180(i * STEP + th) * Math.PI) / 180);

const cardOpacity = (f: number) => 0.35 + 0.65 * Math.max(0, f);
const veilOpacity = (f: number) => Math.min(1, Math.max(0, (1 - f) * 0.9));

const VEIL_HEX = "0000 0000 0000 0000";

export default function ServicesOrbit() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);
  const azRef = useRef<HTMLSpanElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const veilRefs = useRef<(HTMLDivElement | null)[]>([]);
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const promiseRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();

  const phys = useRef({
    th: TH0,
    vel: 0,
    snap: null as number | null,
    dragging: false,
    moved: false,
    lastX: 0,
    lastT: 0,
    downX: 0,
    downCard: -1,
    R: R0,
  });
  const activeRef = useRef(-1);
  const visibleRef = useRef(false);
  const runningRef = useRef(false);
  const rafRef = useRef(0);
  const kickRef = useRef<(() => void) | null>(null);
  const lastInteractRef = useRef(0);

  /* ---- physics + render loop ---- */

  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    const stage = stageRef.current;
    const ring = ringRef.current;
    if (!section || !stage || !ring) return;
    const o = phys.current;
    let lastT = 0;

    const render = () => {
      ring.style.transform = `translateZ(${-o.R}px) rotateY(${o.th.toFixed(3)}deg)`;
      // rewrite card transforms every frame: React re-renders (active-card
      // changes) reset the inline style to the server-render radius
      cardRefs.current.forEach((card, i) => {
        if (card)
          card.style.transform = `translate(-50%,-50%) rotateY(${i * STEP}deg) translateZ(${o.R}px)`;
      });
      let best = 0;
      let bestF = -2;
      for (let i = 0; i < SERVICES.length; i++) {
        const f = facingOf(i, o.th);
        const card = cardRefs.current[i];
        const veil = veilRefs.current[i];
        if (card) {
          card.style.opacity = cardOpacity(f).toFixed(3);
          card.style.filter = `blur(${((1 - Math.max(0, f)) * 2.5).toFixed(2)}px)`;
        }
        if (veil) veil.style.opacity = veilOpacity(f).toFixed(3);
        if (f > bestF) {
          bestF = f;
          best = i;
        }
      }
      if (best !== activeRef.current) {
        activeRef.current = best;
        setActive(best);
        decryptTo(titleRefs.current[best], SERVICES[best].title, 420);
        decryptTo(promiseRefs.current[best], SERVICES[best].promise, 460);
        for (let j = 0; j < SERVICES.length; j++) {
          if (j === best) continue;
          encrypt(titleRefs.current[j], SERVICES[j].title);
          encrypt(promiseRefs.current[j], SERVICES[j].promise);
        }
      }
      if (tapeRef.current)
        tapeRef.current.style.backgroundPositionX = `${(-o.th * 2.4).toFixed(1)}px`;
      if (azRef.current)
        azRef.current.textContent = `AZ ${(((o.th % 360) + 360) % 360).toFixed(1)}°`;
    };

    const step = (tMs: number) => {
      if (!visibleRef.current) {
        runningRef.current = false;
        return;
      }
      const dt = Math.min(0.05, (tMs - (lastT || tMs)) / 1000);
      lastT = tMs;
      if (!o.dragging) {
        if (o.snap != null) {
          o.vel += (o.snap - o.th) * 140 * dt;
          o.vel *= Math.exp(-12 * dt);
          o.th += o.vel * dt;
          if (Math.abs(o.snap - o.th) < 0.03 && Math.abs(o.vel) < 0.5) {
            o.th = o.snap;
            o.vel = 0;
            o.snap = null;
          }
        } else {
          o.th += o.vel * dt;
          o.vel *= Math.exp(-2.6 * dt);
          if (Math.abs(o.vel) < 30) o.snap = Math.round(o.th / STEP) * STEP;
        }
      }
      render();
      if (!o.dragging && o.snap == null && Math.abs(o.vel) < 0.4) {
        runningRef.current = false; // settled — sleep until the next kick
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    const kick = () => {
      if (!runningRef.current && visibleRef.current) {
        runningRef.current = true;
        lastT = 0;
        rafRef.current = requestAnimationFrame(step);
      }
    };
    kickRef.current = kick;

    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          visibleRef.current = en.isIntersecting;
          if (en.isIntersecting) kick();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(section);

    const ro = new ResizeObserver(() => {
      const w = stage.clientWidth || 1100;
      o.R = Math.max(210, Math.min(460, w * 0.36));
      kick();
    });
    ro.observe(stage);

    // slow auto-advance while idle
    const auto = setInterval(() => {
      if (!visibleRef.current || o.dragging || o.snap != null) return;
      if (performance.now() - lastInteractRef.current < 3800) return;
      o.snap = Math.round(o.th / STEP) * STEP - STEP;
      kick();
    }, 4000);

    // horizontal wheel / shift+wheel spins the ring; vertical scroll passes through
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      const useX = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!useX && !e.shiftKey) return;
      e.preventDefault();
      lastInteractRef.current = performance.now();
      o.snap = null;
      o.th -= (useX ? e.deltaX : e.deltaY) * 0.12;
      o.vel = 0;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        o.snap = Math.round(o.th / STEP) * STEP;
        kick();
      }, 150);
      kick();
    };
    stage.addEventListener("wheel", onWheel, { passive: false });

    // cipher veils flicker
    const veilNodes = Array.from(
      stage.querySelectorAll<HTMLElement>("[data-veil]"),
    );
    const churn = setInterval(() => {
      for (const n of veilNodes) n.textContent = scramble(n.dataset.text || "");
    }, 280);

    const titles = [...titleRefs.current];
    const promises = [...promiseRefs.current];
    return () => {
      io.disconnect();
      ro.disconnect();
      clearInterval(auto);
      clearInterval(churn);
      clearTimeout(wheelTimer);
      stage.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      kickRef.current = null;
      titles.forEach(cancelDecrypt);
      promises.forEach(cancelDecrypt);
    };
  }, [reduced]);

  /* ---- input ---- */

  const interact = () => {
    lastInteractRef.current = performance.now();
  };

  const focusCard = (i: number) => {
    const o = phys.current;
    interact();
    o.vel = 0;
    o.snap = o.th - norm180(i * STEP + o.th);
    kickRef.current?.();
  };

  const stepCard = (dir: 1 | -1) => {
    const o = phys.current;
    interact();
    const base = o.snap ?? Math.round(o.th / STEP) * STEP;
    o.vel = 0;
    o.snap = base - dir * STEP;
    kickRef.current?.();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const o = phys.current;
    interact();
    o.dragging = true;
    o.moved = false;
    o.snap = null;
    o.vel = 0;
    o.lastX = e.clientX;
    o.lastT = e.timeStamp;
    o.downX = e.clientX;
    // hit-test now: after setPointerCapture, later events retarget to the stage
    const hit = (e.target as HTMLElement | null)?.closest?.(
      "[data-orbit-card]",
    );
    o.downCard = hit ? Number(hit.getAttribute("data-orbit-card")) : -1;
    stageRef.current?.setPointerCapture(e.pointerId);
    kickRef.current?.();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const o = phys.current;
    if (!o.dragging) return;
    const dx = e.clientX - o.lastX;
    const dtMs = Math.max(8, e.timeStamp - o.lastT);
    o.th += dx * 0.35;
    o.vel = o.vel * 0.65 + ((dx / dtMs) * 1000 * 0.35) * 0.35;
    if (Math.abs(e.clientX - o.downX) > 6) o.moved = true;
    o.lastX = e.clientX;
    o.lastT = e.timeStamp;
    interact();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const o = phys.current;
    if (!o.dragging) return;
    o.dragging = false;
    try {
      stageRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
    if (!o.moved && o.downCard >= 0) {
      // a tap — swing the tapped card to the front
      focusCard(o.downCard);
      return;
    }
    o.vel = Math.max(-420, Math.min(420, o.vel));
    kickRef.current?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      stepCard(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepCard(-1);
    }
  };

  /* ---- shared card body ---- */

  const cardBody = (svc: (typeof SERVICES)[number], i: number, flat = false) => (
    <>
      <div className="flex h-[150px] w-full items-center justify-center rounded-[14px] border border-edge bg-[#0F0E14]">
        <span className="font-mono text-[11px] tracking-[0.16em] text-faint">
          {svc.imgLabel}
        </span>
      </div>
      <div className="pt-5 font-mono text-[12.5px] tracking-[0.14em] text-magenta">
        {svc.num}
      </div>
      <h3
        ref={
          flat
            ? undefined
            : (el) => {
                titleRefs.current[i] = el;
              }
        }
        className="mt-2.5 font-display text-[clamp(20px,2vw,25px)] font-semibold tracking-[-0.01em] text-fog"
      >
        {svc.title}
      </h3>
      <p
        ref={
          flat
            ? undefined
            : (el) => {
                promiseRefs.current[i] = el;
              }
        }
        className="mb-0 mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-magenta"
      >
        {svc.promise}
      </p>
      <p className="mb-0 mt-3 text-[14.5px] leading-[1.62] text-mist">
        {svc.body}
      </p>
      {svc.chips && (
        <div className="mt-4 flex flex-wrap gap-2">
          {svc.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-edge-bright px-3 py-1 font-mono text-[10.5px] tracking-[0.1em] text-mist"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </>
  );

  return (
    <section
      id="services"
      ref={sectionRef}
      className="relative z-[1] overflow-hidden px-6 pb-[120px] pt-[110px]"
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="relative mx-auto max-w-[760px] text-center">
          <GlowOrb size={640} alpha={0.14} />
          <p className="relative m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            [ 05 // services ]
          </p>
          <DecryptOnView
            as="h2"
            text="One stop shop for your creator business."
            className="relative mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
          />
          <p className="relative mx-auto mt-[18px] max-w-[52ch] text-base leading-relaxed text-mist">
            Three files on a secure carousel. Grab the ring and spin &mdash;
            whatever faces you, decrypts.
          </p>
        </div>

        <ServicesTicker className="mt-10" />

        {reduced ? (
          /* prefers-reduced-motion: flat, fully decrypted grid */
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {SERVICES.map((svc, i) => (
              <article
                key={svc.num}
                className="flex flex-col rounded-[20px] border border-edge-mid bg-panel px-5 pb-6 pt-5"
              >
                {cardBody(svc, i, true)}
              </article>
            ))}
          </div>
        ) : (
          <>
            <div
              ref={stageRef}
              tabIndex={0}
              role="group"
              aria-roledescription="carousel"
              aria-label="Services carousel — drag to spin, arrow keys to step"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              className="relative mx-auto mt-6 h-[600px] max-w-[1100px] cursor-grab touch-pan-y select-none rounded-[24px] outline-none [perspective:1400px] active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-magenta/40"
            >
              <GlowOrb size={700} alpha={0.12} duration={19} />

              {/* holo projector base */}
              <div
                aria-hidden
                className="absolute left-1/2 top-[64%] h-[400px] w-[min(680px,90%)] [transform:translate(-50%,-50%)_rotateX(76deg)]"
              >
                <div className="absolute inset-0 rounded-full border border-magenta/20 shadow-[0_0_60px_rgba(255,45,120,.12),inset_0_0_60px_rgba(139,43,232,.10)]" />
                <div className="absolute inset-[14%] rounded-full border border-violet/15" />
                <div className="absolute inset-[32%] rounded-full border border-edge-bright/60" />
              </div>

              {/* the ring */}
              <div
                ref={ringRef}
                className="absolute inset-0 will-change-transform [transform-style:preserve-3d]"
                style={{ transform: `translateZ(${-R0}px) rotateY(${TH0}deg)` }}
              >
                {SERVICES.map((svc, i) => {
                  const f = facingOf(i, TH0);
                  return (
                    <article
                      key={svc.num}
                      data-orbit-card={i}
                      ref={(el) => {
                        cardRefs.current[i] = el;
                      }}
                      className="absolute left-1/2 top-1/2 flex w-[min(380px,74vw)] flex-col rounded-[20px] border border-edge-mid bg-panel px-5 pb-6 pt-5 shadow-[0_30px_80px_rgba(0,0,0,.45)]"
                      style={{
                        transform: `translate(-50%,-50%) rotateY(${i * STEP}deg) translateZ(${R0}px)`,
                        opacity: cardOpacity(f),
                      }}
                    >
                      {cardBody(svc, i)}
                      {/* cipher veil — covers everything but the front card */}
                      <div
                        ref={(el) => {
                          veilRefs.current[i] = el;
                        }}
                        aria-hidden
                        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[20px] bg-[#0E0D13]/95"
                        style={{ opacity: veilOpacity(f) }}
                      >
                        <span className="font-mono text-[26px] text-faint">
                          ⬡
                        </span>
                        <span className="font-mono text-[11px] tracking-[0.24em] text-dusk">
                          FILE {svc.num} — ENCRYPTED
                        </span>
                        <span
                          data-veil
                          data-text={VEIL_HEX}
                          className="font-mono text-[10.5px] tracking-[0.2em] text-faint"
                        >
                          {VEIL_HEX}
                        </span>
                        <span
                          data-veil
                          data-text={VEIL_HEX}
                          className="font-mono text-[10.5px] tracking-[0.2em] text-faint/60"
                        >
                          {VEIL_HEX}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* controls */}
            <div className="mt-2 flex items-center justify-center gap-5">
              <button
                type="button"
                onClick={() => stepCard(-1)}
                aria-label="Previous service"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-edge-bright font-display text-[18px] text-mist transition-colors hover:border-magenta hover:text-fog"
              >
                ‹
              </button>
              <div className="flex items-center gap-3">
                {SERVICES.map((svc, i) => (
                  <button
                    key={svc.num}
                    type="button"
                    onClick={() => focusCard(i)}
                    aria-label={`Show ${svc.title}`}
                    className={`h-2.5 w-2.5 rounded-full transition-all ${
                      active === i
                        ? "bg-magenta shadow-[0_0_10px_rgba(255,45,120,.8)]"
                        : "border border-edge-bright bg-transparent hover:border-magenta"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => stepCard(1)}
                aria-label="Next service"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-edge-bright font-display text-[18px] text-mist transition-colors hover:border-magenta hover:text-fog"
              >
                ›
              </button>
            </div>

            {/* compass tape */}
            <div className="relative mx-auto mt-5 h-[26px] max-w-[520px] overflow-hidden rounded-full border border-edge [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]">
              <div
                ref={tapeRef}
                className="absolute inset-0 [background:repeating-linear-gradient(90deg,rgba(241,238,246,.18)_0,rgba(241,238,246,.18)_2px,transparent_2px,transparent_16px)]"
              />
              <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-magenta shadow-[0_0_10px_rgba(255,45,120,.9)]" />
            </div>

            <div className="mt-3 flex items-center justify-center gap-6 font-mono text-[11px] tracking-[0.18em] text-faint">
              <span ref={azRef}>AZ 302.0°</span>
              <span>
                SECTOR <span className="text-magenta">0{active + 1}</span>/03
              </span>
              <span className="hidden sm:inline">DRAG · TAP A CARD · ← →</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
