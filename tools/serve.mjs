// Static preview server for dist/, the same tree the host publishes. It rewrites unknown
// paths to index.html the way the production rewrites do; without that, opening
// http://localhost:8080/features directly would 404 and path routing could not be tested.
//
// /api/* is handed to the matching module in api/, which is what the host runs as a
// serverless function. The forms therefore send real email from here too, so put the keys in
// a .env at the repo root and expect what you submit to arrive.
//
// It serves the build output rather than the repo, so run a build first:
//
//   node build.mjs && node tools/serve.mjs [port]   (or: npm run serve)
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const api = new URL("../api/", import.meta.url);
const port = Number(process.argv[2]) || 8080;

// The host injects its environment; locally it comes from a .env that git never sees.
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  console.warn("No .env at the repo root: /api routes will answer that signups are not connected.");
}

if (!existsSync(join(root, "index.html"))) {
  console.error("dist/ is empty or missing. Run: node build.mjs");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  // Loaded per request, so editing a handler only needs a refresh, not a restart. The cost is
  // that anything a handler holds at module scope starts empty every time, which the host
  // does not do: the rate limiter in api/beta.js cannot be exercised from here.
  if (pathname.startsWith("/api/")) {
    const name = pathname.slice(5);
    const mod = new URL(`${name}.js`, api);
    if (!/^[a-z0-9-]+$/.test(name) || !existsSync(mod)) {
      res.writeHead(404, { "Content-Type": TYPES[".json"] }).end(`{"ok":false,"error":"No such endpoint."}`);
      return;
    }
    try {
      const { default: handler } = await import(`${mod.href}?v=${Date.now()}`);
      await handler(req, res);
    } catch (e) {
      console.error(`${pathname} threw:`, e);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": TYPES[".json"] });
      res.end(`{"ok":false,"error":"The server hit an error. Check the terminal."}`);
    }
    return;
  }

  // normalize() collapses any ../ before it can climb out of the project.
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  let file = join(root, rel);

  if (!file.startsWith(root)) { res.writeHead(403).end("Forbidden"); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  // Anything that is not a file on disk is a route: hand it the app, same as the rewrites.
  if (!existsSync(file)) file = join(root, "index.html");

  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));
