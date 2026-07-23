import { NextRequest, NextResponse } from "next/server";
import {
  ApplicationStoreError,
  recordDelivery,
  saveApplication,
} from "@/lib/application-store";
import { SlackError, postApplicationToSlack } from "@/lib/slack";
import {
  RESUME_EXTENSIONS,
  RESUME_MAX_BYTES,
  type Application,
  type ResumeMeta,
} from "@/lib/application";

/**
 * Careers application capture: records the applicant (resume included), then
 * notifies #recruiting in Slack. Modelled on /api/lead — same order, same
 * reasons.
 *
 * POST multipart/form-data { application: <json>, resume?: <file> }
 *   → { recorded, notified }
 *
 * Multipart rather than JSON because the resume rides along as a real file.
 * The `application` part is a JSON blob of the Application fields; the form
 * builds it from the same interface, so the two ends can't drift silently.
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

// `<>|` are excluded on top of whitespace: these values get wrapped in Slack's
// <mailto:…> / <url> link syntax, and those three characters are how a crafted
// value would break out of the link to inject `<!channel>`. Forbidding them at
// validation is cleaner than escaping (escaping a URL corrupts `&` in queries).
const EMAIL_RE = /^[^\s@<>|]+@[^\s@<>|]+\.[^\s@<>|]+$/;
// A link we'll show the client as clickable — require a real http(s) URL rather
// than accept "my linkedin" as a link. Keep it lenient beyond the scheme.
const URL_RE = /^https?:\/\/[^\s.<>|]+\.[^\s<>|]+$/i;

// Free text is stored and re-rendered, so cap it: nobody's cover note needs a
// megabyte, and the whole doc has to stay under Firestore's 1MiB ceiling to
// leave room for the resume chunks' parent.
const SHORT_MAX = 300;
const LONG_MAX = 4000;

const str = (v: unknown, max = SHORT_MAX) =>
  (typeof v === "string" ? v.trim() : "").slice(0, max);
const yesNo = (v: unknown) => (typeof v === "boolean" ? v : null);
const strArr = (v: unknown, max = 20) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, SHORT_MAX))
        .filter(Boolean)
        .slice(0, max)
    : [];

/** Narrows the parsed JSON to an Application, or explains what's wrong. */
function parseApplication(
  a: Partial<Application> | undefined,
): { application: Application } | { error: string } {
  if (!a || typeof a !== "object") return { error: "application is required" };

  // role/department come from the job, not the applicant — but a submission
  // with no role is a bug worth rejecting rather than filing something blank.
  if (!str(a.role)) return { error: "role is required" };

  const required: [keyof Application, string][] = [
    ["name", "name"],
    ["email", "email"],
    ["phone", "phone"],
    ["location", "location"],
    ["heardAbout", "how you heard about us"],
    ["employmentType", "employment type"],
    ["experience", "years of experience"],
    ["desiredComp", "desired compensation"],
    ["startDate", "earliest start date"],
    ["whyUs", "why DeCypher"],
    ["ownershipStory", "the ownership question"],
    ["boringWork", "the boring-work question"],
    ["availability", "weekly availability"],
  ];
  const missing = required.filter(([k]) => !str(a[k])).map(([, label]) => label);
  if (missing.length) return { error: `Missing: ${missing.join(", ")}` };

  const email = str(a.email);
  if (!EMAIL_RE.test(email)) return { error: "Invalid email." };

  const linkedin = str(a.linkedin);
  if (linkedin && !URL_RE.test(linkedin)) {
    return { error: "LinkedIn must be a full URL (https://…)." };
  }

  for (const k of [
    "remoteCameras",
    "internet",
    "backgroundCheck",
    "workAuth",
    "needsSponsorship",
  ] as const) {
    if (yesNo(a[k]) === null) {
      return { error: "Please answer every yes/no question." };
    }
  }

  return {
    application: {
      role: str(a.role),
      department: str(a.department),
      name: str(a.name),
      email,
      phone: str(a.phone, 40),
      location: str(a.location),
      linkedin,
      heardAbout: str(a.heardAbout, 60),
      employmentType: str(a.employmentType, 60),
      experience: str(a.experience, 60),
      currentRole: str(a.currentRole),
      desiredComp: str(a.desiredComp),
      startDate: str(a.startDate),
      tools: strArr(a.tools),
      handled: strArr(a.handled),
      whyUs: str(a.whyUs, LONG_MAX),
      ownershipStory: str(a.ownershipStory, LONG_MAX),
      boringWork: str(a.boringWork, LONG_MAX),
      availability: str(a.availability),
      remoteCameras: yesNo(a.remoteCameras),
      internet: yesNo(a.internet),
      backgroundCheck: yesNo(a.backgroundCheck),
      workAuth: yesNo(a.workAuth),
      needsSponsorship: yesNo(a.needsSponsorship),
      conflicts: str(a.conflicts, LONG_MAX),
      message: str(a.message, LONG_MAX),
    },
  };
}

const RESUME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Validate the uploaded file and pull its bytes. The content type is derived
 * from the extension, not trusted from the client — it's echoed back verbatim
 * as a response header by the portal's download route.
 */
async function parseResume(
  file: FormDataEntryValue | null,
): Promise<{ resume: { meta: ResumeMeta; bytes: Buffer } } | { error: string }> {
  if (!file) return { error: "Please attach your resume." };
  if (typeof file === "string") return { error: "resume must be a file" };

  const ext = RESUME_EXTENSIONS.find((e) =>
    file.name.toLowerCase().endsWith(e),
  );
  if (!ext) return { error: "Resume must be a PDF or Word document." };
  if (file.size > RESUME_MAX_BYTES) {
    return { error: "Resume is too large — 4MB max." };
  }
  if (file.size === 0) return { error: "That resume file is empty." };

  // Keep the filename recognisable but inert: it round-trips into a
  // Content-Disposition header on download, so strip anything exotic.
  const filename =
    (file.name.replace(/\.[^.]*$/, "").replace(/[^\w. \-()]/g, "").trim() ||
      "resume") + ext;

  return {
    resume: {
      meta: { filename, contentType: RESUME_TYPES[ext], size: file.size },
      bytes: Buffer.from(await file.arrayBuffer()),
    },
  };
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  let json: unknown;
  try {
    json = JSON.parse(String(form.get("application") ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid application JSON." }, { status: 400 });
  }

  const parsed = parseApplication(json as Partial<Application>);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { application } = parsed;

  const parsedResume = await parseResume(form.get("resume"));
  if ("error" in parsedResume) {
    return NextResponse.json({ error: parsedResume.error }, { status: 400 });
  }
  const { resume } = parsedResume;

  // Record first — see the file header.
  let appId: string | null = null;
  try {
    const saved = await saveApplication(application, resume);
    if (saved !== "skipped") appId = saved.id;
  } catch (e) {
    console.error(
      `[apply] NOT RECORDED — ${application.email}:`,
      e instanceof ApplicationStoreError ? e.message : e,
    );
  }

  let notified = false;
  try {
    notified =
      (await postApplicationToSlack(application, Boolean(resume))) === "sent";
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
