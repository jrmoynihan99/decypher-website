"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import CountUp from "@/components/ui/CountUp";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cancelDecrypt, decryptTo, encrypt, prefersReducedMotion } from "@/lib/decrypt";
import { fxOff } from "@/lib/fx";
import type { TaxSavingsSummary } from "@/lib/tax-recap/public-stats";

/**
 * The tax savings stage under the proof stats: four short panels in the
 * generated recap page's language — a heading, one giant figure or a row of
 * figures, hairlines instead of boxes — and only the recap's motion: the
 * count-up, the heading decrypting, a fade-and-rise, bars growing once.
 *
 *   the total        every recap's savings, added up
 *   a first year     what a new client saves: median, average, share of the bill
 *   who saved what   this year's clients by how much came off their bill
 *   real clients     three recaps from the middle of the range, anonymised
 *
 * On desktop the panels slide SIDEWAYS through a strip the height of the
 * revenue graph while the whole proof section stays pinned (ProofStats owns
 * the pin and the sticky block; this sizes them). The strip spans the browser
 * and a mask fades each panel to nothing before the screen edge. Scroll
 * progress runs through a plateau curve: fast between panels, still around
 * each one, so a centred panel doesn't twitch with every tick of the wheel,
 * and the last stretch of the range holds the final panel so it lands
 * centred before the section unpins. Each panel comes alive once, the first
 * time it's current; its glow (the section headings' orb, filter-free)
 * brightens with how close to centre it is.
 *
 * Phones and reduced motion stack the panels and reveal them on scroll.
 *
 * Every figure here is the server's `TaxSavingsSummary`; nothing is typed in.
 */

