"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { renderVideo, videoFonts, videoUnsupported } from "@/lib/decyphered/encode";
import type { RecapData } from "@/lib/decyphered/types";
import { VIDEO_VARIANTS, type VideoVariant } from "@/lib/tax-recap/schema";

/**
 * The client's DeCyphered video, made in this browser when the recap is
 * saved. The server says what to draw (the figures as saved) and where to
 * put it; this tab renders both cuts with WebCodecs, uploads them straight
 * to the private bucket, and tells the server they're there. Nothing
 * renders on a server. Closing the tab mid-render just leaves the recap
 * without a video until the next save, or the "Make the video" button.
 */

export type VideoState =
  | { kind: "idle" }
  | { kind: "working"; label: string; fraction: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type Start =
  | { ok: true; current: true; hash: string }
  | { ok: true; current: false; hash: string; recaps: Record<VideoVariant, RecapData>; uploads: Record<VideoVariant, string> }
  | { ok: false; message?: string };

const CUT_LABEL: Record<VideoVariant, string> = { dollars: "with dollar amounts", percent: "percentages only" };

/** `ready`: the recap opened for editing already has a video matching its numbers. */
export function useVideoMaker(ready = false) {
  const [state, setState] = useState<VideoState>(ready ? { kind: "ready" } : { kind: "idle" });
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  const make = useCallback(async (recapId: string) => {
    // a newer save wins: stop whatever render is still going
    running.current?.abort();
    const ctl = new AbortController();
    running.current = ctl;
    const live = () => running.current === ctl && !ctl.signal.aborted;
    try {
      setState({ kind: "working", label: "Starting the video", fraction: 0 });
      const why = await videoUnsupported();
      if (why) throw new Error(why);
      const res = await fetch(`/api/portal/tax-recap/${recapId}/video`, { method: "POST" });
      const start = (await res.json().catch(() => ({ ok: false }))) as Start;
      if (!start.ok) throw new Error(start.message ?? "Couldn't start the video");
      if (!live()) return;
      if (start.current) {
        setState({ kind: "ready" });
        return;
      }
      const fonts = await videoFonts();
      for (const [i, v] of VIDEO_VARIANTS.entries()) {
        const blob = await renderVideo(
          start.recaps[v],
          fonts,
          (f) => live() && setState({ kind: "working", label: `Making the video (${CUT_LABEL[v]})`, fraction: (i + f * 0.9) / VIDEO_VARIANTS.length }),
          ctl.signal,
        );
        if (!live()) return;
        setState({ kind: "working", label: `Uploading the video (${CUT_LABEL[v]})`, fraction: (i + 0.95) / VIDEO_VARIANTS.length });
        const put = await fetch(start.uploads[v], { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: blob, signal: ctl.signal });
        if (!put.ok) throw new Error(`The upload failed (${put.status})`);
      }
      const done = await fetch(`/api/portal/tax-recap/${recapId}/video`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: start.hash }),
      });
      const fin = (await done.json().catch(() => ({ ok: false }))) as { ok: boolean; message?: string };
      if (!fin.ok) throw new Error(fin.message ?? "Couldn't record the video");
      if (live()) setState({ kind: "ready" });
    } catch (e) {
      if (!live()) return;
      setState({ kind: "error", message: e instanceof Error ? e.message : "The video failed" });
    }
  }, []);

  return { state, make };
}

/** One line under the save button: progress, ready with a preview, or what went wrong. */
export function VideoStatus({
  state,
  token,
  onMake,
}: {
  state: VideoState;
  token: string | null;
  onMake: () => void;
}) {
  const btn =
    "cursor-pointer font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted underline decoration-edge-mid underline-offset-4 hover:text-fog";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
      <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-dusk">DeCyphered video</span>
      {state.kind === "working" ? (
        <>
          <span className="text-mist">
            {state.label}… {Math.round(state.fraction * 100)}%
          </span>
          <span className="h-1 w-28 overflow-hidden rounded-full bg-edge-mid">
            <span className="block h-full bg-magenta transition-[width]" style={{ width: `${Math.round(state.fraction * 100)}%` }} />
          </span>
          <span className="text-dusk">Keep this tab open.</span>
        </>
      ) : state.kind === "ready" ? (
        <>
          <span className="font-semibold text-teal">Ready ✓</span>
          {token ? (
            <>
              <a href={`/recap/${token}/video/dollars`} target="_blank" rel="noreferrer" className={btn}>
                Watch
              </a>
              <a href={`/recap/${token}/video/percent`} target="_blank" rel="noreferrer" className={btn}>
                Percentages cut
              </a>
            </>
          ) : null}
        </>
      ) : state.kind === "error" ? (
        <>
          <span className="text-danger">{state.message}</span>
          <button type="button" onClick={onMake} className={btn}>
            Try again
          </button>
        </>
      ) : (
        <button type="button" onClick={onMake} className={btn}>
          Make the video
        </button>
      )}
    </div>
  );
}
