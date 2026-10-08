"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { GOOGLE_REVIEW_URL } from "@/lib/feedback/schema";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { finePointer } from "./survey-fx";

/**
 * The promoter screen's two ways to the Google review: a big button for this
 * device, and a QR code for the phone in their pocket.
 *
 * The button pulls toward the cursor on a real mouse, its stars light once on
 * arrival (and on hover), and after a tap it says Google opened — the review
 * opens in a new tab, so without that the page looks like nothing happened.
 *
 * The QR is drawn here as SVG modules from qrcode's matrix (no network, no
 * image), level Q so a fifth of the middle can carry the "D" badge and still
 * scan. It decodes in row by row behind a scan line for 1.2s and then locks;
 * from that point it's a plain, fully scannable code — the tilt, glare and tap
 * ripple only ever animate on top of a finished one.
 */

export default function ReviewAsk({ onClicked }: { onClicked: () => void }) {
  return (
    <>
      <div className="fb-enter">
        <ReviewButton onClicked={onClicked} />
      </div>
      <div className="fb-enter mt-[18px] flex items-center gap-3.5">
        <ReviewQr url={GOOGLE_REVIEW_URL} onClicked={onClicked} />
        <p className="m-0 text-[14.5px] leading-[1.45] text-night/70">
          <b className="font-semibold text-night">Rather use your phone?</b>
          <br />
          Point your camera at the code.
        </p>
      </div>
    </>
  );
}

const STAR = "M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z";

function ReviewButton({ onClicked }: { onClicked: () => void }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();
  const [lit, setLit] = useState(false);
  const [sent, setSent] = useState(0);

  // the stars light once, a beat after the screen lands
  useEffect(() => {
    if (reduce) return;
    const on = window.setTimeout(() => setLit(true), 900);
    const off = window.setTimeout(() => setLit(false), 2200);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [reduce]);

  // magnetic pull, mouse only — written to the element, not through state
  useEffect(() => {
    const btn = ref.current;
    if (!btn || reduce || !finePointer()) return;
    const move = (e: PointerEvent) => {
      const b = btn.getBoundingClientRect();
      btn.style.transition = "transform .1s linear, box-shadow .3s";
      btn.style.setProperty("--mx", `${(((e.clientX - b.left) / b.width - 0.5) * 10).toFixed(1)}px`);
      btn.style.setProperty("--my", `${(((e.clientY - b.top) / b.height - 0.5) * 8).toFixed(1)}px`);
    };
    const leave = () => {
      btn.style.transition = "";
      btn.style.setProperty("--mx", "0px");
      btn.style.setProperty("--my", "0px");
    };
    btn.addEventListener("pointermove", move);
    btn.addEventListener("pointerleave", leave);
    return () => {
      btn.removeEventListener("pointermove", move);
      btn.removeEventListener("pointerleave", leave);
    };
  }, [reduce]);

  return (
    <a
      ref={ref}
      href={GOOGLE_REVIEW_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        setSent((n) => n + 1);
        onClicked();
      }}
      className={`fb-review relative isolate mt-1 flex w-full items-center gap-4 overflow-hidden rounded-[18px] bg-night py-4 pl-5 pr-4 text-white no-underline shadow-[0_14px_34px_rgba(10,10,14,.32)] sm:py-[18px] sm:pl-6 sm:pr-5 ${
        lit || reduce ? "fb-lit" : ""
      } ${sent ? "fb-sent" : ""}`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-[1.18rem] font-bold tracking-[-0.015em]">
          {sent ? "Thanks! Google opened in a new tab" : "Leave a Google review"}
        </span>
        <span className="font-mono text-[11px] tracking-[0.06em] text-white/60">
          {sent ? "Didn’t open? Click again" : "Opens in a new tab, about 30 seconds"}
        </span>
      </span>
      {/* keyed on the send count, so every tap replays the pop */}
      <span key={sent} aria-hidden className="fb-stars hidden flex-none gap-[3px] min-[481px]:flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className="block h-5 w-5" style={{ "--i": i } as React.CSSProperties}>
            <svg viewBox="0 0 24 24" className="h-full w-full">
              <path d={STAR} />
            </svg>
          </i>
        ))}
      </span>
      <span aria-hidden className="fb-arrow grid h-[42px] w-[42px] flex-none place-items-center rounded-full">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </span>
    </a>
  );
}

type QrModel = { n: number; hole: number; h0: number; cells: { x: number; y: number; d: boolean; f: boolean }[] };

/** The code's modules, minus a square hole in the middle for the badge. */
function buildQr(url: string): QrModel | null {
  try {
    const qr = QRCode.create(url, { errorCorrectionLevel: "Q" });
    const n = qr.modules.size;
    let hole = Math.round(n * 0.2);
    if (hole % 2 === 0) hole++;
    const h0 = (n - hole) / 2;
    const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const cells: QrModel["cells"] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (r >= h0 && r < h0 + hole && c >= h0 && c < h0 + hole) continue;
        cells.push({ x: c, y: r, d: qr.modules.get(r, c) === 1, f: finder(r, c) });
      }
    }
    return { n, hole, h0, cells };
  } catch {
    return null;
  }
}

