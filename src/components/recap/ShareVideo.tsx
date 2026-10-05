"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoVariant } from "@/lib/tax-recap/schema";

/**
 * "Post your DeCyphered": the client's video, ready to go to their story.
 *
 * On a phone the main button hands the MP4 to the share sheet (Web Share
 * with files) — tap Instagram, then Story, and the editor opens with the
 * video in it, the closest a web page gets to Spotify Wrapped's one-tap
 * share. The file is fetched ahead of the tap: iOS only lets `share()` run
 * straight off the gesture, not after a download. Elsewhere (a desktop, or
 * a phone without file sharing) the QR code carries it to the phone, and
 * Save video is the fallback everywhere.
 *
 * The page can't place the @mention for them; the steps say how, and the
 * handle is one tap to copy.
 */

const HANDLE = "@we.decypher";

export default function ShareVideo({
  token,
  taxYear,
  variants,
  qrSvg,
}: {
  token: string;
  taxYear: number;
  variants: VideoVariant[];
  /** The /share page's QR code, drawn on the server; null on the share page itself. */
  qrSvg: string | null;
}) {
  const [variant, setVariant] = useState<VideoVariant>(variants.includes("dollars") ? "dollars" : variants[0]);
  const [canShare, setCanShare] = useState(false);
  const [phone, setPhone] = useState(false);
  const [file, setFile] = useState<{ variant: VideoVariant; file: File } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const src = (v: VideoVariant) => `/recap/${token}/video/${v}`;
  const name = `DeCyphered ${taxYear}.mp4`;

  // what this device can do; read after mount so the server render matches
  useEffect(() => {
    const t = window.setTimeout(() => {
      setPhone(window.matchMedia("(pointer: coarse)").matches);
      try {
        setCanShare(!!navigator.canShare?.({ files: [new File([""], "x.mp4", { type: "video/mp4" })] }));
      } catch {
        setCanShare(false);
      }
    });
    return () => clearTimeout(t);
  }, []);

  // fetch the selected cut once the section is near, so Share can run on the tap itself
  useEffect(() => {
    if (!canShare) return;
    const el = rootRef.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        fetch(src(variant))
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
          .then((b) => !cancelled && setFile({ variant, file: new File([b], name, { type: "video/mp4" }) }))
          .catch(() => {});
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
    // src and name follow token/taxYear, which never change on a page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShare, variant]);

  const share = async () => {
    setStatus(null);
    const ready = file?.variant === variant ? file.file : null;
    if (!ready) {
      setStatus("Getting your video ready… tap again in a second.");
      return;
    }
    try {
      await navigator.share({ files: [ready], title: `My ${taxYear} taxes, DeCyphered` });
    } catch (e) {
      // closing the share sheet isn't an error worth showing
      if (e instanceof DOMException && e.name === "AbortError") return;
      setStatus("Sharing didn't open. Use Save video, then post it from your camera roll.");
    }
  };

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(HANDLE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the handle is on screen to type instead */
    }
  };

  const showShare = canShare && phone;

  return (
    <div ref={rootRef} className="mx-auto grid max-w-[880px] items-center gap-10 md:grid-cols-[minmax(0,300px)_1fr] md:gap-14">
      {/* the video, in a phone-shaped frame */}
      <div className="mx-auto w-full max-w-[300px]">
        <div className="overflow-hidden rounded-[28px] border border-white/12 bg-night shadow-[0_30px_90px_-30px_rgba(255,45,120,.45)]">
          <video
            key={variant}
            src={src(variant)}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="block aspect-[9/16] w-full bg-night"
          />
        </div>
      </div>

      <div>
        {variants.length > 1 ? (
          <div className="inline-flex rounded-full border border-white/12 bg-white/[0.03] p-1" role="radiogroup" aria-label="Which version">
            {(["dollars", "percent"] as const)
              .filter((v) => variants.includes(v))
              .map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={variant === v}
                  onClick={() => setVariant(v)}
                  className={`cursor-pointer rounded-full border-0 px-4 py-2 font-display text-[13px] font-semibold transition-colors ${
                    variant === v ? "bg-fog text-night" : "bg-transparent text-mist hover:text-fog"
                  }`}
                >
                  {v === "dollars" ? "Show my numbers" : "Percentages only"}
                </button>
              ))}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {showShare ? (
            <button
              type="button"
              onClick={share}
              className="inline-flex cursor-pointer items-center gap-2.5 rounded-full border-0 bg-magenta px-6 py-3.5 font-display text-[15px] font-semibold text-white shadow-[0_14px_40px_-12px_rgba(255,45,120,.8)] transition-transform active:scale-[0.98]"
            >
              Share to Instagram
              <span aria-hidden>→</span>
            </button>
          ) : null}
          <a
            href={`${src(variant)}?download`}
            className={`inline-flex items-center rounded-full px-5 py-3 font-display text-[14px] font-semibold no-underline transition-colors ${
              showShare ? "border border-white/15 text-fog hover:border-mist" : "bg-magenta text-white hover:brightness-110"
            }`}
          >
            Save video
          </a>
        </div>
        {status ? <p className="mb-0 mt-3 text-[13px] text-mist">{status}</p> : null}

        <ol className="mt-7 space-y-2.5 pl-0 text-[14.5px] leading-snug text-mist">
          {[
            showShare ? (
              <>Tap <b className="text-fog">Share to Instagram</b>, then <b className="text-fog">Instagram</b> and <b className="text-fog">Story</b>.</>
            ) : (
              <>Save the video to your phone{qrSvg && !phone ? " (scan the code below to open this on it)" : ""}, then add it to your Instagram story.</>
            ),
            <>
              Add a <b className="text-fog">Mention</b> sticker for{" "}
              <button
                type="button"
                onClick={copyHandle}
                className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13.5px] text-magenta underline decoration-magenta/40 underline-offset-4"
              >
                {HANDLE}
              </button>
              {copied ? <span className="ml-2 font-mono text-[11px] uppercase tracking-[1px] text-teal">copied</span> : null}
            </>,
            <>Post it. We&rsquo;ll see the tag and send your $50 Visa gift card.</>,
          ].map((step, i) => (
            <li key={i} className="flex list-none items-baseline gap-3">
              <span className="flex-none font-mono text-[11px] text-magenta">0{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {qrSvg && !phone ? (
          <div className="mt-8 flex items-center gap-5 rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
            {/* the SVG is the qrcode library's output for our own share URL, made on the server */}
            <div
              className="h-[112px] w-[112px] flex-none overflow-hidden rounded-[10px] bg-white p-1.5 [&>svg]:h-full [&>svg]:w-full"
              aria-label="QR code to open the video on your phone"
              role="img"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div>
              <div className="font-display text-[15px] font-semibold text-fog">Post from your phone</div>
              <p className="mb-0 mt-1 text-[13px] leading-snug text-muted">
                Scan with your camera to open your video there, with the Share button ready.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
