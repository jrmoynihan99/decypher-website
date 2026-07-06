"use client";

import { useEffect, useRef, useState } from "react";
import ServicesTicker from "@/components/home/services-variants/ServicesTicker";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { SERVICES } from "@/lib/content";
import { cancelDecrypt, decryptTo, prefersReducedMotion } from "@/lib/decrypt";

/**
 * SERVICES VARIANT 03 — "THE SIGNAL TUNER"
 *
 * Each service broadcasts on its own frequency. A spring-loaded needle rides
 * a tuning band: drag it (or click a station, tap 1–3, use arrow keys) and
 * the display resolves from canvas static into a locked signal — content
 * sharpens, the waveform cleans up, signal bars fill, and the headline
 * decrypts the moment the lock lands. Off-station you get pure noise.
 */

const F_MIN = 87;
const F_MAX = 103;

const STATIONS = [
  { f: 89.1, tag: "TAX" },
  { f: 94.7, tag: "LLC" },
  { f: 100.3, tag: "BOOKS" },
];

const ACCENTS = ["#FF5C2E", "#FF2D78", "#8B2BE8"];

const pctOf = (f: number) => ((f - F_MIN) / (F_MAX - F_MIN)) * 100;

export default function ServicesTuner() {
  const sectionRef = useRef<HTMLElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const freqRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const promiseRef = useRef<HTMLParagraphElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);

  const [nearest, setNearest] = useState(0);
  const [hintHidden, setHintHidden] = useState(false);

  // tuner physics state, shared between the loop and the input handlers
  const stRef = useRef({ cur: F_MIN, vel: 0, target: F_MIN, down: false });
  const nearestRef = useRef(0);
  const lockedIdxRef = useRef<number | null>(null);
  const visibleRef = useRef(false);
  const introducedRef = useRef(false);
  const runningRef = useRef(false);
  const rafRef = useRef(0);
  const kickRef = useRef<(() => void) | null>(null);
  const hintHiddenRef = useRef(false);

  /* ---- the receiver: spring, lock, canvases — one loop drives it all ---- */

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const reduced = prefersReducedMotion();
    const st = stRef.current;

    const staticCv = staticCanvasRef.current;
    const waveCv = waveCanvasRef.current;
    const sCtx = staticCv?.getContext("2d") ?? null;
    const wCtx = waveCv?.getContext("2d") ?? null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let waveGrad: CanvasGradient | null = null;

    const sizeCanvases = () => {
      if (staticCv) {
        const r = staticCv.getBoundingClientRect();
        staticCv.width = Math.max(2, Math.floor(r.width / 5));
        staticCv.height = Math.max(2, Math.floor(r.height / 5));
      }
      if (waveCv && wCtx) {
        const r = waveCv.getBoundingClientRect();
        waveCv.width = Math.max(2, Math.floor(r.width * dpr));
        waveCv.height = Math.max(2, Math.floor(r.height * dpr));
        wCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        waveGrad = wCtx.createLinearGradient(0, 0, r.width, 0);
        waveGrad.addColorStop(0, "#FF5C2E");
        waveGrad.addColorStop(0.5, "#FF2D78");
        waveGrad.addColorStop(1, "#8B2BE8");
      }
    };
    sizeCanvases();
    const ro = new ResizeObserver(sizeCanvases);
    if (staticCv) ro.observe(staticCv);
    if (waveCv) ro.observe(waveCv);

    let frame = 0;
    let last = 0;

    const render = (tMs: number) => {
      frame++;
      st.cur = Math.max(F_MIN, Math.min(F_MAX, st.cur));

      // needle + numeric readout
      const p01 = (st.cur - F_MIN) / (F_MAX - F_MIN);
      if (needleRef.current)
        needleRef.current.style.left = `${(p01 * 100).toFixed(3)}%`;
      if (freqRef.current)
        freqRef.current.textContent = st.cur.toFixed(1).padStart(5, "0");

      // nearest station + lock strength
      let ni = 0;
      let nd = Infinity;
      for (let i = 0; i < STATIONS.length; i++) {
        const d = Math.abs(st.cur - STATIONS[i].f);
        if (d < nd) {
          nd = d;
          ni = i;
        }
      }
      const lock = Math.max(0, Math.min(1, 1 - nd / 2.4));
      const el = lock * lock * (3 - 2 * lock);

      if (nearestRef.current !== ni) {
        nearestRef.current = ni;
        setNearest(ni);
      }
      if (el > 0.9 && lockedIdxRef.current !== ni) {
        lockedIdxRef.current = ni;
        decryptTo(titleRef.current, SERVICES[ni].title, 420);
        decryptTo(promiseRef.current, SERVICES[ni].promise, 480);
      } else if (el < 0.45 && lockedIdxRef.current !== null) {
        lockedIdxRef.current = null;
      }

      // content focus follows the lock
      if (cardRef.current) {
        cardRef.current.style.opacity = (0.12 + 0.88 * el).toFixed(3);
        cardRef.current.style.filter = `blur(${((1 - el) * 7).toFixed(2)}px) saturate(${(0.25 + 0.75 * el).toFixed(2)})`;
      }

      // signal bars
      barRefs.current.forEach((b, i) => {
        if (!b) return;
        const on = el * 6 >= i + 0.5;
        b.style.background = on ? "#FF2D78" : "";
        b.style.boxShadow = on ? "0 0 10px rgba(255,45,120,.7)" : "";
        b.style.opacity = on ? "1" : "0.35";
      });

      // status line
      if (statusRef.current) {
        const label =
          el > 0.9
            ? `● SIGNAL LOCKED — ${STATIONS[ni].tag} ${STATIONS[ni].f.toFixed(1)}`
            : el > 0.35
              ? `≈ TUNING… ${nd.toFixed(1)} MHz OFF`
              : "× SCANNING KEYSPACE — STATIC";
        if (statusRef.current.textContent !== label)
          statusRef.current.textContent = label;
        statusRef.current.style.color =
          el > 0.9 ? "#3DD6C4" : el > 0.35 ? "#B8B3C6" : "#5F5870";
      }

      // slider a11y state
      if (bandRef.current) {
        bandRef.current.setAttribute("aria-valuenow", st.cur.toFixed(1));
        bandRef.current.setAttribute(
          "aria-valuetext",
          `${st.cur.toFixed(1)} megahertz — nearest: ${SERVICES[ni].title}`,
        );
      }

      // static noise overlay
      if (sCtx && staticCv) {
        const a = Math.pow(1 - el, 1.4);
        staticCv.style.opacity = (a * 0.85).toFixed(3);
        if (!reduced && a > 0.02 && frame % 2 === 0) {
          const w = staticCv.width;
          const h = staticCv.height;
          sCtx.clearRect(0, 0, w, h);
          sCtx.fillStyle = "rgba(241,238,246,.6)";
          const n = Math.floor(w * h * 0.05);
          for (let i = 0; i < n; i++) {
            sCtx.globalAlpha = Math.random() * 0.55;
            sCtx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
          }
          sCtx.globalAlpha = 0.12;
          sCtx.fillStyle = "#FF2D78";
          for (let i = 0; i < 4; i++)
            sCtx.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2);
          sCtx.globalAlpha = 1;
        }
      }

      // waveform: clean carrier when locked, noise when lost
      if (wCtx && waveCv) {
        const rW = waveCv.width / dpr;
        const rH = waveCv.height / dpr;
        wCtx.clearRect(0, 0, rW, rH);
        const mid = rH / 2;
        const amp = mid * 0.62;
        wCtx.beginPath();
        for (let x = 0; x <= rW; x += 3) {
          const clean =
            Math.sin(x * 0.05 + tMs * 0.004) *
            Math.sin(x * 0.011 + tMs * 0.0011);
          const noise = reduced ? 0 : (Math.random() - 0.5) * 2;
          const y = mid + amp * (clean * el + noise * (1 - el) * 0.9);
          if (x === 0) wCtx.moveTo(x, y);
          else wCtx.lineTo(x, y);
        }
        wCtx.lineWidth = 5;
        wCtx.strokeStyle = "rgba(255,45,120,.12)";
        wCtx.stroke();
        wCtx.lineWidth = 1.6;
        wCtx.strokeStyle = waveGrad ?? "#FF2D78";
        wCtx.stroke();
      }
    };

    const tick = (tMs: number) => {
      if (!visibleRef.current) {
        runningRef.current = false;
        return;
      }
      const dt = Math.min(0.05, (tMs - (last || tMs)) / 1000);
      last = tMs;
      // spring: stiff while the pointer is down (feels 1:1), loose otherwise
      const k = st.down ? 420 : 150;
      const c = st.down ? 34 : 11;
      st.vel += (st.target - st.cur) * k * dt;
      st.vel *= Math.exp(-c * dt);
      st.cur += st.vel * dt;
      if (Math.abs(st.target - st.cur) < 0.0005 && Math.abs(st.vel) < 0.002) {
        st.cur = st.target;
        st.vel = 0;
      }
      render(tMs);
      rafRef.current = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (reduced) {
        st.cur = st.target;
        st.vel = 0;
        render(performance.now());
        return;
      }
      if (!runningRef.current && visibleRef.current) {
        runningRef.current = true;
        last = 0;
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    kickRef.current = kick;

    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          visibleRef.current = en.isIntersecting;
          if (en.isIntersecting) {
            if (!introducedRef.current) {
              introducedRef.current = true;
              st.target = STATIONS[0].f; // auto-tune into the first station
            }
            kick();
          }
        }
      },
      { threshold: 0.2 },
    );
    io.observe(section);

    const title = titleRef.current;
    const promise = promiseRef.current;
    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      kickRef.current = null;
      cancelDecrypt(title);
      cancelDecrypt(promise);
    };
  }, []);

  /* ---- input ---- */

  const hideHint = () => {
    if (!hintHiddenRef.current) {
      hintHiddenRef.current = true;
      setHintHidden(true);
    }
  };

  const setTargetFromPointer = (e: React.PointerEvent) => {
    const band = bandRef.current;
    if (!band) return;
    const r = band.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    stRef.current.target = F_MIN + p * (F_MAX - F_MIN);
  };

  const onBandDown = (e: React.PointerEvent) => {
    bandRef.current?.setPointerCapture(e.pointerId);
    stRef.current.down = true;
    setTargetFromPointer(e);
    hideHint();
    kickRef.current?.();
  };

  const onBandMove = (e: React.PointerEvent) => {
    if (!stRef.current.down) return;
    setTargetFromPointer(e);
    kickRef.current?.();
  };

  const onBandUp = () => {
    stRef.current.down = false;
  };

  const tuneTo = (f: number) => {
    stRef.current.target = f;
    hideHint();
    kickRef.current?.();
  };

  const onBandKey = (e: React.KeyboardEvent) => {
    const st = stRef.current;
    const nearestStation = () => {
      let ni = 0;
      let nd = Infinity;
      STATIONS.forEach((s, i) => {
        const d = Math.abs(st.target - s.f);
        if (d < nd) {
          nd = d;
          ni = i;
        }
      });
      return ni;
    };
    const snap = (i: number) =>
      (st.target = STATIONS[Math.max(0, Math.min(STATIONS.length - 1, i))].f);
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        st.target = Math.max(F_MIN, st.target - (e.shiftKey ? 1 : 0.2));
        break;
      case "ArrowRight":
      case "ArrowUp":
        st.target = Math.min(F_MAX, st.target + (e.shiftKey ? 1 : 0.2));
        break;
      case "Home":
        st.target = F_MIN;
        break;
      case "End":
        st.target = F_MAX;
        break;
      case "1":
      case "2":
      case "3":
        snap(Number(e.key) - 1);
        break;
      case "[":
        snap(nearestStation() - 1);
        break;
      case "]":
        snap(nearestStation() + 1);
        break;
      default:
        return;
    }
    e.preventDefault();
    hideHint();
    kickRef.current?.();
  };

  const svc = SERVICES[nearest];

  return (
    <section
      id="services"
      ref={sectionRef}
      className="relative z-[1] px-6 pb-[120px] pt-[110px]"
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
            Every service broadcasts on its own frequency. Drag the dial until
            the signal locks &mdash; static means you&rsquo;re overpaying.
          </p>
        </div>

        <ServicesTicker className="mx-auto mt-10 max-w-[1050px]" />

        {/* the receiver */}
        <div className="relative mx-auto mt-8 max-w-[1050px] overflow-hidden rounded-[24px] border border-edge-mid bg-[#0D0C12]/85 p-5 md:p-8">
          <GlowOrb
            size={520}
            alpha={0.1}
            style={{ left: "auto", right: -190, top: -190 }}
          />

          {/* readout row */}
          <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="flex items-baseline gap-2">
              <span
                ref={freqRef}
                className="text-grad font-mono text-[clamp(40px,5vw,60px)] font-bold leading-none tracking-[-0.02em]"
              >
                087.0
              </span>
              <span className="font-mono text-[13px] tracking-[0.2em] text-dusk">
                MHz
              </span>
            </div>
            <div aria-hidden className="flex items-end gap-[5px] pb-1.5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  ref={(el) => {
                    barRefs.current[i] = el;
                  }}
                  className="w-[7px] rounded-sm bg-edge-bright opacity-35"
                  style={{ height: 9 + i * 5 }}
                />
              ))}
            </div>
            <div className="pb-1 text-right">
              <div
                ref={statusRef}
                className="font-mono text-[11.5px] tracking-[0.18em] text-faint"
              >
                × SCANNING KEYSPACE — STATIC
              </div>
              <div className="mt-1.5 font-mono text-[10px] tracking-[0.18em] text-faint">
                CH 0{nearest + 1} · {STATIONS[nearest].tag} FM · SVC {svc.num}
              </div>
            </div>
          </div>

          {/* display */}
          <div className="relative mt-6 min-h-[280px] overflow-hidden rounded-[18px] border border-edge bg-panel">
            <div
              ref={cardRef}
              className="relative p-6 md:p-8"
              style={{ opacity: 0.12, filter: "blur(7px) saturate(.25)" }}
            >
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-3 font-mono text-[12px] tracking-[0.14em]">
                    <span className="text-magenta">{svc.num}</span>
                    <span className="text-faint">{svc.imgLabel}</span>
                  </div>
                  <h3
                    ref={titleRef}
                    className="mt-3 font-display text-[clamp(24px,2.6vw,32px)] font-semibold tracking-[-0.01em] text-fog"
                  >
                    {svc.title}
                  </h3>
                  <p
                    ref={promiseRef}
                    className="mb-0 mt-2.5 font-mono text-xs uppercase tracking-[0.16em] text-magenta"
                  >
                    {svc.promise}
                  </p>
                  <p className="mb-0 mt-3.5 max-w-[58ch] text-[15.5px] leading-[1.65] text-mist">
                    {svc.body}
                  </p>
                  {svc.chips && (
                    <div className="mt-[18px] flex flex-wrap gap-2.5">
                      {svc.chips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-edge-bright px-[13px] py-1.5 font-mono text-[11.5px] tracking-[0.1em] text-mist"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="hidden flex-col items-end justify-between font-mono text-[10.5px] tracking-[0.16em] text-faint md:flex">
                  <span>RX · FM</span>
                  <span>MODE STEREO</span>
                  <span>AGC ON</span>
                  <span className="text-teal">KEY OK</span>
                </div>
              </div>
            </div>
            <canvas
              ref={staticCanvasRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]"
            />
          </div>

          {/* waveform */}
          <div className="relative mt-4 h-[64px] overflow-hidden rounded-[12px] border border-edge bg-[#0B0A10]">
            <canvas ref={waveCanvasRef} aria-hidden className="h-full w-full" />
          </div>

          {/* tuning band */}
          <div className="relative mt-7 pt-8">
            {STATIONS.map((s, i) => (
              <button
                key={s.f}
                type="button"
                onClick={() => tuneTo(s.f)}
                style={{ left: `${pctOf(s.f)}%` }}
                className={`absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[10.5px] tracking-[0.16em] transition-colors ${
                  nearest === i ? "text-magenta" : "text-dusk hover:text-fog"
                }`}
              >
                0{i + 1} · {s.tag} {s.f.toFixed(1)}
              </button>
            ))}
            <div
              ref={bandRef}
              role="slider"
              tabIndex={0}
              aria-label="Service frequency tuner"
              aria-valuemin={F_MIN}
              aria-valuemax={F_MAX}
              aria-valuenow={F_MIN}
              onPointerDown={onBandDown}
              onPointerMove={onBandMove}
              onPointerUp={onBandUp}
              onPointerCancel={onBandUp}
              onKeyDown={onBandKey}
              className="relative h-[84px] cursor-ew-resize touch-none overflow-hidden rounded-[14px] border border-edge bg-[#0B0A10] outline-none transition-colors focus-visible:border-magenta/60"
            >
              <div
                aria-hidden
                className="absolute inset-0 [background:repeating-linear-gradient(90deg,rgba(241,238,246,.05)_0,rgba(241,238,246,.05)_1px,transparent_1px,transparent_9px)]"
              />
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1/2 [background:repeating-linear-gradient(90deg,rgba(241,238,246,.12)_0,rgba(241,238,246,.12)_1px,transparent_1px,transparent_45px)]"
              />
              {STATIONS.map((s, i) => (
                <span
                  key={s.f}
                  aria-hidden
                  style={{ left: `${pctOf(s.f)}%`, background: ACCENTS[i] }}
                  className="absolute inset-y-3 w-[2px] -translate-x-1/2 rounded opacity-70"
                />
              ))}
              <div
                ref={needleRef}
                aria-hidden
                className="absolute inset-y-0 left-0 w-[2px] -translate-x-1/2 bg-grad shadow-[0_0_14px_rgba(255,45,120,.8)]"
              >
                <span className="absolute -top-px left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-magenta shadow-[0_0_10px_rgba(255,45,120,.9)]" />
              </div>
              <div
                aria-hidden
                className="absolute inset-x-2 bottom-1 flex justify-between font-mono text-[9.5px] text-faint"
              >
                {[87, 89, 91, 93, 95, 97, 99, 101, 103].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </div>
          </div>

          <p
            className={`relative mb-0 mt-5 text-center font-mono text-[11px] tracking-[0.2em] text-faint transition-opacity duration-500 ${
              hintHidden ? "opacity-0" : "opacity-100"
            }`}
          >
            DRAG TO TUNE · CLICK A STATION · KEYS ← → / 1–3
          </p>
        </div>
      </div>
    </section>
  );
}
