"use client";

/**
 * View transitions can't capture a live <canvas> bitmap into their snapshot.
 * The element's box and CSS (borders, background) DO get captured, but the
 * pixels drawn by the 2D context live on a separate GPU layer that Chromium
 * drops from the `::view-transition-old/new(root)` image. So every canvas
 * effect — the neural-web backgrounds, the services atlas mesh, the wave
 * field — blanks out the instant a page transition starts, even though the
 * canvas is fully painted and still in the DOM.
 *
 * Fix: right before a transition, bake each canvas's current frame into its
 * own CSS background-image. Backgrounds ARE captured, so the frozen snapshot
 * shows the mesh instead of nothing. The leaving page unmounts moments later
 * so its baked canvases are thrown away; unfreeze() is only a safety net for
 * any canvas that happens to outlive the wipe.
 */

// Cap the baked image so toDataURL stays cheap at click time — the frozen
// frame only shows for the length of the wipe, so downscaling is invisible.
const MAX_DIM = 900;

export function freezeCanvasLayers(): void {
  if (typeof document === "undefined") return;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  document.querySelectorAll<HTMLCanvasElement>("canvas").forEach((c) => {
    if (!c.width || !c.height || c.dataset.vtFrozen) return;
    // The snapshot only captures the viewport, so a canvas that's fully
    // off-screen won't show in the wipe — skip the toDataURL cost for it.
    const r = c.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
    try {
      let src: HTMLCanvasElement = c;
      const scale = Math.min(1, MAX_DIM / Math.max(c.width, c.height));
      if (scale < 1) {
        const tmp = document.createElement("canvas");
        tmp.width = Math.max(1, Math.round(c.width * scale));
        tmp.height = Math.max(1, Math.round(c.height * scale));
        tmp.getContext("2d")?.drawImage(c, 0, 0, tmp.width, tmp.height);
        src = tmp;
      }
      const url = src.toDataURL("image/png");
      c.style.backgroundImage = `url("${url}")`;
      c.style.backgroundSize = "100% 100%";
      c.style.backgroundRepeat = "no-repeat";
      c.dataset.vtFrozen = "1";
    } catch {
      /* tainted canvas or lost context — nothing we can do, skip it */
    }
  });
}

export function unfreezeCanvasLayers(): void {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll<HTMLCanvasElement>("canvas[data-vt-frozen]")
    .forEach((c) => {
      c.style.backgroundImage = "";
      c.style.backgroundSize = "";
      c.style.backgroundRepeat = "";
      delete c.dataset.vtFrozen;
    });
}
