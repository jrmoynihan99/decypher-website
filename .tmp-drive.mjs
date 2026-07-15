import { chromium } from "playwright";

const OUT =
  "C:/Users/moyni/AppData/Local/Temp/claude/c--Users-moyni-Documents-Github-decypher-website/faa08589-d4b3-4f60-b503-dc64e8d83ad0/scratchpad";
const URL = "http://localhost:3100/schedule";

// the hero 2x2 is the only grid whose cells carry a right-rule via the
// nth-child arbitrary variant — tag it off the section instead of a class probe
const HERO_GRID = "section:first-of-type div[class*='nth-child']";

const browser = await chromium.launch();

// fail loudly if any stylesheet 404s — a stale server serves an unstyled page
// and every layout assertion below silently becomes meaningless
function watchAssets(page, label) {
  const bad = [];
  page.on("response", (r) => {
    if (r.status() >= 400 && /\.(css|js)$/.test(new URL(r.url()).pathname))
      bad.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  return () => {
    if (bad.length) console.log(`!! ${label} FAILED ASSETS:`, bad);
    else console.log(`   ${label}: all css/js 200`);
  };
}

for (const width of [1024, 1280, 1600]) {
  const page = await browser.newPage({ viewport: { width, height: 950 } });
  const report = watchAssets(page, `@${width}`);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  report();

  await page.screenshot({ path: `${OUT}/hero-${width}.png` });

  const cells = await page.evaluate((sel) => {
    const grid = document.querySelector(sel);
    if (!grid) return "NO HERO GRID";
    const gr = grid.getBoundingClientRect();
    return {
      gridW: Math.round(gr.width),
      visible: gr.height > 0,
      cells: [...grid.children].map((c) => {
        const num = c.querySelector("number-flow-react");
        const label = c.querySelector("span.font-mono");
        return {
          numText: num?.textContent.trim(),
          numW: num ? Math.round(num.getBoundingClientRect().width) : null,
          cellInnerW: Math.round(c.clientWidth),
          labelLines: label
            ? Math.round(
                label.getBoundingClientRect().height /
                  parseFloat(getComputedStyle(label).lineHeight),
              )
            : null,
          overflows: c.scrollWidth > c.clientWidth + 1,
        };
      }),
    };
  }, HERO_GRID);
  console.log(`=== ${width} hero 2x2 ===`);
  console.log(JSON.stringify(cells, null, 1));

  const standalone = await page.evaluate(() => {
    const s = document.querySelector("#proof");
    if (!s) return "not in DOM";
    return {
      wrapDisplay: getComputedStyle(s.parentElement).display,
      renderedHeight: Math.round(s.getBoundingClientRect().height),
    };
  });
  console.log(`standalone #proof @${width} (want display:none, h=0):`, JSON.stringify(standalone));

  const closing = await page.evaluate(() => {
    const secs = [...document.querySelectorAll("main section")].filter(
      (s) => s.getBoundingClientRect().height > 0,
    );
    const last = secs[secs.length - 1];
    return last?.querySelector("h2,h1")?.textContent?.trim() ?? "(no heading)";
  });
  console.log(`closing section @${width}:`, JSON.stringify(closing), "\n");

  await page.close();
}

// ── mobile ──────────────────────────────────────────────────────
const m = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mReport = watchAssets(m, "@390");
await m.goto(URL, { waitUntil: "networkidle" });
await m.waitForTimeout(3000);
mReport();
await m.screenshot({ path: `${OUT}/hero-390-top.png` });

console.log("=== 390 ===");
console.log(
  "hero 2x2 rendered (want false):",
  await m.evaluate((sel) => {
    const g = document.querySelector(sel);
    return g ? getComputedStyle(g).display !== "none" : "not in DOM";
  }, HERO_GRID),
);
console.log(
  "no horizontal overflow (want true):",
  await m.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  ),
);

await m.locator("#proof").scrollIntoViewIfNeeded();
await m.waitForTimeout(2200);
await m.screenshot({ path: `${OUT}/hero-390-stats.png` });
console.log(
  "standalone #proof @390:",
  JSON.stringify(
    await m.evaluate(() => {
      const s = document.querySelector("#proof");
      return {
        h: Math.round(s.getBoundingClientRect().height),
        nums: [...s.querySelectorAll("number-flow-react")].map((n) =>
          n.textContent.trim(),
        ),
      };
    }),
  ),
);

await m.close();

// ── home stats: the `block` numeral fix lands on the card variant too ──
const h = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const hReport = watchAssets(h, "home@1440");
await h.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await h.waitForTimeout(2500);
hReport();
await h.locator("#proof").scrollIntoViewIfNeeded();
await h.waitForTimeout(2200);
await h.screenshot({ path: `${OUT}/home-stats-1440.png` });
console.log(
  "\nhome #proof cards:",
  JSON.stringify(
    await h.evaluate(() => {
      const g = document.querySelector("#proof div[class*='auto-fit']");
      return [...(g?.children ?? [])].map((c) => ({
        h: Math.round(c.getBoundingClientRect().height),
        labelInlineWithNum:
          c.querySelector("span.font-mono")?.getBoundingClientRect().top <
          c.querySelector("number-flow-react")?.getBoundingClientRect().bottom,
      }));
    }),
  ),
);
await h.close();

await browser.close();
