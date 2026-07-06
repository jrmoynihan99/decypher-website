import CipherRain from "@/components/effects/CipherRain";
import NeuralWeb from "@/components/effects/NeuralWeb";
import ScrollHud from "@/components/effects/ScrollHud";
import CtaSection from "@/components/home/CtaSection";
import EstimatorSection from "@/components/home/EstimatorSection";
import FaqSection from "@/components/home/FaqSection";
import Hero from "@/components/home/Hero";
import RosterSection from "@/components/home/RosterSection";
import ServicesCinema from "@/components/home/services-variants/ServicesCinema";
import StatsSection from "@/components/home/StatsSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import VideoSection from "@/components/home/VideoSection";

export default function Home() {
  return (
    <main id="top" className="relative">
      <CipherRain />
      <ScrollHud />
      {/* one continuous neural mesh spanning Hero + Stats (no seam), fading in
          at the very top and bleeding down past Stats into the Estimator.
          z-[1] lifts the whole group above the fixed CipherRain (z-0) so the
          mesh (at -z-10 inside here) still renders above it, not hidden behind. */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            bottom: "-360px",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 220px, #000 calc(100% - 360px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 220px, #000 calc(100% - 360px), transparent 100%)",
          }}
        />
        <Hero />
        <StatsSection />
      </div>
      <EstimatorSection />
      {/* continuous mesh over Video + Roster: bleeds up into the Estimator and
          fades back out as the Services section scrolls in below */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            top: "-300px",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 300px, #000 calc(100% - 300px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 300px, #000 calc(100% - 300px), transparent 100%)",
          }}
        />
        <VideoSection />
        <RosterSection />
      </div>
      <ServicesCinema />
      {/* continuous mesh over Testimonials + FAQ + CTA, fading in at the top of
          Testimonials and out at the very bottom of the page */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 320px, #000 calc(100% - 220px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 320px, #000 calc(100% - 220px), transparent 100%)",
          }}
        />
        <TestimonialsSection />
        <FaqSection />
        <CtaSection />
      </div>
    </main>
  );
}
