import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const errors = [];
const track = (page, label) => {
  page.on("pageerror", (e) => errors.push(`[${label}] ${e.message}`));
};

// ── desktop ─────────────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
track(page, "desktop");
await page.goto(`${BASE}/careers/senior-tax-accountant`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/20-header.png` });

// role file: sidebar + tabs + VSL
await page.locator("#role-file").scrollIntoViewIfNeeded();
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/21-role-file.png` });

// sticky check: scroll deep, sidebar card should pin at ~96px
await page.evaluate(() => window.scrollBy(0, 900));
await page.waitForTimeout(900);
const stickyTop = await page.evaluate(() => {
  const el = document.querySelector("#role-file .lg\\:sticky");
  return el ? Math.round(el.getBoundingClientRect().top) : null;
});
console.log("sticky sidebar top after deep scroll (expect ~96):", stickyTop);
await page.screenshot({ path: `${OUT}/22-sticky-mid-scroll.png` });

// switch to APPLICATION tab via the tab rail
await page.locator('[role="tab"]', { hasText: "APPLICATION" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/23-application-tab.png` });

// empty submit → inline errors, no network round trip
await page.locator("button", { hasText: "Submit application" }).click();
await page.waitForTimeout(400);
const errCount = await page.locator("text=Please enter").count();
console.log("validation errors on empty submit (expect 3):", errCount);
await page.screenshot({ path: `${OUT}/24-application-errors.png` });

// back to overview, then hero apply should flip the tab AND scroll down
await page.locator('[role="tab"]', { hasText: "OVERVIEW" }).click();
await page.waitForTimeout(400);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
await page.locator("header button", { hasText: "Apply for this role" }).click();
await page.waitForTimeout(1600);
const state = await page.evaluate(() => ({
  scrollY: Math.round(window.scrollY),
  formVisible: !!document.querySelector("#ap-name"),
}));
console.log("hero apply → scrolled:", state.scrollY > 200, "| form shown:", state.formVisible);
await page.screenshot({ path: `${OUT}/25-hero-apply-jump.png` });

// VSL click-to-play mounts the iframe
await page.goto(`${BASE}/careers/senior-tax-accountant`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.locator('button[aria-label^="Play:"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);
await page.locator('button[aria-label^="Play:"]').click();
await page.waitForTimeout(1200);
console.log("vsl iframe mounted:", (await page.locator("#role-file iframe").count()) === 1);
await page.close();

// ── no-VSL role: player absent ──────────────────────────────────────
const p2 = await browser.newPage({ viewport: { width: 1440, height: 950 } });
track(p2, "no-vsl");
await p2.goto(`${BASE}/careers/staff-bookkeeper`, { waitUntil: "networkidle" });
await p2.waitForTimeout(2200);
console.log(
  "no-VSL role hides player:",
  (await p2.locator('button[aria-label^="Play:"]').count()) === 0,
);
await p2.close();

// ── mobile ──────────────────────────────────────────────────────────
const mob = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
track(mob, "mobile");
await mob.goto(`${BASE}/careers/senior-tax-accountant`, { waitUntil: "networkidle" });
await mob.waitForTimeout(2800);
console.log(
  "mobile no horizontal overflow:",
  await mob.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  ),
);
await mob.locator("#role-file").scrollIntoViewIfNeeded();
await mob.waitForTimeout(1600);
await mob.screenshot({ path: `${OUT}/26-mobile-role-file.png` });
// panel should come before the sidebar on mobile
const order = await mob.evaluate(() => {
  const grid = document.querySelector("#role-file .grid");
  const kids = grid ? [...grid.children] : [];
  const idx = (sel) => kids.findIndex((k) => k.querySelector(sel));
  return {
    tabsFirst:
      kids[0]?.getBoundingClientRect().top <= kids[1]?.getBoundingClientRect().top &&
      idx('[role="tablist"]') >= 0,
    tablistY: Math.round(
      document.querySelector('[role="tablist"]')?.getBoundingClientRect().top ?? -1,
    ),
    sidebarY: Math.round(
      document.querySelector("dl")?.getBoundingClientRect().top ?? -1,
    ),
  };
});
console.log("mobile order (tabs above sidebar):", order.tablistY < order.sidebarY);
await mob.locator('[role="tab"]', { hasText: "APPLICATION" }).tap();
await mob.waitForTimeout(800);
await mob.screenshot({ path: `${OUT}/27-mobile-application.png` });
await mob.close();

await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
