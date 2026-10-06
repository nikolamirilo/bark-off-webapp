// Small DOM helpers. Nothing in here knows about BarkOff.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const SVG_NS = "http://www.w3.org/2000/svg";

// `attrs` takes `class` and `text` as shorthands, `vars` for CSS custom properties,
// and anything else as a plain attribute.
export const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "vars") for (const [name, value] of Object.entries(v)) node.style.setProperty(name, value);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) node.append(c);
  return node;
};

export const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

// A `<use>` reference into the sprite in page.html.
export const icon = (id, cls = "icon") => {
  const svg = svgEl("svg", { class: cls, "aria-hidden": "true" });
  svg.append(svgEl("use", { href: "#" + id }));
  return svg;
};
