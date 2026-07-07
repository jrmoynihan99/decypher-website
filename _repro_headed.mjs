import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const OUT = "C:/Users/moyni/AppData/Local/Temp/claude/c--Users-moyni-Documents-Github-decypher-website/76981c3f-66b9-446f-8d4d-ed0d0e90b8d9/scratchpad";

// headed + GPU so canvas compositing matches a real browser
const browser = await chromium.launch({
  channel: "msedge",
  headless: false,
  args: ["--enable-gpu", "--use-gl=angle"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// slow the wipe so we can catch page A under it
await page.addInitScript(() => {
  const s = document.createElement("style");
  s.setAttribute("data-slow-wipe", "1");
  s.textContent = `
    html[data-page-transition="wipe"]::view-transition-old(root){animation-duration:4s !important;}
    html[data-page-transition="wipe"]::view-transition-new(root){animation-duration:4s !important;}
    html[data-page-transition="wipe"]::view-transition-group(scanline){animation-duration:4s !important;}`;
  const add = () => (document.head || document.documentElement).appendChild(s);
  if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/h_A_clean.png` });
console.log("saved h_A_clean");

await page.click('a[href="/team"]');
const start = Date.now();
for (const t of [150, 350, 600, 900, 1500]) {
  const wait = t - (Date.now() - start);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/h_wipe_${t}.png` });
  console.log("saved h_wipe_" + t);
}
await page.waitForTimeout(500);
await browser.close();
