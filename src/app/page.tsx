import CipherRain from "@/components/effects/CipherRain";
import ScrollHud from "@/components/effects/ScrollHud";
import CtaSection from "@/components/home/CtaSection";
import EstimatorSection from "@/components/home/EstimatorSection";
import FaqSection from "@/components/home/FaqSection";
import Hero from "@/components/home/Hero";
import RosterSection from "@/components/home/RosterSection";
import ServicesSection from "@/components/home/ServicesSection";
import StatsSection from "@/components/home/StatsSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import VideoSection from "@/components/home/VideoSection";

export default function Home() {
  return (
    <main id="top" className="relative">
      <CipherRain />
      <ScrollHud />
      <Hero />
      <StatsSection />
      <EstimatorSection />
      <VideoSection />
      <RosterSection />
      <ServicesSection />
      <TestimonialsSection />
      <FaqSection />
      <CtaSection />
    </main>
  );
}
