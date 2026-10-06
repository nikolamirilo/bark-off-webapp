// The pieces both success screens are built from.
import { el, icon, svgEl } from "../core/dom.js";

const PAW_VIEWBOX = "0 0 48.839 48.839"; // the paw symbol is not on the 24x24 icon grid

export const protoNote = () => {
  const p = el("p", { class: "proto-note" });
  p.append(icon("i-info"), el("span", { text: "This is a prototype, so nothing was sent. On the live site this goes to barkoffapp@gmail.com." }));
  return p;
};

export const stepItem = (title, text) => el("li", {}, [el("div", {}, [el("b", { text: title }), el("span", { text })])]);

export const burst = () => {
  const svg = svgEl("svg", { viewBox: PAW_VIEWBOX });
  svg.append(svgEl("use", { href: "#i-paw" }));
  return el("div", { class: "burst", "aria-hidden": "true" }, [svg]);
};
