// Bark Lab: wires the page controls to the simulation, the scope and the speaker card,
// and runs the clock. This module is the only part of the lab that touches the DOM
// directly; the model, the drawing, the card and the sound each live next door.
import { $, $$, el, icon } from "../../core/dom.js";
import { FRAME_MS } from "../../detector/bark-detector.js";
import { describeDelta } from "../../detector/descriptions.js";
import { MESSAGES } from "../../detector/messages.js";
import { getCurrentView } from "../../app/router.js";
import { createLabAudio } from "./audio.js";
import { createScope } from "./scope.js";
import { createSimulation } from "./simulation.js";
import { createSpeaker } from "./speaker.js";

const FRAME_COUNT = 170;                        // frames on screen, about 8.5 s
const LOG_LIMIT = 6;
const WARM_UP = [90, "soft", 52, "door", 60];   // frames and pad presses, in order

export function initBarkLab() {
  const canvas = $("#lab-scope");
  if (!canvas) return;

  const section = $("#lab-section");
  const statusText = $("#lab-status-text"), dot = $("#lab-dot"), roomEl = $("#lab-room");
  const logEl = $("#lab-log");
  const tvPad = $('.pad[data-kind="tv"]'), tvLabel = $("#tv-label");
  const sens = $("#lab-sens"), sensOut = $("#lab-sens-out");
  const soundBtn = $("#lab-sound");

  const audio = createLabAudio();
  const scope = createScope(canvas, FRAME_COUNT);
  const updateSpeaker = createSpeaker();

  function addLog({ mark, title, detail, sample, stamp }) {
    const m = el("span", { class: "mark " + mark });
    m.append(icon(mark === "ignored" ? "i-x" : "i-check"));
    const body = el("div", {}, [el("b", { text: title })]);
    if (sample) body.append(el("span", { class: "sample", text: "Sample" }));
    body.append(el("span", { class: "detail", text: detail }));
    logEl.prepend(el("li", {}, [m, body, el("time", { text: stamp })]));
    while (logEl.children.length > LOG_LIMIT) logEl.lastElementChild.remove();
  }

  const sim = createSimulation({
    frameCount: FRAME_COUNT,
    onLog: addLog,
    onPrimed: () => { statusText.textContent = "Listening"; dot.classList.remove("wait"); },
    onRoom: (text) => { roomEl.textContent = text; },
    onTv: (on) => {
      tvPad.setAttribute("aria-pressed", String(on));
      tvLabel.textContent = on ? "TV off" : "TV on";
      if (on) { if (audio.on) audio.tvNoise(true); } else audio.tvNoise(false);
    },
    onMessage: (level) => { if (audio.on) audio.speak(MESSAGES[level]); },
    onSound: (kind) => { if (audio.on && audio.ready) audio.play(kind); },
  });

  /* ----- controls ----- */
  soundBtn.addEventListener("click", async () => {
    const on = soundBtn.getAttribute("aria-pressed") !== "true";
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.querySelector("span").textContent = on ? "Sound on" : "Sound off";
    soundBtn.querySelector("use").setAttribute("href", on ? "#i-volume" : "#i-volume-x");
    if (on) {
      await audio.enable();
      if (sim.tvOn) audio.tvNoise(true);
    } else {
      audio.disable();
    }
  });

  $$(".pad").forEach((p) => p.addEventListener("click", async () => {
    if (audio.on) await audio.ensureReady();
    sim.trigger(p.dataset.kind);
    p.classList.add("hit");
    setTimeout(() => p.classList.remove("hit"), 160);
  }));

  const applySensitivity = () => {
    const pct = Number(sens.value);
    const delta = sim.setSensitivity(pct);
    sensOut.textContent = `${describeDelta(delta)}, +${delta} dB`;
    sens.style.setProperty("--fill", pct + "%");
  };
  sens.addEventListener("input", applySensitivity);
  applySensitivity();

  /* ----- clock ----- */
  let running = false, raf = 0, lastTs = 0, acc = 0, inView = false;
  function loop(ts) {
    if (!running) return;
    acc += Math.min(ts - lastTs, 250);
    lastTs = ts;
    while (acc >= FRAME_MS) { sim.tick(); acc -= FRAME_MS; }
    scope.draw(sim.frames, acc / FRAME_MS);
    updateSpeaker(sim.playback);
    raf = requestAnimationFrame(loop);
  }
  const start = () => {
    if (running) return;
    running = true;
    lastTs = performance.now();
    acc = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  const sync = () => (inView && !document.hidden && getCurrentView() === "home" ? start() : stop());
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }).observe(section);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("resize", () => scope.draw(sim.frames, 0));

  // Open in a working state: one soft bark and one door click already in the log.
  sim.warmUp(WARM_UP);
  updateSpeaker(sim.playback);
  scope.draw(sim.frames, 0);
}
