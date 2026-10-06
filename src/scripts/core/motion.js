// Read once: the animations here are set up at boot, so a mid-session change would not reach them.
export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
