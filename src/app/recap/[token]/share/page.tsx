import Link from "next/link";
import { notFound } from "next/navigation";
import ShareVideo from "@/components/recap/ShareVideo";
import { videoIsCurrent } from "@/lib/decyphered/fromRecap";
import { getRecapByToken } from "@/lib/tax-recap/store";

/**
 * The DeCyphered video on its own, for the phone: where the QR codes on the
 * recap page and the PDF land. No seal and no long page to scroll, just the
 * video, the Share button and the steps. Missing, revoked or out of date
 * 404s like the recap does.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const recap = await getRecapByToken(token);
  if (!recap || recap.revoked || !recap.video || !videoIsCurrent(recap)) notFound();
  return (
    <main className="mx-auto max-w-[1040px] px-5 pb-16 pt-6 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="font-display text-[17px] font-semibold text-fog">
          DeCypher <span className="text-grad">Financials</span>
        </div>
        <div className="font-mono text-[10.5px] uppercase tracking-[2px] text-muted">Tax Recap · {recap.taxYear}</div>
      </div>
      <div className="mx-auto mt-10 max-w-[620px] text-center">
        <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">[ your decyphered ]</p>
        <h1 className="mt-4 font-display text-[clamp(34px,7vw,52px)] font-bold leading-[1.05] tracking-[-0.025em] text-fog">
          Post your DeCyphered.
        </h1>
        <p className="mx-auto mt-4 max-w-[46ch] text-[16px] leading-relaxed text-mist">
          {`Your ${recap.taxYear} as a video for your Instagram story. Tag @we.decypher when you post it and we’ll send you a $50 Visa gift card.`}
        </p>
      </div>
      <div className="mt-10">
        <ShareVideo token={recap.token} taxYear={recap.taxYear} variants={recap.video.variants} qrSvg={null} />
      </div>
      <p className="mt-12 text-center">
        <Link href={`/recap/${recap.token}`} className="font-mono text-[11px] uppercase tracking-[0.18em] text-dusk no-underline hover:text-fog">
          See your full recap →
        </Link>
      </p>
    </main>
  );
}
