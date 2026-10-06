// Entry point and the only place that knows the whole app. Every other module exports an
// init function and waits to be called from here, so the startup order is visible in one
// place and nothing runs as a side effect of being imported.
import { initRouter, registerView, show, getLastToken, currentUrl } from "./app/router.js";
import { initHeader } from "./ui/header.js";
import { initCopyButtons } from "./ui/copy-buttons.js";
import { initClipWaves } from "./ui/clip-wave.js";
import { initGoButton } from "./ui/go-button.js";
import { initHeroScene } from "./scenes/hero-scene.js";
import { initBarkLab } from "./scenes/bark-lab/index.js";
import { initReportChart } from "./scenes/report-chart.js";
import { initFeaturesPage } from "./pages/features.js";
import { initDownloadPage } from "./pages/download.js";
import { initBetaForm } from "./forms/beta-form.js";
import { initContactForm } from "./forms/contact-form.js";

// Runs the first time a view is shown, because these pages start hidden and have nothing
// to measure until then.
const once = (fn) => {
  let done = false;
  return () => { if (!done) { done = true; fn(); } };
};

initRouter();
initHeader();
initCopyButtons();
initClipWaves();
initGoButton();

initHeroScene();
initBarkLab();
initReportChart();

registerView("features", once(initFeaturesPage));
registerView("download", once(initDownloadPage));

initBetaForm();
initContactForm();

// Keep the current page across live updates of the artifact.
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === "function") hot.snapshot(() => ({ route: getLastToken() }));

// On the real site the opening route is in the path, in the artifact viewer it is in the
// hash, and after a live update it is whatever the snapshot kept. The router reads a whole
// URL, so hand it the address bar and let it work out which of the three this is.
const start = (data) => {
  show(data && data.route ? data.route : currentUrl(), { push: false, focus: false });
};

if (hot && typeof hot.ready === "function") hot.ready(start);
else start((hot && hot.data) || {});
