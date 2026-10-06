// Web Audio for the Bark Lab. Off until the visitor asks for it, because nothing here
// may make noise on page load. Knows about sounds, never about the DOM.

export function createLabAudio() {
  let ctx = null, barkBuffer = null, noiseBuffer = null, tvSrc = null, tvGain = null;
  let on = false;

  // Built on first use: an AudioContext, a two second noise bed, and the recorded bark.
  async function ensureReady() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const len = ctx.sampleRate * 2;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5 + (Math.random() * 2 - 1) * 0.15; }
    }
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch (_) { /* ignore */ } }
    if (!barkBuffer) {
      try {
        const res = await fetch("assets/bark.mp3");
        const buf = await res.arrayBuffer();
        barkBuffer = await new Promise((ok, fail) => ctx.decodeAudioData(buf, ok, fail));
      } catch (_) { barkBuffer = null; }
    }
    return ctx;
  }

  function playBark(level) {
    if (!ctx) return;
    const g = ctx.createGain();
    g.gain.value = level === 2 ? 0.9 : 0.3;
    g.connect(ctx.destination);
    if (barkBuffer) {
      const s = ctx.createBufferSource();
      s.buffer = barkBuffer;
      s.playbackRate.value = level === 2 ? 0.92 : 1.32;
      s.connect(g);
      s.start();
    } else {
      // No recording available, so fall back to a synthesised yip.
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(level === 2 ? 420 : 620, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.22);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(level === 2 ? 0.5 : 0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.connect(g);
      o.start();
      o.stop(ctx.currentTime + 0.3);
    }
  }

  function playNoiseHit(dur, freq, type, vol, when = 0) {
    if (!ctx) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + when;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(ctx.destination);
    s.start(t0, Math.random());
    s.stop(t0 + dur + 0.05);
  }

  function tvNoise(wanted) {
    if (!ctx) return;
    if (wanted && !tvSrc) {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 900;
      f.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 1.2);
      s.connect(f).connect(g).connect(ctx.destination);
      s.start();
      tvSrc = s;
      tvGain = g;
    } else if (!wanted && tvSrc) {
      tvGain.gain.cancelScheduledValues(ctx.currentTime);
      tvGain.gain.setValueAtTime(Math.max(tvGain.gain.value, 0.0001), ctx.currentTime);
      tvGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      tvSrc.stop(ctx.currentTime + 0.2);
      tvSrc = null;
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

  return {
    get on() { return on; },
    get ready() { return Boolean(ctx); },
    ensureReady,
    async enable() { on = true; await ensureReady(); },
    disable() {
      on = false;
      tvNoise(false);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    tvNoise,
    speak,
    // One call per kind of sound the pads can make.
    play(kind) {
      if (kind === "soft") playBark(1);
      else if (kind === "big") playBark(2);
      else if (kind === "door") playNoiseHit(0.05, 2400, "highpass", 0.8);
      else if (kind === "steps") for (let i = 0; i < 4; i++) playNoiseHit(0.14, 160, "lowpass", 0.9, i * 0.4);
    },
  };
}
