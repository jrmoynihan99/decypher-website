import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import { createVideo, VIDEO_H, VIDEO_W, type VideoFonts } from "./scenes";
import type { RecapData } from "./types";

/**
 * Browser only: render the DeCyphered video to an MP4, frame by frame, with
 * the browser's own H.264 encoder (WebCodecs) — the builder does this when
 * a recap is saved, so no server renders anything. Same output as the
 * advisor's kit: 1080×1920, 30 fps, H.264, a silent AAC track (Instagram
 * treats a video with no audio track as a photo-like post in places), and
 * the last frame held for a beat. Chrome or Edge; Safari's encoder is
 * patchier.
 */

const FPS = 30;
const END_HOLD_SECONDS = 1.5;
const BITRATE = 6_000_000;

/** The site's three faces as next/font registered them, loaded and ready for the canvas. */
export async function videoFonts(): Promise<VideoFonts> {
  const css = getComputedStyle(document.documentElement);
  const family = (v: string, fallback: string) => css.getPropertyValue(v).trim() || fallback;
  const fonts = {
    display: family("--font-space-grotesk", "'Space Grotesk', sans-serif"),
    body: family("--font-inter", "Inter, sans-serif"),
    mono: family("--font-plex-mono", "'IBM Plex Mono', monospace"),
  };
  await Promise.all([
    document.fonts.load(`500 40px ${fonts.display}`),
    document.fonts.load(`700 40px ${fonts.display}`),
    document.fonts.load(`400 40px ${fonts.body}`),
    document.fonts.load(`500 40px ${fonts.body}`),
    document.fonts.load(`400 40px ${fonts.mono}`),
    document.fonts.load(`500 40px ${fonts.mono}`),
  ]);
  return fonts;
}

/** Null when this browser can encode the video; otherwise why not. */
export async function videoUnsupported(): Promise<string | null> {
  if (typeof VideoEncoder === "undefined") return "This browser can't make videos. Use Chrome or Edge.";
  const ok = await canEncodeVideo("avc", { width: VIDEO_W, height: VIDEO_H, bitrate: BITRATE });
  return ok ? null : "This browser can't encode H.264 video at 1080×1920. Use Chrome or Edge.";
}

export async function renderVideo(
  recap: RecapData,
  fonts: VideoFonts,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No 2D canvas");
  const video = createVideo(recap, ctx, fonts);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const frames = new CanvasSource(canvas, { codec: "avc", bitrate: BITRATE });
  output.addVideoTrack(frames, { frameRate: FPS });
  const withAudio = await canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 48000, bitrate: 128_000 });
  const audio = withAudio ? new AudioBufferSource({ codec: "aac", bitrate: 128_000 }) : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();

  const total = Math.round((video.duration + END_HOLD_SECONDS) * FPS);
  try {
    for (let i = 0; i < total; i++) {
      signal?.throwIfAborted();
      video.seek(Math.min(i / FPS, video.duration));
      await frames.add(i / FPS, 1 / FPS);
      if (onProgress && i % 15 === 0) onProgress(i / total);
    }
    if (audio) {
      const length = Math.round((total / FPS) * 48000);
      await audio.add(new AudioBuffer({ length, numberOfChannels: 2, sampleRate: 48000 }));
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  }
  onProgress?.(1);
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("The video came out empty");
  return new Blob([buffer], { type: "video/mp4" });
}