/** The strip's height on desktop — the revenue graph's. */
const STAGE_H = 380;
/** Scroll per panel, as a share of the viewport. */
const STEP_VH = 0.58;
/** The last 14% of the range holds the final panel. */
const DWELL = 0.86;
/** Plateau sharpness: between panels the scroll moves fast, around each it stills. */
const K = 3.2;
const plateau = (f: number) => {
  const a = f ** K;
  const b = (1 - f) ** K;
  return a / (a + b);
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The tallest bar, in px. */
const MAX_BAR_H = 150;
const EASE = "cubic-bezier(.08,.82,.17,1)";
/** GlowOrb's filter-free gradient (its coarse branch), at the heading orb's intensity. */
const GLOW =
  "radial-gradient(circle,rgba(255,45,120,0.184) 0%,rgba(139,43,232,0.115) 26%,rgba(139,43,232,0.0575) 48%,rgba(139,43,232,0.0184) 70%,rgba(10,10,14,0) 100%)";
const COUNT_WORDS = ["", "One", "Two", "Three"];

type Panel = { key: string; name: string; body: (on: boolean) => ReactNode };

/** Fade-and-rise, once. */
function rise(on: boolean, delay = 0): { className: string; style: CSSProperties } {
  return {
    className: `transition-[opacity,transform] duration-[900ms] motion-reduce:transition-none ${
      on ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
    }`,
    style: { transitionTimingFunction: EASE, transitionDelay: `${delay}ms` },
  };
}

export default function TaxSavingsStrip({
  summary,
  pinRef,
  stickyRef,
}: {
  summary: TaxSavingsSummary;
  /** The block that grows tall to give the strip its scroll range. */
  pinRef: RefObject<HTMLDivElement | null>;
  /** The block that pins: the whole proof section. */
  stickyRef: RefObject<HTMLDivElement | null>;
}) {
  const mobile = useIsMobile();
  const reduced = useReducedMotion();
  const stacked = mobile || reduced;
  const panels = buildPanels(summary);
  const n = panels.length;

  const trackRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** Stacked: one glow per panel. Desktop: one glow outside the clipped strip, so it bleeds. */
  const glowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const glowRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState<boolean[]>(() => panels.map(() => false));
  const [current, setCurrent] = useState(0);
  const enter = useCallback(
    (i: number) => setEntered((prev) => (prev[i] ? prev : prev.map((v, k) => (k === i ? true : v)))),
    [],
  );

  /* desktop: pin the section and drive the track from the scroll position */
  useEffect(() => {
    if (stacked || n < 2) return;
    const pin = pinRef.current;
    const sticky = stickyRef.current;
    const track = trackRef.current;
    if (!pin || !sticky || !track) return;
    const panelEls = panelRefs.current;
    const glow = glowRef.current;
    // the page's ambient layers (HomeTemplate marks them): they scroll with the
    // page, which reads as the backdrop sliding behind a pinned section, so
    // they fade out for the pin and back in once it releases
    const backdrop = [".js-proof-mesh", ".js-proof-rain"]
      .map((sel) => document.querySelector<HTMLElement>(sel))
      .filter((el): el is HTMLElement => !!el);
    let raf = 0;
    let cur = -1;

    const measure = () => {
      sticky.style.position = "sticky";
      const h = sticky.offsetHeight;
      // the whole section stays on screen: just under the top edge, or as high
      // as it needs to be when the viewport is shorter than the section
      sticky.style.top = `${Math.min(8, window.innerHeight - h - 8)}px`;
      pin.style.height = `${h + ((n - 1) * window.innerHeight * STEP_VH) / DWELL}px`;
    };
    const frame = () => {
      raf = 0;
      const top = pin.getBoundingClientRect().top + window.scrollY;
      const start = top - (parseFloat(sticky.style.top) || 0);
      const len = Math.max(1, pin.offsetHeight - sticky.offsetHeight);
      const raw = clamp((window.scrollY - start) / len / DWELL, 0, 1) * (n - 1);
      const seg = Math.min(Math.floor(raw), n - 2);
      const p = seg + plateau(raw - seg);
      track.style.transform = `translate3d(${(-p * 100) / n}%, 0, 0)`;
      panelEls.forEach((el, i) => {
        if (!el) return;
        el.style.opacity = String(clamp(1 - Math.abs(i - p) * 0.6, 0, 1));
      });
      // the glow brightens as each panel settles and dims between them
      if (glow) glow.style.opacity = String(clamp(1 - Math.abs(p - Math.round(p)) * 2.4, 0, 1));
      // the backdrop: out over the first 240px of the pin, back over 300px after it releases
      const y = window.scrollY;
      const fade =
        y < start ? 1
        : y < start + 240 ? 1 - (y - start) / 240
        : y <= start + len ? 0
        : clamp((y - start - len) / 300, 0, 1);
      for (const el of backdrop) el.style.opacity = String(fade);
      if (fillRef.current) fillRef.current.style.width = `${(p / (n - 1)) * 100}%`;
      const idx = Math.round(p);
      if (idx !== cur) {
        cur = idx;
        setCurrent(idx);
        enter(idx);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    measure();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      measure();
      onScroll();
    });
    ro.observe(sticky);
    return () => {
      window.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
      sticky.style.position = "";
      sticky.style.top = "";
      pin.style.height = "";
      track.style.transform = "";
      panelEls.forEach((el) => el && (el.style.opacity = ""));
      if (glow) glow.style.opacity = "";
      for (const el of backdrop) el.style.opacity = "";
    };
  }, [stacked, n, pinRef, stickyRef, enter]);

  /* stacked: panels reveal as they scroll in */
  useEffect(() => {
    if (!stacked) return;
    const panelEls = panelRefs.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const i = panelEls.indexOf(en.target as HTMLDivElement);
          if (i >= 0) enter(i);
          io.unobserve(en.target);
        }
      },
      { threshold: 0.3 },
    );
    panelEls.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [stacked, enter]);

  const goTo = (i: number) => {
    const pin = pinRef.current;
    const sticky = stickyRef.current;
    if (!pin || !sticky) return;
    const start = pin.getBoundingClientRect().top + window.scrollY - (parseFloat(sticky.style.top) || 0);
    const len = pin.offsetHeight - sticky.offsetHeight;
    window.scrollTo({
      top: start + (len * DWELL * i) / (n - 1) + 1,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const glows = !fxOff("orbs");

  return (
    <div>
      {/* readout header, as the revenue graph's */}
      <div className="mx-auto mb-3 flex max-w-[1160px] items-baseline justify-between gap-4 px-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted md:text-[10.5px] md:tracking-[0.18em]">
        <span>{"// tax savings found"}</span>
        <span className="flex items-center gap-2 whitespace-nowrap text-dusk">
          <span aria-hidden className="rvg-live-dot" />
          live from tax recaps
        </span>
      </div>

      {/* the strip: full-bleed on desktop (the section's own gutters undone), masked at the edges.
          Its glow sits OUTSIDE the clipped box so it bleeds up over the cards and down past the
          progress line instead of stopping at the strip's edge. */}
      <div className={stacked ? "" : "relative"}>
      {!stacked && glows && (
        <div
          ref={glowRef}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[980px] w-[980px] max-w-[100vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: GLOW, opacity: 0 }}
        />
      )}
      <div
        className={stacked ? "" : "relative -mx-4 overflow-hidden md:-mx-6"}
        style={
          stacked
            ? undefined
            : {
                height: STAGE_H,
                maskImage: "linear-gradient(to right, transparent 0, #000 14%, #000 86%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 14%, #000 86%, transparent 100%)",
              }
        }
      >
        <div
          ref={trackRef}
          className={stacked ? "flex flex-col" : "flex h-full will-change-transform"}
          style={stacked ? undefined : { width: `${n * 100}%` }}
        >
          {panels.map((panel, i) => (
            <div
              key={panel.key}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              className={
                stacked
                  ? "relative flex flex-col items-center px-2 py-9 text-center [&+&]:border-t [&+&]:border-white/[0.06]"
                  : "relative flex h-full flex-col items-center justify-center px-10 text-center transition-opacity duration-200"
              }
              style={stacked ? undefined : { width: `${100 / n}%` }}
            >
              {stacked && glows && (
                <div
                  ref={(el) => {
                    glowRefs.current[i] = el;
                  }}
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[640px] max-w-[100vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: GLOW, opacity: entered[i] ? 1 : 0, transition: "opacity 1.1s ease-out" }}
                />
              )}
              <div className="relative flex w-full flex-col items-center">{panel.body(entered[i])}</div>
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* progress: a gradient hairline and the panels' names, desktop only */}
      {!stacked && n > 1 && (
        <div className="mx-auto mt-3.5 max-w-[1160px]">
          <div className="relative h-px bg-white/[0.08]">
            <div
              ref={fillRef}
              className="absolute -top-px left-0 h-[3px] w-0 rounded-[2px] bg-gradient-to-r from-violet via-magenta to-[#ff5c96]"
            />
          </div>
          <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {panels.map((panel, i) => (
              <button
                key={panel.key}
                type="button"
                onClick={() => goTo(i)}
                className={`cursor-pointer bg-transparent py-1 font-mono text-[9.5px] uppercase tracking-[0.18em] transition-colors duration-300 hover:text-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta ${
                  i === current ? "text-magenta" : "text-faint"
                } ${i === 0 ? "text-left" : i === n - 1 ? "text-right" : "text-center"}`}
              >
                {panel.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── the panels ───────────────────────────── */

function buildPanels(s: TaxSavingsSummary): Panel[] {
  const panels: Panel[] = [];
  const years = s.firstTaxYear === s.lastTaxYear ? `${s.lastTaxYear}` : `${s.firstTaxYear}–${s.lastTaxYear}`;

  panels.push({
    key: "total",
    name: "the total",
    body: (on) => {
      const r = rise(on, 120);
      return (
        <>
          <Heading text="Total tax savings." active={on} />
          <div
            className={`${r.className} mt-[18px] font-display text-[clamp(52px,8.6vw,112px)] font-bold leading-none tracking-[-0.045em] text-teal`}
            style={r.style}
          >
            <CountUp start={on} value={s.totalSavings} />
          </div>
          <Mono on={on} delay={220}>
            <span>{s.clientCount} clients</span>
            <span>·</span>
            <span>{years} returns</span>
            <span className="inline-flex items-center gap-[7px] text-dusk">
              <i aria-hidden className="rvg-live-dot" />
              live
            </span>
          </Mono>
        </>
      );
    },
  });

  if (s.typical) {
    const t = s.typical;
    panels.push({
      key: "first-year",
      name: "a first year",
      body: (on) => {
        const r1 = rise(on, 120);
        const r2 = rise(on, 260);
        return (
          <>
            <Heading text="A typical first year." active={on} />
            <div className="mt-4 w-full max-w-[760px]">
              <div className={r1.className} style={r1.style}>
                <div className="font-display text-[clamp(44px,6.4vw,80px)] font-bold leading-none tracking-[-0.04em] text-teal">
                  <CountUp start={on} value={t.median} />
                </div>
                <div className="mt-2.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-magenta">
                  median saved · first year with us
                </div>
              </div>
              <div className={`${r2.className} mt-5 grid grid-cols-2 border-t border-white/[0.08]`} style={r2.style}>
                <Figure label={["average saved", "first year"]} delay={250} start={on} value={t.average} />
                {s.pctCut != null && (
                  <Figure
                    label={["of the tax bill", "gone"]}
                    delay={450}
                    start={on}
                    value={s.pctCut}
                    format="int"
                    suffix="%"
                    divided
                  />
                )}
              </div>
            </div>
          </>
        );
      },
    });
  }

  panels.push({
    key: "bands",
    name: "who saved what",
    body: (on) => {
      const r1 = rise(on, 120);
      const r2 = rise(on, 160);
      return (
        <div className="grid w-full max-w-[1000px] grid-cols-1 items-center gap-5 text-center md:grid-cols-[1fr_1.15fr] md:gap-10 md:text-left">
          <div className="flex flex-col items-center md:items-start">
            {/* the year is the latest with enough recaps to be a distribution (public-stats.ts),
                so this rolls over on its own once the next season's recaps come in */}
            <Heading text={`What clients saved in ${s.year.taxYear}.`} active={on} align="md:text-left" />
            <div
              className={`${r1.className} mt-3.5 font-display text-[clamp(44px,5.6vw,72px)] font-bold leading-none tracking-[-0.04em] text-teal`}
              style={r1.style}
            >
              <CountUp start={on} value={s.year.savings} />
            </div>
            <Mono on={on} delay={200} align="md:justify-start">
              <span>{s.year.clients} clients</span>
              <span>·</span>
              <span>{s.year.taxYear} returns</span>
            </Mono>
          </div>
          <div className={r2.className} style={r2.style}>
            <Bars bands={s.year.bands} on={on} />
          </div>
        </div>
      );
    },
  });

  if (s.examples.length) {
    const count = s.examples.length;
    panels.push({
      key: "examples",
      name: "real clients",
      body: (on) => (
        <>
          <Heading text={`${COUNT_WORDS[count]} real ${count === 1 ? "client" : "clients"}.`} active={on} />
          <div className="mt-3.5 grid w-full max-w-[1000px] grid-cols-1 sm:grid-cols-3">
            {s.examples.map((ex, c) => (
              <Example key={c} ex={ex} on={on} column={c} />
            ))}
          </div>
        </>
      ),
    });
  }

  return panels;
}

/* ───────────────────────────── the pieces ───────────────────────────── */

/**
 * A panel's heading, decrypting the first time the panel is current — the
 * section headings' sweep (lib/decrypt), driven by the strip instead of by
 * scrolling into view, since a panel can be on screen without being current.
 */
function Heading({ text, active, align = "" }: { text: string; active: boolean; align?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (!active) {
      // the resting state until the panel is current: scrambled, blurred
      if (!done.current) {
        encrypt(el, text);
        el.classList.remove("decrypt-pending");
      }
      return;
    }
    if (done.current) return;
    done.current = true;
    decryptTo(el, text);
    el.classList.remove("decrypt-pending");
    return () => {
      cancelDecrypt(el);
      el.textContent = text;
    };
  }, [active, text]);
  return (
    <h3
      ref={ref}
      className={`decrypt-pending m-0 font-display text-[clamp(24px,2.8vw,34px)] font-bold leading-[1.05] tracking-[-0.025em] text-fog [text-wrap:balance] ${align}`}
    >
      {text}
    </h3>
  );
}

/** The one mono line under a figure. */
function Mono({
  on,
  delay,
  align = "",
  children,
}: {
  on: boolean;
  delay: number;
  align?: string;
  children: ReactNode;
}) {
  const r = rise(on, delay);
  return (
    <div
      className={`${r.className} mt-2.5 flex flex-wrap justify-center gap-x-3 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted ${align}`}
      style={r.style}
    >
      {children}
    </div>
  );
}

/** One of the two smaller figures on the first-year panel. */
function Figure({
  label,
  value,
  delay,
  start,
  format = "money",
  suffix,
  divided = false,
}: {
  label: [string, string];
  value: number;
  delay: number;
  start: boolean;
  format?: "money" | "int";
  suffix?: string;
  divided?: boolean;
}) {
  return (
    <div className={`px-3 pt-4 ${divided ? "border-l border-white/[0.08]" : ""}`}>
      <div className="font-display text-[clamp(26px,3vw,40px)] font-bold leading-none tracking-[-0.02em] text-fog">
        <CountUp start={start} delay={delay} value={value} format={format} suffix={suffix} />
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-muted">
        {label[0]}
        <br />
        {label[1]}
      </div>
    </div>
  );
}

/**
 * This year's clients by what they saved: four columns on a bare baseline,
 * each count riding its bar's cap, a hairline across the bar for every ten
 * clients so the height can be read without an axis.
 */
function Bars({ bands, on }: { bands: { label: string; count: number }[]; on: boolean }) {
  const max = Math.max(1, ...bands.map((b) => b.count));
  const total = bands.reduce((s, b) => s + b.count, 0);
  const pitch = (MAX_BAR_H / max) * 10;
  const lines =
    pitch >= 6
      ? `repeating-linear-gradient(to top, transparent 0 ${(pitch - 1).toFixed(2)}px, rgba(10,10,14,0.55) ${(pitch - 1).toFixed(2)}px ${pitch.toFixed(2)}px), `
      : "";
  return (
    <div className="relative">
      <div className="grid grid-cols-4 items-end gap-2.5 sm:gap-[18px]">
        {bands.map((b, i) => {
          const h = (MAX_BAR_H * b.count) / max;
          const delay = `${i * 120}ms`;
          return (
            <div
              key={b.label}
              tabIndex={0}
              className="group relative flex min-w-0 flex-col items-center justify-end focus-visible:outline-none"
            >
              {/* "46% of clients", on hover */}
              <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-panel/85 px-2.5 py-1.5 font-mono text-[12px] font-semibold tabular-nums leading-none text-fog opacity-0 shadow-[0_10px_36px_-12px_rgba(255,45,120,0.45)] backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                {total ? Math.round((b.count / total) * 100) : 0}% of clients
              </div>
              <div className="relative flex w-full max-w-[84px] items-end" style={{ height: MAX_BAR_H + 48 }}>
                <div
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-[clamp(24px,2.8vw,34px)] font-bold leading-none tracking-[-0.02em] text-fog transition-[bottom] duration-[1300ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
                  style={{ bottom: on ? h + 10 : 10, transitionDelay: delay }}
                >
                  <CountUp start={on} delay={i * 120} value={b.count} format="int" />
                </div>
                <div
                  className="relative w-full origin-bottom rounded-t-[5px] transition-transform duration-[1300ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:brightness-115 motion-reduce:transition-none"
                  style={{
                    height: h,
                    transform: on ? "scaleY(1)" : "scaleY(0)",
                    transitionDelay: delay,
                    backgroundImage: `${lines}linear-gradient(to top, rgba(61,214,196,0.12), rgba(61,214,196,0.78) 70%, #3dd6c4)`,
                  }}
                >
                  <span className="absolute inset-x-0 top-0 h-[2px] rounded-[2px] bg-white opacity-90 shadow-[0_0_18px_2px_rgba(61,214,196,0.75)]" />
                </div>
              </div>
              <div className="mt-3 whitespace-nowrap font-display text-[clamp(13px,1.4vw,16px)] font-semibold tracking-[-0.01em] text-fog">
                {b.label}
              </div>
            </div>
          );
        })}
      </div>
      {/* the baseline, under the bars and above the labels */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[30px] h-px bg-white/[0.14]" />
    </div>
  );
}

/**
 * One real client: the income counts up, then the bill before, then a red
 * line strikes it out, the bill after counts up in teal, and the savings
 * land big at the bottom. The columns stagger by a beat.
 */
function Example({
  ex,
  on,
  column,
}: {
  ex: TaxSavingsSummary["examples"][number];
  on: boolean;
  column: number;
}) {
  const base = column * 200;
  const slashAt = `${base + 1500}ms`;
  const r = rise(on, 120 + column * 180);
  return (
    <div
      className={`${r.className} min-w-0 px-[22px] pb-1 pt-3 [&+&]:border-t [&+&]:border-white/[0.08] sm:[&+&]:border-l sm:[&+&]:border-t-0`}
      style={r.style}
    >
      <div className="mx-auto max-w-[260px] text-left">
        <Row label="Income">
          <CountUp start={on} delay={base} value={ex.income} />
        </Row>
        <Row label="Tax bill before">
          <b
            className="relative font-normal transition-colors duration-500"
            style={{ color: on ? "var(--color-dusk)" : "var(--color-fog)", transitionDelay: slashAt }}
          >
            <CountUp start={on} delay={base + 450} value={ex.before} />
            <i
              aria-hidden
              className="absolute -left-[3px] top-[52%] h-[2px] bg-danger transition-[width] duration-[480ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
              style={{ width: on ? "calc(100% + 6px)" : 0, transitionDelay: slashAt }}
            />
          </b>
        </Row>
        <Row label="Tax bill after" tone="pos">
          <CountUp start={on} delay={base + 1700} value={ex.after} />
        </Row>
      </div>
      <div className="mt-3 border-t-2 border-white/15 pt-3 text-center">
        <div className="font-display text-[clamp(32px,3.4vw,46px)] font-bold leading-none tracking-[-0.03em] text-teal">
          <CountUp start={on} delay={base + 2300} value={ex.savings} />
        </div>
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          saved · <b className="font-semibold text-teal">{ex.pct}% off</b>
        </div>
      </div>
    </div>
  );
}

function Row({ label, tone = "plain", children }: { label: string; tone?: "plain" | "pos"; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-white/[0.08] py-[7px] text-[14px] first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className={`font-mono tabular-nums ${tone === "pos" ? "font-semibold text-teal" : "text-fog"}`}>
        {children}
      </span>
    </div>
  );
}
