"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface TiltOptions {
  /** px the tilted element drifts toward the cursor */
  translate?: number;
  /** deg of rotateX / rotateY at the element's edges */
  rotate?: number;
  /** perspective distance for the 3D tilt */
  perspective?: number;
  /** multiplier for the parallax child's drift — 0 leaves it untouched */
  parallax?: number;
  /** spring stiffness — lower = more trailing lag behind the cursor */
  stiffness?: number;
}

/**
 * Cursor-following 3D tilt, ported from ServicesCircuit's PipelineRow. A rAF
 * spring eases the element toward the pointer (low stiffness → the content
 * lags), applying `perspective rotateX rotateY translate3d` so it leans toward
 * the cursor and drifts back on leave. An optional `parallaxRef` (e.g. a giant
 * ghost numeral) drifts further via `parallax` for layered depth.
 *
 * Attach the handlers to the element you want to measure the cursor against
 * (which can be a wrapper), point `ref` at the element that should tilt, and
 * `parallaxRef` at the deeper element. `hovered` drives glow/shadow changes.
 * No-ops under prefers-reduced-motion.
 */
export function useTilt<
  T extends HTMLElement = HTMLDivElement,
  P extends HTMLElement = HTMLElement,
>({
  translate = 12,
  rotate = 4.5,
  perspective = 900,
  parallax = 0,
  stiffness = 0.09,
}: TiltOptions = {}) {
  const ref = useRef<T | null>(null);
  const parallaxRef = useRef<P | null>(null);
  const [hovered, setHovered] = useState(false);
  const reduced = useReducedMotion();

  const s = useRef({
    tx: 0,
    ty: 0,
    rx: 0,
    ry: 0,
    cx: 0,
    cy: 0,
    crx: 0,
    cry: 0,
    raf: 0,
    running: false,
  });

  useEffect(() => {
    const st = s.current;
    return () => {
      if (st.raf) cancelAnimationFrame(st.raf);
    };
  }, []);

  const run = () => {
    const st = s.current;
    if (st.running) return;
    st.running = true;
    const step = () => {
      const k = stiffness;
      st.cx += (st.tx - st.cx) * k;
      st.cy += (st.ty - st.cy) * k;
      st.crx += (st.rx - st.crx) * k;
      st.cry += (st.ry - st.cry) * k;
      if (ref.current)
        ref.current.style.transform = `perspective(${perspective}px) rotateX(${st.crx.toFixed(
          3,
        )}deg) rotateY(${st.cry.toFixed(3)}deg) translate3d(${st.cx.toFixed(
          2,
        )}px, ${st.cy.toFixed(2)}px, 0)`;
      if (parallaxRef.current)
        parallaxRef.current.style.transform = `translate3d(${(
          st.cx * parallax
        ).toFixed(2)}px, ${(st.cy * parallax).toFixed(2)}px, 0)`;
      const rest =
        Math.abs(st.tx - st.cx) < 0.03 &&
        Math.abs(st.ty - st.cy) < 0.03 &&
        Math.abs(st.rx - st.crx) < 0.02 &&
        Math.abs(st.ry - st.cry) < 0.02;
      if (rest && st.tx === 0 && st.ty === 0 && st.rx === 0 && st.ry === 0) {
        // settle back to identity so no residual transform is left behind
        if (ref.current) ref.current.style.transform = "";
        if (parallaxRef.current) parallaxRef.current.style.transform = "";
        st.running = false;
        st.raf = 0;
        return;
      }
      st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
  };

  const onMouseEnter = () => {
    if (reduced) return;
    setHovered(true);
  };

  const onMouseMove = (e: ReactMouseEvent) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const st = s.current;
    st.tx = dx * translate;
    st.ty = dy * translate;
    st.ry = dx * rotate;
    st.rx = -dy * rotate;
    run();
  };

  const onMouseLeave = () => {
    if (reduced) return;
    setHovered(false);
    const st = s.current;
    st.tx = st.ty = st.rx = st.ry = 0;
    run();
  };

  return { ref, parallaxRef, hovered, onMouseEnter, onMouseMove, onMouseLeave };
}
