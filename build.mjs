// Assembles dist/, which is the whole of what gets served. Nothing outside it is public.
//
//   dist/index.html   the shell from src/page.html with src/views/*.html in its slots
//   dist/styles.css   src/styles/*.css concatenated in STYLES order
//   dist/sitemap.xml  one entry per page in src/scripts/app/routes.js
//   dist/robots.txt   points crawlers at the sitemap
//   dist/scripts/     copied from src/scripts, unchanged
//   dist/assets/      copied from src/assets, unchanged
//   dist/*            whatever src/static holds: favicon.ico and site.webmanifest
//
// src/scripts is copied rather than bundled. The browser resolves that ES module graph
// itself, so the files ship exactly as they are written. CSS is concatenated instead,
// because its order is the cascade and one request beats twenty.
//
// Everything the HTML references is a relative path, so dist/ is position-independent: it
// serves the same from a domain root, a subdirectory or a preview URL.
//
// Run with: node build.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { ROUTES } from "./src/scripts/app/routes.js";

// Where the site is served from, with no trailing slash. Canonical links, og:url, the
// structured data and sitemap.xml are all built from it, so this is the only line to change
// when the domain changes. It has to be absolute: a canonical or og:url cannot be relative.
const ORIGIN = "https://barkoff.app";

// The app's Google Play identity, in one place, the same way ORIGIN is. The views reach it
// through %PLAY_TEST% and %PLAY_STORE%.
//
// The pages link to %PLAY_STORE%, the public listing. %PLAY_TEST% is the tester opt-in page,
// kept here because it is the link that works while a track is still closed: a store listing
// answers 404 to anyone outside the test until the app is public.
const PLAY_PACKAGE = "com.reactifysolutions.barkoff";
const PLAY_TEST = `https://play.google.com/apps/testing/${PLAY_PACKAGE}`;
const PLAY_STORE = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

const src = (p) => new URL(`./src/${p}`, import.meta.url);
const out = (p) => new URL(`./dist/${p}`, import.meta.url);
const read = (p) => readFileSync(src(p), "utf8");

// Built from scratch every time, so a file that stops being generated also stops being
// served, rather than lingering in dist from an earlier build.
rmSync(out("."), { recursive: true, force: true });
mkdirSync(out("."), { recursive: true });

// Cascade order, so it is reviewable in one place: tokens first, then the shared layers,
// then the page-specific ones. motion.css last, because it overrides with !important.
const STYLES = [
  "tokens.css",
  "base.css",
  "typography.css",
  "buttons.css",
  "header.css",
  "views.css",
  "home-hero.css",
  "home-moments.css",
  "bark-lab.css",
  "home-how.css",
  "report-card.css",
  "home-closing.css",
  "footer.css",
  "copy-field.css",
  "features.css",
  "download.css",
  "forms.css",
  "privacy.css",
  "not-found.css",
  "motion.css",
];

/* ---------- styles.css ---------- */
// A module missing from STYLES would silently stop shipping, so compare the two.
const onDisk = readdirSync(src("styles")).filter((f) => f.endsWith(".css")).sort();
const missing = onDisk.filter((f) => !STYLES.includes(f));
const stale = STYLES.filter((f) => !onDisk.includes(f));
if (missing.length) throw new Error(`src/styles/${missing.join(", ")} missing from STYLES in build.mjs`);
if (stale.length) throw new Error(`STYLES lists ${stale.join(", ")}, which no longer exist`);

const css = STYLES.map((f) => read(`styles/${f}`).trim()).join("\n\n") + "\n";
writeFileSync(out("styles.css"), css);

/* ---------- copied verbatim ---------- */
// scripts/ and assets/ keep their shape, so the relative paths in the HTML resolve the same
// in dist as they do in src. static/ is the handful of files a browser expects at the root.
cpSync(src("scripts"), out("scripts"), { recursive: true });
cpSync(src("assets"), out("assets"), { recursive: true });
cpSync(src("static"), out("."), { recursive: true });

