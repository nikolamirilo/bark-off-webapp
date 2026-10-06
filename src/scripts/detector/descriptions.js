// The app's own plain-language helpers (bark-off/components/settings/utils.ts).
import { clamp } from "../core/math.js";

export const describeNoiseFloor = (f) =>
  f < -50 ? "very quiet room" : f < -40 ? "quiet room" : f < -30 ? "some background noise" : f < -22 ? "noisy room" : "very noisy room";

export const describeDelta = (d) =>
  d <= 9 ? "Very sensitive" : d <= 14 ? "Balanced" : d <= 19 ? "Relaxed" : "Strict";

export const sensitivityPercentToDelta = (p) => Math.round(24 - (clamp(p, 0, 100) / 100) * 18);
