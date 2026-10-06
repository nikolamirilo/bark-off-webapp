// Contact form: a live character counter, a hint that follows the chosen topic, and the
// success screen.
import { $, el } from "../core/dom.js";
import { EMAIL_RE, wireForm } from "./validation.js";
import { burst, protoNote } from "./success-parts.js";

const MAX_LENGTH = 1000;
const HINTS = {
  "Question": "The more detail, the better we can help.",
  "Testing group": "Include the email you signed up with.",
  "Bug report": "Tell us your phone model, Android version, and what happened.",
  "Idea": "What would make BarkOff better for your dog?",
  "Press and partners": "Tell us who you are and what you have in mind.",
};

export function initContactForm() {
  const form = $("#contact-form");
  if (!form) return;
  const msg = $("#contact-message"), counter = $("#contact-counter"), hint = $("#contact-message-hint");

  msg.addEventListener("input", () => { counter.textContent = `${msg.value.length} / ${MAX_LENGTH}`; });
  form.addEventListener("change", (e) => { if (e.target.name === "topic") hint.textContent = HINTS[e.target.value] || HINTS.Question; });

  wireForm({
    form,
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
      box.replaceChildren(
        burst(),
        el("h2", { text: `Thanks, ${(d.name || "").trim().split(" ")[0]}. Message received.` }),
        el("p", { text: `We will reply to ${(d.email || "").trim()}. Topic: ${d.topic}.` }),
      );
      const again = el("button", { class: "btn btn-ghost", type: "button", text: "Send another message" });
      again.addEventListener("click", () => {
        form.reset();
        counter.textContent = `0 / ${MAX_LENGTH}`;
        hint.textContent = HINTS.Question;
        box.hidden = true;
        $("#contact-form-wrap").hidden = false;
        $("#contact-name").focus();
      });
      box.append(
        el("div", { class: "cta-row" }, [again, el("a", { class: "btn btn-ghost", href: "#home", text: "Back to home" })]),
        protoNote(),
      );
      $("#contact-form-wrap").hidden = true;
      box.hidden = false;
      box.focus();
    },
  });
}
