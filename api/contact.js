// POST /api/contact — the contact form.
//
// One email per message, to MAIL_TO, with reply_to set to the sender so answering it in your
// mail client reaches them. The sender gets nothing back automatically: the success screen
// promises a human reply, and an auto-acknowledgement on top of that is noise.
//
// That single email is also why this endpoint works without a verified sending domain, where
// /api/beta only half does: nothing here has to reach an address outside the account.
import { MAIL_TO, sendEmail } from "./_lib/resend.js";
import { contactMessage } from "./_lib/emails.js";
import { clientIp, rateLimiter, readJson, send } from "./_lib/http.js";
import { EMAIL_RE, cleanStr, cleanText, honeypotFilled } from "./_lib/fields.js";

// Caps match src/views/contact.html, where maxlength is a courtesy to the person typing
// rather than a limit.
const LIMITS = { name: 80, email: 120, message: 1000 };
const MIN_MESSAGE = 10;

// The radio values in the form. Anything else was not sent by a browser.
const TOPICS = ["Question", "Testing group", "Bug report", "Idea", "Press and partners"];

const limited = rateLimiter({ windowMs: 60_000, max: 5 });

function validate(body) {
  const fields = {};
  const name = cleanStr(body.name, LIMITS.name);
  const email = cleanStr(body.email, LIMITS.email);
  const message = cleanText(body.message, LIMITS.message);
  // The first chip is checked in the markup, so a missing topic means a hand-made request.
  const topic = TOPICS.find((t) => t === cleanStr(body.topic, 40)) || TOPICS[0];

  if (!name) fields.name = "Enter your name.";
  if (!email) fields.email = "Enter your email address.";
  else if (!EMAIL_RE.test(email)) fields.email = "Enter an email like name@example.com.";
  if (message.length < MIN_MESSAGE) fields.message = "Write a little more, at least 10 characters.";

  return { fields, note: { name, email, topic, message, at: new Date() } };
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
    return send(res, 400, { ok: false, error: "That message could not be read." });
  }

  // A bot gets the same 200 a person gets, so it learns nothing about what gave it away.
  if (honeypotFilled(body, "website")) return send(res, 200, { ok: true });

  if (limited(clientIp(req))) {
    res.setHeader("Retry-After", "60");
    return send(res, 429, { ok: false, error: "That is a lot of messages at once. Try again in a minute." });
  }

  const { fields, note } = validate(body);
  if (Object.keys(fields).length) return send(res, 400, { ok: false, error: "Check the highlighted fields.", fields });

  try {
    await sendEmail({ to: MAIL_TO, ...contactMessage(note) });
  } catch (e) {
    console.error("[contact] send failed:", e.message);
    const unconfigured = !process.env.RESEND_API_KEY;
    return send(res, 502, {
      ok: false,
      error: unconfigured
        ? "The form is not connected yet. Email barkoffapp@gmail.com and we will pick it up there."
        : "We could not send that just now. Try again, or email barkoffapp@gmail.com.",
    });
  }

  return send(res, 200, { ok: true });
}
