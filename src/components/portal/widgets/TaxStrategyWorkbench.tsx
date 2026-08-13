"use client";

/**
 * The Tax Strategy tab: five tools behind one permission.
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
import MoneyAllocator from "@/components/portal/widgets/MoneyAllocator";

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
    id: "allocator",
    name: "Money Allocator",
    blurb:
      "Where every dollar of this month's income goes — taxes and ops off the top, then a priority waterfall through owner pay, and what the investing line is worth by retirement.",
    tag: "Cash flow",
    icon: "M12 3v18M8 7h8M6 12h12M9 17h6",
    Component: MoneyAllocator,
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

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

export default function TaxStrategyWorkbench({
  customNames = {},
  isAdmin = false,
}: {
  /** Admin-set display names by tool id — a missing id means the built-in. */
  customNames?: Record<string, string>;
  isAdmin?: boolean;
}) {
  const [active, setActive] = useState<ToolId | null>(null);
  const [names, setNames] = useState<Record<string, string>>(customNames);
  /** Which tool's name is being edited — the launcher renames in place too. */
  const [editingId, setEditingId] = useState<ToolId | null>(null);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const tool = TOOLS.find((t) => t.id === active);

  const displayName = (t: (typeof TOOLS)[number]) =>
    names[t.id]?.trim() || t.name;

  const startEdit = (t: (typeof TOOLS)[number]) => {
    setDraft(displayName(t));
    setEditingId(t.id);
    setRenameError(null);
  };

  /** Persist the whole map — an id absent from it reverts to the built-in. */
  const saveName = async (t: (typeof TOOLS)[number]) => {
    const trimmed = draft.trim();
    const next = { ...names };
    if (!trimmed || trimmed === t.name) delete next[t.id];
    else next[t.id] = trimmed;

    const previous = names;
    setNames(next); // optimistic — the header re-renders immediately
    setEditingId(null);
    setRenameError(null);
    try {
      const res = await fetch("/api/portal/tax-strategy/names", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Couldn't save the name");
    } catch (e) {
      setNames(previous);
      setRenameError(e instanceof Error ? e.message : "Couldn't save the name");
    }
  };

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
          {editingId === tool.id ? (
            <>
              <input
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName(tool);
                  if (e.key === "Escape") setEditingId(null);
                }}
                maxLength={60}
                className="rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-1.5 font-display text-2xl font-semibold text-fog outline-none focus:border-magenta"
              />
              <button
                type="button"
                onClick={() => void saveName(tool)}
                className="cursor-pointer rounded-full border border-magenta/60 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[1px] text-magenta transition-colors hover:bg-magenta/10"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1px] text-dusk transition-colors hover:text-fog"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-semibold text-fog">
                {displayName(tool)}
              </h1>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => startEdit(tool)}
                  aria-label={`Rename ${displayName(tool)}`}
                  title="Rename this tool"
                  className="cursor-pointer rounded-[8px] p-1.5 text-dusk transition-colors hover:bg-white/[0.05] hover:text-fog"
                >
                  <PencilIcon />
                </button>
              ) : null}
            </>
          )}
          <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-dusk">
            {tool.tag}
          </span>
        </div>

        {renameError ? (
          <p className="mt-2 text-[12.5px] text-danger">{renameError}</p>
        ) : null}

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
        Five tools for modelling strategies against your numbers, live on the
        call. Nothing here is saved — the figures are for the conversation, not
        your return.
      </p>

      {renameError ? (
        <p className="mt-3 text-[12.5px] text-danger">{renameError}</p>
      ) : null}

      {/* Each card is a div, not a button: the rename control is itself a
          button and buttons can't nest. The whole-card click target is an
          absolutely-positioned overlay instead — dropped while that card is
          being renamed so typing doesn't open the tool. Card content is
          pointer-events-none so clicks fall through to it; the controls that
          need clicks opt back in and sit above the overlay. */}
      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => {
          const isEditing = editingId === t.id;
          return (
            <div
              key={t.id}
              className="group relative rounded-[20px] border border-white/10 bg-white/[0.03] p-6 text-left transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.05]"
            >
              {isEditing ? null : (
                <button
                  type="button"
                  onClick={() => setActive(t.id)}
                  aria-label={`Open ${displayName(t)}`}
                  className="absolute inset-0 cursor-pointer rounded-[20px]"
                />
              )}

              <div className="pointer-events-none relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <NavIcon
                    d={t.icon}
                    className="flex-none text-muted transition-colors duration-150 group-hover:text-magenta"
                  />
                  {isEditing ? (
                    <input
                      value={draft}
                      autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveName(t);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      maxLength={60}
                      aria-label={`Name for ${t.name}`}
                      className="pointer-events-auto z-10 w-full min-w-0 rounded-[10px] border border-edge-mid bg-panel-2 px-2.5 py-1 font-display text-lg font-semibold text-fog outline-none focus:border-magenta"
                    />
                  ) : (
                    <h2 className="truncate font-display text-lg font-semibold text-fog">
                      {displayName(t)}
                    </h2>
                  )}
                </div>

                {isEditing || !isAdmin ? null : (
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    aria-label={`Rename ${displayName(t)}`}
                    title="Rename this tool"
                    className="pointer-events-auto z-10 flex-none cursor-pointer rounded-[8px] p-1.5 text-faint transition-colors hover:bg-white/[0.05] hover:text-fog"
                  >
                    <PencilIcon />
                  </button>
                )}

                <span className="flex-none rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-dusk">
                  {t.tag}
                </span>
              </div>

              <p className="pointer-events-none relative mt-2.5 text-sm leading-relaxed text-mist">
                {t.blurb}
              </p>

              {isEditing ? (
                <div className="relative mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void saveName(t)}
                    className="z-10 cursor-pointer rounded-full border border-magenta/60 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[1px] text-magenta transition-colors hover:bg-magenta/10"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="z-10 cursor-pointer font-mono text-[10.5px] uppercase tracking-[1px] text-dusk transition-colors hover:text-fog"
                  >
                    Cancel
                  </button>
                  <span className="font-mono text-[10px] uppercase tracking-[1px] text-faint">
                    Empty resets to “{t.name}”
                  </span>
                </div>
              ) : (
                <span className="pointer-events-none relative mt-4 inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[1.2px] text-faint transition-colors duration-150 group-hover:text-magenta">
                  Open
                  <span
                    aria-hidden
                    className="transition-transform duration-150 group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
