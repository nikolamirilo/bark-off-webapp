# BarkOff website

Marketing site for the [BarkOff](https://github.com/nikolamirilo/bark-off) app. It covers:

- **Landing page** with an animated hero and the **Bark Lab**, a live demo that runs the app's own bark detection rules on simulated sounds
- **Features** with a closer look at detection, the two messages, calibration, cooldown and reports
- **Download** with a direct APK download, install steps and a QR code for computer visitors. Google Play is shown as coming soon
- **Testing group** signup for the Google Play test, with the next steps for testers
- **Contact** form plus email, Instagram and TikTok
- **Privacy notes** (draft)

This branch holds the interactive prototype for review. The forms validate and show their success screens, but nothing is sent yet.

## Structure

Everything under `src/` is the site. Everything under `dist/` is the build, and `dist/` is
the only thing published — it is rebuilt from scratch on every run and is not committed.

```
src/        the site:  page.html, views/, styles/, scripts/, assets/, static/
tools/      one-shot generators and the preview server. Never shipped
build.mjs   src/ -> dist/
dist/       the build. Gitignored, published as-is
```

CSS, JavaScript and markup are separate files all the way down. No HTML file carries a
`style` attribute, a `<style>` block, a `<script>` block or an `on*` handler, and
`node build.mjs` fails if one appears.

### Edit these

| Path | What it is |
| --- | --- |
| `src/page.html` | Shell: header, footer, icon sprite and the include slots |
| `src/views/*.html` | One file per page. Markup only |
| `src/styles/*.css` | One file per concern. `tokens.css` holds the design tokens |
| `src/scripts/` | ES modules, one per concern (see below). Copied into the build unchanged |
| `src/scripts/app/routes.js` | The page table: path, title, description and sitemap priority, one entry per page |
| `src/assets/` | Illustrations and the bark sound, converted from the app repo |
| `src/static/` | The files a browser expects at the root: `favicon.ico` and `site.webmanifest` |
| `vercel.json` | The build command, the output directory, and the rewrites that let `/features` and friends serve `index.html` |

### Built, do not edit by hand

| Path | Built from |
| --- | --- |
| `dist/index.html` | `src/page.html` + `src/views/*.html` |
| `dist/404.html` | The same document, under the name hosts serve for an unmatched path |
| `dist/styles.css` | `src/styles/*.css`, concatenated in the order listed in `build.mjs` |
| `dist/sitemap.xml` | One entry per page in `src/scripts/app/routes.js` |
| `dist/robots.txt` | Points crawlers at the sitemap |
| `dist/scripts/`, `dist/assets/`, `dist/favicon.ico`, `dist/site.webmanifest` | Copied verbatim from `src/` |
| `src/static/favicon.ico`, `src/assets/icons/*`, `src/assets/og-image.jpg` | `node tools/make-icons.mjs`, from `src/assets/mascot.webp`. Committed |

`src/scripts/` is copied rather than bundled: the browser resolves the ES module graph
itself, so the files ship exactly as written. CSS is concatenated because its order *is* the
cascade, and one request beats twenty.

Every path in the built HTML is relative, so `dist/` is position-independent — it serves the
same from a domain root, a subdirectory or a preview URL.

### The modules

| Path | Responsibility |
| --- | --- |
| `src/scripts/main.js` | Entry point. The only file that knows the whole app, and the only one that calls the init functions |
| `src/scripts/core/` | `dom` helpers, `math`, `motion` (reduced-motion), `theme` (reads the CSS tokens) |
| `src/scripts/detector/` | `bark-detector.js` is a port of the app's own detector. Plus its plain-language wording, sound shapes and the two messages |
| `src/scripts/app/router.js` | Which view is visible and what the document's metadata says it is. UI subscribes with `onRouteChange`; pages register lazy setup with `registerView` |
| `tools/` | One-shot generators: `make-icons.mjs` for the icon set, `serve.mjs` for local preview |
| `src/scripts/ui/` | Header and drawer, copy buttons, waveform bars, the GO toggle |
| `src/scripts/scenes/hero-scene.js` | The dog-and-phone animation |
| `src/scripts/scenes/bark-lab/` | `simulation.js` is the model and touches no DOM. `scope.js` paints, `speaker.js` is the card, `audio.js` is the sound, `index.js` wires them to the page |
| `src/scripts/scenes/report-chart.js` | The example report's stacked columns and its data table |
| `src/scripts/pages/` | Per-page setup that runs on first visit |
| `src/scripts/forms/` | Shared validation plus the two forms |

Every module exports `init*` functions and does nothing on import, so the startup order
lives in `main.js` alone.

## Build

```bash
node build.mjs
```

This empties `dist/`, writes `index.html`, `404.html`, `styles.css`, `sitemap.xml` and
`robots.txt` into it, and copies `src/scripts`, `src/assets` and `src/static` alongside
them. It refuses to build if a stylesheet in `src/styles/` is missing from the order list in
`build.mjs`, if CSS, JavaScript or an event handler has crept back into the markup, if a
`<link>` points at an icon that is not on disk, or if the structured data does not parse.

## Preview

`index.html` has no `<html>` or `<head>` tags, because the artifact viewer adds them when
it is published. It loads `styles.css` and `scripts/main.js` as siblings, so preview it over
a server rather than opening the file directly:

```bash
npm run serve             # builds, then http://localhost:8080
```

That is `node build.mjs && node tools/serve.mjs`. Use this server rather than
`python3 -m http.server`: it serves `dist/` and sends unknown paths to `index.html`, which is
what makes `/features` work on a cold load, the same as the host does in production.

Every edit needs `node build.mjs` before it shows up, including the ones under
`src/scripts/`, because the browser is reading the copy in `dist/`.

## Addresses and SEO

Each page has a real URL (`/features`, `/download`, ...) so it can be linked and indexed on
its own. The router swaps the title, description, canonical and Open Graph tags on every
navigation, and `src/scripts/app/routes.js` is the one place all of it is written down: add a
page there and the router, the static head and `sitemap.xml` all pick it up.

The artifact viewer serves the page from a path we do not own and passes nothing through but
the hash, so there the router falls back to `#features` and rewrites the links to match. It
tells the two apart by comparing the page's origin to the canonical link.

Two things to know before going live:

- **The domain is set in one place:** `ORIGIN` at the top of `build.mjs`, currently
  `https://barkoff.app`. It feeds the canonical links, `og:url`, the structured data and
  `sitemap.xml`. Change it there and rebuild. *It was picked to match the `@barkoff.app`
  social handles and has not been confirmed.*
- **The host serves `dist/`, not the repo root.** `vercel.json` sets `buildCommand` and
  `outputDirectory`; on another host, point it at `dist` and run `npm run build`.
- **The host has to rewrite unknown paths to `index.html`,** or `/features` will 404 when it
  is opened cold. `vercel.json` does this, for those five paths only, so anything else falls
  through to `404.html` and gets a real 404 status instead of a soft one. On Netlify the
  equivalent is a `_redirects` file with a line per route and `/* /404.html 404` last.
  GitHub Pages cannot rewrite at all, but it does serve `404.html`, so deep links work there
  with a 404 status attached.

## Icons

`src/static/favicon.ico`, `src/assets/icons/*` and the `src/assets/og-image.jpg` social card
are generated from `src/assets/mascot.webp`:

```bash
node tools/make-icons.mjs
```

The output is committed under `src/`, so a normal build never runs it. Re-run it when the mascot changes.
It is macOS only: it reads the `.webp` through `sips` and rasterises the social card through
`qlmanage`, so the card's type is SF Pro Rounded, the closest thing on the system to the
site's Fredoka.

## Publishing a new APK

The **Download APK** button and the QR code both point to:

```
https://github.com/nikolamirilo/bark-off/releases/latest/download/barkoff.apk
```

GitHub always serves this file from the newest release of the app repo, so the site does not change when you ship a new version.

1. Build the APK in the app repo: `eas build -p android --profile preview`
2. Download the `.apk` from the EAS build page and rename it to `barkoff.apk`.
3. On [nikolamirilo/bark-off](https://github.com/nikolamirilo/bark-off/releases/new), create a release (for example `v1.0.0`) and attach `barkoff.apk`.

Until the first release exists, the button opens a GitHub "not found" page.

## Before going live

- Confirm the domain and set `ORIGIN` in `build.mjs` to match, then rebuild.
- Make sure the host rewrites unknown paths to `index.html` (see **Addresses and SEO**).
- Publish the first APK release (see above).
- Connect the contact and testing group forms to a mailbox or form service.
- Swap the hand-drawn "Coming soon to Google Play" badge for the official badge once the app is on Google Play.
- Have the privacy notes reviewed.
- Submit `sitemap.xml` in Google Search Console, and check the FAQ rich result with the
  [Rich Results Test](https://search.google.com/test/rich-results).
