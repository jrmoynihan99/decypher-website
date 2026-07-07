import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const OUT = "C:/Users/moyni/AppData/Local/Temp/claude/c--Users-moyni-Documents-Github-decypher-website/76981c3f-66b9-446f-8d4d-ed0d0e90b8d9/scratchpad";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// slow the wipe hugely so page A sits under it, mostly un-wiped, for a while
await page.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = `
    html[data-page-transition="wipe"]::view-transition-old(root),
    html[data-page-transition="wipe"]::view-transition-new(root),
    html[data-page-transition="wipe"]::view-transition-group(scanline){animation-duration:8s !important;}`;
  (document.head || document.documentElement).appendChild(s);
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500); // let NeuralWeb paint & settle
await page.screenshot({ path: `${OUT}/out_A_clean.png` });
console.log("saved out_A_clean (page A before leaving)");

// leave page A -> /team
await page.click('a[href="/team"]');
const start = Date.now();
for (const target of [400, 1200, 2500]) {
  const wait = target - (Date.now() - start);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/out_wipe_${target}.png` });
  console.log("saved out_wipe_" + target);
}
await browser.close();
