"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ServicesTicker from "@/components/home/services-variants/ServicesTicker";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SERVICES } from "@/lib/content";
import { decryptTo, scramble } from "@/lib/decrypt";

/**
 * SERVICES VARIANT 02 — "THE DECRYPTION LENS"
 *
 * The three service dossiers sit fully encrypted: scrambled cipher text,
 * desaturated, stamped ENCRYPTED. The visitor's cursor carries a decryption
 * lens — wherever it hovers, the plaintext (full-color) layer shows through a
 * soft circular mask. Clicking a file cracks it permanently: the lens radius
 * blows out from the cursor in a reveal wave while the headline re-decrypts.
 * Keyboard: tab to a file and press Enter. Touch: tap a file to crack it.
 */

const LENS_R = 150;
const MASK =
  "radial-gradient(circle var(--lr) at var(--lx) var(--ly), #000 0%, #000 58%, transparent 99%)";

const MASK_STYLE = {
  WebkitMaskImage: MASK,
  maskImage: MASK,
  "--lx": "-999px",
  "--ly": "-999px",
  "--lr": "0px",
} as React.CSSProperties;

type Svc = (typeof SERVICES)[number];

/**
 * One face of a dossier card. The cipher face marks its text nodes with
 * data-scr/data-text so the churn interval can keep re-scrambling them.
 */
function CardFace({
  svc,
  idx,
  cipher = false,
  titleRef,
  promiseRef,
}: {
  svc: Svc;
  idx: number;
  cipher?: boolean;
  titleRef?: (el: HTMLHeadingElement | null) => void;
  promiseRef?: (el: HTMLParagraphElement | null) => void;
}) {
  const mark = (text: string) =>
    cipher
      ? { "data-scr": "", "data-card": String(idx), "data-text": text }
      : {};
  return (
    <div
      className={`flex h-full flex-col px-5 pb-6 pt-5 ${
        cipher ? "opacity-55 blur-[1.5px] saturate-0" : ""
      }`}
    >
      <div className="flex h-[140px] w-full items-center justify-center rounded-[14px] border border-edge bg-[#0F0E14]">
        <span
          {...mark(svc.imgLabel)}
          className="font-mono text-[11px] tracking-[0.16em] text-faint"
        >
          {svc.imgLabel}
        </span>
      </div>
      <div
        className={`pt-5 font-mono text-[12.5px] tracking-[0.14em] ${
          cipher ? "text-dusk" : "text-magenta"
        }`}
      >
        {svc.num}
      </div>
      <h3
        ref={titleRef}
        {...mark(svc.title)}
        className={`mt-2.5 font-display text-[clamp(20px,1.8vw,24px)] font-semibold tracking-[-0.01em] ${
          cipher ? "text-dusk" : "text-fog"
        }`}
      >
        {svc.title}
      </h3>
      <p
        ref={promiseRef}
        {...mark(svc.promise)}
        className={`mb-0 mt-2 font-mono text-[11px] uppercase tracking-[0.16em] ${
          cipher ? "text-dusk" : "text-magenta"
        }`}
      >
        {svc.promise}
      </p>
      <p
        {...mark(svc.body)}
        className={`mb-0 mt-3 text-[14px] leading-[1.6] ${
          cipher ? "text-faint" : "text-mist"
        }`}
      >
        {svc.body}
      </p>
      {svc.chips && (
        <div className="mt-4 flex flex-wrap gap-2">
          {svc.chips.map((chip) => (
            <span
              key={chip}
              {...mark(chip)}
              className={`rounded-full border px-3 py-1 font-mono text-[10.5px] tracking-[0.1em] ${
                cipher ? "border-edge text-faint" : "border-edge-bright text-mist"
              }`}
            >
              {chip}
            </span>
          ))}
        </div>
      )}
      <div
        className={`mt-auto pt-4 font-mono text-[10px] tracking-[0.16em] ${
          cipher ? "text-danger/60" : "text-teal"
        }`}
      >
        {cipher ? "▮ LOCKED · CLICK TO CRACK" : "● DECRYPTED · VERIFIED"}
      </div>
    </div>
  );
}

