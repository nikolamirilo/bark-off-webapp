// Testing group signup.
import { $, el, icon } from "../core/dom.js";
import { reduceMotion } from "../core/motion.js";
import { EMAIL_RE, wireForm } from "./validation.js";
import { burst, protoNote, stepItem } from "./success-parts.js";

export function initBetaForm() {
  wireForm({
    form: $("#beta-form"),
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
      box.replaceChildren(
        burst(),
        el("h2", { text: `You are in, ${name}.` }),
        el("p", { text: dog ? `Here is what happens next for you and ${dog}.` : "Here is what happens next." }),
        el("ol", { class: "next-steps" }, [
          stepItem("We add you to the tester list", `Using your Google Play email, ${email}.`),
          stepItem("Watch your inbox", "We send the Google Play invite link from barkoffapp@gmail.com."),
          stepItem("Accept and install", "Open the link, accept the test, then install BarkOff from Google Play."),
        ]),
      );
      const row = el("div", { class: "cta-row" }, [
        el("a", { class: "btn btn-ghost", href: "#features", text: "Explore the features" }),
      ]);
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
}
