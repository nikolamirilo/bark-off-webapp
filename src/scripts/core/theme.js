// Reads the design tokens from styles/tokens.css, so canvas and SVG drawing stay in
// step with the stylesheet instead of repeating its colours.

export const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const hexA = (hex, a) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
