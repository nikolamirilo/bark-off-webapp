// The stacked column chart in the example report, drawn to scale as SVG, plus the
// equivalent data table behind the "Show as table" button. Level colours live in the
// stylesheet: the swatches carry .soft / .big and the bars read the same tokens.
import { $, el, svgEl } from "../core/dom.js";
import { clamp } from "../core/math.js";
import { token } from "../core/theme.js";

const DATA = [
  { h: "8 AM", range: "8 to 9 AM", soft: 2, big: 1 },
  { h: "9 AM", range: "9 to 10 AM", soft: 0, big: 0 },
  { h: "10 AM", range: "10 to 11 AM", soft: 1, big: 0 },
  { h: "11 AM", range: "11 AM to 12 PM", soft: 0, big: 0 },
  { h: "12 PM", range: "12 to 1 PM", soft: 0, big: 1 },
  { h: "1 PM", range: "1 to 2 PM", soft: 0, big: 0 },
  { h: "2 PM", range: "2 to 2:14 PM", soft: 0, big: 0 },
];

// A column with a rounded top only, so stacked segments still meet flush.
const roundTop = (x0, y0, w, h, r) => {
  r = Math.min(r, h, w / 2);
  return `M${x0},${y0 + h}V${y0 + r}A${r},${r} 0 0 1 ${x0 + r},${y0}H${x0 + w - r}A${r},${r} 0 0 1 ${x0 + w},${y0 + r}V${y0 + h}Z`;
};

export function initReportChart() {
  const box = $("#rc-chart");
  if (!box) return;
  const softCol = token("--soft-l"), bigCol = token("--big-l");
  const tip = el("div", { class: "tooltip", hidden: "" });
  let lastW = 0;

  // Drawn at the box's real width, so text stays 11px on every screen.
  function render() {
    const W = Math.round(box.clientWidth);
    if (!W || W === lastW) return;
    lastW = W;
    const H = 190, padL = 28, padR = 6, padT = 12, padB = 28, max = 3;
    const pw = W - padL - padR, ph = H - padT - padB;
    const y = (v) => padT + ph - (v / max) * ph;
    const band = pw / DATA.length, colW = Math.min(24, band * 0.5);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Stacked columns of woofs per hour. 8 AM: 2 soft and 1 big. 10 AM: 1 soft. 12 PM: 1 big. Other hours: none." });
    const grid = svgEl("g", { class: "grid" }), axis = svgEl("g", { class: "axis" });
    for (let v = 0; v <= max; v++) {
      const yy = Math.round(y(v)) + 0.5;
      if (v > 0) grid.append(svgEl("line", { x1: padL, x2: W - padR, y1: yy, y2: yy }));
      const tx = svgEl("text", { x: padL - 10, y: yy + 4, "text-anchor": "end" });
      tx.textContent = v;
      axis.append(tx);
    }
    svg.append(grid, svgEl("line", { class: "baseline", x1: padL, x2: W - padR, y1: Math.round(y(0)) + 0.5, y2: Math.round(y(0)) + 0.5 }));
    const unit = ph / max;
    DATA.forEach((d, i) => {
      const cx = padL + band * i + band / 2;
      const g = svgEl("g", { class: "col", tabindex: "0", "aria-label": `${d.range}: ${d.soft} soft, ${d.big} big` });
      g.append(svgEl("rect", { class: "hit", x: cx - band / 2 + 1, y: padT, width: Math.max(0, band - 2), height: ph, rx: 6 }));
      if (d.soft) {
        const h = d.soft * unit - (d.big ? 1 : 0);
        const y0 = y(0) - d.soft * unit + (d.big ? 1 : 0);
        g.append(d.big
          ? svgEl("rect", { class: "seg", x: cx - colW / 2, y: y0, width: colW, height: h, fill: softCol })
          : svgEl("path", { class: "seg", d: roundTop(cx - colW / 2, y0, colW, h, 4), fill: softCol }));
      }
      if (d.big) {
        const base = y(0) - d.soft * unit;
        g.append(svgEl("path", { class: "seg", d: roundTop(cx - colW / 2, base - d.big * unit, colW, d.big * unit - (d.soft ? 1 : 0), 4), fill: bigCol }));
      }
      const label = svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle" });
      label.textContent = band < 46 ? d.h.replace(" AM", "a").replace(" PM", "p") : d.h;
      axis.append(label);
      const showTip = () => {
        tip.replaceChildren(el("b", { text: d.range }), el("br"));
        if (!d.soft && !d.big) tip.append(document.createTextNode("No woofs"));
        else {
          tip.append(el("span", { class: "tk soft" }), el("b", { text: String(d.soft) }), document.createTextNode(" soft bark"), el("br"));
          tip.append(el("span", { class: "tk big" }), el("b", { text: String(d.big) }), document.createTextNode(" big bark"));
        }
        tip.style.left = `${clamp(cx, 70, W - 70)}px`;
        tip.style.top = `${Math.max(padT, y(d.soft + d.big))}px`;
        tip.hidden = false;
      };
      g.addEventListener("pointerenter", showTip);
      g.addEventListener("focus", showTip);
      g.addEventListener("pointerleave", () => { tip.hidden = true; });
      g.addEventListener("blur", () => { tip.hidden = true; });
      svg.append(g);
    });
    svg.append(axis);
    box.replaceChildren(svg, tip);
    tip.hidden = true;
  }

  render();
  if ("ResizeObserver" in window) new ResizeObserver(render).observe(box);
  else window.addEventListener("resize", render);

  const tbody = $("#rc-tbody");
  DATA.forEach((d) => {
    tbody.append(el("tr", {}, [el("td", { text: d.range }), el("td", { text: String(d.soft) }), el("td", { text: String(d.big) })]));
  });
  const btn = $("#rc-table-btn"), table = $("#rc-table");
  btn.addEventListener("click", () => {
    table.hidden = !table.hidden;
    btn.setAttribute("aria-expanded", String(!table.hidden));
    btn.textContent = table.hidden ? "Show as table" : "Hide table";
  });
}
