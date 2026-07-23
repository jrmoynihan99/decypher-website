/**
 * Best-effort autofill from an uploaded resume — client side only.
 *
 * PDFs get their text pulled with pdfjs (lazy-imported so the ~300KB library
 * only loads once someone actually attaches a file) and mined with heuristics
 * for the contact basics: name, email, phone, location, LinkedIn. Word docs
 * are accepted for upload but skipped here — no docx parser is worth shipping
 * to the browser for a nice-to-have.
 *
 * Everything is wrapped so a weird or scanned PDF returns null rather than
 * breaking the form: autofill is a convenience, the applicant can always type.
 */

export interface ResumeGuess {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE =
  /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
const LINKEDIN_RE =
  /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%.]+/i;

// "City, ST" — the abbreviation is allowlisted so "Acme, Inc" can't match.
const STATE_ABBR =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const LOCATION_RE = new RegExp(
  `\\b([A-Z][A-Za-z.'-]+(?:[ -][A-Z][A-Za-z.'-]+){0,2}),\\s*(${STATE_ABBR})\\b`,
);

/** Lines that clearly aren't a person's name. */
const NOT_A_NAME =
  /\d|@|resume|curriculum|vitae|linkedin|www\.|http|profile|summary|objective|experience/i;

function guessName(lines: string[]): string | undefined {
  for (const raw of lines.slice(0, 8)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || line.length > 40 || NOT_A_NAME.test(line)) continue;
    const words = line.split(" ");
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Z][A-Za-z.'-]*$/.test(w))) continue;
    // ALL-CAPS headers are common; hand back Title Case either way.
    return words
      .map((w) =>
        w === w.toUpperCase()
          ? w.charAt(0) + w.slice(1).toLowerCase()
          : w,
      )
      .join(" ");
  }
  return undefined;
}

/** Extract what we can from a resume file, or null when nothing was readable. */
export async function extractResumeGuess(file: File): Promise<ResumeGuess | null> {
  if (!file.name.toLowerCase().endsWith(".pdf")) return null;

  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();

    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await task.promise;

    // Contact details live up top — two pages is plenty.
    const lines: string[] = [];
    for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str + " ";
        if (item.hasEOL) {
          lines.push(line.trim());
          line = "";
        }
      }
      if (line.trim()) lines.push(line.trim());
    }
    await task.destroy();

    const text = lines.join("\n");
    if (!text.trim()) return null; // scanned/image PDF — nothing to mine

    // pdfjs can split a word across items ("jane @doe.com"), so patterns that
    // can't contain spaces also get a pass over the de-spaced text.
    const squished = text.replace(/[ \t]/g, "");

    const guess: ResumeGuess = {};
    const email = text.match(EMAIL_RE) ?? squished.match(EMAIL_RE);
    if (email) guess.email = email[0];

    const phone = text.match(PHONE_RE);
    if (phone) guess.phone = phone[0].trim();

    const linkedin = text.match(LINKEDIN_RE) ?? squished.match(LINKEDIN_RE);
    if (linkedin) {
      guess.linkedin = /^https?:\/\//i.test(linkedin[0])
        ? linkedin[0]
        : `https://${linkedin[0].replace(/^www\./i, "www.")}`;
    }

    const location = text.match(LOCATION_RE);
    if (location) guess.location = `${location[1]}, ${location[2]}`;

    const name = guessName(lines);
    if (name) guess.name = name;

    return Object.keys(guess).length ? guess : null;
  } catch {
    return null;
  }
}
