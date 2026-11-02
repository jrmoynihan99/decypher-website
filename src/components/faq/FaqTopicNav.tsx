"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import ConsultButton from "@/components/ui/ConsultButton";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { noop } from "@/lib/noop";

export type FaqTopic = { anchor: string; title: string };

const num = (i: number) => String(i + 1).padStart(2, "0");

/**
 * The FAQ hub's way around, alongside the questions only (not the index
 * above them):
 *
 * - desktop: a topic rail pinned in the column beside the questions, the
 *   /services flight-plan look. It tracks the topic being read, jumps on
 *   click, and keeps the consultation button in reach the whole way down.
 * - phones and tablets: a floating bar at the bottom with the same two jobs,
 *   a topic picker and the consultation button. It shows once the first topic
 *   is on screen and leaves as the last one scrolls off (the closing CTA box
 *   takes over there). Same iOS 26 rules as ScrollToTop: inset off the edges,
 *   display:none once hidden, solid instead of backdrop-blur (answer text
 *   scrolling under a see-through bar is hard to read past).
 *
 * Renders straight into the hub's grid: the rail is the left column's cell,
 * the bar is fixed and takes no cell.
 */
export default function FaqTopicNav({ topics }: { topics: FaqTopic[] }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // One read per frame: the current topic is the last one whose top has
  // passed 40% of the screen; the bar shows while the topics fill the screen.
  useEffect(() => {
    const els = topics
      .map((t) => document.getElementById(t.anchor))
      .filter((el): el is HTMLElement => el !== null);
    if (!els.length) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const vh = window.innerHeight;
      let current = 0;
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= vh * 0.4) current = i;
      });
      setActive(current);
      const inside =
        els[0].getBoundingClientRect().top < vh * 0.75 &&
        els[els.length - 1].getBoundingClientRect().bottom > vh * 0.5;
      setShown(inside);
      if (!inside) setOpen(false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [topics]);

  // the picker closes on a tap outside the bar or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!topics.length) return null;
  const total = String(topics.length).padStart(2, "0");

  return (
    <>
      <aside className="hidden lg:col-start-1 lg:row-start-2 lg:block">
        {/* mt-20 lines the rail up with the first topic's label */}
        <div className="sticky top-28 mt-20">
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.26em] text-faint">
            [ topics ]
          </p>
          <nav aria-label="FAQ topics" className="mt-4 flex flex-col">
            {topics.map((t, i) => {
              const on = active === i;
              return (
                <a
                  key={t.anchor}
                  href={`#${t.anchor}`}
                  aria-current={on ? "location" : undefined}
                  className="group flex items-start gap-3 rounded-lg px-2 py-[7px] no-underline"
                >
                  <span
                    aria-hidden
                    className={`mt-[3px] h-2.5 w-2.5 flex-none rounded-full border transition-all duration-300 ${
                      on
                        ? "border-magenta bg-magenta shadow-[0_0_10px_rgba(255,45,120,0.8)]"
                        : "border-edge-bright group-hover:border-mist"
                    }`}
                  />
                  <span
                    className={`font-mono text-[10px] leading-[1.6] tracking-[0.18em] transition-colors ${
                      on ? "text-fog" : "text-faint group-hover:text-mist"
                    }`}
                  >
                    {num(i)}
                  </span>
                  <span
                    className={`font-mono text-[10.5px] uppercase leading-[1.5] tracking-[0.08em] transition-colors ${
                      on ? "text-mist" : "text-faint group-hover:text-mist"
                    }`}
                  >
                    {t.title}
                  </span>
                </a>
              );
            })}
          </nav>
          <p className="m-0 mt-4 px-2 font-mono text-[10px] tracking-[0.2em] text-faint">
            TOPIC {num(active)} / {total}
          </p>
          <div className="mt-7 border-t border-edge px-2 pt-7">
            <ConsultButton />
          </div>
        </div>
      </aside>

      {/* lg:hidden! is important on purpose: framer writes display inline */}
      <motion.div
        ref={barRef}
        initial={false}
        animate={{
          opacity: shown ? 1 : 0,
          y: shown ? 0 : 16,
          display: "block",
          transitionEnd: { display: shown ? "block" : "none" },
        }}
        transition={{
          duration: reduced ? 0 : 0.35,
          ease: [0.08, 0.82, 0.17, 1] as [number, number, number, number],
        }}
        onUpdate={noop}
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[80] mx-auto hidden max-w-[520px] lg:hidden!"
      >
        {open && (
          <nav
            id="faq-topic-picker"
            aria-label="FAQ topics"
            data-lenis-prevent
            className="absolute inset-x-0 bottom-full mb-2 max-h-[min(60svh,460px)] overflow-y-auto rounded-2xl border border-edge-bright bg-panel p-2 shadow-[0_18px_50px_rgba(0,0,0,.55)]"
          >
            {topics.map((t, i) => {
              const on = active === i;
              return (
                <a
                  key={t.anchor}
                  href={`#${t.anchor}`}
                  onClick={() => setOpen(false)}
                  aria-current={on ? "location" : undefined}
                  className={`flex items-baseline gap-3 rounded-xl px-3 py-3 no-underline ${on ? "bg-panel-2" : ""}`}
                >
                  <span className={`font-mono text-[10.5px] tracking-[0.18em] ${on ? "text-magenta" : "text-faint"}`}>
                    {num(i)}
                  </span>
                  <span className={`text-[15px] leading-snug ${on ? "text-fog" : "text-mist"}`}>{t.title}</span>
                </a>
              );
            })}
          </nav>
        )}
        <div className="flex items-center gap-2 rounded-2xl border border-edge-bright bg-panel p-2 shadow-[0_10px_30px_rgba(0,0,0,.45)]">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="faq-topic-picker"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl border-0 bg-transparent px-2.5 py-1.5 text-left"
          >
            <span className="flex min-w-0 flex-col">
              <span className="font-mono text-[9.5px] tracking-[0.2em] text-magenta">
                TOPIC {num(active)} / {total}
              </span>
              <span className="mt-0.5 truncate text-[13.5px] leading-snug text-fog">
                {topics[active]?.title}
              </span>
            </span>
            <svg
              aria-hidden
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`ml-auto flex-none text-faint transition-transform duration-200 ${open ? "" : "rotate-180"}`}
            >
              <path d="M2 6.5 5 3.5l3 3" />
            </svg>
          </button>
          <div className="flex-none">
            <ConsultButton />
          </div>
        </div>
      </motion.div>
    </>
  );
}
