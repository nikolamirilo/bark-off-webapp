// The speaker card beside the scope: what BarkOff is doing right now, and how much of
// the cooldown is left. Reads playback state, writes DOM.
import { $ } from "../../core/dom.js";
import { clamp } from "../../core/math.js";
import { CLIP_MS, COOLDOWN_MS, MESSAGES } from "./simulation.js";

const RING_LENGTH = 201; // the dash array on #speaker-ring

export function createSpeaker() {
  const card = $("#lab-speaker");
  const title = $("#speaker-title"), quote = $("#speaker-quote");
  const bar = $("#speaker-bar"), ring = $("#speaker-ring"), ico = $("#speaker-ico");
  let shown = "";

  return function update({ now, playStart, cooldownUntil, playLevel, started }) {
    let state = "idle";
    if (now - playStart < CLIP_MS) state = "playing";
    else if (now < cooldownUntil) state = "cooldown";

    if (state !== shown) {
      shown = state;
      card.dataset.state = state;
      if (state === "playing") {
        title.textContent = playLevel === 2 ? "Playing your firm message" : "Playing your gentle message";
        quote.textContent = `"${MESSAGES[playLevel]}"`;
        ico.setAttribute("href", "#i-volume");
      } else if (state === "cooldown") {
        quote.textContent = "Barks are still logged during the cooldown.";
        ico.setAttribute("href", "#i-timer");
      } else {
        title.textContent = "Waiting quietly";
        quote.textContent = started ? "Listening for the next bark." : "Nothing to answer yet.";
        ico.setAttribute("href", "#i-wave");
      }
    }

    bar.style.width = state === "playing" ? `${clamp((now - playStart) / CLIP_MS, 0, 1) * 100}%` : "0%";
    if (state === "cooldown") {
      const left = Math.max(0, cooldownUntil - now);
      title.textContent = `Next message ready in ${Math.ceil(left / 1000)} s`;
      ring.style.strokeDashoffset = String(RING_LENGTH * (1 - left / COOLDOWN_MS));
    } else {
      ring.style.strokeDashoffset = String(RING_LENGTH);
    }
  };
}
