"use client";

import { useMemo, useState } from "react";
import { asAccent, asAssetUrl, asHttpUrl, slugify } from "@/lib/tools-hub/catalog";
import type { ToolDepartment, ToolEntry, ToolsHubCatalog } from "@/lib/tools-hub/types";
import { Field, Mono, Panel, SelectInput } from "@/components/portal/widgets/ui";
import ToolLogo from "./ToolLogo";

/**
 * The admin panel behind "Edit tools": the departments, and every tool in them.
 *
 * A full-page swap rather than the prototype's slide-over drawer, matching
 * sales/OptionsEditor — a drawer that has to hold a nine-field form ends up
 * being a page with a scrim in front of it, and this one also needs the
 * department list visible while tools are reassigned between them.
 *
 * Everything edits locally and saves as a unit. Department order and a tool's
 * department are both properties of the whole catalog rather than of a row, so
 * per-row saves would race each other; the PUT route takes the catalog whole
 * for the same reason.
 *
 * Ids are the one thing the editor won't let you change. A department's id is
 * what every tool inside it is written in, so renaming edits the label only. A
 * tool's id is generated from its name when it's first saved and then left
 * alone — it keys the logo file, and churning it on every rename would quietly
 * break `/logos/<id>.svg` for whoever put the file there.
 */

/**
 * A tool plus a key that's stable across renders.
 *
 * A brand-new row has no id yet — it gets one from its name on save — so it
 * can't be keyed by id, and keying by array index makes React reuse the wrong
 * input's DOM node when a row above it is deleted.
 */
type DraftTool = ToolEntry & { uid: string };

const inputCls =
  "w-full rounded-[8px] border border-edge-mid bg-panel-2 px-2.5 py-1.5 font-body text-[13px] text-fog outline-none transition-[border-color] duration-150 focus:border-magenta";

const iconBtnCls =
  "flex h-[26px] w-[26px] flex-none cursor-pointer items-center justify-center rounded-[6px] border border-edge-mid text-[12px] text-dusk transition-colors duration-150 hover:border-edge-bright hover:text-fog disabled:cursor-default disabled:opacity-30";

const miniBtnCls =
  "flex-none cursor-pointer rounded-[8px] border border-edge-mid px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.8px] text-dusk transition-colors duration-150 hover:border-edge-bright hover:text-fog disabled:cursor-default disabled:opacity-30";

/**
 * Draft row → the shape that goes over the wire.
 *
 * Written out field by field rather than spread-minus-`uid`, so the editor's
 * own scaffolding can't leak into the catalog. It also trims on the way out and
 * drops the optional fields when they're blank — otherwise clearing a SOP link
 * would store `docsUrl: ""` and leave the server to notice.
 */
function toEntry(draft: DraftTool): ToolEntry {
  const entry: ToolEntry = {
    id: draft.id,
    name: draft.name.trim(),
    vendor: draft.vendor.trim(),
    department: draft.department,
    description: draft.description.trim(),
    appUrl: draft.appUrl.trim(),
  };
  if (draft.docsUrl?.trim()) entry.docsUrl = draft.docsUrl.trim();
  if (draft.logoUrl?.trim()) entry.logoUrl = draft.logoUrl.trim();
  if (draft.accent?.trim()) entry.accent = draft.accent.trim().toLowerCase();
  return entry;
}

/** Everything wrong with one row, so the row can show it and Save can block. */
function problemsWith(tool: DraftTool): string[] {
  const out: string[] = [];
  if (!tool.name.trim()) out.push("needs a display name");
  if (!tool.vendor.trim()) out.push("needs a vendor");
  if (!tool.appUrl.trim()) out.push("needs an app URL");
  else if (!asHttpUrl(tool.appUrl)) out.push("app URL must start with http:// or https://");
  if (tool.docsUrl?.trim() && !asHttpUrl(tool.docsUrl)) out.push("SOP URL isn’t a valid link");
  if (tool.logoUrl?.trim() && !asAssetUrl(tool.logoUrl))
    out.push("logo URL must be a link or a /path");
  if (tool.accent?.trim() && !asAccent(tool.accent)) out.push("accent must be a #rrggbb hex");
  return out;
}

