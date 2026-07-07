"use client";

import { useState } from "react";
import CipherRain from "@/components/effects/CipherRain";
import ServicesAtlas from "@/components/home/services-variants/ServicesAtlas";
import ServicesAtlasFramed from "@/components/home/services-variants/ServicesAtlasFramed";
import ServicesCinema from "@/components/home/services-variants/ServicesCinema";
import ServicesCircuit from "@/components/home/services-variants/ServicesCircuit";
import ServicesDeepField from "@/components/home/services-variants/ServicesDeepField";
import ServicesFlyover from "@/components/home/services-variants/ServicesFlyover";
import ServicesLedger from "@/components/home/services-variants/ServicesLedger";
import ServicesLens from "@/components/home/services-variants/ServicesLens";
import ServicesOrbit from "@/components/home/services-variants/ServicesOrbit";
import ServicesScanner from "@/components/home/services-variants/ServicesScanner";
import ServicesTerminal from "@/components/home/services-variants/ServicesTerminal";
import ServicesTuner from "@/components/home/services-variants/ServicesTuner";
import { LAB_SERVICES, LAB_SERVICES_HEADING } from "@/lib/lab-fixtures";

/** The CMS-driven finalists, frozen to lab fixtures for comparison. */
const LabServicesAtlas = () => (
  <ServicesAtlas content={LAB_SERVICES_HEADING} services={LAB_SERVICES} />
);
const LabServicesFlyover = () => (
  <ServicesFlyover content={LAB_SERVICES_HEADING} services={LAB_SERVICES} />
);

/**
 * Preview lab for the experimental ServicesSection replacements. Each is a
 * self-contained drop-in: pick a favorite, then swap the import in
 * src/app/page.tsx. Variants mount one at a time (they're animation-heavy).
 *
 * SET A gates the info behind play — fun, but work to read.
 * SET B is zero-effort: scrolling (or nothing at all) reveals everything.
 * SET C scatters all FIVE services across a neural web seen from a birds-eye
 *       view, and the camera flies down into whichever one you engage.
 */

interface Variant {
  key: string;
  num: string;
  name: string;
  desc: string;
  Comp: React.ComponentType;
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

const SET_C: Variant[] = [
  {
    key: "atlas",
    num: "09",
    name: "NEURAL ATLAS",
    desc: "All five services scattered across a fully lit neural map. Hovering a node illuminates it, spins its cluster up, and flashes CLICK TO OPEN; clicking dives the camera in — the hub blooms into a tumbling 3D neuron with the copy growing out of it as open editorial type. A CLICK TO CLOSE chip rides the cursor while zoomed; click anywhere off a node (or Esc) to climb back out.",
    Comp: LabServicesAtlas,
  },
  {
    key: "flyover",
    num: "10",
    name: "THE FLYOVER",
    desc: "The zero-effort cut of the map: scroll is the flight stick. The camera dives into node 01 — a 3D neuron blooms under Sequence-style type — then climbs out, glides across the web, and dives into the next, ending back in orbit with every hub lit. The scrollbar is the flight path.",
    Comp: LabServicesFlyover,
  },
  {
    key: "deepfield",
    num: "11",
    name: "DEEP FIELD",
    desc: "The dossiers physically live in the web — headlines readable from orbit, fine print too far away. Hover one and the camera closes the distance until it fills your screen. The info was always on the map; you just fly closer.",
    Comp: ServicesDeepField,
  },
  {
    key: "atlasframed",
    num: "12",
    name: "ATLAS · FRAMED",
    desc: "The Neural Atlas in its original frame: same lit map, camera dives, 3D neurons, and node-anchored type — contained in a rounded map panel in page flow instead of taking the whole viewport.",
    Comp: ServicesAtlasFramed,
  },
];

const GROUPS = [
  { label: "SET A — HANDS-ON TOYS", items: SET_A },
  { label: "SET B — ZERO-EFFORT · SCROLL-DRIVEN", items: SET_B },
  { label: "SET C — NEURAL WEB · CAMERA FLIGHTS", items: SET_C },
];

const ALL = [...SET_A, ...SET_B, ...SET_C];

export default function ServicesLabPage() {
  // default to the newest direction — the neural-web camera flights
  const [key, setKey] = useState("atlas");
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
            Twelve ways to decrypt the services.
          </h1>
          <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-mist">
            Drop-in replacements for{" "}
            <span className="font-mono text-[13.5px] text-magenta">
              ServicesSection
            </span>
            . Set A is interactive show-and-tell; Set B reveals everything
            through normal scrolling — no puzzles. Set C lays all five
            services on a neural map and flies the camera into whichever one
            you engage. Pick one, then swap the import in{" "}
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
