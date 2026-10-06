// Site header: the mobile drawer and the shadow that appears once the page scrolls.
import { $ } from "../core/dom.js";
import { onRouteChange } from "../app/router.js";

export function initHeader() {
  const header = $(".site-header");
  const menuBtn = $("#menu-btn");
  const mobileNav = $("#mobile-nav");
  if (!header || !menuBtn || !mobileNav) return;

  const setMenu = (open) => {
    mobileNav.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menuBtn.querySelector("use").setAttribute("href", open ? "#i-x" : "#i-menu");
  };
  const closeMenu = () => { if (!mobileNav.hidden) setMenu(false); };

  menuBtn.addEventListener("click", () => setMenu(mobileNav.hidden));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  onRouteChange(closeMenu);

  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}
