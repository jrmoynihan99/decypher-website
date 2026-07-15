---
name: verify
description: Build, run, and visually verify decypher-website changes end-to-end with Playwright screenshots.
---

# Verifying decypher-website changes

## Build + launch

```bash
npm run build            # needs .env.local (Sanity fetches at build time)
npx next start -p 3100   # port 3000 is often taken by the user's dev server — don't kill it
```

## Drive with Playwright

Playwright ships in devDependencies (chromium already installed). ESM scripts
must live inside the repo to resolve `playwright` — copy the script to the repo
root (e.g. `.tmp-drive.mjs`), run it, delete it.

```js
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
```

Gotchas:

- Reveal/decrypt animations take ~2–3s; `waitForTimeout(2800)` after `goto`
  (and ~1.5s after each `scrollIntoViewIfNeeded`) before screenshots, or
  headings capture mid-scramble.
- Content comes from Sanity — pages 404 if their page document doesn't exist
  in the dataset. Seed scripts live in `scripts/` (`seed-*.mjs` are additive;
  `migrate-to-sanity.mjs` OVERWRITES Studio edits — never run it casually).
- **Sanity edits don't show up after a rebuild**: `revalidate = 86400` keeps
  GROQ fetches in Next's persistent data cache (`.next/cache`), which survives
  `next build`. Purge like production does — POST `/api/revalidate` with
  `Authorization: Bearer $SANITY_REVALIDATE_SECRET` (from `.env.local`) and
  body `{"_type":"<pageType>","slug":{"current":"<slug>"}}` — or delete
  `.next/cache/fetch-cache`. The Sanity CDN also serves stale reads for ~60s
  after a write.
- Mobile check: `newPage({ viewport: { width: 390, height: 844 }, isMobile:
  true, hasTouch: true })` and assert
  `document.documentElement.scrollWidth <= clientWidth` (horizontal overflow
  is a recurring regression here).

## Flows worth driving

- `/schedule`: empty-submit → inline field errors; fill `#s-name` +
  `#s-email`, click "Request my call" → thank-you takeover replaces the hero
  ("See you in our call." header + click-to-play creator-video wall from the
  Video Testimonials collection; reviews reel then stats follow below). On
  mobile (390×844) the first video card must sit above the fold. A
  scroll-to-top button (`aria-label="Scroll back to top"`) appears bottom-right
  past ~0.8 viewports and must be display:none at the top (iOS 26 rule).
- `/careers`: header readout resolves `{count}`, job cards link to their
  `applyHref` (mailto), empty Openings collection shows the dashed empty state.
