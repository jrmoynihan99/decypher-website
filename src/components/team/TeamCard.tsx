"use client";

import Image from "next/image";
import { useRef } from "react";
import { cancelDecrypt, decryptTo } from "@/lib/decrypt";
import { TeamMember } from "@/lib/team";

/**
 * Personnel-file card: photo desaturated and codename redacted (████) until
 * hovered, when the photo colorizes and the codename decrypts.
 */
export default function TeamCard({ p }: { p: TeamMember }) {
  const codeRef = useRef<HTMLSpanElement>(null);

  const reveal = () => decryptTo(codeRef.current, p.codename);
  const hide = () => {
    const txt = codeRef.current;
    if (!txt) return;
    cancelDecrypt(txt);
    txt.textContent = p.redacted;
  };

  return (
    <article
      onMouseEnter={reveal}
      onMouseLeave={hide}
      className="group relative aspect-[4/5.1] cursor-pointer overflow-hidden rounded-[20px] border border-edge bg-panel transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-magenta/55 hover:shadow-[0_24px_48px_-18px_rgba(255,45,120,0.4)]"
    >
      <Image
        src={p.img}
        alt={p.name}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        className="object-cover object-[50%_22%] grayscale-[.55] contrast-[1.02] transition-[filter,transform] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.04] group-hover:grayscale-0 group-hover:contrast-[1.04]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,14,.24)_0%,transparent_26%,transparent_40%,rgba(10,10,14,.95)_90%)]"
      />
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
