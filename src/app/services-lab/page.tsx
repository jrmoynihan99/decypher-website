"use client";

import { useState } from "react";
import CipherRain from "@/components/effects/CipherRain";
import ServicesCinema from "@/components/home/services-variants/ServicesCinema";
import ServicesCircuit from "@/components/home/services-variants/ServicesCircuit";
import ServicesLedger from "@/components/home/services-variants/ServicesLedger";
import ServicesLens from "@/components/home/services-variants/ServicesLens";
import ServicesOrbit from "@/components/home/services-variants/ServicesOrbit";
import ServicesScanner from "@/components/home/services-variants/ServicesScanner";
import ServicesTerminal from "@/components/home/services-variants/ServicesTerminal";
import ServicesTuner from "@/components/home/services-variants/ServicesTuner";

/**
 * Preview lab for the experimental ServicesSection replacements. Each is a
 * self-contained drop-in: pick a favorite, then swap the import in
 * src/app/page.tsx. Variants mount one at a time (they're animation-heavy).
 *
 * SET A gates the info behind play — fun, but work to read.
 * SET B is zero-effort: scrolling (or nothing at all) reveals everything.
 */

interface Variant {
  key: string;
  num: string;
  name: string;
  desc: string;
  Comp: () => React.JSX.Element;
}

const SET_A: Variant[] = [
  {
    key: "terminal",
    num: "01",
    name: "VAULT SHELL",
    desc: "A live terminal. Type commands (`decrypt 01`, `ls`, `help`) or click the encrypted files — idle too long and a ghost operator cracks them for you.",
    Comp: ServicesTerminal,
  },
  {
    key: "lens",
    num: "02",
    name: "DECRYPT LENS",
    desc: "Everything ships encrypted. Your cursor carries the lens — sweep it to preview plaintext, click a file to crack it open permanently.",
    Comp: ServicesLens,
  },
  {
    key: "tuner",
    num: "03",
    name: "SIGNAL TUNER",
    desc: "Drag the spring-loaded needle across the band. Each service is a station: pure static off-frequency, crystal-clear when the signal locks.",
    Comp: ServicesTuner,
  },
  {
    key: "orbit",
    num: "04",
    name: "ORBITAL VAULT",
    desc: "A 3D ring you can grab and throw. Momentum, detent snapping, tap-to-front — only the card facing you decrypts.",
    Comp: ServicesOrbit,
  },
];

const SET_B: Variant[] = [
  {
    key: "cinema",
    num: "05",
    name: "THE SEQUENCE",
    desc: "A cinematic scroll-scrub: each service glides across a full-screen stage with parallax type and auto-decrypting headlines. The scrollbar is the timeline.",
    Comp: ServicesCinema,
  },
  {
    key: "circuit",
    num: "06",
    name: "THE PIPELINE",
    desc: "The Sequence's editorial type on a circuit spine: rows power on as they enter view, connectors surge outward, and a glow blooms behind each service. Everything readable, always.",
    Comp: ServicesCircuit,
  },
  {
    key: "scanner",
    num: "07",
    name: "SCAN GATE",
    desc: "Vertical scroll drives a horizontal belt through a fixed decryption beam — every card lights up and decrypts as it crosses. Copy stays readable throughout.",
    Comp: ServicesScanner,
  },
  {
    key: "ledger",
    num: "08",
    name: "MISSION CONTROL",
    desc: "Everything visible instantly: a bento dashboard with orbiting border beams, a counting savings stat, self-rotating proof lines, and a deliverables ticker.",
    Comp: ServicesLedger,
  },
];

const GROUPS = [
  { label: "SET A — HANDS-ON TOYS", items: SET_A },
  { label: "SET B — ZERO-EFFORT · SCROLL-DRIVEN", items: SET_B },
];

const ALL = [...SET_A, ...SET_B];

export default function ServicesLabPage() {
  // default to the first zero-effort variant — the current direction
  const [key, setKey] = useState("cinema");
  const v = ALL.find((x) => x.key === key) ?? ALL[0];
  const Active = v.Comp;

  return (
    <main className="relative min-h-screen">
      <CipherRain />
      <div className="relative z-[1] px-6 pt-[120px]">
        <div className="mx-auto max-w-[1180px]">
          <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            [ services // variant lab ]
          </p>
          <h1 className="mt-3 font-display text-[clamp(28px,3.4vw,44px)] font-bold tracking-[-0.02em] text-fog">
            Eight ways to decrypt the services.
          </h1>
          <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-mist">
            Drop-in replacements for{" "}
            <span className="font-mono text-[13.5px] text-magenta">
              ServicesSection
            </span>
            . Set A is interactive show-and-tell; Set B reveals everything
            through normal scrolling — no puzzles. Pick one, then swap the
            import in{" "}
            <span className="font-mono text-[13.5px] text-magenta">
              src/app/page.tsx
            </span>
            .
          </p>

          {GROUPS.map((g) => (
            <div key={g.label} className="mt-6">
              <p className="m-0 mb-2.5 font-mono text-[10.5px] tracking-[0.24em] text-faint">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-2.5">
                {g.items.map((variant) => (
                  <button
                    key={variant.key}
                    type="button"
                    onClick={() => setKey(variant.key)}
                    className={`rounded-full border px-5 py-2 font-mono text-[12px] tracking-[0.12em] transition-colors ${
                      variant.key === key
                        ? "border-magenta bg-panel text-fog shadow-[0_0_24px_rgba(255,45,120,.2)]"
                        : "border-edge-bright text-mist hover:border-magenta/60 hover:text-fog"
                    }`}
                  >
                    <span className="text-magenta">{variant.num}</span>{" "}
                    {variant.name}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <p className="mt-5 max-w-[84ch] font-mono text-[11.5px] leading-relaxed tracking-[0.06em] text-faint">
            {"// "}
            {v.desc}
          </p>
        </div>
      </div>

      {/* remount on switch so each variant boots fresh */}
      <Active key={v.key} />
    </main>
  );
}