export default function ServicesLens() {
  const boardRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const coordsRef = useRef<HTMLSpanElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const plainRefs = useRef<(HTMLDivElement | null)[]>([]);
  const plainTitleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const plainPromiseRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const [unlocked, setUnlocked] = useState([false, false, false]);
  const [hintHidden, setHintHidden] = useState(false);
  const reduced = useReducedMotion();

  const unlockedRef = useRef([false, false, false]);
  const hintHiddenRef = useRef(false);
  const posRef = useRef({ x: -999, y: -999, r: 0, tx: -999, ty: -999, tr: 0 });
  const unlockAnimsRef = useRef(new Map<number, { start: number; from: number }>());
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const finalizeUnlock = useCallback((i: number) => {
    if (unlockedRef.current[i]) return;
    unlockedRef.current[i] = true;
    setUnlocked([...unlockedRef.current]);
  }, []);

  /* ---- the lens loop: lerp toward the pointer, write mask vars per card ---- */

  const ensureLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    const step = () => {
      const p = posRef.current;
      p.x += (p.tx - p.x) * 0.22;
      p.y += (p.ty - p.y) * 0.22;
      p.r += (p.tr - p.r) * 0.16;
      const now = performance.now();
      const anims = unlockAnimsRef.current;

      const board = boardRef.current;
      if (board) {
        const brect = board.getBoundingClientRect();
        const lens = lensRef.current;
        if (lens) {
          const lx = p.x - brect.left;
          const ly = p.y - brect.top;
          lens.style.width = `${(p.r * 2).toFixed(1)}px`;
          lens.style.height = `${(p.r * 2).toFixed(1)}px`;
          lens.style.transform = `translate3d(${(lx - p.r).toFixed(1)}px,${(ly - p.r).toFixed(1)}px,0)`;
          lens.style.opacity = Math.min(1, p.r / 60).toFixed(2);
        }
        const coords = coordsRef.current;
        if (coords)
          coords.textContent = `X:${String(
            Math.max(0, Math.round(p.x - brect.left)),
          ).padStart(4, "0")} Y:${String(
            Math.max(0, Math.round(p.y - brect.top)),
          ).padStart(4, "0")}`;
      }

      for (let i = 0; i < SERVICES.length; i++) {
        if (unlockedRef.current[i]) continue;
        const wrap = cardRefs.current[i];
        const plain = plainRefs.current[i];
        if (!wrap || !plain) continue;
        const rect = wrap.getBoundingClientRect();
        let radius = p.r;
        const anim = anims.get(i);
        if (anim) {
          const q = Math.min(1, (now - anim.start) / 620);
          const e = 1 - Math.pow(1 - q, 3);
          const diag = Math.hypot(rect.width, rect.height);
          radius = anim.from + (diag - anim.from) * e;
          if (q >= 1) {
            anims.delete(i);
            finalizeUnlock(i);
          }
        }
        plain.style.setProperty("--lx", `${(p.x - rect.left).toFixed(1)}px`);
        plain.style.setProperty("--ly", `${(p.y - rect.top).toFixed(1)}px`);
        plain.style.setProperty("--lr", `${radius.toFixed(1)}px`);
      }

      if (p.tr === 0 && p.r < 0.6 && anims.size === 0) {
        runningRef.current = false;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [finalizeUnlock]);

  /* ---- crack a file open: reveal wave from the lens position ---- */

  const beginUnlock = useCallback(
    (i: number) => {
      if (unlockedRef.current[i] || unlockAnimsRef.current.has(i)) return;
      const p = posRef.current;
      const wrap = cardRefs.current[i];
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const inside =
          p.x >= rect.left - 40 &&
          p.x <= rect.right + 40 &&
          p.y >= rect.top - 40 &&
          p.y <= rect.bottom + 40;
        if (!inside) {
          // keyboard / decrypt-all: reveal from the card's center instead
          p.x = p.tx = rect.left + rect.width / 2;
          p.y = p.ty = rect.top + rect.height / 2;
        }
      }
      unlockAnimsRef.current.set(i, {
        start: performance.now(),
        from: Math.max(20, p.r),
      });
      decryptTo(plainTitleRefs.current[i], SERVICES[i].title, 480);
      decryptTo(plainPromiseRefs.current[i], SERVICES[i].promise, 560);
      ensureLoop();
    },
    [ensureLoop],
  );

  const decryptAll = useCallback(() => {
    let delay = 0;
    for (let i = 0; i < SERVICES.length; i++) {
      if (unlockedRef.current[i] || unlockAnimsRef.current.has(i)) continue;
      const t = setTimeout(() => {
        timersRef.current.delete(t);
        beginUnlock(i);
      }, delay);
      timersRef.current.add(t);
      delay += 220;
    }
  }, [beginUnlock]);

  /* ---- cipher churn: keep locked cards visibly encrypted ---- */

  useEffect(() => {
    if (reduced) return;
    const board = boardRef.current;
    if (!board) return;
    const nodes = Array.from(board.querySelectorAll<HTMLElement>("[data-scr]"));
    const tick = () => {
      for (const n of nodes) {
        if (unlockedRef.current[Number(n.dataset.card)]) continue;
        n.textContent = scramble(n.dataset.text || "");
      }
    };
    tick();
    const iv = setInterval(tick, 140);
    return () => clearInterval(iv);
  }, [reduced]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    };
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    if (reduced) return;
    const p = posRef.current;
    if (p.tr === 0 && p.r < 1) {
      // lens was off — snap to the entry point so it doesn't fly across
      p.x = e.clientX;
      p.y = e.clientY;
    }
    p.tx = e.clientX;
    p.ty = e.clientY;
    p.tr = LENS_R;
    if (!hintHiddenRef.current) {
      hintHiddenRef.current = true;
      setHintHidden(true);
    }
    ensureLoop();
  };

  const onPointerLeave = () => {
    posRef.current.tr = 0;
    ensureLoop();
  };

  const openCount = reduced
    ? SERVICES.length
    : unlocked.filter(Boolean).length;

  return (
    <section id="services" className="relative z-[1] px-6 pb-[120px] pt-[110px]">
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
            Everything&rsquo;s encrypted until you look closer. Sweep the lens
            across the vault &mdash; then click a file to crack it open.
          </p>
        </div>

        <ServicesTicker className="mt-10" />

        <div
          ref={boardRef}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          className="relative mt-8 overflow-hidden rounded-[24px] border border-edge-mid bg-[#0D0C12]/85 p-5 md:p-7"
        >
          {/* faint alignment grid */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(241,238,246,.06)_1px,transparent_1px)] [background-size:26px_26px]"
          />
          {/* corner brackets */}
          <span aria-hidden className="absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-magenta/50" />
          <span aria-hidden className="absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-magenta/50" />
          <span aria-hidden className="absolute bottom-3 left-3 h-4 w-4 border-b-2 border-l-2 border-magenta/50" />
          <span aria-hidden className="absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-magenta/50" />

          <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[11px] tracking-[0.2em] text-faint">
              [ VAULT://SERVICES — 3 FILES ]
            </span>
            <div className="flex items-center gap-4">
              <span className="font-mono text-[11px] tracking-[0.2em] text-mist">
                DECRYPTED{" "}
                <span className="text-magenta">
                  {String(openCount).padStart(2, "0")}
                </span>
                /03
              </span>
              {openCount < SERVICES.length ? (
                <button
                  type="button"
                  onClick={decryptAll}
                  className="rounded-full border border-edge-bright px-4 py-1.5 font-mono text-[11px] tracking-[0.14em] text-mist transition-colors hover:border-magenta hover:text-fog"
                >
                  [ DECRYPT ALL ]
                </button>
              ) : (
                <span className="font-mono text-[11px] tracking-[0.2em] text-teal">
                  ● VAULT OPEN
                </span>
              )}
            </div>
          </div>

          <div className="relative grid gap-5 md:grid-cols-3">
            {SERVICES.map((svc, i) => {
              const open = reduced || unlocked[i];
              return (
                <div
                  key={svc.num}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  className="relative overflow-hidden rounded-[20px] border border-edge bg-panel"
                >
                  {/* cipher face — defines the card's height */}
                  <div aria-hidden className={open ? "invisible" : ""}>
                    <CardFace svc={svc} idx={i} cipher />
                    <div className="absolute right-4 top-4 -rotate-6 rounded border border-danger/50 px-2.5 py-1 font-mono text-[10px] tracking-[0.28em] text-danger/70">
                      ENCRYPTED
                    </div>
                  </div>
                  {/* plaintext face — masked by the lens until cracked */}
                  <div
                    ref={(el) => {
                      plainRefs.current[i] = el;
                    }}
                    className={`absolute inset-0 ${open ? "" : "pointer-events-none"}`}
                    style={open ? undefined : MASK_STYLE}
                  >
                    <CardFace
                      svc={svc}
                      idx={i}
                      titleRef={(el) => {
                        plainTitleRefs.current[i] = el;
                      }}
                      promiseRef={(el) => {
                        plainPromiseRefs.current[i] = el;
                      }}
                    />
                  </div>
                  {!open && (
                    <button
                      type="button"
                      onClick={() => beginUnlock(i)}
                      aria-label={`Decrypt ${svc.title}`}
                      className="absolute inset-0 z-10 cursor-crosshair rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-magenta/70"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* the lens ring */}
          <div
            ref={lensRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 z-20 rounded-full border border-magenta/50 opacity-0 shadow-[0_0_40px_rgba(255,45,120,.25),inset_0_0_40px_rgba(139,43,232,.12)]"
          >
            <span className="absolute left-1/2 top-[-7px] h-3.5 w-px -translate-x-1/2 bg-magenta/70" />
            <span className="absolute bottom-[-7px] left-1/2 h-3.5 w-px -translate-x-1/2 bg-magenta/70" />
            <span className="absolute left-[-7px] top-1/2 h-px w-3.5 -translate-y-1/2 bg-magenta/70" />
            <span className="absolute right-[-7px] top-1/2 h-px w-3.5 -translate-y-1/2 bg-magenta/70" />
            <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tracking-[0.22em] text-fog/70">
              DECRYPT LENS
            </span>
            <span
              ref={coordsRef}
              className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tracking-[0.18em] text-magenta/80"
            >
              X:0000 Y:0000
            </span>
          </div>
        </div>

        <p
          className={`mt-5 text-center font-mono text-[11px] tracking-[0.2em] text-faint transition-opacity duration-500 ${
            hintHidden || reduced ? "opacity-0" : "opacity-100"
          }`}
        >
          SWEEP THE LENS TO PREVIEW — CLICK A FILE TO DECRYPT IT
        </p>
      </div>
    </section>
  );
}
