/* ---------- core: config, helpers ---------- */

const VERSION = "4.7.2";
const APP = "azervera-creatool";
const DEVICES = ["desktop", "tablet", "mobile"];
const DEVICE_NAME = { desktop: "počítač", tablet: "tablet", mobile: "mobil" };
const DEVICE_IN = { desktop: "na počítači", tablet: "na tabletu", mobile: "na mobilu" };

const cfg = Object.assign(
  {
    storageKey: "creatool:" + location.host,
    mainSelector: "main", // page content; anything outside it (header, menu, footer) is shared by every page
    sharedSelector: "[data-creatool-shared], [data-review-shared]",
    ignoreSelector: "[data-creatool-ignore], [data-review-ignore]",
    extraFonts: [],
    // Real page: mobile below tablet px, tablet below desktop px, desktop from there up.
    breakpoints: { tablet: 768, desktop: 1025 },
    // Preview widths of the device switcher; editable in settings.
    previewWidths: { desktop: 1440, tablet: 768, mobile: 390 },
    startHidden: false,
    registryUrl: null, // JSON with {actions:[], animations:[]} that the coding agent keeps up to date
    actions: [],
    animations: [],
    pages: [], // optional [{path, label}] for "link to page"
    siteName: location.host,
    libraryUrl: null, // manifest of drawings offered under "Knihovna" (built by knihovna.mjs)
    artColors: null, // [{name, value}] colours for drawings; value can be "token:name"
    addedLayerZ: 40, // z-index of drawings added to the page; keep it under a fixed header
  },
  window.CreatoolConfig || window.ReviewLabConfig || {},
);

const round = (n, d = 1) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const now = () => new Date().toISOString();
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isEmptyObj = (o) => !o || !Object.keys(o).length;

function hash(s) {
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619) >>> 0;
  return n.toString(36);
}
const uid = (p) => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Tiny element builder for the editor UI (always in the top document). */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "class") el.className = v;
    else if (k in el && k !== "list" && k !== "form") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const cs = (el) => el.ownerDocument.defaultView.getComputedStyle(el);
const winOf = (el) => el.ownerDocument.defaultView;

/** Values typed by the user end up in CSS only after passing these checks; nothing is ever inserted as HTML. */
function safeColor(v) {
  if (typeof v !== "string" || v.length > 120) return null;
  if (v.startsWith("token:")) return v;
  return CSS.supports("color", v) ? v : null;
}
function safeUrl(v) {
  if (typeof v !== "string" || v.length > 3_000_000) return null;
  if (v.startsWith("media:")) return v;
  try {
    const u = new URL(v, location.href);
    if (u.protocol === "https:" || u.protocol === "http:" || u.protocol === "blob:" || (u.protocol === "data:" && /^data:image\//.test(v))) return u.href;
  } catch {}
  return null;
}
const cssUrl = (u) => `url("${String(u).replace(/["\\\n]/g, (m) => "\\" + m)}")`;
const cleanFamily = (f) => f.trim().replace(/^["']|["']$/g, "");
const prettyFamily = (f) => f.replace(/^__/, "").replace(/_[0-9a-f]{5,}$/i, "").replace(/_/g, " ");
const GENERIC_FONTS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "emoji", "math", "fangsong", "inherit", "initial", "-apple-system", "blinkmacsystemfont"]);

/** Splits a CSS value on top-level whitespace, keeping calc(...) groups whole. */
function splitTop(v) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of String(v).trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
