// Download page: point the visitor at the option that works on the device they are using.
import { $ } from "../core/dom.js";

export function initDownloadPage() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) {
    const card = $("#pf-apk");
    card.classList.add("is-you");
    card.querySelector(".you-tag").hidden = false;
  } else if (isIOS) {
    $("#ios-note").hidden = false;
  }
}
