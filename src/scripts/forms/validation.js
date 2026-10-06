// Shared form plumbing: inline error messages wired up for screen readers, and a submit
// handler that validates before it sends.
//
// A form that passes a `submit` goes to the server and only shows its success screen once
// that call comes back clean. A form without one keeps the old prototype behaviour: a pause
// where the round trip would be, then straight to the success screen.
import { $$, el, icon } from "../core/dom.js";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SEND_DELAY_MS = 900; // stands in for a round trip, for the forms that do not make one

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

// One banner above the button for what no single field is to blame for: the network, the
// server, a refusal from the mail provider. role=alert, so it is read out when it appears.
function setFormError(form, msg) {
  let box = form.querySelector(".form-error");
  if (!box) {
    box = el("div", { class: "form-error", role: "alert" });
    box.append(icon("i-alert"), el("span"));
    form.insertBefore(box, form.querySelector(".form-foot"));
  }
  box.lastChild.textContent = msg;
}

const clearFormError = (form) => form.querySelector(".form-error")?.remove();

/**
 * @param validate  (form) => [{ input, msg }]
 * @param submit    optional async (data) => void. Throwing aborts, and the thrown message is
 *                  shown; a `fields` property on it puts messages under named inputs.
 * @param onSuccess (data) => void, with the form's values as a plain object
 */
export function wireForm({ form, validate, onSuccess, submitLabel, submit }) {
  if (!form) return;
  const btn = form.querySelector("[type=submit]");
  let busy = false;

  const clearOnEdit = (e) => {
    if (e.target.getAttribute("aria-invalid") === "true") clearError(e.target);
    clearFormError(form);
  };
  form.addEventListener("input", clearOnEdit);
  form.addEventListener("change", clearOnEdit);

  const setBusy = (on) => {
    busy = on;
    btn.disabled = on;
    if (on) btn.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), document.createTextNode("Sending..."));
    else btn.textContent = submitLabel;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return; // a disabled button already blocks this, but Enter is quick

    clearFormError(form);
    const errors = validate(form);
    $$("[aria-invalid=true]", form).forEach((i) => { if (!errors.find((x) => x.input === i)) clearError(i); });
    errors.forEach(({ input, msg }) => setError(input, msg));
    if (errors.length) { errors[0].input.focus(); return; }

    const honeypot = form.querySelector(".hp input");
    const data = Object.fromEntries(new FormData(form).entries());
    setBusy(true);

    try {
      // A filled honeypot means a bot: go through the motions, then reset quietly and show
      // nothing. The server drops these too, in case one posts straight past the page.
      if (honeypot && honeypot.value) {
        await wait(SEND_DELAY_MS);
        form.reset();
        return;
      }

      if (submit) await submit(data); else await wait(SEND_DELAY_MS);
      onSuccess(data);
    } catch (err) {
      setFormError(form, err.message);
      // Anything the server pinned on a particular field belongs under that field.
      const named = Object.entries(err.fields || {});
      named.forEach(([name, msg]) => { const input = form.elements[name]; if (input) setError(input, msg); });
      if (named.length) form.elements[named[0][0]]?.focus();
    } finally {
      setBusy(false);
    }
  });
}
