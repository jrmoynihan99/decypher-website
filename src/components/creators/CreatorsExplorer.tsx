"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  Creator,
  PLATFORM_LABEL,
  accentFor,
  creators,
  hexToRgba,
} from "@/lib/creators";

/** Filter tabs: All first, groups by count desc, Other last. */
function buildTabs(data: Creator[]) {
  const counts: Record<string, number> = {};
  data.forEach((c) => {
    counts[c.group] = (counts[c.group] || 0) + 1;
  });
  const keys = Object.keys(counts)
    .filter((k) => k !== "Other")
    .sort((a, b) => counts[b] - counts[a]);
  if (counts.Other) keys.push("Other");
  return [
    { key: "all", label: "All", count: data.length },
    ...keys.map((k) => ({ key: k, label: k, count: counts[k] })),
  ];
}

function CreatorCard({ c, fileNo }: { c: Creator; fileNo: string }) {
  const ac = accentFor(c.cat);
  return (
    <article className="group relative aspect-[4/5] overflow-hidden rounded-[20px] border border-edge bg-panel transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-magenta/55 hover:shadow-[0_24px_48px_-18px_rgba(255,45,120,0.4)]">
      <Image
        src={c.img}
        alt={c.name}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        className="object-cover object-[50%_20%] brightness-[.94] transition-[transform,filter] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06] group-hover:brightness-[1.02]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,14,.22)_0%,transparent_26%,transparent_44%,rgba(10,10,14,.94)_92%)]"
      />
      <div className="absolute left-[13px] right-[13px] top-[13px] flex items-center justify-between gap-2">
        <span
          className="rounded-full border bg-night/60 px-[11px] py-[5px] font-mono text-[10px] uppercase tracking-[0.16em] backdrop-blur-md"
          style={{ color: ac, borderColor: hexToRgba(ac, 0.45) }}
        >
          {c.cat}
        </span>
        <span className="rounded-full bg-night/50 px-[9px] py-[5px] font-mono text-[10px] tracking-[0.14em] text-fog/55 backdrop-blur-md">
          № {fileNo}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-[11px] px-4 pb-4 pt-[18px]">
        <h3 className="m-0 font-display text-[19px] font-semibold leading-[1.18] tracking-[-0.01em] text-white [text-shadow:0_2px_14px_rgba(0,0,0,.55)]">
          {c.name}
        </h3>
        <div className="flex flex-wrap gap-[7px]">
          {c.links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener"
              className="rounded-full border border-white/15 bg-night/55 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.1em] text-[#D9D4E4] no-underline backdrop-blur-md transition-colors hover:border-magenta hover:text-magenta"
            >
              {PLATFORM_LABEL[l.plat] ?? l.plat.toUpperCase()} ↗
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function CreatorsExplorer() {
  const [active, setActive] = useState("all");
  const tabs = useMemo(() => buildTabs(creators), []);
  const list =
    active === "all" ? creators : creators.filter((c) => c.group === active);

  return (
    <>
      {/* filter tabs */}
      <div className="relative z-[2] mx-auto mt-[34px] flex max-w-[1220px] flex-wrap justify-center gap-2.5 px-7">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-[9px] font-mono text-xs uppercase tracking-[0.08em] transition-colors duration-200 hover:border-magenta ${
                on
                  ? "border-magenta/55 bg-magenta/[.14] text-magenta"
                  : "border-edge bg-panel text-muted"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`text-[10px] ${on ? "text-magenta/70" : "text-faint"}`}
              >
                {String(t.count).padStart(2, "0")}
              </span>
            </button>
          );
        })}
      </div>

      {/* grid */}
      <section className="relative z-[1] mx-auto max-w-[1220px] px-7 pb-[110px] pt-11">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(252px,1fr))] gap-[18px]">
          {list.map((c) => (
            <CreatorCard
              key={c.name}
              c={c}
              fileNo={String(creators.indexOf(c) + 1).padStart(3, "0")}
            />
          ))}
        </div>
      </section>
    </>
  );
}
