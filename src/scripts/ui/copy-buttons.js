// Any [data-copy] button copies its value, with a text selection as the fallback.
export function initCopyButtons() {
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
}
