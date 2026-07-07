/**
 * Creator display helpers. The roster itself lives in Sanity
 * (fetched via getCreators() in src/sanity/queries.ts).
 */

export interface CreatorLink {
  plat: string;
  url: string;
}

export interface Creator {
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

export function accentFor(cat: string): string {
  return ACCENT[cat] ?? "#B8B3C6";
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
