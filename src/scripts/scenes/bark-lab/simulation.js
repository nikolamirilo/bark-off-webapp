// The Bark Lab model: it generates a room's sound, feeds it to the real detector and
// decides what each sound became. No DOM and no audio in here, so the same run could be
// driven by anything. Everything the page needs to show arrives through the callbacks.
import { createRng } from "../../core/math.js";
import { BarkDetector, FRAME_MS, LEVEL_ONLY } from "../../detector/bark-detector.js";
import { describeNoiseFloor, sensitivityPercentToDelta } from "../../detector/descriptions.js";
import { SHAPES, SHAPE_LABELS } from "../../detector/sound-shapes.js";
import { MESSAGES, REASONS } from "../../detector/messages.js";

const BASE_DB = -47;             // the quiet room this lab starts from
const COOLDOWN_MS = 6000;        // shortened from the app's 15 s so the demo reads quickly
const CLIP_MS = 3200;            // how long a message takes to play
const TV_FRAMES = 300;           // the TV switches itself off after 15 s
const ADAPTED_AFTER = 70;        // frames of slow rise before the room level has followed it
const RNG_SEED = 20261002;

// Checked in this order, so the most specific reason a sound was ignored wins. Loudness is
// the only test, so a sound is turned down for arriving too soon after the last one, or for
// never getting loud enough. Nothing is rejected for its shape.
const REJECTION_ORDER = ["refractory", "below_trigger"];

export { COOLDOWN_MS, CLIP_MS, MESSAGES };

