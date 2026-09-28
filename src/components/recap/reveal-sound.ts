/**
 * The reveal's sound, synthesised in the browser (no audio files). One
 * musical phrase, one instrument: a glassy pluck with a short reverb tail,
 * the kind a "success" sound is made of. The hold is the anticipation (a
 * climb in the dominant, an unresolved pad fading in under it); the unlock
 * is the resolution (a two-note pickup and the landing on the tonic, with
 * the chord ringing out and a soft thump underneath as the glyphs fly).
 * Let go early and the climb walks back down, quieter.
 *
 * The resolution is scheduled on the audio clock from the moment the lock
 * opens, not on JS timers: the burst frame is the busiest one (600 glyphs,
 * the flash, the shockwave), and a timer fired from it lands late, which
 * used to leave a hole of silence at the peak.
 *
 * Browsers only let a page make sound after the person has interacted with
 * it, and iOS only if the AudioContext is created inside that interaction,
 * so `prime()` is called from the pointerdown that starts a hold (and from
 * the toggle), never on load. Every call is a no-op until then, and a no-op
 * while disabled, so a client who turned it off or a phone on silent costs
 * nothing. Keep the numbers below tasteful — this plays in someone's
 * kitchen, unannounced.
 */

const MASTER = 0.9;
/** From the latch to the landing — the visual burst fires 170ms after the lock opens. */
const SWELL = 0.18;
/** How much of every note goes to the reverb. */
const WET = 0.3;

/* C major. The climb sits on G (the dominant) so the landing on C resolves it. */
const G3 = 196.0, B3 = 246.94, D4 = 293.66, G4 = 392.0, A4 = 440.0, B4 = 493.88;
const D5 = 587.33, E5 = 659.26, G5 = 783.99, A5 = 880.0, B5 = 987.77, D6 = 1174.66;
const C3 = 130.81, C5 = 523.25, C6 = 1046.5;
/** The climb, one note per step of the ring. */
const CLIMB = [G3, B3, D4, G4, A4, B4, D5, E5, G5, A5, B5, D6];

export type RevealSound = ReturnType<typeof createRevealSound>;

