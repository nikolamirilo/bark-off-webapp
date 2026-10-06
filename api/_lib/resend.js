// The single call that reaches Resend. Every email the site sends goes through here.
//
// This posts to the REST endpoint rather than using the `resend` npm package: the repo ships
// no dependencies, and the surface we need is one request. Moving to the SDK later is a
// change to this file and nothing else.
//
// https://resend.com/docs/api-reference/emails/send-email
const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

// The verified sender. Resend only accepts a `from` on a domain you have verified, with one
// exception: onboarding@resend.dev works with no setup but will only deliver to the address
// that owns the Resend account. That default is enough to receive your own signup
// notifications on day one; set MAIL_FROM to an address on the real domain before the
// confirmations to testers can leave the building.
export const MAIL_FROM = process.env.MAIL_FROM || "BarkOff <onboarding@resend.dev>";

// Where a signup lands.
export const MAIL_TO = process.env.MAIL_TO || "barkoffapp@gmail.com";

// Thrown for anything that stops an email going out: a missing key, a refusal from Resend, a
// network failure. `status` is Resend's HTTP status when there was a reply at all.
export class MailError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "MailError";
    this.status = status;
  }
}

/** Sends one email. Resolves with Resend's message id, or throws MailError. */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new MailError("RESEND_API_KEY is not set on the server");

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [].concat(to),
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // A timeout, or DNS and sockets failing: Resend was never reached, so nothing was sent.
    throw new MailError(`could not reach Resend (${e.message})`);
  }

  const body = await res.json().catch(() => ({}));
  // Resend's errors arrive as { statusCode, name, message }.
  if (!res.ok) throw new MailError(body.message || `Resend returned ${res.status}`, res.status);
  return body.id;
}
