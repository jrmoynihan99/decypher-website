"use client";

import ServicesAtlas from "@/components/home/services-variants/ServicesAtlas";
import { LAB_SERVICES, LAB_SERVICES_HEADING } from "@/lib/lab-fixtures";

/**
 * SERVICES VARIANT 12 — "NEURAL ATLAS · FRAMED"
 *
 * The original contained cut of the Neural Atlas: the same lit map, camera
 * dives, 3D neurons, and node-anchored editorial type — inside a rounded,
 * bordered map panel in page flow instead of a full-viewport stage.
 */
export default function ServicesAtlasFramed() {
  return (
    <ServicesAtlas
      framed
      content={LAB_SERVICES_HEADING}
      services={LAB_SERVICES}
    />
  );
}
