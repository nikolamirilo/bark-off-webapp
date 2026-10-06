// The GO button in step 3 of "How it works": a toggle that only changes its caption.
import { $ } from "../core/dom.js";

export function initGoButton() {
  const goBtn = $("#go-demo");
  if (!goBtn) return;
  goBtn.addEventListener("click", () => {
    const on = goBtn.getAttribute("aria-pressed") !== "true";
    goBtn.setAttribute("aria-pressed", String(on));
    $("#go-caption").textContent = on ? "Shh, listening for woofs..." : "Tap the paw to start monitoring";
  });
}
