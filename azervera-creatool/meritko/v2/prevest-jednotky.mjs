#!/usr/bin/env node
// Stable scale for sites without PostCSS: rewrites vw and vh (dvh, svh, lvh) in plain CSS files in place, the same way
// postcss-zoom-units.cjs does in a build. Safe to run again; already converted values are left alone.
// Usage: node azervera-creatool/meritko/prevest-jednotky.mjs css/style.css css/other.css
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const files = process.argv.slice(2);
if (!files.length) {
  console.log("Použití: node azervera-creatool/meritko/prevest-jednotky.mjs <soubor.css> [další.css …]");
  process.exit(1);
}

const plugin = createRequire(import.meta.url)("./postcss-zoom-units.cjs");
let postcss = null;
try {
  postcss = createRequire(path.join(process.cwd(), "package.json"))("postcss");
} catch {
  postcss = null;
}

const UNIT = /(-?(?:\d+\.?\d*|\.\d+))(dvh|svh|lvh|vw|vh)\b/gi;
const convertValue = (value) =>
  value.includes("var(--vw") || value.includes("var(--vh")
    ? value
    : value.replace(UNIT, (_, n, u) => `calc(var(${u.toLowerCase() === "vw" ? "--vw" : "--vh"}, 1${u.toLowerCase()}) * ${n})`);

/** Without PostCSS: only declaration values inside blocks change, never selectors or at-rule conditions. */
function convertText(css) {
  let out = "";
  let i = 0;
  const walk = (depth) => {
    let chunk = "";
    while (i < css.length) {
      const c = css[i];
      if (c === "/" && css[i + 1] === "*") {
        const end = css.indexOf("*/", i + 2);
        const stop = end < 0 ? css.length : end + 2;
        chunk += css.slice(i, stop);
        i = stop;
        continue;
      }
      if (c === "{") {
        out += chunk + "{";
        chunk = "";
        i++;
        walk(depth + 1);
        continue;
      }
      if (c === "}") {
        out += depth > 0 ? declarations(chunk) + "}" : chunk + "}";
        i++;
        return;
      }
      chunk += c;
      i++;
    }
    out += chunk;
  };
  const declarations = (text) =>
    text.includes("{")
      ? text
      : text
          .split(";")
          .map((d) => {
            const at = d.indexOf(":");
            return at < 0 ? d : d.slice(0, at + 1) + convertValue(d.slice(at + 1));
          })
          .join(";");
  walk(0);
  return out;
}

for (const file of files) {
  const css = fs.readFileSync(file, "utf8");
  const next = postcss ? (await postcss([plugin()]).process(css, { from: file })).css : convertText(css);
  const changed = (next.match(/var\(--v[wh], 1/g) || []).length - (css.match(/var\(--v[wh], 1/g) || []).length;
  if (next !== css) fs.writeFileSync(file, next);
  console.log(`${file}: ${changed} hodnot převedeno${postcss ? " (PostCSS)" : ""}`);
}
