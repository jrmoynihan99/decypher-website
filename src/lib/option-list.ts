/**
 * Editable dropdown lists — the primitives, shared by every portal tool that
 * lets an operator edit its own vocabulary.
 *
 * Lifted out of lib/sales/options.ts + lib/sales/config.ts when the
 * Applications pipeline needed the same three things the sales grid needed: a
 * validated colour palette, a key/label/retired item shape, and a sanitizer
 * that merges an untrusted submission against its defaults. Sales still owns
 * its own vocabulary; only the mechanics live here.
 *
 * Isomorphic on purpose — the editors render these in the browser and the PUT
 * routes validate against them on the server, so nothing here may import
 * Firebase or anything server-only.
 */

/**
 * One entry in an editable dropdown.
 *
 * `key` is permanent — it's what a year of rows is written in, so the editor
 * can never change it. `label` and position are the editable parts; `retired`
 * hides an option from new picks while old rows keep rendering it. Deleting a
 * key outright would strand every row that holds it, which is why there is no
 * delete, only retire.
 */
export interface OptionItem {
  key: string;
  label: string;
  retired?: boolean;
  /**
   * A key from OPTION_COLORS — never a raw hex.
   *
   * The swatches were checked against the portal's panel surface; a free colour
   * field would let an editor pick two neighbouring hues that are one bar apart
   * in the stats charts and indistinguishable to a colourblind reader. Storing
   * the swatch key also means the palette can be retuned without migrating
   * every config document.
   */
  color?: string;
}

/**
 * The colours an option may wear — a fixed set, not a colour picker.
 *
 * These do double duty: a tinted control in a grid (where the label is always
 * printed beside the colour) and a bar in the stats charts (where, on a ranked
 * list, colour is the only thing separating two neighbouring rows). The second
 * job is what rules out a free hex field. Every swatch here clears 3:1 against
 * the portal's panel surface (#141319) and no two sit close enough to collapse
 * into each other under deuteranopia — which the brand's own five accents do
 * not manage (ember vs danger measure ΔE 7.5 to *normal* vision).
 *
 * Ten is the ceiling on purpose. Past that, a categorical palette stops being
 * discriminable no matter how it's chosen, and the honest answer is bar length.
 */
export const OPTION_COLORS = [
  { key: "magenta", label: "Magenta", hex: "#ff4d8d" },
  { key: "rose", label: "Rose", hex: "#ff6b7a" },
  { key: "ember", label: "Ember", hex: "#ff8a4c" },
  { key: "amber", label: "Amber", hex: "#f0c04d" },
  { key: "lime", label: "Lime", hex: "#9ed45a" },
  { key: "teal", label: "Teal", hex: "#3fc9b6" },
  { key: "sky", label: "Sky", hex: "#4fb3f5" },
  { key: "indigo", label: "Indigo", hex: "#8f9bff" },
  { key: "violet", label: "Violet", hex: "#b98cff" },
  { key: "slate", label: "Slate", hex: "#9a93ac" },
] as const;

export type OptionColor = (typeof OPTION_COLORS)[number]["key"];

export const OPTION_COLOR_KEYS = OPTION_COLORS.map((c) => c.key);

const COLOR_HEX: Record<string, string> = Object.fromEntries(
  OPTION_COLORS.map((c) => [c.key, c.hex]),
);

const COLOR_SET = new Set<string>(OPTION_COLOR_KEYS);

/** Hex for a swatch key, or null for "no colour" and for keys we don't know. */
export function optionColorHex(key: string | null | undefined): string | null {
  return key ? (COLOR_HEX[key] ?? null) : null;
}

/** The colour an option is currently wearing, by key. */
export function itemColorHex(items: OptionItem[], key: string | null): string | null {
  if (!key) return null;
  return optionColorHex(items.find((i) => i.key === key)?.color);
}

/** Slug for a brand-new option added in the editor. */
export function optionKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/** Label for a key, falling back to the key itself for retired/unknown ones. */
export function optionLabel(items: OptionItem[], key: string | null): string {
  if (!key) return "—";
  return items.find((i) => i.key === key)?.label ?? key;
}

/** Narrow an untrusted string to a known key, or null. Used by PATCH routes. */
export function asOption<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/* ─────────────────────────── sanitizing ─────────────────────────── */

/**
 * One submitted entry, narrowed.
 *
 * `fallbackColor` is the colour this key ships with, applied when the
 * submission carries none. Stored documents written before colours existed
 * hold colourless items, and without this every option in them would come back
 * grey — a visible regression from a change nobody made.
 */
export function cleanOptionItem(
  raw: unknown,
  fallbackColor?: string,
): OptionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const { key, label, retired, color } = raw as Record<string, unknown>;
  if (typeof key !== "string" || !key.trim()) return null;
  const cleanKey = key.trim().slice(0, 50);
  const cleanLabel =
    typeof label === "string" && label.trim() ? label.trim().slice(0, 80) : cleanKey;
  // Swatch keys only. A raw hex — or a swatch we've since dropped — becomes no
  // colour rather than an error, so a stale document still renders.
  const cleanColor =
    typeof color === "string" && COLOR_SET.has(color) ? color : fallbackColor;

  const item: OptionItem = { key: cleanKey, label: cleanLabel };
  if (retired) item.retired = true;
  if (cleanColor) item.color = cleanColor;
  return item;
}

/**
 * Merge an untrusted list against its defaults. `open` lists may add and
 * retire; closed lists are re-ordered/re-labelled views of the default keys.
 */
export function sanitizeOptionList(
  raw: unknown,
  defaults: OptionItem[],
  open: boolean,
): OptionItem[] {
  const byKey = new Map(defaults.map((d) => [d.key, d]));
  const submitted = (Array.isArray(raw) ? raw : [])
    .map((item) => {
      const key = (item as { key?: unknown } | null)?.key;
      const fallback = typeof key === "string" ? byKey.get(key.trim())?.color : undefined;
      const cleaned = cleanOptionItem(item, fallback);
      // Closed keys can't retire either — money and stats semantics hang off them.
      if (cleaned && !open) delete cleaned.retired;
      return cleaned;
    })
    .filter((i): i is OptionItem => i !== null);
  const seen = new Set<string>();
  const out: OptionItem[] = [];

  for (const item of submitted) {
    if (seen.has(item.key)) continue; // a duplicate row would fork the key
    if (!open && !byKey.has(item.key)) continue; // closed list: no additions
    out.push(item);
    seen.add(item.key);
  }

  // Anything from the defaults the submission dropped comes back — retired on
  // open lists (closest to the intent of deleting), verbatim on closed ones.
  for (const d of defaults) {
    if (seen.has(d.key)) continue;
    out.push(open ? { ...d, retired: true } : d);
  }
  return out;
}
