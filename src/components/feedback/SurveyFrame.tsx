"use client";

import CipherRain from "@/components/effects/CipherRain";
import NeuralWeb from "@/components/effects/NeuralWeb";
import GlowOrb from "@/components/ui/GlowOrb";
import { SURVEY_CSS } from "./survey-fx";

/**
 * The survey's shell: the recap's background (cipher rain, the neural mesh,
 * a glow that crossfades from the brand orb to a teal one as the mood
 * lifts), a 580px column with the wordmark, a mono readout, the per-question
 * progress bar, and the decrypting chip in the corner. The client feedback
 * survey and the sales discovery call both render inside it, so the two read
 * as the same place.
 *
 * `pink` is the feedback survey's full-bleed magenta slide (the review ask):
 * the background layers drop out and the chrome swaps to night ink.
 */

/** The teal orb's stops: the brand teal, and the deeper teal of the light palette. */
const TEAL_ORB = { core: "61,214,196", mid: "11,130,118" };

/** NeuralWeb faded in at the top and out at the bottom, as on the recap. */
const WEB_MASK = "linear-gradient(to bottom, transparent 0, #000 140px, #000 calc(100% - 200px), transparent 100%)";

export type SurveyGlow = {
  /** 0 → the brand orb, 1 → the teal one. */
  lift: number;
  /** Overall opacity — dimmed on a quiet end screen. */
  dim: number;
};

export default function SurveyFrame({
  pink = false,
  glow,
  count,
  progress,
  pct,
  screenKey,
  topBar,
  headerExtra,
  children,
}: {
  pink?: boolean;
  glow: SurveyGlow;
  /** The header's mono readout, e.g. "[ 03 / 09 ]". */
  count: string;
  /** The progress bar: one segment per key, lit up to `idx`. Null hides it (the intro). */
  progress: { idx: number; keys: string[] } | null;
  /** The corner chip's percentage. */
  pct: number;
  /** Keys the screen, so each one mounts fresh and its headline decrypts once. */
  screenKey: string;
  /** A slim bar above the header — the feedback survey's preview switcher. */
  topBar?: React.ReactNode;
  /** Sits beside the readout — the discovery call's staff-notes button. */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      // isolate: NeuralWeb sits at -z-10 inside its positioned ancestor, and
      // without a stacking context here it would drop behind the page.
      className={`fb-root relative isolate min-h-svh overflow-x-clip transition-colors duration-500 ${
        pink ? "bg-magenta text-night" : "text-fog"
      }`}
    >
      <style>{SURVEY_CSS}</style>

      {/* The recap's background, built from the site's own layers: cipher
          rain, the neural mesh, and GlowOrb. Off on the magenta slide. */}
      {pink ? null : (
        <>
          <CipherRain />
          <NeuralWeb style={{ WebkitMaskImage: WEB_MASK, maskImage: WEB_MASK }} />
          {/* Absolute in a clipped layer rather than fixed: a full-screen fixed
              layer flush to the bottom edge is what makes iOS 26 paint its
              home-indicator bar solid (see CipherRain). The orbs centre on
              their box, so the box's height puts the glow at 44% of the
              screen, behind the question. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-[88svh] transition-opacity duration-[1100ms] ease-out"
              style={{ opacity: glow.dim }}
            >
              <div
                className="absolute inset-0 transition-opacity duration-[1100ms] ease-out"
                style={{ opacity: 1 - glow.lift }}
              >
                <GlowOrb size={980} alpha={0.22} beta={0.12} />
              </div>
              <div
                className="absolute inset-0 transition-opacity duration-[1100ms] ease-out"
                style={{ opacity: glow.lift }}
              >
                <GlowOrb size={980} alpha={0.22} beta={0.12} rgb={TEAL_ORB} />
              </div>
            </div>
          </div>
        </>
      )}

      <div className="relative z-[1] mx-auto flex min-h-svh max-w-[580px] flex-col px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))]">
        {topBar}

        <header className="flex items-center justify-between gap-3">
          <div className={`font-display text-[17px] font-semibold ${pink ? "text-night" : "text-fog"}`}>
            DeCypher <span className={pink ? "text-white" : "text-grad"}>Financials</span>
          </div>
          <div className="flex items-center gap-3">
            {/* nowrap: on a phone the wordmark gives way, not the readout */}
            <div className={`whitespace-nowrap font-mono text-[11.5px] tracking-[0.1em] ${pink ? "text-night/70" : "text-muted"}`}>{count}</div>
            {headerExtra}
          </div>
        </header>

        {progress ? (
          <div
            aria-hidden
            className="mt-3.5 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${progress.keys.length}, minmax(0, 1fr))` }}
          >
            {progress.keys.map((k, i) => (
              <span
                key={k}
                className={`h-[2px] rounded-[2px] transition-[background-color,box-shadow] duration-300 ${
                  i < progress.idx
                    ? pink
                      ? "bg-night"
                      : "bg-magenta"
                    : i === progress.idx
                      ? "bg-teal shadow-[0_0_10px_var(--color-teal)]"
                      : pink
                        ? "bg-night/20"
                        : "bg-white/10"
                }`}
              />
            ))}
          </div>
        ) : null}

        <main
          key={screenKey}
          className={`flex flex-1 flex-col ${pink ? "pt-[clamp(20px,4vh,44px)]" : "pt-[clamp(30px,8vh,76px)]"}`}
        >
          {children}
        </main>
      </div>

      {/* the site's decrypting chip — desktop only, as on the recap */}
      {pink ? null : (
        <div
          aria-hidden
          className="fixed bottom-[18px] left-[18px] z-[2] hidden rounded-lg border border-edge-mid bg-night/80 px-3 py-2 font-mono text-[11px] tracking-[0.14em] text-[#9A93AB] backdrop-blur-[8px] md:block"
        >
          {"[ DECYPHERING // "}<span className="text-teal">{pct}%</span>{" ]"}
        </div>
      )}
    </div>
  );
}

/** The magenta pill that moves a survey on. */
export function PrimaryButton({
  children,
  disabled = false,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-[50px] cursor-pointer items-center justify-center rounded-full border-0 bg-magenta px-6 font-display text-[15.5px] font-semibold text-night shadow-[0_0_30px_rgba(255,45,120,.38)] transition-[filter,box-shadow,opacity] duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none disabled:hover:brightness-100 ${className}`}
    >
      {children}
    </button>
  );
}

/** The quiet "Back" at the foot of a question. */
export function BackButton({ children = "Back", onClick }: { children?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] cursor-pointer border-0 bg-transparent px-1 font-body text-[15px] font-medium text-muted transition-colors hover:text-fog"
    >
      {children}
    </button>
  );
}

/** The teal tick that opens an end screen. */
export function DoneMark() {
  return (
    <div
      aria-hidden
      className="mb-6 grid h-14 w-14 place-items-center rounded-full bg-teal/[0.12] text-teal shadow-[0_0_34px_rgba(61,214,196,.3)]"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </div>
  );
}
