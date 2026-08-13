/** Throwaway: drive the Money Allocator. Deleted after the run. */
import { readFileSync, mkdirSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { chromium } from "playwright";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
}
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const q = await getFirestore().collection("users").where("email", "==", "jrmoynihan99@gmail.com").get();
const custom = await getAuth().createCustomToken(q.docs[0].id);
const r = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) },
);
const value = await getAuth().createSessionCookie((await r.json()).idToken, { expiresIn: 3600000 });

const OUT = "C:/Users/moyni/AppData/Local/Temp/claude/c--Users-moyni-Documents-Github-decypher-website/122c5734-7c5f-4263-86dd-e69047af1444/scratchpad/shots";
mkdirSync(OUT, { recursive: true });
const jar = [{ name: "dcy_session", value, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await ctx.addCookies(jar);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") console.log(`  [console] ${m.text()}`); });

await page.goto("http://localhost:3145/portal/tax-strategy", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const cards = await page.locator("main button h2").allTextContents();
console.log(`launcher tools: ${JSON.stringify(cards)}`);
await page.screenshot({ path: `${OUT}/a0-launcher.png`, fullPage: true });

await page.getByRole("button", { name: /Money Allocator/ }).first().click();
await page.waitForTimeout(600);
console.log(`h1: ${await page.locator("h1").first().textContent()}`);
await page.screenshot({ path: `${OUT}/a1-breakdown.png`, fullPage: true });

const read = async () => ({
  ownerPay: await page.locator("text=/Owner pay/").first().isVisible(),
  taxDollars: await page.getByLabel("Taxes / Savings in dollars").inputValue(),
  opsDollars: await page.getByLabel("Business Ops & Growth in dollars").inputValue(),
  essentials: await page.getByLabel("Essentials in dollars").inputValue(),
  wealth: await page.getByLabel("Long-Term Wealth in dollars").inputValue(),
  ohcrap: await page.getByLabel("Oh Crap Fund in dollars").inputValue(),
});
console.log(`initial: ${JSON.stringify(await read())}`);

// 1. Dual entry: type dollars into Taxes, percent must follow.
await page.getByLabel("Taxes / Savings in dollars").fill("2500");
await page.waitForTimeout(250);
console.log(`tax pct after typing $2,500 on $10k income: ${await page.getByLabel("Taxes / Savings as a percent of income").inputValue()}`);

// 2. Percent entry: type a percent, dollars must follow.
await page.getByLabel("Long-Term Wealth as a percent of income").fill("20");
await page.locator("body").click();
await page.waitForTimeout(250);
console.log(`wealth dollars after typing 20%: ${await page.getByLabel("Long-Term Wealth in dollars").inputValue()}`);

// 3. Essentials is two-way with box 1.
await page.getByLabel("Essentials in dollars").fill("5000");
await page.locator("body").click();
await page.waitForTimeout(250);
console.log(`living expenses box after Essentials=$5,000: ${await page.getByLabel("Monthly living expenses").inputValue()}`);

// 4. Squeeze: push living up so the plan exceeds owner pay.
await page.getByLabel("Monthly living expenses").fill("6000");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/a2-squeeze.png`, fullPage: true });
console.log(`squeeze banner: ${await page.locator("text=/maxed out|exceed take-home/").first().textContent()}`);

// 5. Surplus: drop living AND the discretionary targets so the plan fits.
await page.getByLabel("Monthly living expenses").fill("1500");
await page.getByLabel("Long-Term Wealth as a percent of income").fill("5");
await page.getByLabel("Oh Crap Fund as a percent of income").fill("5");
await page.locator("body").click();
await page.waitForTimeout(400);
// income 10000, tax 25%, ops 25% -> owner pay 5000
// targets 1500 + 500 + 500 + 500 = 3000 -> 2000 spare
console.log(`surplus banner: ${await page.locator("text=/Surplus to assign/").first().textContent()}`);
console.log(`surplus figure: ${await page.locator("text=/Surplus to assign/").locator("xpath=../..").textContent()}`);

// 6. Custom fund.
await page.getByRole("button", { name: /Add a fund/ }).click();
await page.waitForTimeout(300);
await page.getByLabel("Fund name").fill("Travel");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/a3-custom-fund.png`, fullPage: true });
console.log(`fund card present: ${await page.getByLabel("Fund name").inputValue()}`);

// 7. Money map
await page.getByRole("button", { name: "Money map" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/a4-map.png`, fullPage: true });

// 8. Projection
await page.getByRole("button", { name: "Projection" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/a5-projection.png`, fullPage: true });
console.log(`projection hero: ${await page.locator(".font-display").filter({ hasText: /^\$/ }).first().textContent()}`);
await page.getByRole("button", { name: /13%/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/a6-projection-13.png`, fullPage: true });

// 9. Zero income — divide-by-zero guard
await page.getByRole("button", { name: "Breakdown" }).click();
await page.getByLabel("Monthly business income").fill("0");
await page.waitForTimeout(400);
console.log(`zero income, no crash. tax $: ${await page.getByLabel("Taxes / Savings in dollars").inputValue()}`);
await page.screenshot({ path: `${OUT}/a7-zero-income.png`, fullPage: true });

// mobile
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mob.addCookies(jar);
const mp = await mob.newPage();
await mp.goto("http://localhost:3145/portal/tax-strategy", { waitUntil: "networkidle" });
await mp.getByRole("button", { name: /Money Allocator/ }).first().click();
await mp.waitForTimeout(600);
await mp.getByRole("button", { name: "Money map" }).click();
await mp.waitForTimeout(400);
await mp.screenshot({ path: `${OUT}/a8-mobile-map.png`, fullPage: true });
console.log(`mobile overflow: ${await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)}px`);

await browser.close();
console.log("done");
process.exit(0);
