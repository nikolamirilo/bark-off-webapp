// Owns which view is visible and what the document says it is, and nothing else: UI that has
// to react to a navigation subscribes with onRouteChange, and pages that need lazy setup
// register with registerView.
//
// Two addressing schemes, because the site has two homes:
//
//   paths   /features, /download, ... on the real domain. What the markup links to, what the
//           sitemap lists, and the only form a crawler can index.
//   #tokens #features, #download, ... in the artifact viewer, which serves the page from a
//           path we do not own and passes nothing through but the hash.
//
// The canonical link tells the two apart: build.mjs writes the site's real home URL into it,
// so if this document is being served from somewhere else, paths cannot be used and every
// route link is rewritten back to a #token at boot.
import { $, $$ } from "../core/dom.js";
import { reduceMotion } from "../core/motion.js";
import { ROUTES, ANCHORS, NOT_FOUND, VIEWS } from "./routes.js";

const head = {
  title: $("title"),
  description: $('meta[name="description"]'),
  robots: $('meta[name="robots"]'),
  canonical: $('link[rel="canonical"]'),
  ogTitle: $('meta[property="og:title"]'),
  ogDescription: $('meta[property="og:description"]'),
  ogUrl: $('meta[property="og:url"]'),
};

const HOME = new URL(head.canonical.getAttribute("href"), location.href);
const BASE = HOME.pathname.endsWith("/") ? HOME.pathname : `${HOME.pathname}/`;
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const PATHS = Object.fromEntries(VIEWS.map((v) => [ROUTES[v].path, v]));

// Only the real site, or a local copy of it, may put routes in the path.
const usePaths = location.origin === HOME.origin || LOCAL;

let currentView = "home";
let lastToken = null;
const viewHooks = {};
const listeners = [];

export const getCurrentView = () => currentView;
export const getLastToken = () => lastToken;

/** Run `hook` the first time `view` becomes visible. */
export const registerView = (view, hook) => { viewHooks[view] = hook; };

/** Called after every navigation, including the one at boot. */
export const onRouteChange = (fn) => { listeners.push(fn); };

/**
 * Which view a URL asks for. The hash is read first: it is all the artifact viewer has, and
 * on the real site it only ever carries a home-page section such as /#how.
 */
function resolve(url) {
  const hash = url.hash.replace(/^#/, "");
  if (hash) {
    if (ANCHORS[hash]) return { view: ANCHORS[hash], anchor: hash };
    if (hash === "home" || hash === "top") return { view: "home", anchor: null };
    if (Object.hasOwn(PATHS, hash)) return { view: PATHS[hash], anchor: null };
  }
  if (!usePaths) return { view: hash ? "notfound" : "home", anchor: null };

  if (!url.pathname.startsWith(BASE)) return { view: "notfound", anchor: null };
  let segment = url.pathname.slice(BASE.length).replace(/\/+$/, "");
  if (segment === "index.html") segment = "";
  if (Object.hasOwn(PATHS, segment)) return { view: PATHS[segment], anchor: null };
  return { view: "notfound", anchor: null };
}

/**
 * The address bar entry for a view, in whichever scheme this copy of the site is using.
 * A view with no route is the 404, which has no address of its own: it keeps whatever was
 * asked for, so the bad URL stays visible and reloadable instead of silently becoming home.
 */
function href(view, anchor, asked) {
  if (!ROUTES[view]) return usePaths ? asked.pathname + asked.hash : asked.hash || "#404";
  if (!usePaths) return `#${anchor || (view === "home" ? "home" : ROUTES[view].path)}`;
  const path = BASE + ROUTES[view].path;
  return anchor ? `${path}#${anchor}` : path;
}

/**
 * Point the document's metadata at the view now on screen. A crawler only ever sees the home
 * page's version of these, but a browser, a share sheet and the history entry all read them
 * live, so they are kept honest on every navigation.
 */
function applyMeta(view) {
  const meta = ROUTES[view] || NOT_FOUND;
  document.title = meta.title;
  head.description.content = meta.description;
  head.ogTitle.content = meta.title;
  head.ogDescription.content = meta.description;

  const indexable = Boolean(ROUTES[view]);
  head.robots.content = indexable ? "index, follow" : "noindex, follow";
  // A 404 is its own address and should not claim to be a real page.
  const url = indexable ? new URL(ROUTES[view].path, HOME).href : location.href;
  head.canonical.href = url;
  head.ogUrl.content = url;
}

export function show(t, { push = true, focus = true, smooth = true } = {}) {
  const url = t instanceof URL ? t : new URL(t.startsWith("#") ? t : `#${t}`, location.href);
  const r = resolve(url);
  const token = r.anchor || (ROUTES[r.view] ? r.view : "notfound");
  const changed = r.view !== currentView || lastToken === null;
  lastToken = token;

  if (changed) {
    $$(".view").forEach((v) => { v.hidden = v.dataset.view !== r.view; });
    currentView = r.view;
    applyMeta(r.view);
    if (viewHooks[r.view]) viewHooks[r.view]();
  }
  $$("[data-nav]").forEach((a) => {
    const on = a.dataset.nav === (r.anchor === "how" ? "how" : r.view);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  listeners.forEach((fn) => fn(r));

  if (push) {
    try { history.pushState(null, "", href(r.view, r.anchor, url)); } catch (_) { /* no history in this frame */ }
  }
  if (r.anchor) {
    const target = $(`[data-anchor="${r.anchor}"]`);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: changed || reduceMotion || !smooth ? "auto" : "smooth", block: "start" }));
  } else {
    window.scrollTo({ top: 0, behavior: "auto" });
    if (focus && changed) {
      const h = $(`.view[data-view="${r.view}"] h1`);
      if (h) h.focus({ preventScroll: true });
    }
  }
}

/** The view the current address bar is asking for. */
export const currentUrl = () => new URL(location.href);

/**
 * Swap the markup's real paths back to #tokens. Only runs where paths cannot work, and only
 * on the authored forms: "." for home, ".#how" for a home section, "download" for a page.
 * Without it the links still navigate, because the click handler catches them, but opening
 * one in a new tab would leave the viewer's own path behind.
 */
function useHashLinks() {
  for (const a of $$("a[href]")) {
    const raw = a.getAttribute("href");
    if (raw === ".") a.setAttribute("href", "#home");
    else if (raw.startsWith(".#")) a.setAttribute("href", raw.slice(1));
    else if (raw !== "" && Object.hasOwn(PATHS, raw)) a.setAttribute("href", `#${raw}`);
  }
}

export function initRouter() {
  if (!usePaths) useHashLinks();

  const onHistory = () => {
    const url = new URL(location.href);
    const r = resolve(url);
    const token = r.anchor || (ROUTES[r.view] ? r.view : "notfound");
    if (token === lastToken) return;
    show(url, { push: false });
  };
  window.addEventListener("popstate", onHistory);
  window.addEventListener("hashchange", onHistory);

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;

    if (a.hasAttribute("data-skip")) {
      e.preventDefault();
      ($(`.view[data-view="${currentView}"] h1`) || $("#main")).focus();
      return;
    }
    if (a.hasAttribute("data-jump")) {
      e.preventDefault();
      const target = document.getElementById(a.getAttribute("href").slice(1));
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      return;
    }

    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return; // off-site, let the browser have it
    const r = resolve(url);
    if (r.view === "notfound" && !url.hash) return; // a real file, such as the manifest
    e.preventDefault();
    show(url);
  });
}
