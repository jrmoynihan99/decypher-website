import QRCode from "qrcode";
import { videoIsCurrent } from "@/lib/decyphered/fromRecap";
import { absoluteUrl } from "@/lib/site-url";
import type { RecapDoc, VideoVariant } from "./schema";

/**
 * The DeCyphered share page: `/recap/<token>/share`, the video and its
 * Share button on their own — where the QR codes on the recap page and the
 * PDF send a phone. Offered only while the recap has a video matching its
 * numbers.
 */

export const shareUrl = (token: string) => absoluteUrl(`/recap/${token}/share`);

/** What the recap page needs to show its share section, or null when there's no current video. */
export async function shareFor(recap: RecapDoc): Promise<{ variants: VideoVariant[]; qrSvg: string } | null> {
  if (!recap.video || !videoIsCurrent(recap)) return null;
  const qrSvg = await QRCode.toString(shareUrl(recap.token), {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0a0a0e", light: "#ffffff" },
  });
  return { variants: recap.video.variants, qrSvg };
}
