import type { Metadata } from "next";
import CreatorsExplorer from "@/components/creators/CreatorsExplorer";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { creators } from "@/lib/creators";

export const metadata: Metadata = {
  title: "Our Creators — DeCypher Financials",
  description:
    "From lifestyle to gaming to finance, we handle the books and the tax strategy so our creators can focus on what they do best.",
};

export default function CreatorsPage() {
  return (
    <main className="relative">
      <header className="relative z-[1] overflow-visible px-6 pb-[30px] pt-[90px] text-center">
        <GlowOrb
          size={760}
          blur={52}
          alpha={0.2}
          beta={0.12}
          duration={16}
          style={{ top: "calc(50% - 340px)" }}
        />
        <p className="relative m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
          [ database // our creators ]
        </p>
        <DecryptOnView
          as="h1"
          text="The creators we keep in the black."
          threshold={0}
          className="relative mx-auto mt-[18px] max-w-[20ch] font-display text-[clamp(38px,5.4vw,72px)] font-bold leading-[1.04] tracking-[-0.03em] text-fog"
        />
        <p className="relative mx-auto mt-[22px] max-w-[56ch] text-[clamp(15.5px,1.8vw,18px)] leading-relaxed text-mist [text-wrap:pretty]">
          From lifestyle to gaming to finance, we handle the books and the tax
          strategy so our creators can focus on what they do best.
        </p>
        <p className="relative mt-5 font-mono text-[11.5px] tracking-[0.16em] text-faint">
          {`// ${creators.length} RECORDS DECRYPTED `}
          <span className="animate-blink text-magenta">▮</span>
        </p>
      </header>
      <CreatorsExplorer />
    </main>
  );
}
