// The emails a signup produces, each one a { subject, html, text } triple. Nothing here
// touches the network: resend.js does the sending.
//
// The HTML is a centered table with inline styles, because mail clients strip <style> blocks
// and have no grid. Every body ships with a plain-text twin: some clients prefer it, and a
// confirmation that exists only as HTML reads as spam to the ones that score it.
const ORIGIN = "https://barkoff.app";
const INSTAGRAM = "https://www.instagram.com/barkoff.app";

const AMBER = "#f79c23";
const INK = "#241f33";
const MUTED = "#5f5872";

// Everything interpolated into an HTML body came from a form, so it all passes through here.
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

// A light shell rather than the site's dark theme: dark backgrounds are the thing mail
// clients most often repaint, and a half-inverted email looks broken.
const shell = (preheader, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BarkOff</title></head>
<body style="margin:0;padding:0;background:#f4f2f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<tr><td style="background:${INK};padding:20px 28px;">
  <span style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-.2px;">Bark<span style="color:${AMBER};">Off</span></span>
</td></tr>
<tr><td style="padding:28px;">${inner}</td></tr>
<tr><td style="padding:0 28px 26px;">
  <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid #e7e4ee;padding-top:16px;">
    <a href="${ORIGIN}" style="color:${MUTED};">barkoff.app</a> &middot;
    <a href="${INSTAGRAM}" style="color:${MUTED};">Instagram</a> &middot;
    <a href="${ORIGIN}/privacy" style="color:${MUTED};">Privacy</a>
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

const p = (text) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${text}</p>`;

// One numbered step, as a two-column row. Tables, because an email cannot do counters.
const step = (n, title, body) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;background:#faf9fc;border:1px solid #e7e4ee;border-radius:12px;">
<tr>
  <td width="44" valign="top" style="padding:14px 0 14px 14px;">
    <div style="width:28px;height:28px;border-radius:14px;background:${AMBER};color:#2a1704;font-weight:800;font-size:14px;text-align:center;line-height:28px;">${n}</div>
  </td>
  <td valign="top" style="padding:14px 14px 14px 0;">
    <div style="font-size:15px;font-weight:700;">${title}</div>
    <div style="font-size:14px;line-height:1.5;color:${MUTED};margin-top:2px;">${body}</div>
  </td>
</tr>
</table>`;

const row = (label, value) => `
<tr>
  <td style="padding:7px 12px;border-bottom:1px solid #e7e4ee;font-size:13px;color:${MUTED};white-space:nowrap;">${esc(label)}</td>
  <td style="padding:7px 12px;border-bottom:1px solid #e7e4ee;font-size:14px;font-weight:600;">${value}</td>
</tr>`;

/**
 * To you: a new name for the Play Console tester list. reply_to is the signup's own address,
 * so answering it in your mail client reaches them and not us.
 */
export function notification({ name, email, dog, alone, at }) {
  const when = at.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const subject = `New BarkOff tester: ${name} (${email})`;

  const html = shell(`${name} joined the testing group`, [
    `<h1 style="margin:0 0 14px;font-size:21px;">New testing group signup</h1>`,
    p(`Add this address to the tester list in the Play Console, then send the invite.`),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e4ee;border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 16px;">`,
    row("Name", esc(name)),
    row("Email", `<a href="mailto:${encodeURI(email)}" style="color:${INK};">${esc(email)}</a>`),
    dog ? row("Dog", esc(dog)) : "",
    alone ? row("When alone", esc(alone)) : "",
    row("Consent", "Ticked"),
    row("Received", esc(when)),
    `</table>`,
    p(`<span style="color:${MUTED};font-size:13px;">Reply to this email to answer ${esc(name)} directly.</span>`),
  ].join(""));

  const text = [
    "New testing group signup",
    "",
    `Name:        ${name}`,
    `Email:       ${email}`,
    dog ? `Dog:         ${dog}` : null,
    alone ? `When alone:  ${alone}` : null,
    `Consent:     ticked`,
    `Received:    ${when}`,
    "",
    "Add the address to the tester list in the Play Console, then send the invite.",
  ].filter((l) => l !== null).join("\n");

  return { subject, html, text, replyTo: email };
}

/**
 * To you: a message from the contact form. The sender gets no automatic reply, because the
 * success screen promises a human one, so this is the only email a contact submit produces.
 */
export function contactMessage({ name, email, topic, message, at }) {
  const when = at.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const subject = `Contact: ${topic} from ${name}`;

  const html = shell(`${topic} from ${name}`, [
    `<h1 style="margin:0 0 14px;font-size:21px;">${esc(topic)}</h1>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e4ee;border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 16px;">`,
    row("Name", esc(name)),
    row("Email", `<a href="mailto:${encodeURI(email)}" style="color:${INK};">${esc(email)}</a>`),
    row("Received", esc(when)),
    `</table>`,
    // pre-wrap, because the line breaks someone typed are part of what they said.
    `<div style="white-space:pre-wrap;font-size:15px;line-height:1.6;padding:16px;background:#faf9fc;border:1px solid #e7e4ee;border-radius:12px;">${esc(message)}</div>`,
    p(`<span style="color:${MUTED};font-size:13px;">Reply to this email to answer ${esc(name)} directly.</span>`),
  ].join(""));

  const text = [
    `${topic} from ${name}`,
    "",
    `Name:      ${name}`,
    `Email:     ${email}`,
    `Received:  ${when}`,
    "",
    "---",
    message,
    "---",
    "",
    `Reply to this email to answer ${name} directly.`,
  ].join("\n");

  return { subject, html, text, replyTo: email };
}

/**
 * To the signup: the same three steps the success screen shows, so the promise made on the
 * page and the promise made in the inbox are the same promise.
 */
export function confirmation({ name, email, dog }) {
  const subject = "You are on the BarkOff tester list";
  const forDog = dog ? ` for you and ${esc(dog)}` : "";

  const html = shell("Your Google Play invite is next.", [
    `<h1 style="margin:0 0 14px;font-size:22px;">You are in, ${esc(name)}.</h1>`,
    p(`Thanks for joining the BarkOff testing group. Here is what happens next${forDog}.`),
    step(1, "You are on the tester list", `Under your Google Play email, <strong>${esc(email)}</strong>.`),
    step(2, "Watch your inbox", "We send the Google Play invite link from barkoffapp@gmail.com. It can take a day or two."),
    step(3, "Accept and install", "Open the link, accept the test, then install BarkOff from Google Play."),
    `<p style="margin:18px 0 0;"><a href="${ORIGIN}/features" style="display:inline-block;background:${AMBER};color:#2a1704;font-weight:800;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:999px;">Explore the features</a></p>`,
    `<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">You are getting this because you signed up at barkoff.app. Reply with "remove" and we will take you off the list.</p>`,
  ].join(""));

  const text = [
    `You are in, ${name}.`,
    "",
    `Thanks for joining the BarkOff testing group. Here is what happens next${dog ? ` for you and ${dog}` : ""}.`,
    "",
    `1. You are on the tester list, under your Google Play email, ${email}.`,
    "2. Watch your inbox. We send the Google Play invite link from barkoffapp@gmail.com. It can take a day or two.",
    "3. Accept and install. Open the link, accept the test, then install BarkOff from Google Play.",
    "",
    `Features: ${ORIGIN}/features`,
    `Instagram: ${INSTAGRAM}`,
    "",
    `You are getting this because you signed up at barkoff.app. Reply with "remove" and we will take you off the list.`,
  ].join("\n");

  return { subject, html, text };
}
