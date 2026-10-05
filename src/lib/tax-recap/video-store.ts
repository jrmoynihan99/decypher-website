import "server-only";
import { getStorage } from "firebase-admin/storage";
import { adminApp } from "@/lib/firebase/admin";
import type { VideoVariant } from "./schema";

/**
 * Where a recap's DeCyphered videos live: the project's default Cloud
 * Storage bucket, `taxRecaps/<id>/<variant>.mp4`. The bucket is private
 * (production rules deny every client); the builder uploads and the recap
 * page plays through short-lived signed URLs minted here, so a link only
 * works while the recap does. The bucket's CORS lets a browser PUT to and
 * GET from those URLs — the signature is the access control.
 */

function bucket() {
  const name = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
  return getStorage(adminApp()).bucket(name);
}

const path = (recapId: string, variant: VideoVariant) => `taxRecaps/${recapId}/${variant}.mp4`;

/** A URL the builder PUTs one rendered MP4 to, good for 15 minutes. */
export async function videoUploadUrl(recapId: string, variant: VideoVariant): Promise<string> {
  const [url] = await bucket()
    .file(path(recapId, variant))
    .getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 15 * 60_000, contentType: "video/mp4" });
  return url;
}

/** A URL to play or download one video, good for an hour. */
export async function videoReadUrl(recapId: string, variant: VideoVariant, download?: string): Promise<string> {
  const [url] = await bucket()
    .file(path(recapId, variant))
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60_000,
      ...(download ? { responseDisposition: `attachment; filename="${download}"` } : {}),
    });
  return url;
}

/** True when every named variant is in the bucket — checked before the recap records them. */
export async function videosExist(recapId: string, variants: VideoVariant[]): Promise<boolean> {
  const found = await Promise.all(variants.map((v) => bucket().file(path(recapId, v)).exists()));
  return found.every(([exists]) => exists);
}

export async function deleteVideos(recapId: string): Promise<void> {
  await bucket().deleteFiles({ prefix: `taxRecaps/${recapId}/` });
}
