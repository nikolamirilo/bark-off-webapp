// Static preview server for dist/, the same tree the host publishes. It rewrites unknown
// paths to index.html the way the production rewrites do; without that, opening
// http://localhost:8080/features directly would 404 and path routing could not be tested.
//
// It serves the build output rather than the repo, so run a build first:
//
//   node build.mjs && node tools/serve.mjs [port]   (or: npm run serve)
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.argv[2]) || 8080;

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

createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
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
