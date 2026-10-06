// Regenerates every icon the site links to, from src/assets/mascot.webp. Run it when the
// mascot changes; the output is committed under src/, so a normal build never needs it.
//
//   node tools/make-icons.mjs
//
// macOS only: it shells out to sips to read the .webp the app repo ships and to qlmanage to
// rasterise the social card. Both are part of the OS.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodePng, encodePng } from "./png.mjs";
import { resize, tile, buildIco } from "./raster.mjs";

const root = new URL("..", import.meta.url);
const at = (p) => new URL(p, root).pathname;
const work = join(tmpdir(), `barkoff-icons-${process.pid}`);
mkdirSync(work, { recursive: true });
mkdirSync(at("src/assets/icons"), { recursive: true });

const NIGHT = "#13121f"; // --night, so the icon sits on the same ground as the page
const sips = (...args) => execFileSync("sips", args, { stdio: ["ignore", "ignore", "pipe"] });

/* ---------- source: the mascot's head, cropped from the 640px illustration ----------
   mascot-head.webp is only 160px, which upscales badly to a 512px icon, so the head is
   taken from the large one instead. The crop is tuned to leave both ears inside the frame. */
const mascotPng = join(work, "mascot.png");
sips("-s", "format", "png", at("src/assets/mascot.webp"), "--out", mascotPng);
sips("-c", "400", "400", "--cropOffset", "0", "212", mascotPng, "--out", join(work, "head.png"));
const head = decodePng(readFileSync(join(work, "head.png")));

// The cutout carries a few thousand almost-transparent white pixels, left over from however
// it was masked. They are invisible on white and a grey haze on the night background, so
// pull the bottom of the alpha range down to nothing. Ramped, not clipped, so the soft fur
// edges above the threshold do not gain a hard outline.
const MATTE = 16;
for (let i = 3; i < head.data.length; i += 4) {
  head.data[i] = Math.max(0, Math.round((head.data[i] - MATTE) * (255 / (255 - MATTE))));
}

/* ---------- favicons and app icons ---------- */
// inset leaves room inside the tile; radius is the corner rounding, as a fraction of it.
const ICONS = [
  { file: "src/assets/icons/favicon-96.png", size: 96, inset: 0.04, radius: 0.22 },
  { file: "src/assets/icons/icon-192.png", size: 192, inset: 0.04, radius: 0.22 },
  { file: "src/assets/icons/icon-512.png", size: 512, inset: 0.04, radius: 0.22 },
  // iOS rounds the corners itself, so this one is a full-bleed square.
  { file: "src/assets/icons/apple-touch-icon.png", size: 180, inset: 0.08, radius: 0 },
  // Android can mask this to any shape, so everything that matters stays in the middle 80%.
  { file: "src/assets/icons/icon-maskable-512.png", size: 512, inset: 0.14, radius: 0 },
];

for (const { file, size, inset, radius } of ICONS) {
  writeFileSync(at(file), encodePng(tile({ source: head, size, inset, radius, background: NIGHT })));
  console.log(`${file.padEnd(38)} ${size}x${size}`);
}

// One .ico with the three sizes Windows and the older browsers ask for. The corner radius
// is dropped below 32px, where it costs more pixels than it buys.
const ico = buildIco([16, 32, 48].map((size) => ({
  size,
  png: encodePng(tile({ source: head, size, inset: 0.04, radius: size < 32 ? 0 : 0.22, background: NIGHT })),
})));
// favicon.ico is served from the root, so it lives in static/ rather than assets/.
writeFileSync(at("src/static/favicon.ico"), ico);
console.log(`${"src/static/favicon.ico".padEnd(38)} 16, 32, 48`);

/* ---------- social card ----------
   Built as SVG and rasterised through QuickLook, which is WebKit, so ui-rounded resolves to
   SF Pro Rounded: the nearest thing on the system to the site's Fredoka.

   QuickLook always returns a square, and it rescales anything that is not already one, so
   the card is drawn into the top of a square canvas at 1:1 and cropped back out. */
const OG_W = 1200, OG_H = 630;
const headFor = (px) => `data:image/png;base64,${encodePng(resize(head, px, px)).toString("base64")}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_W}">
  <defs>
    <radialGradient id="lamp" cx="76%" cy="42%" r="52%">
      <stop offset="0%" stop-color="#f79c23" stop-opacity=".30"/>
      <stop offset="100%" stop-color="#f79c23" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="${NIGHT}"/>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#lamp)"/>
  <image href="${headFor(620)}" x="672" y="34" width="560" height="560"/>
  <g font-family="ui-rounded, -apple-system, Helvetica, sans-serif">
    <text x="88" y="214" font-size="46" font-weight="600" fill="#f79c23" letter-spacing="2">BARKOFF</text>
    <text x="88" y="316" font-size="78" font-weight="700" fill="#fff4e4">When they bark,</text>
    <text x="88" y="406" font-size="78" font-weight="700" fill="#fff4e4">you answer.</text>
    <text x="88" y="486" font-size="34" font-weight="500" fill="#bdb5cc">It listens while you are out and plays</text>
    <text x="88" y="532" font-size="34" font-weight="500" fill="#bdb5cc">your own voice. Free for Android.</text>
  </g>
</svg>`;

const svgPath = join(work, "og.svg");
writeFileSync(svgPath, svg);
execFileSync("qlmanage", ["-t", "-s", String(OG_W), "-o", work, svgPath], { stdio: "ignore" });

const rendered = decodePng(readFileSync(join(work, "og.svg.png")));
if (rendered.w !== OG_W || rendered.h !== OG_W) {
  throw new Error(`QuickLook returned ${rendered.w}x${rendered.h}, expected ${OG_W}x${OG_W}: the card would be rescaled`);
}
const card = { w: OG_W, h: OG_H, data: rendered.data.subarray(0, OG_W * OG_H * 4) };
// JPEG, not PNG: the card is a painted illustration with no flat colour to keep crisp and no
// transparency to preserve, and the scrapers that fetch it time out on slow responses.
const cardPng = join(work, "card.png");
writeFileSync(cardPng, encodePng(card));
sips("-s", "format", "jpeg", "-s", "formatOptions", "88", cardPng, "--out", at("src/assets/og-image.jpg"));
console.log(`${"src/assets/og-image.jpg".padEnd(38)} ${OG_W}x${OG_H}`);

rmSync(work, { recursive: true, force: true });