export default function CatalogEditor({
  catalog,
  onSave,
  onClose,
}: {
  catalog: ToolsHubCatalog;
  /** Resolves to an error message, or null once the save has landed. */
  onSave: (next: ToolsHubCatalog) => Promise<string | null>;
  onClose: () => void;
}) {
  const [departments, setDepartments] = useState<ToolDepartment[]>(() =>
    catalog.departments.map((d) => ({ ...d })),
  );
  const [tools, setTools] = useState<DraftTool[]>(() =>
    catalog.tools.map((t) => ({ ...t, uid: t.id })),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [newDept, setNewDept] = useState("");
  const [nextUid, setNextUid] = useState(1);

  const touch = () => {
    setDirty(true);
    setError("");
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tools) map.set(t.department, (map.get(t.department) ?? 0) + 1);
    return map;
  }, [tools]);

  const broken = useMemo(
    () => tools.filter((t) => problemsWith(t).length > 0),
    [tools],
  );

  /* ── departments ── */

  const addDepartment = () => {
    const label = newDept.trim();
    const id = slugify(label);
    if (!id || departments.some((d) => d.id === id)) {
      setNewDept("");
      return;
    }
    setDepartments((list) => [...list, { id, label }]);
    setNewDept("");
    touch();
  };

  const renameDepartment = (id: string, label: string) => {
    setDepartments((list) => list.map((d) => (d.id === id ? { ...d, label } : d)));
    touch();
  };

  const moveDepartment = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= departments.length) return;
    setDepartments((list) => {
      const next = [...list];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    touch();
  };

  const deleteDepartment = (id: string) => {
    setDepartments((list) => list.filter((d) => d.id !== id));
    touch();
  };

  /* ── tools ── */

  const addTool = () => {
    const uid = `new-${nextUid}`;
    setNextUid((n) => n + 1);
    setTools((list) => [
      ...list,
      {
        uid,
        id: "",
        name: "",
        vendor: "",
        department: departments[0]?.id ?? "",
        description: "",
        appUrl: "",
      },
    ]);
    setOpenUid(uid);
    touch();
  };

  const editTool = (uid: string, patch: Partial<ToolEntry>) => {
    setTools((list) => list.map((t) => (t.uid === uid ? { ...t, ...patch } : t)));
    touch();
  };

  const deleteTool = (uid: string) => {
    setTools((list) => list.filter((t) => t.uid !== uid));
    if (openUid === uid) setOpenUid(null);
    touch();
  };

  /* ── save ── */

  const save = async () => {
    if (broken.length) {
      setError(
        `${broken.length} ${broken.length === 1 ? "tool needs" : "tools need"} fixing before this can save.`,
      );
      setOpenUid(broken[0].uid);
      return;
    }

    // Ids for brand-new tools, derived from the name and made unique against
    // everything already in the catalog.
    const taken = new Set(tools.map((t) => t.id).filter(Boolean));
    const next: ToolsHubCatalog = {
      departments,
      tools: tools.map((draft) => {
        const entry = toEntry(draft);
        if (entry.id) return entry;
        const base = slugify(entry.name) || slugify(entry.vendor) || "tool";
        let id = base;
        for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
        taken.add(id);
        return { ...entry, id };
      }),
    };

    setSaving(true);
    const message = await onSave(next);
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setDirty(false);
    onClose();
  };

  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted">
          The catalog everyone on the team sees. Departments are the groups on
          the hub — reorder them here and the page follows; a department has to
          be empty before it can be deleted. Every field except the URLs is
          display text, so renaming is safe. Drop an SVG in{" "}
          <span className="font-mono text-[12px] text-mist">public/logos/</span>{" "}
          and point Logo URL at it to replace a monogram tile.
        </p>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[10px] border border-edge-mid px-4 py-2 font-mono text-[11px] uppercase tracking-[0.8px] text-dusk transition-colors duration-150 hover:text-fog"
          >
            {dirty ? "Discard" : "Close"}
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="cursor-pointer rounded-[10px] bg-magenta px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.8px] text-white transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-[10px] border border-danger/40 bg-danger/10 px-4 py-2.5 text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}

      <Panel
        title="Departments"
        action={<Mono className="text-faint">{departments.length}</Mono>}
      >
        <div className="space-y-1.5">
          {departments.map((d, i) => {
            const count = counts.get(d.id) ?? 0;
            return (
              <div key={d.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => moveDepartment(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${d.label} up`}
                  className={iconBtnCls}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveDepartment(i, 1)}
                  disabled={i === departments.length - 1}
                  aria-label={`Move ${d.label} down`}
                  className={iconBtnCls}
                >
                  ↓
                </button>
                <input
                  value={d.label}
                  onChange={(e) => renameDepartment(d.id, e.target.value)}
                  aria-label={`Name for ${d.id}`}
                  className={inputCls}
                />
                <span className="w-[74px] flex-none text-right font-mono text-[10.5px] uppercase tracking-[0.8px] text-faint">
                  {count} {count === 1 ? "tool" : "tools"}
                </span>
                <button
                  type="button"
                  onClick={() => deleteDepartment(d.id)}
                  disabled={count > 0 || departments.length === 1}
                  title={
                    count > 0
                      ? "Move its tools somewhere else first"
                      : departments.length === 1
                        ? "There has to be at least one department"
                        : "Delete this department"
                  }
                  className={`${iconBtnCls} ${count > 0 ? "" : "hover:border-danger/50 hover:text-danger"}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-1.5 border-t border-edge pt-3">
          <input
            value={newDept}
            placeholder="Add a department…"
            aria-label="New department name"
            onChange={(e) => setNewDept(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDepartment();
              }
            }}
            className={inputCls}
          />
          <button
            type="button"
            onClick={addDepartment}
            disabled={!newDept.trim()}
            className="flex-none cursor-pointer rounded-[8px] border border-magenta/50 px-3 py-1.5 font-mono text-[11px] uppercase text-magenta disabled:opacity-30"
          >
            Add
          </button>
        </div>
      </Panel>

      <Panel
        title="Tools"
        action={
          <button
            type="button"
            onClick={addTool}
            disabled={departments.length === 0}
            className="cursor-pointer rounded-[8px] border border-magenta/50 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.8px] text-magenta disabled:opacity-30"
          >
            + Add tool
          </button>
        }
      >
        <div className="space-y-4">
          {departments.map((d) => {
            const rows = tools.filter((t) => t.department === d.id);
            return (
              <div key={d.id}>
                <Mono className="mb-2 block text-faint">{d.label}</Mono>
                <div className="space-y-1.5">
                  {rows.map((tool) => (
                    <ToolRow
                      key={tool.uid}
                      tool={tool}
                      departments={departments}
                      open={openUid === tool.uid}
                      onOpen={() => setOpenUid(openUid === tool.uid ? null : tool.uid)}
                      onEdit={(patch) => editTool(tool.uid, patch)}
                      onDelete={() => deleteTool(tool.uid)}
                    />
                  ))}
                  {rows.length === 0 ? (
                    <p className="px-2 py-2 text-[12px] text-dusk">Nothing here yet.</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ─────────────────────────── one tool ─────────────────────────── */

function ToolRow({
  tool,
  departments,
  open,
  onOpen,
  onEdit,
  onDelete,
}: {
  tool: DraftTool;
  departments: ToolDepartment[];
  open: boolean;
  onOpen: () => void;
  onEdit: (patch: Partial<ToolEntry>) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const problems = problemsWith(tool);
  const accentHex = asAccent(tool.accent);

  /** Push a picked file to the logo route and drop its URL into logoUrl. */
  const uploadLogo = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/portal/tools-hub/logo", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
      };
      if (!res.ok || !data.url) throw new Error(data.message ?? "Upload failed");
      onEdit({ logoUrl: data.url });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`rounded-[10px] border bg-white/[0.015] ${
        problems.length ? "border-danger/40" : "border-edge"
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <ToolLogo tool={tool} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-body text-[13.5px] text-fog">
            {tool.name || <span className="text-dusk">Untitled tool</span>}
          </div>
          <Mono className="block truncate text-faint">
            {tool.vendor || "no vendor"}
          </Mono>
        </div>
        {problems.length ? (
          <Mono className="flex-none text-danger">{problems.length} to fix</Mono>
        ) : null}
        <button type="button" onClick={onOpen} aria-expanded={open} className={miniBtnCls}>
          {open ? "Done" : "Edit"}
        </button>
      </div>

      {open ? (
        <div className="border-t border-edge px-3 py-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Display name">
              <input
                value={tool.name}
                onChange={(e) => onEdit({ name: e.target.value })}
                placeholder="Gusto Payroll"
                className={inputCls}
              />
            </Field>
            <Field label="Vendor" hint="Sets the monogram on the tile">
              <input
                value={tool.vendor}
                onChange={(e) => onEdit({ vendor: e.target.value })}
                placeholder="Gusto"
                className={inputCls}
              />
            </Field>

            <Field label="Department">
              <SelectInput
                value={tool.department}
                onChange={(e) => onEdit({ department: e.target.value })}
                className="py-1.5 text-[13px]"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Accent" hint="Brand hex — tints the tile behind the monogram">
              <div className="flex items-center gap-2">
                <input
                  value={tool.accent ?? ""}
                  onChange={(e) => onEdit({ accent: e.target.value })}
                  placeholder="#f45d48"
                  spellCheck={false}
                  className={`${inputCls} font-mono`}
                />
                <span
                  aria-hidden
                  className="h-[26px] w-[26px] flex-none rounded-[6px] border border-edge-mid"
                  style={accentHex ? { backgroundColor: accentHex } : undefined}
                />
              </div>
            </Field>

            <Field label="Description" className="sm:col-span-2">
              <textarea
                value={tool.description}
                onChange={(e) => onEdit({ description: e.target.value })}
                rows={2}
                placeholder="One line on what it’s for."
                className={`${inputCls} resize-y`}
              />
            </Field>

            <Field label="App URL" className="sm:col-span-2">
              <input
                value={tool.appUrl}
                onChange={(e) => onEdit({ appUrl: e.target.value })}
                placeholder="https://app.gusto.com/login"
                spellCheck={false}
                className={`${inputCls} font-mono`}
              />
            </Field>

            <Field label="SOP / docs URL" hint="Optional">
              <input
                value={tool.docsUrl ?? ""}
                onChange={(e) => onEdit({ docsUrl: e.target.value })}
                placeholder="https://notion.so/…"
                spellCheck={false}
                className={`${inputCls} font-mono`}
              />
            </Field>
            <Field
              label="Logo"
              hint="Optional — upload a PNG/JPEG/SVG, or paste a URL"
            >
              <div className="flex items-center gap-2">
                <input
                  value={tool.logoUrl ?? ""}
                  onChange={(e) => onEdit({ logoUrl: e.target.value })}
                  // The path this tool's own file would live at, so the
                  // convention is legible without reading the docs.
                  placeholder={`/logos/${tool.id || slugify(tool.name) || "tool"}.svg`}
                  spellCheck={false}
                  className={`${inputCls} font-mono`}
                />
                {/* A label wrapping a hidden file input — the portal has no
                    styled file-picker, and the native control can't match the
                    mini-button look. */}
                <label
                  className={`${miniBtnCls} relative flex-none ${
                    uploading ? "opacity-50" : "cursor-pointer"
                  }`}
                >
                  {uploading ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    disabled={uploading}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // Clear so re-picking the same file fires change again.
                      e.target.value = "";
                      if (file) void uploadLogo(file);
                    }}
                  />
                </label>
              </div>
              {uploadError ? (
                <p className="mt-1 text-[12px] text-danger">{uploadError}</p>
              ) : null}
            </Field>
          </div>

          {problems.length ? (
            <ul className="mt-3 space-y-0.5 text-[12px] text-danger">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-edge pt-3">
            {/* Not <Mono> — it uppercases, and ids are lowercase literals. */}
            <span className="font-mono text-[10.5px] tracking-[0.4px] text-faint">
              {tool.id ? `id: ${tool.id}` : "id is set when you save"}
            </span>
            {confirming ? (
              <button
                type="button"
                onClick={onDelete}
                className="cursor-pointer rounded-[8px] border border-danger/50 bg-danger/10 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.8px] text-danger"
              >
                Confirm delete
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className={`${miniBtnCls} hover:border-danger/50 hover:text-danger`}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
