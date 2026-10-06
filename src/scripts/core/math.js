export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const round1 = (v) => Math.round(v * 10) / 10;

export const percentile = (values, p) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
};

// Deterministic generator, so the Bark Lab and the feature diagrams look the same on every load.
export const createRng = (seed) => {
  let state = seed;
  return () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
};