/* ---------- index.html ---------- */
const include = (html) => html.replace(/<!--@include (\S+)-->/g, (_, file) => read(`views/${file}`).trim());

// The static head describes the home page, because that is the document a crawler is served
// at the site root. The router rewrites the same tags on every navigation.
const fill = (html) => html
  .replaceAll("%ORIGIN%", ORIGIN)
  .replaceAll("%PLAY_TEST%", PLAY_TEST)
  .replaceAll("%PLAY_STORE%", PLAY_STORE)
  .replaceAll("%TITLE%", escapeAttr(ROUTES.home.title))
  .replaceAll("%DESCRIPTION%", escapeAttr(ROUTES.home.description));

const page = fill(include(include(read("page.html"))));

if (/<!--@include/.test(page)) throw new Error("Unresolved include in index.html");
// Any %NAME% left standing, not just the ones fill() knows, so a typo in a view is caught
// here rather than shipped as literal text.
const leftover = page.match(/%[A-Z][A-Z_]{2,}%/);
if (leftover) throw new Error(`Unresolved placeholder ${leftover[0]} in index.html`);
if (/\sstyle="/.test(page)) throw new Error("Inline style attribute in the HTML: move it to src/styles/");
// Inline CSS and JS stay banned, but structured data has to be in the document: a crawler
// reads the HTML it is served, and will not run the module graph to find it.
if (/<style|<script(?![^>]*(?:\ssrc=|\stype="application\/ld\+json"))/.test(page)) {
  throw new Error("Inline CSS or JS in the HTML: move it to src/styles/ or scripts/");
}
if (/\son(?:click|change|input|submit|load|error|focus|blur|key[a-z]+|mouse[a-z]+|pointer[a-z]+)=/.test(page)) {
  throw new Error("Inline event handler in the HTML: bind it in scripts/");
}
if (!page.slice(0, 8192).includes("<title>")) throw new Error("<title> must be in the first 8 KB");
for (const href of ["styles.css", "scripts/main.js"]) {
  if (!page.includes(href)) throw new Error(`index.html does not reference ${href}`);
  if (!existsSync(out(href))) throw new Error(`index.html references ${href}, which does not exist`);
}
// A link tag that points at a missing icon is worse than no icon, so check them all.
for (const asset of page.matchAll(/<link[^>]+href="((?:assets\/|favicon|site\.webmanifest)[^"]*)"/g)) {
  if (!existsSync(out(asset[1]))) throw new Error(`index.html links ${asset[1]}, which is not in src/assets or src/static. Run: node tools/make-icons.mjs`);
}

// The structured data is only useful if it parses.
for (const block of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  try { JSON.parse(block[1]); } catch (e) { throw new Error(`Invalid JSON-LD in src/page.html: ${e.message}`); }
}

writeFileSync(out("index.html"), page);

// Same document again, under the name static hosts serve for an unmatched path. Only the
// five real routes are rewritten to index.html, so anything else lands here and gets a
// genuine 404 status with the site's own not-found page, rather than a soft 404 at 200.
writeFileSync(out("404.html"), page);

/* ---------- sitemap.xml and robots.txt ---------- */
// Built from the same route table the router uses, so a new page cannot be added to the site
// and forgotten here. lastmod is the build date: the pages ship when the site does.
const lastmod = new Date().toISOString().slice(0, 10);
const urls = Object.values(ROUTES).map(({ path, priority }) =>
  `  <url>\n    <loc>${ORIGIN}/${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`
).join("\n");

writeFileSync(out("sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`);

writeFileSync(out("robots.txt"), `User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`);

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;
console.log(`dist/index.html  ${kb(page)}`);
console.log(`dist/styles.css  ${kb(css)}  (${STYLES.length} modules)`);
console.log(`dist/sitemap.xml ${Object.keys(ROUTES).length} pages at ${ORIGIN}`);
console.log(`dist/scripts, dist/assets and dist/ statics copied from src`);
