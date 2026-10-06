// POST /api/beta — the testing group signup.
//
// Two emails go out per signup: a notification to MAIL_TO, which is the one that actually
// gets somebody onto the Play Console tester list, and a confirmation to the person who
// signed up. The notification is the request's job, so a failure there is a 502 and the form
// says so. The confirmation is a courtesy: if it fails the signup still happened, so it is
// logged and the response stays a success. That split is also what lets the endpoint be
// useful before a sending domain is verified, when mail to outside addresses is refused.
import { MAIL_TO, MailError, sendEmail } from "./_lib/resend.js";
import { confirmation, notification } from "./_lib/emails.js";
import { clientIp, rateLimiter, readJson, send } from "./_lib/http.js";
import { EMAIL_RE, cleanStr, honeypotFilled } from "./_lib/fields.js";

// Caps match src/views/beta.html, where maxlength is a courtesy to the person typing rather
// than a limit.
const LIMITS = { name: 60, email: 120, dog: 40 };

// The options in the select. Anything else was not typed by a browser.
const ALONE = ["Stays mostly calm", "Barks now and then", "Barks a lot", "Not sure yet"];

const limited = rateLimiter({ windowMs: 60_000, max: 5 });

function validate(body) {
  const fields = {};
  const name = cleanStr(body.name, LIMITS.name);
  const email = cleanStr(body.email, LIMITS.email);
  const dog = cleanStr(body.dog, LIMITS.dog);
  const alone = ALONE.find((o) => o === cleanStr(body.alone, 40)) || "";
  // An unchecked box is absent from a form submission, so anything truthy means ticked.
  const consent = body.consent === true || body.consent === "on" || body.consent === "true";

  if (!name) fields.name = "Enter your first name.";
  if (!email) fields.email = "Enter your email address.";
  else if (!EMAIL_RE.test(email)) fields.email = "Enter an email like name@gmail.com.";
  if (!consent) fields.consent = "Tick the box so we can email you the invite.";

  return { fields, signup: { name, email, dog, alone, at: new Date() } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, error: "Use POST." });
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { ok: false, error: "That submission could not be read." });
  }

  // A bot gets the same 200 a person gets, so it learns nothing about what gave it away.
  if (honeypotFilled(body, "company")) return send(res, 200, { ok: true });

  if (limited(clientIp(req))) {
    res.setHeader("Retry-After", "60");
    return send(res, 429, { ok: false, error: "That is a lot of signups at once. Try again in a minute." });
  }

  const { fields, signup } = validate(body);
  if (Object.keys(fields).length) return send(res, 400, { ok: false, error: "Check the highlighted fields.", fields });

  try {
    await sendEmail({ to: MAIL_TO, ...notification(signup) });
  } catch (e) {
    // Nothing reached us, so the signup is lost. Say so rather than showing a success screen
    // that promises an invite nobody can send.
    console.error("[beta] notification failed:", e.message);
    const unconfigured = e instanceof MailError && !process.env.RESEND_API_KEY;
    return send(res, 502, {
      ok: false,
      error: unconfigured
        ? "Signups are not connected yet. Email barkoffapp@gmail.com and we will add you by hand."
        : "We could not save your spot just then. Try again, or email barkoffapp@gmail.com.",
    });
  }

  try {
    await sendEmail({ to: signup.email, ...confirmation(signup) });
  } catch (e) {
    // Most likely cause: MAIL_FROM is still onboarding@resend.dev, which Resend will only
    // deliver to the account owner. The signup is safely in the inbox either way.
    console.warn(`[beta] confirmation to ${signup.email} failed:`, e.message);
    return send(res, 200, { ok: true, confirmationSent: false });
  }

  return send(res, 200, { ok: true, confirmationSent: true });
}