export function createSimulation({ frameCount, onLog, onPrimed, onRoom, onTv, onMessage, onSound }) {
  const det = new BarkDetector(LEVEL_ONLY);
  const rng = createRng(RNG_SEED);

  let softDelta = 14, bigDelta = 24;
  let frames = [], active = [], events = [], t = 0, evId = 0, wander = 0;
  let cooldownUntil = -Infinity, playStart = -Infinity, playLevel = 1;
  let primedShown = false, roomText = "";
  // While pre-simulating, log entries are marked as samples and nothing is allowed to
  // make a sound or speak.
  let presim = false;
  const tv = { on: false, level: 0, offAt: 0, event: null };

  const now = () => t * FRAME_MS;
  const stamp = () => {
    const secs = Math.floor(now() / 1000);
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  };

  // One frame of room sound: a slow wander, the TV if it is on, and any sound still playing.
  function nextDb() {
    wander = (wander + (rng() - 0.5) * 0.25) * 0.985;
    tv.level = tv.on ? Math.min(18, tv.level + 18 / 24) : Math.max(0, tv.level - 6);
    const ambient = BASE_DB + wander + tv.level + (rng() * 2 - 1) * 1.5;
    let extra = 0;
    for (const a of active) { const v = a.shape[a.i++]; if (v > extra) extra = v; }
    active = active.filter((a) => a.i < a.shape.length);
    return ambient + (extra > 0 ? extra + (rng() * 2 - 1) * 0.6 : 0);
  }

  function resolveIgnored(ev, reason) {
    ev.resolved = true;
    const r = REASONS[reason] || REASONS.below_trigger;
    if (ev.peakRec) ev.peakRec.mark = { type: "ignored", label: r.short };
    onLog({ mark: "ignored", title: ev.label, detail: r.text, sample: presim, stamp: stamp() });
  }

  function onBark(bark, rec) {
    const at = now();
    const ev = events.find((e) => !e.resolved && t >= e.startT && t <= e.endT && e.kind !== "tv");
    if (ev) ev.resolved = true;
    const lvl = bark.level >= 2 ? 2 : 1;
    const name = lvl === 2 ? "big bark" : "soft bark";
    const snr = Math.round(bark.peakSnrDb);
    rec.mark = { type: lvl === 2 ? "big" : "soft", label: lvl === 2 ? "Big bark" : "Soft bark" };
    const source = ev ? ev.label : "A sound";
    const heardAs = ev && ev.kind !== "soft" && ev.kind !== "big"
      ? `Heard as a ${name} at this sensitivity (+${snr} dB).`
      : `Heard a ${name}, +${snr} dB over the room.`;
    if (at >= cooldownUntil) {
      cooldownUntil = at + COOLDOWN_MS;
      playStart = at;
      playLevel = lvl;
      if (!presim) onMessage(lvl);
      onLog({ mark: rec.mark.type, title: source, detail: `${heardAs} Played your ${lvl === 2 ? "firm" : "gentle"} message.`, sample: presim, stamp: stamp() });
    } else {
      rec.mark.label = "Logged";
      const left = Math.ceil((cooldownUntil - at) / 1000);
      onLog({ mark: rec.mark.type, title: source, detail: `${heardAs} Logged without a message, cooldown has ${left} s left.`, sample: presim, stamp: stamp() });
    }
  }

  function setTv(on) {
    tv.on = on;
    if (on) {
      tv.offAt = t + TV_FRAMES;
      tv.event = { kind: "tv", label: "TV turned on", startT: t, resolved: false, peakRec: null };
    } else {
      tv.event = null;
    }
    onTv(on);
  }

  function tick() {
    if (tv.on && t >= tv.offAt) setTv(false);
    const db = nextDb();
    const f = det.push(db, FRAME_MS);
    t++;
    const rec = { db, floor: f.noiseFloorDb, soft: f.noiseFloorDb + softDelta, big: f.noiseFloorDb + bigDelta, mark: null };
    // Track the peak of each sound still in flight, and why the detector turned it down.
    for (const ev of events) {
      if (ev.resolved || ev.kind === "tv" || t < ev.startT) continue;
      if (t <= ev.endT) {
        if (db > ev.peakDb) { ev.peakDb = db; ev.peakRec = rec; }
        if (f.rejection && f.rejection !== "warmup") ev.reasons.add(f.rejection);
      }
    }
    if (f.bark) onBark(f.bark, rec);
    // A sound that has finished without becoming a bark gets its verdict now.
    for (const ev of events) {
      if (ev.resolved || ev.kind === "tv" || t <= ev.endT) continue;
      resolveIgnored(ev, REJECTION_ORDER.find((r) => ev.reasons.has(r)) || "below_trigger");
    }
    if (tv.event && !tv.event.resolved) {
      // The TV is loud enough to answer, and it does. What stops it repeating is the room
      // level climbing to meet it, which is what "sustained" reports.
      if (f.rejection === "sustained") { tv.event.peakRec = rec; resolveIgnored(tv.event, "adapted"); }
      else if (t - tv.event.startT > ADAPTED_AFTER) { tv.event.peakRec = rec; resolveIgnored(tv.event, "adapted"); }
    }
    events = events.filter((e) => !e.resolved);
    frames.push(rec);
    if (frames.length > frameCount + 2) frames.shift();
    if (!primedShown && f.primed) {
      primedShown = true;
      onPrimed();
    }
    const rt = "Room: " + describeNoiseFloor(f.noiseFloorDb);
    if (rt !== roomText) { roomText = rt; onRoom(rt); }
  }

  function trigger(kind) {
    if (kind === "tv") { setTv(!tv.on); return; }
    events.push({
      id: ++evId, kind, label: SHAPE_LABELS[kind],
      startT: t + 1, endT: t + SHAPES[kind].length + 4,
      resolved: false, reasons: new Set(), peakDb: -Infinity, peakRec: null,
    });
    active.push({ shape: SHAPES[kind], i: 0 });
    if (!presim) onSound(kind);
  }

  function setSensitivity(pct) {
    softDelta = sensitivityPercentToDelta(pct);
    bigDelta = Math.max(24, softDelta + 6);
    det.updateConfig({ levelDeltasDb: [softDelta, bigDelta] });
    return softDelta;
  }

  return {
    tick,
    trigger,
    setSensitivity,
    get frames() { return frames; },
    get tvOn() { return tv.on; },
    get playback() { return { now: now(), playStart, cooldownUntil, playLevel, started: frames.length > 0 && playStart > 0 }; },
    // Pre-roll a scripted opening so the lab is already working when it first appears,
    // then clear the playback state it left behind.
    warmUp(script) {
      presim = true;
      for (const step of script) {
        if (typeof step === "number") for (let i = 0; i < step; i++) tick();
        else trigger(step);
      }
      presim = false;
      cooldownUntil = -Infinity;
      playStart = -Infinity;
    },
  };
}
