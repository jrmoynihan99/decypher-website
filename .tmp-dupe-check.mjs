import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const log = (...a) => console.log(...a);

await page.goto("http://localhost:3100/schedule-team", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);

await page.fill("#s-name", "Verify Bot");
const band = page.locator("#s-band");
if (await band.count()) await band.selectOption({ index: 3 });
await page.fill("#s-phone", "5551234567");
await page.getByRole("button", { name: /available times/i }).click();
await page.waitForTimeout(8000);

const slot = page.getByRole("button").filter({ hasText: /\d{1,2}:\d{2}\s*(AM|PM)/i });
if (!(await slot.count())) { log("no slots"); await browser.close(); process.exit(1); }
await slot.first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Next →" }).click();
await page.waitForTimeout(1400);

await page.fill("#s-email", "verify@example.com");
const row = page.locator("label").filter({ hasText: /show up to the meeting on time/i }).first();
await row.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);

// spam it the way a confused user does — 7 clicks, ending checked
for (let i = 0; i < 7; i++) {
  await row.click();
  await page.waitForTimeout(120);
}
log("checked after 7 rapid clicks:", await row.locator("input").isChecked());

// fill everything else so submit isn't blocked
const blocks = page.locator("#s-email").locator("xpath=../..").locator("> div > div");
const count = await blocks.count();
for (let i = 0; i < count; i++) {
  const b = blocks.nth(i);
  const ta = b.locator("textarea");
  if (await ta.count()) { await ta.fill("verification text"); continue; }
  const inputs = b.locator('input[type="radio"], input[type="checkbox"]');
  if (await inputs.count()) {
    const first = inputs.first();
    if (!(await first.isChecked())) await first.click();
    continue;
  }
  const txt = b.locator('input[type="text"], input[type="tel"]');
  if ((await txt.count()) && !(await txt.first().inputValue())) await txt.first().fill("5551234567");
}

// also spam a multi-select that has several picks, to check two picks coexist
await page.waitForTimeout(400);

let payload = null;
await page.route("**/api/booking", async (route) => {
  if (route.request().method() === "POST") { payload = route.request().postDataJSON(); await route.abort(); }
  else await route.continue();
});
await page.getByRole("button", { name: /Book my call/i }).click();
await page.waitForTimeout(2000);

if (!payload) { log("no POST captured"); await browser.close(); process.exit(1); }
log("\nPOST intercepted and ABORTED — nothing booked.\n");
const sep = String.fromCharCode(31);
let worst = 0;
for (const a of payload.answers) {
  const parts = a.answer.split(", ");
  const dupes = parts.length - new Set(parts).size;
  worst = Math.max(worst, dupes);
  log(`  [${a.position}] dup-parts=${dupes} sep=${a.answer.includes(sep)} :: ${JSON.stringify(a.answer.slice(0, 90))}`);
}
const showup = payload.answers.find((x) => /show up to the meeting on time/i.test(x.answer));
log("\ncopies of the show-up sentence:", (showup?.answer.match(/I will show up to the meeting on time/g) || []).length);
log("RESULT:", worst === 0 ? "PASS — no duplicated answer anywhere" : "FAIL");
await browser.close();
