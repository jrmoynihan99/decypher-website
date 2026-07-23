import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { readResume } from "@/lib/application-store";

/**
 * Serves an applicant's resume to the portal. The bytes live in Firestore
 * chunks (see lib/application-store — the project has no storage bucket), so
 * this route reassembles and streams them with the original filename. Gated
 * exactly like /api/portal/applications: resumes are PII and this URL is the
 * only way to reach them.
 *
 * `inline` disposition so PDFs open in the browser tab the portal launches;
 * Word documents download regardless, which is what you'd want anyway.
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Server missing Firebase credentials" },
      { status: 500 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  }
  if (!session.permissions.includes("applications")) {
    return NextResponse.json(
      { ok: false, message: "No access to applications" },
      { status: 403 },
    );
  }

  const { id } = await params;
  // Firestore document ids never contain "/" but reject anything odd-looking
  // rather than hand arbitrary strings to the store.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ ok: false, message: "Bad id" }, { status: 400 });
  }

  const resume = await readResume(id);
  if (!resume) {
    return NextResponse.json(
      { ok: false, message: "No resume on this application" },
      { status: 404 },
    );
  }

  // The filename was sanitised to word characters at upload, so it can sit in
  // a quoted header value as-is.
  return new NextResponse(new Uint8Array(resume.bytes), {
    headers: {
      "Content-Type": resume.meta.contentType,
      "Content-Length": String(resume.bytes.length),
      "Content-Disposition": `inline; filename="${resume.meta.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
