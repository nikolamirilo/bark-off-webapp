// The level model behind the Bark Lab and the feature charts.
//
// Both run it with LEVEL_ONLY: a sound counts the moment it is loud enough, with no attack
// or duration test. That is what the app decides on today, so the demos cannot show the
// page turning down a sound the phone would answer.
//
// The attack and duration gates stay in the code because the sensitivity scale, the two
// levels and the room level are all built on the same state, but LEVEL_ONLY disables them.
import { round1, percentile } from "../core/math.js";

export const FRAME_MS = 50;

// Loudness alone decides. attackDeltaDb 0 means no sound is ever turned down for rising too
// gently; minBurstMs 0 means none is turned down for being too brief.
export const LEVEL_ONLY = { attackDeltaDb: 0, minBurstMs: 0 };
const DETECTOR_DEFAULTS = {
  levelDeltasDb: [14, 24], attackDeltaDb: 8, attackWindowMs: 250, minBurstMs: 150,
  maxBurstMs: 2000, hysteresisDb: 5, refractoryMs: 350, warmupMs: 1500,
};
const FLOOR_ALPHA_DOWN = 0.3, FLOOR_ALPHA_UP = 0.02, PRIME_PERCENTILE = 0.25;
const SILENCE_DB = -160, FLOOR_INIT_DB = -60, FLOOR_MIN_DB = -70, FLOOR_MAX_DB = -3;

const normaliseConfig = (c) => {
  const deltas = (Array.isArray(c.levelDeltasDb) && c.levelDeltasDb.length ? c.levelDeltasDb : DETECTOR_DEFAULTS.levelDeltasDb)
    .filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  const levelDeltasDb = deltas.length ? deltas : DETECTOR_DEFAULTS.levelDeltasDb;
  return { ...c, levelDeltasDb, hysteresisDb: Math.max(0, Math.min(c.hysteresisDb, levelDeltasDb[0] - 1)) };
};

export class BarkDetector {
  constructor(config = {}) { this.config = normaliseConfig({ ...DETECTOR_DEFAULTS, ...config }); this.reset(); }
  updateConfig(config) { this.config = normaliseConfig({ ...this.config, ...config }); }
  get triggerDeltaDb() { return this.config.levelDeltasDb[0]; }
  reset() {
    this.noiseFloorDb = FLOOR_INIT_DB; this.history = []; this.candidate = null; this.elapsedMs = 0;
    this.msSinceLastBark = Infinity; this.lastLevel = null; this.primeSamples = []; this.primed = false;
  }
  push(rawDb, deltaMs = FRAME_MS) {
    this.elapsedMs += deltaMs;
    this.msSinceLastBark += deltaMs;
    const hasSignal = rawDb > SILENCE_DB;
    const db = hasSignal ? rawDb : this.noiseFloorDb;
    if (!this.primed) {
      if (hasSignal) this.primeSamples.push(rawDb);
      if (this.elapsedMs >= this.config.warmupMs) {
        if (this.primeSamples.length) this.noiseFloorDb = this.clampFloor(percentile(this.primeSamples, PRIME_PERCENTILE));
        this.primeSamples = []; this.primed = true;
      }
    }
    const triggerDb = this.noiseFloorDb + this.triggerDeltaDb;
    const releaseDb = triggerDb - this.config.hysteresisDb;
    const snrDb = db - this.noiseFloorDb;
    const attackDb = this.attackDb(db);
    let bark = null, rejection = null;
    if (this.candidate) {
      const o = this.advanceCandidate(db, snrDb, releaseDb, deltaMs);
      bark = o.bark; rejection = o.rejection;
    } else {
      rejection = this.whyNotOpening(db, triggerDb, attackDb);
      if (rejection === null) {
        this.candidate = { durationMs: deltaMs, peakDb: db, peakSnrDb: snrDb, floorAtOnsetDb: this.noiseFloorDb, confirmed: false };
      }
    }
    if (!this.candidate && hasSignal && this.primed) {
      const isLoud = db >= releaseDb;
      const inRefractory = this.msSinceLastBark < this.config.refractoryMs;
      const hasAttack = attackDb >= this.config.attackDeltaDb;
      if (!isLoud || (!inRefractory && !hasAttack)) this.updateNoiseFloor(db);
    }
    this.history.push({ db, tMs: this.elapsedMs });
    this.pruneHistory();
    if (bark) { this.msSinceLastBark = 0; this.lastLevel = bark.level; } else if (!this.candidate) this.lastLevel = null;
    return { db, noiseFloorDb: this.noiseFloorDb, snrDb, bark, rejection, primed: this.primed };
  }
  whyNotOpening(db, triggerDb, attackDb) {
    if (!this.primed) return "warmup";
    if (db < triggerDb) return "below_trigger";
    if (this.msSinceLastBark < this.config.refractoryMs) return "refractory";
    if (attackDb < this.config.attackDeltaDb) return "no_attack";
    return null;
  }
  attackDb(db) {
    const cutoff = this.elapsedMs - this.config.attackWindowMs;
    let quietest = Infinity;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].tMs < cutoff) break;
      if (this.history[i].db < quietest) quietest = this.history[i].db;
    }
    return quietest === Infinity ? 0 : db - quietest;
  }
  pruneHistory() {
    const cutoff = this.elapsedMs - this.config.attackWindowMs * 2;
    let drop = 0;
    while (drop < this.history.length && this.history[drop].tMs < cutoff) drop++;
    if (drop) this.history.splice(0, drop);
  }
  advanceCandidate(db, snrDb, releaseDb, deltaMs) {
    const c = this.candidate;
    if (db < releaseDb) {
      const d = c.durationMs;
      this.candidate = null;
      if (d >= this.config.minBurstMs && !c.confirmed) return { bark: this.buildBark(c, d), rejection: null };
      return { bark: null, rejection: c.confirmed ? null : "too_short" };
    }
    c.durationMs += deltaMs;
    if (db > c.peakDb) c.peakDb = db;
    if (snrDb > c.peakSnrDb) c.peakSnrDb = snrDb;
    if (c.durationMs > this.config.maxBurstMs) {
      this.candidate = null;
      this.noiseFloorDb = this.clampFloor(this.noiseFloorDb + (db - this.noiseFloorDb) * FLOOR_ALPHA_DOWN);
      return { bark: null, rejection: "sustained" };
    }
    if (c.durationMs >= this.config.minBurstMs && !c.confirmed) {
      c.confirmed = true;
      return { bark: this.buildBark(c, c.durationMs), rejection: null };
    }
    return { bark: null, rejection: null };
  }
  buildBark(c, d) { return { level: this.levelForSnr(c.peakSnrDb), peakSnrDb: round1(c.peakSnrDb), durationMs: d }; }
  levelForSnr(peak) {
    let level = 1;
    for (let i = 1; i < this.config.levelDeltasDb.length; i++) if (peak >= this.config.levelDeltasDb[i]) level = i + 1;
    return level;
  }
  updateNoiseFloor(db) {
    const a = db < this.noiseFloorDb ? FLOOR_ALPHA_DOWN : FLOOR_ALPHA_UP;
    this.noiseFloorDb = this.clampFloor(this.noiseFloorDb + (db - this.noiseFloorDb) * a);
  }
  clampFloor(v) { return Math.min(FLOOR_MAX_DB, Math.max(FLOOR_MIN_DB, v)); }
}
