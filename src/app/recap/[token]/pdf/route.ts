import { absoluteUrl } from "@/lib/site-url";
import { buildRecapPdf, recapPdfFilename } from "@/lib/tax-recap/pdf";
import { getRecapByToken } from "@/lib/tax-recap/store";

/**
 * The client's own copy of the PDF, addressed by the same unguessable token
 * as the page. A revoked recap 404s exactly like a bad token, as the page
 * does.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const recap = await getRecapByToken(token);
  if (!recap || recap.revoked) return new Response("Not found", { status: 404 });

  const bytes = await buildRecapPdf(recap, absoluteUrl(`/recap/${recap.token}`));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${recapPdfFilename(recap)}"`,
      "Cache-Control": "no-store",
    },
  });
}
