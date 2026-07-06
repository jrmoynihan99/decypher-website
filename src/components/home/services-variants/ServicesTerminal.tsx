"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ServicesTicker from "@/components/home/services-variants/ServicesTicker";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { SERVICES } from "@/lib/content";
import {
  cancelDecrypt,
  decryptTo,
  prefersReducedMotion,
  scramble,
} from "@/lib/decrypt";

/**
 * SERVICES VARIANT 01 — "THE VAULT SHELL"
 *
 * A live terminal wired to the three service files. Type real commands
 * (`decrypt 01`, `ls`, `help`, `clear`…) or click a file row; a brute-force
 * progress bar cracks the file and the decrypted service renders in the
 * preview pane. If the visitor doesn't touch anything, an autopilot "ghost
 * operator" types the commands for them — until the first interaction.
 */

const PROMPT = "creator@decypher:/vault$";

const FILES = [
  { name: "tax_strategy.enc", size: "48.2K", keys: ["tax", "strateg", "irs"] },
  { name: "llc_filing.enc", size: "21.7K", keys: ["llc", "course", "structur"] },
  { name: "bookkeeping.enc", size: "36.4K", keys: ["book", "keep"] },
];

const HASHES = ["9f2a…c41e", "b7d3…08aa", "4e91…f76b"];

const GHOST_LINES = [
  "awaiting key exchange ········",
  "0x00 0x00 0x00 0x00 0x00 0x00",
  "listening on vault://services",
];

const QUICK_CMDS = ["decrypt 01", "decrypt 02", "decrypt 03", "help", "clear"];

const HEX = "0123456789abcdef";
function hexRow(): string {
  let s = "";
  for (let i = 0; i < 8; i++) {
    let b = "";
    for (let j = 0; j < 4; j++) b += HEX[Math.floor(Math.random() * 16)];
    s += (i ? " " : "") + b;
  }
  return s;
}

type LineKind =
  | "cmd"
  | "out"
  | "dim"
  | "ok"
  | "err"
  | "hex"
  | "progress"
  | "file";

interface TermLine {
  id: number;
  kind: LineKind;
  text: string;
  fileIdx?: number;
}

const LINE_COLOR: Record<Exclude<LineKind, "file">, string> = {
  cmd: "text-fog",
  out: "text-mist",
  dim: "text-faint",
  ok: "text-teal",
  err: "text-danger",
  hex: "text-faint/60",
  progress: "text-magenta",
};

