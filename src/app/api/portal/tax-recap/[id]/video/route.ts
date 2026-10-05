import { NextResponse } from "next/server";
import { gate } from "../../_gate";
import { RecapInputError } from "@/lib/decyphered/buildRecap";
import { recapDataFor, videoHash } from "@/lib/decyphered/fromRecap";
import { VIDEO_VARIANTS } from "@/lib/tax-recap/schema";
import { TaxRecapStoreError, getRecap, setRecapVideo } from "@/lib/tax-recap/store";
import { videoUploadUrl, videosExist } from "@/lib/tax-recap/video-store";

/**
 * The DeCyphered video for one recap, in two calls around the builder's own
 * render (lib/decyphered/encode.ts runs in the staff member's browser):
 *
 * POST — what to draw. The figures come from the recap AS SAVED, so the
 * video can't show numbers the database doesn't have. Returns `current:
 * true` when the stored video already matches them (nothing to do), else
 * both cuts' RecapData, their hash, and a signed upload URL per cut.
 *
 * PUT { hash } — the uploads are done: checks both files are in the bucket
 * and the recap hasn't changed since POST, then records the video.
 */

async function load(params: Promise<{ id: string }>) {
  const { id } = await params;
  if (!id || id.length > 200 || id.includes("/")) return null;
  return getRecap(id);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const recap = await load(params);
  if (!recap) return NextResponse.json({ ok: false, message: "Recap not found" }, { status: 404 });

  try {
    const hash = videoHash(recap);
    if (recap.video?.hash === hash) return NextResponse.json({ ok: true, current: true, hash });
    const recaps = Object.fromEntries(VIDEO_VARIANTS.map((v) => [v, recapDataFor(recap, v)]));
    const uploads = Object.fromEntries(
      await Promise.all(VIDEO_VARIANTS.map(async (v) => [v, await videoUploadUrl(recap.id, v)] as const)),
    );
    return NextResponse.json({ ok: true, current: false, hash, recaps, uploads });
  } catch (e) {
    // a recap the video can't be built from says why, and the builder shows it
    if (e instanceof RecapInputError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 422 });
    }
    console.error("[tax-recap] video start failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't start the video" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const recap = await load(params);
  if (!recap) return NextResponse.json({ ok: false, message: "Recap not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { hash?: unknown } | null;
  const hash = typeof body?.hash === "string" ? body.hash : "";
  try {
    if (hash !== videoHash(recap)) {
      return NextResponse.json(
        { ok: false, message: "The recap changed while the video was being made. Save again to remake it." },
        { status: 409 },
      );
    }
    const variants = [...VIDEO_VARIANTS];
    if (!(await videosExist(recap.id, variants))) {
      return NextResponse.json({ ok: false, message: "The video upload didn't arrive. Try again." }, { status: 400 });
    }
    await setRecapVideo(recap.id, { hash, variants, renderedAt: new Date().toISOString() });
    console.log(`[tax-recap] ${session.email} rendered the video for recap ${recap.id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaxRecapStoreError || e instanceof RecapInputError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-recap] video finish failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't record the video" }, { status: 500 });
  }
}
