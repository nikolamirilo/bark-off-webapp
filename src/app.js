(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hexA = (hex, a) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) node.append(c);
    return node;
  };
  const icon = (id, cls = "icon") => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", cls);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#" + id);
    svg.append(use);
    return svg;
  };

  /* =====================================================================
     Bark detector: a direct port of bark-off/services/barkDetector.ts.
     Same gates and constants as the app, so the Bark Lab behaves the same.
     ===================================================================== */
  const FRAME_MS = 50;
  const DETECTOR_DEFAULTS = {
    levelDeltasDb: [14, 24], attackDeltaDb: 8, attackWindowMs: 250, minBurstMs: 150,
    maxBurstMs: 2000, hysteresisDb: 5, refractoryMs: 350, warmupMs: 1500,
  };
  const FLOOR_ALPHA_DOWN = 0.3, FLOOR_ALPHA_UP = 0.02, PRIME_PERCENTILE = 0.25;
  const SILENCE_DB = -160, FLOOR_INIT_DB = -60, FLOOR_MIN_DB = -70, FLOOR_MAX_DB = -3;
  const round1 = (v) => Math.round(v * 10) / 10;
  const percentile = (values, p) => {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
  };
  const normaliseConfig = (c) => {
    const deltas = (Array.isArray(c.levelDeltasDb) && c.levelDeltasDb.length ? c.levelDeltasDb : DETECTOR_DEFAULTS.levelDeltasDb)
      .filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
    const levelDeltasDb = deltas.length ? deltas : DETECTOR_DEFAULTS.levelDeltasDb;
    return { ...c, levelDeltasDb, hysteresisDb: Math.max(0, Math.min(c.hysteresisDb, levelDeltasDb[0] - 1)) };
  };

  class BarkDetector {
    constructor(config = {}) { this.config = normaliseConfig({ ...DETECTOR_DEFAULTS, ...config }); this.reset(); }
    updateConfig(config) { this.config = normaliseConfig({ ...this.config, ...config }); }
    get triggerDeltaDb() { return this.config.levelDeltasDb[0]; }
    reset() {
      this.noiseFloorDb = FLOOR_INIT_DB; this.history = []; this.candidate = null; this.elapsedMs = 0;
      this.msSinceLastBark = Infinity; this.lastLevel = null; this.primeSamples = []; this.primed = false;
    }
    push(rawDb, deltaMs = FRAME_MS) {
      this.elapsedMs += deltaMs;
      this.msSinceLastBark += deltaMs;
      const hasSignal = rawDb > SILENCE_DB;
      const db = hasSignal ? rawDb : this.noiseFloorDb;
      if (!this.primed) {
        if (hasSignal) this.primeSamples.push(rawDb);
        if (this.elapsedMs >= this.config.warmupMs) {
          if (this.primeSamples.length) this.noiseFloorDb = this.clampFloor(percentile(this.primeSamples, PRIME_PERCENTILE));
          this.primeSamples = []; this.primed = true;
        }
      }
      const triggerDb = this.noiseFloorDb + this.triggerDeltaDb;
      const releaseDb = triggerDb - this.config.hysteresisDb;
      const snrDb = db - this.noiseFloorDb;
      const attackDb = this.attackDb(db);
      let bark = null, rejection = null;
      if (this.candidate) {
        const o = this.advanceCandidate(db, snrDb, releaseDb, deltaMs);
        bark = o.bark; rejection = o.rejection;
      } else {
        rejection = this.whyNotOpening(db, triggerDb, attackDb);
        if (rejection === null) {
          this.candidate = { durationMs: deltaMs, peakDb: db, peakSnrDb: snrDb, floorAtOnsetDb: this.noiseFloorDb, confirmed: false };
        }
      }
      if (!this.candidate && hasSignal && this.primed) {
        const isLoud = db >= releaseDb;
        const inRefractory = this.msSinceLastBark < this.config.refractoryMs;
        const hasAttack = attackDb >= this.config.attackDeltaDb;
        if (!isLoud || (!inRefractory && !hasAttack)) this.updateNoiseFloor(db);
      }
      this.history.push({ db, tMs: this.elapsedMs });
      this.pruneHistory();
      if (bark) { this.msSinceLastBark = 0; this.lastLevel = bark.level; } else if (!this.candidate) this.lastLevel = null;
      return { db, noiseFloorDb: this.noiseFloorDb, snrDb, bark, rejection, primed: this.primed };
    }
    whyNotOpening(db, triggerDb, attackDb) {
      if (!this.primed) return "warmup";
      if (db < triggerDb) return "below_trigger";
      if (this.msSinceLastBark < this.config.refractoryMs) return "refractory";
      if (attackDb < this.config.attackDeltaDb) return "no_attack";
      return null;
    }
    attackDb(db) {
      const cutoff = this.elapsedMs - this.config.attackWindowMs;
      let quietest = Infinity;
      for (let i = this.history.length - 1; i >= 0; i--) {
        if (this.history[i].tMs < cutoff) break;
        if (this.history[i].db < quietest) quietest = this.history[i].db;
      }
      return quietest === Infinity ? 0 : db - quietest;
    }
    pruneHistory() {
      const cutoff = this.elapsedMs - this.config.attackWindowMs * 2;
      let drop = 0;
      while (drop < this.history.length && this.history[drop].tMs < cutoff) drop++;
      if (drop) this.history.splice(0, drop);
    }
    advanceCandidate(db, snrDb, releaseDb, deltaMs) {
      const c = this.candidate;
      if (db < releaseDb) {
        const d = c.durationMs;
        this.candidate = null;
        if (d >= this.config.minBurstMs && !c.confirmed) return { bark: this.buildBark(c, d), rejection: null };
        return { bark: null, rejection: c.confirmed ? null : "too_short" };
      }
      c.durationMs += deltaMs;
      if (db > c.peakDb) c.peakDb = db;
      if (snrDb > c.peakSnrDb) c.peakSnrDb = snrDb;
      if (c.durationMs > this.config.maxBurstMs) {
        this.candidate = null;
        this.noiseFloorDb = this.clampFloor(this.noiseFloorDb + (db - this.noiseFloorDb) * FLOOR_ALPHA_DOWN);
        return { bark: null, rejection: "sustained" };
      }
      if (c.durationMs >= this.config.minBurstMs && !c.confirmed) {
        c.confirmed = true;
        return { bark: this.buildBark(c, c.durationMs), rejection: null };
      }
      return { bark: null, rejection: null };
    }
    buildBark(c, d) { return { level: this.levelForSnr(c.peakSnrDb), peakSnrDb: round1(c.peakSnrDb), durationMs: d }; }
    levelForSnr(peak) {
      let level = 1;
      for (let i = 1; i < this.config.levelDeltasDb.length; i++) if (peak >= this.config.levelDeltasDb[i]) level = i + 1;
      return level;
    }
    updateNoiseFloor(db) {
      const a = db < this.noiseFloorDb ? FLOOR_ALPHA_DOWN : FLOOR_ALPHA_UP;
      this.noiseFloorDb = this.clampFloor(this.noiseFloorDb + (db - this.noiseFloorDb) * a);
    }
    clampFloor(v) { return Math.min(FLOOR_MAX_DB, Math.max(FLOOR_MIN_DB, v)); }
  }

  // The app's own plain-language helpers (components/settings/utils.ts).
  const describeNoiseFloor = (f) => f < -50 ? "very quiet room" : f < -40 ? "quiet room" : f < -30 ? "some background noise" : f < -22 ? "noisy room" : "very noisy room";
  const describeDelta = (d) => d <= 9 ? "Very sensitive" : d <= 14 ? "Balanced" : d <= 19 ? "Relaxed" : "Strict";
  const sensitivityPercentToDelta = (p) => Math.round(24 - (clamp(p, 0, 100) / 100) * 18);

  // Sound shapes for the lab: dB above the room, one value per 50 ms frame.
  const SHAPES = {
    soft: [17, 18, 17, 15.5, 13, 9, 5, 2],
    big: [27, 29, 28.5, 27, 24, 19, 13, 7, 3],
    door: [26, 5, 1.5],
    steps: [9, 3, 0, 0, 0, 0, 0, 0, 9.5, 3, 0, 0, 0, 0, 0, 0, 8.5, 2.5, 0, 0, 0, 0, 0, 0, 9, 3],
  };
  const MESSAGES = { 1: "Hey Max, it is okay. I will be home soon.", 2: "Max, quiet now. Good dog." };
  const REASONS = {
    too_short: { short: "Too short", text: "Ignored. Too short to be a bark." },
    no_attack: { short: "No sharp start", text: "Ignored. No sharp start, so it counts as background noise." },
    sustained: { short: "Too long", text: "Ignored. It went on too long, so it counts as background noise." },
    refractory: { short: "Too close", text: "Ignored. Too close to the previous bark." },
    below_trigger: { short: "Too quiet", text: "Ignored. Not loud enough at this sensitivity." },
    adapted: { short: "New normal", text: "Ignored. It rose slowly, so BarkOff moved its room level up to match." },
  };

  /* =====================================================================
     Router: bare #tokens only (the artifact viewer passes nothing else).
     ===================================================================== */
  const VIEWS = ["home", "features", "download", "beta", "contact", "privacy"];
  const ANCHORS = { how: "home", lab: "home", faq: "home" };
  const TITLES = { home: "BarkOff", features: "Features | BarkOff", download: "Download | BarkOff", beta: "Testing group | BarkOff", contact: "Contact | BarkOff", privacy: "Privacy | BarkOff", notfound: "Not found | BarkOff" };
  let currentView = "home";
  let lastToken = null;
  let pendingPlatform = null;
  const viewHooks = {};

  function resolve(t) {
    t = (t || "").replace(/^#/, "");
    if (!t || t === "top") return { view: "home", anchor: null, token: "home" };
    if (VIEWS.includes(t)) return { view: t, anchor: null, token: t };
    if (ANCHORS[t]) return { view: ANCHORS[t], anchor: t, token: t };
    return { view: "notfound", anchor: null, token: t };
  }

  function show(t, { push = true, focus = true, smooth = true } = {}) {
    const r = resolve(t);
    const changed = r.view !== currentView || lastToken === null;
    lastToken = r.token;
    if (changed) {
      $$(".view").forEach((v) => { v.hidden = v.dataset.view !== r.view; });
      currentView = r.view;
      document.title = TITLES[r.view] || "BarkOff";
      if (viewHooks[r.view]) viewHooks[r.view]();
    }
    $$("[data-nav]").forEach((a) => {
      const on = a.dataset.nav === (r.anchor === "how" ? "how" : r.view);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    closeMenu();
    if (push) { try { history.pushState(null, "", "#" + r.token); } catch (_) { /* history not available in this frame */ } }
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

  function onHistory() {
    const t = location.hash.replace(/^#/, "") || "home";
    if (t === lastToken) return;
    show(t, { push: false });
  }
  window.addEventListener("popstate", onHistory);
  window.addEventListener("hashchange", onHistory);

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#']");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = a.getAttribute("href");
    e.preventDefault();
    if (a.hasAttribute("data-skip")) {
      const h = $(`.view[data-view="${currentView}"] h1`) || $("#main");
      h.focus();
      return;
    }
    if (a.hasAttribute("data-jump")) {
      const target = document.getElementById(href.slice(1));
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      return;
    }
    if (a.dataset.platform) pendingPlatform = a.dataset.platform;
    show(href.slice(1));
  });

  /* ---------- Header ---------- */
  const header = $(".site-header");
  const menuBtn = $("#menu-btn");
  const mobileNav = $("#mobile-nav");
  function closeMenu() {
    if (!mobileNav || mobileNav.hidden) return;
    mobileNav.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Open menu");
    menuBtn.querySelector("use").setAttribute("href", "#i-menu");
  }
  menuBtn.addEventListener("click", () => {
    const open = mobileNav.hidden;
    mobileNav.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menuBtn.querySelector("use").setAttribute("href", open ? "#i-x" : "#i-menu");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Copy buttons ---------- */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const label = b.querySelector("span");
    const done = (text, ok) => {
      label.textContent = text;
      b.classList.toggle("done", ok);
      setTimeout(() => { label.textContent = "Copy"; b.classList.remove("done"); }, 1800);
    };
    const selectFallback = () => {
      const target = b.parentElement.querySelector("span");
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      done("Selected", false);
    };
    try {
      navigator.clipboard.writeText(b.dataset.copy).then(() => done("Copied", true), selectFallback);
    } catch (_) { selectFallback(); }
  });

  /* ---------- Small UI details ---------- */
  $$(".clip-wave[data-seed]").forEach((w) => {
    let s = Number(w.dataset.seed) || 1;
    for (let i = 0; i < 26; i++) {
      s = (s * 9301 + 49297) % 233280;
      const h = 4 + Math.round((s / 233280) * 16 * Math.sin((i / 25) * Math.PI) + 2);
      w.append(el("i", { style: `height:${h}px` }));
    }
  });

  const goBtn = $("#go-demo");
  if (goBtn) {
    goBtn.addEventListener("click", () => {
      const on = goBtn.getAttribute("aria-pressed") !== "true";
      goBtn.setAttribute("aria-pressed", String(on));
      $("#go-caption").textContent = on ? "Shh, listening for woofs..." : "Tap the paw to start monitoring";
    });
  }

  /* =====================================================================
     Hero scene: the dog barks, the phone answers.
     ===================================================================== */
  (function heroScene() {
    const scene = $("#hero-scene");
    if (!scene) return;
    const phone = $("#hero-phone"), dog = $("#hero-dog"), woof = $("#hero-woof"), voice = $("#hero-voice");
    const voiceText = $("#hero-voice-text"), toast = $("#hero-toast"), toastText = $("#hero-toast-text"), toastUse = $("#hero-toast-ico use");
    const prog = $("#hero-progress"), woofsEl = $("#hero-woofs"), soundsEl = $("#hero-sounds"), durEl = $("#hero-dur");
    let woofs = 3, sounds = 3, seconds = 2 * 3600 + 14 * 60 + 8, level = 1, visible = true, running = false, timers = [];
    const fmt = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const setToast = (mode, text) => {
      toast.dataset.mode = mode;
      toastText.textContent = text;
      toastUse.setAttribute("href", mode === "playing" ? "#i-play" : "#i-paw");
    };
    function calm() {
      phone.dataset.level = "0";
      prog.textContent = "9%";
      woof.classList.add("off");
      voice.classList.add("off");
      scene.classList.remove("scene-on");
      setToast("idle", "Listening for woofs");
    }
    function cycle() {
      if (!running) return;
      level = level === 1 ? 2 : 1;
      woof.textContent = level === 2 ? "WOOF!" : "Wuf?";
      woof.classList.toggle("big", level === 2);
      woof.classList.remove("off");
      dog.classList.remove("hop");
      void dog.offsetWidth;
      dog.classList.add("hop");
      later(250, () => { phone.dataset.level = String(level); prog.textContent = level === 2 ? "186%" : "121%"; woofsEl.textContent = ++woofs; });
      later(650, () => {
        voiceText.textContent = MESSAGES[level];
        voice.classList.remove("off");
        scene.classList.add("scene-on");
        soundsEl.textContent = ++sounds;
        setToast("playing", level === 2 ? "Playing your firm message" : "Playing your gentle message");
      });
      later(1500, () => woof.classList.add("off"));
      later(1800, () => { phone.dataset.level = "0"; prog.textContent = "11%"; });
      later(4300, () => { voice.classList.add("off"); scene.classList.remove("scene-on"); setToast("idle", "Listening for woofs"); });
      later(7600, cycle);
    }
    function start() {
      if (running || reduceMotion) return;
      running = true;
      later(3200, () => { calm(); later(1600, cycle); });
    }
    function stop() {
      running = false;
      timers.forEach(clearTimeout);
      timers = [];
    }
    if (!reduceMotion) {
      setInterval(() => { if (visible && currentView === "home") durEl.textContent = fmt(++seconds); }, 1000);
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start(); else stop();
    });
    io.observe(scene);
  })();

  /* =====================================================================
     Bark Lab
     ===================================================================== */
  (function barkLab() {
    const canvas = $("#lab-scope");
    if (!canvas) return;
    const section = $("#lab-section");
    const ctx = canvas.getContext("2d");
    const N = 170; // frames on screen (8.5 s)
    const BASE = -47;
    const COOLDOWN_MS = 6000, CLIP_MS = 3200;
    const C = {
      grid: token("--line"), text: token("--faint"), signal: token("--cream"), wash: hexA(token("--amber"), 0.1),
      room: token("--muted"), soft: token("--soft"), big: token("--big"), surface: token("--scope"), ignored: token("--faint"),
    };
    const det = new BarkDetector();
    let softDelta = 14, bigDelta = 24;
    let frames = [], active = [], events = [], t = 0, evId = 0;
    let wander = 0;
    const tv = { on: false, level: 0, offAt: 0, event: null };
    let cooldownUntil = -Infinity, playStart = -Infinity, playLevel = 1;
    let primedShown = false, roomText = "";
    let rngState = 20261002;
    const rng = () => (rngState = (rngState * 1664525 + 1013904223) % 4294967296) / 4294967296;

    const statusText = $("#lab-status-text"), dot = $("#lab-dot"), roomEl = $("#lab-room");
    const logEl = $("#lab-log");
    const speaker = $("#lab-speaker"), spTitle = $("#speaker-title"), spQuote = $("#speaker-quote"), spBar = $("#speaker-bar"), spRing = $("#speaker-ring"), spIco = $("#speaker-ico");
    const tvPad = $('.pad[data-kind="tv"]'), tvLabel = $("#tv-label");
    const sens = $("#lab-sens"), sensOut = $("#lab-sens-out");

    /* ----- sound (off by default, starts from a click) ----- */
    const audio = { on: false, ctx: null, bark: null, tvSrc: null, tvGain: null, noise: null };
    async function ensureAudio() {
      if (!audio.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audio.ctx = new AC();
        const len = audio.ctx.sampleRate * 2;
        audio.noise = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
        const d = audio.noise.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5 + (Math.random() * 2 - 1) * 0.15; }
      }
      if (audio.ctx.state === "suspended") { try { await audio.ctx.resume(); } catch (_) { /* ignore */ } }
      if (!audio.bark) {
        try {
          const res = await fetch("assets/bark.mp3");
          const buf = await res.arrayBuffer();
          audio.bark = await new Promise((ok, fail) => audio.ctx.decodeAudioData(buf, ok, fail));
        } catch (_) { audio.bark = null; }
      }
      return audio.ctx;
    }
    function playBark(level) {
      const a = audio.ctx;
      if (!a) return;
      const g = a.createGain();
      g.gain.value = level === 2 ? 0.9 : 0.3;
      g.connect(a.destination);
      if (audio.bark) {
        const s = a.createBufferSource();
        s.buffer = audio.bark;
        s.playbackRate.value = level === 2 ? 0.92 : 1.32;
        s.connect(g);
        s.start();
      } else {
        const o = a.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(level === 2 ? 420 : 620, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(180, a.currentTime + 0.22);
        g.gain.setValueAtTime(0.0001, a.currentTime);
        g.gain.exponentialRampToValueAtTime(level === 2 ? 0.5 : 0.2, a.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.25);
        o.connect(g);
        o.start();
        o.stop(a.currentTime + 0.3);
      }
    }
    function playNoiseHit(dur, freq, type, vol, when = 0) {
      const a = audio.ctx;
      if (!a) return;
      const s = a.createBufferSource();
      s.buffer = audio.noise;
      const f = a.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = a.createGain();
      const t0 = a.currentTime + when;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f).connect(g).connect(a.destination);
      s.start(t0, Math.random());
      s.stop(t0 + dur + 0.05);
    }
    function playSteps() { for (let i = 0; i < 4; i++) playNoiseHit(0.14, 160, "lowpass", 0.9, i * 0.4); }
    function tvNoise(on) {
      const a = audio.ctx;
      if (!a) return;
      if (on && !audio.tvSrc) {
        const s = a.createBufferSource();
        s.buffer = audio.noise;
        s.loop = true;
        const f = a.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 900;
        f.Q.value = 0.6;
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.09, a.currentTime + 1.2);
        s.connect(f).connect(g).connect(a.destination);
        s.start();
        audio.tvSrc = s;
        audio.tvGain = g;
      } else if (!on && audio.tvSrc) {
        const s = audio.tvSrc, g = audio.tvGain;
        g.gain.cancelScheduledValues(a.currentTime);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.15);
        s.stop(a.currentTime + 0.2);
        audio.tvSrc = null;
      }
    }
    function speak(text) {
      if (!("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.pitch = 1.05;
        const v = window.speechSynthesis.getVoices().find((x) => /^en(-|_)/i.test(x.lang));
        if (v) u.voice = v;
        window.speechSynthesis.speak(u);
      } catch (_) { /* speech is optional */ }
    }
    const soundBtn = $("#lab-sound");
    soundBtn.addEventListener("click", async () => {
      audio.on = !audio.on;
      soundBtn.setAttribute("aria-pressed", String(audio.on));
      soundBtn.querySelector("span").textContent = audio.on ? "Sound on" : "Sound off";
      soundBtn.querySelector("use").setAttribute("href", audio.on ? "#i-volume" : "#i-volume-x");
      if (audio.on) {
        await ensureAudio();
        if (tv.on) tvNoise(true);
      } else {
        tvNoise(false);
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      }
    });

    /* ----- signal generation ----- */
    function nextDb() {
      wander = (wander + (rng() - 0.5) * 0.25) * 0.985;
      tv.level = tv.on ? Math.min(18, tv.level + 18 / 24) : Math.max(0, tv.level - 6);
      const ambient = BASE + wander + tv.level + (rng() * 2 - 1) * 1.5;
      let extra = 0;
      for (const a of active) { const v = a.shape[a.i++]; if (v > extra) extra = v; }
      active = active.filter((a) => a.i < a.shape.length);
      return ambient + (extra > 0 ? extra + (rng() * 2 - 1) * 0.6 : 0);
    }

    function addLog({ mark, title, detail, sample = false }) {
      const secs = Math.floor((t * FRAME_MS) / 1000);
      const stamp = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      const li = el("li");
      const m = el("span", { class: "mark " + mark });
      m.append(icon(mark === "ignored" ? "i-x" : "i-check"));
      const body = el("div");
      const b = el("b", { text: title });
      body.append(b);
      if (sample) body.append(el("span", { class: "sample", text: "Sample" }));
      body.append(el("span", { class: "detail", text: detail }));
      li.append(m, body, el("time", { text: stamp }));
      logEl.prepend(li);
      while (logEl.children.length > 6) logEl.lastElementChild.remove();
    }

    const LABELS = { soft: "Soft bark", big: "Big bark", door: "Door click", steps: "Footsteps", tv: "TV on" };
    let presim = false;

    function resolveIgnored(ev, reason) {
      ev.resolved = true;
      const r = REASONS[reason] || REASONS.below_trigger;
      if (ev.peakRec) ev.peakRec.mark = { type: "ignored", label: r.short };
      addLog({ mark: "ignored", title: ev.label, detail: r.text, sample: presim });
    }

    function onBark(bark, rec) {
      const now = t * FRAME_MS;
      const ev = events.find((e) => !e.resolved && t >= e.startT && t <= e.endT && e.kind !== "tv");
      if (ev) ev.resolved = true;
      const lvl = bark.level >= 2 ? 2 : 1;
      const name = lvl === 2 ? "big bark" : "soft bark";
      const snr = Math.round(bark.peakSnrDb);
      rec.mark = { type: lvl === 2 ? "big" : "soft", label: lvl === 2 ? "Big bark" : "Soft bark" };
      const source = ev ? ev.label : "A sound";
      const heardAs = ev && ev.kind !== "soft" && ev.kind !== "big" ? `Heard as a ${name} at this sensitivity (+${snr} dB).` : `Heard a ${name}, +${snr} dB over the room.`;
      if (now >= cooldownUntil) {
        cooldownUntil = now + COOLDOWN_MS;
        playStart = now;
        playLevel = lvl;
        if (!presim && audio.on) speak(MESSAGES[lvl]);
        addLog({ mark: lvl === 2 ? "big" : "soft", title: source, detail: `${heardAs} Played your ${lvl === 2 ? "firm" : "gentle"} message.`, sample: presim });
      } else {
        rec.mark.label = "Logged";
        const left = Math.ceil((cooldownUntil - now) / 1000);
        addLog({ mark: lvl === 2 ? "big" : "soft", title: source, detail: `${heardAs} Logged without a message, cooldown has ${left} s left.`, sample: presim });
      }
    }

    function tick() {
      if (tv.on && t >= tv.offAt) setTV(false);
      const db = nextDb();
      const f = det.push(db, FRAME_MS);
      t++;
      const rec = { db, floor: f.noiseFloorDb, soft: f.noiseFloorDb + softDelta, big: f.noiseFloorDb + bigDelta, mark: null };
      for (const ev of events) {
        if (ev.resolved || ev.kind === "tv" || t < ev.startT) continue;
        if (t <= ev.endT) {
          if (db > ev.peakDb) { ev.peakDb = db; ev.peakRec = rec; }
          if (f.rejection && f.rejection !== "warmup") ev.reasons.add(f.rejection);
        }
      }
      if (f.bark) onBark(f.bark, rec);
      for (const ev of events) {
        if (ev.resolved || ev.kind === "tv" || t <= ev.endT) continue;
        const order = ["too_short", "no_attack", "sustained", "refractory", "below_trigger"];
        resolveIgnored(ev, order.find((r) => ev.reasons.has(r)) || "below_trigger");
      }
      if (tv.event && !tv.event.resolved) {
        if (f.rejection === "no_attack" || f.rejection === "sustained") { tv.event.peakRec = rec; resolveIgnored(tv.event, f.rejection); }
        else if (t - tv.event.startT > 70) { tv.event.peakRec = rec; resolveIgnored(tv.event, "adapted"); }
      }
      events = events.filter((e) => !e.resolved);
      frames.push(rec);
      if (frames.length > N + 2) frames.shift();
      if (!primedShown && f.primed) {
        primedShown = true;
        statusText.textContent = "Listening";
        dot.classList.remove("wait");
      }
      const rt = "Room: " + describeNoiseFloor(f.noiseFloorDb);
      if (rt !== roomText) { roomText = rt; roomEl.textContent = rt; }
    }

    function trigger(kind) {
      if (kind === "tv") { setTV(!tv.on); return; }
      events.push({ id: ++evId, kind, label: LABELS[kind], startT: t + 1, endT: t + SHAPES[kind].length + 4, resolved: false, reasons: new Set(), peakDb: -Infinity, peakRec: null });
      active.push({ shape: SHAPES[kind], i: 0 });
      if (!presim && audio.on && audio.ctx) {
        if (kind === "soft") playBark(1);
        else if (kind === "big") playBark(2);
        else if (kind === "door") playNoiseHit(0.05, 2400, "highpass", 0.8);
        else if (kind === "steps") playSteps();
      }
    }

    function setTV(on) {
      tv.on = on;
      tvPad.setAttribute("aria-pressed", String(on));
      tvLabel.textContent = on ? "TV off" : "TV on";
      if (on) {
        tv.offAt = t + 300;
        tv.event = { kind: "tv", label: "TV turned on", startT: t, resolved: false, peakRec: null };
        if (audio.on) tvNoise(true);
      } else {
        tv.event = null;
        tvNoise(false);
      }
    }

    $$(".pad").forEach((p) => p.addEventListener("click", async () => {
      if (audio.on) await ensureAudio();
      trigger(p.dataset.kind);
      p.classList.add("hit");
      setTimeout(() => p.classList.remove("hit"), 160);
    }));

    function setSensitivity() {
      const pct = Number(sens.value);
      softDelta = sensitivityPercentToDelta(pct);
      bigDelta = Math.max(24, softDelta + 6);
      det.updateConfig({ levelDeltasDb: [softDelta, bigDelta] });
      sensOut.textContent = `${describeDelta(softDelta)}, +${softDelta} dB`;
      sens.style.setProperty("--fill", pct + "%");
    }
    sens.addEventListener("input", setSensitivity);
    setSensitivity();

    /* ----- speaker card ----- */
    let spState = "";
    function updateSpeaker() {
      const now = t * FRAME_MS;
      let state = "idle";
      if (now - playStart < CLIP_MS) state = "playing";
      else if (now < cooldownUntil) state = "cooldown";
      if (state !== spState) {
        spState = state;
        speaker.dataset.state = state;
        if (state === "playing") {
          spTitle.textContent = playLevel === 2 ? "Playing your firm message" : "Playing your gentle message";
          spQuote.textContent = `"${MESSAGES[playLevel]}"`;
          spIco.setAttribute("href", "#i-volume");
        } else if (state === "cooldown") {
          spQuote.textContent = "Barks are still logged during the cooldown.";
          spIco.setAttribute("href", "#i-timer");
        } else {
          spTitle.textContent = "Waiting quietly";
          spQuote.textContent = frames.length && playStart > 0 ? "Listening for the next bark." : "Nothing to answer yet.";
          spIco.setAttribute("href", "#i-wave");
        }
      }
      if (state === "playing") spBar.style.width = `${clamp((now - playStart) / CLIP_MS, 0, 1) * 100}%`;
      else spBar.style.width = "0%";
      if (state === "cooldown") {
        const left = Math.max(0, cooldownUntil - now);
        spTitle.textContent = `Next message ready in ${Math.ceil(left / 1000)} s`;
        spRing.style.strokeDashoffset = String(201 * (1 - left / COOLDOWN_MS));
      } else spRing.style.strokeDashoffset = "201";
    }

    /* ----- drawing ----- */
    function draw(progress) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W || !H) return;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const padL = 54, padR = W < 520 ? 88 : 96, padT = 30, padB = 14;
      const pw = W - padL - padR, ph = H - padT - padB;
      const yMin = -64, yMax = 0;
      const y = (d) => padT + (1 - (clamp(d, yMin, yMax) - yMin) / (yMax - yMin)) * ph;
      const dx = pw / (N - 1);
      const n = frames.length;
      const x = (k) => padL + pw - (n - 1 - k + progress) * dx;

      ctx.font = "700 11px Nunito, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 1;
      for (let d = -60; d <= 0; d += 15) {
        const yy = Math.round(y(d)) + 0.5;
        ctx.strokeStyle = C.grid;
        ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + pw, yy); ctx.stroke();
        ctx.fillStyle = C.text;
        ctx.textAlign = "right";
        ctx.fillText(`${d} dB`, padL - 8, yy);
      }
      if (!n) return;

      ctx.save();
      ctx.beginPath(); ctx.rect(padL, padT - 24, pw, ph + 24); ctx.clip();
      const path = (key) => { ctx.beginPath(); frames.forEach((fr, k) => { const px = x(k), py = y(fr[key]); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); };
      // wash under the signal
      path("db");
      ctx.lineTo(x(n - 1), y(yMin)); ctx.lineTo(x(0), y(yMin)); ctx.closePath();
      ctx.fillStyle = C.wash; ctx.fill();
      // room level
      path("floor"); ctx.strokeStyle = C.room; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.75; ctx.stroke(); ctx.globalAlpha = 1;
      // trigger lines
      ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
      path("soft"); ctx.strokeStyle = C.soft; ctx.stroke();
      path("big"); ctx.strokeStyle = C.big; ctx.stroke();
      ctx.setLineDash([]);
      // signal
      path("db"); ctx.strokeStyle = C.signal; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
      // markers
      let flip = false;
      frames.forEach((fr, k) => {
        if (!fr.mark) return;
        const px = x(k), py = y(fr.db);
        const col = fr.mark.type === "soft" ? C.soft : fr.mark.type === "big" ? C.big : C.ignored;
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fillStyle = C.surface; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        if (fr.mark.type === "ignored") { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); }
        const ly = Math.max(padT - 14, py - (flip ? 30 : 18));
        flip = !flip;
        ctx.textAlign = "center";
        const tw = ctx.measureText(fr.mark.label).width + 12;
        ctx.fillStyle = C.surface; ctx.globalAlpha = 0.85;
        ctx.fillRect(px - tw / 2, ly - 9, tw, 18);
        ctx.globalAlpha = 1;
        ctx.fillStyle = fr.mark.type === "ignored" ? C.room : C.signal;
        ctx.fillText(fr.mark.label, px, ly);
      });
      ctx.restore();

      // direct labels on the right
      const last = frames[n - 1];
      const labels = [
        { text: "Big bark", y: y(last.big), color: C.big, dash: true },
        { text: "Soft bark", y: y(last.soft), color: C.soft, dash: true },
        { text: "Room", y: y(last.floor), color: C.room, dash: false },
      ].sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 16) labels[i].y = labels[i - 1].y + 16;
      ctx.textAlign = "left";
      labels.forEach((l) => {
        const lx = padL + pw + 8;
        ctx.strokeStyle = l.color; ctx.lineWidth = 2;
        ctx.setLineDash(l.dash ? [4, 3] : []);
        ctx.beginPath(); ctx.moveTo(lx, l.y); ctx.lineTo(lx + 12, l.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.signal;
        ctx.fillText(l.text, lx + 17, l.y);
      });
    }

    /* ----- loop ----- */
    let running = false, raf = 0, lastTs = 0, acc = 0, inView = false;
    function loop(ts) {
      if (!running) return;
      acc += Math.min(ts - lastTs, 250);
      lastTs = ts;
      while (acc >= FRAME_MS) { tick(); acc -= FRAME_MS; }
      draw(acc / FRAME_MS);
      updateSpeaker();
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (running) return;
      running = true;
      lastTs = performance.now();
      acc = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }
    const sync = () => (inView && !document.hidden && currentView === "home" ? start() : stop());
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }).observe(section);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("resize", () => draw(0));

    // Pre-run a few seconds so the lab opens in a working state: one soft bark and one door click.
    presim = true;
    for (let i = 0; i < 90; i++) tick();
    trigger("soft");
    for (let i = 0; i < 52; i++) tick();
    trigger("door");
    for (let i = 0; i < 60; i++) tick();
    presim = false;
    cooldownUntil = -Infinity;
    playStart = -Infinity;
    updateSpeaker();
    draw(0);
  })();

  /* =====================================================================
     Example report chart (stacked columns, drawn to scale).
     ===================================================================== */
  (function reportChart() {
    const box = $("#rc-chart");
    if (!box) return;
    const data = [
      { h: "8 AM", range: "8 to 9 AM", soft: 2, big: 1 },
      { h: "9 AM", range: "9 to 10 AM", soft: 0, big: 0 },
      { h: "10 AM", range: "10 to 11 AM", soft: 1, big: 0 },
      { h: "11 AM", range: "11 AM to 12 PM", soft: 0, big: 0 },
      { h: "12 PM", range: "12 to 1 PM", soft: 0, big: 1 },
      { h: "1 PM", range: "1 to 2 PM", soft: 0, big: 0 },
      { h: "2 PM", range: "2 to 2:14 PM", soft: 0, big: 0 },
    ];
    const softCol = token("--soft-l"), bigCol = token("--big-l");
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
    const roundTop = (x0, y0, w, h, r) => {
      r = Math.min(r, h, w / 2);
      return `M${x0},${y0 + h}V${y0 + r}A${r},${r} 0 0 1 ${x0 + r},${y0}H${x0 + w - r}A${r},${r} 0 0 1 ${x0 + w},${y0 + r}V${y0 + h}Z`;
    };
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
      const band = pw / data.length, colW = Math.min(24, band * 0.5);
      const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Stacked columns of woofs per hour. 8 AM: 2 soft and 1 big. 10 AM: 1 soft. 12 PM: 1 big. Other hours: none." });
      const grid = mk("g", { class: "grid" }), axis = mk("g", { class: "axis" });
      for (let v = 0; v <= max; v++) {
        const yy = Math.round(y(v)) + 0.5;
        if (v > 0) grid.append(mk("line", { x1: padL, x2: W - padR, y1: yy, y2: yy }));
        const tx = mk("text", { x: padL - 10, y: yy + 4, "text-anchor": "end" });
        tx.textContent = v;
        axis.append(tx);
      }
      svg.append(grid, mk("line", { class: "baseline", x1: padL, x2: W - padR, y1: Math.round(y(0)) + 0.5, y2: Math.round(y(0)) + 0.5 }));
      const unit = ph / max;
      data.forEach((d, i) => {
        const cx = padL + band * i + band / 2;
        const g = mk("g", { class: "col", tabindex: "0", "aria-label": `${d.range}: ${d.soft} soft, ${d.big} big` });
        g.append(mk("rect", { class: "hit", x: cx - band / 2 + 1, y: padT, width: Math.max(0, band - 2), height: ph, rx: 6 }));
        if (d.soft) {
          const h = d.soft * unit - (d.big ? 1 : 0);
          const y0 = y(0) - d.soft * unit + (d.big ? 1 : 0);
          g.append(d.big ? mk("rect", { class: "seg", x: cx - colW / 2, y: y0, width: colW, height: h, fill: softCol }) : mk("path", { class: "seg", d: roundTop(cx - colW / 2, y0, colW, h, 4), fill: softCol }));
        }
        if (d.big) {
          const base = y(0) - d.soft * unit;
          g.append(mk("path", { class: "seg", d: roundTop(cx - colW / 2, base - d.big * unit, colW, d.big * unit - (d.soft ? 1 : 0), 4), fill: bigCol }));
        }
        const label = mk("text", { x: cx, y: H - 8, "text-anchor": "middle" });
        label.textContent = band < 46 ? d.h.replace(" AM", "a").replace(" PM", "p") : d.h;
        axis.append(label);
        const showTip = () => {
          tip.replaceChildren(el("b", { text: d.range }), el("br"));
          if (!d.soft && !d.big) tip.append(document.createTextNode("No woofs"));
          else {
            tip.append(el("span", { class: "tk", style: `background:${softCol}` }), el("b", { text: String(d.soft) }), document.createTextNode(" soft bark"), el("br"));
            tip.append(el("span", { class: "tk", style: `background:${bigCol}` }), el("b", { text: String(d.big) }), document.createTextNode(" big bark"));
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
    data.forEach((d) => {
      const tr = el("tr");
      tr.append(el("td", { text: d.range }), el("td", { text: String(d.soft) }), el("td", { text: String(d.big) }));
      tbody.append(tr);
    });
    const btn = $("#rc-table-btn"), table = $("#rc-table");
    btn.addEventListener("click", () => {
      table.hidden = !table.hidden;
      btn.setAttribute("aria-expanded", String(!table.hidden));
      btn.textContent = table.hidden ? "Show as table" : "Hide table";
    });
  })();

  /* =====================================================================
     Features page: three small multiples, each verdict computed by the detector.
     ===================================================================== */
  viewHooks.features = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const host = $("#multiples");
      if (!host) return;
      const cases = [
        { title: "A real bark", kind: "soft" },
        { title: "A door click", kind: "door" },
        { title: "The TV turning on", kind: "tv" },
      ];
      const ns = "http://www.w3.org/2000/svg";
      const mk = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
      cases.forEach((c) => {
        let s = 7;
        const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
        const det = new BarkDetector();
        const base = -48;
        const trace = [];
        let verdict = null, firstLoud = -1;
        const shape = c.kind === "tv" ? Array.from({ length: 30 }, (_, i) => Math.min(18, (18 * (i + 1)) / 24)) : SHAPES[c.kind];
        const total = 40 + 34;
        for (let i = 0; i < total; i++) {
          const k = i - 40;
          const tvLevel = c.kind === "tv" && k >= 0 ? (k < shape.length ? shape[k] : 18) : 0;
          const ex = c.kind !== "tv" && k >= 0 && k < shape.length ? shape[k] : 0;
          const amb = base + tvLevel + (rnd() * 2 - 1) * 1.2;
          const db = amb + (ex > 0 ? ex : 0);
          const f = det.push(db);
          if (i >= 34) trace.push({ db, floor: f.noiseFloorDb });
          if (k >= 0 && !verdict) {
            if (f.bark) verdict = { ok: true, why: "Sharp start and it lasted long enough. BarkOff answers." };
            else if (f.rejection === "too_short") verdict = { ok: false, why: "Over in 0.05 seconds. Too short to be a bark." };
            else if (f.rejection === "no_attack" || f.rejection === "sustained") verdict = { ok: false, why: "It rose slowly, so the room level follows it." };
          }
          if (k >= 0 && firstLoud < 0 && f.snrDb > 12) firstLoud = i;
        }
        if (!verdict) verdict = { ok: false, why: "It rose slowly, so the room level follows it." };
        const W = 200, Hh = 110, pad = 6;
        const lo = base - 6, hi = base + 32;
        const yy = (d) => pad + (1 - (clamp(d, lo, hi) - lo) / (hi - lo)) * (Hh - pad * 2);
        const xx = (i) => pad + (i / (trace.length - 1)) * (W - pad * 2);
        const svg = mk("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": `${c.title}: ${verdict.ok ? "counted as a bark" : "ignored"}` });
        const line = (pts, attrs) => svg.append(mk("polyline", { points: pts.join(" "), fill: "none", ...attrs }));
        svg.append(mk("rect", { x: 0, y: 0, width: W, height: Hh, rx: 8, fill: token("--scope") }));
        line(trace.map((p, i) => `${xx(i).toFixed(1)},${yy(p.floor).toFixed(1)}`), { stroke: token("--muted"), "stroke-width": 1.2, opacity: 0.7, "vector-effect": "non-scaling-stroke" });
        line(trace.map((p, i) => `${xx(i).toFixed(1)},${yy(p.floor + 14).toFixed(1)}`), { stroke: token("--soft"), "stroke-width": 1.5, "stroke-dasharray": "5 4", "vector-effect": "non-scaling-stroke" });
        line(trace.map((p, i) => `${xx(i).toFixed(1)},${yy(p.db).toFixed(1)}`), { stroke: token("--cream"), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" });
        const card = el("div", { class: "multiple" });
        card.append(el("h4", { text: c.title }));
        const wrap = el("div", { style: "margin-top:8px" });
        wrap.append(svg);
        card.append(wrap);
        const v = el("div", { class: "verdict " + (verdict.ok ? "yes" : "no") });
        v.append(icon(verdict.ok ? "i-check" : "i-x"), document.createTextNode(verdict.ok ? "Counted as a bark" : "Ignored"));
        card.append(v, el("div", { class: "why", text: verdict.why }));
        host.append(card);
      });
    };
  })();

  /* =====================================================================
     Download page: highlight the visitor's platform.
     ===================================================================== */
  viewHooks.download = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const ua = navigator.userAgent || "";
      const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/i.test(ua);
      const card = isAndroid ? $("#pf-android") : isIOS ? $("#pf-ios") : null;
      if (card) { card.classList.add("is-you"); card.querySelector(".you-tag").hidden = false; }
    };
  })();

  /* =====================================================================
     Forms: validate in the page, then show what happens next.
     This is a prototype, so nothing is sent anywhere.
     ===================================================================== */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function setError(input, msg) {
    const field = input.closest(".field");
    const id = input.id + "-err";
    let err = document.getElementById(id);
    if (!err) {
      err = el("span", { class: "err", id });
      err.append(icon("i-alert"), el("span"));
      field.append(err);
    }
    err.lastChild.textContent = msg;
    input.setAttribute("aria-invalid", "true");
    const described = (input.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
    if (!described.includes(id)) input.setAttribute("aria-describedby", described.concat(id).join(" "));
  }
  function clearError(input) {
    const id = input.id + "-err";
    const err = document.getElementById(id);
    if (err) err.remove();
    input.removeAttribute("aria-invalid");
    const described = (input.getAttribute("aria-describedby") || "").split(" ").filter((x) => x && x !== id);
    if (described.length) input.setAttribute("aria-describedby", described.join(" ")); else input.removeAttribute("aria-describedby");
  }
  function wireForm({ form, validate, onSuccess, submitLabel }) {
    if (!form) return;
    const btn = form.querySelector("[type=submit]");
    form.addEventListener("input", (e) => { if (e.target.getAttribute("aria-invalid") === "true") clearError(e.target); });
    form.addEventListener("change", (e) => { if (e.target.getAttribute("aria-invalid") === "true") clearError(e.target); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const errors = validate(form);
      $$("[aria-invalid=true]", form).forEach((i) => { if (!errors.find((x) => x.input === i)) clearError(i); });
      errors.forEach(({ input, msg }) => setError(input, msg));
      if (errors.length) { errors[0].input.focus(); return; }
      const hp = form.querySelector(".hp input");
      const data = Object.fromEntries(new FormData(form).entries());
      btn.disabled = true;
      btn.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), document.createTextNode("Sending..."));
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = submitLabel;
        if (hp && hp.value) { form.reset(); return; }
        onSuccess(data);
      }, 900);
    });
  }
  const protoNote = () => {
    const p = el("p", { class: "proto-note" });
    p.append(icon("i-info"), el("span", { text: "This is a prototype, so nothing was sent. On the live site this goes to barkoffapp@gmail.com." }));
    return p;
  };
  const stepItem = (title, text) => {
    const li = el("li");
    li.append(el("div", {}, [el("b", { text: title }), el("span", { text })]));
    return li;
  };
  const burst = () => {
    const b = el("div", { class: "burst", "aria-hidden": "true" });
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 48.839 48.839");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#i-paw");
    svg.append(use);
    b.append(svg);
    return b;
  };

  // Testing group
  const betaForm = $("#beta-form");
  wireForm({
    form: betaForm,
    submitLabel: "Join the testing group",
    validate(f) {
      const errs = [];
      const name = f.elements.name, email = f.elements.email, consent = f.elements.consent;
      if (!name.value.trim()) errs.push({ input: name, msg: "Enter your first name." });
      if (!email.value.trim()) errs.push({ input: email, msg: "Enter your email address." });
      else if (!EMAIL_RE.test(email.value.trim())) errs.push({ input: email, msg: "Enter an email like name@gmail.com." });
      if (!consent.checked) errs.push({ input: consent, msg: "Tick the box so we can email you the invite." });
      return errs;
    },
    onSuccess(d) {
      const box = $("#beta-success");
      const name = (d.name || "").trim(), email = (d.email || "").trim(), dog = (d.dog || "").trim();
      box.replaceChildren();
      box.append(burst());
      if (d.platform === "ios") {
        box.append(el("h2", { text: `You are on the list, ${name}.` }));
        box.append(el("p", { text: `We will email ${email} as soon as iPhone testing opens${dog ? `, so ${dog} can join in` : ""}.` }));
        const steps = el("ol", { class: "next-steps" });
        steps.append(stepItem("Watch your inbox", "Your invite comes from barkoffapp@gmail.com."), stepItem("Follow along", "We share progress on Instagram and TikTok."));
        box.append(steps);
      } else {
        box.append(el("h2", { text: `You are in, ${name}.` }));
        box.append(el("p", { text: dog ? `Here is what happens next for you and ${dog}.` : "Here is what happens next." }));
        const steps = el("ol", { class: "next-steps" });
        steps.append(
          stepItem("We add you to the tester list", `Using your Google Play email, ${email}.`),
          stepItem("Watch your inbox", "We send the Google Play invite link from barkoffapp@gmail.com."),
          stepItem("Accept and install", "Open the link, accept the test, then install BarkOff from Google Play."),
        );
        box.append(steps);
      }
      const row = el("div", { class: "cta-row" });
      row.append(el("a", { class: "btn btn-ghost", href: "#features", text: "Explore the features" }));
      const ig = el("a", { class: "btn btn-ghost", href: "https://www.instagram.com/barkoff.app", target: "_blank", rel: "noopener" });
      ig.append(icon("i-instagram"), document.createTextNode("Follow on Instagram"));
      row.append(ig);
      box.append(row, protoNote());
      $("#beta-form-wrap").hidden = true;
      box.hidden = false;
      box.focus();
      box.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    },
  });
  viewHooks.beta = () => {
    if (pendingPlatform) {
      const r = document.getElementById(pendingPlatform === "ios" ? "beta-ios" : "beta-android");
      if (r) r.checked = true;
      pendingPlatform = null;
    }
  };

  // Contact
  const contactForm = $("#contact-form");
  const msg = $("#contact-message"), counter = $("#contact-counter"), hint = $("#contact-message-hint");
  const HINTS = {
    "Question": "The more detail, the better we can help.",
    "Testing group": "Include the email you signed up with.",
    "Bug report": "Tell us your phone model, Android version, and what happened.",
    "Idea": "What would make BarkOff better for your dog?",
    "Press and partners": "Tell us who you are and what you have in mind.",
  };
  if (contactForm) {
    msg.addEventListener("input", () => { counter.textContent = `${msg.value.length} / 1000`; });
    contactForm.addEventListener("change", (e) => { if (e.target.name === "topic") hint.textContent = HINTS[e.target.value] || HINTS.Question; });
  }
  wireForm({
    form: contactForm,
    submitLabel: "Send message",
    validate(f) {
      const errs = [];
      const name = f.elements.name, email = f.elements.email, message = f.elements.message;
      if (!name.value.trim()) errs.push({ input: name, msg: "Enter your name." });
      if (!email.value.trim()) errs.push({ input: email, msg: "Enter your email address." });
      else if (!EMAIL_RE.test(email.value.trim())) errs.push({ input: email, msg: "Enter an email like name@example.com." });
      if (message.value.trim().length < 10) errs.push({ input: message, msg: "Write a little more, at least 10 characters." });
      return errs;
    },
    onSuccess(d) {
      const box = $("#contact-success");
      box.replaceChildren();
      box.append(burst());
      box.append(el("h2", { text: `Thanks, ${(d.name || "").trim().split(" ")[0]}. Message received.` }));
      box.append(el("p", { text: `We will reply to ${(d.email || "").trim()}. Topic: ${d.topic}.` }));
      const row = el("div", { class: "cta-row" });
      const again = el("button", { class: "btn btn-ghost", type: "button", text: "Send another message" });
      again.addEventListener("click", () => {
        contactForm.reset();
        counter.textContent = "0 / 1000";
        hint.textContent = HINTS.Question;
        box.hidden = true;
        $("#contact-form-wrap").hidden = false;
        $("#contact-name").focus();
      });
      row.append(again, el("a", { class: "btn btn-ghost", href: "#home", text: "Back to home" }));
      box.append(row, protoNote());
      $("#contact-form-wrap").hidden = true;
      box.hidden = false;
      box.focus();
    },
  });

  /* =====================================================================
     Boot. Keep the current page across live updates of the artifact.
     ===================================================================== */
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === "function") hot.snapshot(() => ({ route: lastToken }));
  const startApp = (data) => {
    const initial = (data && data.route) || location.hash.replace(/^#/, "") || "home";
    show(initial, { push: false, focus: false });
  };
  if (hot && typeof hot.ready === "function") hot.ready(startApp);
  else startApp((hot && hot.data) || {});
})();
