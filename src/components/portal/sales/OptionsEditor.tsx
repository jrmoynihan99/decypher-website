"use client";

/**
 * The editor behind the ⚙ Options button: every dropdown's entries, and the
 * referral-partner roster.
 *
 * Dropdown lists edit locally and save as a unit — reorder is a property of
 * the whole list, so per-row saves would race themselves. Referrers save
 * per-row immediately: they're independent documents, and a rename triggers a
 * server-side propagation (every call row's denormalised name) that shouldn't
 * wait on an explicit save button.
 *
 * The per-list control is the shared OptionListEditor, which also drives the
 * Applications tracker. What it deliberately does NOT offer, matching the
 * server's contract in lib/sales/config.ts: renaming a KEY (labels only — keys
 * are what rows are written in), deleting a default key (retire hides it from
 * new picks instead), or adding/retiring on the closed lists (status keys carry
 * money semantics — DEAL_STATUS_META.counts decides what a commission pays).
 */

import { useState } from "react";
import { OptionListEditor } from "@/components/portal/OptionListEditor";
import {
  OPEN_LISTS,
  type CreatorOption,
  type EditableList,
  type OptionItem,
  type ReferrerRow,
  type SalesOptionsConfig,
} from "@/lib/sales/types";
import { Mono, Panel, SearchSelect, Switch } from "@/components/portal/widgets/ui";

const LIST_TITLES: Record<EditableList, string> = {
  leadSource: "Lead source",
  service: "Service sold",
  paymentPlan: "Payment plan",
  objection: "Objection reason",
  dealStatus: "Deal status",
  showStatus: "Attendance",
  referralKind: "Referral type",
};

const LIST_ORDER: EditableList[] = [
  "leadSource",
  "service",
  "paymentPlan",
  "objection",
  "dealStatus",
  "showStatus",
  "referralKind",
];

const inputCls =
  "w-full rounded-[8px] border border-edge-mid bg-panel-2 px-2.5 py-1.5 font-body text-[13px] text-fog outline-none transition-[border-color] duration-150 focus:border-magenta disabled:opacity-50";

const iconBtnCls =
  "flex h-[26px] w-[26px] flex-none cursor-pointer items-center justify-center rounded-[6px] border border-edge-mid text-[12px] text-dusk transition-colors duration-150 hover:border-edge-bright hover:text-fog disabled:cursor-default disabled:opacity-30";

