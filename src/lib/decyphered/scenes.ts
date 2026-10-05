import type { RecapData } from "./types";

/**
 * The DeCyphered video, drawn on a 1080×1920 canvas. A port of the
 * advisor's template (recap.html in his Oct 2026 kit): the same scenes,
 * timings, easing, scramble and layout, drawn with Canvas 2D so the
 * builder's browser can encode it frame by frame (encode.ts) with no server.
 *
 * Like the template, it never calculates or formats a number: every figure
 * comes from `recap.display`. `seek(t)` draws any frame, deterministically.
 * Text stays inside Meta's 9:16 safe zone (x 90–930, y 290–1240).
 *
 * CHANGED from the template: no "top write-offs" scene (no Schedule C
 * line items yet), and the last scene points at @we.decypher instead of a
 * referral offer (no tracked links yet).
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** CSS font-family strings for the site's three faces (as next/font names them). */
export type VideoFonts = { display: string; body: string; mono: string };

export const VIDEO_W = 1080;
export const VIDEO_H = 1920;
const COL_X = 90;
const COL_W = 840;

const C = {
  bg: "#0A0A0E",
  mag: "#FF2D78",
  teal: "#35D6B0",
  ink: "#F4F2F7",
  mute: "#9C99A8",
  strike: "#F25C6E",
};

type Face = keyof VideoFonts;
type Style = { face: Face; weight: number; size: number; lh: number; ls: number; color: string };

const S = {
  eyebrow: { face: "mono", weight: 500, size: 28, lh: 1.3, ls: 0.16, color: C.mag },
  h1: { face: "display", weight: 700, size: 120, lh: 0.98, ls: -0.035, color: C.ink },
  h2: { face: "display", weight: 500, size: 68, lh: 1.05, ls: -0.02, color: C.ink },
  big: { face: "display", weight: 700, size: 230, lh: 0.95, ls: -0.05, color: C.ink },
  sub: { face: "body", weight: 400, size: 44, lh: 1.3, ls: 0, color: C.mute },
  mono: { face: "mono", weight: 400, size: 26, lh: 1.3, ls: 0.14, color: C.mute },
} satisfies Record<string, Style>;

/* ── the template's easing and noise, verbatim ── */
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eo = (x: number) => 1 - Math.pow(1 - x, 3);
const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const LET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789#$%&@=+<>/";
const DIG = "0123456789";
function scramble(s: string, p: number, f: number, salt: number) {
  const num = /^[$\d,.%]+$/.test(s);
  let o = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === " " || c === "\n" || (num && (c === "$" || c === "," || c === "%"))) {
      o += c;
      continue;
    }
    const th = (i / s.length) * 0.75 + hash(i, salt) * 0.25;
    if (p >= 1 || p > th) o += c;
    else {
      const set = num ? DIG : LET;
      o += set[Math.floor(hash(i + salt * 7, f) * set.length)];
    }
  }
  return o;
}