function ReviewQr({ url, onClicked }: { url: string; onClicked: () => void }) {
  const model = useMemo(() => buildQr(url), [url]);
  const reduce = useReducedMotion();
  // Mounts client-side only (the end screen follows a send), so the reduced
  // flag is already real here and the initial phase can read it.
  const [phase, setPhase] = useState<"decoding" | "locked">(reduce ? "locked" : "decoding");
  const cardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scanRef = useRef<SVGRectElement>(null);
  const ripTimer = useRef(0);

  // decode-in: rows above the scan line are final, rows below flicker
  useEffect(() => {
    const svg = svgRef.current;
    const scan = scanRef.current;
    if (!model || !svg || !scan || phase !== "decoding") return;
    const cells = Array.from(svg.querySelectorAll<SVGRectElement>("rect.fb-m"));
    const rows = cells.map((el) => Number(el.getAttribute("y")));
    const DUR = 1200;
    const t0 = performance.now();
    let last = 0;
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR);
      const row = p * (model.n + 2) - 1;
      scan.setAttribute("y", String(Math.min(model.n, row)));
      if (now - last > 45 || p === 1) {
        last = now;
        cells.forEach((el, i) => {
          if (rows[i] <= row) el.style.fill = "";
          else el.style.fill = Math.random() < 0.42 ? (Math.random() < 0.12 ? "#ff2d78" : "rgba(10,10,14,.28)") : "transparent";
        });
      }
      if (p < 1) raf = requestAnimationFrame(frame);
      else {
        cells.forEach((el) => (el.style.fill = ""));
        setPhase("locked");
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cells.forEach((el) => (el.style.fill = ""));
    };
  }, [model, phase]);

  // tilt toward the mouse, with a moving glare — mouse only
  useEffect(() => {
    const card = cardRef.current;
    if (!card || reduce || !finePointer()) return;
    const move = (e: PointerEvent) => {
      const b = card.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width;
      const y = (e.clientY - b.top) / b.height;
      card.style.transition = "transform .08s linear";
      card.style.setProperty("--ry", `${((x - 0.5) * 22).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${((0.5 - y) * 22).toFixed(2)}deg`);
      card.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
      card.style.setProperty("--go", "1");
    };
    const leave = () => {
      card.style.transition = "";
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
      card.style.setProperty("--go", "0");
    };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", leave);
    return () => {
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerleave", leave);
    };
  }, [reduce]);

  useEffect(() => () => clearTimeout(ripTimer.current), []);

  // a tap sends a magenta ripple out through the code from where it landed
  const ripple = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!model || !svg || reduce || phase !== "locked") return;
    const b = svg.getBoundingClientRect();
    const k = (model.n + 4) / b.width;
    const cx = (e.clientX - b.left) * k - 2;
    const cy = (e.clientY - b.top) * k - 2;
    const dark = Array.from(svg.querySelectorAll<SVGRectElement>('rect.fb-m[data-d="1"]'));
    for (const el of dark) {
      const d = Math.hypot(Number(el.getAttribute("x")) + 0.5 - cx, Number(el.getAttribute("y")) + 0.5 - cy);
      el.classList.remove("fb-rip");
      el.style.setProperty("--dl", `${Math.round(d * 22)}ms`);
    }
    void svg.getBoundingClientRect();
    for (const el of dark) el.classList.add("fb-rip");
    clearTimeout(ripTimer.current);
    ripTimer.current = window.setTimeout(() => dark.forEach((el) => el.classList.remove("fb-rip")), 2000);
  };

  if (!model) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClicked}
        className="inline-flex min-h-[44px] flex-none items-center rounded-full bg-night px-5 font-display text-[14px] font-semibold text-white no-underline"
      >
        Open Google review
      </a>
    );
  }

  const { n, hole, h0, cells } = model;
  const locked = phase === "locked";
  return (
    <div className={`fb-qr-stage relative w-[152px] flex-none p-[9px] [perspective:600px] ${locked ? "fb-locked" : ""}`}>
      <span className="fb-corner fb-tl" />
      <span className="fb-corner fb-tr" />
      <span className="fb-corner fb-bl" />
      <span className="fb-corner fb-br" />
      <div
        ref={cardRef}
        role="img"
        aria-label="QR code that opens DeCypher’s Google review page"
        onClick={ripple}
        className={`fb-qr relative aspect-square cursor-pointer overflow-hidden rounded-[12px] bg-white p-[5px] shadow-[0_10px_26px_rgba(10,10,14,.25)] ${
          locked ? "fb-locked" : "fb-decoding"
        }`}
      >
        <svg ref={svgRef} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" aria-hidden className="block h-full w-full">
          <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
          {cells.map((c) => (
            <rect
              key={`${c.y}-${c.x}`}
              className={c.f ? "fb-m fb-f" : "fb-m"}
              x={c.x}
              y={c.y}
              width="1.02"
              height="1.02"
              data-d={c.d ? "1" : "0"}
            />
          ))}
          <g className="fb-badge">
            <rect x={h0 + 0.5} y={h0 + 0.5} width={hole - 1} height={hole - 1} rx="1.3" fill="#ff2d78" shapeRendering="geometricPrecision" />
            <text
              x={n / 2}
              y={n / 2 + 0.15}
              textAnchor="middle"
              dominantBaseline="central"
              fontWeight="700"
              fontSize={(hole * 0.62).toFixed(2)}
              fill="#0a0a0e"
              shapeRendering="geometricPrecision"
              className="font-display"
            >
              D
            </text>
          </g>
          <rect ref={scanRef} className="fb-scan" x="-2" y="0" width={n + 4} height="0.7" />
        </svg>
        {/* the glare that follows the mouse */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: "var(--go, 0)",
            background: "radial-gradient(circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,.55), transparent 45%)",
          }}
        />
      </div>
      <span aria-hidden className="mt-2 block font-mono text-[10px] tracking-[0.14em] text-night/70">
        {locked ? (
          <>
            [ READY <b className="font-normal text-night">TO SCAN</b> ]
          </>
        ) : (
          "[ DECYPHERING ]"
        )}
      </span>
    </div>
  );
}
