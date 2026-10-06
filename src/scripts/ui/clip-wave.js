// Fills each .clip-wave with bars. The height goes out as the --h custom property, so
// styles/home-sections.css still owns how a bar looks.
import { $$, el } from "../core/dom.js";

export function initClipWaves() {
  $$(".clip-wave[data-seed]").forEach((w) => {
    let s = Number(w.dataset.seed) || 1;
    for (let i = 0; i < 26; i++) {
      s = (s * 9301 + 49297) % 233280;
      const h = 4 + Math.round((s / 233280) * 16 * Math.sin((i / 25) * Math.PI) + 2);
      w.append(el("i", { vars: { "--h": `${h}px` } }));
    }
  });
}
