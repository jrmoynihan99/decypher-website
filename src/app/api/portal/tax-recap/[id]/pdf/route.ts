import { NextResponse } from "next/server";
import { gate } from "../../_gate";
import { absoluteUrl } from "@/lib/site-url";
import { buildRecapPdf, recapPdfFilename } from "@/lib/tax-recap/pdf";
import { getRecap } from "@/lib/tax-recap/store";

/**
 * The recap as a PDF, for staff: the attachment that goes in the email next
 * to the link. Built fresh from the saved numbers on every request, so an
 * edit is in the next download.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!id || id.length > 200 || id.includes("/")) {
    return NextResponse.json({ ok: false, message: "Bad recap id" }, { status: 400 });
  }
  const recap = await getRecap(id);
  if (!recap) return NextResponse.json({ ok: false, message: "Recap not found" }, { status: 404 });

  const bytes = await buildRecapPdf(recap, absoluteUrl(`/recap/${recap.token}`));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${recapPdfFilename(recap)}"`,
      "Cache-Control": "no-store",
    },
  });
}
