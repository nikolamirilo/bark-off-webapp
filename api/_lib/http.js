// The HTTP plumbing both endpoints share. Plain node req/res, no host helpers, so the same
// handlers serve under `vercel dev`, in production, and from tools/serve.mjs.

const MAX_BODY_BYTES = 16 * 1024;

/** One reply shape for every endpoint: { ok: true, ... } or { ok: false, error, fields? }. */
export function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/**
 * Vercel parses a JSON body onto req.body and leaves the stream consumed; a bare node server
 * does not. Handle whichever we were handed. Throws if the body is junk or oversized.
 */
export async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("body too large");
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export const clientIp = (req) =>
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

/**
 * A speed bump, not a rate limiter: it lives in one instance's memory, and serverless runs
 * many instances and discards them. It costs ten lines and stops a loop hammering one warm
 * instance. Each endpoint calls this once, so each gets its own bucket.
 */
export function rateLimiter({ windowMs = 60_000, max = 5 } = {}) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const fresh = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    fresh.push(now);
    hits.set(ip, fresh);
    if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return fresh.length > max;
  };
}
