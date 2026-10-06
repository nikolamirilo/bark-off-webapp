// Reading form values off a request body. Everything an endpoint accepts goes through here
// before it reaches an email.

// Mirrors the client check in src/scripts/forms/validation.js. Deliberately loose: the point
// is to catch a typo, and anything stricter starts rejecting addresses that work.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Trimmed, capped, and stripped of control characters, which is what keeps a name out of the
 * line below it when it reaches a subject header. Anything that is not a string reads as "".
 */
export const cleanStr = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";

/** Same, but newlines survive: a message body is meant to have them. */
export const cleanText = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";

/**
 * A hidden field no person ever sees, filled in only by something walking the form. The two
 * forms name theirs differently - beta's is `company`, contact's is `website` - so the name
 * is the caller's to pass rather than a default waiting to be got wrong.
 */
export const honeypotFilled = (body, field) => cleanStr(body[field], 200) !== "";
