// Testing group signup. Posts to /api/beta, which emails the signup to barkoffapp@gmail.com
// and sends the person a confirmation. The success screen only renders once that lands.
import { $, el, icon } from "../core/dom.js";
import { reduceMotion } from "../core/motion.js";
import { EMAIL_RE, wireForm } from "./validation.js";
import { postForm } from "./submit.js";
import { burst, sentNote, stepItem } from "./success-parts.js";

export function initBetaForm() {
  // What the server said about the last submit. onSuccess runs straight after submit
  // resolves, so this is always the reply to the signup being rendered.
  let sent = null;

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
    async submit(d) {
      sent = await postForm("/api/beta", d);
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
      box.append(row);
      // Only promise the confirmation when one actually went out. The signup itself is safe
      // either way: it is the notification email that records it, and that one succeeded.
      if (sent?.confirmationSent) box.append(sentNote(email));
      $("#beta-form-wrap").hidden = true;
      box.hidden = false;
      box.focus();
      box.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    },
  });
}
