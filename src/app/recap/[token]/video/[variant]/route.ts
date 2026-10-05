import { videoIsCurrent } from "@/lib/decyphered/fromRecap";
import { VIDEO_VARIANTS, type VideoVariant } from "@/lib/tax-recap/schema";
import { getRecapByToken } from "@/lib/tax-recap/store";
import { videoReadUrl } from "@/lib/tax-recap/video-store";

/**
 * The client's DeCyphered video, addressed by the recap's token like the
 * page and the PDF: a redirect to an hour-long signed URL on the private
 * bucket. `?download` asks the browser to save it rather than play it. A
 * revoked recap, or one whose numbers changed since the video was made,
 * 404s.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; variant: string }> }) {
  const { token, variant } = await params;
  if (!(VIDEO_VARIANTS as readonly string[]).includes(variant)) return new Response("Not found", { status: 404 });
  const recap = await getRecapByToken(token);
  if (!recap || recap.revoked || !recap.video?.variants.includes(variant as VideoVariant) || !videoIsCurrent(recap)) {
    return new Response("Not found", { status: 404 });
  }
  const download = new URL(req.url).searchParams.has("download")
    ? `DeCyphered ${recap.taxYear}${variant === "percent" ? " (percentages)" : ""}.mp4`
    : undefined;
  const url = await videoReadUrl(recap.id, variant as VideoVariant, download);
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}
