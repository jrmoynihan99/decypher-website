import { chromium } from "playwright";

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();

/* ---------- desktop: home video section ---------- */
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto("http://localhost:3100/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

await page.locator("#video").scrollIntoViewIfNeeded();
await page.waitForTimeout(2000);

const btn = page.locator('#video button[aria-label^="Unmute"]');
const pill = btn.locator("> span").nth(1);
const box = await btn.boundingBox();
const readT = () => pill.evaluate((el) => getComputedStyle(el).transform);

console.log("pill @ rest:              ", await readT());
await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.25);
await page.waitForTimeout(900);
console.log("pill @ cursor top-right:  ", await readT());
await page.screenshot({ path: `${OUT}/1-home-magnet-tr.png` });

await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.78);
await page.waitForTimeout(900);
console.log("pill @ cursor bottom-left:", await readT());
await page.screenshot({ path: `${OUT}/2-home-magnet-bl.png` });

// click to unmute -> overlay removed, same iframe (no remount / no restart)
const iframe = page.locator("#video iframe");
const srcBefore = await iframe.getAttribute("src");
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.waitForTimeout(1500);
console.log("overlay removed after click:", (await btn.count()) === 0);
console.log("iframe src unchanged:       ", (await iframe.getAttribute("src")) === srcBefore);
await page.screenshot({ path: `${OUT}/3-home-unmuted.png` });

/* ---------- desktop: thank-you takeover ---------- */
const ty = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await ty.goto("http://localhost:3100/schedule-team?confirmed", { waitUntil: "domcontentloaded" });
await ty.waitForTimeout(4500);
const heroBtn = ty.locator('button[aria-label^="Unmute"]');
console.log("thankyou hero iframe src:", await ty.locator("iframe").first().getAttribute("src"));
console.log("thankyou hero unmute overlay:", await heroBtn.count());
await ty.screenshot({ path: `${OUT}/4-thankyou-hero.png` });

const wall = ty.locator("#videos");
await wall.scrollIntoViewIfNeeded();
await ty.waitForTimeout(2000);
console.log("wall iframes (want 0 until tapped):", await wall.locator("iframe").count());
console.log("wall play buttons:", await wall.locator('button[aria-label^="Play"]').count());
await ty.screenshot({ path: `${OUT}/5-thankyou-wall.png` });

/* ---------- mobile ---------- */
const m = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await m.goto("http://localhost:3100/", { waitUntil: "domcontentloaded" });
await m.waitForTimeout(3500);
await m.locator("#video").scrollIntoViewIfNeeded();
await m.waitForTimeout(2000);
console.log(
  "mobile overflow px:",
  await m.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  ),
);
const mPill = m.locator('#video button[aria-label^="Unmute"] > span').nth(1);
console.log("mobile pill style (want none — no magnet):", await mPill.getAttribute("style"));
await m.screenshot({ path: `${OUT}/6-mobile-home-video.png` });

await browser.close();