export function createVideo(recap: RecapData, ctx: Ctx, fonts: VideoFonts) {
  const X = recap.display;
  const money = recap.share_dollar_amounts;

  const font = (s: Style) => {
    ctx.font = `${s.weight} ${s.size}px ${fonts[s.face]}`;
    ctx.letterSpacing = `${s.ls * s.size}px`;
  };
  const widest = (s: Style, text: string) => {
    font(s);
    return Math.max(...text.split("\n").map((l) => ctx.measureText(l).width));
  };
  /** Where the baseline sits in a CSS line box of this style: half-leading above the font's ascent. */
  const metrics = (s: Style) => {
    font(s);
    const m = ctx.measureText("Hg");
    const asc = m.fontBoundingBoxAscent;
    const desc = m.fontBoundingBoxDescent;
    const line = s.size * s.lh;
    return { line, base: (line - (asc + desc)) / 2 + asc };
  };
  /** The template's `.fit`: shrink 4px at a time until the widest line fits the column. */
  const fit = (s: Style, text: string): Style => {
    let size = s.size;
    while (widest({ ...s, size }, text) > COL_W && size > 60) size -= 4;
    return { ...s, size };
  };
  /** Draw pre-line text with its top at `top`; returns the block height. */
  const text = (s: Style, str: string, x: number, top: number, color = s.color) => {
    const { line, base } = metrics(s);
    font(s);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    str.split("\n").forEach((l, i) => ctx.fillText(l, x, top + i * line + base));
    return line * str.split("\n").length;
  };
  const height = (s: Style, str: string) => metrics(s).line * str.split("\n").length;

  /** An `.a` block: fade/rise/slide in from `at` over `dur` seconds of scene time. */
  const enter = (L: number, at: number, dur: number, fx: "up" | "left" | "fade", draw: () => void) => {
    const p = eo(seg(L, at, at + dur));
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p;
    if (fx === "up") ctx.translate(0, (1 - p) * 44);
    if (fx === "left") ctx.translate((1 - p) * 120, 0);
    draw();
    ctx.restore();
  };
  /** A `.dec` block: scrambles into its text from `at` over `dur`. */
  const decrypt = (L: number, at: number, dur: number, salt: number, frame: number, draw: (s: string) => void, str: string) => {
    const p = seg(L, at, at + dur);
    const alpha = at === 0 ? 1 : seg(L, at, at + 0.15);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    draw(scramble(str, p, frame, salt));
    ctx.restore();
  };

  /* ── scene list and timeline, as the template builds it ── */
  let step = 0;
  const num = () => String(++step).padStart(2, "0");
  const ids: [string, number][] = [["hook", 3.4]];
  if (money) ids.push(["income", 4.8]);
  ids.push(["saved", 6.0], ["play", 6.0], ["cta", 5.2]);
  const T: Record<string, { start: number; end: number }> = {};
  let acc = 0;
  for (const [id, d] of ids) {
    T[id] = { start: acc, end: acc + d };
    acc += d;
  }
  const duration = acc;
  const eyebrows: Record<string, string> = {};
  for (const [id] of ids) if (id !== "hook") eyebrows[id] = num();

  /* ── layout, computed once (the template's fitAll + flow) ── */
  const hookH1 = fit({ ...S.h1, size: 136 }, `My CPA just\nDeCyphered\nmy ${recap.tax_year}.`);
  const incomeBig = fit({ ...S.big, size: 230 }, X.creator_income);
  const savedBig = fit({ ...S.big, size: money ? 230 : 300, color: C.teal }, money ? X.estimated_tax_savings : X.tax_bill_cut_pct);
  const personality = recap.tax_personality.name.replace(/ (\S+)$/, "\n$1.");
  const playH1 = fit({ ...S.h1, size: 140 }, personality);
  const rateN: Style = { face: "display", weight: 700, size: 150, lh: 1, ls: -0.04, color: C.strike };
  const arrow: Style = { face: "body", weight: 400, size: 90, lh: 1.21, ls: 0, color: C.mute };
  const chk: Style = { face: "body", weight: 400, size: 42, lh: 1.21, ls: 0, color: C.ink };
  const handle = recap.brand_handle;
  const offer1 = (() => {
    let size = 150;
    while (widest({ ...rateN, size, ls: -0.045 }, handle) > COL_W - 96 && size > 60) size -= 4;
    return { ...rateN, size, ls: -0.045, color: C.bg } as Style;
  })();
  const offer2: Style = { face: "body", weight: 500, size: 42, lh: 1.21, ls: 0, color: C.bg };

  /* ── backdrop: binary rain and the drifting glow ── */
  const rain = (t: number) => {
    ctx.font = `500 22px ${fonts.mono}`;
    ctx.letterSpacing = "0px";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let c = 0; c < 30; c++) {
      const sp = 60 + hash(c, 1) * 110;
      const len = 8 + Math.floor(hash(c, 2) * 14);
      const off = hash(c, 3) * 2400;
      const head = ((t * sp + off) % (1920 + len * 34)) - len * 34 * 0.2;
      const pink = hash(c, 4) < 0.35;
      for (let k = 0; k < len; k++) {
        const y = head - k * 34;
        if (y < -34 || y > 1940) continue;
        const a = (1 - k / len) * (pink ? 0.2 : 0.1);
        ctx.fillStyle = pink ? `rgba(255,45,120,${a})` : `rgba(220,215,235,${a})`;
        ctx.fillText(hash(c * 97 + k, Math.floor(t * 6 + k)) > 0.5 ? "1" : "0", c * 36 + 18, y);
      }
    }
  };
  const radial = (cx: number, cy: number, r: number, stops: [number, string][]) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };

  /* ── the chrome along the top of every scene ── */
  const chrome = () => {
    const top = 300;
    const wm: Style = { face: "display", weight: 500, size: 34, lh: 1.2, ls: -0.01, color: C.ink };
    const { base } = metrics(wm);
    font(wm);
    ctx.textAlign = "left";
    ctx.fillStyle = C.ink;
    ctx.fillText("DeCypher ", COL_X, top + base);
    const w = ctx.measureText("DeCypher ").width;
    ctx.fillStyle = C.mag;
    ctx.fillText("Financials", COL_X + w, top + base);
    const yr: Style = { face: "mono", weight: 400, size: 24, lh: 1.2, ls: 0.16, color: C.mute };
    font(yr);
    const label = `[ ${recap.tax_year} ]`;
    ctx.fillStyle = C.mute;
    ctx.textAlign = "right";
    // CSS letter-spacing trails the last glyph too; the template's right edge includes it
    ctx.fillText(label, COL_X + COL_W, top + base);
    ctx.textAlign = "left";
  };

  /* ── scenes ── */
  const scenes: Record<string, (L: number, frame: number, idx: number) => void> = {
    hook(L, frame, idx) {
      for (const dl of [0, 0.5]) {
        const q = seg(L, dl, 3.2 + dl);
        const s = 200 + q * 1500;
        ctx.save();
        ctx.globalAlpha *= (1 - q) * 0.9;
        ctx.strokeStyle = "rgba(255,45,120,.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(540, 860, s / 2 - 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      let y = 520;
      const eb = `[ TAX YEAR // ${recap.tax_year} ]`;
      enter(L, 0, 0.3, "fade", () => text(S.eyebrow, eb, COL_X, y));
      y += height(S.eyebrow, eb) + 36;
      const h1 = `My CPA just\nDeCyphered\nmy ${recap.tax_year}.`;
      decrypt(L, 0, 1.6, 0 * 13 + idx * 31 + 5, frame, (s) => text(hookH1, s, COL_X, y), h1);
      y += height(hookH1, h1) + 40;
      enter(L, 1.7, 0.6, "up", () => text(S.sub, "Here's my year, by the numbers.", COL_X, y));
    },
    income(L, frame, idx) {
      let y = 500;
      const eb = `[ ${eyebrows.income} // WHAT I MADE ]`;
      enter(L, 0.1, 0.6, "fade", () => text(S.eyebrow, eb, COL_X, y));
      y += height(S.eyebrow, eb) + 40;
      const h2 = "As a creator,\nI brought in";
      enter(L, 0.3, 0.6, "up", () => text(S.h2, h2, COL_X, y));
      y += height(S.h2, h2) + 24;
      decrypt(L, 0.8, 1.2, 0 * 13 + idx * 31 + 5, frame, (s) => text(incomeBig, s, COL_X, y), X.creator_income);
      y += height(incomeBig, X.creator_income) + 40;
      enter(L, 2.4, 0.6, "up", () => text(S.sub, `That's over ${X.daily_income} a day.`, COL_X, y, C.ink));
    },
    saved(L, frame, idx) {
      // the teal halo swelling behind the number
      const h = seg(L, 0.7, 2.0);
      if (h > 0) {
        ctx.save();
        ctx.globalAlpha *= h;
        const k = 0.7 + 0.3 * eo(h);
        ctx.translate(540, 730);
        ctx.scale(k, k);
        radial(0, 0, 550, [
          [0, "rgba(53,214,176,.24)"],
          [0.7, "rgba(53,214,176,0)"],
        ]);
        ctx.restore();
      }
      let y = 440;
      const eb = `[ ${eyebrows.saved} // WHAT I KEPT ]`;
      enter(L, 0.1, 0.6, "fade", () => text(S.eyebrow, eb, COL_X, y));
      y += height(S.eyebrow, eb) + 40;
      const h2 = money ? "Kept out of taxes" : "Tax bill cut by";
      enter(L, 0.3, 0.6, "up", () => text(S.h2, h2, COL_X, y));
      y += height(S.h2, h2) + 20;
      const big = money ? X.estimated_tax_savings : X.tax_bill_cut_pct;
      decrypt(L, 0.7, 1.2, 0 * 13 + idx * 31 + 5, frame, (s) => text(savedBig, s, COL_X, y), big);
      y += height(savedBig, big) + 70;
      // CHANGED: cents of every dollar on one base, not an effective rate (config RATE_METHOD)
      const rateLabel = "TAXES ON EVERY DOLLAR I BROUGHT IN";
      enter(L, 2.3, 0.6, "fade", () => text(S.mono, rateLabel, COL_X, y));
      y += height(S.mono, rateLabel) + 14;
      const rowTop = y;
      enter(L, 2.5, 0.6, "up", () => {
        // before rate, struck through; arrow; after rate fading up
        const { base } = metrics(rateN);
        font(rateN);
        const priorW = ctx.measureText(X.prior_rate).width;
        ctx.fillStyle = C.strike;
        ctx.fillText(X.prior_rate, COL_X, rowTop + base);
        const strike = eio(seg(L, 3.3, 3.75));
        if (strike > 0) {
          ctx.fillStyle = C.strike;
          ctx.beginPath();
          ctx.roundRect(COL_X - 6, rowTop + rateN.size * 0.52, (priorW + 12) * strike, 9, 5);
          ctx.fill();
        }
        let x = COL_X + priorW + 34;
        font(arrow);
        ctx.fillStyle = C.mute;
        ctx.fillText("→", x, rowTop + base);
        x += ctx.measureText("→").width + 34;
        const nr = eo(seg(L, 3.8, 4.3));
        if (nr > 0) {
          ctx.save();
          ctx.globalAlpha *= nr;
          font(rateN);
          ctx.fillStyle = C.teal;
          ctx.fillText(X.current_rate, x, rowTop + base + (1 - nr) * 30);
          ctx.restore();
        }
      });
    },
    play(L, frame, idx) {
      let y = 430;
      const eb = `[ ${eyebrows.play} // MY TAX PERSONALITY ]`;
      enter(L, 0.1, 0.6, "fade", () => text(S.eyebrow, eb, COL_X, y));
      y += height(S.eyebrow, eb) + 36;
      decrypt(L, 0.3, 1.2, 0 * 13 + idx * 31 + 5, frame, (s) => text(playH1, s, COL_X, y), personality);
      y += height(playH1, personality) + 60;
      enter(L, 1.6, 0.6, "fade", () => text(S.mono, "THE PLAYBOOK", COL_X, y));
      y += height(S.mono, "THE PLAYBOOK") + 18;
      recap.strategies_implemented.forEach((s, i) => {
        const rowTop = y + i * 76;
        enter(L, 1.9 + i * 0.45, 0.45, "left", () => {
          // the teal check box, then the strategy, centred in a 76px row
          const bx = COL_X;
          const by = rowTop + 18;
          ctx.fillStyle = C.teal;
          ctx.beginPath();
          ctx.roundRect(bx, by, 40, 40, 10);
          ctx.fill();
          ctx.strokeStyle = C.bg;
          ctx.lineWidth = 5;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(bx + 11.5, by + 20.5);
          ctx.lineTo(bx + 17.5, by + 26.5);
          ctx.lineTo(bx + 29, by + 12);
          ctx.stroke();
          const { line } = metrics(chk);
          text(chk, s, bx + 40 + 26, rowTop + (76 - line) / 2);
        });
      });
    },
    cta(L) {
      let y = 450;
      const eb = `[ ${eyebrows.cta} // WANT YOURS? ]`;
      enter(L, 0.1, 0.6, "fade", () => text(S.eyebrow, eb, COL_X, y));
      y += height(S.eyebrow, eb) + 40;
      const h2 = "Want your taxes\nDeCyphered too?";
      enter(L, 0.3, 0.6, "up", () => text(S.h2, h2, COL_X, y));
      y += height(S.h2, h2) + 60;
      const boxTop = y;
      const boxH = 44 + height(offer1, handle) + 14 + height(offer2, "x") + 44;
      enter(L, 1.0, 0.6, "up", () => {
        ctx.fillStyle = C.mag;
        ctx.beginPath();
        ctx.roundRect(COL_X, boxTop, COL_W, boxH, 28);
        ctx.fill();
        const t1 = boxTop + 44;
        text(offer1, handle, COL_X + 48, t1);
        text(offer2, "Accounting for creators", COL_X + 48, t1 + height(offer1, handle) + 14);
      });
      y += boxH + 44;
      enter(L, 1.8, 0.6, "fade", () => text(S.mono, "WEDECYPHER.CO", COL_X, y, C.ink));
    },
  };

  function seek(t: number) {
    const frame = Math.floor(t * 24);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
    rain(t);
    radial(540 + Math.sin(t * 0.35) * 90, 900 + Math.cos(t * 0.27) * 70, 750, [
      [0, "rgba(255,45,120,.30)"],
      [0.55, "rgba(255,45,120,.08)"],
      [0.75, "rgba(255,45,120,0)"],
    ]);
    chrome();
    ids.forEach(([id], idx) => {
      const { start, end } = T[id];
      const L = t - start;
      const last = idx === ids.length - 1;
      const first = idx === 0;
      if (t < start - 0.001 || (t > end && !last)) return;
      const fin = first ? 1 : seg(t, start, start + 0.28);
      const fout = last ? 1 : 1 - seg(t, end - 0.3, end);
      const alpha = Math.min(fin, fout);
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(0, (1 - fout) * -40);
      scenes[id](L, frame, idx);
      ctx.restore();
    });
    ctx.restore();
  }

  return { duration, seek };
}
