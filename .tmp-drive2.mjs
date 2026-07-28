import { chromium } from "playwright";

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 950 } });
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));
p.on("console", (m) => {
  if (m.type() === "error") console.log("[console]", m.text().slice(0, 300));
});

await p.goto("http://localhost:3100/schedule-team?confirmed", {
  waitUntil: "domcontentloaded",
});
await p.waitForTimeout(5000);

console.log("h1/h2 text:", await p.locator("h1, h2").allInnerTexts());
console.log("iframes:", await p.locator("iframe").count());
console.log("unmute buttons:", await p.locator('button[aria-label^="Unmute"]').count());
console.log("play buttons:", await p.locator('button[aria-label^="Play"]').count());
console.log("has #videos:", await p.locator("#videos").count());
console.log(
  "AWAITING placeholder present:",
  (await p.content()).includes("AWAITING_VIDEO") ||
    (await p.content()).includes("AWAITING"),
);
await p.screenshot({
  path: `${process.env.SHOT_DIR}/debug-thankyou.png`,
  fullPage: false,
});
await browser.close();
