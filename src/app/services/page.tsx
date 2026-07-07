import type { Metadata } from "next";
import NeuralWeb from "@/components/effects/NeuralWeb";
import CtaSection from "@/components/home/CtaSection";
import ServiceChapters from "@/components/services/ServiceChapters";
import ConsultButton from "@/components/ui/ConsultButton";
import PageHeader from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Services — DeCypher Financials",
  description:
    "Tax strategy, LLC filing, bookkeeping, S-corp + payroll, and fractional CFO — the full stack for your creator business, on one team.",
};

export default function ServicesPage() {
  return (
    <main className="relative">
      {/* one continuous mesh from the header down all five node dossiers,
          fading out above the closing CTA */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
          }}
        />
        <PageHeader
          eyebrow="[ services // the full stack ]"
          title="One stop shop for your creator business."
          titleMax="22ch"
          sub="Five services, one team. Every layer of your money handled by people who speak creator — from the first LLC to a CFO on speed dial."
          readout={
            <>
              {"// 05 MODULES LOADED — ALL SYSTEMS ONLINE "}
              <span className="animate-blink text-magenta">▮</span>
            </>
          }
        >
          <div className="relative mt-9 flex flex-wrap items-center justify-center gap-4">
            <ConsultButton size="lg" />
            <a
              href="#node-01"
              className="rounded-full border border-edge-bright px-[30px] py-4 font-display text-[16.5px] font-semibold text-fog no-underline transition-colors hover:border-magenta"
            >
              Browse the stack ▼
            </a>
          </div>
        </PageHeader>

        <ServiceChapters />
      </div>

      <CtaSection />
    </main>
  );
}
