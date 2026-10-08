/**
 * Browser-side "give the person a file" helpers, shared by the portal tools
 * that hand a client something to keep: the S-corp summary, the accountable
 * plan policy, the reimbursement tracker, the backups.
 *
 * The print and download helpers touch `document` and only run in the
 * browser; escapeHtml and safeFileBase are pure, and the accountable-plan
 * engine uses them on the server too. Nothing here may run on import.
 */

/**
 * Print a standalone HTML document without leaving the page.
 *
 * The tools these documents come from are mid-call, screen-shared, holding
 * unsaved state — so printing can't mean navigating away, opening a popup
 * (blocked often enough to be unreliable), or `window.print()` on the portal
 * itself, which would need print CSS hiding every other surface in the app.
 * A throwaway iframe holding just the document is all three avoided: the
 * browser's print dialog sees a clean page, "Save as PDF" included.
 *
 * Kept off-screen rather than `display:none` — Firefox prints an undisplayed
 * frame as a blank page. Waits for the document's own fonts (the signature
 * face, the brand faces) so the PDF isn't set in a fallback.
 */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:820px;height:1100px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };

  const ready = new Promise<void>((resolve) => {
    if (doc.readyState === "complete") resolve();
    else win.addEventListener("load", () => resolve(), { once: true });
  })
    .then(() => doc.fonts?.ready)
    .catch(() => undefined);
  // A font CDN that never answers mustn't hold the dialog hostage.
  const cap = new Promise((r) => setTimeout(r, 2500));

  void Promise.race([ready, cap]).then(() => {
    win.addEventListener("afterprint", () => setTimeout(cleanup, 100), { once: true });
    win.focus();
    win.print();
    // Chrome's print() returns once the dialog closes; Safari may not fire
    // afterprint at all. Either way the frame goes eventually.
    setTimeout(cleanup, 60_000);
  });
}

/** Download a Blob (or a string) under the given filename. */
export function downloadFile(
  data: Blob | string,
  filename: string,
  mime = "application/octet-stream",
): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a later tick: doing it in the same task can beat Safari's
  // download starting.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Escape text for interpolation into an HTML string. */
export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/** A filesystem-safe base name from a client or business name. */
export function safeFileBase(name: string, fallback: string): string {
  const base = name.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  return base || fallback;
}
