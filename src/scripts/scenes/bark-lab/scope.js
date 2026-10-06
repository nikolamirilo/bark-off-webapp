// The Bark Lab oscilloscope. Takes frames from the simulation and paints them; holds no
// simulation state of its own. Colours come from styles/tokens.css via core/theme.js.
import { clamp } from "../../core/math.js";
import { token, hexA } from "../../core/theme.js";

export function createScope(canvas, frameCount) {
  const ctx = canvas.getContext("2d");
  const C = {
    grid: token("--line"), text: token("--faint"), signal: token("--cream"), wash: hexA(token("--amber"), 0.1),
    room: token("--muted"), soft: token("--soft"), big: token("--big"), surface: token("--scope"), ignored: token("--faint"),
  };

  // `progress` is how far into the current frame we are, so the trace scrolls smoothly.
  function draw(frames, progress) {
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
    const dx = pw / (frameCount - 1);
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

  return { draw };
}
