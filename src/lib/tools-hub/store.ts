import "server-only";
import { randomUUID } from "crypto";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import {
  asAccent,
  asAssetUrl,
  asHttpUrl,
  defaultCatalog,
  slugify,
} from "./catalog";
import type { ToolDepartment, ToolEntry, ToolsHubCatalog } from "./types";

/**
 * The Tools Hub catalog, in Firestore.
 *
 * One document (`toolsHub/catalog`) holding the departments and every tool,
 * written only once an admin edits — the same posture as `salesConfig/options`.
 * Absent means "the defaults", so a fresh install needs no seeding step and a
 * later change to lib/tools-hub/catalog.ts still reaches every un-edited
 * install.
 *
 * Where this deliberately differs from the sales config: a tool CAN be deleted
 * outright. Nothing historical is written in a tool id — no row, no ledger
 * entry, no money — so "retire, don't delete" would only leave dead cards on a
 * page whose entire job is to be a short list of live links.
 *
 * `sanitizeCatalog` is the contract, and stored documents pass through it on
 * read as well as on write, so a hand-edited document can't surface a broken
 * card:
 *
 *  - A tool needs a name, a vendor and an http(s) app URL. Anything else is
 *    dropped, because a card that doesn't open anything is noise.
 *  - Every URL is parsed, not pattern-matched. These become `href`s, so a
 *    `javascript:` link entered in the editor must not survive the round trip.
 *  - Ids are unique and permanent; a collision drops the later entry rather
 *    than forking the id.
 *  - A tool pointing at a department that no longer exists moves to the first
 *    department instead of vanishing. Deleting a department that still holds
 *    tools is blocked in the editor, but a concurrent edit can still produce
 *    this, and a silently invisible tool is the worse failure.
 *  - The department list can never be emptied — with no departments there is
 *    nowhere to render a tool at all, so an empty submission falls back to the
 *    shipped departments.
 */

const COLLECTION = "toolsHub";
const DOC = "catalog";

export class ToolsHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolsHubError";
  }
}

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function cleanDepartment(raw: unknown): ToolDepartment | null {
  if (!raw || typeof raw !== "object") return null;
  const { id, label } = raw as Record<string, unknown>;
  const cleanLabel = text(label, 60);
  // An id is only ever derived once, at creation. Falling back to a slug of the
  // label here covers a document written before ids existed, not a rename.
  const cleanId = slugify(text(id, 50)) || slugify(cleanLabel);
  if (!cleanId) return null;
  return { id: cleanId, label: cleanLabel || cleanId };
}

function cleanTool(raw: unknown, departments: Set<string>, fallbackDept: string): ToolEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const name = text(r.name, 60);
  const vendor = text(r.vendor, 60);
  const appUrl = asHttpUrl(r.appUrl);
  if (!name || !vendor || !appUrl) return null;

  const id = slugify(text(r.id, 50)) || slugify(name) || slugify(vendor);
  if (!id) return null;

  const department = text(r.department, 50);
  const tool: ToolEntry = {
    id,
    name,
    vendor,
    department: departments.has(department) ? department : fallbackDept,
    description: text(r.description, 200),
    appUrl,
  };

  const docsUrl = asHttpUrl(r.docsUrl);
  if (docsUrl) tool.docsUrl = docsUrl;
  const logoUrl = asAssetUrl(r.logoUrl);
  if (logoUrl) tool.logoUrl = logoUrl;
  const accent = asAccent(r.accent);
  if (accent) tool.accent = accent;

  return tool;
}

/** First occurrence of each id wins; a later collision is dropped, not merged. */
function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * An empty `tools` array is honoured, unlike the sales config's absent-list
 * rule: the editor always submits the whole catalog, so "no tools" is a real
 * edit rather than a list nobody has touched yet. The un-edited case never
 * reaches here — getCatalog short-circuits on a missing document.
 */
export function sanitizeCatalog(raw: unknown): ToolsHubCatalog {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const departments = dedupe(
    (Array.isArray(body.departments) ? body.departments : [])
      .map(cleanDepartment)
      .filter((d): d is ToolDepartment => d !== null),
  );

  // Nowhere to put a tool is not a state the UI can render out of.
  const finalDepts = departments.length ? departments : defaultCatalog().departments;
  const deptIds = new Set(finalDepts.map((d) => d.id));
  const fallbackDept = finalDepts[0].id;

  const tools = dedupe(
    (Array.isArray(body.tools) ? body.tools : [])
      .map((t) => cleanTool(t, deptIds, fallbackDept))
      .filter((t): t is ToolEntry => t !== null),
  );

  return { departments: finalDepts, tools };
}

export async function getCatalog(): Promise<ToolsHubCatalog> {
  if (!isConfigured()) return defaultCatalog();
  const snap = await adminDb().collection(COLLECTION).doc(DOC).get();
  if (!snap.exists) return defaultCatalog();
  return sanitizeCatalog(snap.data());
}

export async function saveCatalog(raw: unknown, actor: string): Promise<ToolsHubCatalog> {
  if (!isConfigured()) throw new ToolsHubError("Firebase is not configured");
  const catalog = sanitizeCatalog(raw);
  await adminDb()
    .collection(COLLECTION)
    .doc(DOC)
    .set({ ...catalog, updatedAt: new Date(), updatedBy: actor });
  return catalog;
}

/* ────────────────────────────── logos ──────────────────────────────
 *
 * Uploaded logo images live in Firestore, one doc per image, served back by
 * /api/portal/tools-hub/logo/[id]. Not a storage bucket because the Firebase
 * project has no billing account, so Cloud Storage can't be enabled — the
 * same constraint (and pattern) as resume PDFs in application-store.ts.
 * Content-addressed by a random id rather than keyed on the tool: a draft
 * tool has no id yet, and re-uploading must not clobber the image an older
 * catalog revision still points at.
 */

const LOGOS = "toolsHubLogos";

/** MIME types accepted for a logo upload. */
export const LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

/** Raw-byte cap. Base64 inflates ~4/3×, and a Firestore doc caps at 1MiB. */
export const LOGO_MAX_BYTES = 600 * 1024;

export async function saveLogo(
  bytes: Buffer,
  contentType: string,
  actor: string,
): Promise<string> {
  if (!isConfigured()) throw new ToolsHubError("Firebase is not configured");
  if (!LOGO_TYPES.has(contentType)) throw new ToolsHubError("Unsupported image type");
  if (!bytes.length) throw new ToolsHubError("Empty file");
  if (bytes.length > LOGO_MAX_BYTES) {
    throw new ToolsHubError("Logo must be under 600KB");
  }
  const id = randomUUID();
  await adminDb().collection(LOGOS).doc(id).set({
    contentType,
    data: bytes.toString("base64"),
    size: bytes.length,
    uploadedAt: new Date(),
    uploadedBy: actor,
  });
  return id;
}

export async function getLogo(
  id: string,
): Promise<{ contentType: string; data: Buffer } | null> {
  if (!isConfigured()) return null;
  const snap = await adminDb().collection(LOGOS).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as { contentType?: unknown; data?: unknown };
  if (typeof d.contentType !== "string" || typeof d.data !== "string") return null;
  if (!LOGO_TYPES.has(d.contentType)) return null;
  return { contentType: d.contentType, data: Buffer.from(d.data, "base64") };
}
