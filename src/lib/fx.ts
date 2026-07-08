/**
 * TEMPORARY perf-bisection kill switches — delete once the lag hunt is over.
 *
 * Load any page with `?off=<list>` to disable effect groups at runtime (works
 * on the deployed site too, no rebuild per combination):
 *
 *   ?off=all            everything below
 *   ?off=rain           CipherRain background drift
 *   ?off=web            NeuralWeb canvas simulations
 *   ?off=wave           WaveField ribbon canvas (estimator section)
 *   ?off=decrypt        decrypt/scramble text effects (incl. hover flicker)
 *   ?off=orbs           GlowOrb blurred glow layers
 *   ?off=hud            ScrollHud progress bar / chip scroll updates
 *   ?off=marquee        marquee drift loops (strips stay statically visible)
 *   ?off=rain,web,orbs  any comma-separated combination
 *
 * Read once from the URL at first use; reload with the param to apply, reload
 * without it to return to normal. The set survives in-app navigation.
 */
export type FxName =
  | "rain"
  | "web"
  | "wave"
  | "decrypt"
  | "orbs"
  | "hud"
  | "marquee";

let offSet: Set<string> | null = null;

export function fxOff(name: FxName): boolean {
  if (typeof window === "undefined") return false;
  if (!offSet) {
    offSet = new Set(
      (new URLSearchParams(window.location.search).get("off") ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  }
  return offSet.has("all") || offSet.has(name);
}
