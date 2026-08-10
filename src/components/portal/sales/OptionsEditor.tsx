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
 * What the UI deliberately does NOT offer, matching the server's contract in
 * lib/sales/config.ts: renaming a KEY (labels only — keys are what rows are
 * written in), deleting a default key (retire hides it from new picks
 * instead), or adding/retiring on the closed lists (status keys carry money
 * semantics — DEAL_STATUS_META.counts decides what a commission pays).
 */

import { useEffect, useRef, useState } from "react";
import { OPTION_COLORS, optionColorHex, optionKey } from "@/lib/sales/options";
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
          <ListEditor
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

/* ───────────────────────────── one list ───────────────────────────── */

function ListEditor({
  title,
  items,
  open,
  onChange,
}: {
  title: string;
  items: OptionItem[];
  /** Open lists may add + retire; closed ones only rename + reorder. */
  open: boolean;
  onChange: (next: OptionItem[]) => void;
}) {
  const [adding, setAdding] = useState("");

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const rename = (i: number, label: string) => {
    const next = [...items];
    next[i] = { ...next[i], label };
    onChange(next);
  };

  const toggleRetired = (i: number) => {
    const next = [...items];
    const { retired, ...rest } = next[i];
    next[i] = retired ? rest : { ...next[i], retired: true };
    onChange(next);
  };

  const recolour = (i: number, color: string | null) => {
    const next = [...items];
    const item = { ...next[i] };
    if (color) item.color = color;
    else delete item.color;
    next[i] = item;
    onChange(next);
  };

  const add = () => {
    const label = adding.trim();
    if (!label) return;
    const key = optionKey(label);
    if (!key || items.some((i) => i.key === key)) return;
    onChange([...items, { key, label }]);
    setAdding("");
  };

  return (
    <Panel title={title} action={open ? undefined : <Mono className="text-faint">fixed set</Mono>}>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Move ${item.label} up`}
              className={iconBtnCls}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              aria-label={`Move ${item.label} down`}
              className={iconBtnCls}
            >
              ↓
            </button>
            <ColorPicker
              value={item.color ?? null}
              label={item.label}
              onChange={(c) => recolour(i, c)}
            />
            <input
              value={item.label}
              onChange={(e) => rename(i, e.target.value)}
              className={`${inputCls} ${item.retired ? "line-through opacity-50" : ""}`}
              aria-label={`Label for ${item.key}`}
            />
            {open ? (
              <button
                type="button"
                onClick={() => toggleRetired(i)}
                title={item.retired ? "Bring back" : "Retire — hidden from new picks, old rows keep it"}
                className={`${iconBtnCls} ${item.retired ? "" : "hover:border-danger/50 hover:text-danger"}`}
              >
                {item.retired ? "↺" : "✕"}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {open ? (
        <div className="mt-3 flex items-center gap-1.5 border-t border-edge pt-3">
          <input
            value={adding}
            placeholder="Add an option…"
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            className={inputCls}
          />
          <button
            type="button"
            onClick={add}
            disabled={!adding.trim()}
            className="flex-none cursor-pointer rounded-[8px] border border-magenta/50 px-3 py-1.5 font-mono text-[11px] uppercase text-magenta disabled:opacity-30"
          >
            Add
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

/* ─────────────────────────── colour ─────────────────────────── */

/**
 * Pick an option's colour from the fixed palette.
 *
 * A swatch grid rather than an `<input type="color">` on purpose. These colours
 * don't only tint a cell — they become the bars on the Stats tab, where two
 * adjacent categories separated by nothing but hue is the exact situation a
 * free colour field produces and a colourblind reader can't resolve. The ten
 * swatches were checked against the panel surface and against each other; the
 * picker's job is to make choosing one of them easy, not to allow more.
 */
function ColorPicker({
  value,
  label,
  onChange,
}: {
  value: string | null;
  label: string;
  onChange: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hex = optionColorHex(value);

  // Click-away and Escape, so an open palette can't be left behind while the
  // list scrolls under it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Colour for ${label}`}
        aria-expanded={open}
        title={hex ? "Change colour" : "No colour — click to pick one"}
        className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[6px] border border-edge-mid transition-colors duration-150 hover:border-edge-bright"
      >
        <span
          aria-hidden
          className="h-[13px] w-[13px] rounded-full border"
          style={
            hex
              ? { background: hex, borderColor: hex }
              : {
                  borderColor: "rgba(255,255,255,0.22)",
                  // A diagonal hairline: the universal "nothing set", and it
                  // can't be mistaken for a very dark swatch.
                  backgroundImage:
                    "linear-gradient(135deg, transparent 45%, rgba(255,255,255,0.3) 45%, rgba(255,255,255,0.3) 55%, transparent 55%)",
                }
          }
        />
      </button>

      {open ? (
        <div className="absolute left-0 top-[30px] z-30 w-[168px] rounded-[10px] border border-edge-mid bg-panel p-2 shadow-2xl">
          <div className="grid grid-cols-5 gap-1.5">
            {OPTION_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={value === c.key}
                onClick={() => {
                  onChange(c.key);
                  setOpen(false);
                }}
                className={`h-[24px] w-[24px] cursor-pointer rounded-[6px] border-2 transition-transform duration-150 hover:scale-110 ${
                  value === c.key ? "border-fog" : "border-transparent"
                }`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-2 w-full cursor-pointer rounded-[6px] border border-edge-mid py-1 font-mono text-[10px] uppercase tracking-[0.8px] text-dusk hover:text-fog"
          >
            No colour
          </button>
        </div>
      ) : null}
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
