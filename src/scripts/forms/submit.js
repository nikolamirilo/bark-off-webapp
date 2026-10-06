// Posting a form to one of the /api endpoints. The endpoints answer in one shape:
// { ok: true } or { ok: false, error, fields? }, where `fields` maps an input's name to the
// message that belongs under it.
const TIMEOUT_MS = 25_000; // the server allows 10s per email, and sends two

const FALLBACK = "Something went wrong at our end. Try again, or email barkoffapp@gmail.com.";

export class SubmitError extends Error {
  constructor(message, fields) {
    super(message);
    this.name = "SubmitError";
    this.fields = fields || null;
  }
}

export async function postForm(url, data) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // A timeout is not a failure we can be sure of: the request may well have landed, so do
    // not invite a second signup without a look in the inbox first.
    if (e.name === "TimeoutError") throw new SubmitError("That is taking longer than it should. Check your inbox before trying again.");
    throw new SubmitError("No connection. Check your network and try again.");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new SubmitError(body.error || FALLBACK, body.fields);
  return body;
}
