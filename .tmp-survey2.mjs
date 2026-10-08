// Throwaway verify driver (deleted after the run). Bare links = test data, cleared after.
import { chromium } from "playwright";

const OUT = process.env.SHOTS;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
const shot = (n) => page.screenshot({ path: `${OUT}/s2-${n}.png` });
const info = {};

try {
  await page.goto("http://localhost:3100/feedback?s=tax", { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(2600);
  info.layers = await page.evaluate(() => ({
    canvas: document.querySelectorAll("canvas").length,
    orbs: document.querySelectorAll(".animate-glow-drift").length,
  }));
  // hover scramble armed? (armHover splits the heading into per-letter spans)
  const h1 = page.locator("h1").first();
  info.introSpans = await h1.locator("span span").count();
  const box = await h1.boundingBox();
  const letter = h1.locator("span span").nth(3); const lb = await letter.boundingBox(); await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.waitForTimeout(90);
  await shot("01-intro-hover");
  info.hoverColor = await page.evaluate(() => [...document.querySelectorAll("h1 span span")].map((s) => s.style.color).find(Boolean) || "none");

  await page.fill("#fb-name", "ZZ Verify Client");
  await page.getByRole("button", { name: "Start the survey" }).click();
  await page.waitForTimeout(1600);
  await shot("02-q1");
  const g = () => page.getByRole("radiogroup").last().locator("[role=radio]");
  await g().nth(4).click(); // CSAT 5 → auto-advance (the step change that crashed)
  await page.waitForTimeout(1800);
  await g().nth(10).click(); // NPS 10
  await page.waitForTimeout(1800);
  await shot("03-q3-teal");
  await page.locator("textarea").fill("Clear and fast.");
  await page.locator("main nav button", { hasText: /^Next$/ }).click();
  await page.waitForTimeout(1200);
  await g().nth(4).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Send feedback/ }).click();
  await page.waitForTimeout(3500);
  const ask = page.locator("h1").first();
  const ab = await ask.boundingBox();
  await page.mouse.move(ab.x + 40, ab.y + 20);
  await page.waitForTimeout(90);
  await shot("04-ask-hover");
} catch (e) {
  errors.push("driver: " + e.message.split("\n")[0]);
  await shot("zz-failure");
}
console.log(JSON.stringify({ info, errors }, null, 1));
await browser.close();
