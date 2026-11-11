// Shared DSP helpers: used by the lathe, the pressing plant, the deck engine and the Node tests.
export const TAU = Math.PI * 2;

// RIAA time constants (seconds)
export const T1 = 3180e-6, T2 = 318e-6, T3 = 75e-6;

// One-pole lowpass coefficient for corner f:  y += k * (x - y)
export const onePole = (f, fs) => 1 - Math.exp(-TAU * f / fs);

// RIAA playback curve as a matched-z filter, unity gain at 1 kHz:
//   H(z) = g (1 - z2 z^-1) / ((1 - p1 z^-1)(1 - p3 z^-1))
// Its inverse (the cutting curve) is stable, so the lathe and the preamp are exact mirrors of
// each other and the only thing left between them is the groove.
export function riaa(fs) {
  const z2 = Math.exp(-1 / (T2 * fs)), p1 = Math.exp(-1 / (T1 * fs)), p3 = Math.exp(-1 / (T3 * fs));
  const w = TAU * 1000 / fs, c = Math.cos(w), s = Math.sin(w);
  const mag = (k) => Math.hypot(1 - k * c, k * s);
  return { g: mag(p1) * mag(p3) / mag(z2), z2, p1, p3 };
}

// Deterministic RNG (mulberry32) with a gaussian.
export function rng(seed) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  u.gauss = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(TAU * u());
  u.int = (n) => Math.floor(u() * n);
  u.pick = (arr) => arr[Math.floor(u() * arr.length)];
  return u;
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
