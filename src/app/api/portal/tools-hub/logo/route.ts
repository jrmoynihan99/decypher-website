import { NextResponse } from "next/server";
import { gate } from "../_gate";
import {
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  ToolsHubError,
  saveLogo,
} from "@/lib/tools-hub/store";

/**
 * Upload a tool logo: multipart/form-data with a `file` part. Admin-only,
 * like every catalog write. Returns the site-relative URL the editor drops
 * into the tool's logoUrl — which then passes asAssetUrl on save like any
 * hand-typed path.
 */
export async function POST(req: Request) {
  const session = await gate(true);
  if (session instanceof NextResponse) return session;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, message: "Expected a `file` part" },
      { status: 400 },
    );
  }
  if (!LOGO_TYPES.has(file.type)) {
    return NextResponse.json(
      { ok: false, message: "Use a PNG, JPEG, WebP or SVG" },
      { status: 400 },
    );
  }
  if (file.size > LOGO_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, message: "Logo must be under 600KB" },
      { status: 400 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const id = await saveLogo(bytes, file.type, session.email);
    return NextResponse.json({ ok: true, url: `/api/portal/tools-hub/logo/${id}` });
  } catch (e) {
    if (e instanceof ToolsHubError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tools-hub] logo upload failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't upload" }, { status: 500 });
  }
}
