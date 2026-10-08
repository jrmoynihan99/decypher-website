/**
 * The survey's hand-written styles and colour maths — the parts Tailwind
 * utilities can't reach: keyframes, `:hover` cascades into SVG children, the
 * QR's per-module rules, staggered transition delays.
 *
 * Injected as one <style> block by FeedbackSurvey (the recap page does the
 * same for its print rule) and namespaced `fb-` so nothing leaks. The colours
 * are the brand tokens' values (--color-magenta, --color-teal, --color-night,
 * --color-tier-warn): the public site is dark-only, so they never re-bind
 * under this page, and JS needs real hex to interpolate between them.
 */

export const MAGENTA = "#ff2d78";
export const TEAL = "#3dd6c4";
export const NIGHT = "#0a0a0e";

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` → `b` at `t` (0..1), as "r,g,b". */
export function mixRgb(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",");
}

export const finePointer = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export const SURVEY_CSS = `
.fb-enter{animation:fb-rise .34s cubic-bezier(.2,.7,.2,1) both}
/* the site's hover scramble, on the magenta slide (see Headline) */
.fb-ink span{color:inherit!important;text-shadow:0 0 18px rgba(255,255,255,.6)!important}
@keyframes fb-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

.fb-nudge{animation:fb-nudge .42s cubic-bezier(.3,.7,.4,1)}
.fb-nudge input{border-color:${MAGENTA}!important}
@keyframes fb-nudge{20%{transform:translateX(-7px)}45%{transform:translateX(6px)}70%{transform:translateX(-3px)}100%{transform:none}}

/* the review button */
.fb-review{transform:translate(var(--mx,0px),var(--my,0px));transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .3s}
.fb-review:hover{box-shadow:0 20px 44px rgba(10,10,14,.42)}
.fb-review::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(105deg,transparent 30%,rgba(255,45,120,.38) 48%,rgba(61,214,196,.22) 56%,transparent 72%);transform:translateX(-110%);transition:transform .9s cubic-bezier(.2,.7,.2,1)}
.fb-review:hover::before,.fb-review:focus-visible::before{transform:translateX(110%)}
.fb-review:focus-visible{outline:3px solid #fff;outline-offset:3px}
.fb-stars svg{fill:transparent;stroke:rgba(255,255,255,.35);stroke-width:1.6;stroke-linejoin:round;transition:fill .25s,stroke .25s,transform .35s cubic-bezier(.3,1.6,.5,1);transition-delay:calc(var(--i)*70ms)}
.fb-review.fb-lit .fb-stars svg,.fb-review:hover .fb-stars svg{fill:var(--color-tier-warn);stroke:var(--color-tier-warn)}
.fb-review:hover .fb-stars svg{transform:translateY(-2px) scale(1.12)}
.fb-review.fb-sent .fb-stars svg{animation:fb-starpop .6s cubic-bezier(.3,1.6,.5,1) both;animation-delay:calc(var(--i)*60ms);fill:${TEAL};stroke:${TEAL}}
@keyframes fb-starpop{0%{transform:scale(1)}40%{transform:scale(1.55) rotate(18deg)}100%{transform:scale(1)}}
.fb-arrow{background:${MAGENTA};color:${NIGHT};transition:transform .35s cubic-bezier(.3,1.5,.5,1),background-color .3s}
.fb-review:hover .fb-arrow{transform:translate(3px,-3px) scale(1.06)}
.fb-review.fb-sent .fb-arrow{background:${TEAL}}

/* the QR card */
.fb-qr{transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .45s cubic-bezier(.2,.7,.2,1)}
.fb-qr rect.fb-m{fill:transparent;transform-box:fill-box;transform-origin:center}
.fb-qr rect.fb-m[data-d="1"]{fill:${NIGHT}}
.fb-qr .fb-scan{fill:${MAGENTA};opacity:0}
.fb-qr.fb-decoding .fb-scan{opacity:.9;filter:drop-shadow(0 0 .6px ${MAGENTA})}
.fb-qr .fb-badge{transform-box:fill-box;transform-origin:center;transition:transform .5s cubic-bezier(.3,1.6,.5,1)}
.fb-qr.fb-decoding .fb-badge{transform:scale(0)}
.fb-qr.fb-locked rect.fb-f[data-d="1"]{animation:fb-lockflash .9s ease-out both}
@keyframes fb-lockflash{0%{fill:${MAGENTA}}100%{fill:${NIGHT}}}
.fb-qr rect.fb-m.fb-rip{animation:fb-rip .62s cubic-bezier(.3,.7,.3,1) both;animation-delay:var(--dl,0ms)}
@keyframes fb-rip{0%{transform:scale(1)}35%{transform:scale(.35);fill:${MAGENTA}}100%{transform:scale(1);fill:${NIGHT}}}
.fb-corner{position:absolute;width:14px;height:14px;border:2px solid ${NIGHT};opacity:0;transition:transform .55s cubic-bezier(.3,1.5,.5,1),opacity .4s}
.fb-tl{top:0;left:0;border-right:0;border-bottom:0;border-radius:6px 0 0 0;transform:translate(-7px,-7px)}
.fb-tr{top:0;right:0;border-left:0;border-bottom:0;border-radius:0 6px 0 0;transform:translate(7px,-7px)}
.fb-bl{bottom:0;left:0;border-right:0;border-top:0;border-radius:0 0 0 6px;transform:translate(-7px,7px)}
.fb-br{bottom:0;right:0;border-left:0;border-top:0;border-radius:0 0 6px 0;transform:translate(7px,7px)}
.fb-qr-stage.fb-locked .fb-corner{opacity:1;transform:none;animation:fb-breathe 2.6s ease-in-out 1s infinite}
@keyframes fb-breathe{50%{opacity:.45}}

@media (prefers-reduced-motion: reduce){
  .fb-root *{transition:none!important}
  .fb-root .fb-sel{transform:none!important}
}
`;
