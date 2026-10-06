// A minimal 8-bit RGBA PNG codec plus the few raster operations the icon generator needs.
// Node ships zlib, so this keeps icon generation dependency free; nothing here is general
// purpose, it only handles what sips writes: 8 bits per sample, no interlacing.
import { inflateSync, deflateSync } from "node:zlib";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @typedef {{ w: number, h: number, data: Buffer }} Bitmap RGBA, 4 bytes per pixel. */

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error("not a PNG");
  let w = 0, h = 0, depth = 0, colorType = 0;
  const idat = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      depth = body[8]; colorType = body[9];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported color type ${colorType}`);
      if (body[12] !== 0) throw new Error("interlaced PNG is not supported");
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = w * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    // Undo the per-scanline filter (PNG spec 9.2). `a` is the pixel to the left, `b` above.
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const s = x * channels, d = (y * w + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
      out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, data: out };
}

// Try all five filters on a scanline and keep the one whose output has the smallest sum of
// absolute values, the heuristic the PNG spec suggests. Photographic icons shrink by roughly
// half against writing every line unfiltered.
function filterScanline(line, prev, stride, BPP, out) {
  let best = null;
  for (let type = 0; type < 5; type++) {
    const cand = Buffer.alloc(stride);
    let score = 0;
    for (let i = 0; i < stride; i++) {
      const a = i >= BPP ? line[i - BPP] : 0;
      const b = prev[i];
      const c = i >= BPP ? prev[i - BPP] : 0;
      let v;
      if (type === 0) v = line[i];
      else if (type === 1) v = line[i] - a;
      else if (type === 2) v = line[i] - b;
      else if (type === 3) v = line[i] - ((a + b) >> 1);
      else {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = line[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      cand[i] = v & 0xff;
      score += cand[i] < 128 ? cand[i] : 256 - cand[i];
    }
    if (best === null || score < best.score) best = { type, cand, score };
  }
  out[0] = best.type;
  best.cand.copy(out, 1);
}

export function encodePng({ w, h, data }) {
  // A fully opaque image does not need the alpha channel, and dropping it is a quarter of
  // the bytes before compression even starts. The icon tiles are opaque apart from their
  // rounded corners, so this applies to the square ones.
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { opaque = false; break; }

  const channels = opaque ? 3 : 4;
  const stride = w * channels;
  let pixels = data;
  if (opaque) {
    pixels = Buffer.alloc(w * h * 3);
    for (let i = 0, o = 0; i < data.length; i += 4, o += 3) {
      pixels[o] = data[i]; pixels[o + 1] = data[i + 1]; pixels[o + 2] = data[i + 2];
    }
  }

  const raw = Buffer.alloc((stride + 1) * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const line = pixels.subarray(y * stride, (y + 1) * stride);
    filterScanline(line, prev, stride, channels, raw.subarray(y * (stride + 1), (y + 1) * (stride + 1)));
    prev = line;
  }
  const chunk = (type, body) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "ascii");
    body.copy(out, 8);
    out.writeInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6; // 8-bit RGB or RGBA
  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
