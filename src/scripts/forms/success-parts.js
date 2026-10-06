// The pieces both success screens are built from.
import { el, icon, svgEl } from "../core/dom.js";

const PAW_VIEWBOX = "0 0 48.839 48.839"; // the paw symbol is not on the 24x24 icon grid

// The confirmation is already on its way as this renders.
export const sentNote = (email) => {
  const p = el("p", { class: "sent-note" });
  p.append(icon("i-mail"), el("span", { text: `A confirmation is on its way to ${email}. If it has not arrived in a few minutes, look in your spam folder.` }));
  return p;
};

export const stepItem = (title, text) => el("li", {}, [el("div", {}, [el("b", { text: title }), el("span", { text })])]);

export const burst = () => {
  const svg = svgEl("svg", { viewBox: PAW_VIEWBOX });
  svg.append(svgEl("use", { href: "#i-paw" }));
  return el("div", { class: "burst", "aria-hidden": "true" }, [svg]);
};
