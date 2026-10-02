// Inlines src/ into one index.html: the page that is published as the review artifact.
// Run with: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`./src/${p}`, import.meta.url), "utf8");
const include = (html) => html.replace(/<!--@include (\S+)-->/g, (_, file) => read(`views/${file}`).trim());

let page = include(include(read("page.html")));
page = page.replace("/*@styles*/", () => read("styles.css").trim());
page = page.replace("/*@script*/", () => read("app.js").trim());

if (/<!--@include|\/\*@(styles|script)\*\//.test(page)) throw new Error("Unresolved placeholder in index.html");
if (!page.slice(0, 8192).includes("<title>")) throw new Error("<title> must be in the first 8 KB");

writeFileSync(new URL("./index.html", import.meta.url), page);
console.log(`index.html written, ${(Buffer.byteLength(page) / 1024).toFixed(1)} KB`);
