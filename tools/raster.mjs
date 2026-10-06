// Raster operations for the icon generator. Everything resamples and blends in premultiplied
// alpha, because the mascot is cut out against transparent black: compositing straight RGBA
// would pull that black into every soft edge and leave a dark fringe around the fur.

/** @typedef {{ w: number, h: number, data: Buffer }} Bitmap RGBA, 4 bytes per pixel. */

const premultiply = ({ w, h, data }) => {
  const out = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    out[i * 4] = data[i * 4] * a;
    out[i * 4 + 1] = data[i * 4 + 1] * a;
    out[i * 4 + 2] = data[i * 4 + 2] * a;
    out[i * 4 + 3] = a * 255;
  }
  return out;
};

// Tent filter, with the radius widened on downscale so every source pixel is sampled.
// Narrower than Lanczos, but it never rings, which matters on flat brand colour.
function axisWeights(srcLen, dstLen) {
  const scale = dstLen / srcLen;
  const radius = scale < 1 ? 1 / scale : 1;
  const rows = [];
  for (let d = 0; d < dstLen; d++) {
    const center = (d + 0.5) / scale;
    const from = Math.max(0, Math.floor(center - radius));
    const to = Math.min(srcLen - 1, Math.ceil(center + radius));
    const idx = [], wts = [];
    let total = 0;
    for (let s = from; s <= to; s++) {
      const t = Math.abs((s + 0.5 - center) / radius);
      const weight = t >= 1 ? 0 : 1 - t;
      if (weight > 0) { idx.push(s); wts.push(weight); total += weight; }
    }
    for (let i = 0; i < wts.length; i++) wts[i] /= total;
    rows.push({ idx, wts });
  }
  return rows;
}

/** Resample to exactly w x h. */
export function resize(bmp, w, h) {
  const src = premultiply(bmp);
  const cols = axisWeights(bmp.w, w);
  const rows = axisWeights(bmp.h, h);

  const mid = new Float32Array(w * bmp.h * 4);
  for (let y = 0; y < bmp.h; y++) {
    for (let x = 0; x < w; x++) {
      const { idx, wts } = cols[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < idx.length; k++) {
        const s = (y * bmp.w + idx[k]) * 4, weight = wts[k];
        r += src[s] * weight; g += src[s + 1] * weight; b += src[s + 2] * weight; a += src[s + 3] * weight;
      }
      const d = (y * w + x) * 4;
      mid[d] = r; mid[d + 1] = g; mid[d + 2] = b; mid[d + 3] = a;
    }
  }

  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const { idx, wts } = rows[y];
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < idx.length; k++) {
        const s = (idx[k] * w + x) * 4, weight = wts[k];
        r += mid[s] * weight; g += mid[s + 1] * weight; b += mid[s + 2] * weight; a += mid[s + 3] * weight;
      }
      const d = (y * w + x) * 4;
      // Back to straight alpha for storage.
      out[d + 3] = Math.round(Math.min(255, Math.max(0, a)));
      const inv = a > 0 ? 255 / a : 0;
      out[d] = Math.round(Math.min(255, Math.max(0, r * inv)));
      out[d + 1] = Math.round(Math.min(255, Math.max(0, g * inv)));
      out[d + 2] = Math.round(Math.min(255, Math.max(0, b * inv)));
    }
  }
  return { w, h, data: out };
}

const hexToRgb = (hex) => {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

// Coverage of a rounded square, sampled on a 4x4 grid so the corners are antialiased.
function cornerCoverage(size, radius) {
  const cov = new Float32Array(size * size);
  const S = 4, step = 1 / S;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) * step, py = y + (sy + 0.5) * step;
          // Distance outside the rounded rect's inner rectangle, per axis.
          const dx = Math.max(radius - px, px - (size - radius), 0);
          const dy = Math.max(radius - py, py - (size - radius), 0);
          if (Math.hypot(dx, dy) <= radius) hits++;
        }
      }
      cov[y * size + x] = hits / (S * S);
    }
  }
  return cov;
}

/**
 * One square icon: `source` scaled to fit inside `size` with `inset` (a fraction of the
 * tile) of breathing room, centred on `background`, clipped to a rounded square.
 * `radius` is a fraction of the tile: 0 is a full-bleed square, 0.5 a circle.
 */
export function tile({ source, size, inset = 0, background = "#13121f", radius = 0 }) {
  const inner = Math.round(size * (1 - inset * 2));
  const art = resize(source, inner, inner);
  const [br, bg, bb] = hexToRgb(background);
  const off = Math.round((size - inner) / 2);
  const cov = radius > 0 ? cornerCoverage(size, radius * size) : null;

  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = (y * size + x) * 4;
      let r = br, g = bg, b = bb;
      const ax = x - off, ay = y - off;
      if (ax >= 0 && ay >= 0 && ax < inner && ay < inner) {
        const s = (ay * inner + ax) * 4;
        const a = art.data[s + 3] / 255;
        r = art.data[s] * a + br * (1 - a);
        g = art.data[s + 1] * a + bg * (1 - a);
        b = art.data[s + 2] * a + bb * (1 - a);
      }
      const c = cov ? cov[y * size + x] : 1;
      data[d] = Math.round(r); data[d + 1] = Math.round(g); data[d + 2] = Math.round(b);
      data[d + 3] = Math.round(c * 255);
    }
  }
  return { w: size, h: size, data };
}

/** Pack already-encoded PNGs into one .ico. Every browser in use reads PNG-in-ICO. */
export function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dir = [];
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // 0 means 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4);  // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.png)]);
}
