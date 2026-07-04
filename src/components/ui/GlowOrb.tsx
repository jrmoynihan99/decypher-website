/**
 * Ambient radial glow that drifts slowly behind a section. The `data-glow`
 * attribute lets the homepage scroll HUD hue-rotate every orb as you scroll.
 */
export default function GlowOrb({
  size = 660,
  blur = 48,
  alpha = 0.16,
  beta = 0.1,
  duration = 17,
  className,
  style,
}: {
  size?: number;
  blur?: number;
  /** Opacity of the magenta core. */
  alpha?: number;
  /** Opacity of the violet mid-stop. */
  beta?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      data-glow
      aria-hidden
      className={`pointer-events-none absolute ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        left: `calc(50% - ${size / 2}px)`,
        top: `calc(50% - ${size / 2}px)`,
        ...style,
      }}
    >
      <div
        className="h-full w-full animate-glow-drift rounded-full"
        style={{
          background: `radial-gradient(circle,rgba(255,45,120,${alpha}) 0%,rgba(139,43,232,${beta}) 45%,rgba(10,10,14,0) 72%)`,
          filter: `blur(${blur}px)`,
          animationDuration: `${duration}s`,
        }}
      />
    </div>
  );
}
