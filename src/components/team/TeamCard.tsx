"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { useSpotlight } from "@/hooks/useSpotlight";
import { cancelDecrypt, decryptTo } from "@/lib/decrypt";
import { TeamMember } from "@/lib/team";

const noHover = () =>
  typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches;

/**
 * Codename redaction: decrypts on hover, re-redacts on leave. Touch devices
 * have no hover, so there the codename decrypts once when it scrolls into
 * view (and the emulated mouseleave a tap fires never re-redacts it).
 */
function useCodename(p: TeamMember) {
  const codeRef = useRef<HTMLSpanElement>(null);
  const reveal = () => decryptTo(codeRef.current, p.codename);
  const hide = () => {
    const txt = codeRef.current;
    if (!txt || noHover()) return;
    cancelDecrypt(txt);
    txt.textContent = p.redacted;
  };

  useEffect(() => {
    if (!noHover()) return;
    const el = codeRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          decryptTo(el, p.codename);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [p.codename]);

  return { codeRef, reveal, hide };
}

/** Photo spotlight overlay driven by useSpotlight's --mx/--my vars. */
function Spotlight() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-0 mix-blend-overlay transition-opacity duration-500 group-hover:opacity-100"
      style={{
        background:
          "radial-gradient(320px circle at var(--mx, 50%) var(--my, 0%), rgba(255,255,255,.5), transparent 62%)",
      }}
    />
  );
}

/**
 * Personnel-file card: photo desaturated and codename redacted (████) until
 * hovered, when the photo colorizes, a spotlight trails the cursor, and the
 * codename decrypts.
 */
export default function TeamCard({ p }: { p: TeamMember }) {
  const { codeRef, reveal, hide } = useCodename(p);
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLElement>();

  return (
    <article
      ref={ref}
      onMouseEnter={reveal}
      onMouseMove={onMouseMove}
      onMouseLeave={() => {
        hide();
        onMouseLeave();
      }}
      className="group relative aspect-[4/5.1] cursor-pointer overflow-hidden rounded-[20px] border border-edge bg-panel transition-[translate,border-color,box-shadow] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-2 hover:border-magenta/55 hover:shadow-[0_28px_56px_-18px_rgba(255,45,120,0.45)]"
    >
      <Image
        src={p.img}
        alt={p.name}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        className="object-cover object-[50%_22%] grayscale-[.55] contrast-[1.02] transition-[filter,scale] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.04] group-hover:grayscale-0 group-hover:contrast-[1.04]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,14,.24)_0%,transparent_26%,transparent_40%,rgba(10,10,14,.95)_90%)]"
      />
      <Spotlight />
      <div className="absolute left-[13px] right-[13px] top-[13px] flex items-center justify-between gap-2">
        {p.tag && (
          <span className="rounded-full border border-magenta/45 bg-night/60 px-[11px] py-[5px] font-mono text-[10px] uppercase tracking-[0.16em] text-magenta backdrop-blur-md">
            {p.tag}
          </span>
        )}
        <span className="ml-auto rounded-full bg-night/50 px-[9px] py-[5px] font-mono text-[10px] tracking-[0.14em] text-fog/55 backdrop-blur-md">
          {p.fid}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-[15px] pt-[18px]">
        <h3 className="m-0 font-display text-[19px] font-semibold leading-[1.15] tracking-[-0.01em] text-white [text-shadow:0_2px_14px_rgba(0,0,0,.55)]">
          {p.name}
        </h3>
        <p className="m-0 text-[13px] leading-[1.35] text-[#C9C4D6] [text-shadow:0_1px_8px_rgba(0,0,0,.5)]">
          {p.role}
        </p>
        <p className="mb-0 mt-[9px] flex min-h-4 items-center gap-[7px] border-t border-white/10 pt-2.5 font-mono text-[12.5px] font-medium tracking-[0.06em] text-muted">
          <span className="text-[8px] text-magenta/60">◆</span>
          <span
            ref={codeRef}
            className="transition-[color,text-shadow] duration-300 group-hover:text-magenta group-hover:[text-shadow:0_0_14px_rgba(255,45,120,.45)]"
          >
            {p.redacted}
          </span>
        </p>
      </div>
    </article>
  );
}

/**
 * Feature dossier for the top tier: a wide two-panel card — photo on the
 * left, an open personnel file on the right with the codename as its own
 * labelled block. Same decrypt-on-hover mechanics as the compact card.
 */
export function TeamFeatureCard({ p }: { p: TeamMember }) {
  const { codeRef, reveal, hide } = useCodename(p);
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLElement>();

  return (
    <article
      ref={ref}
      onMouseEnter={reveal}
      onMouseMove={onMouseMove}
      onMouseLeave={() => {
        hide();
        onMouseLeave();
      }}
      className="group relative grid cursor-pointer overflow-hidden rounded-[22px] border border-edge bg-panel transition-[translate,border-color,box-shadow] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-2 hover:border-magenta/55 hover:shadow-[0_32px_70px_-22px_rgba(255,45,120,0.5)] sm:grid-cols-[42%_1fr]"
    >
      {/* photo panel */}
      <div className="relative aspect-[4/3.4] overflow-hidden sm:aspect-auto sm:min-h-[320px]">
        <Image
          src={p.img}
          alt={p.name}
          fill
          sizes="(max-width: 640px) 100vw, 40vw"
          className="object-cover object-[50%_22%] grayscale-[.55] contrast-[1.02] transition-[filter,scale] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.04] group-hover:grayscale-0 group-hover:contrast-[1.04]"
        />
        {/* fade the photo into the file panel */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_58%,rgba(20,19,25,.96)_100%)] sm:bg-[linear-gradient(90deg,transparent_55%,rgba(20,19,25,.96)_100%)]"
        />
      </div>

      {/* file panel */}
      <div className="relative flex flex-col p-6 sm:p-7">
        <div className="flex items-center justify-between gap-2">
          {p.tag ? (
            <span className="rounded-full border border-magenta/45 bg-night/60 px-[11px] py-[5px] font-mono text-[10px] uppercase tracking-[0.16em] text-magenta">
              {p.tag}
            </span>
          ) : (
            <span className="font-mono text-[10px] tracking-[0.24em] text-faint">
              [ PERSONNEL FILE ]
            </span>
          )}
          <span className="rounded-full bg-night/50 px-[9px] py-[5px] font-mono text-[10px] tracking-[0.14em] text-fog/55">
            {p.fid}
          </span>
        </div>

        <h3 className="mb-0 mt-5 font-display text-[clamp(22px,2.4vw,28px)] font-semibold leading-[1.12] tracking-[-0.015em] text-fog">
          {p.name}
        </h3>
        <p className="mb-0 mt-1.5 text-[14.5px] leading-relaxed text-mist">
          {p.role}
        </p>

        <div className="mt-auto border-t border-white/10 pt-4 sm:pt-5">
          <p className="m-0 font-mono text-[9.5px] uppercase tracking-[0.3em] text-faint">
            Codename
          </p>
          <p className="mb-0 mt-2 flex min-h-5 items-center gap-2 font-mono text-[15px] font-medium tracking-[0.05em] text-muted">
            <span className="text-[9px] text-magenta/60">◆</span>
            <span
              ref={codeRef}
              className="transition-[color,text-shadow] duration-300 group-hover:text-magenta group-hover:[text-shadow:0_0_14px_rgba(255,45,120,.45)]"
            >
              {p.redacted}
            </span>
          </p>
        </div>
      </div>

      <Spotlight />
    </article>
  );
}
