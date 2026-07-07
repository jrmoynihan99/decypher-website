import NeuralWeb from "@/components/effects/NeuralWeb";
import CtaSection from "@/components/home/CtaSection";
import ServiceChapters from "@/components/services/ServiceChapters";
import ConsultButton from "@/components/ui/ConsultButton";
import PageHeader from "@/components/ui/PageHeader";
import Readout from "@/components/ui/Readout";
import type { CmsService, ServicesPageDoc } from "@/sanity/types";

export default function ServicesTemplate({
  page,
  services,
}: {
  page: ServicesPageDoc;
  services: CmsService[];
}) {
  const header = page.header ?? {};
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
          eyebrow={header.eyebrow ?? ""}
          title={header.title ?? ""}
          titleMax="22ch"
          sub={header.sub}
          readout={
            header.readout && (
              <Readout
                text={header.readout}
                vars={{ count: String(services.length).padStart(2, "0") }}
                blink
              />
            )
          }
        >
          <div className="relative mt-9 flex flex-wrap items-center justify-center gap-4">
            <ConsultButton size="lg">{page.primaryCtaLabel}</ConsultButton>
            {page.secondaryCtaLabel && (
              <a
                href="#node-01"
                className="rounded-full border border-edge-bright px-[30px] py-4 font-display text-[16.5px] font-semibold text-fog no-underline transition-colors hover:border-magenta"
              >
                {page.secondaryCtaLabel}
              </a>
            )}
          </div>
        </PageHeader>

        <ServiceChapters services={services} />
      </div>

      <CtaSection content={page.cta ?? {}} />
    </main>
  );
}
