// Home hero: the dog barks, the phone hears it and plays back a message. Pure
// decoration, so it only runs while it is on screen and never under reduced motion.
import { $ } from "../core/dom.js";
import { reduceMotion } from "../core/motion.js";
import { MESSAGES } from "../detector/messages.js";
import { getCurrentView } from "../app/router.js";

export function initHeroScene() {
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
    setInterval(() => { if (visible && getCurrentView() === "home") durEl.textContent = fmt(++seconds); }, 1000);
  }
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start(); else stop();
  });
  io.observe(scene);
}