export default function ServicesTerminal() {
  const sectionRef = useRef<HTMLElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previewTitleRef = useRef<HTMLHeadingElement>(null);
  const previewPromiseRef = useRef<HTMLParagraphElement>(null);
  const ghostRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [lines, setLines] = useState<TermLine[]>([]);
  const [typed, setTyped] = useState("");
  const [ready, setReady] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [cracked, setCracked] = useState<boolean[]>([false, false, false]);

  const idRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const rafRef = useRef(0);
  const busyRef = useRef(false);
  const crackedRef = useRef([false, false, false]);
  const interactedRef = useRef(false);
  const autoTypingRef = useRef(false);
  const bootedRef = useRef(false);

  /* ---- primitives ---- */

  const after = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t);
      fn();
    }, ms);
    timersRef.current.add(t);
  }, []);

  const push = useCallback(
    (kind: LineKind, text: string, fileIdx?: number): number => {
      const id = ++idRef.current;
      setLines((prev) => [...prev, { id, kind, text, fileIdx }].slice(-140));
      return id;
    },
    [],
  );

  const patch = useCallback((id: number, text: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, text } : l)));
  }, []);

  const listFiles = useCallback(() => {
    FILES.forEach((_, i) => push("file", "", i));
  }, [push]);

  const interact = useCallback(() => {
    if (interactedRef.current) return;
    interactedRef.current = true;
    if (autoTypingRef.current) {
      autoTypingRef.current = false;
      setTyped("");
    }
  }, []);

  /* ---- the cracker ---- */

  const runDecrypt = useCallback(
    (i: number) => {
      if (busyRef.current) {
        push("err", "decryptor busy — one file at a time.");
        return;
      }
      if (crackedRef.current[i]) {
        push("dim", `${FILES[i].name} already open — rendering preview →`);
        setActiveIdx(i);
        return;
      }
      busyRef.current = true;
      const finish = () => {
        push("hex", hexRow());
        push("hex", hexRow());
        push("ok", `✓ ${FILES[i].name} decrypted — preview rendered →`);
        crackedRef.current[i] = true;
        setCracked([...crackedRef.current]);
        setActiveIdx(i);
        busyRef.current = false;
        if (crackedRef.current.every(Boolean))
          after(600, () =>
            push("dim", "vault open — all three services decrypted."),
          );
      };
      if (prefersReducedMotion()) {
        push("progress", `[${"█".repeat(18)}] 100% · key accepted`);
        finish();
        return;
      }
      const id = push(
        "progress",
        `[${"░".repeat(18)}]   0% · brute-forcing keyspace`,
      );
      const t0 = performance.now();
      const DUR = 1250;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / DUR);
        const filled = Math.round(p * 18);
        const pct = String(Math.round(p * 100)).padStart(3, " ");
        patch(
          id,
          `[${"█".repeat(filled)}${"░".repeat(18 - filled)}] ${pct}% · brute-forcing keyspace`,
        );
        if (p < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          patch(id, `[${"█".repeat(18)}] 100% · key accepted`);
          finish();
        }
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [after, push, patch],
  );

  /* ---- command parser ---- */

  const exec = useCallback(
    (raw: string) => {
      const cmd = raw.trim();
      push("cmd", `${PROMPT} ${cmd}`);
      if (!cmd) return;
      const lower = cmd.toLowerCase();
      const [head, ...rest] = lower.split(/\s+/);
      const arg = rest.join(" ");
      const findIdx = (s: string): number => {
        const m = s.match(/([1-3])/);
        if (m) return Number(m[1]) - 1;
        return FILES.findIndex((f) => f.keys.some((k) => s.includes(k)));
      };
      switch (head) {
        case "help":
          push("out", "ls               list vault contents");
          push("out", "decrypt <01-03>  crack a service file");
          push("out", "clear            wipe the screen");
          push("out", "whoami           check your clearance");
          break;
        case "ls":
        case "dir":
          listFiles();
          break;
        case "clear":
          setLines([]);
          listFiles();
          break;
        case "whoami":
          push("out", "creator (uid 1099) — clearance: FULL WRITE-OFF");
          break;
        case "sudo":
          push("err", "nice try. the IRS still finds you.");
          break;
        case "decrypt":
        case "open":
        case "crack": {
          const i = findIdx(arg);
          if (i < 0) push("err", "usage: decrypt <01|02|03>  (or click a file)");
          else runDecrypt(i);
          break;
        }
        default: {
          const i = findIdx(lower);
          if (i >= 0) runDecrypt(i);
          else push("err", `command not found: ${head} — try \`help\``);
        }
      }
    },
    [listFiles, push, runDecrypt],
  );

  /* ---- autopilot: a ghost operator types until the user takes over ---- */

  const typeAndRun = useCallback(
    (cmd: string, then?: () => void) => {
      autoTypingRef.current = true;
      let i = 0;
      const typeChar = () => {
        if (interactedRef.current) return;
        i++;
        setTyped(cmd.slice(0, i));
        if (i < cmd.length) after(38 + Math.random() * 55, typeChar);
        else
          after(280, () => {
            if (interactedRef.current) return;
            autoTypingRef.current = false;
            setTyped("");
            exec(cmd);
            then?.();
          });
      };
      after(160, typeChar);
    },
    [after, exec],
  );

  const scheduleAutopilot = useCallback(() => {
    const runStep = (i: number) => {
      after(i === 0 ? 2600 : 3800, () => {
        if (interactedRef.current || busyRef.current) return;
        if (crackedRef.current[i]) {
          if (i < 2) runStep(i + 1);
          return;
        }
        typeAndRun(`decrypt 0${i + 1}`, () => {
          if (i < 2) runStep(i + 1);
        });
      });
    };
    runStep(0);
  }, [after, typeAndRun]);

  /* ---- boot on first view ---- */

  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting || bootedRef.current) continue;
          bootedRef.current = true;
          io.disconnect();
          if (prefersReducedMotion()) {
            push("dim", "DECYPHER VAULT — secure shell v2.6");
            push("dim", "handshake ok · cipher: xchacha20 · link SECURE");
            push("out", "3 encrypted files found:");
            listFiles();
            push("out", "type `help`, or click a file to crack it.");
            setReady(true);
            return;
          }
          const steps: Array<[number, () => void]> = [
            [180, () => push("dim", "DECYPHER VAULT — secure shell v2.6")],
            [560, () => push("dim", "handshake ok · cipher: xchacha20 · link SECURE")],
            [
              920,
              () => {
                push("out", "3 encrypted files found:");
                listFiles();
              },
            ],
            [
              1400,
              () => {
                push("out", "type `help`, or click a file to crack it.");
                setReady(true);
                scheduleAutopilot();
              },
            ],
          ];
          steps.forEach(([ms, fn]) => after(ms, fn));
        }
      },
      { threshold: 0.3 },
    );
    io.observe(sec);
    return () => io.disconnect();
  }, [after, listFiles, push, scheduleAutopilot]);

  /* ---- pin the scrollback to the newest line ---- */

  useEffect(() => {
    const b = bodyRef.current;
    if (b) b.scrollTop = b.scrollHeight;
  }, [lines, typed, ready]);

  /* ---- decrypt the preview when a file cracks ---- */

  useEffect(() => {
    if (activeIdx == null) return;
    const svc = SERVICES[activeIdx];
    const title = previewTitleRef.current;
    const promise = previewPromiseRef.current;
    decryptTo(title, svc.title, 460);
    decryptTo(promise, svc.promise, 540);
    return () => {
      cancelDecrypt(title);
      cancelDecrypt(promise);
    };
  }, [activeIdx]);

  /* ---- placeholder ghost lines churn while nothing is decrypted ---- */

  useEffect(() => {
    if (activeIdx != null || prefersReducedMotion()) return;
    const iv = setInterval(() => {
      ghostRefs.current.forEach((g) => {
        if (g) g.textContent = scramble(g.dataset.text || "");
      });
    }, 300);
    return () => clearInterval(iv);
  }, [activeIdx]);

  /* ---- teardown ---- */

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    interact();
    if (e.key === "Enter") {
      e.preventDefault();
      const t = typed;
      setTyped("");
      exec(t);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      setTyped((t) => t.slice(0, -1));
    } else if (e.key.length === 1) {
      e.preventDefault();
      setTyped((t) => (t.length < 40 ? t + e.key : t));
    }
  };

  const crackedCount = cracked.filter(Boolean).length;

  const renderLine = (l: TermLine) => {
    if (l.kind === "file") {
      const i = l.fileIdx!;
      const f = FILES[i];
      const open = cracked[i];
      return (
        <button
          key={l.id}
          type="button"
          onClick={() => {
            interact();
            exec(`decrypt 0${i + 1}`);
          }}
          className="group/file flex w-full items-baseline gap-3 rounded px-1 text-left transition-colors hover:bg-fog/5"
        >
          <span className="text-magenta">[0{i + 1}]</span>
          <span
            className={open ? "text-teal" : "text-mist group-hover/file:text-fog"}
          >
            {f.name}
          </span>
          <span className="hidden flex-1 overflow-hidden whitespace-nowrap text-faint/50 sm:inline">
            ································
          </span>
          <span className="text-dusk">{f.size}</span>
          <span
            className={`font-semibold tracking-[0.08em] ${open ? "text-teal" : "text-ember"}`}
          >
            {open ? "OPEN" : "LOCKED"}
          </span>
        </button>
      );
    }
    return (
      <div
        key={l.id}
        className={`whitespace-pre-wrap break-words ${LINE_COLOR[l.kind]}`}
      >
        {l.text}
      </div>
    );
  };

  const svc = activeIdx != null ? SERVICES[activeIdx] : null;

  return (
    <section
      id="services"
      ref={sectionRef}
      className="relative z-[1] px-6 pb-[120px] pt-[110px]"
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="relative max-w-[720px]">
          <GlowOrb size={620} alpha={0.14} style={{ left: -180, top: -140 }} />
          <p className="relative m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            [ 05 // services ]
          </p>
          <DecryptOnView
            as="h2"
            text="One stop shop for your creator business."
            className="relative mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
          />
          <p className="relative mt-[18px] max-w-[52ch] text-base leading-relaxed text-mist">
            Three encrypted files. One shell. Crack them yourself &mdash; or
            wait, and the vault cracks them for you.
          </p>
        </div>

        <ServicesTicker className="mt-10" />

        <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {/* terminal window */}
          <div
            ref={termRef}
            tabIndex={0}
            role="application"
            aria-label="DeCypher vault terminal — type help for commands"
            onKeyDown={onKeyDown}
            onPointerDown={() => {
              interact();
              termRef.current?.focus();
            }}
            className="relative cursor-text overflow-hidden rounded-2xl border border-edge-mid bg-[#0C0B11] shadow-[0_30px_80px_rgba(0,0,0,.5)] outline-none transition-colors focus-visible:border-magenta/60"
          >
            <div className="flex items-center gap-2.5 border-b border-edge px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-danger/80" />
              <span className="h-3 w-3 rounded-full bg-ember/80" />
              <span className="h-3 w-3 rounded-full bg-teal/80" />
              <span className="ml-3 font-mono text-[11.5px] tracking-[0.12em] text-dusk">
                creator@decypher — /vault
              </span>
              <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-teal">
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-teal" />
                SECURE
              </span>
            </div>

            <div
              ref={bodyRef}
              className="h-[430px] overflow-y-auto px-5 py-4 font-mono text-[13px] leading-[1.75]"
            >
              {lines.map(renderLine)}
              {ready && (
                <div className="flex items-baseline gap-2 text-fog">
                  <span className="shrink-0 text-magenta">{PROMPT}</span>
                  <span className="whitespace-pre-wrap break-all">{typed}</span>
                  <span className="-mb-px inline-block h-[15px] w-2 shrink-0 animate-blink bg-fog/80" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-edge px-4 py-2 font-mono text-[10.5px] tracking-[0.16em] text-faint">
              <span>{crackedCount}/3 DECRYPTED</span>
              <span className="hidden sm:inline">CLICK A FILE · OR TYPE</span>
              <span className="text-magenta/70">VAULT://SERVICES</span>
            </div>

            {/* CRT scanlines + vignette */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 animate-scan [background:repeating-linear-gradient(0deg,rgba(241,238,246,.028)_0px,rgba(241,238,246,.028)_1px,transparent_1px,transparent_4px)] [background-size:100%_48px]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_110px_rgba(10,10,14,.8)]"
            />
          </div>

          {/* preview pane */}
          <div className="relative min-h-[480px] overflow-hidden rounded-2xl border border-edge-mid bg-panel">
            <GlowOrb
              size={420}
              alpha={0.1}
              style={{ left: "auto", right: -170, top: -170 }}
            />
            {svc == null ? (
              <div className="relative flex h-full min-h-[480px] flex-col items-center justify-center gap-6 px-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-edge-bright font-mono text-[20px] text-faint">
                  ◉
                </div>
                <div className="space-y-1.5 font-mono text-[11.5px] tracking-[0.14em] text-faint">
                  {GHOST_LINES.map((g, i) => (
                    <div
                      key={g}
                      data-text={g}
                      ref={(el) => {
                        ghostRefs.current[i] = el;
                      }}
                    >
                      {g}
                    </div>
                  ))}
                </div>
                <p className="m-0 font-mono text-[11px] tracking-[0.2em] text-dusk">
                  NO FILE DECRYPTED — RUN{" "}
                  <span className="text-magenta">decrypt 01</span>
                </p>
              </div>
            ) : (
              <article
                key={activeIdx}
                className="relative flex h-full flex-col px-6 pb-6 pt-5"
              >
                <div className="flex h-[180px] w-full items-center justify-center rounded-[14px] border border-edge bg-[#0F0E14]">
                  <span className="font-mono text-[11.5px] tracking-[0.16em] text-faint">
                    {svc.imgLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-5">
                  <span className="font-mono text-[13px] tracking-[0.14em] text-magenta">
                    {svc.num}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.18em] text-teal">
                    ● DECRYPTED
                  </span>
                </div>
                <h3
                  ref={previewTitleRef}
                  className="mt-2.5 font-display text-[clamp(22px,2.2vw,27px)] font-semibold tracking-[-0.01em] text-fog"
                >
                  {svc.title}
                </h3>
                <p
                  ref={previewPromiseRef}
                  className="mt-2 font-mono text-xs uppercase tracking-[0.16em] text-magenta"
                >
                  {svc.promise}
                </p>
                <p className="m-0 mt-3 text-[15px] leading-[1.65] text-mist">
                  {svc.body}
                </p>
                {svc.chips && (
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    {svc.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-edge-bright px-[13px] py-1.5 font-mono text-[11.5px] tracking-[0.1em] text-mist"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-5 font-mono text-[10.5px] tracking-[0.12em] text-faint">
                  sha256 {HASHES[activeIdx!]} · verified by decypher
                </div>
              </article>
            )}
          </div>
        </div>

        {/* quick commands (tap targets for touch, shortcuts for everyone) */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[11px] tracking-[0.14em] text-faint">
            {"// quick_cmds:"}
          </span>
          {QUICK_CMDS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                interact();
                exec(c);
              }}
              className="rounded-full border border-edge-bright px-4 py-1.5 font-mono text-[11.5px] tracking-[0.1em] text-mist transition-colors hover:border-magenta hover:text-fog"
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
