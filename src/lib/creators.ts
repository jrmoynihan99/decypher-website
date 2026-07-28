/**
 * Creator display helpers. The roster itself lives in Sanity
 * (fetched via getCreators() in src/sanity/queries.ts).
 */

export interface CreatorLink {
  plat: string;
  url: string;
}

export interface Creator {
  /** Sanity document _id — how the home roster's hand-picked list is matched. */
  id: string;
  name: string;
  cat: string;
  group: string;
  desc: string;
  links: CreatorLink[];
  /** CDN image URL. */
  img: string;
}

/** Accent color per creator category (badge text + border tint). */
export const ACCENT: Record<string, string> = {
  Lifestyle: "#FF6A3D",
  Beauty: "#FF2D78",
  Gaming: "#A021E0",
  UGC: "#FF8A3D",
  Comedy: "#E8B84B",
  Coaching: "#3DD6C4",
  Food: "#FF5C5C",
  Finance: "#4ADE80",
  Fashion: "#D6249F",
  Music: "#6C8CFF",
  Sports: "#F97316",
  Mixology: "#B57BFF",
  Editor: "#8AB4FF",
  "TikTok Shop": "#22D3EE",
  Tech: "#60A5FA",
  "Management Company": "#A3A3B8",
  Podcast: "#F472B6",
  Storytelling: "#FBBF24",
  Fitness: "#34D399",
  Travel: "#38BDF8",
  Trickshots: "#FB7185",
};

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "IG",
  youtube: "YT",
  tiktok: "TT",
  website: "WEB",
};

/**
 * Vibrant palette for auto-assigning an accent to categories that aren't in
 * ACCENT — i.e. new ones added in Sanity. Deduped ACCENT values minus the one
 * neutral grey (Management Company), so a brand-new category never renders
 * greyscale. See accentFor().
 */
const ACCENT_POOL = Array.from(new Set(Object.values(ACCENT))).filter(
  (c) => c !== ACCENT["Management Company"],
);

/**
 * Stable FNV-1a hash so a given category name always maps to the same pool
 * color — deterministic across SSR/hydration and every visit (no flicker, no
 * hydration mismatch), which a per-render Math.random() would break.
 */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function accentFor(cat: string): string {
  if (ACCENT[cat]) return ACCENT[cat];
  if (!cat) return "#B8B3C6";
  return ACCENT_POOL[hashString(cat) % ACCENT_POOL.length];
}

export function hexToRgba(hex: string, a: number): string {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
}

/** Best-effort "@handle" from a social URL, for roster captions. */
export function handleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (!seg) return null;
    if (u.hostname.includes("instagram.com")) return `@${seg}`;
    if (seg.startsWith("@")) return seg; // youtube.com/@user, tiktok.com/@user
    return null;
  } catch {
    return null;
  }
}

export function creatorHandle(c: Creator): string {
  for (const l of c.links) {
    const h = handleFromUrl(l.url);
    if (h) return h;
  }
  return c.cat;
}
