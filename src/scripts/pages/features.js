// Features page: three small multiples under "How loud counts". Each verdict is computed by
// running the same level model the Bark Lab uses, so the page cannot claim a sound is turned
// down when the app would answer it. Built on first visit, since the page starts hidden.
import { $, el, icon, svgEl } from "../core/dom.js";
import { clamp, createRng } from "../core/math.js";
import { token } from "../core/theme.js";
import { BarkDetector, LEVEL_ONLY } from "../detector/bark-detector.js";
import { SHAPES } from "../detector/sound-shapes.js";

// One bark, one loud sound that is not a bark, one quiet sound. The middle case is the
// honest one: loudness is the whole test, so a door slam crosses the same line a bark does.
const CASES = [
  { title: "A real bark", kind: "soft" },
  { title: "A door slam", kind: "door" },
  { title: "Footsteps", kind: "steps" },
];
const BASE_DB = -48;
const LEAD_IN = 40;    // frames before the sound, long enough for the detector to prime
const TOTAL = 74;      // frames simulated in all
const TRACE_FROM = 34; // the first frame that is plotted
const RNG_SEED = 7;

// Why each sound ended up where it did, once it has crossed the line.
const WHY = {
  soft: "Loud enough to cross the line, so your message plays.",
  door: "Loud enough too. BarkOff hears the level, not what made it.",
};

function runCase(kind) {
  const rnd = createRng(RNG_SEED);
  const det = new BarkDetector(LEVEL_ONLY);
  const trace = [];
  let verdict = null;
  const shape = SHAPES[kind];

  for (let i = 0; i < TOTAL; i++) {
    const k = i - LEAD_IN;
    const ex = k >= 0 && k < shape.length ? shape[k] : 0;
    const db = BASE_DB + (rnd() * 2 - 1) * 1.2 + (ex > 0 ? ex : 0);
    const f = det.push(db);
    if (i >= TRACE_FROM) trace.push({ db, floor: f.noiseFloorDb });
    if (k >= 0 && !verdict && f.bark) verdict = { ok: true, why: WHY[kind] };
  }
  return { trace, verdict: verdict || { ok: false, why: "Never crosses the line, so nothing plays." } };
}

function drawCase(title, { trace, verdict }) {
  const W = 200, H = 110, pad = 6;
  const lo = BASE_DB - 6, hi = BASE_DB + 32;
  const y = (d) => pad + (1 - (clamp(d, lo, hi) - lo) / (hi - lo)) * (H - pad * 2);
  const x = (i) => pad + (i / (trace.length - 1)) * (W - pad * 2);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${title}: ${verdict.ok ? "crosses the line and plays your message" : "stays under the line, so nothing plays"}` });
  const line = (pick, attrs) => svg.append(svgEl("polyline", {
    points: trace.map((p, i) => `${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(" "),
    fill: "none", "vector-effect": "non-scaling-stroke", ...attrs,
  }));
  svg.append(svgEl("rect", { x: 0, y: 0, width: W, height: H, rx: 8, fill: token("--scope") }));
  line((p) => p.floor, { stroke: token("--muted"), "stroke-width": 1.2, opacity: 0.7 });
  line((p) => p.floor + 14, { stroke: token("--soft"), "stroke-width": 1.5, "stroke-dasharray": "5 4" });
  line((p) => p.db, { stroke: token("--cream"), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" });

  const card = el("div", { class: "multiple" }, [
    el("h4", { text: title }),
    el("div", { class: "multiple-chart" }, [svg]),
  ]);
  const v = el("div", { class: "verdict " + (verdict.ok ? "yes" : "no") });
  v.append(icon(verdict.ok ? "i-check" : "i-x"), document.createTextNode(verdict.ok ? "Crosses the line" : "Stays under"));
  card.append(v, el("div", { class: "why", text: verdict.why }));
  return card;
}

export function initFeaturesPage() {
  const host = $("#multiples");
  if (!host) return;
  CASES.forEach((c) => host.append(drawCase(c.title, runCase(c.kind))));
}