export function createRevealSound(initiallyEnabled: boolean) {
  let enabled = initiallyEnabled;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  /** Every note goes through here: dry to the master, and a send to the reverb. */
  let bus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let pad: { gain: GainNode } | null = null;
  let step = -1;

  /**
   * The instrument: a sine with two fading partials and a brief triangle
   * transient for the pluck — a glockenspiel struck softly.
   */
  const glass = (c: AudioContext, t0: number, f: number, decay: number, peak: number) => {
    if (!bus) return;
    const voices: [OscillatorType, number, number, number][] = [
      ["sine", 1, 1, decay],
      ["sine", 2.003, 0.22, decay * 0.55],
      ["sine", 3.01, 0.07, decay * 0.3],
      ["triangle", 1, 0.35, 0.035],
    ];
    for (const [type, ratio, level, d] of voices) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * ratio;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak * level, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g);
      g.connect(bus);
      o.start(t0);
      o.stop(t0 + d + 0.03);
    }
  };

  /** A pitched thump at `t0`: one sine gliding `from` → `to` under a fast-attack decay. Dry. */
  const thump = (c: AudioContext, t0: number, from: number, to: number, peak: number, decay: number) => {
    if (!master) return;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(to, t0 + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + decay + 0.05);
  };

  /** Filtered noise at `t0`: the latch's click, and the sparkle on the landing. */
  const hiss = (c: AudioContext, t0: number, o: { type: BiquadFilterType; freq: number; q: number; peak: number; attack: number; decay: number }) => {
    if (!bus || !noise) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q;
    f.frequency.value = o.freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.peak, t0 + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.attack + o.decay);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t0);
    src.stop(t0 + o.attack + o.decay + 0.05);
  };

  const ensure = (): AudioContext | null => {
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume();
      return ctx;
    }
    if (typeof window === "undefined" || !("AudioContext" in window)) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = enabled ? MASTER : 0;
    master.connect(ctx.destination);
    bus = ctx.createGain();
    bus.connect(master);

    // the room: 1.4s of exponentially decaying noise as the impulse response
    const len = Math.round(ctx.sampleRate * 1.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = WET;
    bus.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);

    // a second of white noise for the click and the sparkle
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // the pad under the climb: G and D, unresolved, fading in with the hold
    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    padGain.connect(bus);
    for (const [f, level] of [
      [G3, 1],
      [D4, 0.6],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(padGain);
      o.start();
    }
    pad = { gain: padGain };
    return ctx;
  };

  return {
    /** Call inside a user gesture. Creates (or resumes) the context if sound is on. */
    prime() {
      if (enabled) ensure();
    },
    /** The hold's progress, every frame: one note per step up the climb, back down when let go. */
    progress(p: number) {
      const c = ctx;
      if (!c || !pad) return;
      pad.gain.gain.setTargetAtTime(p > 0.01 ? p * 0.05 : 0, c.currentTime, 0.08);
      if (p < 0.01) {
        step = -1;
        return;
      }
      const target = Math.min(CLIMB.length - 1, Math.floor(p * CLIMB.length));
      if (target === step) return;
      const rising = target > step;
      step = target;
      if (rising) glass(c, c.currentTime, CLIMB[step], 0.34, 0.15);
      else glass(c, c.currentTime, CLIMB[step], 0.22, 0.06);
    },
    /**
     * The lock opening — the resolution, scheduled on the audio clock: a
     * click now, the pickup (G, B) over the swell, then (with the burst) the
     * landing on C with the chord ringing out and a soft thump under it.
     */
    unlock(withBurst: boolean) {
      const c = ensure();
      if (!c || !pad) return;
      const t0 = c.currentTime;
      hiss(c, t0, { type: "bandpass", freq: 2600, q: 4, peak: 0.16, attack: 0.002, decay: 0.05 });
      if (!withBurst) {
        pad.gain.gain.setTargetAtTime(0, t0, 0.05);
        glass(c, t0, C6, 0.9, 0.16);
        return;
      }
      const tb = t0 + SWELL;
      glass(c, t0, G5, 0.3, 0.12);
      glass(c, t0 + SWELL / 2, B5, 0.3, 0.13);
      // the pad swells into the landing and gives way to the chord
      pad.gain.gain.cancelScheduledValues(t0);
      pad.gain.gain.setValueAtTime(Math.max(0.0001, pad.gain.gain.value), t0);
      pad.gain.gain.linearRampToValueAtTime(0.08, tb);
      pad.gain.gain.exponentialRampToValueAtTime(0.0001, tb + 0.12);
      // the landing
      glass(c, tb, C6, 1.6, 0.22);
      for (const [f, level] of [
        [C5, 0.07],
        [E5, 0.06],
        [G5, 0.05],
      ] as const) {
        glass(c, tb + 0.01, f, 1.9, level);
      }
      thump(c, tb, 90, 38, 0.45, 0.5);
      hiss(c, tb + 0.02, { type: "highpass", freq: 6000, q: 0.7, peak: 0.1, attack: 0.01, decay: 0.4 });
      thump(c, tb, C3, C3, 0.09, 1.2);
    },
    /** A small confirmation when sound is switched on. */
    blip() {
      const c = ensure();
      if (!c) return;
      glass(c, c.currentTime, C6, 0.35, 0.1);
    },
    setEnabled(v: boolean) {
      enabled = v;
      if (ctx && master) master.gain.setTargetAtTime(v ? MASTER : 0, ctx.currentTime, 0.02);
      if (v) ensure();
    },
    destroy() {
      void ctx?.close();
      ctx = null;
      master = null;
      bus = null;
      noise = null;
      pad = null;
    },
  };
}