export default function OptionsEditor({
  config,
  onSaveConfig,
  referrers,
  onPatchReferrer,
  onDeleteReferrer,
  creators,
  onClose,
}: {
  config: SalesOptionsConfig;
  /** PUTs and returns the server's sanitized copy, or null on failure. */
  onSaveConfig: (next: SalesOptionsConfig) => Promise<boolean>;
  referrers: ReferrerRow[];
  onPatchReferrer: (
    id: string,
    patch: Partial<Pick<ReferrerRow, "name" | "active" | "showOnLeaderboard" | "sanityCreatorId">>,
  ) => Promise<boolean>;
  onDeleteReferrer: (id: string) => Promise<boolean>;
  creators: CreatorOption[];
  onClose: () => void;
}) {
  // Local draft of the lists; committed on Save, discarded on Close.
  const [draft, setDraft] = useState<SalesOptionsConfig>(() =>
    JSON.parse(JSON.stringify(config)),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const edit = (list: EditableList, next: OptionItem[]) => {
    setDraft((d) => ({ ...d, [list]: next }));
    setDirty(true);
  };

  const saveAll = async () => {
    setSaving(true);
    const ok = await onSaveConfig(draft);
    setSaving(false);
    if (ok) {
      setDirty(false);
      onClose();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted">
          Rename, recolour, reorder and retire the options every dropdown
          offers. A colour follows its option everywhere — the grid cell and the
          bars on the Stats tab. Retiring hides an option from new picks; rows
          that already use it keep it. Statuses can be renamed, recoloured and
          reordered but not added or removed: the money math (what counts as
          won, what pays commission) is tied to them.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[10px] border border-edge-mid px-4 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk hover:text-fog"
          >
            {dirty ? "Discard" : "Close"}
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={saveAll}
            className="cursor-pointer rounded-[10px] bg-magenta px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.8px] text-white transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {LIST_ORDER.map((list) => (
          <OptionListEditor
            key={list}
            title={LIST_TITLES[list]}
            items={draft[list]}
            open={(OPEN_LISTS as readonly string[]).includes(list)}
            onChange={(next) => edit(list, next)}
          />
        ))}

        <ReferrerManager
          referrers={referrers}
          creators={creators}
          onPatch={onPatchReferrer}
          onDelete={onDeleteReferrer}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────── referrers ─────────────────────────── */

/**
 * The partner roster. Saves per-row (each is its own document), so there's no
 * relationship to the Save button above — the header says so.
 *
 * No reorder here on purpose: the referrer picker in the grid is a typeahead
 * sorted alphabetically, so display order isn't a property a partner has.
 */
function ReferrerManager({
  referrers,
  creators,
  onPatch,
  onDelete,
}: {
  referrers: ReferrerRow[];
  creators: CreatorOption[];
  onPatch: (
    id: string,
    patch: Partial<Pick<ReferrerRow, "name" | "active" | "showOnLeaderboard" | "sanityCreatorId">>,
  ) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const creatorOptions = [
    { value: "", label: "— no photo link —" },
    ...creators.map((c) => ({ value: c.id, label: c.name })),
  ];

  const run = async (id: string, fn: () => Promise<boolean>) => {
    setBusy(id);
    await fn();
    setBusy(null);
  };

  const commitName = (r: ReferrerRow) => {
    const draft = names[r.id];
    if (draft === undefined || draft.trim() === "" || draft.trim() === r.name) return;
    void run(r.id, () => onPatch(r.id, { name: draft.trim() }));
  };

  return (
    <Panel
      title="Referral partners"
      action={<Mono className="text-faint">saves as you edit</Mono>}
      className="lg:col-span-2"
    >
      <p className="mb-4 text-[12px] leading-relaxed text-muted">
        Renaming fixes the spelling everywhere at once — every deal row and the
        public leaderboard. The photo link points a partner at their Sanity
        creator profile; without it the leaderboard tries a name match, then
        falls back to initials. &ldquo;Public&rdquo; controls whether they
        appear on the leaderboard at all.
      </p>
      <div className="space-y-2">
        {referrers.map((r) => (
          <div
            key={r.id}
            className={`grid grid-cols-[minmax(140px,1fr)_minmax(160px,220px)_auto_auto] items-center gap-3 rounded-[10px] border border-edge bg-white/[0.015] px-3 py-2 ${
              r.active ? "" : "opacity-50"
            }`}
          >
            <input
              value={names[r.id] ?? r.name}
              disabled={busy === r.id}
              onChange={(e) => setNames((n) => ({ ...n, [r.id]: e.target.value }))}
              onBlur={() => commitName(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className={inputCls}
              aria-label={`Name for ${r.name}`}
            />

            <SearchSelect
              value={r.sanityCreatorId ?? ""}
              options={creatorOptions}
              disabled={busy === r.id}
              placeholder="Photo: search creators…"
              onChange={(v) =>
                void run(r.id, () => onPatch(r.id, { sanityCreatorId: v || null }))
              }
            />

            <label className="flex items-center gap-2">
              <Mono className="text-dusk">Public</Mono>
              <Switch
                checked={r.showOnLeaderboard}
                label={`Show ${r.name} on the leaderboard`}
                onChange={(v) => void run(r.id, () => onPatch(r.id, { showOnLeaderboard: v }))}
              />
            </label>

            {confirming === r.id ? (
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => {
                  setConfirming(null);
                  void run(r.id, () => onDelete(r.id));
                }}
                className="cursor-pointer rounded-[6px] border border-danger/50 bg-danger/10 px-2.5 py-1 font-mono text-[10.5px] uppercase text-danger"
              >
                Confirm
              </button>
            ) : (
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => setConfirming(r.id)}
                title="Remove — partners with deals attached are hidden rather than erased"
                className={iconBtnCls}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {referrers.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-dusk">
            No partners yet — add one from the Referrals tab.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
