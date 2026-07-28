"use client";

/**
 * The Tax Strategy tab: four tools behind one permission.
 *
 * Every tool here is client-facing: the tab gets screen-shared on a call, so
 * the copy inside speaks to the creator ("your numbers"), never about them.
 *
 * The tab opens on a launcher rather than a tool, because "tax strategy" is a
 * category, not a question — you arrive knowing which question you're
 * answering and pick the tool that answers it. Picking one replaces the whole
 * view so the tool gets the full column width, with a back link to the
 * launcher; only the selected tool is mounted, so the Deal Desk's 360-row
 * amortisation table isn't built for someone who wanted the S-corp number.
 *
 * Splitting one out into its own sidebar tab later is two edits: a key in
 * lib/permissions and an entry in nav-items.
 */

import { useState } from "react";
import { Eyebrow } from "@/components/estimator/fields";
import { NavIcon } from "@/components/portal/nav-items";
import SavingsWizard from "@/components/portal/widgets/SavingsWizard";
import ShelterEngine from "@/components/portal/widgets/ShelterEngine";
import ScorpAnalyzer from "@/components/portal/widgets/ScorpAnalyzer";
import DealDesk from "@/components/portal/widgets/DealDesk";

/** `icon` is an SVG path `d` on a 24×24 stroke grid, as in nav-items. */
const TOOLS = [
  {
    id: "wizard",
    name: "Savings Snapshot",
    blurb:
      "Four steps: today's tax bill, the strategies we'd put in place, the three-year payoff, then those savings compounded to retirement.",
    tag: "Savings",
    icon: "M3 17l6-6 4 4 8-8M21 7h-5m5 0v5",
    Component: SavingsWizard,
  },
  {
    id: "shelter",
    name: "Shelter Engine",
    blurb:
      "How much you can legally shelter this year — Solo 401(k), SEP, Traditional and Roth IRA and HSA room by entity type, with the tax each one saves.",
    tag: "Retirement",
    icon: "M12 22v-9M2 13a10 10 0 0120 0z",
    Component: ShelterEngine,
  },
  {
    id: "scorp",
    name: "S-Corp Analyzer",
    blurb:
      "What an S-corp election is worth in self-employment tax — and how defensible the salary behind that number is.",
    tag: "Entity",
    icon: "M3 21h18M5 21V8l7-5 7 5v13M10 21v-5h4v5",
    Component: ScorpAnalyzer,
  },
  {
    id: "deal",
    name: "Deal Desk",
    blurb:
      "Property underwriting: what you qualify for, whether the deal works, and what the loan actually costs over its life.",
    tag: "Property",
    icon: "M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5M10 21v-6h4v6",
    Component: DealDesk,
  },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];

export default function TaxStrategyWorkbench() {
  const [active, setActive] = useState<ToolId | null>(null);
  const tool = TOOLS.find((t) => t.id === active);

  if (tool) {
    const Active = tool.Component;
    return (
      <>
        {/* The tools carry no titles of their own — this is the only header,
            so a tool never shows two. */}
        <button
          type="button"
          onClick={() => setActive(null)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-edge-bright px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted transition-colors duration-150 hover:border-magenta hover:text-fog"
        >
          <span aria-hidden>←</span> Tax Strategy
        </button>

        <div className="mt-4 flex items-center gap-3">
          <h1 className="font-display text-3xl font-semibold text-fog">
            {tool.name}
          </h1>
          <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-dusk">
            {tool.tag}
          </span>
        </div>

        <p className="mt-2 max-w-2xl text-sm text-muted">{tool.blurb}</p>

        <div className="mt-9">
          <Active />
        </div>
      </>
    );
  }

  return (
    <>
      <Eyebrow>Tool</Eyebrow>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-fog">
          Tax Strategy
        </h1>
        <span className="rounded-full border border-teal/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-teal">
          Live
        </span>
      </div>

      <p className="mt-2 max-w-xl text-sm text-muted">
        Four tools for modelling strategies against your numbers, live on the
        call. Nothing here is saved — the figures are for the conversation, not
        your return.
      </p>

      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className="group cursor-pointer rounded-[20px] border border-white/10 bg-white/[0.03] p-6 text-left transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.05]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <NavIcon
                  d={t.icon}
                  className="text-muted transition-colors duration-150 group-hover:text-magenta"
                />
                <h2 className="font-display text-lg font-semibold text-fog">
                  {t.name}
                </h2>
              </div>
              <span className="flex-none rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-dusk">
                {t.tag}
              </span>
            </div>

            <p className="mt-2.5 text-sm leading-relaxed text-mist">{t.blurb}</p>

            <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[1.2px] text-faint transition-colors duration-150 group-hover:text-magenta">
              Open
              <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">
                →
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
