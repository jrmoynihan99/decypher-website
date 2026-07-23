import { NextRequest, NextResponse } from "next/server";
import {
  ApplicationStoreError,
  recordDelivery,
  saveApplication,
} from "@/lib/application-store";
import { SlackError, postApplicationToSlack } from "@/lib/slack";
import type { Application } from "@/lib/application";

/**
 * Careers application capture: records the applicant, then notifies #recruiting
 * in Slack. Modelled on /api/lead — same order, same reasons.
 *
 * POST { application } → { recorded, notified }
 *
 * Record before notifying: Slack is a droppable delivery, Firestore is the copy
 * that has to survive. A store failure still lets the Slack post proceed; a
 * Slack failure still leaves the applicant recorded. Neither cancels the other.
 *
 * Public and unauthenticated — it's behind a public form, so it's spammable.
 * Free-text reaching Slack is escaped in lib/slack (a name can't @channel the
 * team). If volume becomes a problem the answer is rate limiting or a captcha.
 */

export const dynamic = "force-dynamic";

interface ApplyRequest {
  application?: Partial<Application>;
}

// `<>|` are excluded on top of whitespace: these values get wrapped in Slack's
// <mailto:…> / <url> link syntax, and those three characters are how a crafted
// value would break out of the link to inject `<!channel>`. Forbidding them at
// validation is cleaner than escaping (escaping a URL corrupts `&` in queries).
const EMAIL_RE = /^[^\s@<>|]+@[^\s@<>|]+\.[^\s@<>|]+$/;
// A link we'll show the client as clickable — require a real http(s) URL rather
// than accept "my linkedin" as a resume. Keep it lenient beyond the scheme.
const URL_RE = /^https?:\/\/[^\s.<>|]+\.[^\s<>|]+$/i;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Narrows the request to an Application, or explains what's wrong with it. */
function parseApplication(
  a: Partial<Application> | undefined,
): { application: Application } | { error: string } {
  if (!a || typeof a !== "object") return { error: "application is required" };

  const name = str(a.name);
  const email = str(a.email);
  const link = str(a.link);
  const role = str(a.role);

  // role/department come from the card, not the applicant — but a submission
  // with no role is a bug worth rejecting rather than filing something blank.
  if (!role) return { error: "role is required" };
  if (!name || !email || !link) {
    const missing = (["name", "email", "link"] as const).filter((k) => !str(a[k]));
    return { error: `Missing: ${missing.join(", ")}` };
  }
  if (!EMAIL_RE.test(email)) return { error: "Invalid email." };
  if (!URL_RE.test(link)) return { error: "Link must be a full URL (https://…)." };

  return {
    application: {
      role,
      department: str(a.department),
      name,
      email,
      link,
      message: str(a.message),
    },
  };
}

export async function POST(req: NextRequest) {
  let body: ApplyRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseApplication(body.application);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { application } = parsed;

  // Record first — see the file header.
  let appId: string | null = null;
  try {
    const saved = await saveApplication(application);
    if (saved !== "skipped") appId = saved.id;
  } catch (e) {
    console.error(
      `[apply] NOT RECORDED — ${application.email}:`,
      e instanceof ApplicationStoreError ? e.message : e,
    );
  }

  let notified = false;
  try {
    notified = (await postApplicationToSlack(application)) === "sent";
  } catch (e) {
    console.error(
      `[apply] Slack notification failed for ${application.email}:`,
      e instanceof SlackError ? e.message : e,
    );
  }

  if (appId) await recordDelivery(appId, { notified });

  // Unlike the lead flow there's no applicant email, so nothing the visitor was
  // promised can fail here. As long as the request was well-formed, they get a
  // success — a Slack or store hiccup is ours to chase in the logs, not theirs.
  return NextResponse.json({ recorded: appId !== null, notified });
}
