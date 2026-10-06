// Shared form plumbing: inline error messages wired up for screen readers, and a submit
// handler that validates first. This is a prototype, so a valid submit goes nowhere.
import { $$, el, icon } from "../core/dom.js";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SEND_DELAY_MS = 900; // stands in for a round trip to the server

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

/**
 * @param validate  (form) => [{ input, msg }]
 * @param onSuccess (data) => void, with the form's values as a plain object
 */
export function wireForm({ form, validate, onSuccess, submitLabel }) {
  if (!form) return;
  const btn = form.querySelector("[type=submit]");
  const clearOnEdit = (e) => { if (e.target.getAttribute("aria-invalid") === "true") clearError(e.target); };
  form.addEventListener("input", clearOnEdit);
  form.addEventListener("change", clearOnEdit);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const errors = validate(form);
    $$("[aria-invalid=true]", form).forEach((i) => { if (!errors.find((x) => x.input === i)) clearError(i); });
    errors.forEach(({ input, msg }) => setError(input, msg));
    if (errors.length) { errors[0].input.focus(); return; }
    const honeypot = form.querySelector(".hp input");
    const data = Object.fromEntries(new FormData(form).entries());
    btn.disabled = true;
    btn.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), document.createTextNode("Sending..."));
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = submitLabel;
      // A filled honeypot means a bot: reset quietly and show nothing.
      if (honeypot && honeypot.value) { form.reset(); return; }
      onSuccess(data);
    }, SEND_DELAY_MS);
  });
}
