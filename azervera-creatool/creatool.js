/*!
 * Azervera CREATOOL 4.7.2: a visual editor you drop into any website.
 * made by lupienskim
 *
 * Texts, fonts, sizes, free moves, independent width and height with handles, shapes from corner points,
 * backgrounds, frosted glass, shadows, borders, corners, padding, magnetic guides, desktop/tablet/mobile views,
 * one page or the whole site, click actions and animations, requests described in words, draft/publish/backup,
 * comments, components, tokens, images, drawings from a library (added to the page or in place of an element),
 * a still region that stays put while the rest of an animation moves, a 3D snap-to-center lock, and a
 * client demo mode. Everything is stored as data in this browser and exported as one JSON for a coding agent. The
 * site's own elements are never removed from the DOM or moved (deleting one hides it): only text values, attributes and
 * inline styles change, and added drawings and texts live in one layer of their own, which keeps it safe on React, Next.js, Vue or plain HTML.
 * Settings: window.CreatoolConfig = {...} before the script (see README).
 */
(() => {
"use strict";
if (typeof window === "undefined" || window.__creatool) return;

// ---- 00-core.js ----
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

// ---- 01-store.js ----
/* ---------- store ----------
 * catalog: who is who (numbers, selectors, original texts); never undone.
 * edits:   what changed; this is the draft and the only part history (undo/redo) touches.
 *          edits.added lists drawings placed on the page from the library (see renderAdded).
 * Element edits live in two dimensions, page and device:
 *   edits.elements[key] = { shared:{desktop,tablet,mobile}, overrides:{ "/page":{desktop,tablet,mobile} }, scope:{prop:"site"|"page"}, ... }
 * Priority when reading: page+device > page+desktop > site+device > site+desktop. */

const KEY = cfg.storageKey;
const LIVE_KEY = KEY + ":live";
const BACKUP_KEY = KEY + ":backup";
const VIEW_KEY = KEY + ":view";
const HIST_KEY = KEY + ":history";
const UI_KEY = KEY + ":ui";

const emptyEdits = () => ({ elements: {}, tokens: {}, requests: [], comments: [], components: [], added: [] });
const defaultSettings = () => ({ snap: true, grid: { on: false, size: 8 }, previewWidths: Object.assign({}, cfg.previewWidths), role: "owner", clientDemo: false, motion: "auto" });
const emptyStore = () => ({ app: APP, version: 2, meta: { nextT: 1, nextP: 1, nextReq: 1, nextCom: 1 }, catalog: {}, edits: emptyEdits(), settings: defaultSettings() });

function validEdits(e) {
  return !!e && typeof e === "object" && !!e.elements && typeof e.elements === "object" && typeof e.tokens === "object" && Array.isArray(e.requests) && Array.isArray(e.comments);
}
function validStore(s) {
  return !!s && s.app === APP && s.version === 2 && !!s.catalog && typeof s.catalog === "object" && !!s.meta && validEdits(s.edits);
}
function normalizeStore(s) {
  s.meta = Object.assign({ nextT: 1, nextP: 1, nextReq: 1, nextCom: 1 }, s.meta);
  s.edits = Object.assign(emptyEdits(), s.edits);
  s.settings = Object.assign(defaultSettings(), s.settings);
  s.settings.previewWidths = Object.assign({}, cfg.previewWidths, s.settings.previewWidths);
  return s;
}
function readJSON(k, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(k) || "null");
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

let store = (() => {
  const s = readJSON(KEY, null);
  return validStore(s) ? normalizeStore(s) : emptyStore();
})();

let status = "Uloženo v prohlížeči";
let persistTimer = 0;
let lastWritten = "";
function persistNow() {
  clearTimeout(persistTimer);
  try {
    lastWritten = JSON.stringify(store);
    localStorage.setItem(KEY, lastWritten);
    status = "Uloženo v prohlížeči";
  } catch {
    status = "Prohlížeč ukládání odmítl, stáhni export.";
  }
  ui.updateStatus();
}
function persist() {
  clearTimeout(persistTimer);
  status = "Ukládám…";
  persistTimer = setTimeout(persistNow, 150);
}

/* ---------- history: unlimited undo/redo that survives reload ---------- */

let hist = (() => {
  const v = readJSON(HIST_KEY, null);
  return v && Array.isArray(v.past) && Array.isArray(v.future) ? v : { past: [], future: [] };
})();
let histTimer = 0;
// The saved history keeps its newest steps within this many characters; serialising more stalls typing.
const HIST_MAX_CHARS = 1_500_000;
function saveHistory() {
  clearTimeout(histTimer);
  histTimer = setTimeout(() => {
    let size = [...hist.past, ...hist.future].reduce((n, s) => n + s.length, 0);
    while (size > HIST_MAX_CHARS && hist.past.length > 1) size -= hist.past.shift().length;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        localStorage.setItem(HIST_KEY, JSON.stringify(hist));
        return;
      } catch {
        // Browser storage is full: drop the oldest half of the steps and try again.
        hist.past.splice(0, Math.ceil(hist.past.length / 2) || 1);
      }
    }
  }, 800);
}
let lastCommit = { at: 0, label: "" };
/** The single door for changing the draft. Grouped commits (slider drags) become one undo step. */
function commit(label, mutate, opts = {}) {
  const before = JSON.stringify(store.edits);
  mutate(store.edits);
  const after = JSON.stringify(store.edits);
  if (before === after) return false;
  const t = Date.now();
  if (!(opts.group && lastCommit.label === label && t - lastCommit.at < 800)) hist.past.push(before);
  if (hist.past.length > 2000) hist.past.shift();
  hist.future = [];
  lastCommit = { at: t, label };
  persist();
  saveHistory();
  engine.changed();
  return true;
}
function replaceEdits(label, next) {
  commit(label, (e) => {
    for (const k of Object.keys(e)) delete e[k];
    Object.assign(e, emptyEdits(), clone(next));
  });
}
function undo() {
  if (!hist.past.length) return;
  hist.future.push(JSON.stringify(store.edits));
  store.edits = Object.assign(emptyEdits(), JSON.parse(hist.past.pop()));
  lastCommit = { at: 0, label: "" };
  persist();
  saveHistory();
  engine.changed(true);
}
function redo() {
  if (!hist.future.length) return;
  hist.past.push(JSON.stringify(store.edits));
  store.edits = Object.assign(emptyEdits(), JSON.parse(hist.future.pop()));
  lastCommit = { at: 0, label: "" };
  persist();
  saveHistory();
  engine.changed(true);
}

/* ---------- draft, published version and the one backup ---------- */

let viewState = localStorage.getItem(VIEW_KEY) || "draft"; // draft | live | backup
const liveVersion = () => readJSON(LIVE_KEY, null);
const backupVersion = () => readJSON(BACKUP_KEY, null);
function activeEdits() {
  if (viewState === "live") return Object.assign(emptyEdits(), (liveVersion() || {}).edits);
  if (viewState === "backup") return Object.assign(emptyEdits(), (backupVersion() || {}).edits);
  return store.edits;
}
function setView(v) {
  viewState = v;
  localStorage.setItem(VIEW_KEY, v);
  engine.changed(true);
}
/** Element keys (and whole sections) that differ between two versions. */
function diffKeys(a, b) {
  a = Object.assign(emptyEdits(), a);
  b = Object.assign(emptyEdits(), b);
  const keys = new Set([...Object.keys(a.elements), ...Object.keys(b.elements)]);
  const out = [...keys].filter((k) => !same(a.elements[k], b.elements[k]));
  for (const part of ["tokens", "requests", "comments", "components", "added"]) if (!same(a[part], b[part])) out.push("#" + part);
  return out;
}
/** Publishing keeps exactly one backup: the version that was live until now. Without a backup nothing is published. */
function publishDraft() {
  const live = liveVersion();
  const backup = { edits: live ? live.edits : emptyEdits(), at: live ? live.at : null, replacedAt: now(), changed: diffKeys(live ? live.edits : emptyEdits(), store.edits) };
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  } catch {
    return { ok: false, message: "Zálohu se nepodařilo vytvořit (plné úložiště prohlížeče). Nic nebylo zveřejněno." };
  }
  try {
    localStorage.setItem(LIVE_KEY, JSON.stringify({ edits: store.edits, at: now() }));
  } catch {
    return { ok: false, message: "Zveřejnění se nepodařilo uložit. Záloha zůstala, koncept je beze změny." };
  }
  return { ok: true };
}

// ---- 02-dom.js ----
/* ---------- views: the document being edited ----------
 * "top" is the page itself. For tablet/mobile (or desktop on a small screen) the page opens in a frame at the real device
 * width; the copy of CREATOOL inside that frame only renders the changes, this one reads its DOM and draws the UI. */

const isChild = window !== window.top && /^creatool-frame:/.test(window.name || "");
const childDevice = isChild ? window.name.split(":")[1] : null;
const topView = { kind: "top", win: window, doc: document, scale: 1 };
let view = topView;

function deviceOfWin(win) {
  if (win === window && childDevice) return childDevice;
  const w = win.innerWidth;
  return w >= cfg.breakpoints.desktop ? "desktop" : w >= cfg.breakpoints.tablet ? "tablet" : "mobile";
}
// Edits are filed under the page's path. A site whose addresses differ by domain (one language per domain)
// can map the address to a stable page name with CreatoolConfig.pageKey(location).
const pageOfWin = (win) => {
  try {
    return typeof cfg.pageKey === "function" ? cfg.pageKey(win.location) : win.location.pathname;
  } catch {
    return "/";
  }
};
const pageOf = (el) => pageOfWin(winOf(el));
const curPage = () => pageOfWin(view.win);
const curDevice = () => deviceOfWin(view.win);

/* ---------- languages ----------
 * Czech desktop is the base: it flows to every language and, unless that device was edited, to tablet and mobile.
 * Any other language, and tablet or mobile, stores an override for that view only. Text never crosses languages. */
const LANGS = ["cs", "sk", "en", "pl"];
const LANG_IN = { cs: "češtinu", sk: "slovenštinu", en: "angličtinu", pl: "polštinu" };
const baseLang = () => cfg.baseLang || "cs";
function familyOf(page) {
  const families = Array.isArray(cfg.pageFamilies) ? cfg.pageFamilies : [];
  for (const family of families) {
    if (family.prefix) continue;
    for (const lang of LANGS) if (family[lang] === page) return { family, lang, rest: "" };
  }
  const prefixed = families.filter((family) => family.prefix).sort((a, b) => String(b.cs || "").length - String(a.cs || "").length);
  for (const family of prefixed) {
    for (const lang of LANGS) {
      const pre = family[lang];
      if (pre && page.startsWith(pre)) return { family, lang, rest: page.slice(pre.length) };
    }
  }
  const m = /^\/(cs|sk|en|pl)(?=\/|$)/.exec(page || "");
  if (!m) return null;
  return { family: null, lang: m[1], rest: (page || "").slice(m[0].length) };
}
function langOf(page) {
  const hit = familyOf(page);
  return hit ? hit.lang : baseLang();
}
function siblingPage(page, lang) {
  const hit = familyOf(page);
  if (!hit) return null;
  if (hit.family && hit.family[lang]) return hit.family.prefix ? hit.family[lang] + hit.rest : hit.family[lang];
  if (!hit.family) return "/" + lang + (hit.rest || "");
  return null;
}
function basePageOf(page) {
  return siblingPage(page, baseLang()) || page;
}
function viewNote(device) {
  const lang = langOf(curPage());
  const name = LANG_IN[lang] || lang;
  if (lang === baseLang() && device === "desktop") return `Upravuješ ${name} na počítači. Tahle verze je základ: změna se propíše do všech jazyků a na tablet i mobil, dokud je tam neupravíš zvlášť. Text zůstává jen v češtině.`;
  if (lang === baseLang()) return `Upravuješ ${name} ${DEVICE_IN[device]}. Změna platí jen ${DEVICE_IN[device]}, ve všech jazycích, dokud jazyk nemá vlastní úpravu. Počítač se nemění.`;
  return `Upravuješ ${name} ${DEVICE_IN[device]}. Změna platí jen pro tohle zobrazení. Ostatní jazyky a zařízení zůstanou, jak jsou.`;
}

/** Offset and scale of the current view inside the top window, for drawing the overlay. */
function viewBox() {
  if (view.kind !== "frame" || !view.frame) return { x: 0, y: 0, s: 1 };
  const r = view.frame.getBoundingClientRect();
  return { x: r.left, y: r.top, s: view.scale || 1 };
}
/** Element box in top-window coordinates. */
function boxOf(el) {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  const v = el.ownerDocument === document ? { x: 0, y: 0, s: 1 } : viewBox();
  return { left: v.x + r.left * v.s, top: v.y + r.top * v.s, width: r.width * v.s, height: r.height * v.s, right: v.x + r.right * v.s, bottom: v.y + r.bottom * v.s };
}

/* ---------- identity: selectors and keys ---------- */

const isIgnored = (el) => !!el && el.nodeType === 1 && (!!el.closest("[data-ct-still]") || !!el.closest(cfg.ignoreSelector + ", #azervera-creatool, [data-creatool-ui]"));
const usefulClass = (c) => !c.startsWith("ct-") && !c.startsWith("rl-") && !c.startsWith("tl-") && !/^(is|has)-/.test(c) && !/[:[\]()/@!]/.test(c) && c.length < 60;
function unique(doc, selector) {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}
/** Selector anchored on the nearest stable hook (id, data-creatool-id, data-review-id, data-testid), then tags and classes. */
function selectorFor(el) {
  const doc = el.ownerDocument;
  const parts = [];
  let node = el;
  while (node && node !== doc.body && node !== doc.documentElement) {
    const attr = ["data-creatool-id", "data-review-id", "data-testid"].find((a) => node.getAttribute(a));
    const hook = node.id && !/^:r|^radix-|\d{4,}/.test(node.id) ? "#" + CSS.escape(node.id) : attr ? `[${attr}="${CSS.escape(node.getAttribute(attr))}"]` : null;
    if (hook && unique(doc, hook)) {
      parts.unshift(hook);
      return parts.join(" > ");
    }
    const parent = node.parentElement;
    if (!parent) break;
    const tag = node.tagName.toLowerCase();
    const cls = Array.from(node.classList).find(usefulClass);
    const byClass = cls ? `${tag}.${CSS.escape(cls)}` : null;
    let segment = null;
    try {
      segment = byClass && parent.querySelectorAll(`:scope > ${byClass}`).length === 1 ? byClass : null;
    } catch {}
    parts.unshift(segment || `${tag}:nth-child(${Array.from(parent.children).indexOf(node) + 1})`);
    node = parent;
  }
  parts.unshift("body");
  return parts.join(" > ");
}
function query(doc, selector) {
  try {
    const list = doc.querySelectorAll(selector);
    for (const el of list) if (!el.closest("[data-ct-still]")) return el;
    return null;
  } catch {
    return null;
  }
}
/** Header, menu and footer (everything outside the main content) exist on many pages; the rest belongs to one page. */
function isShared(el) {
  const added = el.closest("[data-ct-added]");
  if (added) return added.getAttribute("data-ct-page") === "*";
  if (el.closest(cfg.sharedSelector)) return true;
  const main = el.ownerDocument.querySelector(cfg.mainSelector);
  if (main) return !main.contains(el);
  return !!el.closest("header, footer, nav");
}
function identity(el) {
  const selector = selectorFor(el);
  const shared = isShared(el);
  const page = pageOf(el);
  return { key: (shared ? "s-" : "p-") + hash(selector + "|" + (shared ? "*" : page)), selector, shared, page };
}
function labelFor(el) {
  const tag = el.tagName.toLowerCase();
  const named = el.getAttribute("data-creatool-label") || el.getAttribute("data-review-label");
  const cls = Array.from(el.classList).filter(usefulClass).slice(0, 2);
  const text = (el.innerText || el.getAttribute("alt") || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 60);
  return ((named ? named + " · " : "") + tag + (cls.length ? "." + cls.join(".") : "") + (text ? ` „${text}“` : "")).slice(0, 300);
}

/* ---------- texts ---------- */

const SKIP_TEXT = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "TEMPLATE", "SVG"]);
const ownTextNodes = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.nodeValue.trim());
function textUnitFor(node) {
  let el = node && node.nodeType === 1 ? node : node && node.parentElement;
  // Text added from the editor is edited in its own panel, not as a text of the site.
  if (el && el.closest && el.closest("#" + ADDED_LAYER)) return null;
  while (el && el !== el.ownerDocument.body && el !== el.ownerDocument.documentElement) {
    if (isIgnored(el)) return null;
    if (el instanceof winOf(el).HTMLElement && !SKIP_TEXT.has(el.tagName) && ownTextNodes(el).length) return el;
    el = el.parentElement;
  }
  return null;
}
function textAt(doc, x, y) {
  for (const hit of doc.elementsFromPoint(x, y)) {
    if (isIgnored(hit)) return null;
    const unit = textUnitFor(hit);
    if (unit) return unit;
  }
  return null;
}

/* ---------- catalog ---------- */

function register(el, role, quiet = false) {
  const id = identity(el);
  let e = store.catalog[id.key];
  let dirty = false;
  if (!e) {
    e = store.catalog[id.key] = { key: id.key, selector: id.selector, shared: id.shared, pages: [id.page], label: labelFor(el) };
    dirty = true;
  } else if (!e.pages.includes(id.page)) {
    e.pages.push(id.page);
    dirty = true;
  }
  if (role === "text" && !e.t) {
    e.t = store.meta.nextT++;
    e.original = ownTextNodes(el).map((n) => n.nodeValue.trim());
    e.originalFont = cleanFamily(cs(el).fontFamily.split(",")[0]);
    dirty = true;
  }
  if (role === "el" && !e.p) {
    e.p = store.meta.nextP++;
    dirty = true;
  }
  el.setAttribute("data-ct", id.key);
  if (dirty && !quiet) persist();
  return e;
}
const onPageOf = (entry, page) => entry.shared || entry.pages.includes(page);
function elementFor(entry, doc = view.doc) {
  if (!entry || !onPageOf(entry, pageOfWin(doc.defaultView))) return null;
  return query(doc, entry.selector);
}
function elementCandidate(el) {
  if (!el || el.nodeType !== 1 || isIgnored(el) || el.closest("#" + ADDED_LAYER)) return false;
  const r = el.getBoundingClientRect();
  return r.width >= 8 && r.height >= 8;
}
/** Numbers every visible text and the page's elements, like a catalog. Marked elements, pictures, links, buttons and boxes are included even before anyone clicks them. */
function registerAll(doc = view.doc) {
  if (!doc || !doc.body) return;
  const before = store.meta.nextT + store.meta.nextP;
  const units = new Set();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node && units.size < 1500; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!node.nodeValue.trim() || !el || units.has(el) || SKIP_TEXT.has(el.tagName.toUpperCase()) || isIgnored(el) || el.closest("#" + ADDED_LAYER)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 2 && r.height > 2) units.add(el);
  }
  for (const el of units) register(el, "text", true);
  const elements = new Set();
  const consider = (el) => {
    if (elements.size >= 800 || elements.has(el) || !elementCandidate(el)) return;
    elements.add(el);
  };
  doc.querySelectorAll("[data-creatool-id], [data-review-id], img, svg, video, picture, button, a, section, article, header, footer, nav, figure, aside, form").forEach(consider);
  doc.querySelectorAll("div, li").forEach((el) => {
    if (elements.size >= 800) return;
    const kids = el.querySelectorAll(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > p, :scope > a, :scope > button, :scope > img, :scope > ul, :scope > ol, :scope > figure, :scope > div, :scope > section, :scope > article");
    if (kids.length >= 2) consider(el);
  });
  for (const el of elements) register(el, "el", true);
  if (store.meta.nextT + store.meta.nextP !== before) persist();
}

/* ---------- picking elements ---------- */

function movableFor(hit) {
  const doc = hit && hit.ownerDocument;
  if (!hit || hit === doc.documentElement || hit === doc.body || isIgnored(hit)) return null;
  let base = hit;
  if (base instanceof winOf(base).SVGElement) {
    let svg = base.closest("svg");
    while (svg && svg.parentElement && svg.parentElement.closest("svg")) svg = svg.parentElement.closest("svg");
    base = svg;
  }
  if (!base) return null;
  // Text or an icon inside a small button or link moves the whole control; big links (cards) stay pickable part by part.
  const control = base.parentElement && base.parentElement.closest("a, button, label, [role=button]");
  if (control && !isIgnored(control)) {
    const r = control.getBoundingClientRect();
    if (r.height <= 160 && r.width <= 700) return control;
  }
  return base;
}
const area = (el) => {
  const r = el.getBoundingClientRect();
  return r.width * r.height;
};
function candidatesAt(doc, x, y) {
  const ordered = [];
  const emptySvg = new Set();
  for (const hit of doc.elementsFromPoint(x, y)) {
    if (isIgnored(hit)) {
      if (hit.closest("#azervera-creatool")) return [];
      continue;
    }
    const el = movableFor(hit);
    if (!el || ordered.includes(el)) continue;
    if (el.tagName.toLowerCase() === "svg" && hit === el) emptySvg.add(el);
    ordered.push(el);
  }
  // Drawings react only on their strokes; a click anywhere inside a marked drawing's box still finds it.
  doc.querySelectorAll("[data-creatool-id], [data-review-id]").forEach((el) => {
    if (ordered.includes(el) || isIgnored(el)) return;
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom || r.width * r.height > doc.defaultView.innerWidth * doc.defaultView.innerHeight * 0.6) return;
    emptySvg.add(el);
    const container = ordered.findIndex((o) => o.contains(el));
    if (container < 0) ordered.push(el);
    else ordered.splice(container, 0, el);
  });
  const out = [];
  let held = [];
  for (const el of ordered) {
    if (emptySvg.has(el)) {
      held.push(el);
      continue;
    }
    if (held.some((d) => el.contains(d))) {
      out.push(...held.sort((a, b) => area(a) - area(b)));
      held = [];
    }
    out.push(el);
  }
  return [...out, ...held.sort((a, b) => area(a) - area(b))];
}
function childToward(el, x, y) {
  if (el.tagName.toLowerCase() === "svg") return null;
  const kids = Array.from(el.children).filter((c) => !isIgnored(c));
  return kids.find((c) => {
    const r = c.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }) || kids[0] || null;
}

// ---- 03-model.js ----
/* ---------- model: reading and writing element properties across pages and devices ---------- */

// Layer index in resolve(): 0 site+desktop, 1 site+device, 2 page+desktop, 3 page+device (higher wins).
const LAYER_NAME = ["celý web · počítač", "celý web · zařízení", "tato stránka · počítač", "tato stránka · zařízení"];

/** Properties that are always changed together share one page/site choice. */
const PROP_GROUP = {
  text: "text", font: "písmo", fontScale: "písmo", color: "písmo",
  x: "poloha", y: "poloha", refW: "poloha", xPct: "poloha", yPct: "poloha", rotate: "poloha", scale: "poloha",
  width: "rozměr", height: "rozměr", minW: "rozměr", maxW: "rozměr", minH: "rozměr", maxH: "rozměr", lockRatio: "rozměr", overflow: "rozměr",
  shape: "tvar", shapeFix: "tvar",
  bg: "pozadí", glass: "pozadí", opacity: "efekty", shadow: "efekty", border: "efekty", blend: "efekty",
  radius: "rohy", padding: "odsazení", alignH: "odsazení", alignV: "odsazení", gap: "odsazení", flexify: "odsazení",
  img: "obrázek", art: "kresba", removed: "smazání", action: "akce", animations: "animace", still: "animace",
};
const groupOf = (prop) => PROP_GROUP[prop] || prop;
const groupProps = (group) => Object.keys(PROP_GROUP).filter((p) => PROP_GROUP[p] === group);

function readLayers(layers) {
  const props = {};
  const from = {};
  layers.forEach((layer, i) => {
    if (layer) for (const k of Object.keys(layer)) {
      props[k] = layer[k];
      from[k] = i;
    }
  });
  return { props, from };
}
function dropText(resolved) {
  if (!resolved.props || !("text" in resolved.props)) return resolved;
  const props = Object.assign({}, resolved.props);
  const from = Object.assign({}, resolved.from);
  delete props.text;
  delete from.text;
  return { props, from };
}
/** Czech (and any base-language page): desktop flows down to tablet and mobile. */
function resolveRaw(key, page, device, edits) {
  const e = edits.elements[key];
  if (!e) return { props: {}, from: {} };
  const site = e.shared || {};
  const own = (e.overrides || {})[page] || {};
  return readLayers([site.desktop, device !== "desktop" ? site[device] : null, own.desktop, device !== "desktop" ? own[device] : null]);
}
/** A non-Czech view keeps only what was edited on this device. Desktop of that language does not leak into mobile. */
function resolveDeviceOnly(key, page, device, edits) {
  const e = edits.elements[key];
  if (!e) return { props: {}, from: {} };
  const own = (e.overrides || {})[page] || {};
  const resolved = readLayers([e.shared && e.shared[device], own[device]]);
  const from = {};
  for (const k of Object.keys(resolved.from)) from[k] = 1;
  return { props: resolved.props, from };
}
/** Header, menu and footer share one key. Czech desktop (and Czech device tweaks) flow across languages; the current language only covers this device. */
function resolveSharedForeign(key, page, device, edits) {
  const e = edits.elements[key];
  if (!e) return { props: {}, from: {} };
  const basePage = basePageOf(page);
  const site = e.shared || {};
  const baseOwn = (e.overrides || {})[basePage] || {};
  const own = (e.overrides || {})[page] || {};
  const resolved = readLayers([
    site.desktop,
    baseOwn.desktop,
    device !== "desktop" ? site[device] : null,
    device !== "desktop" ? baseOwn[device] : null,
    own[device],
  ]);
  // The last real local layer is index 4. Text from the Czech layers must not replace a translation.
  const props = {};
  const from = {};
  for (const [k, v] of Object.entries(resolved.props)) {
    if (k === "text" && resolved.from[k] < 4) continue;
    props[k] = v;
    from[k] = resolved.from[k] >= 4 ? 1 : 0;
  }
  // A site-wide device value written while on this language lives in shared[device] and would hit every language.
  // Language edits of shared chrome are stored on the page instead; shared[device] stays the Czech device layer above.
  return { props, from };
}
function resolveProps(key, page, device, edits = activeEdits()) {
  const entry = store.catalog[key];
  if (langOf(page) !== baseLang() && entry) {
    if (entry.shared) return resolveSharedForeign(key, page, device, edits);
    const basePage = basePageOf(page);
    const baseKey = "p-" + hash(entry.selector + "|" + basePage);
    if (baseKey === key) return dropText(resolveRaw(key, basePage, device, edits));
    const base = edits.elements[baseKey] ? dropText(resolveRaw(baseKey, basePage, device, edits)) : { props: {}, from: {} };
    const local = resolveDeviceOnly(key, page, device, edits);
    const from = {};
    for (const k of Object.keys(base.from)) from[k] = 0;
    for (const k of Object.keys(local.from)) from[k] = 1;
    return { props: Object.assign({}, base.props, local.props), from };
  }
  return resolveRaw(key, page, device, edits);
}
/** A shared element (header, menu, footer) is changed only on this page unless "Použít na celém webu" was chosen. */
function scopeOf(key, prop) {
  const entry = store.catalog[key];
  if (!entry || !entry.shared) return "site";
  const e = store.edits.elements[key];
  return (e && e.scope && e.scope[groupOf(prop)]) || "page";
}
function tidyElement(e) {
  for (const holder of [e.shared, ...Object.values(e.overrides || {})]) {
    if (!holder) continue;
    for (const d of Object.keys(holder)) if (isEmptyObj(holder[d])) delete holder[d];
  }
  for (const p of Object.keys(e.overrides || {})) if (isEmptyObj(e.overrides[p])) delete e.overrides[p];
}
function isEmptyElement(e) {
  return isEmptyObj(e.shared) && isEmptyObj(e.overrides) && !e.lock && e.snap !== false && isEmptyObj(e.scope);
}
function holderFor(e, scope, page) {
  if (scope === "site") return (e.shared = e.shared || {});
  e.overrides = e.overrides || {};
  return (e.overrides[page] = e.overrides[page] || {});
}
/** Writes several properties at once. value undefined removes the property from that layer. */
function setProps(key, values, opts = {}) {
  const device = opts.device || curDevice();
  const page = opts.page || curPage();
  let asked = null;
  const changed = commit(opts.label || "Úprava", (ed) => {
    const e = (ed.elements[key] = ed.elements[key] || { shared: {}, overrides: {} });
    for (const [prop, value] of Object.entries(values)) {
      const scope = opts.scope || scopeOf(key, prop);
      const holder = holderFor(e, scope, page);
      const map = (holder[device] = holder[device] || {});
      if (value === undefined || value === null) delete map[prop];
      else map[prop] = value;
      const entry = store.catalog[key];
      if (entry && entry.shared && scope === "page" && langOf(page) === baseLang() && !(e.scope && e.scope[groupOf(prop)])) asked = groupOf(prop);
    }
    tidyElement(e);
    if (isEmptyElement(e)) delete ed.elements[key];
  }, { group: opts.group });
  if (changed && asked && !opts.silent) ui.askScope(key, asked);
  return changed;
}
const setProp = (key, prop, value, opts) => setProps(key, { [prop]: value }, opts);
function setMeta(key, field, value, label) {
  commit(label || "Úprava", (ed) => {
    const e = (ed.elements[key] = ed.elements[key] || { shared: {}, overrides: {} });
    if (value === undefined || value === null) delete e[field];
    else e[field] = value;
    tidyElement(e);
    if (isEmptyElement(e)) delete ed.elements[key];
  });
}
/** Moves a property group of this page to the whole site (or remembers "only here"). */
function chooseScope(key, group, scope) {
  const page = curPage();
  commit("Rozsah změny", (ed) => {
    const e = (ed.elements[key] = ed.elements[key] || { shared: {}, overrides: {} });
    e.scope = Object.assign({}, e.scope, { [group]: scope });
    if (scope === "site") {
      const own = (e.overrides || {})[page] || {};
      for (const d of DEVICES) for (const p of groupProps(group)) {
        if (own[d] && p in own[d]) {
          e.shared = e.shared || {};
          e.shared[d] = Object.assign({}, e.shared[d], { [p]: own[d][p] });
          delete own[d][p];
        }
      }
    }
    tidyElement(e);
  });
}
/** Pages whose own version keeps a group unchanged when the site-wide version changes. */
function pagesKeeping(key, group) {
  const e = store.edits.elements[key];
  if (!e || !e.overrides) return [];
  return Object.keys(e.overrides).filter((p) => DEVICES.some((d) => e.overrides[p][d] && groupProps(group).some((prop) => prop in e.overrides[p][d])));
}
function resetToShared(key, page = curPage(), group = null) {
  commit("Vrátit na společnou verzi", (ed) => {
    const e = ed.elements[key];
    if (!e || !e.overrides || !e.overrides[page]) return;
    if (!group) delete e.overrides[page];
    else for (const d of DEVICES) if (e.overrides[page][d]) for (const p of groupProps(group)) delete e.overrides[page][d][p];
    tidyElement(e);
    if (isEmptyElement(e)) delete ed.elements[key];
  });
}
/** "Vrátit na verzi z počítače": drops the tablet or mobile value, so the desktop value flows down again. */
function resetDevice(key, device, props = null) {
  if (device === "desktop") return;
  commit("Vrátit na verzi z počítače", (ed) => {
    const e = ed.elements[key];
    if (!e) return;
    for (const holder of [e.shared, ...Object.values(e.overrides || {})]) {
      if (!holder || !holder[device]) continue;
      if (!props) delete holder[device];
      else for (const p of props) delete holder[device][p];
    }
    tidyElement(e);
    if (isEmptyElement(e)) delete ed.elements[key];
  });
}
/** Removes a property from every layer that shows it on this page and device, so the element really looks original here. */
function clearVisible(key, prop, label) {
  const page = curPage();
  const devices = [...new Set(["desktop", curDevice()])];
  commit(label, (ed) => {
    const e = ed.elements[key];
    if (!e) return;
    for (const holder of [e.shared, (e.overrides || {})[page]]) if (holder) for (const d of devices) if (holder[d]) delete holder[d][prop];
    tidyElement(e);
    if (isEmptyElement(e)) delete ed.elements[key];
  });
}
/** Brings a deleted element back. A tablet or mobile restore clears only that device. */
function restoreRemoved(key, device = null) {
  commit("Obnovit prvek", (ed) => {
    const e = ed.elements[key];
    if (!e) return;
    const devices = device && device !== "desktop" ? [device] : DEVICES;
    for (const holder of [e.shared, ...Object.values(e.overrides || {})]) if (holder) for (const d of devices) if (holder[d]) delete holder[d].removed;
    tidyElement(e);
    if (isEmptyElement(e)) delete ed.elements[key];
  });
}
function resetElement(key) {
  commit("Vrátit prvek", (ed) => {
    const e = ed.elements[key];
    if (!e) return;
    e.shared = {};
    e.overrides = {};
    delete e.action;
    delete e.animations;
    tidyElement(e);
    if (isEmptyElement(e)) delete ed.elements[key];
  });
}
function hasEdits(key, edits = store.edits) {
  const e = edits.elements[key];
  return !!e && (!isEmptyObj(e.shared) || !isEmptyObj(e.overrides));
}
/** Elements with their own tablet or mobile values, for the device overview. */
function deviceSpecific(device) {
  const out = [];
  for (const [key, e] of Object.entries(store.edits.elements)) {
    const holders = [["celý web", e.shared], ...Object.entries(e.overrides || {})];
    for (const [where, holder] of holders) if (holder && !isEmptyObj(holder[device])) out.push({ key, where, props: Object.keys(holder[device]) });
  }
  return out;
}
/** 3D poses saved beside the draft (the tooth frames) count as changes too. Baked poses in the code do not. */
function poseChanges() {
  const tooth = window.CreatoolTooth;
  if (!tooth || typeof tooth.changes !== "function") return [];
  try {
    const rows = tooth.changes();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
function changeCount(edits = store.edits) {
  return Object.keys(edits.elements).filter((k) => hasEdits(k, edits)).length + (edits.added || []).length + poseChanges().length;
}

/* ---------- tokens ---------- */

let siteTokens = {}; // discovered from the site's CSS custom properties on :root
function discoverTokens() {
  const found = {};
  const scan = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !(rule.selectorText)) {
        try {
          scan(rule.cssRules);
        } catch {}
      }
      if (!rule.selectorText || !/(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selectorText)) continue;
      for (const prop of rule.style) {
        if (!prop.startsWith("--") || prop.startsWith("--ct-") || prop.startsWith("--tw-")) continue;
        const value = rule.style.getPropertyValue(prop).trim();
        if (!value || value.length > 120) continue;
        const name = prop.slice(2);
        found[name] = { var: prop, value, type: guessTokenType(name, value), site: true };
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      scan(sheet.cssRules);
    } catch {}
  }
  siteTokens = found;
}
function guessTokenType(name, value) {
  if (/color|colour|bg|fg|ink|paper|accent|surface/i.test(name) || CSS.supports("color", value)) return "color";
  if (/font|family/i.test(name) && !/size/i.test(name)) return "font";
  if (/radius|round/i.test(name)) return "radius";
  if (/shadow/i.test(name)) return "shadow";
  if (/duration|speed|time/i.test(name) || /^\d+m?s$/.test(value)) return "duration";
  if (/size|text|fs/i.test(name)) return "size";
  if (/space|gap|pad|margin/i.test(name)) return "space";
  return "other";
}
function allTokens(edits = activeEdits()) {
  const out = {};
  for (const [name, t] of Object.entries(siteTokens)) out[name] = Object.assign({}, t);
  for (const [name, t] of Object.entries(edits.tokens || {})) out[name] = Object.assign({ var: "--" + (siteTokens[name] ? name : "ct-" + name) }, out[name], t);
  return out;
}
/** "token:name" becomes var(--name); plain values pass through. */
function tv(v, edits) {
  if (typeof v !== "string" || !v.startsWith("token:")) return v;
  const t = allTokens(edits)[v.slice(6)];
  return t ? `var(${t.var})` : null;
}
function tokenUsage(name, edits = store.edits) {
  const ref = "token:" + name;
  return Object.keys(edits.elements).filter((k) => JSON.stringify(edits.elements[k]).includes(`"${ref}"`)).length;
}

// ---- 04-apply.js ----
/* ---------- apply: data -> inline styles on the real elements ----------
 * Every value is written as an inline style (or a harmless attribute) and remembered, so removing a change restores
 * exactly what the site had. Moves, rotation and scale are added on top of the element's own CSS values. */

const originals = new WeakMap(); // el -> { style: {prop: [value, priority]}, attrs: {name: value|null} }
const appliedStyles = new WeakMap(); // el -> {prop: value} we set last time
const rendered = new Set();
const previewOverrides = new Map(); // key -> props used while dragging, before the commit

function memo(el) {
  let o = originals.get(el);
  if (!o) originals.set(el, (o = { style: {}, attrs: {} }));
  return o;
}
function writeStyles(el, styles) {
  const o = memo(el);
  const prev = appliedStyles.get(el) || {};
  // Originals are read before anything is written: aliases and shorthands (-webkit-mask and mask, background and its
  // parts) share values, so reading one after writing the other would remember our own value as the site's.
  for (const prop of Object.keys(styles)) if (!(prop in o.style)) o.style[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
  for (const prop of Object.keys(prev)) {
    if (prop in styles) continue;
    const [v, p] = o.style[prop] || ["", ""];
    if (v) el.style.setProperty(prop, v, p);
    else el.style.removeProperty(prop);
  }
  for (const [prop, value] of Object.entries(styles)) {
    if (el.style.getPropertyValue(prop) !== value || el.style.getPropertyPriority(prop) !== "important") el.style.setProperty(prop, value, "important");
  }
  appliedStyles.set(el, styles);
}
function writeAttr(el, name, value) {
  const o = memo(el);
  if (!(name in o.attrs)) o.attrs[name] = el.getAttribute(name);
  if (value === null) {
    const v = o.attrs[name];
    if (v === null || v === undefined) el.removeAttribute(name);
    else el.setAttribute(name, v);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function dropAttr(el, name) {
  const o = memo(el);
  if (!(name in o.attrs)) o.attrs[name] = el.getAttribute(name);
  el.removeAttribute(name);
}
function restoreAttrs(el, keep = []) {
  const o = originals.get(el);
  if (!o) return;
  for (const name of Object.keys(o.attrs)) if (!keep.includes(name)) writeAttr(el, name, null);
}
/** Computed values the site itself gives the element, without our inline changes. */
function baseValues(el, props) {
  const o = memo(el);
  const saved = [];
  for (const p of props) {
    saved.push([p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
    const ov = o.style[p];
    if (ov) {
      if (ov[0]) el.style.setProperty(p, ov[0], ov[1]);
      else el.style.removeProperty(p);
    }
  }
  const c = cs(el);
  const out = {};
  for (const p of props) out[p] = c.getPropertyValue(p);
  for (const [p, v, pr] of saved) {
    if (v) el.style.setProperty(p, v, pr);
    else el.style.removeProperty(p);
  }
  return out;
}
const lenOf = (v) => (!v || v.u === "auto" ? "auto" : `${round(num(v.v), 2)}${v.u || "px"}`);
function parentWidth(el) {
  const anchor = anchorOf(el);
  if (anchor) return anchor.getBoundingClientRect().width;
  const p = el.parentElement;
  return p ? p.getBoundingClientRect().width : winOf(el).innerWidth;
}

/* ---------- shape: four (or more) points ---------- */

const RECT = [[0, 0], [100, 0], [100, 100], [0, 100]];
/** Homography that maps the element box onto four target corners (for "Deformace obsahu"). */
function warpMatrix(w, h, pts) {
  const [p0, p1, p2, p3] = pts.map(([x, y]) => [(x / 100) * w, (y / 100) * h]);
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const dst = [p0, p1, p2, p3];
  // Solve the 8 unknowns of the projective transform with Gaussian elimination.
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    [b[c], b[pivot]] = [b[pivot], b[c]];
    if (Math.abs(A[c][c]) < 1e-9) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const [a, bb, c, d, e, f, g, hh] = b.map((v, i) => v / A[i][i]);
  return [a, d, 0, g, bb, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1];
}
const polygon = (pts) => `polygon(${pts.map(([x, y]) => `${round(x, 2)}% ${round(y, 2)}%`).join(", ")})`;

/* ---------- appearance helpers ---------- */

function colorOf(v, edits) {
  const t = tv(v, edits);
  return t && (t.startsWith("var(") || CSS.supports("color", t)) ? t : null;
}
function backgroundOf(bg, edits) {
  if (!bg || bg.type === "none") return null;
  if (bg.type === "transparent") return "transparent";
  if (bg.type === "solid") return colorOf(bg.color, edits);
  const stops = (bg.stops || []).map((s) => `${colorOf(s.c, edits) || "transparent"} ${clamp(num(s.p), 0, 100)}%`).join(", ");
  if (bg.type === "linear") return `linear-gradient(${num(bg.angle, 180)}deg, ${stops})`;
  if (bg.type === "radial") return `radial-gradient(circle at ${num(bg.cx, 50)}% ${num(bg.cy, 50)}%, ${stops})`;
  if (bg.type === "image") {
    const url = bg.image && bg.image.startsWith("media:") ? media.urlFor(bg.image.slice(6)) : safeUrl(bg.image);
    return url ? `${cssUrl(url)} ${bg.pos || "center"}/${bg.size || "cover"} no-repeat` : null;
  }
  return null;
}
const supportsGlass = () => CSS.supports("backdrop-filter", "blur(2px)") || CSS.supports("-webkit-backdrop-filter", "blur(2px)");
function radiusOf(r) {
  if (!r) return null;
  if (r.preset === "sharp") return "0";
  if (r.preset === "pill") return "9999px";
  if (r.preset === "circle") return "50%";
  const v = (n) => `${round(num(n), 1)}${r.unit || "px"}`;
  const main = [r.tl, r.tr, r.br, r.bl].map(v).join(" ");
  if (r.elliptic) return `${main} / ${[r.tlY ?? r.tl, r.trY ?? r.tr, r.brY ?? r.br, r.blY ?? r.bl].map(v).join(" ")}`;
  return main;
}

/* ---------- one element ---------- */

function renderElement(el, entry, props, from, device, meta, edits) {
  const st = {};
  const has = (p) => props[p] !== undefined;
  const moved = has("x") || has("y") || has("xPct") || has("yPct");
  const needed = [];
  if (moved) needed.push("translate");
  if (has("rotate")) needed.push("rotate");
  if (has("scale")) needed.push("scale");
  if (has("fontScale")) needed.push("font-size");
  if (has("font")) needed.push("font-family");
  if (props.shape && props.shape.mode === "warp") needed.push("transform", "transform-origin");
  const boxy = moved || has("rotate") || has("scale") || has("width") || has("height") || props.shape || props.radius || props.padding;
  if (boxy) needed.push("display");
  const base = needed.length ? baseValues(el, needed) : {};

  if (has("font")) st["font-family"] = `"${String(props.font).replace(/["\\]/g, "")}", ${base["font-family"]}`;
  if (has("color")) {
    const ink = colorOf(props.color, edits);
    if (ink) st.color = ink;
  }
  if (has("fontScale")) {
    const b = parseFloat(base["font-size"]) || 16;
    let size = b * clamp(num(props.fontScale, 1), 0.2, 6);
    // Normal text never drops below 16 px on a phone when the size came down from the desktop version.
    if (device === "mobile" && (from.fontScale === 0 || from.fontScale === 2) && b >= 16 && size < 16) size = 16;
    st["font-size"] = `${round(size, 2)}px`;
  }
  if (boxy && base.display === "inline") st.display = "inline-block";
  if (moved) {
    let dx = num(props.x);
    let dy = num(props.y);
    // Positions made on the desktop keep their place relative to the parent on smaller screens.
    if (device !== "desktop" && (from.x === 0 || from.x === 2) && num(props.refW) > 0) {
      const f = parentWidth(el) / num(props.refW);
      if (Number.isFinite(f) && f > 0) {
        dx *= f;
        dy *= f;
      }
    }
    const parts = !base.translate || base.translate === "none" ? [] : splitTop(base.translate);
    const pct = (v) => (num(v) ? ` + ${num(v)}%` : "");
    st.translate = `calc(${parts[0] || "0px"} + ${round(dx, 2)}px${pct(props.xPct)}) calc(${parts[1] || "0px"} + ${round(dy, 2)}px${pct(props.yPct)})${parts[2] ? " " + parts[2] : ""}`;
  }
  if (has("rotate")) {
    const parts = !base.rotate || base.rotate === "none" ? ["0deg"] : splitTop(base.rotate);
    const angle = parts[parts.length - 1];
    st.rotate = `${parts.length > 1 ? parts.slice(0, -1).join(" ") + " " : ""}calc(${angle} + ${round(num(props.rotate), 2)}deg)`;
  }
  if (has("scale")) {
    const parts = !base.scale || base.scale === "none" ? ["1"] : splitTop(base.scale);
    st.scale = parts.map((v) => round((parseFloat(v) || 1) * clamp(num(props.scale, 1), 0.05, 10), 4)).join(" ");
  }
  // Size: the width and height typed or dragged are the visible size, padding and border included.
  const inherited = (p) => device !== "desktop" && (from[p] === 0 || from[p] === 2);
  if (["width", "height", "minW", "maxW", "minH", "maxH"].some(has)) st["box-sizing"] = "border-box";
  if (has("width")) {
    st.width = lenOf(props.width);
    if (inherited("width") && props.width.u === "px" && !has("maxW")) st["max-width"] = "100%";
  }
  if (has("height")) st.height = lenOf(props.height);
  if (has("minW")) st["min-width"] = lenOf(props.minW);
  if (has("maxW")) st["max-width"] = lenOf(props.maxW);
  if (has("minH")) st["min-height"] = lenOf(props.minH);
  if (has("maxH")) st["max-height"] = lenOf(props.maxH);
  if (props.overflow === "hidden") st.overflow = "hidden";
  if (props.overflow === "scroll") st.overflow = "auto";
  if (props.overflow === "wrap") {
    st["overflow-wrap"] = "anywhere";
    st["white-space"] = "normal";
  }
  // Shape
  if (props.shape && Array.isArray(props.shape.pts) && props.shape.pts.length >= 3 && !same(props.shape.pts, RECT)) {
    if (props.shape.mode === "warp" && props.shape.pts.length === 4) {
      const m = warpMatrix(el.offsetWidth || 1, el.offsetHeight || 1, props.shape.pts);
      if (m) {
        const origin = splitTop(base["transform-origin"] || "0px 0px");
        const ox = origin[0] || "0px";
        const oy = origin[1] || "0px";
        const own = base.transform && base.transform !== "none" ? base.transform + " " : "";
        st.transform = `${own}translate(calc(-1 * ${ox}), calc(-1 * ${oy})) matrix3d(${m.map((v) => round(v, 6)).join(",")}) translate(${ox}, ${oy})`;
      }
    } else st["clip-path"] = polygon(props.shape.pts);
  }
  // Appearance
  const bg = backgroundOf(props.bg, edits);
  if (bg) st.background = bg;
  if (props.glass && props.glass.on) {
    const blur = clamp(num(props.glass.blur, 12), 0, 80);
    const sat = clamp(num(props.glass.sat, 140), 0, 300);
    const alpha = clamp(num(props.glass.alpha, 35), 0, 100) / 100;
    const tint = colorOf(props.glass.tint || "#ffffff", edits) || "#ffffff";
    const fallback = supportsGlass() ? alpha : Math.min(1, alpha + 0.45);
    if (!bg) st.background = `color-mix(in srgb, ${tint} ${round(fallback * 100)}%, transparent)`;
    if (supportsGlass()) {
      st["backdrop-filter"] = `blur(${blur}px) saturate(${sat}%)`;
      st["-webkit-backdrop-filter"] = st["backdrop-filter"];
    }
  }
  if (has("opacity")) st.opacity = String(clamp(num(props.opacity, 100), 0, 100) / 100);
  if (props.shadow && props.shadow.on) {
    const s = props.shadow;
    const color = colorOf(s.color, edits) || "rgba(0,0,0,.35)";
    st["box-shadow"] = `${s.inset ? "inset " : ""}${num(s.x)}px ${num(s.y, 8)}px ${num(s.blur, 24)}px ${num(s.spread)}px ${color}`;
  }
  if (props.border) {
    const b = props.border;
    const side = (s) => `${clamp(num(s.w), 0, 80)}px ${["solid", "dashed", "dotted", "double", "none"].includes(s.style) ? s.style : "solid"} ${colorOf(s.color, edits) || "currentColor"}`;
    if (b.each) for (const k of ["top", "right", "bottom", "left"]) st["border-" + k] = side((b.sides || {})[k] || b);
    else st.border = side(b);
  }
  if (props.blend && /^[a-z-]{3,20}$/.test(props.blend)) st["mix-blend-mode"] = props.blend;
  const radius = radiusOf(props.radius);
  if (radius) st["border-radius"] = radius;
  if (props.padding) for (const [k, n] of Object.entries({ t: "top", r: "right", b: "bottom", l: "left" })) if (props.padding[k] !== undefined) st["padding-" + n] = `${num(props.padding[k])}px`;
  const display = cs(el).display;
  const flexish = /flex|grid/.test(display) || props.flexify;
  if (props.flexify) {
    st.display = "flex";
    st["flex-direction"] = "column";
  }
  const column = props.flexify || cs(el).flexDirection.startsWith("column");
  const mapH = { left: "flex-start", center: "center", right: "flex-end", justify: "space-between" };
  const mapV = { top: "flex-start", center: "center", bottom: "flex-end" };
  if (props.alignH) {
    st["text-align"] = props.alignH;
    if (flexish) st[/grid/.test(display) ? "justify-items" : column ? "align-items" : "justify-content"] = props.alignH === "justify" && column ? "stretch" : mapH[props.alignH];
  }
  if (props.alignV && flexish) st[/grid/.test(display) ? "align-content" : column ? "justify-content" : "align-items"] = mapV[props.alignV];
  if (has("gap")) st.gap = `${num(props.gap)}px`;
  if (props.img) renderImage(el, props.img, st);
  // A drawing from the library in place of the element: its content hides (page style) and the box shows the drawing.
  if (!el.hasAttribute("data-ct-added")) {
    const art = props.art && safeUrl(props.art.src || "");
    if (art) {
      const mask = `${cssUrl(art)} center / contain no-repeat`;
      st.background = colorOf(props.art.color, edits) || "#111111";
      st["-webkit-mask"] = mask;
      st.mask = mask;
    }
    writeAttr(el, "data-ct-art", art ? "" : null);
  }
  if (props.removed) st.display = "none";
  if (validStill(props.still) && !st.mask && !st["mask-image"]) Object.assign(st, stillMaskStyles(props.still, el));
  if (props.shape && props.shapeFix && st["clip-path"] && el.parentElement) {
    const s = props.shadow && props.shadow.on ? props.shadow : { x: 0, y: 8, blur: 24, color: "rgba(0,0,0,.35)" };
    writeStyles(el.parentElement, { filter: `drop-shadow(${num(s.x)}px ${num(s.y, 8)}px ${num(s.blur, 24) / 2}px ${colorOf(s.color, edits) || "rgba(0,0,0,.35)"})` });
    rendered.add(el.parentElement);
    delete st["box-shadow"];
  }
  writeStyles(el, st);
  placeStill(el, validStill(props.still) ? props.still : null);
  if (props.overflow === "shrink") shrinkToFit(el);
  // Texts
  if (entry.original && Array.isArray(props.text)) applyText(el, entry, props.text);
  else if (entry.original) restoreText(el, entry);
  // Actions and animations work in "Procházet web" (and for visitors of the preview).
  applyAction(el, props.action);
  bindAnimations(el, props.animations);
  rendered.add(el);
}
function shrinkToFit(el) {
  const ratio = Math.min(1, el.clientWidth / Math.max(1, el.scrollWidth), el.clientHeight / Math.max(1, el.scrollHeight));
  if (ratio < 0.999) {
    const cur = appliedStyles.get(el) || {};
    const size = parseFloat(cs(el).fontSize) * ratio;
    writeStyles(el, Object.assign({}, cur, { "font-size": `${round(size, 2)}px` }));
  }
}
function restoreElement(el) {
  writeStyles(el, {});
  placeStill(el, null);
  restoreAttrs(el, ["data-ct"]);
  const key = el.getAttribute("data-ct");
  const entry = key && store.catalog[key];
  if (entry && entry.original) restoreText(el, entry);
  bindAnimations(el, null);
}

/* ---------- texts ---------- */

const textNodes = new WeakMap();
const appliedText = new WeakMap();
const textEdges = new WeakMap();
function splitEdge(value) {
  const m = String(value ?? "").match(/^(\s*)([\s\S]*?)(\s*)$/);
  return { lead: m[1], core: m[2], trail: m[3] };
}
/** Indentation around the site's own text. Spaces the user types belong to the text, not to this edge. */
function edgeOf(node, originalCore) {
  let edge = textEdges.get(node);
  if (edge) return edge;
  const parts = splitEdge(node.nodeValue);
  if (parts.core !== originalCore && !appliedText.has(node)) return null;
  edge = { lead: parts.lead, trail: parts.trail };
  textEdges.set(node, edge);
  return edge;
}
function visibleTextNodes(el) {
  const out = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || SKIP_TEXT.has(parent.tagName)) continue;
    if (parent.closest("svg, script, style, textarea, input, select")) continue;
    if (!String(n.nodeValue).trim() && !appliedText.has(n)) continue;
    out.push(n);
  }
  return out;
}
function segmentsOf(el, entry) {
  let nodes = textNodes.get(el);
  if (!nodes || nodes.some((n) => !n.isConnected || !el.contains(n))) {
    nodes = ownTextNodes(el);
    if (nodes.length !== entry.original.length) nodes = visibleTextNodes(el);
    if (nodes.length !== entry.original.length) return null;
    textNodes.set(el, nodes);
  }
  return nodes;
}
function applyText(el, entry, segments) {
  const nodes = segmentsOf(el, entry);
  if (!nodes) return;
  nodes.forEach((node, i) => {
    const want = String(segments[i] ?? entry.original[i] ?? "");
    const edge = edgeOf(node, entry.original[i]);
    if (!edge) return;
    const next = edge.lead + want + edge.trail;
    if (node.nodeValue === next) {
      appliedText.set(node, want);
      return;
    }
    const applied = appliedText.get(node);
    const { core } = splitEdge(node.nodeValue);
    const stillOurs = applied !== undefined && (node.nodeValue === edge.lead + String(applied) + edge.trail || core === applied);
    const stillOriginal = core === entry.original[i];
    // Leave text the page itself replaced. Everything we wrote, including a trailing space, stays editable.
    if (!stillOurs && !stillOriginal) return;
    node.__ctOwn = 1;
    node.nodeValue = next;
    appliedText.set(node, want);
  });
}
function restoreText(el, entry) {
  const nodes = segmentsOf(el, entry);
  if (!nodes) return;
  nodes.forEach((node, i) => {
    if (appliedText.get(node) === undefined) return;
    const edge = textEdges.get(node) || { lead: "", trail: "" };
    const back = edge.lead + entry.original[i] + edge.trail;
    if (node.nodeValue !== back) {
      node.__ctOwn = 1;
      node.nodeValue = back;
    }
    appliedText.delete(node);
  });
}

/* ---------- images ---------- */

function renderImage(el, img, st) {
  if (el.tagName.toLowerCase() !== "img") return;
  if (img.media) {
    const url = media.urlFor(img.media);
    if (url) {
      writeAttr(el, "src", url);
      dropAttr(el, "srcset");
      dropAttr(el, "sizes");
      const picture = el.parentElement && el.parentElement.tagName.toLowerCase() === "picture" ? el.parentElement : null;
      if (picture) picture.querySelectorAll("source").forEach((s) => {
        dropAttr(s, "srcset");
        rendered.add(s);
      });
    }
  }
  if (typeof img.alt === "string") writeAttr(el, "alt", img.alt);
  if (img.focal) {
    st["object-position"] = `${clamp(num(img.focal.x, 50), 0, 100)}% ${clamp(num(img.focal.y, 50), 0, 100)}%`;
    st["object-fit"] = img.fit || "cover";
  }
}

/* ---------- actions ---------- */

const INTERACTIVE = "a[href], button, input, select, textarea, summary, [role=button], [role=link]";
function applyAction(el, action) {
  const active = action && action.id && (action.replace || !el.matches(INTERACTIVE));
  if (active) {
    writeAttr(el, "data-ct-action", action.id);
    if (!el.matches(INTERACTIVE)) {
      writeAttr(el, "role", el.getAttribute("role") || "button");
      writeAttr(el, "tabindex", el.getAttribute("tabindex") || "0");
    }
  } else if (el.hasAttribute("data-ct-action")) {
    writeAttr(el, "data-ct-action", null);
    writeAttr(el, "role", null);
    writeAttr(el, "tabindex", null);
  }
}
let actionsEnabled = () => true;
function runAction(el, event) {
  const key = el.getAttribute("data-ct");
  if (!key) return false;
  const win = winOf(el);
  const action = resolveProps(key, pageOfWin(win), deviceOfWin(win), activeEdits()).props.action;
  if (!action) return false;
  const p = action.params || {};
  switch (action.id) {
    case "link-page":
      if (!p.path) return false;
      win.location.assign(p.path);
      return true;
    case "scroll-to": {
      const target = p.target && query(el.ownerDocument, "#" + CSS.escape(p.target));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return !!target;
    }
    case "call":
      if (!p.phone) return false;
      win.location.href = "tel:" + String(p.phone).replace(/[^\d+]/g, "");
      return true;
    case "email":
      if (!p.email) return false;
      win.location.href = "mailto:" + encodeURIComponent(p.email).replace(/%40/g, "@");
      return true;
    case "open-url": {
      const url = safeUrl(p.url || "");
      if (!url || url.startsWith("media:")) return false;
      if (p.newWindow) win.open(url, "_blank", "noopener");
      else win.location.assign(url);
      return true;
    }
    default:
      return false; // saved actions from the agent are implemented in the site's own code
  }
}
function installActionHandler(doc) {
  const onClick = (event) => {
    if (!actionsEnabled()) return;
    const el = event.target && event.target.closest && event.target.closest("[data-ct-action]");
    if (el && runAction(el, event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target && event.target.matches && event.target.matches("[data-ct-action][role=button]")) onClick(event);
  }, true);
}

/* ---------- still region: a marked part stays at the rest pose while the rest keeps moving ---------- */

function stillIsDraw(s) {
  return !!(s && Array.isArray(s.strokes) && s.strokes.some((st) => st && Array.isArray(st.pts) && st.pts.length));
}
function stillBrushOf(s) {
  const n = Number(s && s.brush);
  return Number.isFinite(n) ? clamp(n, 1, 40) : 6;
}
function validStill(s) {
  if (stillIsDraw(s)) return true;
  if (!s || typeof s !== "object") return false;
  const x = Number(s.x);
  const y = Number(s.y);
  const w = Number(s.w);
  const h = Number(s.h);
  return [x, y, w, h].every((n) => Number.isFinite(n)) && w >= 2 && h >= 2 && x < 100 && y < 100;
}
function stillStamp(s) {
  if (!s) return "";
  if (stillIsDraw(s)) {
    const n = s.strokes.reduce((a, st) => a + (st.pts ? st.pts.length : 0), 0);
    const p = s.strokes[0] && s.strokes[0].pts && s.strokes[0].pts[0];
    return `d${s.strokes.length}:${n}:${stillBrushOf(s)}:${p ? p.join(",") : ""}`;
  }
  return `r${s.x}:${s.y}:${s.w}:${s.h}`;
}
function shiftStill(still, dx, dy) {
  return {
    brush: stillBrushOf(still),
    strokes: still.strokes.map((s) => ({ pts: (s.pts || []).map(([x, y]) => [round(num(x) + dx, 1), round(num(y) + dy, 1)]) })),
  };
}
function stillSvg(still, w, h, mode) {
  const brush = stillBrushOf(still);
  const sw = Math.max(1, (brush / 100) * Math.min(Math.max(1, w), Math.max(1, h)));
  const ink = mode === "hole" ? "black" : mode === "keep" ? "white" : "#6fb7ff";
  const paths = (still.strokes || []).filter((s) => s && s.pts && s.pts.length).map((s) => {
    const d = s.pts.map((p, i) => `${i ? "L" : "M"}${round((num(p[0]) / 100) * w, 2)} ${round((num(p[1]) / 100) * h, 2)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${round(sw, 2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  const vb = `0 0 ${Math.max(1, round(w, 2))} ${Math.max(1, round(h, 2))}`;
  if (mode === "hole") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="none"><defs><mask id="ct-still"><rect width="100%" height="100%" fill="white"/>${paths}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#ct-still)"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="none">${paths}</svg>`;
}
function stillMaskUrl(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function normStill(x1, y1, x2, y2) {
  const x = clamp(Math.min(x1, x2), 0, 100);
  const y = clamp(Math.min(y1, y2), 0, 100);
  const r = clamp(Math.max(x1, x2), 0, 100);
  const b = clamp(Math.max(y1, y2), 0, 100);
  return { x: round(x, 1), y: round(y, 1), w: round(Math.max(0, r - x), 1), h: round(Math.max(0, b - y), 1) };
}
function stillMaskStyles(still, el) {
  if (stillIsDraw(still)) {
    const w = Math.max(1, (el && el.offsetWidth) || 1);
    const h = Math.max(1, (el && el.offsetHeight) || 1);
    const url = stillMaskUrl(stillSvg(still, w, h, "hole"));
    return {
      "mask-image": url,
      "-webkit-mask-image": url,
      "mask-size": "100% 100%",
      "-webkit-mask-size": "100% 100%",
      "mask-repeat": "no-repeat",
      "-webkit-mask-repeat": "no-repeat",
      "mask-position": "0 0",
      "-webkit-mask-position": "0 0",
    };
  }
  const x = round(clamp(num(still.x), 0, 99), 2);
  const y = round(clamp(num(still.y), 0, 99), 2);
  const w = round(clamp(num(still.w), 1, 100 - x), 2);
  const h = round(clamp(num(still.h), 1, 100 - y), 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path fill="white" fill-rule="evenodd" d="M0 0 H100 V100 H0 Z M${x} ${y} H${round(x + w, 2)} V${round(y + h, 2)} H${x} Z"/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return {
    "mask-image": url,
    "-webkit-mask-image": url,
    "mask-size": "100% 100%",
    "-webkit-mask-size": "100% 100%",
    "mask-repeat": "no-repeat",
    "-webkit-mask-repeat": "no-repeat",
    "mask-position": "0 0",
    "-webkit-mask-position": "0 0",
  };
}
function nodeMoves(node) {
  const c = node.ownerDocument.defaultView.getComputedStyle(node);
  if (c.animationName && c.animationName !== "none") {
    let frames = [];
    try {
      const running = node.getAnimations ? node.getAnimations() : [];
      for (const a of running) {
        const list = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
        frames = frames.concat(list);
      }
    } catch {}
    if (!frames.length) return true;
    if (frames.some((f) => f && ["transform", "translate", "rotate", "scale", "left", "top", "right", "bottom"].some((k) => f[k] != null && f[k] !== ""))) return true;
  }
  if (c.transform && c.transform !== "none") return true;
  if (c.translate && c.translate !== "none") return true;
  if (c.rotate && c.rotate !== "none" && c.rotate !== "0deg") return true;
  return false;
}
const motionMemo = new WeakMap();
function motionRoot(el) {
  const cached = motionMemo.get(el);
  if (cached && cached.root && cached.root.isConnected) return cached.root;
  let root = el;
  let n = el;
  const doc = el.ownerDocument;
  while (n && n !== doc.body && n !== doc.documentElement) {
    if (!(n.hasAttribute && n.hasAttribute("data-ct-still")) && nodeMoves(n)) root = n;
    n = n.parentElement;
  }
  return root;
}
function layoutWithin(el, ancestor) {
  if (el === ancestor) return { x: 0, y: 0, w: el.offsetWidth, h: el.offsetHeight };
  const chain = [];
  let n = el;
  const doc = el.ownerDocument;
  while (n && n !== doc.body && n !== doc.documentElement) {
    chain.push(n);
    if (n === ancestor) break;
    n = n.offsetParent;
  }
  if (n === ancestor) {
    let x = 0;
    let y = 0;
    for (const node of chain) {
      if (node === ancestor) break;
      x += node.offsetLeft;
      y += node.offsetTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }
  const a = ancestor.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const sx = ancestor.offsetWidth ? a.width / ancestor.offsetWidth : 1;
  const sy = ancestor.offsetHeight ? a.height / ancestor.offsetHeight : 1;
  return { x: (r.left - a.left) / (sx || 1), y: (r.top - a.top) / (sy || 1), w: el.offsetWidth, h: el.offsetHeight };
}
function restBoxInDocument(el) {
  const root = motionRoot(el);
  const parent = root.offsetParent || el.ownerDocument.documentElement;
  const pr = parent.getBoundingClientRect();
  const sx = parent.offsetWidth ? pr.width / parent.offsetWidth : 1;
  const sy = parent.offsetHeight ? pr.height / parent.offsetHeight : 1;
  const local = layoutWithin(el, parent);
  return { left: pr.left + local.x * sx, top: pr.top + local.y * sy, width: Math.max(1, local.w * sx), height: Math.max(1, local.h * sy) };
}
function restViewportBox(el) {
  const inner = restBoxInDocument(el);
  if (!inner || !(inner.width > 1) || !(inner.height > 1)) return null;
  const v = el.ownerDocument === document ? { x: 0, y: 0, s: 1 } : viewBox();
  const left = v.x + inner.left * v.s;
  const top = v.y + inner.top * v.s;
  const width = inner.width * v.s;
  const height = inner.height * v.s;
  return { left, top, width, height, right: left + width, bottom: top + height };
}
function stillSpace(el) {
  if (S.stillDraw && S.stillEl === el) return boxOf(el);
  return restViewportBox(el);
}
function holdSheet(doc) {
  if (doc.getElementById("ct-still-hold-style")) return;
  const style = doc.createElement("style");
  style.id = "ct-still-hold-style";
  style.textContent = ".ct-still-hold,.ct-still-hold *{animation:none!important;transition:none!important;transform:none!important}html.ct-still-draw,html.ct-still-draw *{cursor:crosshair!important}";
  (doc.head || doc.documentElement).appendChild(style);
}
function holdMotion(el) {
  if (!el) return;
  const root = motionRoot(el);
  motionMemo.set(el, { root });
  holdSheet(el.ownerDocument);
  root.classList.add("ct-still-hold");
}
function releaseMotion(el) {
  if (!el) return;
  const cached = motionMemo.get(el);
  motionMemo.delete(el);
  if (cached && cached.root) cached.root.classList.remove("ct-still-hold");
}
const stillHosts = new Map();
const STILL_OFF = ["animation", "transition", "transform", "mask", "mask-image", "-webkit-mask", "-webkit-mask-image", "clip-path"];
function placeStill(el, still) {
  let host = stillHosts.get(el);
  if (!el || !el.isConnected || !validStill(still)) {
    if (host) host.remove();
    stillHosts.delete(el);
    return;
  }
  const root = motionRoot(el);
  const parent = root.offsetParent || el.parentElement;
  if (!parent || !(root.offsetWidth > 1) || !(el.offsetWidth > 1)) return;
  const doc = el.ownerDocument;
  if (!host || host.ownerDocument !== doc) {
    host = doc.createElement("div");
    host.setAttribute("data-ct-still", "");
    host.setAttribute("aria-hidden", "true");
    host.inert = true;
    stillHosts.set(el, host);
  }
  host.style.position = "absolute";
  host.style.left = root.offsetLeft + "px";
  host.style.top = root.offsetTop + "px";
  host.style.width = root.offsetWidth + "px";
  host.style.height = root.offsetHeight + "px";
  host.style.margin = "0";
  host.style.padding = "0";
  host.style.border = "0";
  host.style.pointerEvents = "none";
  host.style.overflow = "visible";
  host.style.animation = "none";
  host.style.transition = "none";
  host.style.transform = "none";
  host.style.background = "none";
  const z = doc.defaultView.getComputedStyle(root).zIndex;
  host.style.zIndex = z !== "auto" && Number.isFinite(parseInt(z, 10)) ? String(parseInt(z, 10) + 1) : "1";
  if (host.parentElement !== parent) parent.appendChild(host);
  const local = layoutWithin(el, root);
  const drawn = stillIsDraw(still);
  if (drawn) host.style.clipPath = "none";
  else {
    const rw = root.offsetWidth || 1;
    const rh = root.offsetHeight || 1;
    const pad = 0.4;
    const mx = (local.x / rw) * 100 + num(still.x) * (local.w / rw) - pad;
    const my = (local.y / rh) * 100 + num(still.y) * (local.h / rh) - pad;
    const mw = num(still.w) * (local.w / rw) + pad * 2;
    const mh = num(still.h) * (local.h / rh) + pad * 2;
    host.style.clipPath = `inset(${round(my, 2)}% ${round(100 - mx - mw, 2)}% ${round(100 - my - mh, 2)}% ${round(mx, 2)}%)`;
  }
  const sig = `${el.tagName}|${el.getAttribute("src") || ""}|${el.className}|${el.childElementCount}`;
  let clone = host.firstElementChild;
  if (!clone || clone.getAttribute("data-ct-sig") !== sig) {
    const deep = el.tagName !== "IMG" && el.tagName !== "VIDEO" && el.tagName !== "CANVAS";
    clone = el.cloneNode(deep);
    clone.removeAttribute("id");
    clone.removeAttribute("data-ct");
    clone.setAttribute("data-ct-sig", sig);
    clone.setAttribute("data-ct-still-clone", "");
    if (clone.querySelectorAll) {
      clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      clone.querySelectorAll("[data-ct]").forEach((n) => n.removeAttribute("data-ct"));
    }
    host.replaceChildren(clone);
  }
  const pin = (node, source) => {
    for (const prop of STILL_OFF) node.style.setProperty(prop, "none", "important");
    if (source) {
      node.style.translate = source.style.translate || "none";
      node.style.rotate = source.style.rotate || "none";
      node.style.scale = source.style.scale || "none";
      node.style.transformOrigin = doc.defaultView.getComputedStyle(source).transformOrigin;
    }
  };
  clone.style.position = "absolute";
  clone.style.left = local.x + "px";
  clone.style.top = local.y + "px";
  clone.style.width = local.w + "px";
  clone.style.height = local.h + "px";
  clone.style.margin = "0";
  clone.style.maxWidth = "none";
  clone.style.maxHeight = "none";
  pin(clone, el);
  if (clone.querySelectorAll) clone.querySelectorAll("*").forEach((n) => pin(n, null));
  if (drawn) {
    const url = stillMaskUrl(stillSvg(still, local.w, local.h, "keep"));
    for (const prop of ["mask-image", "-webkit-mask-image"]) clone.style.setProperty(prop, url, "important");
    for (const prop of ["mask-size", "-webkit-mask-size"]) clone.style.setProperty(prop, "100% 100%", "important");
    for (const prop of ["mask-repeat", "-webkit-mask-repeat"]) clone.style.setProperty(prop, "no-repeat", "important");
    for (const prop of ["mask-position", "-webkit-mask-position"]) clone.style.setProperty(prop, "0 0", "important");
  }
}

/* ---------- animations (Web Animations API, added on top of the element's own values) ---------- */

const BUILTIN_ANIMATIONS = [
  { id: "fade-up", type: "enter", name: "Vyjetí zdola", duration: 700, delay: 0, easing: "cubic-bezier(.22,1,.36,1)", changes: "průhlednost, posun", replace: [{ opacity: 0 }, { opacity: 1 }], add: [{ translate: "0px 28px" }, { translate: "0px 0px" }], builtin: true },
  { id: "fade-in", type: "enter", name: "Prolnutí", duration: 600, easing: "ease-out", changes: "průhlednost", replace: [{ opacity: 0 }, { opacity: 1 }], builtin: true },
  { id: "scale-in", type: "enter", name: "Přiblížení", duration: 600, easing: "cubic-bezier(.22,1,.36,1)", changes: "průhlednost, velikost", replace: [{ opacity: 0 }, { opacity: 1 }], add: [{ scale: "0.9" }, { scale: "1" }], builtin: true },
  { id: "draw-in", type: "enter", name: "Nakreslení (odkrytí zleva)", duration: 900, easing: "cubic-bezier(.65,0,.35,1)", changes: "ořez", replace: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], builtin: true },
  { id: "slide-left", type: "enter", name: "Vyjetí zprava", duration: 700, easing: "cubic-bezier(.22,1,.36,1)", changes: "průhlednost, posun", replace: [{ opacity: 0 }, { opacity: 1 }], add: [{ translate: "48px 0px" }, { translate: "0px 0px" }], builtin: true },
  { id: "hover-lift", type: "hover", name: "Nadzvednutí", duration: 220, easing: "ease-out", changes: "posun", add: [{ translate: "0px 0px" }, { translate: "0px -6px" }], builtin: true },
  { id: "hover-grow", type: "hover", name: "Zvětšení", duration: 220, easing: "ease-out", changes: "velikost", add: [{ scale: "1" }, { scale: "1.05" }], builtin: true },
  { id: "hover-tilt", type: "hover", name: "Naklonění", duration: 220, easing: "ease-out", changes: "otočení", add: [{ rotate: "0deg" }, { rotate: "-3deg" }], builtin: true },
  { id: "click-pulse", type: "click", name: "Pulz", duration: 320, easing: "ease-out", changes: "velikost", add: [{ scale: "1" }, { scale: "0.94" }, { scale: "1" }], builtin: true },
  { id: "click-shake", type: "click", name: "Zatřesení", duration: 420, easing: "ease-in-out", changes: "posun", add: [{ translate: "0px 0px" }, { translate: "-6px 0px" }, { translate: "6px 0px" }, { translate: "-3px 0px" }, { translate: "0px 0px" }], builtin: true },
];
let registry = { actions: [], animations: [] };
const animationDef = (id) => registry.animations.find((a) => a.id === id) || BUILTIN_ANIMATIONS.find((a) => a.id === id);
function playAnimation(el, a, opts = {}) {
  const def = animationDef(a.id);
  if (!def || !el.animate) return [];
  const timing = { duration: clamp(num(a.duration, def.duration || 500), 0, 20000), delay: clamp(num(a.delay, def.delay || 0), 0, 20000), easing: a.easing || def.easing || "ease", fill: opts.fill || "none", direction: opts.reverse ? "reverse" : "normal" };
  const out = [];
  try {
    if (def.replace) out.push(el.animate(def.replace, Object.assign({}, timing, { composite: "replace" })));
    if (def.add) out.push(el.animate(def.add, Object.assign({}, timing, { composite: "add" })));
  } catch {}
  return out;
}
const animBound = new WeakMap();
const enteredOnce = new WeakSet();
function bindAnimations(el, anims) {
  const sig = JSON.stringify(anims || null);
  const cur = animBound.get(el);
  if (cur && cur.sig === sig) return;
  if (cur) cur.off();
  if (!anims || isEmptyObj(anims)) {
    animBound.delete(el);
    return;
  }
  const offs = [];
  const win = winOf(el);
  if (anims.enter && anims.enter.id && !enteredOnce.has(el)) {
    const io = new win.IntersectionObserver((list) => {
      if (list.some((e) => e.isIntersecting)) {
        io.disconnect();
        enteredOnce.add(el);
        playAnimation(el, anims.enter);
      }
    }, { threshold: 0.15 });
    io.observe(el);
    offs.push(() => io.disconnect());
  }
  if (anims.hover && anims.hover.id) {
    let running = [];
    const enter = () => {
      running.forEach((a) => a.cancel());
      running = playAnimation(el, anims.hover, { fill: "forwards" });
    };
    const leave = () => {
      running.forEach((a) => a.cancel());
      running = playAnimation(el, anims.hover, { reverse: true });
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    offs.push(() => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      running.forEach((a) => a.cancel());
    });
  }
  if (anims.click && anims.click.id) {
    const click = () => actionsEnabled() && playAnimation(el, anims.click);
    el.addEventListener("click", click);
    offs.push(() => el.removeEventListener("click", click));
  }
  animBound.set(el, { sig, off: () => offs.forEach((f) => f()) });
}

/* ---------- tokens on :root ---------- */

function applyTokens(doc, edits) {
  const root = doc.documentElement;
  const st = {};
  for (const [name, t] of Object.entries(edits.tokens || {})) {
    const def = allTokens(edits)[name];
    if (!def || t.value === undefined) continue;
    const value = String(t.value);
    if (value.length > 200 || /[;{}<>]/.test(value)) continue;
    st[def.var] = value;
  }
  writeStyles(root, st);
  if (!isEmptyObj(st)) rendered.add(root);
}

/* ---------- drawings added to the page ----------
 * One layer at the end of <body>, outside the site's own markup. Each drawing is pinned to an anchor element:
 * x and y are its centre in % of the anchor box and w its width at the anchor width refW, so it follows the section
 * on every screen. Moves, sizes, rotation and animations on top of that are ordinary element edits. */

const ADDED_LAYER = "creatool-added";
const addedWatched = new WeakSet();
function anchorOf(el) {
  const id = el && el.getAttribute && el.getAttribute("data-ct-added");
  if (!id) return null;
  const a = (activeEdits().added || []).find((x) => x.id === id);
  return a ? query(el.ownerDocument, a.anchor) : null;
}
function showModelStops(doc) {
  if (S.hidden) return false;
  const root = doc && doc.documentElement;
  if (root && root.classList.contains("ct-mode-model")) return true;
  return doc === document && !isChild;
}
function renderAdded(doc, edits) {
  const page = pageOfWin(doc.defaultView);
  const list = (edits.added || []).filter((a) => a && a.id && (a.art || a.kind === "text" || a.kind === "model") && addedOnPage(a, page));
  let layer = doc.getElementById(ADDED_LAYER);
  if (!list.length) {
    if (layer) layer.replaceChildren();
    placeAdded(doc, edits);
    return;
  }
  if (!layer) {
    layer = doc.createElement("div");
    layer.id = ADDED_LAYER;
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = `position:absolute;left:0;top:0;width:100%;height:0;overflow:visible;pointer-events:none;z-index:${Math.round(num(cfg.addedLayerZ, 40))}`;
  }
  if (!layer.isConnected) doc.body.append(layer);
  const seen = new Set();
  const device = deviceOfWin(doc.defaultView);
  const showStops = showModelStops(doc);
  const jobs = [];
  for (const a of list) {
    const live = resolvedAdded(a, device);
    if (live.removed) continue;
    if (a.kind === "model" && showStops && Array.isArray(live.stops) && live.stops.length > 1) {
      live.stops.forEach((stop, index) => jobs.push({ a, stop, index }));
      continue;
    }
    jobs.push({ a, stop: null, index: 0 });
  }
  for (const job of jobs) {
    const a = job.a;
    const stopKey = job.stop ? job.stop.id : "";
    let node = Array.from(layer.children).find((n) => n.getAttribute("data-ct-added") === a.id && (n.getAttribute("data-ct-stop") || "") === stopKey);
    if (!node) {
      node = doc.createElement("span");
      node.className = "ct-added";
      node.setAttribute("data-ct-added", a.id);
      node.setAttribute("data-creatool-id", "ct-add-" + a.id);
      layer.append(node);
    }
    if (stopKey) node.setAttribute("data-ct-stop", stopKey);
    else node.removeAttribute("data-ct-stop");
    node.setAttribute("data-ct-page", a.page);
    if (a.kind === "text") {
      // Text goes in as a text node, never as HTML.
      const text = String(a.text ?? "");
      if (node.textContent !== text) node.textContent = text;
      const t = a.style || {};
      node.setAttribute("data-kind", "text");
      node.setAttribute("data-creatool-label", "Přidaný text · „" + text.replace(/\s+/g, " ").slice(0, 50) + "“");
      node.style.setProperty("--ct-font", t.font ? `"${String(t.font).replace(/["\\]/g, "")}", sans-serif` : "inherit");
      node.style.setProperty("--ct-color", colorOf(t.color, edits) || "#111111");
      node.style.setProperty("--ct-weight", String(clamp(Math.round(num(t.weight, 400) / 100) * 100, 100, 900)));
      node.style.setProperty("--ct-style", t.italic ? "italic" : "normal");
      node.style.setProperty("--ct-align", ["left", "center", "right"].includes(t.align) ? t.align : "left");
      node.style.setProperty("--ct-tt", t.upper ? "uppercase" : "none");
      node.style.setProperty("--ct-lh", String(clamp(num(t.lineHeight, 1.2), 0.7, 3)));
    } else if (a.kind !== "model") {
      const url = safeUrl(a.art.src || "");
      node.setAttribute("data-kind", "art");
      node.setAttribute("data-creatool-label", "Přidaný prvek · " + String(a.art.name || "kresba").slice(0, 80));
      node.style.setProperty("--ct-art", url ? cssUrl(url) : "none");
      node.style.setProperty("--ct-color", colorOf(a.art.color, edits) || "#111111");
      node.style.setProperty("--ct-ratio", String(round(clamp(num(a.art.ratio, 1), 0.05, 20), 4)));
    } else {
      const live = resolvedAdded(a, device);
      const model = live.model || {};
      const stop = job.stop;
      node.setAttribute("data-kind", "model");
      node.setAttribute("data-creatool-label", "3D model · " + String(model.name || "model").slice(0, 80));
      node.style.setProperty("--ct-ratio", "0.9");
      let bar = node.querySelector(".ct-model-bar");
      let canvas = node.querySelector("canvas");
      if (!bar) {
        bar = doc.createElement("div");
        bar.className = "ct-model-bar";
        node.append(bar);
      }
      const deg = (rad) => Math.round(num(rad) * 180 / Math.PI);
      const order = (Array.isArray(live.stops) ? live.stops : []).map((s, n) => ({ id: s.id, y: num(s.y), x: num(s.x), n })).sort((p, q) => p.y - q.y || p.x - q.x || p.n - q.n);
      const place = stop ? order.findIndex((row) => row.id === stop.id) + 1 : 0;
      let name = bar.querySelector(".ct-model-name");
      if (!name) {
        bar.replaceChildren();
        name = doc.createElement("span");
        name.className = "ct-model-name";
        bar.append(name);
      }
      name.textContent = stop ? `Pozice ${place} · ${deg(stop.ry)}°` : String(model.name || "3D model");
      let scaleBtn = node.querySelector(".ct-model-scale");
      if (!scaleBtn) {
        scaleBtn = doc.createElement("button");
        scaleBtn.type = "button";
        scaleBtn.className = "ct-model-scale";
        scaleBtn.textContent = "⤡";
        scaleBtn.title = "Změnit velikost této zastávky";
        scaleBtn.setAttribute("aria-label", "Změnit velikost");
        node.append(scaleBtn);
      }
      scaleBtn.setAttribute("data-ct-scale", a.id);
      if (stop) scaleBtn.setAttribute("data-ct-stop", stop.id);
      else scaleBtn.removeAttribute("data-ct-stop");
      if (!canvas) {
        canvas = doc.createElement("canvas");
        node.append(canvas);
      }
      canvas.setAttribute("data-ct-orbit", a.id);
      if (stop) canvas.setAttribute("data-ct-stop", stop.id);
      else canvas.removeAttribute("data-ct-stop");
      models.mount(canvas, a.id, stop && stop.id);
    }
    seen.add(node);
  }
  for (const node of Array.from(layer.children)) if (!seen.has(node)) node.remove();
  placeAdded(doc, edits);
  if (!addedWatched.has(doc)) {
    // Anchors also move without DOM changes (images loading, sticky sections), so the layer follows on its own.
    addedWatched.add(doc);
    const win = doc.defaultView;
    let frame = 0;
    const follow = () => {
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => placeAdded(doc));
    };
    win.addEventListener("scroll", follow, { passive: true });
    win.addEventListener("resize", follow);
    win.setInterval(() => placeAdded(doc), 500);
  }
}
function placeAdded(doc, edits = activeEdits()) {
  if (typeof models !== "undefined") models.syncGates(doc);
  const layer = doc.getElementById(ADDED_LAYER);
  if (!layer || !layer.children.length) return;
  const origin = layer.getBoundingClientRect();
  for (const node of Array.from(layer.children)) {
    const a = (edits.added || []).find((x) => x.id === node.getAttribute("data-ct-added"));
    const anchor = a && query(doc, a.anchor);
    const r = anchor && anchor.getBoundingClientRect();
    if (!a || !r || (!r.width && !r.height)) {
      node.style.display = "none";
      continue;
    }
    const device = deviceOfWin(doc.defaultView);
    const live = resolvedAdded(a, device);
    if (live.removed) {
      node.style.display = "none";
      continue;
    }
    let x = num(live.x);
    let y = num(live.y);
    const stopId = node.getAttribute("data-ct-stop");
    const showStops = showModelStops(doc);
    let pose = null;
    if (a.kind === "model" && stopId && Array.isArray(live.stops)) {
      const stop = live.stops.find((s) => s.id === stopId);
      if (stop) { x = num(stop.x); y = num(stop.y); pose = stop; }
    } else if (a.kind === "model" && !showStops && Array.isArray(live.stops) && live.stops.length > 1) {
      pose = models.blend(a, doc.defaultView);
      x = pose.x;
      y = pose.y;
    }
    const stopScale = a.kind === "model" ? num(pose && pose.s, 1) : 1;
    // On a narrower anchor the drawing shrinks less than the layout does.
    const f = num(a.refW) > 0 ? clamp(Math.sqrt(r.width / num(a.refW)), 0.45, 1.6) : 1;
    node.style.display = "";
    node.style.left = `${round(r.left - origin.left + (x / 100) * r.width, 1)}px`;
    node.style.top = `${round(r.top - origin.top + (y / 100) * r.height, 1)}px`;
    node.style.setProperty("--ct-w", `${round(num(live.w != null ? live.w : a.w, 120) * f * stopScale, 1)}px`);
    if (a.kind === "text") node.style.setProperty("--ct-size", `${round(Math.max(12, num((a.style || {}).size, 24) * f), 1)}px`);
  }
}

/* ---------- everything ---------- */

function addedOnPage(a, page) {
  if (a.page === "*" || a.page === page) return true;
  if (langOf(a.page) !== baseLang()) return false;
  return a.page === basePageOf(page);
}
function roleOnPage(entry, page) {
  if (!entry) return null;
  if (onPageOf(entry, page)) return "local";
  if (!entry.shared && entry.pages.includes(basePageOf(page)) && basePageOf(page) !== page) return "base";
  return null;
}
function applyAll(doc = document) {
  const edits = activeEdits();
  const win = doc.defaultView;
  const page = pageOfWin(win);
  const device = deviceOfWin(win);
  applyTokens(doc, edits);
  renderAdded(doc, edits);
  const seen = new Set([doc.documentElement]);
  const jobs = [];
  for (const [key, meta] of Object.entries(edits.elements)) {
    const entry = store.catalog[key];
    const role = roleOnPage(entry, page);
    if (role) jobs.push({ key, meta, entry, role });
  }
  jobs.sort((a, b) => (a.role === "base" ? 0 : 1) - (b.role === "base" ? 0 : 1));
  for (const job of jobs) {
    const el = query(doc, job.entry.selector);
    if (!el || isIgnored(el)) continue;
    if (job.role === "local") el.setAttribute("data-ct", job.key);
    const { props, from } = resolveProps(job.key, page, device, edits);
    const temp = previewOverrides.get(job.key);
    if (temp) Object.assign(props, temp);
    renderElement(el, job.entry, props, from, device, job.meta, edits);
    seen.add(el);
    if (props.shapeFix && el.parentElement) seen.add(el.parentElement);
    if (el.parentElement && el.parentElement.tagName.toLowerCase() === "picture") el.parentElement.querySelectorAll("source").forEach((s) => seen.add(s));
  }
  for (const key of previewOverrides.keys()) {
    if (edits.elements[key]) continue;
    const entry = store.catalog[key];
    const el = entry && query(doc, entry.selector);
    if (!el) continue;
    renderElement(el, entry, Object.assign({}, previewOverrides.get(key)), {}, device, null, edits);
    seen.add(el);
  }
  for (const el of Array.from(rendered)) {
    if (el.ownerDocument !== doc) continue;
    if (!el.isConnected) rendered.delete(el);
    else if (!seen.has(el)) {
      restoreElement(el);
      rendered.delete(el);
    }
  }
}

// ---- 05-library.js ----
/* ---------- library: drawings to add to the page or to put in place of an element ----------
 * The manifest (cfg.libraryUrl, built by knihovna.mjs) lists packs of single-colour SVGs (fill="currentColor").
 * The draft stores a drawing as {id, name, src, ratio, color}, so it renders without the manifest and the export
 * names the file directly. */

const DEFAULT_ART_COLORS = [{ name: "Černá", value: "#111111" }, { name: "Oranžová", value: "#ff5100" }, { name: "Bílá", value: "#ffffff" }];
let detectedArtColors = null;
const artColors = () => {
  const base = Array.isArray(cfg.artColors) && cfg.artColors.length ? cfg.artColors : detectedArtColors || DEFAULT_ART_COLORS;
  const extra = sitePack.colors();
  const seen = new Set();
  return [...base, ...extra].filter((c) => {
    if (!c || typeof c.name !== "string" || !safeColor(c.value)) return false;
    const key = String(c.value).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const library = (() => {
  const state = { status: cfg.libraryUrl ? "idle" : "off", packs: [], byId: new Map(), error: null };
  async function load() {
    if (state.status !== "idle" && state.status !== "error") return;
    state.status = "loading";
    try {
      const base = new URL(cfg.libraryUrl, location.href);
      const res = await fetch(base.href, { cache: "no-cache" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      state.packs = [];
      state.byId.clear();
      for (const p of Array.isArray(data.packs) ? data.packs : []) {
        const items = [];
        for (const it of Array.isArray(p.items) ? p.items : []) {
          if (!it || typeof it.id !== "string" || typeof it.src !== "string") continue;
          const url = new URL(it.src, base);
          if (url.protocol !== "https:" && url.protocol !== "http:") continue;
          const item = {
            id: it.id.slice(0, 200),
            name: String(it.name || it.id).slice(0, 120),
            group: String(it.group || "Ostatní").slice(0, 60),
            pack: String(p.id || p.name || ""),
            src: url.origin === location.origin ? url.pathname : url.href,
            ratio: clamp(num(it.w, 1) / Math.max(0.01, num(it.h, 1)), 0.05, 20),
          };
          items.push(item);
          state.byId.set(item.id, item);
        }
        if (items.length) state.packs.push({ id: String(p.id || p.name), name: String(p.name || p.id), items });
      }
      state.status = "ready";
      state.error = null;
    } catch {
      state.status = "error";
      state.error = `Knihovnu prvků se nepodařilo načíst (${cfg.libraryUrl}).`;
    }
    ui.renderPanel();
  }
  return {
    load,
    get status() {
      return state.status;
    },
    get error() {
      return state.error;
    },
    get packs() {
      return state.packs;
    },
    item: (id) => state.byId.get(id) || null,
  };
})();

const ownArt = (() => {
  const DB = "creatool-drawings";
  const STORE = "files";
  let dbp = null;
  let items = [];
  function db() {
    if (!dbp)
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    return dbp;
  }
  function run(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  function svgRatio(text) {
    const box = String(text).match(/viewBox=["']([\d.\s-]+)["']/i);
    if (!box) return 1;
    const parts = box[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return clamp(parts[2] / parts[3], 0.05, 20);
    return 1;
  }
  function asItem(rec) {
    return { id: "own/" + rec.id, name: rec.name, group: "Moje", pack: "moje", src: rec.src, ratio: rec.ratio || 1, own: true };
  }
  async function refresh() {
    const recs = (await run("readonly", (s) => s.getAll())) || [];
    items = recs.filter((rec) => rec && typeof rec.src === "string").sort((a, b) => (a.created < b.created ? 1 : -1));
    return items;
  }
  async function add(file) {
    const name = file && file.name || "";
    if (!/\.svg$/i.test(name) && file.type !== "image/svg+xml") throw new Error("Vlastní kresba musí být SVG.");
    if (file.size > 1024 * 1024) throw new Error("Kresba je větší než 1 MB.");
    const text = await file.text();
    if (!/<svg[\s>]/i.test(text)) throw new Error("Soubor neobsahuje SVG.");
    const rec = { id: uid("art"), name: name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").slice(0, 80) || "Kresba", src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text), ratio: round(svgRatio(text), 4), created: now() };
    await run("readwrite", (s) => s.put(rec));
    await refresh();
    return asItem(rec);
  }
  return { refresh, add, list: () => items.map(asItem), pack: () => items.length ? { id: "moje", name: "Moje kresby", items: items.map(asItem) } : null };
})();

const artOf = (item, color) => ({ id: item.id, name: item.name, src: item.src, ratio: round(item.ratio, 4), color });
/** Width of a new drawing: squares about 120 px, long underlines wider, tall ones narrower. */
const defaultArtWidth = (ratio) => Math.round(120 * clamp(Math.sqrt(num(ratio, 1)), 0.6, 2.4));

/** A colour value ("token:…" included) as the browser renders it, for previews in the panel. */
function resolveColor(v) {
  const t = tv(v, store.edits);
  if (typeof t === "string" && t.startsWith("var(")) return getComputedStyle(document.documentElement).getPropertyValue(t.slice(4, -1).trim()).trim() || "#111111";
  return typeof t === "string" && CSS.supports("color", t) ? t : "#111111";
}
const colorProbe = document.createElement("canvas").getContext("2d");
function isLightColor(v) {
  colorProbe.fillStyle = "#000";
  colorProbe.fillStyle = resolveColor(v);
  const s = colorProbe.fillStyle;
  const m = s.startsWith("#") ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) : (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  return m.length === 3 && 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] > 150;
}

/* ---------- drawings added to the page ---------- */

/** Catalog identity of an added drawing, the same identity() gives its element on the page. */
function addedKey(a) {
  const selector = `[data-creatool-id="${CSS.escape("ct-add-" + a.id)}"]`;
  const shared = a.page === "*";
  return { key: (shared ? "s-" : "p-") + hash(selector + "|" + (shared ? "*" : a.page)), selector, shared };
}
const addedById = (id, edits = store.edits) => (edits.added || []).find((a) => a.id === id) || null;
function addedOfKey(key) {
  const entry = key && store.catalog[key];
  const m = entry && /^\[data-creatool-id="ct-add-(.+)"\]$/.exec(entry.selector);
  return m ? addedById(m[1].replace(/\\(.)/g, "$1")) : null;
}
const isAddedEntry = (entry) => !!entry && /^\[data-creatool-id="ct-add-/.test(entry.selector);

/** The drawing is pinned to the smallest block under the click that is big enough to be a section, card or column. */
function anchorAt(doc, x, y) {
  for (const hit of doc.elementsFromPoint(x, y)) {
    if (isIgnored(hit) || hit.closest("#" + ADDED_LAYER)) continue;
    for (let n = hit; n && n !== doc.body && n !== doc.documentElement; n = n.parentElement) {
      if (n instanceof winOf(n).SVGElement) continue;
      const r = n.getBoundingClientRect();
      const d = cs(n).display;
      if (r.width >= 160 && r.height >= 80 && d !== "inline" && d !== "contents") return n;
    }
  }
  return doc.querySelector(cfg.mainSelector) || doc.body;
}
function selectAdded(id) {
  const node = view.doc.querySelector(`[data-ct-added="${CSS.escape(id)}"]`);
  if (!node) return null;
  S.open.add("added");
  ui.select(register(node, "el").key);
  return node;
}
const addedLabel = (a) => a.kind === "text" ? "Přidaný text" : a.kind === "model" ? "3D model · " + ((a.model && a.model.name) || "model") : "Přidaný prvek · " + ((a.art && a.art.name) || "kresba");
function newAdded(doc, x, y, fields) {
  const anchor = anchorAt(doc, x, y);
  const r = anchor.getBoundingClientRect();
  const item = Object.assign({
    id: uid("a"),
    page: isShared(anchor) && langOf(pageOfWin(doc.defaultView)) === baseLang() ? "*" : pageOfWin(doc.defaultView),
    anchor: selectorFor(anchor),
    anchorLabel: labelFor(anchor).slice(0, 120),
    x: round(((x - r.left) / Math.max(1, r.width)) * 100, 2),
    y: round(((y - r.top) / Math.max(1, r.height)) * 100, 2),
    refW: round(r.width),
    created: now(),
  }, typeof fields === "function" ? fields(anchor, r) : fields);
  commit(item.kind === "text" ? "Přidat text" : "Přidat prvek", (ed) => {
    ed.added = (ed.added || []).concat([item]);
  });
  return item;
}
function addArtAt(doc, x, y, art) {
  const item = newAdded(doc, x, y, (anchor, r) => ({ w: Math.round(Math.min(defaultArtWidth(art.ratio), Math.max(24, r.width * 0.9))), art: clone(art) }));
  return selectAdded(item.id);
}
/** The colour from the drawing colours that is closest in lightness to the text around, so new text is readable. */
function colorLike(el) {
  const lum = (v) => {
    colorProbe.fillStyle = "#000";
    colorProbe.fillStyle = v;
    const s = colorProbe.fillStyle;
    const m = s.startsWith("#") ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) : (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  };
  const target = lum(cs(el).color);
  const list = artColors();
  return list.reduce((best, c) => (Math.abs(lum(resolveColor(c.value)) - target) < Math.abs(lum(resolveColor(best.value)) - target) ? c : best), list[0]).value;
}
function addModelAt(doc, x, y, model) {
  const item = newAdded(doc, x, y, { kind: "model", w: 260, model: { id: model.id, name: model.name, rx: 0, ry: 0, rz: 0 } });
  return selectAdded(item.id);
}
function addTextAt(doc, x, y) {
  const item = newAdded(doc, x, y, (anchor, r) => {
    const c = cs(anchor);
    return {
      kind: "text",
      text: "Nový text",
      w: Math.round(Math.min(560, Math.max(120, r.width * 0.9))),
      style: { font: cleanFamily(c.fontFamily.split(",")[0]), size: Math.round(clamp((parseFloat(c.fontSize) || 16) * 1.5, 16, 64)), weight: 400, color: colorLike(anchor), align: "left", lineHeight: 1.2 },
    };
  });
  S.focusAdded = item.id;
  return selectAdded(item.id);
}
function updateAdded(id, patch, label, opts = {}) {
  commit(label, (ed) => {
    const a = (ed.added || []).find((x) => x.id === id);
    if (a) Object.assign(a, clone(patch));
  }, opts);
}
/** Desktop is the base. Tablet and mobile keep their own copy of a 3D model. */
function resolvedAdded(a, device) {
  if (!a || !device || device === "desktop") return a;
  const over = (a.view || {})[device];
  if (!over) return a;
  return Object.assign({}, a, {
    x: over.x !== undefined ? over.x : a.x,
    y: over.y !== undefined ? over.y : a.y,
    w: over.w !== undefined ? over.w : a.w,
    model: over.model ? Object.assign({}, a.model, over.model) : a.model,
    stops: over.stops !== undefined ? over.stops : a.stops,
    activeStop: over.activeStop !== undefined ? over.activeStop : a.activeStop,
    removed: !!over.removed,
  });
}
function writeAdded(id, patch, label, opts = {}) {
  const device = opts.device || curDevice();
  if (device === "desktop") return updateAdded(id, patch, label, opts);
  commit(label, (ed) => {
    const a = (ed.added || []).find((x) => x.id === id);
    if (!a) return;
    const view = Object.assign({}, a.view);
    const prev = Object.assign({}, view[device]);
    const next = Object.assign({}, prev);
    if (patch.model) next.model = Object.assign({}, a.model, prev.model, patch.model);
    if (patch.stops !== undefined) next.stops = clone(patch.stops);
    if (patch.x !== undefined) next.x = patch.x;
    if (patch.y !== undefined) next.y = patch.y;
    if (patch.w !== undefined) next.w = patch.w;
    if (patch.removed !== undefined) next.removed = !!patch.removed;
    if (patch.activeStop !== undefined) next.activeStop = patch.activeStop;
    view[device] = next;
    a.view = view;
  }, opts);
}
function removeAdded(id) {
  const a = addedById(id);
  if (!a) return;
  const { key } = addedKey(a);
  if (S.sel === key) S.sel = null;
  commit(a.kind === "text" ? "Smazat text" : "Smazat prvek", (ed) => {
    ed.added = (ed.added || []).filter((x) => x.id !== id);
    delete ed.elements[key];
  });
}
/** Desktop removes the element. Tablet and mobile only hide it on that device; the desktop version stays. */
function deleteElement(key, device = curDevice()) {
  const added = addedOfKey(key);
  if (added) {
    if (device !== "desktop") {
      const what = added.kind === "text" ? "Text" : added.kind === "model" ? "3D model" : "Prvek";
      writeAdded(added.id, { removed: true }, `Skrýt ${DEVICE_IN[device]}`, { device });
      S.notice = { text: `${what} je skrytý ${DEVICE_IN[device]}. Na počítači zůstává.`, kind: "ok" };
      return;
    }
    removeAdded(added.id);
    S.notice = { text: "Smazáno. Vrátíš to Ctrl+Z.", kind: "ok" };
    return;
  }
  setProps(key, { removed: true }, { label: device === "desktop" ? "Smazat prvek" : `Skrýt ${DEVICE_IN[device]}`, device });
  S.notice = { text: device === "desktop" ? "Prvek je smazaný. Vrátíš ho tlačítkem Obnovit prvek, v Seznamu nebo Ctrl+Z." : `Prvek je skrytý ${DEVICE_IN[device]}. Na počítači zůstává.`, kind: "ok" };
}
function duplicateAdded(id) {
  const a = addedById(id);
  if (!a) return;
  const copy = Object.assign(clone(a), { id: uid("a"), x: round(num(a.x) + 4, 2), y: round(num(a.y) + 4, 2), created: now() });
  const from = addedKey(a);
  const to = addedKey(copy);
  // The copy keeps the original's moves and animations, so its catalog entry has to exist before the commit.
  store.catalog[to.key] = store.catalog[to.key] || { key: to.key, selector: to.selector, shared: to.shared, pages: [to.shared ? curPage() : copy.page], label: addedLabel(copy), p: store.meta.nextP++ };
  commit("Duplikovat prvek", (ed) => {
    ed.added = (ed.added || []).concat([copy]);
    if (ed.elements[from.key]) ed.elements[to.key] = clone(ed.elements[from.key]);
  });
  selectAdded(copy.id);
}

// ---- 05-media.js ----
/* ---------- media library ----------
 * Images live in IndexedDB (original + processed WebP); the draft only keeps their ids, so undo stays light and the
 * original is always there for a new crop. */

const media = (() => {
  const DB = "creatool-media:" + location.host;
  const STORE = "files";
  const LIMITS = { hero: 1920, gallery: 1600, thumb: 600 };
  const LIMIT_NAME = { hero: "Hlavní obrázek (1920 px)", gallery: "Galerie (1600 px)", thumb: "Náhled (600 px)" };
  const urls = new Map();
  const metas = new Map();
  const loading = new Set();
  let dbp = null;
  function db() {
    if (!dbp)
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    return dbp;
  }
  async function run(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const get = (id) => run("readonly", (s) => s.get(id));
  const put = (rec) => run("readwrite", (s) => s.put(rec));
  const del = (id) => run("readwrite", (s) => s.delete(id));
  const all = () => run("readonly", (s) => s.getAll());
  const metaOf = (rec) => ({ id: rec.id, name: rec.name, width: rec.width, height: rec.height, bytes: rec.webp ? rec.webp.size : 0, originalBytes: rec.original ? rec.original.size : 0, category: rec.category, crop: rec.crop, created: rec.created });

  async function processBlob(blob, opts = {}) {
    const bmp = await createImageBitmap(blob);
    const c = opts.crop || { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.round(clamp(c.x, 0, 1) * bmp.width);
    const sy = Math.round(clamp(c.y, 0, 1) * bmp.height);
    const sw = Math.max(1, Math.round(clamp(c.w, 0.01, 1) * bmp.width));
    const sh = Math.max(1, Math.round(clamp(c.h, 0.01, 1) * bmp.height));
    const maxW = LIMITS[opts.category] || LIMITS.gallery;
    const scale = Math.min(1, maxW / sw);
    const w = Math.max(1, Math.round(sw * scale));
    const hgt = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = hgt;
    canvas.getContext("2d").drawImage(bmp, sx, sy, sw, sh, 0, 0, w, hgt);
    if (bmp.close) bmp.close();
    const webp = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", opts.quality || 0.82));
    return { webp: webp && webp.type === "image/webp" ? webp : await new Promise((resolve) => canvas.toBlob(resolve, "image/png")), width: w, height: hgt };
  }
  function remember(rec) {
    if (urls.has(rec.id)) URL.revokeObjectURL(urls.get(rec.id));
    urls.set(rec.id, URL.createObjectURL(rec.webp));
    metas.set(rec.id, metaOf(rec));
  }
  async function add(file, opts = {}) {
    if (!file || !/^image\//.test(file.type)) throw new Error("Tohle není obrázek.");
    if (file.size > 40 * 1024 * 1024) throw new Error("Obrázek je větší než 40 MB.");
    const category = opts.category || "gallery";
    const out = await processBlob(file, { category, crop: opts.crop });
    const rec = { id: uid("img"), name: (file.name || "obrazek").replace(/\.[a-z0-9]+$/i, ""), original: file, webp: out.webp, width: out.width, height: out.height, category, crop: opts.crop || null, created: now() };
    await put(rec);
    remember(rec);
    return metaOf(rec);
  }
  async function recrop(id, crop, category) {
    const rec = await get(id);
    if (!rec) return null;
    const out = await processBlob(rec.original, { category: category || rec.category, crop });
    Object.assign(rec, { webp: out.webp, width: out.width, height: out.height, crop, category: category || rec.category });
    await put(rec);
    remember(rec);
    engine.changed();
    return metaOf(rec);
  }
  function urlFor(id) {
    if (urls.has(id)) return urls.get(id);
    if (!loading.has(id)) {
      loading.add(id);
      get(id).then((rec) => {
        if (rec) {
          remember(rec);
          engine.changed();
        }
      }).catch(() => {});
    }
    return null;
  }
  async function originalUrl(id) {
    const rec = await get(id);
    return rec ? URL.createObjectURL(rec.original) : null;
  }
  async function list() {
    const recs = await all();
    recs.forEach((r) => metas.set(r.id, metaOf(r)));
    return recs.map(metaOf).sort((a, b) => (a.created < b.created ? 1 : -1));
  }
  async function remove(id) {
    await del(id);
    if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
    urls.delete(id);
    metas.delete(id);
  }
  async function dataUrl(id) {
    const rec = await get(id);
    if (!rec) return null;
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(rec.webp);
    });
  }
  /** Where an image is used: elements (and pages) whose data mention it. */
  function usage(id, edits = store.edits) {
    const out = [];
    for (const [key, e] of Object.entries(edits.elements)) {
      const text = JSON.stringify(e);
      if (text.includes(`"${id}"`) || text.includes(`media:${id}`)) {
        const entry = store.catalog[key];
        out.push({ key, label: entry ? entry.label : key, pages: entry ? entry.pages : [] });
      }
    }
    return out;
  }
  return { add, recrop, urlFor, originalUrl, list, remove, dataUrl, usage, meta: (id) => metas.get(id), LIMITS, LIMIT_NAME };
})();


// ---- 05-models.js ----
/* ---------- 3D models: GLB files uploaded as ordinary elements ----------
 * The file lives in IndexedDB. The draft only stores its id and the rotation, so undo stays light.
 * The export carries the GLB itself, so a coding agent can put the file back on the site. */

const models = (() => {
  const DB = "creatool-models:" + location.host;
  const STORE = "files";
  const urls = new Map();
  const metas = new Map();
  const parsed = new Map();
  const views = new Set();
  let dbp = null;
  let items = [];
  let loopOn = false;

  function db() {
    if (!dbp)
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    return dbp;
  }
  function run(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  const get = (id) => run("readonly", (s) => s.get(id));
  const put = (rec) => run("readwrite", (s) => s.put(rec));
  const all = () => run("readonly", (s) => s.getAll());
  const metaOf = (rec) => ({ id: rec.id, name: rec.name, bytes: rec.blob ? rec.blob.size : 0, created: rec.created });

  function mat4() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function rotX(a) {
    const c = Math.cos(a), s = Math.sin(a), o = mat4();
    o[5] = c; o[6] = s; o[9] = -s; o[10] = c;
    return o;
  }
  function rotY(a) {
    const c = Math.cos(a), s = Math.sin(a), o = mat4();
    o[0] = c; o[2] = -s; o[8] = s; o[10] = c;
    return o;
  }
  function rotZ(a) {
    const c = Math.cos(a), s = Math.sin(a), o = mat4();
    o[0] = c; o[1] = s; o[4] = -s; o[5] = c;
    return o;
  }
  function translate(x, y, z) {
    const o = mat4();
    o[12] = x; o[13] = y; o[14] = z;
    return o;
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    const o = new Float32Array(16);
    o[0] = f / Math.max(0.05, aspect);
    o[5] = f;
    o[10] = (far + near) * nf;
    o[11] = -1;
    o[14] = 2 * far * near * nf;
    return o;
  }
  function nodeMatrix(node) {
    if (node.matrix && node.matrix.length === 16) return new Float32Array(node.matrix);
    const t = node.translation || [0, 0, 0];
    const q = node.rotation || [0, 0, 0, 1];
    const s = node.scale || [1, 1, 1];
    const [x, y, z, w] = q;
    const m = mat4();
    m[0] = (1 - 2 * (y * y + z * z)) * s[0];
    m[1] = (2 * (x * y + z * w)) * s[0];
    m[2] = (2 * (x * z - y * w)) * s[0];
    m[4] = (2 * (x * y - z * w)) * s[1];
    m[5] = (1 - 2 * (x * x + z * z)) * s[1];
    m[6] = (2 * (y * z + x * w)) * s[1];
    m[8] = (2 * (x * z + y * w)) * s[2];
    m[9] = (2 * (y * z - x * w)) * s[2];
    m[10] = (1 - 2 * (x * x + y * y)) * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
    return m;
  }
  function applyMat(pos, m) {
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    return out;
  }
  function readFloats(json, bin, index) {
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type] || 1;
    const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const src = new Uint8Array(bin, start, acc.count * comps * 4);
    const copy = new Uint8Array(src.byteLength);
    copy.set(src);
    return new Float32Array(copy.buffer);
  }
  function readIndices(json, bin, index) {
    if (index == null) return null;
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const width = acc.componentType === 5125 ? 4 : acc.componentType === 5123 ? 2 : 1;
    const src = new Uint8Array(bin, start, acc.count * width);
    const copy = new Uint8Array(src.byteLength);
    copy.set(src);
    if (acc.componentType === 5125) return new Uint32Array(copy.buffer);
    if (acc.componentType === 5123) return new Uint16Array(copy.buffer);
    return new Uint8Array(copy.buffer);
  }
  function parseGlb(buffer) {
    const dv = new DataView(buffer);
    if (buffer.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error("Soubor není GLB. Exportuj model jako .glb.");
    let off = 12;
    let json = null;
    let bin = null;
    while (off + 8 <= buffer.byteLength) {
      const len = dv.getUint32(off, true);
      const type = dv.getUint32(off + 4, true);
      const start = off + 8;
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
      else if (type === 0x004e4942) bin = buffer.slice(start, start + len);
      off = start + len;
    }
    if (!json || !bin) throw new Error("V GLB chybí geometrie.");
    const scene = (json.scenes || [])[json.scene || 0] || { nodes: [] };
    const parts = [];
    const walk = (index, parent) => {
      const node = (json.nodes || [])[index];
      if (!node) return;
      const world = parent ? mul(parent, nodeMatrix(node)) : nodeMatrix(node);
      if (node.mesh != null) {
        const mesh = json.meshes[node.mesh];
        for (const prim of mesh.primitives || []) {
          if (prim.mode != null && prim.mode !== 4) continue;
          if (prim.attributes == null || prim.attributes.POSITION == null) continue;
          let positions = applyMat(readFloats(json, bin, prim.attributes.POSITION), world);
          let normals = prim.attributes.NORMAL != null ? applyMat(readFloats(json, bin, prim.attributes.NORMAL), world) : null;
          const indices = readIndices(json, bin, prim.indices);
          const mat = (json.materials || [])[prim.material] || {};
          const factor = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor;
          const color = factor && factor.length >= 3 ? factor.slice(0, 3) : [0.93, 0.9, 0.84];
          parts.push({ positions, normals, indices, color, count: positions.length / 3 });
        }
      }
      for (const child of node.children || []) walk(child, world);
    };
    for (const n of scene.nodes || []) walk(n, null);
    if (!parts.length) throw new Error("V modelu není žádná trojúhelníková síť.");
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const part of parts) {
      const p = part.positions;
      for (let i = 0; i < p.length; i += 3) {
        min[0] = Math.min(min[0], p[i]); max[0] = Math.max(max[0], p[i]);
        min[1] = Math.min(min[1], p[i + 1]); max[1] = Math.max(max[1], p[i + 1]);
        min[2] = Math.min(min[2], p[i + 2]); max[2] = Math.max(max[2], p[i + 2]);
      }
    }
    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const radius = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.001) / 2;
    for (const part of parts) {
      const p = part.positions;
      for (let i = 0; i < p.length; i += 3) { p[i] -= center[0]; p[i + 1] -= center[1]; p[i + 2] -= center[2]; }
      if (!part.normals) {
        part.normals = new Float32Array(p.length);
        const add = (i, nx, ny, nz) => { part.normals[i] += nx; part.normals[i + 1] += ny; part.normals[i + 2] += nz; };
        const tri = (a, b, c) => {
          const ax = p[b] - p[a], ay = p[b + 1] - p[a + 1], az = p[b + 2] - p[a + 2];
          const bx = p[c] - p[a], by = p[c + 1] - p[a + 1], bz = p[c + 2] - p[a + 2];
          add(a, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
        };
        if (part.indices) {
          const ix = part.indices;
          for (let i = 0; i < ix.length; i += 3) tri(ix[i] * 3, ix[i + 1] * 3, ix[i + 2] * 3);
        } else {
          for (let i = 0; i < p.length; i += 9) tri(i, i + 3, i + 6);
        }
      }
    }
    return { parts, radius };
  }

  const VERT = "attribute vec3 aPos;attribute vec3 aNrm;uniform mat4 uMvp;uniform mat4 uModel;varying vec3 vN;void main(){vN=mat3(uModel)*aNrm;gl_Position=uMvp*vec4(aPos,1.0);}";
  const FRAG = "precision mediump float;varying vec3 vN;uniform vec3 uColor;void main(){vec3 n=normalize(vN);float l=0.38+0.62*abs(dot(n,normalize(vec3(0.35,0.85,0.45))));gl_FragColor=vec4(uColor*l,1.0);}";
  function shader(gl, type, text) {
    const s = gl.createShader(type);
    gl.shaderSource(s, text);
    gl.compileShader(s);
    return s;
  }
  function program(gl) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.bindAttribLocation(p, 1, "aNrm");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn(gl.getProgramInfoLog(p));
    return p;
  }
  function upload(gl, geo) {
    const gpu = [];
    for (const part of geo.parts) {
      const pos = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pos);
      gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW);
      const nrm = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
      gl.bufferData(gl.ARRAY_BUFFER, part.normals, gl.STATIC_DRAW);
      let idx = null;
      if (part.indices) {
        idx = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW);
      }
      gpu.push({ pos, nrm, idx, color: part.color, count: part.indices ? part.indices.length : part.count, type: part.indices ? (part.indices instanceof Uint32Array ? gl.UNSIGNED_INT : part.indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE) : 0 });
    }
    return gpu;
  }
  async function geometry(id) {
    if (parsed.has(id)) return parsed.get(id);
    const rec = await get(id);
    if (!rec || !rec.blob) return null;
    const geo = parseGlb(await rec.blob.arrayBuffer());
    parsed.set(id, geo);
    return geo;
  }
  function ensureLoop() {
    if (loopOn) return;
    loopOn = true;
    const frame = () => {
      for (const view of views) draw(view);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function draw(view) {
    const canvas = view.canvas;
    if (!canvas.isConnected) { views.delete(view); return; }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 2 || h < 2 || !view.gpu) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    const gl = view.gl;
    const spin = spinOf(view);
    const model = mul(mul(rotZ(num(spin.rz)), rotY(num(spin.ry))), rotX(num(spin.rx)));
    const dist = Math.max(view.radius, 0.2) * 2.8;
    const proj = perspective(0.7, w / h, dist / 50, dist * 20);
    const mvp = mul(proj, mul(translate(0, 0, -dist), model));
    gl.viewport(0, 0, bw, bh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(view.prog);
    gl.uniformMatrix4fv(view.uMvp, false, mvp);
    gl.uniformMatrix4fv(view.uModel, false, model);
    for (const part of view.gpu) {
      gl.bindBuffer(gl.ARRAY_BUFFER, part.pos);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.nrm);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(view.uColor, part.color);
      if (part.idx) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.idx);
        gl.drawElements(gl.TRIANGLES, part.count, part.type, 0);
      } else gl.drawArrays(gl.TRIANGLES, 0, part.count);
    }
  }
  function mount(canvas, addedId, stopId) {
    let view = [...views].find((v) => v.canvas === canvas);
    const item = addedById(addedId);
    const id = item && item.model && item.model.id;
    if (!id) return;
    if (view && view.modelId === id) { view.addedId = addedId; view.stopId = stopId || ""; return; }
    if (view) views.delete(view);
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return;
    gl.getExtension("OES_element_index_uint");
    gl.enable(gl.DEPTH_TEST);
    const prog = program(gl);
    view = { canvas, gl, prog, addedId, stopId: stopId || "", modelId: id, uMvp: gl.getUniformLocation(prog, "uMvp"), uModel: gl.getUniformLocation(prog, "uModel"), uColor: gl.getUniformLocation(prog, "uColor"), radius: 1, gpu: null };
    views.add(view);
    ensureLoop();
    geometry(id).then((geo) => {
      if (!geo || !canvas.isConnected) return;
      view.radius = geo.radius;
      view.gpu = upload(gl, geo);
    }).catch(() => {});
  }
  function liveOf(addedId) {
    return resolvedAdded(addedById(addedId), curDevice());
  }
  function gateOf(s) {
    return s && typeof s.gate === "number" ? s.gate : null;
  }
  function copyStop(s, patch) {
    return Object.assign({
      id: s.implicit ? uid("st") : s.id,
      rx: num(s.rx), ry: num(s.ry), rz: num(s.rz),
      x: num(s.x), y: num(s.y), s: num(s.s, 1),
      gate: gateOf(s),
    }, patch || {});
  }
  function listStops(live) {
    if (!live) return [];
    if (Array.isArray(live.stops) && live.stops.length) return live.stops.map((s) => ({ id: s.id, rx: num(s.rx), ry: num(s.ry), rz: num(s.rz), x: num(s.x, live.x), y: num(s.y, live.y), s: num(s.s, 1), gate: gateOf(s) }));
    const m = live.model || {};
    return [{ id: "base", rx: num(m.rx), ry: num(m.ry), rz: num(m.rz), x: num(live.x), y: num(live.y), s: 1, implicit: true }];
  }
  function spinOf(view) {
    const item = addedById(view.addedId);
    if (!item) return {};
    const win = view.canvas.ownerDocument.defaultView || window;
    const live = resolvedAdded(item, deviceOfWin(win));
    if (view.stopId && Array.isArray(live.stops)) {
      const stop = live.stops.find((s) => s.id === view.stopId);
      if (stop) return stop;
    }
    if (!view.stopId && Array.isArray(live.stops) && live.stops.length > 1 && (isChild || S.hidden || view.canvas.ownerDocument !== document)) return blend(item, win);
    return live.model || {};
  }
  const autoFlights = new Map();
  function motionChoice() {
    const picked = document.documentElement.dataset.ctMotion;
    if (picked === "scroll" || picked === "auto") return picked;
    try {
      const saved = localStorage.getItem(KEY + ":motion");
      if (saved === "scroll" || saved === "auto") return saved;
    } catch {}
    return "auto";
  }
  function autoAmount(id, from, to) {
    const key = `${from.id}>${to.id}`;
    const now = performance.now();
    let flight = autoFlights.get(id);
    if (!flight || flight.key !== key) {
      flight = { key, start: now, duration: flight ? 520 : 1650 };
      autoFlights.set(id, flight);
    }
    const u = clamp((now - flight.start) / flight.duration, 0, 1);
    return u * u * u * (u * (u * 6 - 15) + 10);
  }
  addEventListener("creatool:motion", () => autoFlights.clear());
  function blend(a, win) {
    const live = resolvedAdded(a, deviceOfWin(win));
    const raw = listStops(live).filter((s) => !s.implicit);
    if (raw.length < 2) {
      const m = (live && live.model) || {};
      return { rx: num(m.rx), ry: num(m.ry), rz: num(m.rz), x: num(live && live.x), y: num(live && live.y), s: num(raw[0] && raw[0].s, 1) };
    }
    const anchor = query(win.document, a.anchor);
    const rect = anchor && anchor.getBoundingClientRect();
    if (!rect) return Object.assign({ s: num(raw[0].s, 1) }, raw[0]);
    const mid = win.innerHeight * 0.5;
    const stops = raw.map((s) => Object.assign({}, s, {
      _y: rect.top + (num(s.y) / 100) * rect.height,
      _x: rect.left + (num(s.x) / 100) * rect.width,
    })).sort((p, q) => p._y - q._y || p._x - q._x);
    const doc = win.document;
    const pageH = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1);
    const maxScroll = Math.max(0, pageH - win.innerHeight);
    const scroll = Math.max(0, Math.min(maxScroll, win.scrollY || doc.documentElement.scrollTop || 0));
    const mode = motionChoice();
    let i = 0;
    let holding = false;
    for (let n = 0; n < stops.length - 1; n++) {
      if (typeof stops[n].gate !== "number") {
        if (stops[n + 1]._y <= mid) { i = n + 1; continue; }
        i = n;
        break;
      }
      const gateY = clamp(stops[n].gate * pageH, 0, maxScroll);
      if (scroll < gateY) { i = n; holding = true; break; }
      if (mode === "scroll") {
        const nextGate = typeof stops[n + 1].gate === "number" ? clamp(stops[n + 1].gate * pageH, 0, maxScroll) : null;
        const natural = (stops[n + 1]._y + scroll) - mid;
        const end = nextGate != null && nextGate > gateY + 24
          ? nextGate
          : Math.max(gateY + win.innerHeight * 0.62, Math.min(maxScroll, Math.max(gateY + 48, natural)));
        if (scroll < end) { i = n; break; }
      }
      i = n + 1;
    }
    const A = stops[i];
    const B = stops[Math.min(i + 1, stops.length - 1)];
    const span = (B._y - A._y) || 1;
    const along = clamp((mid - A._y) / span, 0, 1);
    const ease = (u) => { const t = clamp(u, 0, 1); return t * t * (3 - 2 * t); };
    let t = holding || A === B ? 0 : ease(along);
    if (holding) autoFlights.delete(a.id);
    else if (typeof A.gate === "number" && A !== B) {
      if (mode === "scroll") {
        const gateY = clamp(A.gate * pageH, 0, maxScroll);
        const nextGate = typeof B.gate === "number" ? clamp(B.gate * pageH, 0, maxScroll) : null;
        const natural = (B._y + scroll) - mid;
        const end = nextGate != null && nextGate > gateY + 24
          ? nextGate
          : Math.max(gateY + win.innerHeight * 0.62, Math.min(maxScroll, Math.max(gateY + 48, natural)));
        t = ease((scroll - gateY) / Math.max(1, end - gateY));
      } else t = autoAmount(a.id, A, B);
    }
    const ang = (p, q) => {
      let d = q - p;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return p + d * t;
    };
    return {
      rx: ang(num(A.rx), num(B.rx)), ry: ang(num(A.ry), num(B.ry)), rz: ang(num(A.rz), num(B.rz)),
      x: num(A.x) + (num(B.x) - num(A.x)) * t, y: num(A.y) + (num(B.y) - num(A.y)) * t,
      s: num(A.s, 1) + (num(B.s, 1) - num(A.s, 1)) * t,
    };
  }
  function patchStops(addedId, stops, extra, label) {
    const live = liveOf(addedId);
    const first = stops[0] || {};
    writeAdded(addedId, Object.assign({
      stops: stops.length > 1 ? stops : null,
      activeStop: stops.length > 1 ? (extra && extra.activeStop) || first.id : null,
      x: first.x, y: first.y,
      model: Object.assign({}, live.model, { rx: first.rx, ry: first.ry, rz: first.rz }),
    }, extra || {}), label, { group: true });
  }
  function addStop(addedId) {
    const live = liveOf(addedId);
    if (!live) return;
    const stops = listStops(live).map((s) => copyStop(s));
    const active = stops.findIndex((s) => s.id === live.activeStop);
    const i = active >= 0 ? active : stops.length - 1;
    const cur = stops[i];
    const next = stops[i + 1];
    const neu = copyStop(cur, {
      id: uid("st"),
      x: next ? round((num(cur.x) + num(next.x)) / 2, 2) : cur.x,
      y: next ? round((num(cur.y) + num(next.y)) / 2, 2) : round(clamp(num(cur.y) + 14, 0, 100), 2),
      gate: null,
    });
    stops.splice(i + 1, 0, neu);
    patchStops(addedId, stops, { activeStop: neu.id }, "Přidat pozici");
    ui.renderPanel();
  }
  function removeStop(addedId) {
    const live = liveOf(addedId);
    const stops = listStops(live);
    if (stops.length < 2 || stops[0].implicit) return;
    const found = stops.findIndex((s) => s.id === live.activeStop);
    const i = found >= 0 ? found : stops.length - 1;
    const next = stops.filter((_, n) => n !== i).map((s) => copyStop(s));
    const keep = next[Math.max(0, i - 1)] || next[0];
    patchStops(addedId, next, { activeStop: keep && next.length > 1 ? keep.id : null }, "Odebrat pozici");
    ui.renderPanel();
  }
  function selectStop(addedId, stopId) {
    writeAdded(addedId, { activeStop: stopId }, "Pozice", { group: true });
    ui.renderPanel();
  }
  function beginMoveStop(addedId, stopId, event) {
    const item = addedById(addedId);
    if (!item) return;
    const anchor = query(document, item.anchor);
    const rect = anchor ? anchor.getBoundingClientRect() : { width: 1, height: 1 };
    const live = liveOf(addedId);
    const stop = listStops(live).find((s) => s.id === stopId) || listStops(live)[0];
    const start = { x: event.clientX, y: event.clientY, sx: num(stop.x), sy: num(stop.y) };
    const move = (ev) => {
      const cur = listStops(liveOf(addedId)).map((s) => copyStop(s));
      const hit = cur.find((s) => s.id === stopId) || cur[0];
      if (!hit) return;
      hit.x = round(clamp(start.sx + ((ev.clientX - start.x) / Math.max(1, rect.width)) * 100, -20, 120), 2);
      hit.y = round(clamp(start.sy + ((ev.clientY - start.y) / Math.max(1, rect.height)) * 100, -20, 120), 2);
      patchStops(addedId, cur, { activeStop: hit.id }, "Posun pozice");
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
  function beginOrbit(addedId, event, stopId) {
    const live = liveOf(addedId);
    if (!live || !live.model) return;
    const stops = listStops(live);
    const stop = stopId ? stops.find((s) => s.id === stopId) : null;
    const base = stop || live.model;
    const start = { x: event.clientX, y: event.clientY, rx: num(base.rx), ry: num(base.ry), rz: num(base.rz), shift: event.shiftKey };
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const rx = ev.shiftKey || start.shift ? start.rx : start.rx + dy * 0.01;
      const ry = ev.shiftKey || start.shift ? start.ry : start.ry + dx * 0.01;
      const rz = ev.shiftKey || start.shift ? start.rz + dx * 0.01 : start.rz;
      if (stopId && Array.isArray(liveOf(addedId).stops)) {
        const cur = listStops(liveOf(addedId)).map((s) => copyStop(s, s.id === stopId ? { rx, ry, rz } : null));
        patchStops(addedId, cur, { activeStop: stopId }, "3D otočení");
      } else {
        writeAdded(addedId, { model: Object.assign({}, liveOf(addedId).model, { rx, ry, rz }) }, "3D otočení", { group: true });
      }
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
  function beginScale(addedId, stopId, event) {
    const live = liveOf(addedId);
    if (!live) return;
    event.preventDefault();
    event.stopPropagation();
    const node = event.target.closest && event.target.closest("[data-ct-added]");
    const rect = node ? node.getBoundingClientRect() : { left: event.clientX, top: event.clientY, width: 0, height: 0 };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const origin = Math.max(24, Math.hypot(event.clientX - cx, event.clientY - cy));
    const baseW = num(live.w, 260);
    const stop = stopId && listStops(live).find((s) => s.id === stopId && !s.implicit);
    const startS = stop ? num(stop.s, 1) : 1;
    const move = (ev) => {
      const dist = Math.max(24, Math.hypot(ev.clientX - cx, ev.clientY - cy));
      const factor = dist / origin;
      if (stop) {
        const s = round(clamp(startS * factor, 0.25, 2.5), 3);
        const cur = listStops(liveOf(addedId)).map((row) => copyStop(row, row.id === stopId ? { s } : null));
        patchStops(addedId, cur, { activeStop: stopId }, "Velikost pozice");
      } else {
        writeAdded(addedId, { w: round(clamp(baseW * factor, 40, 900)) }, "Velikost 3D modelu", { group: true });
      }
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
  async function rememberAll() {
    const recs = (await all()) || [];
    items = recs.map(metaOf).sort((a, b) => (a.created < b.created ? 1 : -1));
    for (const rec of recs) metas.set(rec.id, metaOf(rec));
    return items;
  }
  async function add(file) {
    const name = file && file.name || "";
    if (!/\.glb$/i.test(name) && file.type !== "model/gltf-binary") throw new Error("Nahraj model ve formátu GLB.");
    if (file.size > 40 * 1024 * 1024) throw new Error("Model je větší než 40 MB.");
    parseGlb(await file.arrayBuffer());
    const rec = { id: uid("mdl"), name: name.replace(/\.glb$/i, "") || "model", blob: file, created: now() };
    await put(rec);
    metas.set(rec.id, metaOf(rec));
    parsed.delete(rec.id);
    await rememberAll();
    return metaOf(rec);
  }
  async function restore(list) {
    for (const item of list || []) {
      if (!item || typeof item.id !== "string" || typeof item.glb !== "string") continue;
      const blob = await (await fetch(item.glb)).blob();
      await put({ id: item.id, name: String(item.name || "model").slice(0, 120), blob, created: now() });
      parsed.delete(item.id);
    }
    await rememberAll();
  }
  async function dataUrl(id) {
    const rec = await get(id);
    if (!rec || !rec.blob) return null;
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(rec.blob);
    });
  }
  function removeLocal(id) {
    return run("readwrite", (s) => s.delete(id)).then(() => { metas.delete(id); parsed.delete(id); return rememberAll(); });
  }
  function setGate(addedId, stopId, gate) {
    const value = gate == null ? null : round(clamp(num(gate), 0, 1), 4);
    const cur = listStops(liveOf(addedId)).map((row) => copyStop(row, row.id === stopId ? { gate: value } : null));
    patchStops(addedId, cur, { activeStop: stopId }, "Odjezd pozice");
  }
  function syncGates(doc) {
    const root = doc && doc.body;
    if (!root) return;
    const win = doc.defaultView || window;
    const html = doc.documentElement;
    const modes = ["ct-mode-model", "ct-mode-element", "ct-mode-text", "ct-mode-comment"];
    const show = showModelStops(doc) && !html.classList.contains("ct-device-frame") && modes.some((name) => html.classList.contains(name));
    const wanted = new Set();
    if (show) {
      const pageH = Math.max(html.scrollHeight, doc.body.scrollHeight, 1);
      const maxScroll = Math.max(0, pageH - win.innerHeight);
      const scroll = Math.max(0, Math.min(maxScroll, win.scrollY || html.scrollTop || 0));
      for (const item of store.edits.added || []) {
        if (!item || item.kind !== "model") continue;
        const live = resolvedAdded(item, deviceOfWin(win));
        if (!live || live.removed) continue;
        const stops = listStops(live).filter((s) => !s.implicit);
        if (stops.length < 2) continue;
        const order = stops.map((s, n) => Object.assign({ n }, s)).sort((p, q) => num(p.y) - num(q.y) || num(p.x) - num(q.x) || p.n - q.n);
        order.slice(0, -1).forEach((stop, index) => {
          const key = item.id + ":" + stop.id;
          wanted.add(key);
          let line = root.querySelector(`[data-ct-gate="${CSS.escape(key)}"]`);
          if (!line) {
            line = doc.createElement("div");
            line.className = "ct-gate";
            line.dataset.ctGate = key;
            line.dataset.creatoolIgnore = "";
            const button = doc.createElement("button");
            button.type = "button";
            const drag = (event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              button.setPointerCapture(event.pointerId);
              const move = (ev) => {
                const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1);
                const limit = Math.max(0, height - win.innerHeight);
                const y = Math.max(0, Math.min(limit, ev.clientY + (win.scrollY || 0)));
                setGate(item.id, stop.id, y / height);
              };
              const up = () => {
                button.removeEventListener("pointermove", move);
                button.removeEventListener("pointerup", up);
              };
              button.addEventListener("pointermove", move);
              button.addEventListener("pointerup", up);
            };
            button.addEventListener("pointerdown", drag);
            button.addEventListener("dblclick", (event) => {
              event.preventDefault();
              event.stopPropagation();
              setGate(item.id, stop.id, null);
            });
            line.append(button);
            root.append(line);
          }
          const node = root.querySelector(`[data-ct-added="${CSS.escape(item.id)}"][data-ct-stop="${CSS.escape(stop.id)}"]`);
          const fallback = node ? node.getBoundingClientRect().bottom + (win.scrollY || 0) : scroll + win.innerHeight * 0.6;
          const docY = typeof stop.gate === "number" ? clamp(stop.gate * pageH, 0, maxScroll) : clamp(fallback, 0, maxScroll);
          line.style.top = `${docY - scroll}px`;
          line.classList.toggle("is-set", typeof stop.gate === "number");
          const button = line.querySelector("button");
          const label = `Pozice ${index + 1}`;
          button.textContent = typeof stop.gate === "number" ? `${label} · odjezd` : `${label} · zatáhni čáru odjezdu`;
          button.title = motionChoice() === "scroll"
            ? "Až tahle čára zajede za horní okraj, model se dál posouvá se scrollem. Dvojklik čáru zruší."
            : "Až tahle čára zajede za horní okraj, model sám dojede na další pozici. Dvojklik čáru zruší.";
        });
      }
    }
    for (const line of Array.from(root.querySelectorAll(".ct-gate"))) {
      if (!wanted.has(line.dataset.ctGate)) line.remove();
    }
  }
  function place(id, x, y) {
    const meta = metas.get(id);
    if (!meta) return null;
    return addModelAt(document, x, y, meta);
  }
  rememberAll().catch(() => {});
  return { add, restore, dataUrl, mount, beginOrbit, beginMoveStop, beginScale, addStop, removeStop, selectStop, setGate, syncGates, listStops, blend, place, meta: (id) => metas.get(id), listSync: () => items, refresh: rememberAll, remove: removeLocal };
})();

function modelShelf() {
  const input = h("input", { type: "file", accept: ".glb,model/gltf-binary", hidden: true });
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    try {
      const rec = await models.add(file);
      S.placing = { kind: "model", model: { id: rec.id, name: rec.name } };
      if (S.mode !== "element") ui.setMode("element");
      ui.syncModeClasses();
      S.notice = { text: "Model „" + rec.name + "“ je v knihovně. Klikni na stránku, kam ho přidat.", kind: "ok" };
      ui.renderPanel();
    } catch (err) {
      ui.flashNotice(err.message || "Model se nepodařilo nahrát.");
    }
  });
  const tiles = models.listSync().map((rec) => h("button", {
    type: "button",
    class: "model-tile",
    title: rec.name,
    "aria-pressed": String(!!S.placing && S.placing.kind === "model" && S.placing.model && S.placing.model.id === rec.id),
    onClick: () => {
      S.placing = { kind: "model", model: { id: rec.id, name: rec.name } };
      if (S.mode !== "element") ui.setMode("element");
      ui.syncModeClasses();
      ui.renderPanel();
    },
  }, h("b", {}, "3D"), h("small", {}, rec.name)));
  return h("div", { class: "model-shelf" },
    h("h3", {}, "3D modely"),
    h("p", { class: "help" }, "Nahraj soubor GLB. Bere se jako prvek: klikneš na stránku a přidá se. Tažením za model ho plně otáčíš ve 3D, Shift otáčí kolem osy, lišta ho posouvá a úchyty mění velikost. V exportu model jede s sebou."),
    h("div", { class: "row" }, h("button", { type: "button", onClick: () => input.click() }, "Nahrát GLB"), input),
    tiles.length ? h("div", { class: "lib" }, ...tiles) : h("p", { class: "meta" }, "Zatím žádný 3D model. Přetáhni GLB na stránku, nebo ho nahraj tady."),
  );
}

// ---- 05-sitepack.js ----
/* ---------- site pack: fonts and colours taken from the website ----------
 * The question appears the first time the editor is actually shown, not while it
 * stays hidden on page load. A yes stores the names and downloads a zip. */

const sitePack = (() => {
  const COL_KEY = "creatool:collection";
  const askedKey = () => "creatool:pack:" + location.host;

  function readCol() {
    const v = readJSON(COL_KEY, null);
    return v && typeof v === "object" ? v : { fonts: [], colors: [] };
  }
  function fonts() {
    return (readCol().fonts || []).filter((f) => typeof f === "string" && f && !GENERIC_FONTS.has(f.toLowerCase()));
  }
  function colors() {
    return (readCol().colors || []).filter((c) => c && typeof c.name === "string" && safeColor(c.value));
  }
  function remember(fontList, colorList) {
    const cur = readCol();
    const names = new Set([...(cur.fonts || []), ...fontList]);
    const cols = [...(cur.colors || [])];
    for (const c of colorList) {
      if (!cols.some((x) => String(x.value).toLowerCase() === String(c.value).toLowerCase())) cols.push(c);
    }
    try { localStorage.setItem(COL_KEY, JSON.stringify({ fonts: [...names], colors: cols })); } catch {}
  }

  function fontFaces() {
    const out = [];
    const seen = new Set();
    for (const sheet of [...document.styleSheets]) {
      let rules;
      try { rules = [...sheet.cssRules]; } catch { continue; }
      for (const rule of rules) {
        if (!rule.style || rule.type !== CSSRule.FONT_FACE_RULE) continue;
        const family = cleanFamily(rule.style.getPropertyValue("font-family").split(",")[0] || "");
        const src = rule.style.getPropertyValue("src") || "";
        const weight = (rule.style.getPropertyValue("font-weight") || "400").trim();
        const style = (rule.style.getPropertyValue("font-style") || "normal").trim();
        for (const match of src.matchAll(/url\((['"]?)(.*?)\1\)/g)) {
          if (!match[2] || match[2].startsWith("data:")) continue;
          let href = match[2];
          try { href = new URL(href, sheet.href || location.href).href; } catch { continue; }
          if (!/^https?:/.test(href) || seen.has(href)) continue;
          seen.add(href);
          const ext = ((href.match(/\.([a-z0-9]+)(?:$|\?)/i) || [])[1] || "woff2").toLowerCase();
          out.push({ family, weight, style, href, ext });
        }
      }
    }
    return out;
  }
  function fontNames() {
    const set = new Set(fonts());
    try { document.fonts.forEach((f) => set.add(cleanFamily(f.family))); } catch {}
    for (const face of fontFaces()) if (face.family) set.add(face.family);
    const els = document.body.getElementsByTagName("*");
    for (let i = 0; i < els.length && i < 800; i++) {
      if (isIgnored(els[i])) continue;
      set.add(cleanFamily(getComputedStyle(els[i]).fontFamily.split(",")[0]));
    }
    return [...set].filter((f) => f && !GENERIC_FONTS.has(f.toLowerCase()) && !/fallback/i.test(f)).sort((a, b) => a.localeCompare(b, "cs"));
  }
  function siteColors() {
    const found = [];
    const push = (name, value) => {
      const rgb = cssRgb(value);
      if (!rgb) return;
      const hex = colorHex(rgb);
      if (hex === "#000000" || hex === "#ffffff") return;
      if (found.some((c) => c.value.toLowerCase() === hex.toLowerCase())) return;
      const label = String(name || hex).replace(/^--/, "").replace(/[-_]/g, " ").slice(0, 24);
      found.push({ name: label.charAt(0).toUpperCase() + label.slice(1), value: hex });
    };
    for (const [name, token] of Object.entries(siteTokens)) if (token && token.type === "color") push(name, token.value);
    try {
      push("Pozadí", getComputedStyle(document.body).backgroundColor);
      push("Text", getComputedStyle(document.body).color);
    } catch {}
    const button = document.querySelector("a.button, button.button, .button, .btn");
    if (button) push("Tlačítko", getComputedStyle(button).backgroundColor);
    return found.slice(0, 12);
  }

  function crc32(data) {
    let c = ~0;
    for (let i = 0; i < data.length; i++) {
      c ^= data[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  }
  function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
      const name = enc.encode(file.name);
      const crc = crc32(file.data);
      const local = new Uint8Array(30 + name.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, file.data.length, true);
      view.setUint32(22, file.data.length, true);
      view.setUint16(26, name.length, true);
      local.set(name, 30);
      parts.push(local, file.data);
      const cen = new Uint8Array(46 + name.length);
      const cd = new DataView(cen.buffer);
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, file.data.length, true);
      cd.setUint32(24, file.data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      cen.set(name, 46);
      central.push(cen);
      offset += local.length + file.data.length;
    }
    let cenSize = 0;
    for (const part of central) cenSize += part.length;
    const end = new Uint8Array(22);
    const ed = new DataView(end.buffer);
    ed.setUint32(0, 0x06054b50, true);
    ed.setUint16(8, files.length, true);
    ed.setUint16(10, files.length, true);
    ed.setUint32(12, cenSize, true);
    ed.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }
  function slug(value) {
    return String(value || "font").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "font";
  }
  async function save() {
    const names = fontNames();
    const cols = siteColors();
    remember(names, cols);
    const enc = new TextEncoder();
    const files = [{ name: "barvy.json", data: enc.encode(JSON.stringify(cols, null, 2)) }];
    const lines = ["Písma použitá na webu", location.host, ""];
    for (const face of fontFaces()) {
      lines.push(`${face.family} ${face.weight} ${face.style} ${face.href}`);
      try {
        const res = await fetch(face.href);
        if (!res.ok) continue;
        const data = new Uint8Array(await res.arrayBuffer());
        if (!data.length || data.length > 8 * 1024 * 1024) continue;
        const italic = /italic|oblique/i.test(face.style) ? "-italic" : "";
        files.push({ name: `moje-fonty/${slug(face.family)}-${slug(face.weight)}${italic}.${face.ext}`, data });
      } catch {}
    }
    for (const name of names) if (!lines.some((line) => line.startsWith(name + " "))) lines.push(name + " (písmo bez souboru, třeba systémové)");
    files.push({ name: "moje-fonty/POUZITE-FONTY.txt", data: enc.encode(lines.join("\n")) });
    const blob = zipStore(files);
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `creatool-kolekce-${location.hostname || "web"}.zip`;
    a.setAttribute("data-creatool-ignore", "");
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { fonts: names.length, colors: cols.length };
  }

  const savedFonts = (() => {
    const DB = "creatool-fonts";
    const STORE = "files";
    let dbp = null;
    let items = [];
    function db() {
      if (!dbp)
        dbp = new Promise((resolve, reject) => {
          const req = indexedDB.open(DB, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      return dbp;
    }
    function run(mode, fn) {
      return db().then((d) => new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }));
    }
    async function activate(rec) {
      if (!rec || !rec.blob || !rec.family) return;
      const url = URL.createObjectURL(rec.blob);
      const face = new FontFace(rec.family, `url(${url})`, { weight: rec.weight || "400", style: rec.style || "normal" });
      await face.load();
      document.fonts.add(face);
    }
    async function refresh() {
      items = ((await run("readonly", (s) => s.getAll())) || []).filter((rec) => rec && rec.family && rec.blob);
      for (const rec of items) {
        try { await activate(rec); } catch {}
      }
      remember(items.map((rec) => rec.family), []);
      return items;
    }
    async function add(file) {
      const name = file && file.name || "";
      if (!/\.(woff2|woff|ttf|otf)$/i.test(name)) throw new Error("Písmo nahraj jako WOFF2, WOFF, TTF nebo OTF.");
      if (file.size > 8 * 1024 * 1024) throw new Error("Písmo je větší než 8 MB.");
      const family = cleanFamily(name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ")) || "Písmo";
      const rec = { id: uid("fnt"), family, blob: file, weight: "400", style: "normal", created: now() };
      await run("readwrite", (s) => s.put(rec));
      await activate(rec);
      remember([family], []);
      await refresh();
      return family;
    }
    return { refresh, add, list: () => items };
  })();

  return { fonts, colors, ask, save, fontNames, siteColors, loadSavedFonts: savedFonts.refresh, uploadFont: savedFonts.add };

  function ask() {
    if (isChild || localStorage.getItem(askedKey()) || uiRoot.querySelector(".pack-ask")) return;
    const names = fontNames();
    const cols = siteColors();
    if (!names.length && !cols.length) return;
    const box = h("div", { class: "banner pack-ask" });
    box.hidden = false;
    box.style.top = "auto";
    box.style.bottom = "76px";
    const close = (answer) => {
      try { localStorage.setItem(askedKey(), answer); } catch {}
      box.remove();
    };
    box.replaceChildren(
      h("span", {}, `Tento web používá písma ${names.join(", ") || "—"}${cols.length ? ` a ${cols.length} barev` : ""}. Uložit je natrvalo do kolekce CREATOOL? ZIP se stáhne do počítače a barvy půjdou dát na text i prvky.`),
      h("button", { type: "button", onClick: async () => {
        try {
          const saved = await save();
          status = `Uloženo: ${saved.fonts} písem, ${saved.colors} barev. ZIP je stažený.`;
          ui.updateStatus();
          ui.renderPanel();
          close("yes");
        } catch (err) {
          status = "Fonty se nepodařilo uložit";
          ui.updateStatus();
          ui.flashNotice(err && err.message ? err.message : "Uložení se nepodařilo.");
        }
      } }, "Uložit do ZIPu"),
      h("button", { type: "button", onClick: () => close("no") }, "Teď ne"));
    uiRoot.append(box);
  }
  return { fonts, colors, ask, save, fontNames, siteColors };
})();

// ---- 06-snap.js ----
/* ---------- magnetic snapping and guides ----------
 * Works in the coordinates of the edited document. Targets are measured once when a drag starts. */

const SNAP_PX = 6;
const snapOff = (el) => {
  const key = el && el.getAttribute && el.getAttribute("data-ct");
  const meta = key && store.edits.elements[key];
  return !!(meta && meta.snap === false);
};
function snapTargets(el) {
  const out = [];
  const win = winOf(el);
  // A drawing added to the page lines up with the section it is pinned to, not with its layer.
  const parent = anchorOf(el) || el.parentElement;
  if (parent && parent !== el.ownerDocument.body) out.push({ el: parent, r: parent.getBoundingClientRect(), parent: true });
  let scope = parent;
  for (let i = 0; i < 2 && scope && scope.parentElement && scope.parentElement !== el.ownerDocument.body; i++) scope = scope.parentElement;
  const list = scope ? scope.querySelectorAll("*") : [];
  for (const x of list) {
    if (out.length > 300) break;
    if (x === el || el.contains(x) || x.contains(el) || isIgnored(x) || snapOff(x)) continue;
    const r = x.getBoundingClientRect();
    if (r.width < 6 || r.height < 6 || r.bottom < -300 || r.top > win.innerHeight + 300) continue;
    out.push({ el: x, r });
  }
  return out;
}
/** Nearest line for each axis. edges: which edges of the moved box may snap ("l","c","r" / "t","m","b"). */
function snapBox(box, targets, opts = {}) {
  const res = { dx: 0, dy: 0, guides: [] };
  if (opts.disabled) return res;
  const grid = store.settings.grid;
  const win = opts.win || window;
  const ex = opts.edgesX || ["l", "c", "r"];
  const ey = opts.edgesY || ["t", "m", "b"];
  const pos = { l: box.left, c: box.left + box.width / 2, r: box.left + box.width, t: box.top, m: box.top + box.height / 2, b: box.top + box.height };
  if (grid && grid.on && grid.size >= 2) {
    const size = grid.size;
    const gx = ex.includes("l") ? "l" : ex[0];
    const gy = ey.includes("t") ? "t" : ey[0];
    const absX = pos[gx] + win.scrollX;
    const absY = pos[gy] + win.scrollY;
    res.dx = Math.round(absX / size) * size - absX;
    res.dy = Math.round(absY / size) * size - absY;
    res.grid = true;
    return res;
  }
  let bx = null;
  let by = null;
  for (const t of targets) {
    const r = t.r;
    const tx = [r.left, r.left + r.width / 2, r.right];
    const ty = [r.top, r.top + r.height / 2, r.bottom];
    for (const e of ex) for (const x of tx) {
      const d = x - pos[e];
      if (Math.abs(d) <= SNAP_PX && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, x, t };
    }
    for (const e of ey) for (const y of ty) {
      const d = y - pos[e];
      if (Math.abs(d) <= SNAP_PX && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, y, t };
    }
  }
  // Equal spacing between neighbours in the same row or column.
  const row = targets.filter((t) => !t.parent && t.r.bottom > box.top && t.r.top < box.bottom);
  const left = row.filter((t) => t.r.right <= box.left + SNAP_PX).sort((a, b) => b.r.right - a.r.right)[0];
  const right = row.filter((t) => t.r.left >= box.right - SNAP_PX).sort((a, b) => a.r.left - b.r.left)[0];
  if (left && right && ex.includes("l") && ex.includes("r")) {
    const x = (left.r.right + right.r.left - box.width) / 2;
    const d = x - box.left;
    if (Math.abs(d) <= SNAP_PX && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, spacing: [left, right], gap: round(x - left.r.right, 0) };
  }
  const col = targets.filter((t) => !t.parent && t.r.right > box.left && t.r.left < box.right);
  const above = col.filter((t) => t.r.bottom <= box.top + SNAP_PX).sort((a, b) => b.r.bottom - a.r.bottom)[0];
  const below = col.filter((t) => t.r.top >= box.bottom - SNAP_PX).sort((a, b) => a.r.top - b.r.top)[0];
  if (above && below && ey.includes("t") && ey.includes("b")) {
    const y = (above.r.bottom + below.r.top - box.height) / 2;
    const d = y - box.top;
    if (Math.abs(d) <= SNAP_PX && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, spacing: [above, below], gap: round(y - above.r.bottom, 0) };
  }
  if (bx) {
    res.dx = bx.d;
    if (bx.spacing) res.guides.push({ kind: "spaceX", a: bx.spacing[0].r, b: bx.spacing[1].r, gap: bx.gap });
    else {
      const top = Math.min(box.top, bx.t.r.top);
      const bottom = Math.max(box.bottom, bx.t.r.bottom);
      const gap = box.top >= bx.t.r.bottom ? box.top - bx.t.r.bottom : bx.t.r.top >= box.bottom ? bx.t.r.top - box.bottom : 0;
      res.guides.push({ kind: "v", x: bx.x, top, bottom, label: bx.t.parent ? "rodič" : gap ? `${round(gap, 0)} px` : "" });
    }
  }
  if (by) {
    res.dy = by.d;
    if (by.spacing) res.guides.push({ kind: "spaceY", a: by.spacing[0].r, b: by.spacing[1].r, gap: by.gap });
    else {
      const l = Math.min(box.left, by.t.r.left);
      const r = Math.max(box.right, by.t.r.right);
      const gap = box.left >= by.t.r.right ? box.left - by.t.r.right : by.t.r.left >= box.right ? by.t.r.left - box.right : 0;
      res.guides.push({ kind: "h", y: by.y, left: l, right: r, label: by.t.parent ? "rodič" : gap ? `${round(gap, 0)} px` : "" });
    }
  }
  return res;
}

// ---- 07-ui-base.js ----
/* ---------- UI state and building blocks (the UI lives in a shadow root, apart from the site's styles) ---------- */

const S = {
  mode: "browse", // browse | numbers | text | element | comment
  sel: null, // selected catalog key
  hovered: null,
  hoverKind: null,
  panel: false,
  collapsed: false,
  pos: null,
  barPos: null, // {x, y} of the toolbar; null keeps the default corner
  barMini: false,
  barHidden: false,
  hub: "list",
  tab: "texts",
  query: "",
  changesOnly: false,
  shapeEdit: false,
  shapePoint: null,
  stillDraw: false, // freehand: painting the region that stays put
  stillDrag: null, // rectangle preview while an older box mark is nudged
  stillStroke: null, // {pts:[[x,y],...]} the stroke under the pointer, in % of the element
  stillInk: null, // finished strokes of the current freehand session
  stillNudge: null, // saved freehand mark while it is being dragged
  stillBrush: 6, // stroke width, percent of the element's shorter side
  stillEl: null,
  guides: [],
  paddingHover: false,
  hidden: cfg.startHidden,
  device: "desktop", // device chosen in the switcher
  ask: null, // {key, group}
  notice: null, // {text, kind}
  open: new Set(["text", "layout"]),
  lastPoint: null,
  childStack: [],
  importing: null,
  commentFilter: { page: "", status: "open" },
  requestDraft: null, // {kind, trigger}
  crop: null,
  placing: null, // {art} or {kind: "text"} while the next click on the page places it
  rotating: null, // {deg, x, y} while turning an element by its handle
  focusAdded: null, // id of added text whose field gets focus when its panel opens
  placeAt: null, // {doc, x, y} pointer while placing, for the preview
  artColor: null, // colour chosen in the library
  lib: { pack: "", group: "", query: "" },
};
(() => {
  const saved = readJSON(UI_KEY, null);
  if (!saved) return;
  S.pos = saved.pos || null;
  S.barPos = saved.barPos || null;
  S.collapsed = !!saved.collapsed;
  if (typeof saved.hidden === "boolean" && !cfg.forceHidden) S.hidden = saved.hidden;
  if (saved.barMini || saved.barHidden) S.barHidden = true;
  if (Array.isArray(saved.open)) S.open = new Set(saved.open);
})();
const saveUi = () => {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ pos: S.pos, barPos: S.barPos, barMini: S.barMini, barHidden: S.barHidden, collapsed: S.collapsed, hidden: S.hidden, open: [...S.open] }));
  } catch {}
};
const isClient = () => store.settings.role === "client";
const editingMode = () => S.mode === "text" || S.mode === "element" || S.mode === "model" || S.mode === "comment";

const host = h("div", { id: "azervera-creatool", "data-creatool-ignore": "" });
const shadow = host.attachShadow({ mode: "open" });
const pageStyle = document.createElement("style");
pageStyle.setAttribute("data-creatool-ignore", "");
pageStyle.textContent = `
  html.ct-mode-element *, html.ct-mode-comment *{cursor:crosshair!important}
  html.ct-mode-element.ct-dragging *{cursor:grabbing!important}
  html.ct-mode-text *{cursor:text!important}
  html.ct-mode-element, html.ct-mode-text, html.ct-mode-model, html.ct-mode-comment{-webkit-user-select:none;user-select:none}
  html.ct-mode-element [data-creatool-id], html.ct-mode-element [data-review-id], html.ct-mode-element svg,
  html.ct-mode-comment [data-creatool-id], html.ct-mode-comment [data-review-id], html.ct-mode-comment svg{pointer-events:auto!important}
  [data-ct-flash]{outline:3px solid #ff5100!important;outline-offset:4px!important;animation:ct-flash .6s ease-in-out 3}
  @keyframes ct-flash{50%{outline-color:#ff510022}}
  html.ct-static-preview body{pointer-events:none!important}
  html.ct-placing *{cursor:copy!important}
  [data-ct-art]:not([data-ct-added]) *{visibility:hidden!important}
  [data-ct-art]:not([data-ct-added]){color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}
  img[data-ct-art]{object-position:-99999px -99999px!important}
  .ct-added{position:absolute;display:block;translate:-50% -50%;pointer-events:none}
  .ct-added[data-kind=art]{width:var(--ct-w,120px);aspect-ratio:var(--ct-ratio,1);height:auto;background:var(--ct-color,#111);-webkit-mask:var(--ct-art) center/contain no-repeat;mask:var(--ct-art) center/contain no-repeat}
  .ct-added[data-kind=text]{width:max-content;max-width:var(--ct-w,480px);margin:0;padding:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--ct-font);font-size:var(--ct-size,24px);font-weight:var(--ct-weight,400);font-style:var(--ct-style,normal);line-height:var(--ct-lh,1.2);letter-spacing:normal;text-transform:var(--ct-tt,none);text-align:var(--ct-align,left);color:var(--ct-color,#111)}
  html.ct-mode-text .ct-added{pointer-events:auto!important}
  .ct-added[data-kind=model]{width:var(--ct-w,260px);height:calc(var(--ct-w,260px) / .9);display:flex;flex-direction:column}
  .ct-model-bar{display:none;flex:0 0 auto;flex-direction:column;gap:4px;font:600 11px/1.3 system-ui,sans-serif;padding:4px 8px;background:var(--ct-chrome,#34483e);color:var(--ct-on,#fff);border-radius:12px 12px 0 0;pointer-events:auto;cursor:grab}
  html.ct-mode-element .ct-model-bar,html.ct-mode-text .ct-model-bar,html.ct-mode-model .ct-model-bar,html.ct-mode-comment .ct-model-bar{display:flex}
  .ct-gate{position:fixed;left:0;right:0;height:28px;margin-top:-14px;z-index:2147483000;display:flex;align-items:center;pointer-events:none}
  .ct-gate::before{content:"";position:absolute;left:0;right:0;top:50%;border-top:1.5px dashed #aa8c5088}
  .ct-gate.is-set::before{border-top-color:#aa8c50}
  .ct-gate button{position:relative;margin-left:16px;pointer-events:auto;border:0;border-radius:999px;background:#34483e;color:#faf9f6;font:600 12px/1 system-ui,sans-serif;padding:6px 10px;cursor:ns-resize}
  .ct-added[data-kind=model] canvas{display:block;width:100%;height:100%;flex:1;min-height:0;pointer-events:none}
  .ct-model-scale{display:none;position:absolute;right:4px;bottom:4px;z-index:2;width:28px;height:28px;border:0;border-radius:50%;background:var(--ct-chrome,#34483e);color:var(--ct-on,#fff);cursor:nwse-resize;pointer-events:auto;font-size:14px}
  html.ct-mode-element .ct-model-scale,html.ct-mode-model .ct-model-scale{display:grid;place-items:center}
  html.ct-mode-element .ct-added[data-kind=model],html.ct-mode-model .ct-added[data-kind=model]{pointer-events:auto}
  html.ct-mode-element .ct-added[data-kind=model] canvas,html.ct-mode-model .ct-added[data-kind=model] canvas{pointer-events:auto;cursor:grab!important;touch-action:none}`;

const CSS_TEXT = `
:host{all:initial}
*{box-sizing:border-box}
[hidden]{display:none!important}
.ui{font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#f0eee7;-webkit-font-smoothing:antialiased}
button,input,textarea,select{font:inherit;color:inherit;letter-spacing:normal;text-transform:none}
button{cursor:pointer;min-height:32px;padding:5px 10px;background:transparent;border:1px solid #f0eee738;border-radius:6px}
button:hover{border-color:#f0eee780}
button:disabled{opacity:.4;cursor:default}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #ff7e42;outline-offset:2px}
button[aria-pressed=true]{background:#ff5100;border-color:#ff5100;color:#111}
.box.still{outline:2px dashed #6fb7ff;background:#6fb7ff33;pointer-events:auto;cursor:move;touch-action:none}
.box.still span,.box.still-target span{position:absolute;left:0;bottom:100%;margin-bottom:3px;padding:2px 6px;background:#16324a;color:#bfe0ff;border-radius:3px;font:10px/1.3 ui-monospace,monospace;white-space:nowrap;pointer-events:none}
.box.still i{position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;margin:0;background:#6fb7ff;border:2px solid #fff;border-radius:2px;cursor:nwse-resize;pointer-events:auto;touch-action:none}
.box.still.live{pointer-events:none}
.box.still-target{outline:1px dashed #6fb7ff;pointer-events:none}
.still-ink{position:absolute;overflow:visible}
.still-ink,.still-ink svg,.still-ink path{pointer-events:none}
.still-ink.hit path{pointer-events:stroke;cursor:move;touch-action:none}
.still-ink span{position:absolute;left:0;bottom:100%;margin-bottom:3px;padding:2px 6px;background:#16324a;color:#bfe0ff;border-radius:3px;font:10px/1.3 ui-monospace,monospace;white-space:nowrap;pointer-events:none}
.bar{position:fixed;left:14px;bottom:14px;z-index:2147483646;display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:calc(100vw - 28px);padding:7px;background:#111110;border:1px solid #f0eee73b;border-radius:11px;box-shadow:0 8px 30px #0007}
.bar-grip{display:inline-flex;align-items:center;justify-content:center;min-width:18px;padding:0 2px;cursor:grab;user-select:none;touch-action:none;opacity:.8;font-size:15px;line-height:1;letter-spacing:-.14em}
.bar-grip:active{cursor:grabbing}
.bar-icon{min-width:32px;padding:5px 8px}
.bar.is-mini,.bar.is-hidden{width:max-content;flex-wrap:nowrap;cursor:grab}
.bar.is-hidden{border-radius:999px;padding:8px 12px}
.motion-slot{display:flex;max-width:0;max-height:0;opacity:0;overflow:hidden;transform:translateY(8px);margin-right:-6px;pointer-events:none;transition:max-width .34s cubic-bezier(.2,.85,.2,1),max-height .34s cubic-bezier(.2,.85,.2,1),opacity .24s ease,transform .34s cubic-bezier(.2,.85,.2,1),margin-right .34s ease}
.motion-slot.is-on{max-width:720px;max-height:64px;opacity:1;transform:none;margin-right:0;pointer-events:auto}
.motion button.motion-lock{min-width:46px;padding:8px 12px;font-size:16px;line-height:1}
.brand{font:800 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;padding:0 6px;color:#ff5100;white-space:nowrap}
.brand small{display:block;font:500 8px/1.4 ui-monospace,monospace;letter-spacing:.06em;color:#8d8a82;margin-top:3px}
.grp{display:flex;gap:2px;padding:2px;background:#f0eee714;border-radius:8px}
.grp button{border-color:transparent;font-size:12px}
.motion{display:flex;gap:3px;padding:4px;background:#f0eee714;border:1px solid #f0eee738;border-radius:14px}
.motion button{min-height:46px;padding:8px 18px;font-size:15px;font-weight:700;border-color:transparent;border-radius:10px}
.status{font-size:10px;color:#aaa;padding:0 4px;max-width:200px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ff5100;margin-left:5px;vertical-align:middle}
.pill{position:fixed;left:14px;bottom:14px;z-index:2147483646;background:#111110;border-color:#f0eee755;font:700 11px/1 ui-monospace,monospace;letter-spacing:.1em;color:#ff5100;padding:9px 12px;border-radius:999px}
.panel{position:fixed;right:14px;top:14px;bottom:80px;z-index:2147483645;width:min(420px,calc(100vw - 28px));overflow:auto;overscroll-behavior:contain;padding:16px 16px 20px;background:#191917;border:1px solid #f0eee74a;border-radius:13px;box-shadow:0 14px 70px #0009}
.panel>header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #ffffff22;cursor:move;touch-action:none;user-select:none}
.panel>header strong{font-size:17px;font-weight:650}
.panel>header .acts{display:flex;gap:2px}
.panel>header .acts button{font-size:20px;line-height:1;width:32px;padding:0}
.mini{position:fixed;right:14px;top:14px;z-index:2147483645;display:flex;align-items:center;gap:10px;min-height:38px;padding:7px 10px 7px 15px;background:#191917;border:1px solid #f0eee74a;border-radius:999px;box-shadow:0 8px 30px #0008;font-size:12px;white-space:nowrap;cursor:move;touch-action:none;user-select:none}
.mini b{background:#ff5100;color:#111;border-radius:999px;padding:1px 8px;font-size:11px}
.tabs{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 12px}
.tabs button{font-size:11px;padding:4px 8px;min-height:28px}
.tabs button[aria-selected=true]{background:#f0eee7;color:#111;border-color:#f0eee7}
.help,.meta{font-size:11px;line-height:1.6;color:#b5b2aa;margin:6px 0}
.title{font-size:15px;font-weight:600;margin:6px 0 2px;overflow-wrap:anywhere}
.row{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.row button{font-size:11px}
.note{font-size:12px;line-height:1.55;padding:9px 11px;margin:10px 0;border:1px solid #ff510066;border-radius:8px;background:#ff510012}
.note.ok{border-color:#7fd18b66;background:#7fd18b12}
.note.warn{border-color:#ffcc4d88;background:#ffcc4d14}
.tag{display:inline-block;font-size:10px;line-height:1.3;padding:2px 7px;border-radius:999px;background:#f0eee71c;color:#e8e5dc;margin:2px 4px 2px 0}
.tag.local{background:#6fb7ff2e;color:#bfe0ff}
.tag.dev{background:#b9ef7a2e;color:#dcf7b8}
.tag.pend{background:#ffcc4d33;color:#ffe29a}
details.sec{border-top:1px solid #ffffff1c;padding:2px 0}
details.sec>summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:650;color:#eae7de;padding:10px 0}
details.sec>summary::-webkit-details-marker{display:none}
details.sec>summary::after{content:"+";font-weight:400;color:#999}
details.sec[open]>summary::after{content:"–"}
details.sec>div{padding:0 0 12px}
h3{font-size:12px;font-weight:650;color:#ddd;margin:16px 0 8px}
label.l{display:block;font-size:11px;color:#cfccc4;margin:10px 0 5px}
textarea,input[type=search],input[type=text],input[type=url],input[type=email],input[type=tel],select{width:100%;padding:7px 9px;background:#f5f3ec;color:#111;border:1px solid #d9d6cc;border-radius:6px}
textarea{min-height:80px;resize:vertical;line-height:1.55}
select{padding:5px 8px}
.field{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;font-size:12px;margin:10px 0}
.field .lbl{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.field input[type=range]{grid-column:1/-1;width:100%;accent-color:#ff5100;margin:0}
.field .val{display:flex;align-items:center;gap:4px;color:#bbb}
.field .val input{width:70px;padding:3px 6px;background:#f5f3ec;color:#111;border:1px solid #d9d6cc;border-radius:5px;text-align:right}
.field .val select{width:auto;padding:2px 4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.grid4 label{font-size:10px;color:#aaa;display:grid;gap:3px}
.grid4 input{width:100%;padding:3px 5px;background:#f5f3ec;color:#111;border:1px solid #d9d6cc;border-radius:5px;text-align:right}
.seg{display:flex;flex-wrap:wrap;gap:3px;margin:6px 0}
.seg button{font-size:11px;padding:3px 8px;min-height:28px}
.check{display:flex;align-items:center;gap:8px;font-size:12px;margin:8px 0;cursor:pointer}
.check input{accent-color:#ff5100;width:16px;height:16px}
.color{display:flex;align-items:center;gap:6px;margin:8px 0;font-size:12px}
.color .lbl{flex:1}
.color input[type=color]{width:34px;height:28px;padding:0;border:1px solid #f0eee755;border-radius:5px;background:none;cursor:pointer}
.color input[type=text]{width:118px;padding:3px 6px}
.color select{width:98px;padding:2px 4px;font-size:11px}
.mini-reset{min-height:0;padding:0 5px;font-size:11px;line-height:1.5;border-radius:4px}
.fonts{display:grid;gap:6px}
.font{display:block;width:100%;text-align:left;padding:8px 10px 10px;background:#242421;border-color:#ffffff22}
.font[aria-pressed=true]{background:#ff51001c;border-color:#ff5100;color:inherit}
.font small{display:block;font:10px/1.4 ui-monospace,monospace;color:#bbb;margin-bottom:6px}
.font span{display:block;font-size:22px;line-height:1.35;max-height:66px;overflow:hidden;overflow-wrap:anywhere}
.list button.item{display:flex;gap:10px;width:100%;text-align:left;padding:9px 0;border:0;border-bottom:1px solid #ffffff20;border-radius:0;font-size:12px}
.list b{color:#ff864d;min-width:36px}
.list small{display:block;color:#999;font-size:10px;margin-top:3px}
.card{border:1px solid #ffffff22;border-radius:9px;padding:10px;margin:8px 0;background:#1f1f1d}
.card .row{margin:6px 0 0}
.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.thumbs figure{margin:0;border:1px solid #ffffff22;border-radius:7px;overflow:hidden;background:#222;cursor:pointer}
.thumbs img{display:block;width:100%;height:78px;object-fit:cover}
.thumbs figcaption{font-size:10px;padding:4px 6px;color:#bbb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cropbox{position:relative;margin:8px 0;user-select:none;touch-action:none;background:#000;border-radius:6px;overflow:hidden}
.cropbox img{display:block;width:100%;opacity:.55}
.cropbox .crop{position:absolute;border:2px solid #ff5100;box-shadow:0 0 0 999px #0008;cursor:move}
.cropbox .crop i{position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;background:#ff5100;border-radius:3px;cursor:nwse-resize}
.cropbox .focal{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #ff5100;pointer-events:none}
.comp-prev{width:100%;height:120px;border:1px solid #ffffff22;border-radius:7px;background:#fff;overflow:hidden;position:relative}
.comp-prev iframe{position:absolute;left:0;top:0;border:0;width:400%;height:400%;transform:scale(.25);transform-origin:0 0;pointer-events:none}
.thread{border-left:2px solid #ff510066;padding-left:10px;margin:8px 0}
.thread p{margin:4px 0;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.thread small{color:#999;font-size:10px}
footer{font-size:10px;color:#9d9a92;margin-top:20px;padding-top:12px;border-top:1px solid #ffffff22}
footer b{color:#ff864d;font-weight:600}
.overlay{position:fixed;inset:0;pointer-events:none;z-index:2147483644}
.box{position:absolute;border-radius:2px}
.box.hover{outline:1px dashed #f0eee7cc;background:#ff510012}
.box.hover span,.lab{position:absolute;left:0;bottom:100%;margin-bottom:3px;padding:2px 6px;background:#111;color:#f0eee7;border:1px solid #f0eee755;border-radius:3px;font:10px/1.3 ui-monospace,monospace;white-space:nowrap;max-width:min(420px,80vw);overflow:hidden;text-overflow:ellipsis}
.box.sel{outline:2px solid #ff5100;outline-offset:1px}
.box.pad{background:#7fd18b40;outline:0}
.box.place{outline:2px dashed #6fb7ff;background:#6fb7ff18}
.box.place span{position:absolute;left:6px;top:4px;font:10px/1.3 ui-monospace,monospace;color:#bfe0ff;background:#111c;padding:2px 5px;border-radius:3px}
.handle{position:absolute;width:11px;height:11px;margin:-6px 0 0 -6px;background:#fff;border:2px solid #ff5100;border-radius:2px;pointer-events:auto;touch-action:none}
.pt{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;background:#ff5100;border:2px solid #fff;border-radius:50%;pointer-events:auto;cursor:move;touch-action:none}
.pt.on{background:#fff;border-color:#ff5100}
.edge{position:absolute;height:12px;margin-top:-6px;transform-origin:0 50%;pointer-events:auto;cursor:copy}
.guide{position:absolute;background:#ff2d8f;pointer-events:none}
.guide span{position:absolute;padding:1px 5px;background:#ff2d8f;color:#fff;font:10px/1.3 ui-monospace,monospace;border-radius:3px;white-space:nowrap}
.gridlines{position:absolute;inset:0;background-image:linear-gradient(#6fb7ff22 1px,transparent 1px),linear-gradient(90deg,#6fb7ff22 1px,transparent 1px)}
.badge{position:absolute;transform:translateY(-100%);padding:1px 5px;min-height:0;background:#ff5100;color:#111;border:1px solid #111;border-radius:3px;font:10px/1.2 ui-monospace,monospace;pointer-events:auto;cursor:pointer}
.badge.changed{background:#b9ef7a}
.badge.sel{outline:2px solid #f0eee7;outline-offset:1px}
.badge.com{background:#6fb7ff;border-radius:10px 10px 10px 2px}
.badge.pend{background:#ffcc4d}
.reach{position:absolute;z-index:5;transform:translate(-50%,-50%);max-width:210px;padding:5px 9px;border:0;border-radius:999px;background:#ff5100;color:#111;font:600 11px/1.2 system-ui,sans-serif;cursor:grab;pointer-events:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 16px #0008}
.stage{position:fixed;inset:0;z-index:2147483640;background:#252522;background-image:radial-gradient(#ffffff10 1px,transparent 1px);background-size:18px 18px}
.stage iframe{position:absolute;top:14px;border:0;background:#fff;border-radius:10px;box-shadow:0 20px 60px #000a;transform-origin:0 0}
.stage .dev{position:absolute;top:18px;left:18px;font:11px/1.4 ui-monospace,monospace;color:#bbb}
.banner{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483646;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;background:#1f3b57;border:1px solid #6fb7ff88;border-radius:10px;font-size:12px;color:#e6f2ff;box-shadow:0 8px 30px #0008;max-width:calc(100vw - 28px)}
.banner select{width:auto;padding:3px 6px}
.rot-stem{position:absolute;width:0;border-left:1px dashed #ff5100;pointer-events:none}
.rot{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;border:2px solid #ff5100;box-shadow:0 1px 4px #0006;pointer-events:auto;cursor:grab;touch-action:none}
.rot:hover{background:#ff5100}
.rot-lab{position:absolute;transform:translate(-50%,-130%);padding:2px 6px;background:#ff5100;color:#111;border-radius:3px;font:11px/1.3 ui-monospace,monospace;pointer-events:none;white-space:nowrap}
button.danger{border-color:#ff6b6b88;color:#ffb3b3}
button.danger:hover{border-color:#ff6b6b;background:#ff6b6b1f}
.ghost-text{position:absolute;transform:translate(-50%,-50%);padding:2px 8px;border:1px dashed #6fb7ff;background:#6fb7ff22;color:var(--c);font:600 20px/1.2 system-ui,sans-serif;white-space:nowrap;pointer-events:none}
.ghost{position:absolute;transform:translate(-50%,-50%);opacity:.8;background:var(--c);-webkit-mask:var(--src) center/contain no-repeat;mask:var(--src) center/contain no-repeat;pointer-events:none}
.ghost-lab{position:absolute;transform:translateX(-50%);padding:2px 6px;background:#111;color:#f0eee7;border:1px solid #f0eee755;border-radius:3px;font:10px/1.3 ui-monospace,monospace;white-space:nowrap;pointer-events:none}
.swatches{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:6px 0}
.swatches button{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:3px 9px 3px 5px;min-height:28px}
.swatches i{width:16px;height:16px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 1px #ffffff66,0 0 0 1px #0006}
.swatches input[type=color]{width:30px;height:28px;padding:0;border:1px solid #f0eee755;border-radius:6px;background:none;cursor:pointer}
.chips{display:flex;flex-wrap:wrap;gap:3px;margin:8px 0}
.chips button{font-size:10.5px;padding:2px 8px;min-height:24px;border-radius:999px}
.lib{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0}
.lib button{display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:8px 5px 6px;min-height:0;border-radius:8px;background:var(--tile);border-color:transparent}
.lib button:hover{border-color:#ff5100}
.lib button[aria-pressed=true]{background:var(--tile);color:inherit;outline:2px solid #ff5100;outline-offset:1px}
.lib i,.art-prev i{display:block;background:var(--c);-webkit-mask:var(--src) center/contain no-repeat;mask:var(--src) center/contain no-repeat}
.lib i{height:52px}
.lib small{font-size:9.5px;line-height:1.25;color:var(--tc);text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.art-prev{display:flex;align-items:center;gap:12px;margin:8px 0;padding:10px 12px;border-radius:9px;background:var(--tile)}
.art-prev i{flex:none;width:76px;height:56px}
.art-prev span{font-size:12px;font-weight:600;color:var(--tc)}
.art-prev small{display:block;font-weight:400;font-size:10px;opacity:.75;margin-top:2px}

.ui{color:var(--ui-fg,#f0eee7)}
button{border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 22%,transparent)}
button:hover{border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 50%,transparent)}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline-color:var(--ui-accent,#ff5100)}
button[aria-pressed=true]{background:var(--ui-accent,#ff5100);border-color:var(--ui-accent,#ff5100);color:var(--ui-on,#111)}
.bar{background:var(--ui-bg,#111110);color:var(--ui-fg,#f0eee7);border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 24%,transparent)}
.brand,.pill{color:var(--ui-accent,#ff5100)}
.pill{background:var(--ui-bg,#111110);border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 32%,transparent)}
.brand small,.status,.help,.meta{color:color-mix(in srgb,var(--ui-fg,#f0eee7) 68%,transparent)}
.grp{background:color-mix(in srgb,var(--ui-fg,#f0eee7) 8%,transparent)}
.dot{background:var(--ui-accent,#ff5100)}
.panel,.mini{background:var(--ui-bg-2,#191917);color:var(--ui-fg,#f0eee7);border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 28%,transparent)}
.panel>header{border-bottom-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent)}
.mini b,.badge{background:var(--ui-accent,#ff5100);color:var(--ui-on,#111)}
.tabs button[aria-selected=true]{background:var(--ui-fg,#f0eee7);color:var(--ui-ink,#111);border-color:var(--ui-fg,#f0eee7)}
.note{border-color:color-mix(in srgb,var(--ui-accent,#ff5100) 45%,transparent);background:color-mix(in srgb,var(--ui-accent,#ff5100) 14%,transparent)}
.title,h3,details.sec>summary,label.l{color:var(--ui-fg,#f0eee7)}
details.sec{border-top-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 14%,transparent)}
textarea,input[type=search],input[type=text],input[type=url],input[type=email],input[type=tel],select,.field .val input,.grid4 input{background:var(--ui-field,#f5f3ec);color:var(--ui-ink,#111);border-color:color-mix(in srgb,var(--ui-ink,#111) 16%,var(--ui-field,#f5f3ec))}
.field input[type=range],.check input{accent-color:var(--ui-accent,#ff5100)}
.font,.card{background:color-mix(in srgb,var(--ui-fg,#f0eee7) 7%,var(--ui-bg,#111110));border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent)}
.font[aria-pressed=true]{background:color-mix(in srgb,var(--ui-accent,#ff5100) 16%,var(--ui-bg,#111110));border-color:var(--ui-accent,#ff5100);color:inherit}
.list b,footer b{color:var(--ui-accent,#ff5100)}
.list button.item{border-bottom-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 14%,transparent)}
.thumbs figure{border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent);background:color-mix(in srgb,var(--ui-fg,#f0eee7) 6%,var(--ui-bg,#111110))}
.cropbox .crop{border-color:var(--ui-accent,#ff5100)}
.cropbox .crop i,.pt{background:var(--ui-accent,#ff5100)}
.cropbox .focal{box-shadow:0 0 0 2px var(--ui-accent,#ff5100)}
footer{border-top-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent);color:color-mix(in srgb,var(--ui-fg,#f0eee7) 60%,transparent)}
.box.hover{outline-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 80%,transparent);background:color-mix(in srgb,var(--ui-accent,#ff5100) 12%,transparent)}
.box.hover span,.lab,.ghost-lab{background:var(--ui-bg,#111);color:var(--ui-fg,#f0eee7);border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 32%,transparent)}
.box.sel{outline-color:var(--ui-accent,#ff5100)}
.handle,.rot{border-color:var(--ui-accent,#ff5100)}
.pt{border-color:var(--ui-field,#fff)}
.rot-stem{border-left-color:var(--ui-accent,#ff5100)}
.rot-lab{background:var(--ui-accent,#ff5100);color:var(--ui-on,#111)}
.rot:hover{background:var(--ui-accent,#ff5100)}
.stage{background:var(--ui-bg,#252522)}
.lib button:hover,.lib button[aria-pressed=true]{border-color:var(--ui-accent,#ff5100);outline-color:var(--ui-accent,#ff5100)}
.lib button.model-tile b{font:700 18px/1 ui-monospace,monospace;letter-spacing:.08em;color:var(--ui-accent,#ff5100);padding:14px 0 2px}
.model-shelf{margin:8px 0 18px;padding-bottom:12px;border-bottom:1px solid color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent)}
`;

/* ---------- field builders ---------- */

function numField(label, value, o = {}) {
  const min = o.min ?? 0;
  const max = o.max ?? 100;
  const step = o.step ?? 1;
  const v = num(value, o.fallback ?? 0);
  const range = h("input", { type: "range", min, max, step, value: clamp(v, min, max), "aria-label": label });
  const input = h("input", { type: "number", step, value: round(v, 2), "aria-label": label });
  const emit = (n) => o.onInput && o.onInput(n);
  range.addEventListener("input", () => {
    input.value = range.value;
    emit(Number(range.value));
  });
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (input.value !== "" && Number.isFinite(n)) {
      range.value = clamp(n, min, max);
      emit(n);
    }
  });
  if (o.onFocus) [range, input].forEach((x) => {
    x.addEventListener("pointerenter", () => o.onFocus(true));
    x.addEventListener("pointerleave", () => o.onFocus(false));
    x.addEventListener("focus", () => o.onFocus(true));
    x.addEventListener("blur", () => o.onFocus(false));
  });
  return h("div", { class: "field" }, h("span", { class: "lbl" }, label, o.badge || null), h("span", { class: "val" }, input, o.unitEl || o.unit || ""), range);
}
function lengthField(label, len, o = {}) {
  const units = o.units || ["px", "%", "vw", "vh", "auto"];
  const cur = len || { v: o.current ?? 0, u: "px" };
  const unit = h("select", { "aria-label": label + " jednotka" }, units.map((u) => h("option", { value: u, selected: u === cur.u }, u)));
  const max = { px: 2400, "%": 200, vw: 200, vh: 200, auto: 1 }[cur.u] || 2400;
  const f = numField(label, cur.u === "auto" ? 0 : cur.v, { min: 0, max, step: cur.u === "px" ? 1 : 0.5, unitEl: unit, badge: o.badge, onInput: (n) => o.onInput({ v: n, u: unit.value }) });
  unit.addEventListener("change", () => o.onUnit ? o.onUnit(unit.value) : o.onInput({ v: num(cur.v), u: unit.value }));
  return f;
}
function colorField(label, value, onInput, o = {}) {
  const tokens = Object.entries(allTokens(store.edits)).filter(([, t]) => t.type === "color");
  const isToken = typeof value === "string" && value.startsWith("token:");
  const hex = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#000000";
  const picker = h("input", { type: "color", value: hex, "aria-label": label });
  const text = h("input", { type: "text", value: isToken ? "" : value || "", placeholder: isToken ? "z tokenu" : "#ff5100 / rgba()", "aria-label": label + " hodnota" });
  const tok = tokens.length ? h("select", { "aria-label": label + " token" }, h("option", { value: "" }, "token…"), tokens.map(([n]) => h("option", { value: n, selected: isToken && value === "token:" + n }, n))) : null;
  picker.addEventListener("input", () => {
    text.value = picker.value;
    if (tok) tok.value = "";
    onInput(picker.value);
  });
  text.addEventListener("change", () => {
    const v = safeColor(text.value.trim());
    if (v) {
      if (/^#[0-9a-f]{6}$/i.test(v)) picker.value = v;
      if (tok) tok.value = "";
      onInput(v);
    }
  });
  if (tok) tok.addEventListener("change", () => tok.value && onInput("token:" + tok.value));
  const swatches = artColors().slice(0, 8).map((c) => h("button", { type: "button", title: c.name + " " + c.value, "aria-label": c.name, "aria-pressed": String(String(value).toLowerCase() === String(c.value).toLowerCase()), onClick: () => { text.value = c.value; if (/^#[0-9a-f]{6}$/i.test(c.value)) picker.value = c.value; if (tok) tok.value = ""; onInput(c.value); } }, withVars(h("i", {}), { "--c": resolveColor(c.value) })));
  return h("div", { class: "color" }, h("span", { class: "lbl" }, label, o.badge || null), swatches.length ? h("span", { class: "swatches" }, ...swatches) : null, picker, text, tok);
}
function seg(options, value, onPick, o = {}) {
  return h("div", { class: "seg", role: "group", "aria-label": o.label || "" }, options.map(([v, text, title]) => h("button", { type: "button", title: title || null, "aria-pressed": String(value === v), onClick: () => onPick(v) }, text)));
}
function check(label, checked, onChange, o = {}) {
  const input = h("input", { type: "checkbox", checked: !!checked, disabled: !!o.disabled });
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "check", title: o.title || null }, input, h("span", {}, label));
}
function selectField(label, options, value, onChange) {
  const s = h("select", { "aria-label": label }, options.map(([v, text]) => h("option", { value: v, selected: v === value }, text)));
  s.addEventListener("change", () => onChange(s.value));
  return h("div", {}, h("label", { class: "l" }, label), s);
}
function section(id, title, body, o = {}) {
  const d = h("details", { class: "sec", open: o.open ?? S.open.has(id) });
  d.addEventListener("toggle", () => {
    if (d.open) S.open.add(id);
    else S.open.delete(id);
    saveUi();
  });
  d.append(h("summary", {}, h("span", {}, title, o.tag || null)), h("div", {}, body()));
  return d;
}

/* ---------- drawings in the panel ---------- */

function withVars(el, vars) {
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  return el;
}
/** Tile colours so a white drawing sits on a dark tile and a dark drawing on a light one. */
function tileVars(color) {
  const light = isLightColor(color);
  return { "--c": resolveColor(color), "--tile": light ? "#2b2b28" : "#f0eee7", "--tc": light ? "#d6d3cb" : "#4a4843" };
}
function artPreview(art, note) {
  const url = safeUrl(art.src || "");
  return withVars(h("div", { class: "art-prev" }, withVars(h("i", {}), { "--src": url ? cssUrl(url) : "none" }), h("span", {}, art.name || art.id || "kresba", note ? h("small", {}, note) : null)), tileVars(art.color));
}
function artColorPicker(value, onPick) {
  const wrap = h("div", { class: "swatches", role: "group", "aria-label": "Barva kresby" });
  const known = artColors().some((c) => c.value === value);
  for (const c of artColors()) wrap.append(h("button", { type: "button", "aria-pressed": String(value === c.value), title: c.value, onClick: () => onPick(c.value) }, withVars(h("i", {}), { "--c": resolveColor(c.value) }), c.name));
  const hex = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#000000";
  const custom = h("input", { type: "color", value: hex, title: "Vlastní barva", "aria-label": "Vlastní barva" });
  custom.addEventListener("change", () => onPick(custom.value));
  wrap.append(custom);
  if (!known && value) wrap.append(h("span", { class: "tag" }, "vlastní"));
  return wrap;
}

// ---- 08-overlay.js ----
/* ---------- overlay: hover, selection with handles, shape points, guides, numbers, comments ---------- */

const overlayEl = h("div", { class: "overlay" });
let overlaySig = "";
const HANDLES = [["nw", 0, 0, "nwse"], ["n", 0.5, 0, "ns"], ["ne", 1, 0, "nesw"], ["e", 1, 0.5, "ew"], ["se", 1, 1, "nwse"], ["s", 0.5, 1, "ns"], ["sw", 0, 1, "nesw"], ["w", 0, 0.5, "ew"]];

const selectedEl = () => (S.sel ? elementFor(store.catalog[S.sel]) : null);
function shapeInfo(el, P) {
  const shape = P.shape && Array.isArray(P.shape.pts) ? P.shape : { mode: "clip", pts: RECT };
  const b = boxOf(el);
  if (!b) return null;
  const s = viewBox().s;
  const w = el.offsetWidth * s || b.width;
  const hgt = el.offsetHeight * s || b.height;
  let ox = b.left;
  let oy = b.top;
  if (shape.mode === "warp" && shape.pts.length === 4 && !same(shape.pts, RECT)) {
    ox = b.left - Math.min(...shape.pts.map((p) => (p[0] / 100) * w));
    oy = b.top - Math.min(...shape.pts.map((p) => (p[1] / 100) * hgt));
  } else if (b.width > w + 1 || b.height > hgt + 1) {
    // Scaled element: the shape follows the visible box.
    return { shape, ox: b.left, oy: b.top, w: b.width, h: b.height };
  }
  return { shape, ox, oy, w, h: hgt };
}
function horizontalMiss(b, frame, margin = 6) {
  return !!b && (b.right < frame.left + margin || b.left > frame.right - margin);
}
function frameMiss(b, frame, margin = 6) {
  return !!b && (horizontalMiss(b, frame, margin) || b.bottom < frame.top + margin || b.top > frame.bottom - margin);
}
/** Grab points for elements the device frame clips, so they can be dragged back in. */
function collectReach() {
  if (S.hidden || view.kind !== "frame" || !view.frame || !view.doc) return [];
  if (S.mode !== "element" && S.mode !== "model" && S.mode !== "text") return [];
  const frame = view.frame.getBoundingClientRect();
  const doc = view.doc;
  const page = curPage();
  const items = [];
  const take = (item) => {
    if (!item.b || !(item.b.width > 1 || item.b.height > 1)) return;
    const side = horizontalMiss(item.b, frame);
    if (item.kind === "tooth" && !side) return;
    if (!side && !frameMiss(item.b, frame)) return;
    item.side = side;
    items.push(item);
  };
  try {
    doc.querySelectorAll("[data-ct]").forEach((el) => {
      if (el.closest("[data-creatool-ignore], .tooth-frame, [data-ct-added]")) return;
      const key = el.getAttribute("data-ct");
      const entry = store.catalog[key];
      if (!entry || !onPageOf(entry, page)) return;
      const edited = hasEdits(key) || key === S.sel;
      let b = null;
      try { b = boxOf(el); } catch { return; }
      if (!edited && !horizontalMiss(b, frame)) return;
      take({ kind: "el", el, entry, b, label: entry.label || labelFor(el), priority: key === S.sel ? 0 : edited ? 3 : 4 });
    });
    doc.querySelectorAll("[data-ct-added]").forEach((el) => {
      const key = el.getAttribute("data-ct");
      const entry = (key && store.catalog[key]) || null;
      let b = null;
      try { b = boxOf(el); } catch { return; }
      const name = el.getAttribute("data-kind") === "model" ? "3D model" : (el.getAttribute("aria-label") || (el.innerText || "").replace(/\s+/g, " ").trim() || "přidaný prvek");
      take({ kind: "added", el, entry, b, label: name, priority: 2 });
    });
    if (S.mode === "model") {
      doc.querySelectorAll(".tooth-frame").forEach((el) => {
        const span = el.querySelector(".tooth-frame-bar span");
        let b = null;
        try { b = boxOf(el); } catch { return; }
        take({ kind: "tooth", el, entry: null, b, label: (span && span.textContent) || "3D zastávka", priority: 1 });
      });
    }
  } catch {
    return [];
  }
  items.sort((a, b) => a.priority - b.priority || Number(b.side) - Number(a.side));
  return items.slice(0, 10);
}
function reachSpot(frame, b, used) {
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const scores = [
    ["l", Math.abs(cx - frame.left)],
    ["r", Math.abs(frame.right - cx)],
    ["t", Math.abs(cy - frame.top)],
    ["b", Math.abs(frame.bottom - cy)],
  ];
  scores.sort((a, c) => a[1] - c[1]);
  const edge = scores[0][0];
  const n = used[edge]++;
  if (edge === "l" || edge === "r") {
    return {
      x: edge === "l" ? frame.left + 22 : frame.right - 22,
      y: Math.min(frame.bottom - 18, frame.top + 28 + n * 28),
    };
  }
  return {
    x: Math.min(frame.right - 48, frame.left + 88 + (n % 4) * 128),
    y: edge === "t" ? frame.top + 22 : frame.bottom - 22,
  };
}
function dragReach(item, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (item.kind === "tooth") {
    if (typeof item.el.__ctMove !== "function") return;
    const scale = view.scale || 1;
    if (view.frame) view.frame.style.pointerEvents = "none";
    let lx = event.clientX;
    let ly = event.clientY;
    const move = (e) => {
      const dx = (e.clientX - lx) / scale;
      const dy = (e.clientY - ly) / scale;
      lx = e.clientX;
      ly = e.clientY;
      if (dx || dy) item.el.__ctMove(dx, dy);
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      if (view.frame) view.frame.style.pointerEvents = "";
      if (typeof item.el.__ctSettle === "function") item.el.__ctSettle();
      drawOverlay(true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return;
  }
  const entry = item.entry || register(item.el, "el");
  if (!entry) return;
  interact.startMove(item.el, entry, event, view.doc, { listen: window, scale: view.scale || 1 });
  ui.select(entry.key);
}
function drawOverlay(force) {
  if (isChild) return;
  const reach = collectReach();
  const showing = !S.hidden && (S.mode !== "browse" || S.sel || reach.length);
  if (!showing) {
    if (overlaySig) overlayEl.replaceChildren();
    overlaySig = "";
    return;
  }
  const items = [];
  const vb = viewBox();
  const vw = innerWidth;
  const vh = innerHeight;
  const visible = (b) => b && b.bottom >= 0 && b.top <= vh && b.right >= 0 && b.left <= vw;
  const sel = selectedEl();
  const doc = view.doc;
  if (S.hovered && S.hovered !== sel && S.hovered.isConnected) {
    const b = boxOf(S.hovered);
    if (visible(b)) items.push({ k: "hover", el: S.hovered, b });
  }
  const sb = boxOf(sel);
  if (sb) items.push({ k: "sel", b: sb });
  const page = curPage();
  if (S.mode === "numbers" || S.mode === "text" || S.mode === "element") {
    doc.querySelectorAll("[data-ct]").forEach((el) => {
      const e = store.catalog[el.getAttribute("data-ct")];
      if (!e || !onPageOf(e, page)) return;
      const edited = hasEdits(e.key);
      if (S.mode === "text" && !e.t) return;
      if (S.mode === "element" && !(edited || e.key === S.sel)) return;
      const b = boxOf(el);
      if (visible(b)) items.push({ k: "badge", e, el, b, edited });
    });
  }
  const comments = store.edits.comments.filter((c) => c.page === page && c.status === "open");
  for (const c of comments) {
    const e = store.catalog[c.key];
    const el = e && elementFor(e);
    const b = boxOf(el);
    if (visible(b)) items.push({ k: "com", c, b });
  }
  for (const r of store.edits.requests) {
    if (r.status !== "pending" || (r.page !== page && r.scope !== "site")) continue;
    const e = store.catalog[r.elementId];
    const el = e && elementFor(e);
    const b = boxOf(el);
    if (!visible(b)) continue;
    if (r.type === "component") items.push({ k: "place", r, b });
    else items.push({ k: "pend", r, b });
  }
  const P = S.sel ? resolveProps(S.sel, page, curDevice(), store.edits).props : {};
  const shape = sel && S.shapeEdit && S.mode === "element" ? shapeInfo(sel, P) : null;
  const grid = store.settings.grid.on && S.mode === "element";
  const ghost = S.placing && S.placeAt && S.placeAt.doc === doc ? S.placeAt : null;
  const stillNow = S.stillNudge && stillIsDraw(S.stillNudge) ? S.stillNudge : S.stillDrag && S.stillDrag.w ? S.stillDrag : !S.stillDraw && validStill(P.still) ? P.still : null;
  const inkLive = S.stillDraw ? stillStamp({ brush: S.stillBrush, strokes: [...(S.stillInk || []), ...(S.stillStroke ? [S.stillStroke] : [])] }) : "";
  const sig = (ghost ? `ghost:${Math.round(ghost.x)}:${Math.round(ghost.y)}:${S.placing.kind || S.placing.art.src}:${S.placing.art ? S.placing.art.color : ""}|` : "") + (S.rotating ? `rot:${Math.round(S.rotating.deg * 10)}:${Math.round(S.rotating.x)}:${Math.round(S.rotating.y)}|` : "") + (S.stillDraw ? "still-draw|" + inkLive + "|" : "") + (stillNow ? `still:${stillStamp(stillNow)}|` : "") + items.map((i) => [i.k, i.e ? i.e.key + i.edited : "", i.c ? i.c.id : "", i.r ? i.r.id : "", Math.round(i.b.left), Math.round(i.b.top), Math.round(i.b.width), Math.round(i.b.height)].join(":")).join("|") +
    `|${S.sel}|${S.mode}|${S.hoverKind}|${JSON.stringify(S.guides)}|${S.paddingHover}|${shape ? JSON.stringify(shape) + S.shapePoint : ""}|${grid ? store.settings.grid.size + ":" + Math.round(view.win.scrollX) + ":" + Math.round(view.win.scrollY) + ":" + Math.round(vb.x) + ":" + Math.round(vb.y) : ""}|${reach.map((r) => `${r.kind}:${Math.round(r.b.left)}:${Math.round(r.b.top)}:${r.label}`).join(",")}`;
  if (sig === overlaySig && !force) return;
  overlaySig = sig;
  const px = (b) => ({ left: b.left + "px", top: b.top + "px", width: b.width + "px", height: b.height + "px" });
  const nodes = [];
  if (grid) {
    const size = store.settings.grid.size * vb.s;
    const g = h("div", { class: "gridlines" });
    g.style.backgroundSize = `${size}px ${size}px`;
    g.style.backgroundPosition = `${vb.x - (view.win.scrollX * vb.s) % size}px ${vb.y - (view.win.scrollY * vb.s) % size}px`;
    nodes.push(g);
  }
  for (const i of items) {
    if (i.k === "hover") {
      const id = i.el.getAttribute("data-ct");
      const e = id && store.catalog[id];
      const num = e ? (S.mode === "text" && e.t ? "T" + e.t : e.p ? "P" + e.p : e.t ? "T" + e.t : "") : "";
      nodes.push(h("div", { class: "box hover", style: px(i.b) }, h("span", {}, S.placing ? "Kresba se připne k: " + labelFor(i.el) : (num ? num + " · " : "") + labelFor(i.el))));
    } else if (i.k === "sel") {
      const box = h("div", { class: "box sel", style: px(i.b) });
      nodes.push(box);
      if (S.mode === "element" && !isClient() && !S.shapeEdit) {
        for (const [dir, fx, fy, cur] of HANDLES)
          nodes.push(h("div", { class: "handle", title: "Táhni: změna velikosti (Shift zamkne poměr, Alt od středu)", style: { left: i.b.left + fx * i.b.width + "px", top: i.b.top + fy * i.b.height + "px", cursor: cur + "-resize" }, onPointerdown: (e) => interact.startResize(dir, e) }));
        // Rotation knob above the box (below it when the box touches the top of the screen).
        const cx = i.b.left + i.b.width / 2;
        const above = i.b.top - 30 > 6;
        const ky = above ? i.b.top - 30 : i.b.bottom + 30;
        nodes.push(h("div", { class: "rot-stem", style: { left: cx + "px", top: (above ? ky : i.b.bottom) + "px", height: "30px" } }));
        nodes.push(h("div", { class: "rot", title: "Táhni: otočení (Shift po 15°, dvojklik vrátí na 0°)", style: { left: cx + "px", top: ky + "px" }, onPointerdown: (e) => interact.startRotate(e), onDblclick: (e) => interact.resetRotate(e) }));
      }
      if (S.paddingHover && sel) {
        const c = cs(sel);
        const s = vb.s;
        const pt = parseFloat(c.paddingTop) * s;
        const pr = parseFloat(c.paddingRight) * s;
        const pb = parseFloat(c.paddingBottom) * s;
        const pl = parseFloat(c.paddingLeft) * s;
        const b = i.b;
        nodes.push(h("div", { class: "box pad", style: px({ left: b.left, top: b.top, width: b.width, height: pt }) }), h("div", { class: "box pad", style: px({ left: b.left, top: b.bottom - pb, width: b.width, height: pb }) }), h("div", { class: "box pad", style: px({ left: b.left, top: b.top + pt, width: pl, height: b.height - pt - pb }) }), h("div", { class: "box pad", style: px({ left: b.right - pr, top: b.top + pt, width: pr, height: b.height - pt - pb }) }));
      }
    } else if (i.k === "badge") {
      const e = i.e;
      const label = S.mode === "text" ? "T" + e.t : e.p ? "P" + e.p : "T" + e.t;
      nodes.push(h("button", { type: "button", class: "badge" + (i.edited ? " changed" : "") + (e.key === S.sel ? " sel" : ""), style: { left: Math.max(4, i.b.left) + "px", top: Math.max(18, i.b.top) + "px" }, title: e.label,
        onPointerenter: () => { S.hovered = i.el; S.hoverKind = "badge"; },
        onPointerleave: () => { if (S.hovered === i.el) { S.hovered = null; S.hoverKind = null; } },
        onClick: () => ui.select(e.key) }, label));
    } else if (i.k === "com") {
      nodes.push(h("button", { type: "button", class: "badge com", title: i.c.text, style: { left: Math.max(4, i.b.right - 26) + "px", top: Math.max(18, i.b.top) + "px" }, onClick: () => { S.open.add("comments"); ui.select(i.c.key); } }, "K"));
    } else if (i.k === "pend") {
      nodes.push(h("button", { type: "button", class: "badge pend", title: "Čeká na implementaci: " + i.r.description, style: { left: Math.max(4, i.b.left) + "px", top: Math.max(18, i.b.bottom + 16) + "px" }, onClick: () => { S.panel = true; S.sel = null; S.hub = "requests"; ui.renderPanel(); } }, "čeká na implementaci"));
    } else if (i.k === "place") {
      const b = i.r.position === "before" ? { left: i.b.left, top: i.b.top - 36, width: i.b.width, height: 30 } : { left: i.b.left, top: i.b.bottom + 6, width: i.b.width, height: 30 };
      nodes.push(h("div", { class: "box place", style: px(b) }, h("span", {}, `Sem přijde komponenta „${i.r.componentName}“ · čeká na implementaci`)));
    }
  }
  if (shape) {
    const pts = shape.shape.pts.map(([x, y]) => [shape.ox + (x / 100) * shape.w, shape.oy + (y / 100) * shape.h]);
    pts.forEach(([x1, y1], i) => {
      const [x2, y2] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x2 - x1, y2 - y1);
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      nodes.push(h("div", { class: "edge", title: "Dvojklik přidá bod", style: { left: x1 + "px", top: y1 + "px", width: len + "px", transform: `rotate(${angle}deg)`, borderTop: "1px dashed #ff5100" }, onDblclick: (e) => interact.addPoint(i, e, shape) }));
    });
    pts.forEach(([x, y], i) => nodes.push(h("div", { class: "pt" + (S.shapePoint === i ? " on" : ""), title: `Bod ${i + 1} (Delete smaže)`, style: { left: x + "px", top: y + "px" }, onPointerdown: (e) => interact.startPoint(i, e, shape) })));
  }
  if (sel && S.mode === "element" && !isClient()) {
    const pctBox = (b, region) => ({ left: b.left + (region.x / 100) * b.width, top: b.top + (region.y / 100) * b.height, width: (region.w / 100) * b.width, height: (region.h / 100) * b.height });
    const inkNode = (b, still, hit) => {
      const node = h("div", { class: "still-ink" + (hit ? " hit" : ""), style: { left: b.left + "px", top: b.top + "px", width: b.width + "px", height: b.height + "px" } });
      node.innerHTML = stillSvg(still, b.width, b.height, "preview");
      if (hit) node.querySelectorAll("path").forEach((path) => path.addEventListener("pointerdown", (e) => interact.startStillAdjust("move", e)));
      return node;
    };
    if (S.stillDraw) {
      const b = boxOf(sel);
      if (b) {
        nodes.push(h("div", { class: "box still-target", style: px(b) }, h("span", {}, "Kresli tužkou část, která se nehýbe. Hotovo uloží, Esc zruší.")));
        const strokes = [...(S.stillInk || []), ...(S.stillStroke ? [S.stillStroke] : [])];
        if (strokes.length) nodes.push(inkNode(b, { brush: S.stillBrush, strokes }, false));
      }
    } else if (stillIsDraw(stillNow)) {
      const b = restViewportBox(sel);
      if (b) {
        const node = inkNode(b, stillNow, true);
        node.append(h("span", {}, "nehýbe se"));
        nodes.push(node);
      }
    } else if (validStill(P.still)) {
      const b = restViewportBox(sel);
      if (b) {
        nodes.push(h("div", { class: "box still", style: px(pctBox(b, P.still)), title: "Táhni: posun části, která se nehýbe", onPointerdown: (e) => interact.startStillAdjust("move", e) },
          h("span", {}, "nehýbe se"),
          h("i", { title: "Táhni: změna velikosti", onPointerdown: (e) => { e.stopPropagation(); interact.startStillAdjust("resize", e); } })));
      }
    }
  }
  for (const g of S.guides) {
    const t = (v, axis) => (axis === "x" ? vb.x + v * vb.s : vb.y + v * vb.s);
    if (g.kind === "v") nodes.push(h("div", { class: "guide", style: { left: t(g.x, "x") + "px", top: t(g.top, "y") + "px", width: "1px", height: Math.max(1, (g.bottom - g.top) * vb.s) + "px" } }, g.label ? h("span", { style: { left: "4px", top: "50%" } }, g.label) : null));
    if (g.kind === "h") nodes.push(h("div", { class: "guide", style: { left: t(g.left, "x") + "px", top: t(g.y, "y") + "px", height: "1px", width: Math.max(1, (g.right - g.left) * vb.s) + "px" } }, g.label ? h("span", { style: { top: "4px", left: "50%" } }, g.label) : null));
    if (g.kind === "spaceX") {
      const y = t((Math.max(g.a.top, g.b.top) + Math.min(g.a.bottom, g.b.bottom)) / 2, "y");
      nodes.push(h("div", { class: "guide", style: { left: t(g.a.right, "x") + "px", top: y + "px", height: "2px", width: Math.max(1, (g.b.left - g.a.right) * vb.s) + "px" } }, h("span", { style: { top: "4px", left: "4px" } }, `${g.gap} px = ${g.gap} px`)));
    }
    if (g.kind === "spaceY") {
      const x = t((Math.max(g.a.left, g.b.left) + Math.min(g.a.right, g.b.right)) / 2, "x");
      nodes.push(h("div", { class: "guide", style: { left: x + "px", top: t(g.a.bottom, "y") + "px", width: "2px", height: Math.max(1, (g.b.top - g.a.bottom) * vb.s) + "px" } }, h("span", { style: { left: "4px", top: "4px" } }, `${g.gap} px = ${g.gap} px`)));
    }
  }
  if (S.rotating) nodes.push(h("div", { class: "rot-lab", style: { left: S.rotating.x + "px", top: S.rotating.y + "px" } }, `${round(S.rotating.deg, 1)}°`));
  if (ghost && S.placing.kind === "text") {
    const x = vb.x + ghost.x * vb.s;
    const y = vb.y + ghost.y * vb.s;
    nodes.push(withVars(h("div", { class: "ghost-text", style: { left: x + "px", top: y + "px" } }, "Nový text"), { "--c": "#bfe0ff" }));
    nodes.push(h("div", { class: "ghost-lab", style: { left: x + "px", top: y + 24 + "px" } }, "Klikni pro přidání textu · Esc zruší"));
  } else if (ghost && S.placing.kind === "model") {
    const x = vb.x + ghost.x * vb.s;
    const y = vb.y + ghost.y * vb.s;
    const w = 120 * vb.s;
    nodes.push(h("div", { class: "ghost", style: { left: x + "px", top: y + "px", width: w + "px", height: w + "px" } }));
    nodes.push(h("div", { class: "ghost-lab", style: { left: x + "px", top: y + w / 2 + 10 + "px" } }, "Klikni pro přidání 3D modelu · Esc zruší"));
  } else if (ghost && S.placing.art) {
    const art = S.placing.art;
    const url = safeUrl(art.src || "");
    const w = defaultArtWidth(art.ratio) * vb.s;
    const hh = w / clamp(num(art.ratio, 1), 0.05, 20);
    const x = vb.x + ghost.x * vb.s;
    const y = vb.y + ghost.y * vb.s;
    nodes.push(withVars(h("div", { class: "ghost", style: { left: x + "px", top: y + "px", width: w + "px", height: hh + "px" } }), { "--c": resolveColor(art.color), "--src": url ? cssUrl(url) : "none" }));
    nodes.push(h("div", { class: "ghost-lab", style: { left: x + "px", top: y + hh / 2 + 10 + "px" } }, "Klikni pro přidání · Shift přidá další · Esc zruší"));
  }
  if (reach.length && view.frame) {
    const frame = view.frame.getBoundingClientRect();
    const used = { l: 0, r: 0, t: 0, b: 0 };
    for (const item of reach) {
      const spot = reachSpot(frame, item.b, used);
      const text = "mimo · " + String(item.label).replace(/\s+/g, " ").trim().slice(0, 32);
      nodes.push(h("button", { type: "button", class: "reach", title: "Táhni prvek zpátky do zobrazení. Počítač se nemění.", style: { left: spot.x + "px", top: spot.y + "px" }, onPointerdown: (e) => dragReach(item, e) }, text));
    }
  }
  overlayEl.replaceChildren(...nodes);
}

// ---- 09-interact.js ----
/* ---------- interaction: picking, moving, resizing, shape points, keys, dropping images ---------- */

const childApi = () => {
  try {
    return view.kind === "frame" && view.win && view.win.__creatoolChild ? view.win.__creatoolChild : null;
  } catch {
    return null;
  }
};
/** Live preview while dragging; the owner of the document (this script or the one in the frame) writes the styles. */
function preview(key, props) {
  const child = childApi();
  if (child) child.preview(key, props ? JSON.stringify(props) : null);
  if (props) previewOverrides.set(key, props);
  else previewOverrides.delete(key);
  // Paint the framed page from here too. The copy inside the frame may not know a key that was just created.
  renderKey(key, (view && view.doc) || document);
}
function renderKey(key, doc) {
  const entry = store.catalog[key];
  const el = entry && elementFor(entry, doc);
  if (!el) return;
  const edits = activeEdits();
  const win = doc.defaultView;
  const { props, from } = resolveProps(key, pageOfWin(win), deviceOfWin(win), edits);
  const temp = previewOverrides.get(key);
  if (temp) Object.assign(props, temp);
  if (isEmptyObj(props)) {
    restoreElement(el);
    rendered.delete(el);
    return;
  }
  renderElement(el, entry, props, from, deviceOfWin(win), edits.elements[key], edits);
}

function topPoint(event) {
  const win = event.view;
  if (!win || win === window) return { x: event.clientX, y: event.clientY };
  const v = viewBox();
  return { x: v.x + event.clientX * v.s, y: v.y + event.clientY * v.s };
}
function stillCursor(el, on) {
  const doc = el && el.ownerDocument;
  if (doc && doc.documentElement) doc.documentElement.classList.toggle("ct-still-draw", !!on);
}
function cancelStillDraw() {
  const el = S.stillEl;
  S.stillDraw = false;
  S.stillDrag = null;
  S.stillStroke = null;
  S.stillInk = null;
  S.stillNudge = null;
  S.stillEl = null;
  stillCursor(el, false);
  releaseMotion(el);
}
function stillPoint(event, el) {
  const b = boxOf(el);
  if (!b || b.width < 2 || b.height < 2) return null;
  const p = topPoint(event);
  if (p.x < b.left - 8 || p.x > b.right + 8 || p.y < b.top - 8 || p.y > b.bottom + 8) return null;
  return [round(clamp(((p.x - b.left) / b.width) * 100, -2, 102), 1), round(clamp(((p.y - b.top) / b.height) * 100, -2, 102), 1)];
}
function pushStillPoint(stroke, pt) {
  if (!pt || stroke.pts.length > 600) return;
  const last = stroke.pts[stroke.pts.length - 1];
  if (last && Math.hypot(last[0] - pt[0], last[1] - pt[1]) < 0.35) return;
  stroke.pts.push(pt);
}
function toggleStillDraw(keep) {
  if (S.stillDraw) {
    if ((S.stillInk && S.stillInk.length) || (S.stillStroke && S.stillStroke.pts.length)) commitStill();
    else cancelStillDraw();
    ui.renderPanel();
    drawOverlay(true);
    return;
  }
  const el = selectedEl();
  if (!el) {
    ui.flashNotice("Nejdřív vyber prvek, na kterém část nakreslíš.");
    return;
  }
  const saved = S.sel ? resolveProps(S.sel, curPage(), curDevice(), store.edits).props.still : null;
  S.stillDraw = true;
  S.stillDrag = null;
  S.stillStroke = null;
  S.stillNudge = null;
  S.stillInk = keep && stillIsDraw(saved) ? JSON.parse(JSON.stringify(saved.strokes)) : [];
  if (saved && Number.isFinite(Number(saved.brush))) S.stillBrush = stillBrushOf(saved);
  S.stillEl = el;
  holdMotion(el);
  stillCursor(el, true);
  ui.renderPanel();
  drawOverlay(true);
}
function commitStill() {
  const strokes = (S.stillInk || []).filter((s) => s && s.pts && s.pts.length);
  const key = S.sel;
  const el = S.stillEl;
  S.stillDraw = false;
  S.stillStroke = null;
  S.stillInk = null;
  S.stillEl = null;
  stillCursor(el, false);
  releaseMotion(el);
  if (key && strokes.length) setProp(key, "still", { brush: S.stillBrush || 6, strokes }, { label: "Nehybná část" });
  ui.renderPanel();
  drawOverlay(true);
}
function clearStill(key) {
  cancelStillDraw();
  setProp(key, "still", null, { label: "Nehybná část" });
  ui.renderPanel();
  drawOverlay(true);
}

const interact = (() => {
  const attached = new Map();
  let hoverFrame = 0;
  let previewFrame = 0;
  const schedulePreview = (key, props) => {
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => preview(key, props));
  };
  const clientCan = (entry) => {
    const meta = entry && store.edits.elements[entry.key];
    return !!(meta && meta.lock === "client");
  };
  function pick(doc, x, y) {
    const sel = selectedEl();
    if (sel && sel.ownerDocument === doc && doc.elementsFromPoint(x, y).some((hit) => sel.contains(hit))) return sel;
    return candidatesAt(doc, x, y)[0] || null;
  }
  function attach(doc) {
    if (attached.has(doc)) return;
    const win = doc.defaultView;
    const onMove = (event) => {
      if (S.stillStroke && S.stillEl && S.stillEl.isConnected) {
        event.stopPropagation();
        pushStillPoint(S.stillStroke, stillPoint(event, S.stillEl));
        drawOverlay();
        return;
      }
      if (S.stillDraw) event.stopPropagation();
      if (S.placing && !event.buttons) {
        S.placeAt = { doc, x: event.clientX, y: event.clientY };
        drawOverlay();
      }
      if (event.buttons || !editingMode()) return;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => {
        if (isIgnored(event.target)) {
          S.hovered = null;
          return;
        }
        S.hovered = S.placing ? anchorAt(doc, event.clientX, event.clientY) : S.mode === "text" ? textAt(doc, event.clientX, event.clientY) : S.mode === "model" ? (event.target.closest && event.target.closest("[data-ct-added][data-kind=model]")) : pick(doc, event.clientX, event.clientY);
        S.hoverKind = S.mode;
      });
    };
    const onUp = (event) => {
      if (!S.stillStroke) return;
      event.preventDefault();
      event.stopPropagation();
      const stroke = S.stillStroke;
      S.stillStroke = null;
      if (stroke.pts.length) {
        S.stillInk = S.stillInk || [];
        if (S.stillInk.length < 80) S.stillInk.push(stroke);
      }
      ui.renderPanel();
      drawOverlay(true);
    };
    const onDown = (event) => {
      if (!editingMode() || event.button !== 0 || isIgnored(event.target) || viewState !== "draft") return;
      if (S.stillDraw && !isClient()) {
        const el = S.stillEl && S.stillEl.isConnected ? S.stillEl : selectedEl();
        const pt = el && el.ownerDocument === doc ? stillPoint(event, el) : null;
        if (pt) {
          event.preventDefault();
          event.stopPropagation();
          S.stillEl = el;
          S.stillStroke = { pts: [pt] };
          drawOverlay(true);
          return;
        }
        if ((S.stillInk && S.stillInk.length) || (S.stillStroke && S.stillStroke.pts.length)) commitStill();
        else {
          cancelStillDraw();
          ui.renderPanel();
          drawOverlay(true);
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      S.lastPoint = { x: event.clientX, y: event.clientY, doc };
      if (S.placing && !isClient()) {
        const placing = S.placing;
        const more = event.shiftKey && placing.art;
        if (!more) {
          S.placing = null;
          S.placeAt = null;
          ui.syncModeClasses();
        }
        if (placing.kind === "text") addTextAt(doc, event.clientX, event.clientY);
        else if (placing.kind === "model") addModelAt(doc, event.clientX, event.clientY, placing.model);
        else addArtAt(doc, event.clientX, event.clientY, placing.art);
        S.notice = { text: placing.kind === "text" ? "Text je přidaný. Přepiš ho v panelu, tam je i písmo, velikost a barva. Táhni ho myší, otáčí se tečkou nad rámečkem." : placing.kind === "model" ? "3D model je na stránce. Táhni přímo modelem pro otočení, lištou pro posun, úchyty mění velikost." : more ? "Přidáno. Se Shiftem přidáváš další, Esc přidávání ukončí." : "Prvek je přidaný. Táhni ho myší, úchyty mění velikost; barvu a kresbu změníš tady v panelu.", kind: "ok" };
        ui.renderPanel();
        drawOverlay(true);
        return;
      }
      if (isClient()) {
        // The client edits only what the owner unlocked: a text or an image.
        const img = doc.elementsFromPoint(event.clientX, event.clientY).find((x) => x.tagName && x.tagName.toLowerCase() === "img" && !isIgnored(x));
        const textEl = textAt(doc, event.clientX, event.clientY);
        const candidates = [textEl && register(textEl, "text", true), img && register(img, "el", true)].filter(Boolean);
        const allowed = candidates.find(clientCan);
        if (S.mode === "comment" && candidates[0]) {
          S.open.add("comments");
          ui.select(candidates[0].key);
          return;
        }
        if (!allowed) {
          if (candidates.length) ui.flashNotice("Tenhle prvek je zamčený. Upravit jde jen to, co ti majitel webu odemkl.");
          return;
        }
        ui.select(allowed.key);
        return;
      }
      if (S.mode === "text") {
        const added = doc.elementsFromPoint(event.clientX, event.clientY).find((n) => n.hasAttribute && n.hasAttribute("data-ct-added"));
        if (added) {
          ui.select(register(added, "el").key);
          return;
        }
        const el = textAt(doc, event.clientX, event.clientY);
        if (!el) return;
        ui.select(register(el, "text").key);
        return;
      }
      if (S.mode === "model") {
        const modelHit = event.target.closest && event.target.closest("[data-ct-added][data-kind=model]");
        if (!modelHit) return;
      }
      const addedHost = event.target.closest && event.target.closest("[data-ct-added]");
      const el = addedHost || pick(doc, event.clientX, event.clientY);
      if (!el) return;
      const entry = register(el, "el");
      if (S.mode === "comment") {
        S.open.add("comments");
        ui.select(entry.key);
        return;
      }
      if (S.sel !== entry.key) {
        S.childStack = [];
        ui.select(entry.key);
      }
      const editing3d = S.mode === "element" || S.mode === "model";
      const scaleHit = event.target.closest && event.target.closest(".ct-model-scale");
      if (scaleHit && editing3d) {
        models.beginScale(scaleHit.getAttribute("data-ct-scale"), scaleHit.getAttribute("data-ct-stop") || "", event);
        return;
      }
      const orbit = event.target.closest && event.target.closest("[data-ct-orbit]");
      if (orbit && editing3d) {
        models.beginOrbit(orbit.getAttribute("data-ct-orbit"), event, orbit.getAttribute("data-ct-stop"));
        return;
      }
      const stopId = addedHost && addedHost.getAttribute("data-ct-stop");
      if (stopId && editing3d && event.target.closest && event.target.closest(".ct-model-bar")) {
        models.beginMoveStop(addedHost.getAttribute("data-ct-added"), stopId, event);
        return;
      }
      if (!S.shapeEdit) startMove(el, entry, event, doc);
    };
    const block = (event) => {
      if (isIgnored(event.target)) return;
      if (editingMode() || viewState === "backup") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKey = (event) => keys(event);
    const onDragOver = (event) => {
      if (S.hidden || !event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
      event.preventDefault();
    };
    const onDrop = (event) => {
      if (S.hidden || !event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
      const file = Array.from(event.dataTransfer.files).find((f) => /^image\//.test(f.type) || /\.glb$/i.test(f.name) || f.type === "model/gltf-binary");
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      if (/\.glb$/i.test(file.name) || file.type === "model/gltf-binary") {
        models.add(file).then((rec) => {
          addModelAt(doc, event.clientX, event.clientY, rec);
          S.notice = { text: "3D model „" + rec.name + "“ je na stránce. Táhni jím pro otočení.", kind: "ok" };
          ui.renderPanel();
        }).catch((err) => ui.flashNotice(err.message || "Model se nepodařilo nahrát."));
        return;
      }
      const img = doc.elementsFromPoint(event.clientX, event.clientY).find((x) => x.tagName && x.tagName.toLowerCase() === "img" && !isIgnored(x));
      ui.dropImage(file, img || null);
    };
    const handlers = [["pointermove", onMove], ["pointerdown", onDown], ["pointerup", onUp], ["pointercancel", onUp], ["keydown", onKey], ["dragover", onDragOver], ["drop", onDrop]];
    for (const type of ["click", "dblclick", "dragstart", "selectstart", "submit", "auxclick", "contextmenu"]) handlers.push([type, block]);
    handlers.forEach(([t, f]) => doc.addEventListener(t, f, true));
    attached.set(doc, () => handlers.forEach(([t, f]) => doc.removeEventListener(t, f, true)));
    if (doc !== document) win.addEventListener("unload", () => detach(doc));
  }
  function detach(doc) {
    const off = attached.get(doc);
    if (off) off();
    attached.delete(doc);
  }

  function startMove(el, entry, event, doc, reach = null) {
    const key = entry.key;
    const win = doc.defaultView;
    const listen = (reach && reach.listen) || win;
    const scale = (reach && reach.scale) || 1;
    const P = resolveProps(key, curPage(), curDevice(), store.edits).props;
    const x0 = num(P.x);
    const y0 = num(P.y);
    const r0 = el.getBoundingClientRect();
    const sx = event.clientX;
    const sy = event.clientY;
    const targets = store.settings.snap && !snapOff(el) ? snapTargets(el) : [];
    let moved = false;
    let last = { x: x0, y: y0 };
    if (reach) lockFrame(true);
    const move = (e) => {
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 3) return;
      moved = true;
      doc.documentElement.classList.add("ct-dragging");
      let dx = (e.clientX - sx) / scale;
      let dy = (e.clientY - sy) / scale;
      const b = { left: r0.left + dx, top: r0.top + dy, width: r0.width, height: r0.height, right: r0.right + dx, bottom: r0.bottom + dy };
      const snap = snapBox(b, targets, { disabled: e.ctrlKey || e.metaKey || !store.settings.snap || snapOff(el), win });
      dx += snap.dx;
      dy += snap.dy;
      S.guides = snap.guides;
      last = { x: x0 + dx, y: y0 + dy };
      schedulePreview(key, { x: last.x, y: last.y });
    };
    const up = () => {
      listen.removeEventListener("pointermove", move, true);
      listen.removeEventListener("pointerup", up, true);
      listen.removeEventListener("pointercancel", up, true);
      if (reach) lockFrame(false);
      doc.documentElement.classList.remove("ct-dragging");
      cancelAnimationFrame(previewFrame);
      S.guides = [];
      if (moved) {
        previewOverrides.delete(key);
        const child = childApi();
        if (child) child.preview(key, null);
        setProps(key, { x: round(last.x), y: round(last.y), refW: round(parentWidth(el)) }, { label: "Posun" });
        ui.renderPanel();
      }
      drawOverlay(true);
    };
    listen.addEventListener("pointermove", move, true);
    listen.addEventListener("pointerup", up, true);
    listen.addEventListener("pointercancel", up, true);
  }

  function startStillAdjust(mode, event) {
    event.preventDefault();
    event.stopPropagation();
    const el = selectedEl();
    const key = S.sel;
    if (!el || !key || S.stillDraw) return;
    const P = resolveProps(key, curPage(), curDevice(), store.edits).props;
    const drawn = stillIsDraw(P.still);
    if (drawn && mode !== "move") return;
    if (!drawn && !validStill(P.still)) return;
    const base = drawn ? P.still : { x: num(P.still.x), y: num(P.still.y), w: num(P.still.w), h: num(P.still.h) };
    const sx = event.clientX;
    const sy = event.clientY;
    let last = base;
    const move = (e) => {
      const b = stillSpace(el);
      if (!b || !b.width || !b.height) return;
      const p = topPoint(e);
      const dx = ((p.x - sx) / b.width) * 100;
      const dy = ((p.y - sy) / b.height) * 100;
      if (drawn) {
        last = shiftStill(base, dx, dy);
        S.stillNudge = last;
      } else {
        last = mode === "move"
          ? normStill(base.x + dx, base.y + dy, base.x + base.w + dx, base.y + base.h + dy)
          : normStill(base.x, base.y, base.x + base.w + dx, base.y + base.h + dy);
        S.stillDrag = last;
      }
      drawOverlay();
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      S.stillDrag = null;
      S.stillNudge = null;
      if (validStill(last)) setProp(key, "still", last, { label: "Nehybná část" });
      ui.renderPanel();
      drawOverlay(true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  }

  /** Resizing from the overlay handles (top-window events, converted to the edited document). */
  function startResize(dir, event) {
    const el = selectedEl();
    const key = S.sel;
    if (!el || !key) return;
    event.preventDefault();
    event.stopPropagation();
    lockFrame(true);
    const vb = viewBox();
    const P = resolveProps(key, curPage(), curDevice(), store.edits).props;
    // A box already sized in % (or vw/vh) stays in that unit after the first drag, so it scales with the picture.
    const inlineLen = (prop) => {
      const m = /^(-?[\d.]+)(px|%|vw|vh)$/.exec((el.style.getPropertyValue(prop) || "").trim());
      return m ? { v: parseFloat(m[1]), u: m[2] } : null;
    };
    const unitW = P.width || inlineLen("width");
    const unitH = P.height || inlineLen("height");
    const w0 = el.offsetWidth || el.getBoundingClientRect().width;
    const h0 = el.offsetHeight || el.getBoundingClientRect().height;
    const ratio = w0 / Math.max(1, h0);
    const x0 = num(P.x);
    const y0 = num(P.y);
    const r0 = el.getBoundingClientRect();
    const targets = store.settings.snap && !snapOff(el) ? snapTargets(el) : [];
    const sx = event.clientX;
    const sy = event.clientY;
    let last = null;
    const move = (e) => {
      let dx = (e.clientX - sx) / vb.s;
      let dy = (e.clientY - sy) / vb.s;
      const H = dir.includes("e") || dir.includes("w");
      const V = dir.includes("n") || dir.includes("s");
      // Snap the moving edges.
      if (!(e.ctrlKey || e.metaKey) && store.settings.snap && !snapOff(el)) {
        const b = { left: r0.left, top: r0.top, width: r0.width, height: r0.height, right: r0.right, bottom: r0.bottom };
        if (dir.includes("e")) b.right += dx;
        if (dir.includes("w")) b.left += dx;
        if (dir.includes("s")) b.bottom += dy;
        if (dir.includes("n")) b.top += dy;
        b.width = b.right - b.left;
        b.height = b.bottom - b.top;
        const snap = snapBox(b, targets, { edgesX: dir.includes("e") ? ["r"] : dir.includes("w") ? ["l"] : [], edgesY: dir.includes("s") ? ["b"] : dir.includes("n") ? ["t"] : [], win: winOf(el) });
        if (!snap.grid) {
          dx += snap.dx;
          dy += snap.dy;
          S.guides = snap.guides;
        }
      } else S.guides = [];
      let w = w0;
      let hh = h0;
      let x = x0;
      let y = y0;
      const k = e.altKey ? 2 : 1;
      if (dir.includes("e")) {
        w = w0 + dx * k;
        if (e.altKey) x = x0 - dx;
      }
      if (dir.includes("w")) {
        w = w0 - dx * k;
        x = x0 + dx;
      }
      if (dir.includes("s")) {
        hh = h0 + dy * k;
        if (e.altKey) y = y0 - dy;
      }
      if (dir.includes("n")) {
        hh = h0 - dy * k;
        y = y0 + dy;
      }
      if (e.shiftKey || P.lockRatio) {
        if (H && V) {
          if (Math.abs(w / w0) > Math.abs(hh / h0)) hh = w / ratio;
          else w = hh * ratio;
          if (dir.includes("n")) y = y0 + (h0 - hh);
          if (dir.includes("w")) x = x0 + (w0 - w);
        } else if (H) hh = w / ratio;
        else if (V) w = hh * ratio;
      }
      w = Math.max(4, w);
      hh = Math.max(4, hh);
      const next = { x, y };
      if (H || e.shiftKey || P.lockRatio) next.width = { v: round(w), u: "px" };
      if (V || e.shiftKey || P.lockRatio) next.height = { v: round(hh), u: "px" };
      last = next;
      schedulePreview(key, next);
    };
    const up = () => {
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", up, true);
      lockFrame(false);
      cancelAnimationFrame(previewFrame);
      S.guides = [];
      previewOverrides.delete(key);
      const child = childApi();
      if (child) child.preview(key, null);
      if (!last) return;
      const values = { refW: round(parentWidth(el)) };
      const pw = parentWidth(el);
      const vw = winOf(el).innerWidth;
      const vhh = winOf(el).innerHeight;
      const toUnit = (len, cur, basis) => {
        if (!cur || cur.u === "px" || cur.u === "auto") return len;
        const b = cur.u === "%" ? basis : cur.u === "vw" ? vw : vhh;
        return { v: round((len.v / Math.max(1, b)) * 100, 2), u: cur.u };
      };
      if (last.width) values.width = toUnit(last.width, unitW, pw);
      if (last.height) values.height = toUnit(last.height, unitH, el.parentElement ? el.parentElement.getBoundingClientRect().height : vhh);
      if (last.x !== x0) values.x = round(last.x);
      if (last.y !== y0) values.y = round(last.y);
      setProps(key, values, { label: "Změna velikosti" });
      ui.renderPanel();
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", up, true);
  }

  /** While dragging an overlay handle, the device preview frame must not swallow the pointer. */
  const lockFrame = (on) => {
    if (stage && stage.frame) stage.frame.style.pointerEvents = on ? "none" : "";
  };
  /** Turning by the knob above the selection: the angle follows the pointer around the element's centre. */
  function startRotate(event) {
    const el = selectedEl();
    const key = S.sel;
    const b = boxOf(el);
    if (!el || !key || !b || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const r0 = num(resolveProps(key, curPage(), curDevice(), store.edits).props.rotate);
    const a0 = Math.atan2(event.clientY - cy, event.clientX - cx);
    let last = r0;
    lockFrame(true);
    document.documentElement.classList.add("ct-dragging");
    const move = (e) => {
      let r = r0 + ((Math.atan2(e.clientY - cy, e.clientX - cx) - a0) * 180) / Math.PI;
      r = ((((r + 180) % 360) + 360) % 360) - 180;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      else if (Math.abs(Math.round(r / 45) * 45 - r) < 2) r = Math.round(r / 45) * 45;
      last = round(r, 1);
      S.rotating = { deg: last, x: e.clientX, y: e.clientY };
      schedulePreview(key, { rotate: last });
      drawOverlay();
    };
    const up = () => {
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", up, true);
      lockFrame(false);
      document.documentElement.classList.remove("ct-dragging");
      cancelAnimationFrame(previewFrame);
      previewOverrides.delete(key);
      const child = childApi();
      if (child) child.preview(key, null);
      S.rotating = null;
      if (last !== r0) setProps(key, { rotate: last || undefined }, { label: "Otočení" });
      ui.renderPanel();
      drawOverlay(true);
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", up, true);
  }
  function resetRotate(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!S.sel) return;
    setProps(S.sel, { rotate: undefined }, { label: "Otočení na 0°" });
    ui.renderPanel();
  }

  function currentShape() {
    const P = resolveProps(S.sel, curPage(), curDevice(), store.edits).props;
    return P.shape && Array.isArray(P.shape.pts) ? clone(P.shape) : { mode: "clip", pts: clone(RECT) };
  }
  function startPoint(i, event, info) {
    event.preventDefault();
    event.stopPropagation();
    S.shapePoint = i;
    const key = S.sel;
    const shape = currentShape();
    const el = selectedEl();
    const targets = el ? snapTargets(el).map((t) => boxOf(t.el)).filter(Boolean) : [];
    let moved = false;
    const move = (e) => {
      moved = true;
      let px = e.clientX;
      let py = e.clientY;
      if (!(e.ctrlKey || e.metaKey) && store.settings.snap) {
        // Points snap to the element's own quarters and to the edges of nearby elements.
        const xs = [0, 0.25, 0.5, 0.75, 1].map((f) => info.ox + f * info.w);
        const ys = [0, 0.25, 0.5, 0.75, 1].map((f) => info.oy + f * info.h);
        for (const t of targets) xs.push(t.left, t.right), ys.push(t.top, t.bottom);
        const nx = xs.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a), Infinity);
        const ny = ys.reduce((a, b) => (Math.abs(b - py) < Math.abs(a - py) ? b : a), Infinity);
        if (Math.abs(nx - px) <= SNAP_PX) px = nx;
        if (Math.abs(ny - py) <= SNAP_PX) py = ny;
      }
      shape.pts[i] = [round(clamp(((px - info.ox) / info.w) * 100, -100, 200), 2), round(clamp(((py - info.oy) / info.h) * 100, -100, 200), 2)];
      schedulePreview(key, { shape: clone(shape) });
    };
    const up = () => {
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      cancelAnimationFrame(previewFrame);
      previewOverrides.delete(key);
      const child = childApi();
      if (child) child.preview(key, null);
      if (moved) setProp(key, "shape", shape, { label: "Tvar" });
      ui.renderPanel();
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
  }
  function addPoint(i, event, info) {
    event.preventDefault();
    event.stopPropagation();
    const shape = currentShape();
    const x = round(((event.clientX - info.ox) / info.w) * 100, 2);
    const y = round(((event.clientY - info.oy) / info.h) * 100, 2);
    shape.pts.splice(i + 1, 0, [x, y]);
    if (shape.mode === "warp") shape.mode = "clip";
    S.shapePoint = i + 1;
    setProp(S.sel, "shape", shape, { label: "Přidat bod tvaru" });
    ui.renderPanel();
  }
  function removePoint() {
    const shape = currentShape();
    if (S.shapePoint === null || shape.pts.length <= 3) return;
    shape.pts.splice(S.shapePoint, 1);
    S.shapePoint = null;
    setProp(S.sel, "shape", shape, { label: "Smazat bod tvaru" });
    ui.renderPanel();
  }

  function keys(event) {
    const t = event.composedPath ? event.composedPath()[0] : event.target;
    const typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName || "") || t.isContentEditable);
    if (event.altKey && event.shiftKey && event.code === "KeyR") {
      event.preventDefault();
      ui.setHidden(!S.hidden);
      return;
    }
    if (S.hidden) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !typing && event.code === "KeyZ") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && !typing && event.code === "KeyY") {
      event.preventDefault();
      redo();
      return;
    }
    if (typing) return;
    if (event.key === "Enter" && S.stillDraw) {
      event.preventDefault();
      if ((S.stillInk && S.stillInk.length) || (S.stillStroke && S.stillStroke.pts.length)) commitStill();
      else {
        cancelStillDraw();
        ui.renderPanel();
        drawOverlay(true);
      }
      return;
    }
    if (event.key === "Escape" && (S.stillDraw || S.stillStroke)) {
      cancelStillDraw();
      ui.renderPanel();
      drawOverlay(true);
      return;
    }
    if (event.key === "Escape" && S.placing) {
      S.placing = null;
      S.placeAt = null;
      ui.syncModeClasses();
      ui.renderPanel();
      drawOverlay(true);
      return;
    }
    if (event.key === "Escape") {
      if (S.shapeEdit) S.shapeEdit = false;
      else ui.select(null);
      ui.renderPanel();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && S.shapeEdit && S.shapePoint !== null) {
      event.preventDefault();
      removePoint();
      return;
    }
    if (!S.sel || isClient() || viewState !== "draft") return;
    // Delete removes the selected element in Prvky and Texty; Backspace only in Prvky, where nothing is typed on the page.
    if (!S.shapeEdit && (event.key === "Delete" ? S.mode === "element" || S.mode === "text" : event.key === "Backspace" && S.mode === "element")) {
      event.preventDefault();
      deleteElement(S.sel, curDevice());
      ui.renderPanel();
      drawOverlay(true);
      return;
    }
    if (S.mode !== "element") return;
    const step = event.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!d) return;
    event.preventDefault();
    const P = resolveProps(S.sel, curPage(), curDevice(), store.edits).props;
    const el = selectedEl();
    setProps(S.sel, { x: num(P.x) + d[0], y: num(P.y) + d[1], refW: el ? round(parentWidth(el)) : P.refW }, { label: "Posun šipkami", group: true });
    ui.renderPanel();
  }
  return { attach, detach, startMove, startResize, startRotate, resetRotate, startPoint, addPoint, removePoint, keys, startStillAdjust, toggleStillDraw, cancelStillDraw, clearStill };
})();

// ---- 10-panel-element.js ----
/* ---------- panel for one element ---------- */

const EASINGS = [["ease", "plynule"], ["ease-out", "zpomalit na konci"], ["ease-in-out", "zrychlit a zpomalit"], ["linear", "rovnoměrně"], ["cubic-bezier(.22,1,.36,1)", "měkce"], ["cubic-bezier(.34,1.56,.64,1)", "s odskokem"]];
const BASE_ACTIONS = [
  { id: "link-page", name: "Odkaz na stránku webu", description: "Přejde na vybranou stránku.", base: true },
  { id: "scroll-to", name: "Posun na sekci", description: "Posune stránku na vybranou sekci.", base: true },
  { id: "call", name: "Zavolat", description: "Otevře vytáčení čísla (tel:).", base: true },
  { id: "email", name: "Napsat e-mail", description: "Otevře nový e-mail (mailto:).", base: true },
  { id: "open-url", name: "Otevřít externí odkaz", description: "Otevře adresu v novém nebo stejném okně.", base: true },
];
const CATEGORIES = ["Hero", "Ceník", "Galerie", "Recenze", "Kontakt", "Patička", "Menu", "Jiné"];

function convertLen(el, len, unit, axis) {
  if (unit === "auto") return { v: 0, u: "auto" };
  const win = winOf(el);
  const parent = el.parentElement ? el.parentElement.getBoundingClientRect() : { width: win.innerWidth, height: win.innerHeight };
  const px = !len || len.u === "auto" ? (axis === "w" ? el.offsetWidth : el.offsetHeight) : len.u === "px" ? num(len.v) : len.u === "%" ? (num(len.v) / 100) * (axis === "w" ? parent.width : parent.height) : len.u === "vw" ? (num(len.v) / 100) * win.innerWidth : (num(len.v) / 100) * win.innerHeight;
  if (unit === "px") return { v: round(px), u: "px" };
  const basis = unit === "%" ? (axis === "w" ? parent.width : parent.height) : unit === "vw" ? win.innerWidth : win.innerHeight;
  return { v: round((px / Math.max(1, basis)) * 100, 2), u: unit };
}
function deviceWarnings(el) {
  const out = [];
  if (!el) return out;
  const win = winOf(el);
  const b = el.getBoundingClientRect();
  const device = deviceOfWin(win);
  if (b.width > 0 && (b.right > win.innerWidth + 1 || b.left < -1)) out.push("Prvek přetéká šířku obrazovky.");
  if (device !== "desktop" && el.matches(INTERACTIVE) && (b.width < 44 || b.height < 44)) out.push(`Dotykový cíl je menší než 44 × 44 px (${round(b.width, 0)} × ${round(b.height, 0)} px).`);
  if (el.parentElement) {
    for (const sib of Array.from(el.parentElement.children)) {
      if (sib === el || isIgnored(sib)) continue;
      const r = sib.getBoundingClientRect();
      const ix = Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left));
      const iy = Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
      const small = Math.min(b.width * b.height, r.width * r.height);
      if (small > 50 && (ix * iy) / small > 0.3) {
        out.push("Prvek překrývá sousední prvek.");
        break;
      }
    }
  }
  return out;
}
function snapshotOf(el) {
  const PROPS = ["display", "position", "top", "left", "right", "bottom", "width", "height", "min-height", "max-width", "margin", "padding", "box-sizing", "flex-direction", "flex-wrap", "flex", "grid-template-columns", "grid-template-rows", "gap", "align-items", "justify-content", "text-align", "color", "background-color", "background-image", "background-size", "background-position", "background-repeat", "border", "border-radius", "box-shadow", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-transform", "opacity", "transform", "overflow", "object-fit", "object-position", "white-space", "z-index", "clip-path"];
  const copy = el.cloneNode(true);
  const src = [el, ...el.querySelectorAll("*")];
  const dst = [copy, ...copy.querySelectorAll("*")];
  const actions = new Set();
  for (let i = dst.length - 1; i >= 0; i--) {
    const d = dst[i];
    const s = src[i];
    const tag = d.tagName.toLowerCase();
    if (i > 1500 || ["script", "iframe", "object", "embed", "noscript", "template"].includes(tag)) {
      d.remove();
      continue;
    }
    if (s.getAttribute && s.getAttribute("data-action")) actions.add(s.getAttribute("data-action"));
    for (const a of Array.from(d.attributes)) if (/^on/i.test(a.name) || a.name === "srcset" || a.name === "sizes" || a.name.startsWith("data-ct")) d.removeAttribute(a.name);
    if (tag === "img" && s.currentSrc) d.setAttribute("src", s.currentSrc);
    if (tag === "a") d.setAttribute("href", "#");
    const c = cs(s);
    d.setAttribute("style", PROPS.map((p) => `${p}:${c.getPropertyValue(p)}`).join(";"));
  }
  const b = el.getBoundingClientRect();
  return { html: copy.outerHTML, width: Math.round(b.width), height: Math.round(b.height), actions: [...actions] };
}
function componentLibrary() {
  return readJSON(KEY + ":components", []);
}
function saveComponentLibrary(list) {
  try {
    localStorage.setItem(KEY + ":components", JSON.stringify(list));
    return true;
  } catch {
    ui.flashNotice("Knihovna komponent se nevešla do úložiště prohlížeče. Stáhni ji jako soubor a smaž starší komponenty.");
    return false;
  }
}
function createRequest(fields) {
  const entry = store.catalog[fields.elementId];
  const id = "req-" + String(store.meta.nextReq++).padStart(3, "0");
  commit("Nový požadavek", (ed) => {
    ed.requests.push(Object.assign({ id, type: "action", trigger: "click", page: curPage(), device: "all", scope: "page", reference: null, status: "pending", created: now(), selector: entry ? entry.selector : null, element: entry ? entry.label : null }, fields));
  });
  return id;
}

function elementPanel(key) {
  const out = [];
  const entry = store.catalog[key];
  if (!entry) return [h("p", { class: "help" }, "Prvek už v katalogu není.")];
  const page = curPage();
  const device = curDevice();
  const el = elementFor(entry);
  const added = addedOfKey(key);
  if (isAddedEntry(entry) && !added) return [h("div", { class: "row" }, h("button", { type: "button", onClick: () => ui.select(null) }, "← Seznam")), h("p", { class: "help" }, "Tenhle přidaný prvek už v konceptu není (byl odebrán nebo vrácen krokem zpět).")];
  if (el && !entry.t && !added && textUnitFor(el) === el) register(el, "text", true);
  const meta = store.edits.elements[key] || {};
  const { props: P, from } = resolveProps(key, page, device, store.edits);
  const set = (values, label) => setProps(key, values, { label, group: true });
  const setRe = (values, label) => {
    setProps(key, values, { label });
    ui.renderPanel();
  };
  const everywhere = (values, label) => {
    setProps(key, values, { label, device: "desktop" });
    ui.renderPanel();
  };
  const badge = (list) => {
    const tags = [];
    const devProps = list.filter((p) => device !== "desktop" && (from[p] === 1 || from[p] === 3));
    if (devProps.length) tags.push(h("span", { class: "tag dev", title: "Pro toto zařízení upraveno zvlášť; změny z počítače se sem už nepropíšou." }, "upraveno pro " + DEVICE_NAME[device]), h("button", { type: "button", class: "mini-reset", title: "Vrátit na verzi z počítače", onClick: () => { resetDevice(key, device, devProps); ui.renderPanel(); } }, "↺"));
    if (entry.shared && list.some((p) => from[p] === 2 || from[p] === 3)) tags.push(h("span", { class: "tag local", title: "Tahle vlastnost je upravená jen na této stránce." }, "jen zde"), h("button", { type: "button", class: "mini-reset", title: "Vrátit na společnou verzi", onClick: () => { resetToShared(key, page, groupOf(list[0])); ui.renderPanel(); } }, "↺"));
    return tags.length ? h("span", {}, tags) : null;
  };
  const isImg = el && el.tagName.toLowerCase() === "img";
  const title = entry.t && (S.mode === "text" || !entry.p) ? "T" + entry.t : entry.p ? "P" + entry.p : "T" + entry.t;
  out.push(h("div", { class: "row" }, h("button", { type: "button", onClick: () => ui.select(null) }, "← Seznam")));
  out.push(h("p", { class: "title" }, added ? (added.kind === "text" ? `Přidaný text · „${String(added.text || "").replace(/\s+/g, " ").slice(0, 60)}“` : addedLabel(added)) : entry.label));
  out.push(h("p", { class: "meta" }, `${title} · ${entry.shared ? `sdílený prvek (hlavička, menu, patička) · viděn na ${entry.pages.length} ${entry.pages.length === 1 ? "stránce" : "stránkách"}` : "patří jen stránce " + entry.pages[0]}`));
  out.push(h("p", { class: "meta" }, viewNote(device)));
  if (viewState !== "draft") out.push(h("div", { class: "note warn" }, "Teď prohlížíš " + (viewState === "live" ? "zveřejněnou verzi" : "předchozí verzi") + ". Upravovat jde jen koncept.", h("div", { class: "row" }, h("button", { type: "button", onClick: () => setView("draft") }, "Přepnout na koncept"))));
  if (!el) out.push(h("div", { class: "note warn" }, "Tenhle prvek na aktuální stránce nebo zařízení není vidět."));
  const own = meta.overrides && meta.overrides[page];
  if (entry.shared && own && !isEmptyObj(own)) out.push(h("div", { class: "row" }, h("span", { class: "tag local" }, "upraveno jen zde"), h("button", { type: "button", onClick: () => { resetToShared(key, page); ui.renderPanel(); } }, "Vrátit na společnou verzi")));
  if (device !== "desktop" && Object.values(from).some((i) => i === 1 || i === 3)) out.push(h("div", { class: "row" }, h("span", { class: "tag dev" }, "upraveno pro " + DEVICE_NAME[device]), h("button", { type: "button", onClick: () => { resetDevice(key, device); ui.renderPanel(); } }, "Vrátit celý prvek na verzi z počítače")));
  if (S.ask && S.ask.key === key) {
    const g = S.ask.group;
    out.push(h("div", { class: "note" }, `Prvek je i na dalších stránkách. Změnu (${g}) použít:`, h("div", { class: "row" },
      h("button", { type: "button", "aria-pressed": "true", onClick: () => { chooseScope(key, g, "page"); S.ask = null; ui.renderPanel(); } }, "Jen na této stránce"),
      h("button", { type: "button", onClick: () => {
        chooseScope(key, g, "site");
        const keep = pagesKeeping(key, g);
        S.ask = null;
        S.notice = { text: keep.length ? `Změna platí na celém webu. Netýká se stránek s vlastní úpravou: ${keep.join(", ")}.` : "Změna platí na celém webu.", kind: "ok" };
        ui.renderPanel();
      } }, "Na celém webu"))));
  }
  if (P.removed) {
    const deviceOnly = device !== "desktop" && (from.removed === 1 || from.removed === 3);
    out.push(h("div", { class: "note warn" }, deviceOnly ? `Prvek je skrytý ${DEVICE_IN[device]}. Na počítači zůstává.` : "Prvek je smazaný, na stránce není vidět.", h("div", { class: "row" }, h("button", { type: "button", onClick: () => { restoreRemoved(key, deviceOnly ? device : null); ui.renderPanel(); } }, deviceOnly ? "Obnovit na tomto zařízení" : "Obnovit prvek"))));
  }
  for (const w of deviceWarnings(el)) out.push(h("div", { class: "note warn" }, w));
  const pend = store.edits.requests.filter((r) => r.elementId === key && r.status === "pending");
  if (pend.length) out.push(h("div", { class: "row" }, pend.map((r) => h("span", { class: "tag pend", title: r.description }, `${r.id} · čeká na implementaci`))));

  if (isClient()) return out.concat(clientPanel(key, entry, el, P, set, setRe));

  if (S.mode === "element" && el)
    out.push(h("div", { class: "row" },
      h("button", { type: "button", disabled: !!added || !el.parentElement || el.parentElement === el.ownerDocument.body, onClick: () => { S.childStack.push(el); ui.select(register(el.parentElement, "el").key, true); } }, "↑ Větší celek"),
      h("button", { type: "button", disabled: el.tagName.toLowerCase() === "svg" || !el.children.length, onClick: () => {
        let child = S.childStack.pop();
        if (!child || !child.isConnected || !el.contains(child)) {
          S.childStack = [];
          const r = el.getBoundingClientRect();
          child = childToward(el, S.lastPoint ? S.lastPoint.x : r.left + r.width / 2, S.lastPoint ? S.lastPoint.y : r.top + r.height / 2);
        }
        if (child) ui.select(register(child, "el").key, true);
      } }, "↓ Menší část"),
      h("button", { type: "button", disabled: !S.lastPoint, onClick: () => {
        const list = candidatesAt(S.lastPoint.doc || view.doc, S.lastPoint.x, S.lastPoint.y);
        if (list.length) ui.select(register(list[(list.indexOf(el) + 1) % list.length], "el").key);
      } }, "Další pod kurzorem")));
  if (el && !P.removed && (S.mode === "element" || S.mode === "text")) {
    const hideOnly = device !== "desktop";
    const label = hideOnly ? "Skrýt " + DEVICE_IN[device] : added && added.kind === "text" ? "Smazat text" : added && added.kind === "model" ? "Smazat 3D model" : "Smazat prvek";
    out.push(h("div", { class: "row" },
      h("button", { type: "button", class: "danger", title: hideOnly ? "Klávesa Delete skryje jen tohle zařízení" : "Klávesa Delete", onClick: () => { deleteElement(key, device); ui.renderPanel(); drawOverlay(true); } }, label)));
  }

  /* Text and font */
  if (entry.original)
    out.push(section("text", "Text a písmo", () => {
      const nodes = [];
      const segs = P.text || entry.original;
      entry.original.forEach((orig, i) => {
        const ta = h("textarea", { value: segs[i] ?? orig, "aria-label": `Text ${i + 1}` });
        ta.addEventListener("input", () => {
          const cur = (resolveProps(key, curPage(), curDevice(), store.edits).props.text || entry.original).slice();
          cur[i] = ta.value;
          set({ text: same(cur, entry.original) ? undefined : cur }, "Text");
        });
        nodes.push(h("label", { class: "l" }, entry.original.length > 1 ? `Text, část ${i + 1}` : "Text", " ", badge(["text"])), ta);
      });
      nodes.push(h("details", { class: "meta" }, h("summary", {}, "Původní text"), h("p", {}, entry.original.join(" … "))));
      nodes.push(numField("Velikost písma vůči původní", round(num(P.fontScale, 1) * 100), { min: 30, max: 300, step: 5, unit: "%", badge: badge(["fontScale"]), onInput: (n) => set({ fontScale: Math.round(n) === 100 ? undefined : clamp(n, 30, 400) / 100 }, "Velikost písma") }));
      nodes.push(colorField("Barva textu", P.color || "#342e29", (c) => set({ color: c }, "Barva textu"), { badge: badge(["color"]) }), h("button", { type: "button", class: "mini-reset", onClick: () => setRe({ color: undefined }, "Barva textu") }, "Původní barva"));
      const fonts = h("div", { class: "fonts" });
      const sample = (segs.join(" ") || "Ukázka").slice(0, 120);
      const choice = (label, family, pressed, onClick) => h("button", { type: "button", class: "font", "aria-pressed": String(pressed), onClick }, h("small", {}, label), h("span", { style: { fontFamily: `"${family}", sans-serif` } }, sample));
      fonts.append(choice(`Původní · ${prettyFamily(entry.originalFont || "")}`, entry.originalFont, !P.font, () => setRe({ font: undefined }, "Font")));
      for (const family of pageFonts()) if (family !== entry.originalFont) fonts.append(choice(prettyFamily(family), family, P.font === family, () => setRe({ font: family }, "Font")));
      nodes.push(h("details", { class: "sec", open: S.open.has("fonts") }, h("summary", { onClick: () => (S.open.has("fonts") ? S.open.delete("fonts") : S.open.add("fonts")) }, `Font: ${prettyFamily(P.font || entry.originalFont || "")}`, badge(["font"])), h("div", {}, fonts)));
      return nodes;
    }));

  /* Drawing from the library: an added drawing, or an existing element shown as a drawing */
  if (added) out.push(section("added", added.kind === "text" ? "Přidaný text" : added.kind === "model" ? "3D model" : "Přidaný prvek", () => (added.kind === "text" ? addedTextPanel(added) : added.kind === "model" ? addedModelPanel(added) : addedPanel(added)), { open: true }));
  else out.push(section("art", "Nahradit kresbou z knihovny", () => artPanel(key, P, setRe, badge), { open: P.art ? true : undefined, tag: P.art ? h("span", { class: "tag" }, "nahrazeno") : null }));

  /* Position and size */
  out.push(section("layout", "Poloha a rozměr", () => {
    const nodes = [];
    const refW = el ? round(parentWidth(el)) : P.refW;
    nodes.push(h("div", { class: "grid2" },
      numField("Posun X", P.x, { min: -1500, max: 1500, unit: "px", badge: badge(["x", "y"]), onInput: (n) => set({ x: n, refW }, "Posun") }),
      numField("Posun Y", P.y, { min: -1500, max: 1500, unit: "px", onInput: (n) => set({ y: n, refW }, "Posun") })));
    nodes.push(h("div", { class: "grid2" },
      numField("Otočení", P.rotate, { min: -180, max: 180, unit: "°", badge: badge(["rotate"]), onInput: (n) => set({ rotate: n || undefined }, "Otočení") }),
      numField("Lupa", round(num(P.scale, 1) * 100), { min: 10, max: 400, step: 5, unit: "%", badge: badge(["scale"]), onInput: (n) => set({ scale: Math.round(n) === 100 ? undefined : n / 100 }, "Lupa") })));
    nodes.push(check("Zamknout poměr stran", P.lockRatio, (v) => setRe({ lockRatio: v || undefined }, "Poměr stran")));
    const ratio = el ? el.offsetWidth / Math.max(1, el.offsetHeight) : 1;
    nodes.push(lengthField("Šířka", P.width, { current: el ? el.offsetWidth : 0, badge: badge(["width"]), onInput: (len) => {
      const v = { width: len };
      if (P.lockRatio && len.u === "px") v.height = { v: round(len.v / ratio), u: "px" };
      set(v, "Šířka");
    }, onUnit: (u) => el && setRe({ width: convertLen(el, P.width, u, "w") }, "Šířka") }));
    nodes.push(lengthField("Výška", P.height, { current: el ? el.offsetHeight : 0, badge: badge(["height"]), onInput: (len) => {
      const v = { height: len };
      if (P.lockRatio && len.u === "px") v.width = { v: round(len.v * ratio), u: "px" };
      set(v, "Výška");
    }, onUnit: (u) => el && setRe({ height: convertLen(el, P.height, u, "h") }, "Výška") }));
    nodes.push(h("details", { class: "meta" }, h("summary", {}, "Minimální a maximální rozměr (volitelné)"),
      ...[["minW", "Min. šířka", "w"], ["maxW", "Max. šířka", "w"], ["minH", "Min. výška", "h"], ["maxH", "Max. výška", "h"]].map(([p, label, axis]) =>
        h("div", {}, lengthField(label, P[p], { current: 0, units: ["px", "%", "vw", "vh"], badge: badge([p]), onInput: (len) => set({ [p]: len }, label), onUnit: (u) => el && setRe({ [p]: convertLen(el, P[p] || { v: 0, u: "px" }, u, axis) }, label) }),
          P[p] ? h("button", { type: "button", class: "mini-reset", onClick: () => setRe({ [p]: undefined }, label) }, "zrušit") : null))));
    const sized = P.width || P.height || P.maxW || P.maxH;
    const overflowing = el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && P.overflow !== "hidden" && P.overflow !== "scroll";
    if (sized) {
      if (overflowing) nodes.push(h("div", { class: "note warn" }, "Obsah se do nového rozměru nevejde. Vyber, co s ním:"));
      nodes.push(h("label", { class: "l" }, "Když se obsah nevejde"), seg([["", "Přizpůsobit"], ["shrink", "Zmenšit obsah"], ["wrap", "Zalomit"], ["hidden", "Skrýt"], ["scroll", "Posouvat"]], P.overflow || "", (v) => setRe({ overflow: v || undefined }, "Přetečení")));
    }
    nodes.push(h("div", { class: "row" },
      h("button", { type: "button", onClick: () => setRe({ width: { v: 0, u: "auto" } }, "Šířka auto") }, "Šířka auto"),
      h("button", { type: "button", onClick: () => setRe({ height: { v: 0, u: "auto" } }, "Výška auto") }, "Výška auto"),
      h("button", { type: "button", onClick: () => setRe({ width: undefined, height: undefined, minW: undefined, maxW: undefined, minH: undefined, maxH: undefined, overflow: undefined, lockRatio: undefined }, "Vrátit rozměr") }, "Vrátit rozměr"),
      h("button", { type: "button", onClick: () => setRe({ x: undefined, y: undefined, refW: undefined, rotate: undefined, scale: undefined, xPct: undefined, yPct: undefined }, "Vrátit polohu") }, "Vrátit polohu")));
    nodes.push(h("p", { class: "help" }, "Táhni prvek myší, nebo za úchyty kolem něj: boční mění šířku, horní a dolní výšku, rohy obojí. Shift zamkne poměr, Alt mění od středu, Ctrl vypne přichytávání. Šipky posunou o 1 px, Shift a šipky o 10 px."));
    return nodes;
  }, { tag: badge(["x", "y", "width", "height", "rotate", "scale"]) }));

  /* Shape */
  if (!added) out.push(section("shape", "Tvar", () => {
    const shape = P.shape && Array.isArray(P.shape.pts) ? P.shape : { mode: "clip", pts: RECT };
    const nodes = [];
    nodes.push(check("Upravit tvar (body v rozích)", S.shapeEdit, (v) => {
      S.shapeEdit = v;
      S.shapePoint = null;
      if (v && S.mode !== "element") ui.setMode("element");
      ui.renderPanel();
    }));
    nodes.push(seg([["clip", "Ořez tvaru"], ["warp", "Deformace obsahu"]], shape.mode, (m) => setRe({ shape: Object.assign({}, shape, { mode: m, pts: shape.pts }) }, "Režim tvaru")));
    if (shape.mode === "clip") nodes.push(h("p", { class: "help" }, "Mění se jen obrys, obsah zůstává rovný a čitelný (clip-path). Klikatelná je jen viditelná část."));
    else nodes.push(h("p", { class: "help" }, "Zkosí se i obsah, jako perspektiva ve Photoshopu (matrix3d ze čtyř bodů)."));
    if (shape.mode === "warp" && el && (el.matches(INTERACTIVE) || textUnitFor(el) === el)) nodes.push(h("div", { class: "note warn" }, "U textu a tlačítek může deformace zhoršit čitelnost."));
    if (shape.mode === "warp" && shape.pts.length !== 4) nodes.push(h("div", { class: "note warn" }, "Deformace funguje jen se čtyřmi body. Přebytečné body smaž, nebo použij Ořez tvaru."));
    shape.pts.forEach(([x, y], i) => {
      const upd = (axis, v) => {
        const pts = clone(shape.pts);
        pts[i][axis] = clamp(num(v), -100, 200);
        set({ shape: { mode: shape.mode, pts } }, "Tvar");
      };
      const ix = h("input", { type: "number", step: 0.5, value: x, "aria-label": `Bod ${i + 1} X` });
      const iy = h("input", { type: "number", step: 0.5, value: y, "aria-label": `Bod ${i + 1} Y` });
      ix.addEventListener("input", () => upd(0, ix.value));
      iy.addEventListener("input", () => upd(1, iy.value));
      nodes.push(h("div", { class: "grid4" }, h("label", {}, `Bod ${i + 1}`, h("span", {}, i === S.shapePoint ? "vybraný" : "")), h("label", {}, "X %", ix), h("label", {}, "Y %", iy),
        h("label", {}, " ", shape.pts.length > 3 ? h("button", { type: "button", class: "mini-reset", onClick: () => { const pts = clone(shape.pts); pts.splice(i, 1); setRe({ shape: { mode: pts.length === 4 ? shape.mode : "clip", pts } }, "Smazat bod"); } }, "smazat") : null)));
    });
    nodes.push(h("p", { class: "help" }, "Body táhni myší v režimu Prvky. Dvojklik na hranu přidá bod (vznikne mnohoúhelník), Delete vybraný bod smaže. Body se přichytávají k okrajům a čtvrtinám prvku."));
    nodes.push(h("div", { class: "row" }, h("button", { type: "button", onClick: () => { S.shapePoint = null; setRe({ shape: undefined, shapeFix: undefined }, "Obnovit obdélník"); } }, "Obnovit obdélník")));
    if (shape.mode === "clip" && !same(shape.pts, RECT)) {
      nodes.push(h("div", { class: "note" }, "Při ořezu tvaru se ztrácí stín a rámeček prvku (omezení CSS)."));
      nodes.push(check("Náhrada stínu: drop-shadow na nadřazeném prvku", P.shapeFix, (v) => setRe({ shapeFix: v || undefined }, "Náhrada stínu"), { title: "Stín se vykreslí přes filter: drop-shadow() na obalovém prvku. Platí pro celý obalový prvek." }));
      nodes.push(h("p", { class: "help" }, "Rámeček podle tvaru se v kódu doplní jako druhá vrstva se stejným tvarem; editor to zapíše do exportu."));
    }
    return nodes;
  }, { tag: badge(["shape"]) }));

  /* Appearance */
  out.push(section("look", "Vzhled", () => {
    const nodes = [];
    const bg = P.bg || { type: "none" };
    nodes.push(h("label", { class: "l" }, "Pozadí ", badge(["bg"])));
    nodes.push(seg([["none", "Původní"], ["solid", "Barva"], ["linear", "Přechod"], ["radial", "Kruhový"], ["image", "Obrázek"], ["transparent", "Průhledné"]], bg.type, (t) => {
      const next = Object.assign({ color: "#ff5100", angle: 135, stops: [{ c: "#ff5100", p: 0 }, { c: "#111111", p: 100 }], size: "cover" }, bg, { type: t });
      setRe({ bg: t === "none" ? undefined : next }, "Pozadí");
    }));
    if (bg.type === "solid") nodes.push(colorField("Barva", bg.color, (c) => set({ bg: Object.assign({}, bg, { color: c }) }, "Barva pozadí")));
    if (bg.type === "linear") nodes.push(numField("Úhel", bg.angle ?? 135, { min: 0, max: 360, unit: "°", onInput: (n) => set({ bg: Object.assign({}, bg, { angle: n }) }, "Přechod") }));
    if (bg.type === "radial") nodes.push(h("div", { class: "grid2" }, numField("Střed X", bg.cx ?? 50, { unit: "%", onInput: (n) => set({ bg: Object.assign({}, bg, { cx: n }) }, "Přechod") }), numField("Střed Y", bg.cy ?? 50, { unit: "%", onInput: (n) => set({ bg: Object.assign({}, bg, { cy: n }) }, "Přechod") })));
    if (bg.type === "linear" || bg.type === "radial") {
      (bg.stops || []).forEach((s, i) => {
        const upd = (patch) => {
          const stops = clone(bg.stops);
          Object.assign(stops[i], patch);
          set({ bg: Object.assign({}, bg, { stops }) }, "Přechod");
        };
        nodes.push(h("div", { class: "card" }, colorField(`Zastávka ${i + 1}`, s.c, (c) => upd({ c })), numField("Pozice", s.p, { unit: "%", onInput: (p) => upd({ p }) }),
          bg.stops.length > 2 ? h("button", { type: "button", class: "mini-reset", onClick: () => { const stops = clone(bg.stops); stops.splice(i, 1); setRe({ bg: Object.assign({}, bg, { stops }) }, "Přechod"); } }, "odebrat zastávku") : null));
      });
      nodes.push(h("div", { class: "row" }, h("button", { type: "button", onClick: () => setRe({ bg: Object.assign({}, bg, { stops: [...(bg.stops || []), { c: "#ffffff", p: 100 }] }) }, "Přechod") }, "+ zastávka")));
    }
    if (bg.type === "image") {
      const url = h("input", { type: "url", value: bg.image && !bg.image.startsWith("media:") ? bg.image : "", placeholder: "https://… nebo vyber z médií" });
      url.addEventListener("change", () => {
        const u = safeUrl(url.value.trim());
        if (u) setRe({ bg: Object.assign({}, bg, { image: u }) }, "Obrázek pozadí");
      });
      nodes.push(h("label", { class: "l" }, "Obrázek"), url, h("div", { class: "row" }, h("button", { type: "button", onClick: () => ui.openHub("media", { pickFor: { key, target: "bg" } }) }, "Vybrat z médií"), bg.image && bg.image.startsWith("media:") ? h("span", { class: "tag" }, "z knihovny médií") : null));
      nodes.push(seg([["cover", "Vyplnit"], ["contain", "Celý obrázek"], ["auto", "Původní velikost"]], bg.size || "cover", (v) => setRe({ bg: Object.assign({}, bg, { size: v }) }, "Obrázek pozadí")));
    }
    const glass = P.glass || {};
    nodes.push(h("h3", {}, "Frosted glass ", badge(["glass"])));
    nodes.push(check("Zapnout rozostření pozadí za prvkem", glass.on, (v) => setRe({ glass: v ? Object.assign({ blur: 14, alpha: 35, sat: 140, tint: "#ffffff" }, glass, { on: true }) : undefined }, "Frosted glass")));
    if (glass.on) {
      nodes.push(numField("Síla rozostření", glass.blur ?? 14, { min: 0, max: 60, unit: "px", onInput: (n) => set({ glass: Object.assign({}, glass, { blur: n }) }, "Frosted glass") }));
      nodes.push(numField("Neprůhlednost výplně", glass.alpha ?? 35, { unit: "%", onInput: (n) => set({ glass: Object.assign({}, glass, { alpha: n }) }, "Frosted glass") }));
      nodes.push(numField("Sytost", glass.sat ?? 140, { min: 0, max: 300, unit: "%", onInput: (n) => set({ glass: Object.assign({}, glass, { sat: n }) }, "Frosted glass") }));
      nodes.push(colorField("Barva skla", glass.tint || "#ffffff", (c) => set({ glass: Object.assign({}, glass, { tint: c }) }, "Frosted glass")));
      if (!supportsGlass()) nodes.push(h("p", { class: "help" }, "Tento prohlížeč rozostření neumí; použije se poloprůhledná barva."));
    }
    nodes.push(numField("Průhlednost prvku (viditelnost)", P.opacity ?? 100, { unit: "%", badge: badge(["opacity"]), onInput: (n) => set({ opacity: n >= 100 ? undefined : n }, "Průhlednost") }));
    const sh = P.shadow || {};
    nodes.push(h("h3", {}, "Stín ", badge(["shadow"])));
    nodes.push(check("Zapnout stín", sh.on, (v) => setRe({ shadow: v ? Object.assign({ x: 0, y: 10, blur: 30, spread: 0, color: "rgba(0,0,0,.35)", inset: false }, sh, { on: true }) : undefined }, "Stín")));
    if (sh.on) {
      const upd = (patch) => set({ shadow: Object.assign({}, sh, patch) }, "Stín");
      nodes.push(h("div", { class: "grid2" }, numField("Posun X", sh.x ?? 0, { min: -80, max: 80, unit: "px", onInput: (n) => upd({ x: n }) }), numField("Posun Y", sh.y ?? 10, { min: -80, max: 80, unit: "px", onInput: (n) => upd({ y: n }) })));
      nodes.push(h("div", { class: "grid2" }, numField("Rozostření", sh.blur ?? 30, { min: 0, max: 150, unit: "px", onInput: (n) => upd({ blur: n }) }), numField("Rozprostření", sh.spread ?? 0, { min: -50, max: 80, unit: "px", onInput: (n) => upd({ spread: n }) })));
      nodes.push(colorField("Barva stínu", sh.color || "rgba(0,0,0,.35)", (c) => upd({ color: c })));
      nodes.push(check("Vnitřní stín", sh.inset, (v) => upd({ inset: v })));
    }
    const bd = P.border || {};
    nodes.push(h("h3", {}, "Rámeček ", badge(["border"])));
    nodes.push(check("Zapnout rámeček", !!P.border, (v) => setRe({ border: v ? { w: 2, style: "solid", color: "#111111" } : undefined }, "Rámeček")));
    if (P.border) {
      nodes.push(check("Každá strana zvlášť", bd.each, (v) => setRe({ border: Object.assign({}, bd, { each: v, sides: bd.sides || { top: { w: bd.w, style: bd.style, color: bd.color }, right: { w: bd.w, style: bd.style, color: bd.color }, bottom: { w: bd.w, style: bd.style, color: bd.color }, left: { w: bd.w, style: bd.style, color: bd.color } } }) }, "Rámeček")));
      const sideUi = (s, patch, label) => [numField(label + " šířka", s.w ?? 2, { min: 0, max: 30, unit: "px", onInput: (n) => patch({ w: n }) }), seg([["solid", "plný"], ["dashed", "čárkovaný"], ["dotted", "tečkovaný"], ["double", "dvojitý"]], s.style || "solid", (v) => { patch({ style: v }); ui.renderPanel(); }), colorField(label + " barva", s.color || "#111111", (c) => patch({ color: c }))];
      if (!bd.each) nodes.push(...sideUi(bd, (p) => set({ border: Object.assign({}, bd, p) }, "Rámeček"), "Rámeček"));
      else for (const [k, label] of [["top", "Nahoře"], ["right", "Vpravo"], ["bottom", "Dole"], ["left", "Vlevo"]]) nodes.push(h("div", { class: "card" }, sideUi((bd.sides || {})[k] || {}, (p) => set({ border: Object.assign({}, bd, { sides: Object.assign({}, bd.sides, { [k]: Object.assign({}, (bd.sides || {})[k], p) }) }) }, "Rámeček"), label)));
    }
    nodes.push(selectField("Míchání barev (mix-blend-mode)", [["", "normální"], ["multiply", "násobit"], ["screen", "závoj"], ["overlay", "překrýt"], ["darken", "ztmavit"], ["lighten", "zesvětlit"], ["difference", "rozdíl"], ["exclusion", "vyloučit"], ["color-dodge", "zesvětlit barvy"], ["luminosity", "jas"]], P.blend || "", (v) => setRe({ blend: v || undefined }, "Míchání barev")));
    return nodes;
  }, { tag: badge(["bg", "glass", "opacity", "shadow", "border", "blend"]) }));

  /* Corners */
  if (!added) out.push(section("corners", "Rohy", () => {
    const r = P.radius || {};
    const nodes = [];
    const preset = r.preset || (P.radius ? "round" : "");
    nodes.push(seg([["", "Původní"], ["sharp", "Ostré"], ["round", "Zaoblené"], ["pill", "Pilulka"], ["circle", "Kruh"]], preset, (v) => setRe({ radius: !v ? undefined : v === "round" ? { tl: 12, tr: 12, br: 12, bl: 12 } : { preset: v } }, "Rohy")));
    nodes.push(h("p", { class: "help" }, "Platí pro boxy, karty i tlačítka. Počítač je hlavní verze. Na tabletu a mobilu se zaoblení změní jen tam."));
    if (preset === "round") {
      nodes.push(check("Každý roh zvlášť", r.each, (v) => setRe({ radius: Object.assign({}, r, { each: v }) }, "Rohy")));
      if (!r.each) nodes.push(numField("Poloměr", r.tl ?? 12, { min: 0, max: 200, unit: "px", badge: badge(["radius"]), onInput: (n) => set({ radius: Object.assign({}, r, { tl: n, tr: n, br: n, bl: n, tlY: r.elliptic ? n : undefined, trY: r.elliptic ? n : undefined, brY: r.elliptic ? n : undefined, blY: r.elliptic ? n : undefined }) }, "Rohy") }));
      else {
        const box = h("div", { class: "grid4" });
        for (const [k, label] of [["tl", "vlevo nahoře"], ["tr", "vpravo nahoře"], ["br", "vpravo dole"], ["bl", "vlevo dole"]]) {
          const i = h("input", { type: "number", min: 0, value: r[k] ?? 0, "aria-label": label });
          i.addEventListener("input", () => set({ radius: Object.assign({}, resolveProps(key, curPage(), curDevice(), store.edits).props.radius, { [k]: clamp(num(i.value), 0, 999) }) }, "Rohy"));
          box.append(h("label", {}, label, i));
        }
        nodes.push(box);
      }
      nodes.push(check("Eliptické rohy (vodorovná / svislá hodnota)", r.elliptic, (v) => setRe({ radius: Object.assign({}, r, { elliptic: v }) }, "Rohy")));
      if (r.elliptic) {
        const box = h("div", { class: "grid4" });
        for (const [k, label] of [["tlY", "svisle ↖"], ["trY", "svisle ↗"], ["brY", "svisle ↘"], ["blY", "svisle ↙"]]) {
          const i = h("input", { type: "number", min: 0, value: r[k] ?? r[k.slice(0, 2)] ?? 0, "aria-label": label });
          i.addEventListener("input", () => set({ radius: Object.assign({}, resolveProps(key, curPage(), curDevice(), store.edits).props.radius, { [k]: clamp(num(i.value), 0, 999) }) }, "Rohy"));
          box.append(h("label", {}, label, i));
        }
        nodes.push(box);
      }
    }
    return nodes;
  }, { tag: badge(["radius"]) }));

  /* Padding and alignment */
  if (!added) out.push(section("spacing", "Odsazení a zarovnání", () => {
    const nodes = [];
    const pad = P.padding || {};
    const c = el ? cs(el) : null;
    const cur = (k, side) => (pad[k] !== undefined ? pad[k] : c ? parseFloat(c["padding" + side]) || 0 : 0);
    const hover = (on) => {
      S.paddingHover = on;
      drawOverlay(true);
    };
    nodes.push(numField("Odsazení všude", cur("t", "Top"), { min: 0, max: 200, unit: "px", badge: badge(["padding"]), onFocus: hover, onInput: (n) => set({ padding: { t: n, r: n, b: n, l: n } }, "Odsazení") }));
    const box = h("div", { class: "grid4" });
    for (const [k, side, label] of [["t", "Top", "nahoře"], ["r", "Right", "vpravo"], ["b", "Bottom", "dole"], ["l", "Left", "vlevo"]]) {
      const i = h("input", { type: "number", min: 0, value: round(cur(k, side)), "aria-label": "Odsazení " + label });
      i.addEventListener("input", () => set({ padding: Object.assign({}, resolveProps(key, curPage(), curDevice(), store.edits).props.padding, { [k]: clamp(num(i.value), 0, 999) }) }, "Odsazení"));
      i.addEventListener("focus", () => hover(true));
      i.addEventListener("blur", () => hover(false));
      i.addEventListener("pointerenter", () => hover(true));
      i.addEventListener("pointerleave", () => hover(false));
      box.append(h("label", {}, label, i));
    }
    nodes.push(box, h("p", { class: "help" }, "Při najetí na pole se odsazení na stránce zvýrazní zeleně."));
    nodes.push(h("label", { class: "l" }, "Vodorovně ", badge(["alignH"])), seg([["", "původní"], ["left", "vlevo"], ["center", "na střed"], ["right", "vpravo"], ["justify", "do bloku"]], P.alignH || "", (v) => setRe({ alignH: v || undefined }, "Zarovnání")));
    const flexish = c && /flex|grid/.test(c.display);
    nodes.push(h("label", { class: "l" }, "Svisle ", badge(["alignV"])), seg([["", "původní"], ["top", "nahoru"], ["center", "na střed"], ["bottom", "dolů"]], P.alignV || "", (v) => setRe({ alignV: v || undefined }, "Zarovnání")));
    if (!flexish && !P.flexify) nodes.push(h("p", { class: "help" }, "Svislé zarovnání a mezera fungují u prvků s rozložením flex nebo grid."), check("Přepnout obsah na sloupec (flex)", false, (v) => setRe({ flexify: v || undefined }, "Rozložení")));
    else if (P.flexify) nodes.push(check("Obsah jako sloupec (flex)", true, (v) => setRe({ flexify: v || undefined }, "Rozložení")));
    if (flexish || P.flexify) nodes.push(numField("Mezera mezi prvky (gap)", P.gap ?? (c ? parseFloat(c.rowGap) || 0 : 0), { min: 0, max: 200, unit: "px", badge: badge(["gap"]), onInput: (n) => set({ gap: n }, "Mezera") }));
    return nodes;
  }, { tag: badge(["padding", "alignH", "alignV", "gap"]) }));

  /* Image */
  if (isImg) out.push(section("image", "Obrázek", () => imagePanel(key, el, P, set, setRe)));

  /* Click action */
  out.push(section("action", "Akce po kliknutí", () => {
    const nodes = [];
    const action = P.action || null;
    const saved = registry.actions;
    const opts = [["", "Žádná (původní chování)"], ...BASE_ACTIONS.map((a) => [a.id, a.name]), ...saved.map((a) => [a.id, "Uložená: " + a.name]), ["__new", "+ Nová akce (popsat slovy)"]];
    nodes.push(selectField("Co udělá po kliknutí", opts, S.requestDraft && S.requestDraft.kind === "action" ? "__new" : action ? action.id : "", (v) => {
      if (v === "__new") {
        S.requestDraft = { kind: "action", trigger: "click" };
        ui.renderPanel();
        return;
      }
      S.requestDraft = null;
      everywhere({ action: v ? { id: v, params: {}, replace: false } : undefined }, "Akce");
    }));
    if (el && el.matches(INTERACTIVE)) {
      const current = el.getAttribute("href") || el.getAttribute("type") || el.tagName.toLowerCase();
      nodes.push(h("p", { class: "help" }, `Prvek už má vlastní funkci (${current}).`));
      if (action) nodes.push(check("Ano, nahradit původní funkci touto akcí", action.replace, (v) => everywhere({ action: Object.assign({}, action, { replace: v }) }, "Akce")));
      if (action && !action.replace) nodes.push(h("div", { class: "note warn" }, "Akce je uložená, ale dokud nahrazení nepotvrdíš, prvek dělá dál to, co dosud."));
    }
    const param = (name, label, type = "text", placeholder = "") => {
      const i = h("input", { type, value: (action && action.params && action.params[name]) || "", placeholder });
      i.addEventListener("change", () => everywhere({ action: Object.assign({}, action, { params: Object.assign({}, action.params, { [name]: i.value.trim() }) }) }, "Akce"));
      return h("div", {}, h("label", { class: "l" }, label), i);
    };
    if (action && action.id === "link-page") {
      const pages = new Map();
      for (const p of cfg.pages || []) pages.set(p.path, p.label || p.path);
      for (const e of Object.values(store.catalog)) for (const p of e.pages) if (!pages.has(p)) pages.set(p, p);
      view.doc.querySelectorAll("a[href^='/']").forEach((a) => { const p = a.getAttribute("href").split("#")[0]; if (p && !pages.has(p)) pages.set(p, (a.textContent || p).trim().slice(0, 40) + " · " + p); });
      nodes.push(selectField("Stránka", [["", "vyber stránku"], ...[...pages.entries()].sort()], action.params && action.params.path, (v) => everywhere({ action: Object.assign({}, action, { params: { path: v } }) }, "Akce")));
    }
    if (action && action.id === "scroll-to") {
      const ids = Array.from(view.doc.querySelectorAll("[id]")).filter((x) => !isIgnored(x) && x.id.length < 60 && !/^:r|^radix-/.test(x.id)).slice(0, 200);
      nodes.push(selectField("Sekce", [["", "vyber sekci"], ...ids.map((x) => [x.id, `#${x.id} · ${(x.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40)}`])], action.params && action.params.target, (v) => everywhere({ action: Object.assign({}, action, { params: { target: v } }) }, "Akce")));
    }
    if (action && action.id === "call") nodes.push(param("phone", "Telefon", "tel", "+420 …"));
    if (action && action.id === "email") nodes.push(param("email", "E-mail", "email", "jmeno@domena.cz"));
    if (action && action.id === "open-url") {
      nodes.push(param("url", "Adresa", "url", "https://…"));
      nodes.push(check("Otevřít v novém okně", action.params && action.params.newWindow, (v) => everywhere({ action: Object.assign({}, action, { params: Object.assign({}, action.params, { newWindow: v }) }) }, "Akce")));
    }
    const savedDef = action && saved.find((a) => a.id === action.id);
    if (savedDef) {
      nodes.push(h("p", { class: "help" }, savedDef.description || "", savedDef.source ? ` · v kódu: ${savedDef.source}` : ""));
      for (const p of savedDef.params || []) nodes.push(param(p.name, p.label || p.name));
    }
    if (S.requestDraft && S.requestDraft.kind === "action") nodes.push(requestComposer(key, "action", "click", saved));
    return nodes;
  }, { tag: P.action ? h("span", { class: "tag" }, "nastaveno") : null }));

  /* Animations */
  out.push(section("anim", "Animace", () => {
    const nodes = [];
    const anims = P.animations || {};
    const still = validStill(P.still) ? P.still : null;
    const drawn = still && stillIsDraw(still);
    nodes.push(h("h3", {}, "Část, která se nehýbe"));
    nodes.push(h("p", { class: "help" }, "Nakresli tužkou po prvku tu část, která má zůstat na místě. Můžeš udělat víc tahů. Hotovo nebo Enter kresbu uloží, Esc ji zahodí. Uloženou čáru chytíš a posuneš. Zbytek se dál hýbe s animací a s náklonem myší. Posun a otočení prvku v editoru hýbe celým prvkem."));
    nodes.push(numField("Tloušťka čáry", S.stillDraw ? S.stillBrush : drawn ? stillBrushOf(still) : S.stillBrush, { min: 1, max: 28, step: 0.5, unit: "%", onInput: (n) => {
      S.stillBrush = n;
      if (!S.stillDraw && drawn) setProp(key, "still", Object.assign({}, still, { brush: n }), { label: "Tloušťka nehybné části", group: true });
      else drawOverlay(true);
    } }));
    nodes.push(h("div", { class: "row" },
      h("button", { type: "button", "aria-pressed": String(!!S.stillDraw), disabled: !el, onClick: () => interact.toggleStillDraw(drawn) }, S.stillDraw ? "Hotovo" : drawn ? "Dokreslit" : "Nakreslit"),
      S.stillDraw ? h("button", { type: "button", onClick: () => { interact.cancelStillDraw(); ui.renderPanel(); drawOverlay(true); } }, "Zrušit") : null,
      !S.stillDraw && still ? h("button", { type: "button", onClick: () => interact.clearStill(key) }, "Zrušit označení") : null,
      !S.stillDraw && drawn ? h("button", { type: "button", onClick: () => interact.toggleStillDraw(false) }, "Nakreslit znovu") : null));
    if (drawn && !S.stillDraw) nodes.push(h("p", { class: "help" }, `${still.strokes.length} ${still.strokes.length === 1 ? "tah" : still.strokes.length < 5 ? "tahy" : "tahů"}. Modrou čáru na stránce můžeš chytit a posunout.`));
    else if (still && !drawn && !S.stillDraw) nodes.push(h("p", { class: "help" }, `Starší obdélník: x ${still.x} %, y ${still.y} %, ${still.w} × ${still.h} %. Novou část nakreslíš tužkou.`));
    const all = [...BUILTIN_ANIMATIONS, ...registry.animations.filter((a) => !BUILTIN_ANIMATIONS.some((b) => b.id === a.id))];
    for (const [trigger, label] of [["enter", "Při načtení a scrollu"], ["hover", "Při najetí myší"], ["click", "Po kliknutí"]]) {
      const cur = anims[trigger] || null;
      const list = all.filter((a) => a.type === trigger || (trigger === "click" && a.type === "state"));
      const card = h("div", { class: "card" });
      card.append(selectField(label, [["", "žádná"], ...list.map((a) => [a.id, a.name + (a.builtin ? "" : " (uložená)")]), ["__new", "+ Nová (popsat slovy)"]], S.requestDraft && S.requestDraft.kind === "animation" && S.requestDraft.trigger === trigger ? "__new" : cur ? cur.id : "", (v) => {
        if (v === "__new") {
          S.requestDraft = { kind: "animation", trigger };
          ui.renderPanel();
          return;
        }
        S.requestDraft = null;
        const def = animationDef(v);
        everywhere({ animations: Object.assign({}, anims, { [trigger]: v ? { id: v, duration: def.duration, delay: def.delay || 0, easing: def.easing } : undefined }) }, "Animace");
      }));
      if (cur) {
        const def = animationDef(cur.id);
        const upd = (patch) => setProps(key, { animations: Object.assign({}, anims, { [trigger]: Object.assign({}, cur, patch) }) }, { label: "Animace", group: true, device: "desktop" });
        if (def) card.append(h("p", { class: "help" }, `Mění: ${def.changes || "—"}`));
        card.append(h("div", { class: "grid2" }, numField("Trvání", cur.duration ?? 600, { min: 50, max: 3000, step: 10, unit: "ms", onInput: (n) => upd({ duration: n }) }), numField("Zpoždění", cur.delay ?? 0, { min: 0, max: 3000, step: 10, unit: "ms", onInput: (n) => upd({ delay: n }) })));
        card.append(selectField("Křivka", EASINGS, cur.easing || "ease", (v) => upd({ easing: v })));
        card.append(h("div", { class: "row" }, h("button", { type: "button", disabled: !el, onClick: () => playAnimation(el, cur) }, "Přehrát náhled")));
      }
      if (S.requestDraft && S.requestDraft.kind === "animation" && S.requestDraft.trigger === trigger) card.append(requestComposer(key, "animation", trigger, list));
      nodes.push(card);
    }
    return nodes;
  }, { tag: (P.animations && !isEmptyObj(P.animations)) || validStill(P.still) ? h("span", { class: "tag" }, "nastaveno") : null }));

  /* Snapping, client lock, components */
  out.push(section("more", "Přichytávání, klient a komponenty", () => {
    const nodes = [];
    nodes.push(check("Přichytávání u tohoto prvku", meta.snap !== false, (v) => { setMeta(key, "snap", v ? undefined : false, "Přichytávání"); ui.renderPanel(); }, { title: "Vypnutý prvek se nepřichytává a ostatní se nepřichytávají k němu." }));
    nodes.push(h("label", { class: "l" }, "Zámek pro klienta"), seg([["", "Zamčené"], ["client", "Upravitelné klientem"]], meta.lock || "", (v) => { setMeta(key, "lock", v || undefined, "Zámek"); ui.renderPanel(); }));
    nodes.push(h("h3", {}, "Komponenta"));
    const name = h("input", { type: "text", placeholder: "Název, např. Hero s fotkou" });
    const cat = h("select", {}, CATEGORIES.map((c) => h("option", { value: c }, c)));
    nodes.push(h("div", { class: "grid2" }, h("div", {}, h("label", { class: "l" }, "Název"), name), h("div", {}, h("label", { class: "l" }, "Kategorie"), cat)));
    nodes.push(h("div", { class: "row" }, h("button", { type: "button", disabled: !el, onClick: () => {
      const snap = snapshotOf(el);
      const lib = componentLibrary();
      lib.unshift({ id: uid("cmp"), name: name.value.trim() || entry.label.slice(0, 40), category: cat.value, created: now(), site: location.host, sourcePage: page, sourceSelector: entry.selector, html: snap.html, width: snap.width, height: snap.height, actions: snap.actions, stylesheets: Array.from(document.querySelectorAll("link[rel=stylesheet]")).map((l) => l.href).slice(0, 10) });
      if (saveComponentLibrary(lib)) S.notice = { text: `Komponenta „${lib[0].name}“ je v knihovně.`, kind: "ok" };
      ui.renderPanel();
    } }, "Uložit jako komponentu"), h("button", { type: "button", onClick: () => ui.openHub("components", { insertAt: key }) }, "Vložit komponentu sem…")));
    return nodes;
  }));

  /* Comments */
  out.push(section("comments", "Komentáře", () => commentsFor(key), { tag: store.edits.comments.some((c) => c.key === key && c.status === "open") ? h("span", { class: "tag pend" }, "otevřené") : null }));
  out.push(h("div", { class: "row" }, h("button", { type: "button", onClick: () => { if (confirm("Vrátit všechny úpravy tohoto prvku na všech stránkách a zařízeních?")) { resetElement(key); ui.renderPanel(); } } }, "Vrátit celý prvek")));
  return out;
}

function requestComposer(key, kind, trigger, references) {
  const box = h("div", { class: "card" });
  const text = h("textarea", { placeholder: kind === "action" ? "Např. po kliknutí otevře panel s cenami pro vybraný pokoj a přidá ho do porovnávače." : "Např. karta se při najetí mírně nakloní a pod ní se objeví stín." });
  const ref = h("select", {}, h("option", { value: "" }, "bez vzoru"), references.map((r) => h("option", { value: r.id }, r.name)));
  let scope = store.catalog[key] && store.catalog[key].shared ? "page" : "page";
  let device = "all";
  const scopeSeg = h("div", {});
  const devSeg = h("div", {});
  const drawSeg = () => {
    scopeSeg.replaceChildren(seg([["page", "Jen tato stránka"], ["site", "Celý web"]], scope, (v) => { scope = v; drawSeg(); }));
    devSeg.replaceChildren(seg([["all", "Všechna zařízení"], [curDevice(), "Jen " + DEVICE_NAME[curDevice()]]], device, (v) => { device = v; drawSeg(); }));
  };
  drawSeg();
  box.append(h("label", { class: "l" }, "Popiš slovy, co má prvek dělat"), text, h("label", { class: "l" }, "Vzor (podobná existující " + (kind === "action" ? "akce" : "animace") + ")"), ref, h("label", { class: "l" }, "Rozsah"), scopeSeg, devSeg,
    h("div", { class: "row" },
      h("button", { type: "button", onClick: () => {
        if (!text.value.trim()) return ui.flashNotice("Napiš, co má prvek dělat.");
        const id = createRequest({ type: kind, trigger, elementId: key, description: text.value.trim().slice(0, 4000), reference: ref.value || null, scope, device });
        S.requestDraft = null;
        S.notice = { text: `Požadavek ${id} je uložený. Prvek se zatím chová jako dosud; agent ho zapíše podle exportu.`, kind: "ok" };
        ui.renderPanel();
      } }, "Uložit požadavek"),
      h("button", { type: "button", onClick: () => { S.requestDraft = null; ui.renderPanel(); } }, "Zrušit")));
  return box;
}

function imagePanel(key, el, P, set, setRe) {
  const nodes = [];
  const img = P.img || {};
  const file = h("input", { type: "file", accept: "image/*", hidden: true });
  const cat = img.category || (el.getBoundingClientRect().width >= 900 ? "hero" : el.getBoundingClientRect().width >= 360 ? "gallery" : "thumb");
  file.addEventListener("change", () => file.files[0] && ui.dropImage(file.files[0], el, cat));
  nodes.push(file, h("div", { class: "row" }, h("button", { type: "button", onClick: () => file.click() }, "Nahradit obrázek…"), h("button", { type: "button", onClick: () => ui.openHub("media", { pickFor: { key, target: "img" } }) }, "Vybrat z médií"), img.media ? h("button", { type: "button", onClick: () => setRe({ img: Object.assign({}, img, { media: undefined }) }, "Původní obrázek") }, "Původní obrázek") : null));
  nodes.push(h("p", { class: "help" }, "Obrázek můžeš i přetáhnout přímo na stránku. Převede se do WebP, zmenší podle typu a originál zůstane v knihovně."));
  nodes.push(selectField("Typ obrázku (limit velikosti)", Object.entries(media.LIMIT_NAME), cat, (v) => {
    set({ img: Object.assign({}, img, { category: v }) }, "Typ obrázku");
    if (img.media) media.recrop(img.media, (media.meta(img.media) || {}).crop || null, v);
  }));
  const alt = h("input", { type: "text", value: img.alt ?? el.getAttribute("alt") ?? "", placeholder: "Co je na obrázku (povinné)" });
  alt.addEventListener("input", () => set({ img: Object.assign({}, resolveProps(key, curPage(), curDevice(), store.edits).props.img, { alt: alt.value }) }, "Alt text"));
  nodes.push(h("label", { class: "l" }, "Alternativní text (alt)"), alt);
  if (!(img.alt ?? el.getAttribute("alt") ?? "").trim()) nodes.push(h("div", { class: "note warn" }, "Chybí alt text. Bez něj obrázek nevidí čtečky obrazovky ani vyhledávače."));
  if (img.media) {
    const m = media.meta(img.media);
    if (m) nodes.push(h("p", { class: "meta" }, `${m.name} · ${m.width} × ${m.height} px · ${round(m.bytes / 1024, 0)} kB WebP (originál ${round(m.originalBytes / 1024, 0)} kB)`));
    nodes.push(h("h3", {}, "Ořez a ohnisko"));
    const ratioSeg = h("div", {});
    const holder = h("div", {});
    const RATIOS = [["free", "volně"], ["1", "1:1"], ["1.3333", "4:3"], ["1.7778", "16:9"], ["0.75", "3:4"]];
    const st = (S.crop && S.crop.key === key) ? S.crop : (S.crop = { key, ratio: "free", crop: (m && m.crop) || { x: 0, y: 0, w: 1, h: 1 }, focal: img.focal || { x: 50, y: 50 } });
    const drawRatio = () => ratioSeg.replaceChildren(seg(RATIOS, st.ratio, (v) => { st.ratio = v; if (v !== "free") fitRatio(); drawRatio(); drawBox(); }));
    let natural = { w: 1, h: 1 };
    const fitRatio = () => {
      const r = Number(st.ratio);
      const imgRatio = natural.w / natural.h;
      let w = st.crop.w;
      let hh = (w * imgRatio) / r;
      if (hh > 1) {
        hh = 1;
        w = (r / imgRatio) * hh;
      }
      st.crop = { x: clamp(st.crop.x, 0, 1 - w), y: clamp(st.crop.y, 0, 1 - hh), w, h: hh };
    };
    const boxEl = h("div", { class: "cropbox" });
    const pic = h("img", { alt: "" });
    const cropEl = h("div", { class: "crop" }, h("i", {}));
    const focalEl = h("div", { class: "focal" });
    boxEl.append(pic, cropEl, focalEl);
    const drawBox = () => {
      Object.assign(cropEl.style, { left: st.crop.x * 100 + "%", top: st.crop.y * 100 + "%", width: st.crop.w * 100 + "%", height: st.crop.h * 100 + "%" });
      Object.assign(focalEl.style, { left: st.crop.x * 100 + (st.focal.x / 100) * st.crop.w * 100 + "%", top: st.crop.y * 100 + (st.focal.y / 100) * st.crop.h * 100 + "%" });
    };
    media.originalUrl(img.media).then((u) => {
      if (!u) return;
      pic.src = u;
      pic.onload = () => {
        natural = { w: pic.naturalWidth, h: pic.naturalHeight };
        drawBox();
      };
    });
    cropEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const r = boxEl.getBoundingClientRect();
      const resize = e.target.tagName === "I";
      const start = Object.assign({}, st.crop);
      const sx = e.clientX;
      const sy = e.clientY;
      const move = (ev) => {
        const dx = (ev.clientX - sx) / r.width;
        const dy = (ev.clientY - sy) / r.height;
        if (resize) {
          let w = clamp(start.w + dx, 0.05, 1 - start.x);
          let hh = clamp(start.h + dy, 0.05, 1 - start.y);
          if (st.ratio !== "free") hh = clamp((w * (natural.w / natural.h)) / Number(st.ratio), 0.05, 1 - start.y);
          st.crop = Object.assign({}, start, { w, h: hh });
        } else st.crop = Object.assign({}, start, { x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) });
        drawBox();
      };
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    });
    boxEl.addEventListener("dblclick", (e) => {
      const r = boxEl.getBoundingClientRect();
      const fx = ((e.clientX - r.left) / r.width - st.crop.x) / st.crop.w;
      const fy = ((e.clientY - r.top) / r.height - st.crop.y) / st.crop.h;
      st.focal = { x: round(clamp(fx, 0, 1) * 100, 0), y: round(clamp(fy, 0, 1) * 100, 0) };
      drawBox();
    });
    holder.append(boxEl);
    drawRatio();
    nodes.push(ratioSeg, holder, h("p", { class: "help" }, "Táhni rámeček, roh mění velikost. Dvojklik nastaví ohnisko (co má zůstat vidět při ořezu na mobilu)."),
      h("div", { class: "row" }, h("button", { type: "button", onClick: async () => {
        await media.recrop(img.media, st.crop, cat);
        setRe({ img: Object.assign({}, img, { focal: st.focal }) }, "Ořez obrázku");
        S.notice = { text: "Ořez je použitý. Originál zůstává v knihovně, ořez jde kdykoli změnit.", kind: "ok" };
        ui.renderPanel();
      } }, "Použít ořez a ohnisko")));
  }
  return nodes;
}

function openLibraryFor(ctx, color) {
  if (color) S.artColor = color;
  ui.openHub("library", ctx);
}
function artPanel(key, P, setRe, badge) {
  const nodes = [];
  const art = P.art;
  if (!art) {
    nodes.push(h("p", { class: "help" }, "Prvek se na stránce zobrazí jako kresba z knihovny, na stejném místě a ve stejné velikosti. Původní obsah se skryje; jde kdykoli vrátit."));
    nodes.push(h("div", { class: "row" }, h("button", { type: "button", onClick: () => openLibraryFor({ replaceKey: key }) }, "Vybrat kresbu…")));
    return nodes;
  }
  nodes.push(artPreview(art, "místo původního prvku"));
  nodes.push(h("label", { class: "l" }, "Barva ", badge(["art"])), artColorPicker(art.color, (c) => setRe({ art: Object.assign({}, art, { color: c }) }, "Barva kresby")));
  nodes.push(h("div", { class: "row" },
    h("button", { type: "button", onClick: () => openLibraryFor({ replaceKey: key }, art.color) }, "Vyměnit kresbu…"),
    h("button", { type: "button", onClick: () => { clearVisible(key, "art", "Vrátit původní prvek"); ui.renderPanel(); } }, "Vrátit původní prvek")));
  nodes.push(h("p", { class: "help" }, "Kresba přebírá polohu, velikost, otočení i animace původního prvku. Větší nebo menší ji uděláš v části Poloha a rozměr (Lupa nebo úchyty)."));
  return nodes;
}
function addedDeviceNote(a, label) {
  const device = curDevice();
  if (device === "desktop" || !resolvedAdded(addedById(a.id) || a, device).removed) return null;
  return h("div", { class: "note warn" }, `${label} je skrytý ${DEVICE_IN[device]}. Na počítači zůstává.`, h("div", { class: "row" }, h("button", { type: "button", onClick: () => { writeAdded(a.id, { removed: false }, "Obnovit na tomto zařízení"); ui.renderPanel(); } }, "Obnovit na tomto zařízení")));
}
function addedModelPanel(a) {
  const nodes = [];
  const hidden = addedDeviceNote(a, "3D model");
  if (hidden) return [hidden];
  const liveNow = () => resolvedAdded(addedById(a.id) || a, curDevice());
  const current = () => liveNow().model || {};
  const setRot = (patch, label) => {
    const live = liveNow();
    if (Array.isArray(live.stops) && live.stops.length > 1) {
      const id = live.activeStop || live.stops[0].id;
      const stops = live.stops.map((s) => s.id === id ? Object.assign({}, s, patch) : Object.assign({}, s));
      const first = stops[0];
      writeAdded(a.id, { stops, activeStop: id, model: Object.assign({}, live.model, { rx: first.rx, ry: first.ry, rz: first.rz }) }, label, { group: true });
      return;
    }
    writeAdded(a.id, { model: Object.assign({}, current(), patch) }, label, { group: true });
  };
  const deg = (rad) => Math.round(num(rad) * 180 / Math.PI);
  const stopNow = models.listStops(liveNow());
  const m = stopNow.length > 1 && !stopNow[0].implicit ? (stopNow.find((s) => s.id === liveNow().activeStop) || stopNow[0]) : current();
  nodes.push(h("p", { class: "help" }, "Táhni přímo modelem pro plné 3D otočení. Shift otáčí kolem osy. Lišta modelu ho posouvá, roh ⤡ mění velikost jen té zastávky. Počítač je hlavní verze; úprava na tabletu nebo mobilu platí jen tam."));
  const stops = models.listStops(liveNow());
  const many = stops.length > 1 && !stops[0].implicit;
  nodes.push(h("h3", {}, "Zastávky animace"));
  nodes.push(h("p", { class: "help" }, "Každá pozice je místo, kde se model při scrollu zastaví. Pořadí v animaci je podle polohy na stránce, shora dolů. Přidat vloží zastávku, odebrat ji zruší, roh ⤡ mění jen její velikost. Když je editor zapnutý, jsou vidět všechny. Po skrytí editoru mezi nimi model přejíždí."));
  if (many) {
    const ordered = stops.map((s, n) => ({ s, n })).sort((p, q) => num(p.s.y) - num(q.s.y) || num(p.s.x) - num(q.s.x) || p.n - q.n);
    nodes.push(h("div", { class: "row" }, ...ordered.map((row, i) => h("button", { type: "button", "aria-pressed": String(liveNow().activeStop === row.s.id), onClick: () => models.selectStop(a.id, row.s.id) }, "Pozice " + (i + 1)))));
  }
  nodes.push(h("div", { class: "row" },
    h("button", { type: "button", onClick: () => models.addStop(a.id) }, "Přidat pozici"),
    h("button", { type: "button", disabled: !many, onClick: () => models.removeStop(a.id) }, "Odebrat pozici")));
  nodes.push(numField("Otočení Y", deg(m.ry), { min: -360, max: 360, unit: "°", onInput: (n) => setRot({ ry: n * Math.PI / 180 }, "3D otočení") }));
  nodes.push(numField("Otočení X", deg(m.rx), { min: -360, max: 360, unit: "°", onInput: (n) => setRot({ rx: n * Math.PI / 180 }, "3D otočení") }));
  nodes.push(numField("Otočení Z", deg(m.rz), { min: -360, max: 360, unit: "°", onInput: (n) => setRot({ rz: n * Math.PI / 180 }, "3D otočení") }));
  nodes.push(h("div", { class: "row" },
    h("button", { type: "button", onClick: () => { setRot({ rx: 0, ry: 0, rz: 0 }, "Vrátit otočení"); ui.renderPanel(); } }, "Vrátit otočení"),
    h("button", { type: "button", onClick: () => duplicateAdded(a.id) }, "Duplikovat")));
  const file = current();
  nodes.push(h("p", { class: "meta" }, "Soubor: " + (file.name || file.id || "")));
  return nodes;
}
function addedPanel(a) {
  const hidden = addedDeviceNote(a, "Prvek");
  if (hidden) return [hidden];
  const nodes = [];
  nodes.push(artPreview(a.art, a.page === "*" ? "na všech stránkách" : "jen na stránce " + a.page));
  nodes.push(h("label", { class: "l" }, "Barva"), artColorPicker(a.art.color, (c) => {
    updateAdded(a.id, { art: Object.assign({}, a.art, { color: c }) }, "Barva kresby");
    ui.renderPanel();
  }));
  nodes.push(h("div", { class: "row" },
    h("button", { type: "button", onClick: () => openLibraryFor({ addedId: a.id }, a.art.color) }, "Vyměnit kresbu…"),
    h("button", { type: "button", onClick: () => duplicateAdded(a.id) }, "Duplikovat")));
  nodes.push(h("p", { class: "meta" }, `Připnuto k: ${a.anchorLabel || a.anchor}`));
  nodes.push(h("p", { class: "help" }, "Prvek se posouvá se sekcí, ke které je připnutý. Táhni ho myší, úchyty mění velikost, tečka nad rámečkem ho otáčí. Na počítači ho Delete smaže, na tabletu a mobilu jen skryje."));
  return nodes;
}
function addedTextPanel(a) {
  const hidden = addedDeviceNote(a, "Text");
  if (hidden) return [hidden];
  const nodes = [];
  const t = a.style || {};
  // Reads the stored style each time, so quick slider moves never write back an older value.
  const style = (patch, label, rerender = true) => {
    const cur = addedById(a.id) || a;
    updateAdded(a.id, { style: Object.assign({}, cur.style, patch) }, label, { group: !rerender });
    if (rerender) ui.renderPanel();
  };
  const ta = h("textarea", { value: a.text ?? "", "aria-label": "Přidaný text" });
  ta.addEventListener("input", () => updateAdded(a.id, { text: ta.value.slice(0, 5000) }, "Text", { group: true }));
  nodes.push(h("label", { class: "l" }, "Text"), ta);
  nodes.push(numField("Velikost písma", t.size ?? 24, { min: 8, max: 200, unit: "px", onInput: (n) => style({ size: clamp(n, 6, 400) }, "Velikost textu", false) }));
  nodes.push(h("label", { class: "l" }, "Barva"), artColorPicker(t.color, (c) => style({ color: c }, "Barva textu")));
  nodes.push(seg([["400", "Normální"], ["700", "Tučné"]], String(t.weight ?? 400), (v) => style({ weight: Number(v) }, "Tučnost textu"), { label: "Tučnost" }));
  nodes.push(seg([["left", "Vlevo"], ["center", "Na střed"], ["right", "Vpravo"]], t.align || "left", (v) => style({ align: v }, "Zarovnání textu"), { label: "Zarovnání" }));
  nodes.push(check("Kurzíva", t.italic, (v) => style({ italic: v || undefined }, "Kurzíva")), check("Velká písmena", t.upper, (v) => style({ upper: v || undefined }, "Velká písmena")));
  nodes.push(numField("Řádkování", round(num(t.lineHeight, 1.2) * 100), { min: 70, max: 250, step: 5, unit: "%", onInput: (n) => style({ lineHeight: n / 100 }, "Řádkování", false) }));
  nodes.push(numField("Nejvyšší šířka řádku", a.w ?? 480, { min: 40, max: 1600, unit: "px", onInput: (n) => updateAdded(a.id, { w: Math.round(n) }, "Šířka textu", { group: true }) }));
  const fonts = h("div", { class: "fonts" });
  const sample = (a.text || "Ukázka").slice(0, 80);
  for (const family of pageFonts()) fonts.append(h("button", { type: "button", class: "font", "aria-pressed": String(t.font === family), onClick: () => style({ font: family }, "Písmo textu") }, h("small", {}, prettyFamily(family)), h("span", { style: { fontFamily: `"${family}", sans-serif` } }, sample)));
  nodes.push(h("details", { class: "sec", open: S.open.has("addedFonts") }, h("summary", { onClick: () => (S.open.has("addedFonts") ? S.open.delete("addedFonts") : S.open.add("addedFonts")) }, `Písmo: ${prettyFamily(t.font || "")}`), h("div", {}, fonts)));
  nodes.push(h("div", { class: "row" }, h("button", { type: "button", onClick: () => duplicateAdded(a.id) }, "Duplikovat")));
  nodes.push(h("p", { class: "meta" }, `Připnuto k: ${a.anchorLabel || a.anchor}${a.page === "*" ? " · na všech stránkách" : ""}`));
  nodes.push(h("p", { class: "help" }, "Text se posouvá se sekcí, ke které je připnutý. Táhni ho myší, úchyty mění šířku, tečka nad rámečkem ho otáčí. Na užší obrazovce se úměrně zmenší."));
  return nodes;
}

function clientPanel(key, entry, el, P, set, setRe) {
  const nodes = [h("p", { class: "help" }, "Tady můžeš změnit text nebo obrázek. Úpravy se uloží jako koncept, na živý web je pošle až majitel webu.")];
  if (entry.original) {
    const segs = P.text || entry.original;
    entry.original.forEach((orig, i) => {
      const ta = h("textarea", { value: segs[i] ?? orig });
      ta.addEventListener("input", () => {
        const cur = (resolveProps(key, curPage(), curDevice(), store.edits).props.text || entry.original).slice();
        cur[i] = ta.value;
        set({ text: same(cur, entry.original) ? undefined : cur }, "Text");
      });
      nodes.push(h("label", { class: "l" }, "Text"), ta);
    });
  }
  if (el && el.tagName.toLowerCase() === "img") nodes.push(...imagePanel(key, el, P, set, setRe).slice(0, 5));
  nodes.push(h("h3", {}, "Komentář pro majitele webu"), ...commentsFor(key));
  return nodes;
}

function commentsFor(key) {
  const nodes = [];
  const list = store.edits.comments.filter((c) => c.key === key);
  const author = isClient() ? "Klient" : "Já";
  for (const c of list) nodes.push(commentThread(c, author));
  const text = h("textarea", { placeholder: "Poznámka k tomuto prvku…" });
  nodes.push(text, h("div", { class: "row" }, h("button", { type: "button", onClick: () => {
    if (!text.value.trim()) return;
    const entry = store.catalog[key];
    const id = "k-" + String(store.meta.nextCom++).padStart(3, "0");
    commit("Komentář", (ed) => ed.comments.push({ id, key, selector: entry ? entry.selector : null, element: entry ? entry.label : null, page: curPage(), device: curDevice(), author, text: text.value.trim().slice(0, 4000), status: "open", created: now(), replies: [] }));
    ui.renderPanel();
  } }, "Přidat komentář")));
  return nodes;
}
function commentThread(c, author) {
  const reply = h("input", { type: "text", placeholder: "Odpovědět…" });
  const upd = (fn, label) => commit(label, (ed) => {
    const x = ed.comments.find((y) => y.id === c.id);
    if (x) fn(x, ed);
  });
  return h("div", { class: "thread" },
    h("small", {}, `${c.id} · ${c.author} · ${new Date(c.created).toLocaleString("cs-CZ")} · ${c.page} · `, h("span", { class: "tag" + (c.status === "open" ? " pend" : "") }, c.status === "open" ? "otevřený" : "vyřešený")),
    h("p", {}, c.text),
    ...(c.replies || []).map((r) => h("p", {}, h("small", {}, r.author + ": "), r.text)),
    h("div", { class: "row" }, reply,
      h("button", { type: "button", onClick: () => { if (reply.value.trim()) { upd((x) => x.replies.push({ author, text: reply.value.trim().slice(0, 4000), created: now() }), "Odpověď"); ui.renderPanel(); } } }, "Odpovědět"),
      h("button", { type: "button", onClick: () => { upd((x) => { x.status = x.status === "open" ? "resolved" : "open"; }, "Stav komentáře"); ui.renderPanel(); } }, c.status === "open" ? "Vyřešeno" : "Znovu otevřít"),
      !isClient() ? h("button", { type: "button", onClick: () => { if (confirm("Smazat komentář?")) { upd((x, ed) => { ed.comments = ed.comments.filter((y) => y.id !== c.id); }, "Smazat komentář"); ui.renderPanel(); } } }, "Smazat") : null));
}
function pageFonts() {
  const set = new Set([...cfg.extraFonts, ...sitePack.fonts()]);
  document.fonts.forEach((f) => set.add(cleanFamily(f.family)));
  const els = view.doc.body.getElementsByTagName("*");
  for (let i = 0; i < els.length && i < 3000; i++) if (!isIgnored(els[i])) set.add(cleanFamily(cs(els[i]).fontFamily.split(",")[0]));
  return Array.from(set).filter((f) => f && !GENERIC_FONTS.has(f.toLowerCase()) && !/fallback/i.test(f)).sort((a, b) => prettyFamily(a).localeCompare(prettyFamily(b)));
}

// ---- 11-panel-hub.js ----
/* ---------- panel views that are not about one element ---------- */

const HUBS = [["list", "Seznam"], ["library", "Knihovna"], ["versions", "Koncept"], ["devices", "Zařízení"], ["tokens", "Tokeny"], ["media", "Média"], ["components", "Komponenty"], ["requests", "Požadavky"], ["comments", "Komentáře"], ["settings", "Nastavení"]];
let hubCtx = {};

function downloadFile(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.setAttribute("data-creatool-ignore", "");
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function pickJson(onData) {
  const input = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  input.addEventListener("change", async () => {
    try {
      onData(JSON.parse(await input.files[0].text()));
    } catch {
      ui.flashNotice("Soubor se nepodařilo načíst.");
    }
    input.remove();
  });
  shadow.append(input);
  input.click();
}

function hubPanel() {
  const out = [];
  if (isClient()) {
    out.push(h("p", { class: "help" }, "Režim klienta (ukázka). Klikni v liště na Upravit a pak na text nebo obrázek, který ti majitel webu odemkl. Úpravy se ukládají jako koncept."));
    out.push(h("h3", {}, "Co můžeš upravit na této stránce"));
    const unlocked = Object.entries(store.edits.elements).filter(([k, e]) => e.lock === "client" && store.catalog[k] && onPageOf(store.catalog[k], curPage()));
    out.push(unlocked.length ? h("div", { class: "list" }, unlocked.map(([k]) => h("button", { type: "button", class: "item", onClick: () => ui.reveal(k) }, h("b", {}, "·"), h("span", {}, store.catalog[k].label)))) : h("p", { class: "help" }, "Na téhle stránce zatím nic odemčeného není."));
    out.push(h("h3", {}, "Komentáře"), ...allComments());
    return out;
  }
  out.push(h("div", { class: "tabs", role: "tablist" }, HUBS.map(([id, label]) => h("button", { type: "button", role: "tab", "aria-selected": String(S.hub === id), onClick: () => { S.hub = id; hubCtx = {}; ui.renderPanel(); } }, label))));
  const views = { list: listView, library: libraryView, versions: versionsView, devices: devicesView, tokens: tokensView, media: mediaView, components: componentsView, requests: requestsView, comments: allComments, settings: settingsView };
  out.push(...(views[S.hub] || listView)());
  return out;
}

function pageStem(value) {
  let s = String(value || "").split("@")[0].split("?")[0];
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  if (s === "" || s === "/" || s === "/index" || s === "/index.html") return "/";
  return s.replace(/\.html$/, "");
}
function listView() {
  const out = [];
  const page = curPage();
  const modelsHere = (store.edits.added || []).filter((a) => a.kind === "model" && addedOnPage(a, page)).length + poseChanges().filter((row) => pageStem(row.page) === pageStem(page)).length;
  out.push(h("div", { class: "tabs" },
    h("button", { type: "button", "aria-selected": String(S.tab === "texts"), onClick: () => { S.tab = "texts"; ui.renderPanel(); } }, `Texty (${Object.values(store.catalog).filter((e) => e.t && onPageOf(e, page)).length})`),
    h("button", { type: "button", "aria-selected": String(S.tab === "elements"), onClick: () => { S.tab = "elements"; ui.renderPanel(); } }, `Prvky (${Object.values(store.catalog).filter((e) => e.p && onPageOf(e, page)).length})`),
    h("button", { type: "button", "aria-selected": String(S.tab === "models"), onClick: () => { S.tab = "models"; ui.renderPanel(); } }, `3D prvky (${modelsHere})`),
    h("button", { type: "button", "aria-pressed": String(S.changesOnly), onClick: () => { S.changesOnly = !S.changesOnly; ui.renderPanel(); } }, "Jen změny")));
  const search = h("input", { type: "search", value: S.query, placeholder: S.tab === "texts" ? "Číslo nebo text, např. 12" : S.tab === "models" ? "Zastávka nebo 3D model" : "Číslo nebo prvek, např. P3", "aria-label": "Hledat" });
  const wrap = h("div", {});
  const draw = () => {
    wrap.replaceChildren();
    if (S.tab === "models") {
      const q = S.query.trim().toLocaleLowerCase();
      const rows = [];
      for (const a of store.edits.added || []) {
        if (a.kind !== "model") continue;
        const label = addedLabel(a);
        if (q && !`${label} ${a.page || ""}`.toLocaleLowerCase().includes(q)) continue;
        rows.push({ here: addedOnPage(a, page), page: a.page, label, open: () => selectAdded(a.id) });
      }
      for (const row of poseChanges()) {
        const label = row.label || "3D zastávka";
        if (q && !`${label} ${row.page || ""}`.toLocaleLowerCase().includes(q)) continue;
        rows.push({ here: pageStem(row.page) === pageStem(page), page: row.page, label, open: () => { if (S.mode !== "model") ui.setMode("model"); } });
      }
      const item = (row) => h("button", { type: "button", class: "item", onClick: row.open }, h("b", {}, "3D"), h("span", {}, row.label, h("small", {}, row.page || "")));
      const here = rows.filter((row) => row.here);
      const other = rows.filter((row) => !row.here);
      if (here.length) wrap.append(h("h3", {}, "Na této stránce"), h("div", { class: "list" }, here.slice(0, 400).map(item)));
      if (other.length) wrap.append(h("h3", {}, "Na jiných stránkách"), h("div", { class: "list" }, other.slice(0, 400).map(item)));
      if (!rows.length) wrap.append(h("p", { class: "help" }, S.query ? "Nic neodpovídá." : "Zatím žádný 3D prvek. Posunutá zastávka zubu a přidaný model se ukážou tady."));
      return;
    }
    const q = S.query.trim().toLocaleLowerCase().replace(/^[tp](?=\d)/, "");
    const isText = S.tab === "texts";
    const textOf = (e) => (isText ? (resolveProps(e.key, e.shared ? page : e.pages[0], "desktop", store.edits).props.text || e.original || []).join(" ") : e.label);
    const all = Object.values(store.catalog)
      .filter((e) => (isText ? e.t : e.p))
      .filter((e) => !S.changesOnly || hasEdits(e.key))
      .filter((e) => !q || String(isText ? e.t : e.p) === q || `${textOf(e)} ${e.label}`.toLocaleLowerCase().includes(q))
      .sort((a, b) => (isText ? a.t - b.t : a.p - b.p));
    const row = (e) => {
      const meta = store.edits.elements[e.key];
      const devs = meta ? DEVICES.filter((d) => [meta.shared, ...Object.values(meta.overrides || {})].some((hh) => hh && !isEmptyObj(hh[d]))) : [];
      return h("button", { type: "button", class: "item", onClick: () => ui.reveal(e.key) }, h("b", {}, (isText ? "T" : "P") + (isText ? e.t : e.p)),
        h("span", {}, textOf(e).slice(0, 140) || "(prázdné)", h("small", {}, (hasEdits(e.key) ? "Upraveno · " + devs.map((d) => DEVICE_NAME[d]).join(", ") : "Beze změny") + " · " + (e.shared ? "sdílený" : e.pages[0]) + (meta && meta.lock === "client" ? " · pro klienta" : ""))));
    };
    const here = all.filter((e) => onPageOf(e, page));
    const other = all.filter((e) => !onPageOf(e, page));
    if (here.length) wrap.append(h("h3", {}, "Na této stránce"), h("div", { class: "list" }, here.slice(0, 400).map(row)));
    if (other.length) wrap.append(h("h3", {}, "Na jiných stránkách"), h("div", { class: "list" }, other.slice(0, 400).map(row)));
    if (!all.length) wrap.append(h("p", { class: "help" }, S.query || S.changesOnly ? "Nic neodpovídá." : "Zatím nic. Zapni Zobrazit čísla nebo vyber prvek na stránce."));
  };
  search.addEventListener("input", () => {
    S.query = search.value;
    draw();
  });
  const device = curDevice();
  const removed = Object.keys(store.edits.elements).filter((k) => store.catalog[k] && onPageOf(store.catalog[k], page) && resolveProps(k, page, device, store.edits).props.removed && !addedOfKey(k));
  const hiddenAdded = (store.edits.added || []).filter((a) => addedOnPage(a, page) && resolvedAdded(a, device).removed);
  if (removed.length || hiddenAdded.length) out.push(h("h3", {}, `Skryté na tomto zobrazení (${removed.length + hiddenAdded.length})`), h("div", { class: "list" }, removed.map((k) => {
    const e = store.catalog[k];
    const from = resolveProps(k, page, device, store.edits).from;
    const deviceOnly = device !== "desktop" && (from.removed === 1 || from.removed === 3);
    return h("div", { class: "row" }, h("span", { style: { flex: "1", fontSize: "12px" } }, (e.p ? "P" + e.p : e.t ? "T" + e.t : "") + " · " + e.label.slice(0, 80)), h("button", { type: "button", onClick: () => { restoreRemoved(k, deviceOnly ? device : null); ui.renderPanel(); } }, "Obnovit"));
  }).concat(hiddenAdded.map((a) => h("div", { class: "row" }, h("span", { style: { flex: "1", fontSize: "12px" } }, addedLabel(a)), h("button", { type: "button", onClick: () => { writeAdded(a.id, { removed: false }, "Obnovit na tomto zařízení"); ui.renderPanel(); } }, "Obnovit"))))));
  out.push(search, h("p", { class: "meta" }, "Texty, prvky i 3D prvky mají vlastní záložku a počítadlo. Čísla se ukážou na stránce. Každá stránka má vlastní prvky; hlavička, menu a patička jsou sdílené s volbou „jen tato stránka / celý web“."), wrap);
  draw();
  if (changeCount()) out.push(h("div", { class: "row" }, h("button", { type: "button", onClick: () => {
    if (!confirm("Smazat všechny úpravy v konceptu? Udělej to až po zapsání změn do kódu. Jde to vrátit tlačítkem Zpět.")) return;
    rememberToothDraft();
    replaceEdits("Vymazat všechny úpravy", Object.assign(emptyEdits(), { tokens: {}, comments: store.edits.comments, toothDraft: null }));
    if (window.CreatoolTooth && typeof window.CreatoolTooth.restore === "function") window.CreatoolTooth.restore(null);
    S.sel = null;
    ui.renderPanel();
  } }, "Vymazat všechny úpravy")));
  return out;
}

function startTextPlacing() {
  S.placing = { kind: "text" };
  S.placeAt = null;
  if (S.mode !== "element") ui.setMode("element");
  ui.syncModeClasses();
  ui.renderBar();
  ui.renderPanel();
}
/** Drawings to add (pick, then click on the page) or to put in place of the element the panel came from. */
function libraryView() {
  const out = [];
  const ctx = hubCtx || {};
  const target = ctx.replaceKey ? store.catalog[ctx.replaceKey] : null;
  const addedTarget = ctx.addedId ? addedById(ctx.addedId) : null;
  if (!S.artColor || !safeColor(S.artColor)) S.artColor = (artColors()[0] || DEFAULT_ART_COLORS[0]).value;
  if (target) out.push(h("div", { class: "note" }, `Vyber kresbu, která nahradí ${target.p ? "prvek P" + target.p : "prvek"}: ${target.label.slice(0, 70)}`, h("div", { class: "row" }, h("button", { type: "button", onClick: () => ui.select(ctx.replaceKey) }, "Zpět na prvek"))));
  else if (addedTarget) out.push(h("div", { class: "note" }, "Vyber novou kresbu pro přidaný prvek. Poloha, velikost a animace zůstanou.", h("div", { class: "row" }, h("button", { type: "button", onClick: () => selectAdded(addedTarget.id) }, "Zpět na prvek"))));
  else {
    out.push(h("div", { class: "row" }, h("button", { type: "button", "aria-pressed": String(!!S.placing && S.placing.kind === "text"), onClick: () => startTextPlacing() }, "Aa · Přidat text")));
    out.push(h("p", { class: "help" }, "Text, kresbu nebo 3D model přidáš kliknutím na stránku. U kresby nejdřív vyber barvu a kresbu; se Shiftem přidáš víc kusů za sebou, Esc skončí."));
  }
  out.push(modelShelf());
  if (S.placing) {
    const placeName = S.placing.kind === "text" ? "text" : S.placing.kind === "model" ? (S.placing.model && S.placing.model.name) || "3D model" : S.placing.art && S.placing.art.name;
    out.push(h("div", { class: "note ok" }, `Klikni na stránku, kam přidat „${placeName}“.`, h("div", { class: "row" }, h("button", { type: "button", onClick: () => { S.placing = null; S.placeAt = null; ui.syncModeClasses(); ui.renderPanel(); drawOverlay(true); } }, "Zrušit přidávání"))));
  }
  out.push(h("label", { class: "l" }, "Barva kresby"), artColorPicker(S.artColor, (c) => {
    S.artColor = c;
    if (S.placing && S.placing.art) S.placing.art.color = c;
    ui.renderPanel();
  }));
  const fontInput = h("input", { type: "file", accept: ".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf", hidden: true });
  fontInput.addEventListener("change", async () => {
    const file = fontInput.files && fontInput.files[0];
    fontInput.value = "";
    if (!file) return;
    try {
      const family = await sitePack.uploadFont(file);
      S.notice = { text: "Písmo „" + family + "“ je v galerii. U textu ho vybereš v části Font.", kind: "ok" };
      ui.renderPanel();
    } catch (err) {
      ui.flashNotice(err.message || "Písmo se nepodařilo přidat.");
    }
  });
  const drawInput = h("input", { type: "file", accept: ".svg,image/svg+xml", hidden: true });
  drawInput.addEventListener("change", async () => {
    const file = drawInput.files && drawInput.files[0];
    drawInput.value = "";
    if (!file) return;
    try {
      await ownArt.add(file);
      S.notice = { text: "Kresba je v galerii Moje kresby.", kind: "ok" };
      ui.renderPanel();
    } catch (err) {
      ui.flashNotice(err.message || "Kresbu se nepodařilo přidat.");
    }
  });
  const families = pageFonts();
  out.push(h("h3", {}, "Písma"),
    h("p", { class: "help" }, "Písma této stránky a ta, která zůstala v galerii z dřívějších stránek v tomto prohlížeči. Nahrané písmo tu zůstane."),
    h("div", { class: "row" }, h("button", { type: "button", onClick: () => fontInput.click() }, "Nahrát písmo"), fontInput),
    h("div", { class: "fonts" }, ...families.map((family) => h("div", { class: "font", style: { fontFamily: `"${family}", sans-serif` } }, prettyFamily(family)))));
  out.push(h("h3", {}, "Moje kresby"),
    h("p", { class: "help" }, "Vlastní kresby SVG. Zůstanou v galerii i na dalších stránkách v tomto prohlížeči."),
    h("div", { class: "row" }, h("button", { type: "button", onClick: () => drawInput.click() }, "Nahrát kresbu"), drawInput));
  if (library.status === "off") {
    out.push(h("div", { class: "note warn" }, "Knihovna kreseb není nastavená. Vlastní kresby nahoře fungují i bez ní. Sadu kreseb zapne CreatoolConfig: libraryUrl: \"/cesta/prvky.json\"."));
    return out;
  }
  if (library.status === "idle" || library.status === "loading") {
    library.load();
    out.push(h("p", { class: "help" }, "Načítám knihovnu…"));
    return out;
  }
  if (library.status === "error") {
    out.push(h("div", { class: "note warn" }, library.error, h("div", { class: "row" }, h("button", { type: "button", onClick: () => library.load() }, "Zkusit znovu"))));
    return out;
  }
  const fold = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const packs = [...library.packs];
  const mine = ownArt.pack();
  if (mine && !packs.some((p) => p.id === mine.id)) packs.unshift(mine);
  if (S.lib.pack && !packs.some((p) => p.id === S.lib.pack)) S.lib.pack = "";
  const search = h("input", { type: "search", value: S.lib.query, placeholder: "Hledat, např. šipka, srdce, kroužek", "aria-label": "Hledat v knihovně" });
  const packSeg = h("div", {});
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Skupina" });
  const grid = h("div", { class: "lib" });
  const count = h("p", { class: "meta" });
  const pick = (item) => {
    const art = artOf(item, S.artColor);
    if (target) {
      setProps(ctx.replaceKey, { art }, { label: "Nahradit kresbou", device: "desktop" });
      S.open.add("art");
      hubCtx = {};
      ui.select(ctx.replaceKey);
      return;
    }
    if (addedTarget) {
      updateAdded(addedTarget.id, { art }, "Vyměnit kresbu");
      hubCtx = {};
      selectAdded(addedTarget.id);
      return;
    }
    S.placing = { art };
    S.placeAt = null;
    if (S.mode !== "element") ui.setMode("element");
    ui.syncModeClasses();
    ui.renderPanel();
  };
  const draw = () => {
    const inPack = S.lib.pack ? packs.filter((p) => p.id === S.lib.pack) : packs;
    const pool = inPack.flatMap((p) => p.items);
    const groups = [...new Set(pool.map((i) => i.group))];
    if (S.lib.group && !groups.includes(S.lib.group)) S.lib.group = "";
    const q = fold(S.lib.query.trim());
    const items = pool.filter((i) => (!S.lib.group || i.group === S.lib.group) && (!q || fold(`${i.name} ${i.group} ${i.id}`).includes(q)));
    packSeg.replaceChildren(packs.length > 1 ? seg([["", "Všechny sady"], ...packs.map((p) => [p.id, p.name])], S.lib.pack, (v) => { S.lib.pack = v; draw(); }, { label: "Sada" }) : "");
    chips.replaceChildren(...[["", "Vše"], ...groups.map((g) => [g, g])].map(([v, label]) => h("button", { type: "button", "aria-pressed": String(S.lib.group === v), onClick: () => { S.lib.group = v; draw(); } }, label)));
    const vars = tileVars(S.artColor);
    grid.replaceChildren(...items.map((item) => {
      const url = safeUrl(item.src);
      return withVars(h("button", { type: "button", title: item.name, "aria-pressed": String(!!S.placing && S.placing.art.id === item.id), onClick: () => pick(item) }, withVars(h("i", {}), { "--src": url ? cssUrl(url) : "none" }), h("small", {}, item.name)), vars);
    }));
    count.textContent = items.length ? `${items.length} ${items.length === 1 ? "kresba" : items.length < 5 ? "kresby" : "kreseb"}` : "Nic neodpovídá.";
  };
  search.addEventListener("input", () => {
    S.lib.query = search.value;
    if (S.lib.query.trim()) S.lib.group = "";
    draw();
  });
  out.push(search, packSeg, chips, count, grid);
  draw();
  return out;
}

function versionsView() {
  const out = [];
  const live = liveVersion();
  const backup = backupVersion();
  const diff = diffKeys(live ? live.edits : emptyEdits(), store.edits);
  const elements = diff.filter((k) => !k.startsWith("#")).length;
  out.push(h("div", { class: "note" + (diff.length ? "" : " ok") }, diff.length ? `Koncept se liší od zveřejněné verze v ${elements} ${elements === 1 ? "prvku" : elements >= 2 && elements <= 4 ? "prvcích" : "prvcích"}${diff.some((k) => k.startsWith("#")) ? " a v " + diff.filter((k) => k.startsWith("#")).map((k) => ({ "#tokens": "tokenech", "#requests": "požadavcích", "#comments": "komentářích", "#components": "komponentách", "#added": "přidaných prvcích" }[k])).join(", ") : ""}.` : "Koncept je stejný jako zveřejněná verze."));
  out.push(h("label", { class: "l" }, "Co je vidět na stránce"), seg([["draft", "Koncept"], ["live", "Zveřejněná verze"], ["backup", "Předchozí verze"]].filter(([v]) => v !== "backup" || backup), viewState, (v) => { setView(v); ui.renderPanel(); }));
  out.push(h("p", { class: "help" }, "Všechny úpravy se dělají v konceptu. Zveřejnit uloží koncept jako zveřejněnou verzi, předtím automaticky zazálohuje tu dosavadní (držíme vždy jen jednu zálohu, verzi o jedna zpět) a stáhne export pro agenta. Skutečný web se změní, až agent export zapíše do kódu."));
  out.push(h("div", { class: "row" }, h("button", { type: "button", onClick: () => importInput.click() }, "Načíst export")));
  out.push(h("div", { class: "row" },
    h("button", { type: "button", "aria-pressed": "true", disabled: !diff.length, onClick: async () => {
      if (!confirm("Zveřejnit koncept? Dosavadní zveřejněná verze se uloží jako záloha a stáhne se export pro agenta.")) return;
      const res = publishDraft();
      if (!res.ok) {
        S.notice = { text: res.message, kind: "warn" };
        return ui.renderPanel();
      }
      await exporter.download();
      S.notice = { text: "Zveřejněno. Záloha předchozí verze je uložená a export stažený. Předej ho agentovi.", kind: "ok" };
      ui.renderPanel();
    } }, "Zveřejnit"),
    h("button", { type: "button", disabled: !diff.length, onClick: () => {
      if (!confirm("Zahodit koncept a vrátit se ke zveřejněné verzi? Jde to vrátit tlačítkem Zpět.")) return;
      replaceEdits("Zahodit koncept", live ? live.edits : emptyEdits());
      ui.renderPanel();
    } }, "Zahodit koncept")));
  out.push(h("h3", {}, "Po zapsání do kódu"), h("p", { class: "help" }, "Až agent export zapíše do kódu, je nový kód výchozí verzí. Tlačítkem níže vyčistíš koncept i zveřejněnou vrstvu, včetně 3D póz zubu, aby se úpravy na webu neuplatnily dvakrát. Otevřené komentáře zůstanou, krok jde vrátit tlačítkem Zpět. Kód před změnami je v gitu v commitu „backup: pred-zmenami“."),
    h("div", { class: "row" }, h("button", { type: "button", onClick: () => {
      if (!confirm("Jsou změny zapsané v kódu a nasazené? Koncept se vyčistí, včetně 3D póz (zůstanou otevřené komentáře).")) return;
      try {
        localStorage.setItem(LIVE_KEY, JSON.stringify({ edits: emptyEdits(), at: now() }));
      } catch {}
      rememberToothDraft();
      replaceEdits("Zapsáno do kódu", Object.assign(emptyEdits(), { comments: store.edits.comments.filter((c) => c.status === "open"), toothDraft: null }));
      if (window.CreatoolTooth && typeof window.CreatoolTooth.restore === "function") window.CreatoolTooth.restore(null);
      S.sel = null;
      S.notice = { text: "Koncept je čistý. Další úpravy se počítají od nového kódu.", kind: "ok" };
      ui.renderPanel();
    } }, "Změny jsou zapsané v kódu")));
  out.push(h("h3", {}, "Předchozí verze (záloha)"));
  if (!backup) out.push(h("p", { class: "help" }, "Zatím žádná. Vznikne při prvním zveřejnění."));
  else {
    out.push(h("p", { class: "meta" }, `Nahrazena ${new Date(backup.replacedAt).toLocaleString("cs-CZ")} · změnilo se ${backup.changed ? backup.changed.length : 0} položek.`));
    out.push(h("div", { class: "row" },
      h("button", { type: "button", onClick: () => { setView("backup"); ui.renderPanel(); } }, "Zobrazit jako náhled"),
      h("button", { type: "button", onClick: () => {
        if (!confirm("Obnovit předchozí verzi do konceptu? Současný koncept jde vrátit tlačítkem Zpět.")) return;
        replaceEdits("Obnovit předchozí verzi", backup.edits);
        setView("draft");
        ui.renderPanel();
      } }, "Obnovit tuto verzi")));
    out.push(h("p", { class: "help" }, "Náhled předchozí verze je jen designový: odkazy, formuláře ani akce v něm nefungují. Stránky a zařízení přepínáš v horním pruhu a v liště."));
  }
  out.push(h("h3", {}, "Historie"), h("p", { class: "meta" }, `Kroků zpět: ${hist.past.length} · vpřed: ${hist.future.length}. Historie přežije obnovení stránky. Ctrl+Z zpět, Ctrl+Shift+Z vpřed.`));
  return out;
}

function devicesView() {
  const out = [];
  const d = curDevice();
  out.push(h("p", { class: "help" }, viewNote(d) + " Šířky a pozice se na menších zařízeních přepočítají poměrně, text na mobilu neklesne pod 16 px."));
  for (const dev of ["tablet", "mobile"]) {
    const list = deviceSpecific(dev);
    out.push(h("h3", {}, `Vlastní úpravy pro ${DEVICE_NAME[dev]} (${list.length})`));
    if (!list.length) out.push(h("p", { class: "help" }, "Žádné, vše dědí z počítače."));
    for (const item of list) {
      const e = store.catalog[item.key];
      out.push(h("div", { class: "card" }, h("b", {}, e ? (e.p ? "P" + e.p : "T" + e.t) + " " : ""), e ? e.label : item.key, h("p", { class: "meta" }, `${item.where} · ${item.props.join(", ")}`),
        h("div", { class: "row" }, h("button", { type: "button", onClick: () => ui.reveal(item.key) }, "Ukázat"), h("button", { type: "button", onClick: () => { resetDevice(item.key, dev); ui.renderPanel(); } }, "Vrátit na verzi z počítače"))));
    }
  }
  out.push(h("h3", {}, "Kontrola aktuální stránky"));
  const box = h("div", {});
  out.push(h("div", { class: "row" }, h("button", { type: "button", onClick: () => {
    const found = [];
    const els = new Set();
    view.doc.querySelectorAll("[data-ct]").forEach((x) => els.add(x));
    if (curDevice() !== "desktop") view.doc.querySelectorAll(INTERACTIVE).forEach((x) => els.add(x));
    for (const x of els) {
      if (isIgnored(x) || !x.getBoundingClientRect().width) continue;
      for (const w of deviceWarnings(x)) found.push({ x, w });
      if (found.length > 60) break;
    }
    box.replaceChildren(...(found.length ? found.map(({ x, w }) => h("div", { class: "card" }, h("p", { class: "meta" }, labelFor(x)), h("p", {}, w), h("div", { class: "row" }, h("button", { type: "button", onClick: () => { const e = register(x, "el"); ui.reveal(e.key); } }, "Ukázat a upravit")))) : [h("div", { class: "note ok" }, "Bez varování: nic nepřetéká, dotykové cíle mají aspoň 44 × 44 px.")]));
  } }, "Zkontrolovat přetečení, překryvy a dotykové cíle")), box);
  return out;
}

function tokensView() {
  const out = [];
  const tokens = allTokens(store.edits);
  out.push(h("p", { class: "help" }, "Pojmenované hodnoty, na které prvky odkazují. Změna tokenu se propíše všude, kde je použitý (i v CSS webu, pokud jde o jeho vlastní proměnnou). Tokeny se exportují jako CSS proměnné na :root. Napojení knihovny stylů z předchozích webů přijde později."));
  const types = [["color", "Barvy"], ["font", "Písma"], ["size", "Velikosti písma"], ["space", "Rozestupy"], ["radius", "Rohy"], ["shadow", "Stíny"], ["duration", "Trvání animací"], ["other", "Ostatní"]];
  for (const [type, label] of types) {
    const list = Object.entries(tokens).filter(([, t]) => t.type === type);
    if (!list.length) continue;
    out.push(h("h3", {}, label));
    for (const [name, t] of list) {
      const own = store.edits.tokens[name];
      const value = own && own.value !== undefined ? own.value : t.value;
      const upd = (v) => {
        commit("Token " + name, (ed) => {
          ed.tokens[name] = Object.assign({ type }, ed.tokens[name], { value: v });
        }, { group: true });
        S.notice = { text: `Token ${name} použitý u ${tokenUsage(name)} upravených prvků${t.site ? " a všude v CSS webu" : ""}.`, kind: "ok" };
      };
      const input = type === "color" ? colorField(name, value, upd) : (() => {
        const i = h("input", { type: "text", value: value || "" });
        i.addEventListener("change", () => upd(i.value.trim()));
        return h("div", { class: "color" }, h("span", { class: "lbl" }, name), i);
      })();
      out.push(h("div", { class: "card" }, input, h("p", { class: "meta" }, `${t.var} · ${t.site ? "z CSS webu" : "vlastní"} · u ${tokenUsage(name)} upravených prvků${own ? " · změněno" : ""}`),
        own ? h("div", { class: "row" }, h("button", { type: "button", onClick: () => { commit("Token " + name, (ed) => { delete ed.tokens[name]; }); ui.renderPanel(); } }, t.site ? "Vrátit hodnotu z webu" : "Smazat token")) : null));
    }
  }
  const name = h("input", { type: "text", placeholder: "nazev-tokenu" });
  const type = h("select", {}, types.map(([v, l]) => h("option", { value: v }, l)));
  const value = h("input", { type: "text", placeholder: "#ff5100, 16px, 300ms…" });
  out.push(h("h3", {}, "Nový token"), h("div", { class: "grid2" }, h("div", {}, h("label", { class: "l" }, "Název"), name), h("div", {}, h("label", { class: "l" }, "Typ"), type)), h("label", { class: "l" }, "Hodnota"), value,
    h("div", { class: "row" }, h("button", { type: "button", onClick: () => {
      const n = name.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
      if (!n || !value.value.trim()) return ui.flashNotice("Vyplň název a hodnotu.");
      commit("Nový token", (ed) => { ed.tokens[n] = { type: type.value, value: value.value.trim() }; });
      ui.renderPanel();
    } }, "Přidat token")));
  const css = exporter.tokensCss(store.edits);
  out.push(h("h3", {}, "Sada tokenů"), h("div", { class: "row" },
    h("button", { type: "button", onClick: () => downloadFile(`tokeny-${location.host}.json`, JSON.stringify({ app: APP, kind: "tokens", tokens: store.edits.tokens, css }, null, 2)) }, "Uložit sadu do souboru"),
    h("button", { type: "button", onClick: () => pickJson((data) => {
      if (!data || data.kind !== "tokens" || typeof data.tokens !== "object") return ui.flashNotice("Tohle není sada tokenů.");
      commit("Načíst tokeny", (ed) => { Object.assign(ed.tokens, data.tokens); });
      ui.renderPanel();
    }) }, "Použít sadu ze souboru")), h("textarea", { readOnly: true, value: css || ":root{} /* zatím beze změn */" }));
  return out;
}

function mediaView() {
  const out = [];
  const pickFor = hubCtx.pickFor;
  if (pickFor) out.push(h("div", { class: "note" }, "Vyber obrázek pro prvek. ", h("button", { type: "button", onClick: () => { hubCtx = {}; ui.renderPanel(); } }, "Zrušit výběr")));
  const file = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
  const cat = h("select", {}, Object.entries(media.LIMIT_NAME).map(([v, l]) => h("option", { value: v, selected: v === "gallery" }, l)));
  file.addEventListener("change", async () => {
    for (const f of Array.from(file.files)) {
      try {
        await media.add(f, { category: cat.value });
      } catch (e) {
        ui.flashNotice(e.message);
      }
    }
    ui.renderPanel();
  });
  const search = h("input", { type: "search", placeholder: "Hledat podle názvu", value: hubCtx.q || "" });
  const grid = h("div", { class: "thumbs" });
  const detail = h("div", {});
  out.push(file, h("div", { class: "grid2" }, h("div", {}, h("label", { class: "l" }, "Typ nových obrázků"), cat), h("div", {}, h("label", { class: "l" }, " "), h("button", { type: "button", onClick: () => file.click() }, "Nahrát obrázky…"))),
    h("p", { class: "help" }, "Obrázky se převedou do WebP, zmenší podle typu (1920 / 1600 / 600 px) a zkomprimují. Originál zůstává, ořez jde kdykoli změnit. Obrázek můžeš i přetáhnout přímo na stránku."), search, grid, detail);
  const draw = (list) => {
    const q = (hubCtx.q || "").toLowerCase();
    grid.replaceChildren(...list.filter((m) => !q || m.name.toLowerCase().includes(q)).map((m) => {
      const used = media.usage(m.id);
      return h("figure", { onClick: () => {
        if (pickFor) {
          const P = resolveProps(pickFor.key, curPage(), curDevice(), store.edits).props;
          if (pickFor.target === "img") setProps(pickFor.key, { img: Object.assign({}, P.img, { media: m.id }) }, { label: "Obrázek z knihovny" });
          else setProps(pickFor.key, { bg: Object.assign({ type: "image", size: "cover" }, P.bg, { type: "image", image: "media:" + m.id }) }, { label: "Pozadí z knihovny" });
          hubCtx = {};
          ui.select(pickFor.key);
          return;
        }
        detail.replaceChildren(h("div", { class: "card" }, h("b", {}, m.name), h("p", { class: "meta" }, `${m.width} × ${m.height} px · ${round(m.bytes / 1024, 0)} kB WebP · originál ${round(m.originalBytes / 1024, 0)} kB · ${media.LIMIT_NAME[m.category] || ""}`),
          h("p", { class: "meta" }, used.length ? "Použito: " + used.map((u) => u.label.slice(0, 40) + " (" + u.pages.join(", ") + ")").join("; ") : "Zatím nikde nepoužito."),
          h("div", { class: "row" }, used.map((u) => h("button", { type: "button", onClick: () => ui.reveal(u.key) }, "Ukázat použití")),
            h("button", { type: "button", onClick: async () => {
              if (used.length && !confirm(`Obrázek se pořád používá u ${used.length} prvků. Opravdu smazat? Ty prvky pak ukážou původní obrázek.`)) return;
              if (!used.length && !confirm("Smazat obrázek z knihovny?")) return;
              await media.remove(m.id);
              ui.renderPanel();
            } }, "Smazat"))));
      } }, h("img", { src: media.urlFor(m.id) || "", alt: m.name }), h("figcaption", {}, (used.length ? "● " : "") + m.name));
    }));
    if (!list.length) grid.replaceChildren(h("p", { class: "help" }, "Knihovna je prázdná."));
  };
  let cache = [];
  search.addEventListener("input", () => {
    hubCtx.q = search.value;
    draw(cache);
  });
  media.list().then((list) => {
    cache = list;
    draw(list);
  }).catch(() => grid.replaceChildren(h("p", { class: "help" }, "Knihovnu médií se nepodařilo otevřít (IndexedDB).")));
  return out;
}

function componentsView() {
  const out = [];
  const lib = componentLibrary();
  const insertAt = hubCtx.insertAt || S.sel;
  const target = insertAt && store.catalog[insertAt];
  out.push(h("p", { class: "help" }, "Sekce a skupiny prvků uložené jako komponenty. Vložená komponenta je samostatná kopie; propojená se upravuje všude najednou. Skutečné vložení do kódu udělá agent podle exportu (do té doby je na stránce vyznačené místo). Akce a animace uvnitř se převezmou z registru, chybějící vzniknou jako požadavky."));
  out.push(target ? h("p", { class: "meta" }, "Vkládá se vedle: " + target.label) : h("div", { class: "note warn" }, "Pro vložení nejdřív vyber na stránce prvek (sekci), vedle kterého má komponenta být."));
  const cats = ["", ...new Set(lib.map((c) => c.category))];
  out.push(seg(cats.map((c) => [c, c || "Vše"]), hubCtx.cat || "", (v) => { hubCtx.cat = v; ui.renderPanel(); }));
  for (const c of lib.filter((x) => !hubCtx.cat || x.category === hubCtx.cat)) {
    const frame = h("iframe", { sandbox: "", title: c.name, loading: "lazy" });
    frame.srcdoc = `<!doctype html><html><head>${(c.stylesheets || []).map((u) => `<link rel="stylesheet" href="${String(u).replace(/"/g, "")}">`).join("")}<style>body{margin:0;background:#fff}</style></head><body>${c.html}</body></html>`;
    let linked = false;
    let scope = "page";
    out.push(h("div", { class: "card" }, h("div", { class: "comp-prev" }, frame), h("b", {}, c.name), h("p", { class: "meta" }, `${c.category} · ${c.site || ""}${c.sourcePage || ""} · ${c.width} × ${c.height} px`),
      check("Propojená komponenta (úprava se propíše všude, kde je použitá)", false, (v) => { linked = v; }),
      seg([["page", "Jen tato stránka"], ["site", "Celý web"]], scope, (v) => { scope = v; }),
      h("div", { class: "row" },
        ...["before", "after"].map((pos) => h("button", { type: "button", disabled: !target, onClick: () => {
          const missing = (c.actions || []).filter((a) => !registry.actions.some((r) => r.id === a) && !BASE_ACTIONS.some((b) => b.id === a));
          const id = createRequest({ type: "component", trigger: "insert", elementId: insertAt, componentId: c.id, componentName: c.name, component: { id: c.id, name: c.name, category: c.category, html: c.html, width: c.width, height: c.height, sourceSite: c.site, sourcePage: c.sourcePage }, position: pos, linked, scope, description: `Vložit komponentu „${c.name}“ ${pos === "before" ? "před" : "za"} vybraný prvek${linked ? " jako propojenou" : ""}. Převzít globální tokeny tohoto webu.` });
          for (const a of missing) createRequest({ type: "action", trigger: "click", elementId: insertAt, description: `Komponenta „${c.name}“ používá akci „${a}“, která na tomto webu v registru chybí. Doplnit ji.`, reference: a, scope });
          S.notice = { text: `Požadavek ${id} na vložení komponenty je uložený${missing.length ? ` (a ${missing.length} chybějících akcí)` : ""}.`, kind: "ok" };
          hubCtx = {};
          ui.renderPanel();
        } }, pos === "before" ? "Vložit před" : "Vložit za")),
        h("button", { type: "button", onClick: () => { if (confirm("Smazat komponentu z knihovny?")) { saveComponentLibrary(componentLibrary().filter((x) => x.id !== c.id)); ui.renderPanel(); } } }, "Smazat"))));
  }
  if (!lib.length) out.push(h("p", { class: "help" }, "Knihovna je prázdná. Vyber sekci a v panelu prvku dej Uložit jako komponentu."));
  out.push(h("h3", {}, "Knihovna napříč projekty"), h("div", { class: "row" },
    h("button", { type: "button", disabled: !lib.length, onClick: () => downloadFile("creatool-komponenty.json", JSON.stringify({ app: APP, kind: "components", components: lib }, null, 2)) }, "Uložit knihovnu do souboru"),
    h("button", { type: "button", onClick: () => pickJson((data) => {
      if (!data || data.kind !== "components" || !Array.isArray(data.components)) return ui.flashNotice("Tohle není knihovna komponent.");
      const cur = componentLibrary();
      const ids = new Set(cur.map((c) => c.id));
      saveComponentLibrary([...data.components.filter((c) => c && c.id && !ids.has(c.id) && typeof c.html === "string"), ...cur]);
      ui.renderPanel();
    }) }, "Přidat knihovnu ze souboru")), h("p", { class: "help" }, "Knihovnu ulož do souboru a na jiném webu ji přidej; komponenty tam převezmou jeho tokeny."));
  return out;
}

function requestsView() {
  const out = [];
  const list = store.edits.requests;
  out.push(h("p", { class: "help" }, "Funkce, animace a komponenty popsané slovy. Prvek se zatím chová jako dosud; agent je podle exportu přidá do registru, napojí a změní stav na hotovo."));
  const pending = list.filter((r) => r.status !== "done");
  if (!list.length) out.push(h("p", { class: "help" }, "Žádné požadavky."));
  for (const r of [...pending, ...list.filter((r) => r.status === "done")]) {
    const e = store.catalog[r.elementId];
    const text = h("textarea", { value: r.description || "" });
    text.addEventListener("change", () => commit("Upravit požadavek", (ed) => { const x = ed.requests.find((y) => y.id === r.id); if (x) x.description = text.value.trim().slice(0, 4000); }));
    out.push(h("div", { class: "card" }, h("b", {}, r.id), " ", h("span", { class: "tag" + (r.status === "pending" ? " pend" : "") }, r.status === "pending" ? "čeká na implementaci" : "hotovo"),
      h("p", { class: "meta" }, `${{ action: "akce", animation: "animace", component: "komponenta", comment: "komentář" }[r.type] || r.type} · ${r.trigger} · ${r.page} · ${r.scope === "site" ? "celý web" : "jen tato stránka"} · ${r.device === "all" ? "všechna zařízení" : DEVICE_NAME[r.device] || r.device}${r.reference ? " · vzor: " + r.reference : ""}`),
      h("p", { class: "meta" }, e ? e.label : r.element || r.elementId), text,
      h("div", { class: "row" }, e ? h("button", { type: "button", onClick: () => ui.reveal(r.elementId) }, "Ukázat prvek") : null,
        h("button", { type: "button", onClick: () => { if (confirm("Smazat požadavek?")) { commit("Smazat požadavek", (ed) => { ed.requests = ed.requests.filter((y) => y.id !== r.id); }); ui.renderPanel(); } } }, "Smazat"))));
  }
  return out;
}

function allComments() {
  const out = [];
  const pages = [...new Set(store.edits.comments.map((c) => c.page))];
  const f = S.commentFilter;
  out.push(h("div", { class: "grid2" },
    selectField("Stránka", [["", "všechny"], ...pages.map((p) => [p, p])], f.page, (v) => { f.page = v; ui.renderPanel(); }),
    selectField("Stav", [["", "všechny"], ["open", "otevřené"], ["resolved", "vyřešené"]], f.status, (v) => { f.status = v; ui.renderPanel(); })));
  out.push(h("p", { class: "help" }, "Komentář připneš v režimu Komentáře kliknutím na prvek. Drží se prvku, ne souřadnic. Otevřené komentáře jdou do exportu jako požadavky."));
  const list = store.edits.comments.filter((c) => (!f.page || c.page === f.page) && (!f.status || c.status === f.status));
  if (!list.length) out.push(h("p", { class: "help" }, "Žádné komentáře."));
  for (const c of list) out.push(h("div", { class: "card" }, h("p", { class: "meta" }, c.element || c.key), commentThread(c, isClient() ? "Klient" : "Já"), h("div", { class: "row" }, h("button", { type: "button", onClick: () => { S.open.add("comments"); ui.reveal(c.key); } }, "Ukázat prvek"))));
  return out;
}

function settingsView() {
  const out = [];
  const st = store.settings;
  const saveSettings = () => {
    persistNow();
    engine.changed();
    ui.renderPanel();
  };
  out.push(h("h3", {}, "Přichytávání"), check("Magnetické přichytávání v celém editoru", st.snap, (v) => { st.snap = v; saveSettings(); }), h("p", { class: "help" }, "Dočasně ho vypneš držením Ctrl při tažení. U jednoho prvku ho vypneš v jeho panelu."));
  out.push(check("Mřížka s přichytáváním", st.grid.on, (v) => { st.grid.on = v; saveSettings(); }));
  if (st.grid.on) out.push(numField("Velikost mřížky", st.grid.size, { min: 2, max: 100, unit: "px", onInput: (n) => { st.grid.size = clamp(Math.round(n), 2, 200); persistNow(); drawOverlay(true); } }));
  out.push(h("h3", {}, "Šířky náhledu zařízení"));
  for (const d of DEVICES) out.push(numField(DEVICE_NAME[d], st.previewWidths[d], { min: 320, max: 2560, unit: "px", onInput: (n) => { st.previewWidths[d] = clamp(Math.round(n), 280, 3840); persistNow(); } }));
  const fit = window.CreatoolFit;
  const scaleName = fit && typeof fit.layout === "function" ? "V2" : fit && typeof fit.zoom === "function" ? "V1" : "nenasazené";
  out.push(h("p", { class: "help" }, "Tlačítka 1280, 1440 a 1920 jsou v editoru vždy a ukážou tu šířku v přesných pixelech. Na tomhle webu je Měřítko " + scaleName + ". V1 nechává návštěvníkovi původní počítač 1440 px. V2 mu dá nejbližší ze tří šířek v přesné velikosti, širší okno ji nezvětší a užší ji zmenší."));
  out.push(h("div", { class: "row" }, [1280, 1440, 1920].map((w) => h("button", { type: "button", onClick: () => ui.showPc(w) }, String(w)))));
  out.push(h("h3", {}, "Klientský režim (ukázka)"), h("p", { class: "help" }, "Ukáže editor tak, jak ho uvidí klient: jen prvky se zámkem „Upravitelné klientem“, jednoduchá čeština, úpravy jdou do konceptu. Přihlašování a e-maily zatím nejsou; kód je na ně připravený."),
    h("div", { class: "row" }, h("button", { type: "button", onClick: () => { st.role = "client"; S.sel = null; ui.setMode("browse"); saveSettings(); ui.render(); } }, "Zobrazit jako klient")));
  out.push(h("h3", {}, "Klávesy"), h("p", { class: "meta" }, "Ctrl+Z zpět · Ctrl+Shift+Z vpřed · šipky 1 px · Shift+šipky 10 px · Esc zruší výběr · Delete smaže bod tvaru · Alt+Shift+R skryje editor"));
  out.push(h("h3", {}, "O nástroji"), h("p", { class: "meta" }, `Azervera CREATOOL ${VERSION} · made by lupienskim · úpravy se ukládají v tomto prohlížeči (${KEY}).`));
  return out;
}

// ---- 12-frame-export.js ----
/* ---------- device preview: the page in a frame at the real device width ---------- */

let stage = null;
function layoutStage() {
  if (!stage) return;
  const w = store.settings.previewWidths[stage.device];
  const panelW = S.panel && !S.collapsed && !S.hidden ? Math.min(440, innerWidth * 0.45) : 0;
  const availW = Math.max(200, innerWidth - panelW - 40);
  const availH = Math.max(200, innerHeight - 100);
  const s = Math.min(1, availW / w);
  Object.assign(stage.frame.style, { width: w + "px", height: availH / s + "px", transform: `scale(${s})`, left: Math.max(20, (innerWidth - panelW - w * s) / 2) + "px" });
  stage.label.textContent = `${DEVICE_NAME[stage.device]} · ${w} px${s < 1 ? ` · zmenšeno na ${Math.round(s * 100)} %` : ""}`;
  if (view.kind === "frame") view.scale = s;
}
function openStage(device, url) {
  closeStage();
  const el = h("div", { class: "stage" });
  const frame = h("iframe", { name: "creatool-frame:" + device, title: "Náhled: " + DEVICE_NAME[device] });
  const label = h("div", { class: "dev" });
  el.append(label, frame);
  uiRoot.prepend(el);
  stage = { el, frame, label, device };
  document.documentElement.classList.add("ct-device-frame");
  layoutStage();
  frame.addEventListener("load", async () => {
    if (!stage || stage.frame !== frame) return;
    let win;
    try {
      win = frame.contentWindow;
      void win.document.body;
    } catch {
      ui.flashNotice("Náhled zařízení se nepodařilo otevřít (stránka nejde vložit do rámu).");
      return;
    }
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const doc = win.document;
    // The framed page is a fresh load. Version 4 loads creatool.js only from the footer button, so the frame
    // would otherwise never get its own copy and moves on tablet and mobile would not show.
    for (let i = 0; i < 80 && doc.readyState !== "complete"; i++) await wait(100);
    if (!stage || stage.frame !== frame) return;
    if (!win.__creatoolChild) {
      const hooked = doc.querySelector("[data-creatool-src]");
      const src = (hooked && hooked.getAttribute("data-creatool-src")) || "/creatool.js";
      await new Promise((resolve) => {
        const script = doc.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => resolve();
        (doc.body || doc.documentElement).append(script);
      });
      for (let i = 0; i < 50 && !win.__creatoolChild; i++) await wait(100);
    }
    if (!stage || stage.frame !== frame) return;
    if (!win.__creatoolChild) ui.flashNotice("Stránka v náhledu nenačetla CREATOOL; úpravy se v ní nezobrazí.");
    if (view.kind === "frame" && view.doc) interact.detach(view.doc);
    view = { kind: "frame", win, doc: win.document, frame, scale: 1, device };
    layoutStage();
    interact.attach(win.document);
    ui.syncModeClasses();
    const keepFrameTooth = () => {
      try {
        const tooth = win.CreatoolTooth;
        if (!tooth || typeof tooth.snapshot !== "function") return;
        const snap = tooth.snapshot();
        if (snap != null) {
          store.edits.toothDraft = snap;
          persistNow();
        }
      } catch {}
    };
    win.addEventListener("creatool:extras", keepFrameTooth);
    win.addEventListener("pagehide", keepFrameTooth);
    const child = childApi();
    if (child) {
      child.setMode(S.mode);
      if (child.setMotion) child.setMotion(store.settings.motion === "scroll" ? "scroll" : "auto");
      child.reload(JSON.stringify(store), viewState);
    }
    setTimeout(() => registerAll(view.doc), 300);
    ui.renderPanel();
  });
  frame.src = url || location.href.split("#")[0];
}
function closeStage() {
  if (view.kind === "frame" && view.doc) interact.detach(view.doc);
  view = topView;
  if (stage) stage.el.remove();
  stage = null;
  document.documentElement.classList.remove("ct-device-frame");
}

/* ---------- export and import ---------- */

const exporter = (() => {
  function tokensCss(edits) {
    const t = allTokens(edits);
    const lines = Object.entries(edits.tokens || {}).filter(([, v]) => v && v.value !== undefined).map(([n, v]) => `  ${(t[n] && t[n].var) || "--ct-" + n}: ${v.value};`);
    return lines.length ? `:root {\n${lines.join("\n")}\n}` : "";
  }
  const lenText = (l) => (!l ? "" : l.u === "auto" ? "auto" : `${l.v}${l.u}`);
  /** One readable line per layer, so a person (or agent) sees the change without decoding the data. */
  function describe(p) {
    const parts = [];
    if (p.text) parts.push(`text: „${p.text.join(" … ")}“`);
    if (p.font) parts.push(`písmo ${p.font}`);
    if (p.fontScale) parts.push(`velikost písma ${Math.round(p.fontScale * 100)} %`);
    if (p.x || p.y) parts.push(`posun ${p.x || 0} px, ${p.y || 0} px (šířka rodiče ${p.refW || "?"} px)`);
    if (p.xPct || p.yPct) parts.push(`posun ${p.xPct || 0} %, ${p.yPct || 0} % vlastní velikosti`);
    if (p.rotate) parts.push(`otočení ${p.rotate}°`);
    if (p.scale) parts.push(`lupa ${Math.round(p.scale * 100)} %`);
    if (p.width) parts.push(`šířka ${lenText(p.width)}`);
    if (p.height) parts.push(`výška ${lenText(p.height)}`);
    for (const k of ["minW", "maxW", "minH", "maxH"]) if (p[k]) parts.push(`${k} ${lenText(p[k])}`);
    if (p.overflow) parts.push(`přetečení: ${p.overflow}`);
    if (p.shape) parts.push(`tvar ${p.shape.mode === "warp" ? "deformace (matrix3d)" : "ořez (clip-path)"}: ${p.shape.pts.map((q) => q.join("% ") + "%").join(", ")}`);
    if (p.bg) parts.push(`pozadí ${p.bg.type}${p.bg.color ? " " + p.bg.color : ""}`);
    if (p.glass && p.glass.on) parts.push(`frosted glass blur ${p.glass.blur}px`);
    if (p.opacity !== undefined) parts.push(`viditelnost ${p.opacity} %`);
    if (p.shadow && p.shadow.on) parts.push("stín");
    if (p.border) parts.push("rámeček");
    if (p.radius) parts.push(`rohy ${radiusOf(p.radius)}`);
    if (p.padding) parts.push(`odsazení ${["t", "r", "b", "l"].map((k) => (p.padding[k] ?? "–") + "").join(" ")} px`);
    if (p.alignH || p.alignV) parts.push(`zarovnání ${p.alignH || ""} ${p.alignV || ""}`.trim());
    if (p.gap !== undefined) parts.push(`mezera ${p.gap} px`);
    if (p.img) parts.push(`obrázek${p.img.media ? " " + p.img.media : ""}${p.img.alt !== undefined ? ` alt „${p.img.alt}“` : ""}`);
    if (p.art) parts.push(`nahrazeno kresbou „${p.art.name || p.art.id}“ (${p.art.src}), barva ${p.art.color}`);
    if (p.removed) parts.push("SMAZÁNO (odstranit z kódu, na zařízení jen skrýt)");
    else if (p.removed === false) parts.push("znovu zobrazeno");
    if (p.action) parts.push(`akce ${p.action.id}${p.action.replace ? " (nahrazuje původní)" : ""}`);
    if (p.animations) parts.push(`animace ${Object.entries(p.animations).filter(([, a]) => a).map(([t, a]) => t + ":" + a.id).join(", ")}`);
    if (p.still && stillIsDraw(p.still)) parts.push(`nehybná část je volná kresba (${p.still.strokes.length} tahů, tloušťka ${stillBrushOf(p.still)} % kratší strany; tahle kresba se nehýbe s animací ani s náklonem, posun v editoru hýbe celým prvkem)`);
    else if (p.still && validStill(p.still)) parts.push(`nehybná část x ${p.still.x} %, y ${p.still.y} %, šířka ${p.still.w} %, výška ${p.still.h} % (tahle část se nehýbe s animací ani s náklonem; posun v editoru hýbe celým prvkem)`);
    return parts.join("; ");
  }
  async function build() {
    const edits = store.edits;
    const elements = [];
    const mediaIds = new Set();
    for (const [key, e] of Object.entries(edits.elements)) {
      const entry = store.catalog[key];
      if (!entry) continue;
      const text = JSON.stringify(e);
      for (const m of text.matchAll(/(?:media:|"media":")(img-[a-z0-9]+)/g)) mediaIds.add(m[1]);
      const summary = [];
      for (const d of DEVICES) if (e.shared && e.shared[d]) summary.push(`celý web · ${DEVICE_NAME[d]}: ${describe(e.shared[d])}`);
      for (const [pg, holder] of Object.entries(e.overrides || {})) for (const d of DEVICES) if (holder[d]) summary.push(`${pg} · ${DEVICE_NAME[d]}: ${describe(holder[d])}`);
      elements.push({ number: entry.p ? "P" + entry.p : entry.t ? "T" + entry.t : key, text: entry.t ? "T" + entry.t : null, key, selector: entry.selector, element: entry.label, sharedElement: entry.shared, pages: entry.pages, original: entry.original || null, originalFont: entry.originalFont || null, shared: e.shared || {}, overrides: e.overrides || {}, scopeChoice: e.scope || {}, snap: e.snap !== false, clientEditable: e.lock === "client", summary });
    }
    const pendingRequests = edits.requests.filter((r) => r.status !== "done").map((r) => Object.assign({}, r));
    for (const c of edits.comments.filter((x) => x.status === "open")) pendingRequests.push({ id: "req-" + c.id, type: "comment", trigger: "note", elementId: c.key, selector: c.selector, element: c.element, page: c.page, device: c.device || "all", scope: "page", description: c.text + (c.replies && c.replies.length ? " | Odpovědi: " + c.replies.map((r) => r.author + ": " + r.text).join(" | ") : ""), reference: null, status: "pending" });
    const mediaList = [];
    for (const id of mediaIds) {
      const m = media.meta(id) || (await media.list()).find((x) => x.id === id);
      mediaList.push(Object.assign({ id, usedBy: media.usage(id).map((u) => u.key), webp: await media.dataUrl(id) }, m || {}));
    }
    const usedActions = new Set();
    const usedAnims = new Set();
    for (const e of Object.values(edits.elements)) for (const holder of [e.shared, ...Object.values(e.overrides || {})]) for (const d of DEVICES) {
      const p = holder && holder[d];
      if (!p) continue;
      if (p.action) usedActions.add(p.action.id);
      if (p.animations) for (const a of Object.values(p.animations)) if (a) usedAnims.add(a.id);
    }
    const describeAdded = (a) => {
      const where = `při šířce prvku ${a.refW} px; střed ${a.x} % šířky a ${a.y} % výšky prvku ${a.anchor}`;
      if (a.kind === "text") return `text „${a.text}“ (písmo ${(a.style || {}).font || "zděděné"}, ${(a.style || {}).size || 24} px, řez ${(a.style || {}).weight || 400}, barva ${(a.style || {}).color}, zarovnání ${(a.style || {}).align || "left"}${(a.style || {}).italic ? ", kurzíva" : ""}${(a.style || {}).upper ? ", velká písmena" : ""}, řádkování ${(a.style || {}).lineHeight || 1.2}); nejvyšší šířka ${a.w} px ${where}`;
      if (a.kind === "model") {
        const m = a.model || {};
        const deg = (r) => Math.round(num(r) * 180 / Math.PI);
        return `3D model „${m.name || m.id}“ (${m.id}); otočení ${deg(m.rx)}° / ${deg(m.ry)}° / ${deg(m.rz)}°; šířka ${a.w} px ${where}`;
      }
      return `kresba „${a.art.name || a.art.id}“ (${a.art.src}), barva ${a.art.color}; šířka ${a.w} px ${where}`;
    };
    const addedElements = (edits.added || []).map((a) => {
      const k = addedKey(a);
      const entry = store.catalog[k.key];
      return Object.assign(clone(a), {
        number: entry && entry.p ? "P" + entry.p : null,
        key: k.key,
        selector: k.selector,
        summary: `${a.page === "*" ? "celý web" : a.page}: ${describeAdded(a)}`,
      });
    });
    const modelIds = new Set((edits.added || []).filter((a) => a && a.kind === "model" && a.model && a.model.id).map((a) => a.model.id));
    const modelList = [];
    for (const id of modelIds) modelList.push({ id, name: (models.meta(id) || {}).name || id, glb: await models.dataUrl(id) });
    let extras = {};
    if (typeof window.CreatoolExportExtras === "function") {
      try { extras = (await window.CreatoolExportExtras()) || {}; } catch {}
    }
    const live = liveVersion();
    const backup = backupVersion();
    return {
      app: APP, version: 2, editorVersion: VERSION, madeBy: "lupienskim",
      site: location.origin, siteName: cfg.siteName, exportedAt: now(),
      breakpoints: cfg.breakpoints, previewWidths: store.settings.previewWidths,
      howToRead: {
        layers: "shared = celý web, overrides['/stranka'] = jen ta stránka. Uvnitř desktop / tablet / mobile. Pořadí: stránka+zařízení > stránka+počítač > web+zařízení > web+počítač.",
        devices: "Český počítač je základ pro všechny jazyky a pro tablet i mobil. Úprava tabletu nebo mobilu v češtině platí jen pro to zařízení, ve všech jazycích. Úprava jiného jazyka platí jen pro ten jazyk a jen pro zařízení, na kterém vznikla. Text se mezi jazyky nepřenáší. Real page: mobile < breakpoints.tablet px <= tablet < breakpoints.desktop px <= desktop.",
        units: "x, y: px posunu přičtené k vlastnímu translate prvku; refW: šířka rodiče při úpravě (na menším zařízení se posun přepočítá poměrem). width/height: {v,u}. fontScale: násobek původní velikosti. shape.pts: body v % vlastní velikosti prvku. opacity 0–100. Barvy 'token:jmeno' = CSS proměnná tokenu.",
        art: "art = prvek nahrazený kresbou z knihovny: původní obsah se skryje a box prvku ukáže soubor art.src (SVG s fill=currentColor) v barvě art.color přes CSS masku (background: barva; mask: url(src) center / contain no-repeat). Poloha, rozměr a animace prvku zůstávají.",
        removed: "removed: true = prvek smazaný v editoru. Když je v desktop vrstvě, odstraň ho z kódu na té stránce (u sdíleného prvku podle rozsahu); když je jen u tabletu nebo mobilu, skryj ho tam media query. removed: false v nižší vrstvě = na tom zařízení zůstává.",
        models: "models = nahrané GLB soubory (data URL). addedElements s kind 'model' na ně odkazují přes model.id. model.rx, model.ry a model.rz jsou radiány otočení kolem os X, Y a Z. stops = zastávky animace {id, rx, ry, rz, x, y, s}; x a y jsou střed v % anchoru, s je měřítko té zastávky (1 = šířka modelu). Pořadí přehrávání je podle polohy na stránce, shora dolů, ne podle pořadí vložení. Jedna zastávka znamená, že model stojí. view.tablet a view.mobile jsou úpravy jen pro to zařízení, removed: true ho tam skryje. Počítač je hlavní verze.",
        addedText: "addedElements s kind 'text' = nový text: text (prostý text, zalomení řádků \\n), style {font, size px, weight, italic, upper, align, lineHeight, color}, w = nejvyšší šířka řádku v px. Vlož ho jako skutečný text (ne aria-hidden) v jazyce stránky, se stejnými pravidly polohy jako kresby; velikost na užším anchoru zmenši stejným poměrem, nejméně na 12 px.",
        added: "addedElements = nové kresby, které na webu zatím nejsou. anchor: selektor prvku, ke kterému je kresba připnutá; x, y: střed kresby v % šířky a výšky anchoru; w: šířka v px při šířce anchoru refW (editor ji na užším anchoru zmenšuje poměrem odmocniny, nejméně na 45 %); art: soubor, barva a poměr stran. page '*' = na všech stránkách. Další úpravy (posun, rozměr, otočení, animace) jsou v elements pod stejným selector (data-creatool-id=\"ct-add-…\"); v kódu kresbu vlož jako dekorativní prvek (aria-hidden) do anchoru.",
      },
      elements,
      addedElements,
      texts: elements.filter((e) => e.text),
      tokens: { changed: edits.tokens, css: tokensCss(edits), siteTokens },
      pendingRequests,
      comments: edits.comments,
      media: mediaList,
      models: modelList,
      extras,
      registry: { actions: registry.actions.filter((a) => usedActions.has(a.id)), animations: [...BUILTIN_ANIMATIONS, ...registry.animations].filter((a) => usedAnims.has(a.id)).map(({ id, name, type, duration, delay, easing, changes, replace, add, builtin }) => ({ id, name, type, duration, delay, easing, changes, keyframes: { replace, add }, builtin: !!builtin })) },
      versions: { publishedAt: live ? live.at : null, backupReplacedAt: backup ? backup.replacedAt : null },
      store: { app: APP, version: 2, meta: store.meta, catalog: store.catalog, edits: store.edits, settings: store.settings },
    };
  }
  async function download() {
    try {
      status = "Připravuji export…";
      ui.updateStatus();
      const data = await build();
      downloadFile(`creatool-${(location.host || "web").replace(/[^a-z0-9.-]/gi, "_")}.json`, JSON.stringify(data, null, 2));
      status = "Export stažen";
      ui.updateStatus();
    } catch (err) {
      status = "Export se nepodařil";
      ui.updateStatus();
      ui.flashNotice(err && err.message ? err.message : "Export se nepodařilo stáhnout.");
    }
  }
  /** Accepts a CREATOOL export or store, and exports of Review Lab 1.0 (the previous version). */
  function parse(data) {
    const s = data && data.store ? data.store : data;
    if (validStore(s)) return normalizeStore(clone(s));
    if (s && s.app === "review-lab" && s.version === 1) {
      const out = emptyStore();
      const add = (e, role) => {
        const shared = e.scope === "*";
        const key = (shared ? "s-" : "p-") + hash(e.selector + "|" + (shared ? "*" : e.scope));
        const c = (out.catalog[key] = out.catalog[key] || { key, selector: e.selector, shared, pages: e.pages || [e.scope], label: e.label || e.selector });
        if (role === "text") Object.assign(c, { t: out.meta.nextT++, original: e.original, originalFont: e.originalFont });
        else c.p = c.p || out.meta.nextP++;
        return (out.edits.elements[key] = out.edits.elements[key] || { shared: {}, overrides: {} });
      };
      for (const e of Object.values(s.texts || {})) {
        if (!e.change) continue;
        const el = add(e, "text");
        const d = (el.shared.desktop = el.shared.desktop || {});
        if (e.change.segments) d.text = e.change.segments;
        if (e.change.font) d.font = e.change.font;
        if (e.change.size && e.change.size.desktop) d.fontScale = e.change.size.desktop;
        if (e.change.size && e.change.size.mobile) el.shared.mobile = Object.assign({}, el.shared.mobile, { fontScale: e.change.size.mobile });
      }
      for (const e of Object.values(s.moves || {})) {
        if (!e.pose) continue;
        const el = add(e, "el");
        for (const [vp, dev] of [["desktop", "desktop"], ["mobile", "mobile"]]) {
          const p = e.pose[vp];
          if (!p) continue;
          el.shared[dev] = Object.assign({}, el.shared[dev], { xPct: p.x || undefined, yPct: p.y || undefined, rotate: p.rotate || undefined, scale: p.scale !== 1 ? p.scale : undefined });
        }
      }
      return out;
    }
    return null;
  }
  return { build, download, parse, tokensCss, describe };
})();

// ---- 13-ui-start.js ----
/* ---------- toolbar, panel, start ---------- */

const uiRoot = h("div", { class: "ui" });
const bar = h("div", { class: "bar" });
const panel = h("aside", { class: "panel", "aria-label": "Azervera CREATOOL" });
const banner = h("div", { class: "banner", hidden: true });
const importInput = h("input", { type: "file", accept: ".json,application/json", hidden: true });
const mini = h("button", { type: "button", class: "mini", hidden: true, title: "Klikni pro rozbalení, táhni pro přesun", "aria-label": "Rozbalit panel" });
let statusEl = null;
let undoBtn = null;
let redoBtn = null;
let countBtn = null;
let draftBtn = null;
let addBtn = null;
let textBtn = null;
let noticeTimer = 0;

/** The panel is rebuilt on many changes; the field being typed in keeps its focus and caret across a rebuild. */
const focusSig = (el) => el.tagName + "|" + (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.type || "");
function panelFocus() {
  const a = shadow.activeElement;
  if (!a || !panel.contains(a) || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return null;
  const sig = focusSig(a);
  const tag = a.tagName.toLowerCase();
  let range = null;
  try {
    if (typeof a.selectionStart === "number") range = [a.selectionStart, a.selectionEnd, a.selectionDirection];
  } catch {}
  return { sig, tag, i: Array.from(panel.querySelectorAll(tag)).filter((x) => focusSig(x) === sig).indexOf(a), range };
}
function restorePanelFocus(f) {
  if (!f) return;
  const el = Array.from(panel.querySelectorAll(f.tag)).filter((x) => focusSig(x) === f.sig)[f.i];
  if (!el) return;
  el.focus({ preventScroll: true });
  if (f.range)
    try {
      el.setSelectionRange(...f.range);
    } catch {}
}

let toothApplied;
function rememberToothDraft() {
  const tooth = window.CreatoolTooth;
  if (!tooth || typeof tooth.snapshot !== "function") return;
  const snap = tooth.snapshot();
  if (snap != null) store.edits.toothDraft = snap;
}
function syncToothDraft() {
  if (!store.edits || !Object.prototype.hasOwnProperty.call(store.edits, "toothDraft")) return;
  const raw = store.edits.toothDraft;
  if (raw === toothApplied) return;
  toothApplied = raw;
  // A missing snapshot must not wipe poses saved on the page. Clearing is explicit.
  if (raw == null || raw === "") return;
  const tooth = window.CreatoolTooth;
  if (tooth && typeof tooth.restore === "function") tooth.restore(raw);
}
function keepToothDraft() {
  rememberToothDraft();
  persist();
}
const engine = {
  changed(full) {
    syncToothDraft();
    if (isChild) {
      applyAll(document);
      return;
    }
    applyAll(document);
    const child = childApi();
    if (child) child.reload(JSON.stringify(store), viewState);
    ui.updateStatus();
    drawOverlay(true);
    if (full) ui.renderPanel();
    ui.renderBanner();
  },
};

const clampPos = (p, w) => ({ x: Math.round(clamp(p.x, 8, Math.max(8, innerWidth - w - 8))), y: Math.round(clamp(p.y, 8, Math.max(8, innerHeight - 56))) });
function placeBar() {
  if (!S.barPos) {
    bar.style.left = bar.style.top = bar.style.right = bar.style.bottom = "";
    return;
  }
  const rect = bar.getBoundingClientRect();
  const w = rect.width || 280;
  const h = rect.height || 48;
  const pos = {
    x: Math.round(clamp(S.barPos.x, 8, Math.max(8, innerWidth - w - 8))),
    y: Math.round(clamp(S.barPos.y, 8, Math.max(8, innerHeight - h - 8))),
  };
  Object.assign(bar.style, { left: pos.x + "px", top: pos.y + "px", right: "auto", bottom: "auto" });
}
function place() {
  placeBar();
  for (const el of [panel, mini]) {
    if (!S.pos) {
      el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.maxHeight = "";
      continue;
    }
    const w = el.hidden ? 0 : el.getBoundingClientRect().width || (el === panel ? Math.min(420, innerWidth - 28) : 160);
    const pos = clampPos(S.pos, w);
    Object.assign(el.style, { left: pos.x + "px", top: pos.y + "px", right: "auto", bottom: "auto" });
    if (el === panel) el.style.maxHeight = `calc(100vh - ${pos.y}px - 16px)`;
  }
}
function startDrag(event, el, onClick) {
  if (event.button !== 0 || (event.target.closest && event.target.closest("input, textarea, select, button:not(.mini)"))) return;
  event.preventDefault();
  const b = el.getBoundingClientRect();
  const sx = event.clientX;
  const sy = event.clientY;
  let moved = false;
  const move = (e) => {
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return;
    moved = true;
    S.pos = clampPos({ x: b.left + e.clientX - sx, y: b.top + e.clientY - sy }, b.width);
    place();
  };
  const up = () => {
    removeEventListener("pointermove", move, true);
    removeEventListener("pointerup", up, true);
    if (moved) saveUi();
    else if (onClick) onClick();
  };
  addEventListener("pointermove", move, true);
  addEventListener("pointerup", up, true);
}
mini.addEventListener("pointerdown", (e) => startDrag(e, mini, () => { S.collapsed = false; saveUi(); ui.renderPanel(); }));
mini.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); S.collapsed = false; saveUi(); ui.renderPanel(); } });
importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  importInput.value = "";
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const parsed = exporter.parse(raw);
    if (!parsed) throw new Error();
    S.importing = parsed;
    S.importModels = Array.isArray(raw.models) ? raw.models : [];
    S.panel = true;
    S.collapsed = false;
    ui.renderPanel();
  } catch {
    ui.flashNotice("Soubor není export z CREATOOL ani z Review Lab.");
  }
});

// The three editing widths exist with either scale. Měřítko V2 pins them itself.
// V1 has no pin, so the editor holds the width only while it is open and lets V1 go back when it closes.
function clearEditorPin() {
  const root = document.documentElement;
  if (root.dataset.ctPin !== "1") return;
  delete root.dataset.ctPin;
  const body = document.body;
  if (body) {
    body.style.removeProperty("width");
    body.style.removeProperty("margin-left");
    body.style.removeProperty("margin-right");
  }
  root.style.removeProperty("--page");
  root.removeAttribute("data-pc");
}
function pinEditorWidth(w) {
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;
  root.dataset.ctPin = "1";
  body.style.width = w + "px";
  body.style.marginLeft = "auto";
  body.style.marginRight = "auto";
  root.style.setProperty("--page", w + "px");
  root.setAttribute("data-pc", String(w));
}
function pcShown() {
  const fit = window.CreatoolFit;
  if (fit && typeof fit.layout === "function" && document.documentElement.dataset.ctPin !== "1") return fit.layout();
  return store.settings.previewWidths.desktop;
}

const ui = {
  updateStatus() {
    if (isChild) return;
    if (statusEl) statusEl.textContent = status;
    if (undoBtn) undoBtn.disabled = !hist.past.length;
    if (redoBtn) redoBtn.disabled = !hist.future.length;
    if (countBtn) countBtn.textContent = `Panel (${changeCount()})`;
    if (draftBtn) {
      const live = liveVersion();
      const d = diffKeys(live ? live.edits : emptyEdits(), store.edits).length;
      draftBtn.replaceChildren("Koncept", d ? h("span", { class: "dot", title: "Koncept se liší od zveřejněné verze" }) : "");
    }
  },
  syncModeClasses() {
    for (const doc of new Set([document, view.doc])) {
      const c = doc.documentElement.classList;
      for (const m of ["text", "element", "model", "comment"]) c.toggle("ct-mode-" + m, S.mode === m && !S.hidden);
      c.toggle("ct-placing", !!S.placing && !S.hidden);
      c.toggle("ct-static-preview", viewState === "backup");
    }
    if (addBtn) addBtn.setAttribute("aria-pressed", String(!!S.placing && !!S.placing.art));
    if (textBtn) textBtn.setAttribute("aria-pressed", String(!!S.placing && S.placing.kind === "text"));
  },
  setMode(m) {
    const was = S.mode;
    S.mode = m;
    S.hovered = null;
    if (m !== "element") {
      S.shapeEdit = false;
      S.placing = null;
      S.placeAt = null;
      if (S.stillDraw) interact.cancelStillDraw();
    }
    if (m === "text" || m === "numbers") registerAll(view.doc);
    const child = childApi();
    if (child) child.setMode(m);
    ui.syncModeClasses();
    if (was === "model" || m === "model") applyAll(view.doc);
    const slot = bar.querySelector(".motion-slot");
    if (slot && !S.barMini && !S.barHidden) {
      for (const b of bar.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === m));
      slot.classList.add("is-on");
      slot.removeAttribute("aria-hidden");
    } else if (!S.barMini && !S.barHidden) ui.renderBar();
    ui.renderPanel();
    drawOverlay(true);
  },
  setBar(patch) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, "mini")) S.barMini = !!patch.mini;
    if (patch && Object.prototype.hasOwnProperty.call(patch, "hidden")) S.barHidden = !!patch.hidden;
    if (S.barHidden) S.barMini = false;
    saveUi();
    ui.renderBar();
  },
  setDevice(d) {
    const real = deviceOfWin(window);
    const width = store.settings.previewWidths[d];
    // The page itself is shown when it already is that device and fits; otherwise a frame at the real width.
    if (d === real && (d !== "desktop" || innerWidth >= Math.min(width, 1200))) closeStage();
    else openStage(d, view.kind === "frame" ? (() => { try { return view.win.location.href; } catch { return null; } })() : null);
    S.device = d;
    S.sel = S.sel && store.catalog[S.sel] ? S.sel : null;
    ui.renderBar();
    ui.renderPanel();
    engine.changed();
  },
  showPc(w) {
    store.settings.previewWidths.desktop = w;
    closeStage();
    S.device = "desktop";
    const fit = window.CreatoolFit;
    if (fit && typeof fit.apply === "function") {
      clearEditorPin();
      fit.forcePc = w;
      fit.apply();
    } else pinEditorWidth(w);
    persistNow();
    ui.renderBar();
    ui.renderPanel();
    engine.changed();
  },
  setHidden(v) {
    if (v && S.stillDraw) interact.cancelStillDraw();
    S.hidden = v;
    if (v) {
      if (S.mode !== "browse") S.mode = "browse";
      S.placing = null;
      S.placeAt = null;
      closeStage();
      clearEditorPin();
      S.device = deviceOfWin(window);
    }
    saveUi();
    ui.syncModeClasses();
    ui.render();
    drawOverlay(true);
    if (v) uiRoot.querySelector(".pack-ask")?.remove();
    else sitePack.ask();
    window.dispatchEvent(new CustomEvent("creatool:visibility", { detail: { visible: !v } }));
  },
  select(key, keepStack = false) {
    if (S.stillDraw && key !== S.sel) interact.cancelStillDraw();
    if (!keepStack) S.childStack = [];
    S.sel = key && store.catalog[key] ? key : null;
    S.shapePoint = null;
    S.requestDraft = null;
    if (S.sel) {
      S.panel = true;
      S.collapsed = false;
    }
    if (S.ask && S.ask.key !== key) S.ask = null;
    ui.renderPanel();
    drawOverlay(true);
  },
  reveal(key) {
    const entry = store.catalog[key];
    if (!entry) return;
    const el = elementFor(entry);
    if (el) {
      ui.select(key);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.setAttribute("data-ct-flash", "");
      setTimeout(() => el.removeAttribute("data-ct-flash"), 1900);
      return;
    }
    const target = entry.pages.find((p) => p !== curPage()) || entry.pages[0];
    sessionStorage.setItem(KEY + ":focus", key);
    rememberToothDraft();
    persistNow();
    if (view.kind === "frame") view.win.location.assign(target);
    else location.assign(target);
  },
  askScope(key, group) {
    // Asked once; typing on (each letter is a change) must not rebuild the panel under the cursor.
    if (S.ask && S.ask.key === key && S.ask.group === group) return;
    S.ask = { key, group };
    ui.renderPanel();
  },
  flashNotice(text, kind = "warn") {
    S.notice = { text, kind };
    S.panel = true;
    S.collapsed = false;
    ui.renderPanel();
  },
  openHub(hub, ctx) {
    S.sel = null;
    S.hub = hub;
    hubCtx = ctx || {};
    S.panel = true;
    S.collapsed = false;
    ui.renderPanel();
  },
  async dropImage(file, img, category) {
    if (img && isClient()) {
      const e = register(img, "el", true);
      if (!(store.edits.elements[e.key] && store.edits.elements[e.key].lock === "client")) return ui.flashNotice("Tenhle obrázek je zamčený.");
    }
    const cat = category || (img ? (img.getBoundingClientRect().width >= 900 ? "hero" : img.getBoundingClientRect().width >= 360 ? "gallery" : "thumb") : "gallery");
    ui.flashNotice("Zpracovávám obrázek…", "ok");
    try {
      const m = await media.add(file, { category: cat });
      if (img) {
        const entry = register(img, "el");
        const P = resolveProps(entry.key, curPage(), curDevice(), store.edits).props;
        setProps(entry.key, { img: Object.assign({}, P.img, { media: m.id, category: cat }) }, { label: "Nahradit obrázek" });
        S.open.add("image");
        ui.select(entry.key);
        S.notice = { text: `Obrázek nahrazen: ${m.width} × ${m.height} px, ${round(m.bytes / 1024, 0)} kB WebP. Zkontroluj alt text.`, kind: "ok" };
      } else {
        S.notice = { text: "Obrázek je v knihovně médií. Přetáhni ho na obrázek na stránce, nebo ho vyber v panelu prvku.", kind: "ok" };
        S.hub = "media";
        S.sel = null;
      }
    } catch (e) {
      S.notice = { text: e.message || "Obrázek se nepodařilo zpracovat.", kind: "warn" };
    }
    ui.renderPanel();
  },
  renderBar() {
    if (isChild) return;
    bar.replaceChildren();
    statusEl = undoBtn = redoBtn = countBtn = draftBtn = addBtn = textBtn = null;
    if (S.hidden) {
      bar.className = "";
      if (cfg.hiddenPill !== false) bar.append(h("button", { type: "button", class: "pill", title: "Alt+Shift+R", onClick: () => ui.setHidden(false) }, "CREATOOL"));
      placeBar();
      return;
    }
    const grip = h("span", { class: "bar-grip", title: "Táhni pro přesun lišty", "aria-hidden": "true" }, "⠿");
    if (S.barHidden) {
      bar.className = "bar is-hidden";
      grip.title = "Táhni pro přesun. Kliknutím se lišta vrátí.";
      bar.append(grip, h("span", { class: "brand" }, "CREATOOL"));
      placeBar();
      return;
    }
    if (S.barMini) {
      bar.className = "bar is-mini";
      bar.append(grip, h("span", { class: "brand" }, "CREATOOL"), h("button", { type: "button", title: "Rozbalit lištu", onClick: () => ui.setBar({ mini: false }) }, "Rozbalit"));
      placeBar();
      return;
    }
    bar.className = "bar";
    const brand = h("span", { class: "brand" }, "CREATOOL", h("small", {}, "made by lupienskim"));
    const modeBtn = (id, label) => h("button", { type: "button", "data-mode": id, "aria-pressed": String(S.mode === id), onClick: () => ui.setMode(id) }, label);
    const showPill = () => {
      S.panel = false;
      S.collapsed = false;
      ui.setBar({ hidden: true });
      ui.renderPanel();
    };
    undoBtn = h("button", { type: "button", title: "Zpět (Ctrl+Z)", "aria-label": "Zpět", onClick: undo }, "↶");
    redoBtn = h("button", { type: "button", title: "Vpřed (Ctrl+Shift+Z)", "aria-label": "Vpřed", onClick: redo }, "↷");
    statusEl = h("span", { class: "status", role: "status" });
    if (isClient()) {
      bar.append(grip, brand, h("div", { class: "grp", role: "group", "aria-label": "Režim" }, modeBtn("browse", "Prohlížet"), modeBtn("element", "Upravit"), modeBtn("comment", "Komentáře")), undoBtn, redoBtn,
        h("button", { type: "button", title: "Nechat jen kolečko CREATOOL", onClick: showPill }, "Zobrazit"),
        h("button", { type: "button", title: "Skrýt editor (Alt+Shift+R)", "aria-label": "Skrýt editor", onClick: showPill }, "Skrýt"),
        h("button", { type: "button", onClick: () => { S.panel = !S.panel || S.collapsed; S.collapsed = false; ui.renderPanel(); } }, "Panel"),
        h("button", { type: "button", title: "Ukázka pohledu klienta", onClick: () => { store.settings.role = "owner"; persistNow(); S.sel = null; ui.setMode("browse"); ui.render(); } }, "Ukončit režim klienta"), statusEl);
    } else {
      countBtn = h("button", { type: "button", onClick: () => { if (S.panel && !S.collapsed && !S.sel) S.panel = false; else { S.panel = true; S.collapsed = false; S.sel = null; } ui.renderPanel(); } });
      draftBtn = h("button", { type: "button", onClick: () => ui.openHub("versions") });
      bar.append(grip, brand,
        h("div", { class: "grp", role: "group", "aria-label": "Režim" }, modeBtn("browse", "Procházet"), modeBtn("numbers", "Čísla"), modeBtn("text", "Texty"), modeBtn("element", "Prvky"), modeBtn("model", "3D"), modeBtn("comment", "Komentáře")),
        h("div", { class: "motion-slot is-on" }, motionSwitch()),
        (addBtn = h("button", { type: "button", title: "Přidat kresbu z knihovny na stránku", "aria-pressed": String(!!S.placing && !!S.placing.art), onClick: () => ui.openHub("library", {}) }, "+ Přidat")),
        (textBtn = h("button", { type: "button", title: "Přidat text kamkoliv na stránku", "aria-pressed": String(!!S.placing && S.placing.kind === "text"), onClick: () => startTextPlacing() }, "+ Text")),
        h("div", { class: "grp", role: "group", "aria-label": "Zařízení" }, DEVICES.map((d) => h("button", { type: "button", "aria-pressed": String(curDeviceShown() === d), onClick: () => ui.setDevice(d) }, { desktop: "Počítač", tablet: "Tablet", mobile: "Mobil" }[d]))),
        h("div", { class: "grp", role: "group", "aria-label": "Šířka počítače" }, [1280, 1440, 1920].map((w) => h("button", { type: "button", title: "Upravit počítač v šířce " + w + " px", "aria-pressed": String(pcShown() === w), onClick: () => ui.showPc(w) }, String(w)))),
        undoBtn, redoBtn, countBtn, draftBtn,
        h("button", { type: "button", title: "Stáhnout export úprav jako JSON", onClick: () => exporter.download() }, "Stáhnout export"),
        h("button", { type: "button", title: "Nechat jen kolečko CREATOOL", onClick: showPill }, "Zobrazit"),
        h("button", { type: "button", title: "Skrýt editor (Alt+Shift+R)", "aria-label": "Skrýt editor", onClick: showPill }, "Skrýt"),
        statusEl);
    }
    ui.updateStatus();
    placeBar();
  },
  renderBanner() {
    if (isChild) return;
    ui.syncModeClasses();
    if (S.hidden || viewState === "draft") {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    const pages = [...new Set(Object.values(store.catalog).flatMap((e) => e.pages))].sort();
    const go = h("select", { "aria-label": "Stránka" }, pages.map((p) => h("option", { value: p, selected: p === curPage() }, p)));
    go.addEventListener("change", () => {
      rememberToothDraft();
      persistNow();
      if (view.kind === "frame") view.win.location.assign(go.value);
      else location.assign(go.value);
    });
    banner.replaceChildren(
      h("b", {}, viewState === "backup" ? "Náhled předchozí verze" : "Zveřejněná verze"),
      h("span", {}, viewState === "backup" ? "jen designový náhled, odkazy a formuláře nefungují" : "takhle je to zveřejněné"),
      go,
      viewState === "backup" ? h("button", { type: "button", onClick: () => { const b = backupVersion(); if (b && confirm("Obnovit předchozí verzi do konceptu?")) { replaceEdits("Obnovit předchozí verzi", b.edits); setView("draft"); } } }, "Obnovit tuto verzi") : null,
      h("button", { type: "button", onClick: () => setView("draft") }, "Zpět na koncept"));
  },
  renderPanel() {
    if (isChild) return;
    const entry = S.sel && store.catalog[S.sel];
    const title = entry ? (entry.t && (S.mode === "text" || !entry.p) ? "Text T" + entry.t : "Prvek P" + entry.p) : isClient() ? "Úpravy webu" : "CREATOOL";
    panel.hidden = S.hidden || !S.panel || S.collapsed;
    mini.hidden = S.hidden || !S.panel || !S.collapsed;
    mini.replaceChildren("▸ " + title, h("b", {}, changeCount()));
    place();
    layoutStage();
    if (panel.hidden) return;
    const keepScroll = panel.scrollTop;
    const focus = panelFocus();
    const header = h("header", { title: "Táhni pro přesun panelu", onPointerdown: (e) => startDrag(e, panel) }, h("strong", {}, title),
      h("span", { class: "acts" },
        h("button", { type: "button", "aria-label": "Sbalit do pilulky", title: "Sbalit", onClick: () => { S.collapsed = true; saveUi(); ui.renderPanel(); } }, "–"),
        h("button", { type: "button", "aria-label": "Zavřít panel", onClick: () => { S.panel = false; ui.renderPanel(); } }, "×")));
    const body = [];
    if (S.notice) {
      body.push(h("div", { class: "note " + (S.notice.kind || ""), "data-notice": "" }, S.notice.text, " ", h("button", { type: "button", class: "mini-reset", onClick: () => { S.notice = null; ui.renderPanel(); } }, "×")));
      clearTimeout(noticeTimer);
      const n = S.notice;
      noticeTimer = setTimeout(() => {
        if (S.notice !== n) return;
        S.notice = null;
        const node = panel.querySelector("[data-notice]");
        if (node) node.remove();
      }, 9000);
    }
    if (S.importing) {
      const count = changeCount(S.importing.edits);
      body.push(h("div", { class: "note" }, `Nahradit koncept obsahem souboru (${count} upravených prvků, ${S.importing.edits.requests.length} požadavků, ${S.importing.edits.comments.length} komentářů)?`, h("div", { class: "row" },
        h("button", { type: "button", onClick: () => {
          const imp = S.importing;
          Object.assign(store.catalog, imp.catalog);
          store.meta.nextT = Math.max(store.meta.nextT, imp.meta.nextT);
          store.meta.nextP = Math.max(store.meta.nextP, imp.meta.nextP);
          store.meta.nextReq = Math.max(store.meta.nextReq, imp.meta.nextReq || 1);
          store.meta.nextCom = Math.max(store.meta.nextCom, imp.meta.nextCom || 1);
          const files = S.importModels || [];
          S.importing = null;
          S.importModels = [];
          S.sel = null;
          models.restore(files).catch(() => {});
          replaceEdits("Načíst export", imp.edits);
          persistNow();
          ui.renderPanel();
        } }, "Načíst místo konceptu"),
        h("button", { type: "button", onClick: () => { S.importing = null; ui.renderPanel(); } }, "Zrušit"))));
    }
    body.push(...(entry ? elementPanel(S.sel) : hubPanel()));
    body.push(h("footer", {}, h("b", {}, "Azervera CREATOOL"), ` ${VERSION} · made by lupienskim. Úpravy jsou koncept v tomto prohlížeči; na web je zapíše agent podle exportu.`));
    panel.replaceChildren(header, ...body);
    panel.scrollTop = keepScroll;
    restorePanelFocus(focus);
    // New text starts selected in its field, so typing replaces "Nový text" straight away.
    const fresh = S.focusAdded && panel.querySelector('textarea[aria-label="Přidaný text"]');
    if (fresh) {
      S.focusAdded = null;
      fresh.focus({ preventScroll: true });
      fresh.select();
    }
  },
  render() {
    ui.renderBar();
    ui.renderPanel();
    ui.renderBanner();
  },
};
const curDeviceShown = () => (stage ? stage.device : deviceOfWin(window));
window.addEventListener("resize", () => {
  place();
  layoutStage();
});

async function loadRegistry() {
  const list = { actions: [...(cfg.actions || [])], animations: [...(cfg.animations || [])] };
  if (cfg.registryUrl) {
    try {
      const r = await fetch(cfg.registryUrl, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.actions)) list.actions.push(...data.actions);
        if (Array.isArray(data.animations)) list.animations.push(...data.animations);
      }
    } catch {}
  }
  const valid = (a) => a && typeof a.id === "string" && /^[a-z0-9-]{2,60}$/i.test(a.id);
  registry = { actions: list.actions.filter(valid), animations: list.animations.filter(valid) };
  document.querySelectorAll("[data-action]").forEach((el) => {
    const id = el.getAttribute("data-action");
    if (id && /^[a-z0-9-]{2,60}$/i.test(id) && !registry.actions.some((a) => a.id === id)) registry.actions.push({ id, name: id, description: "Nalezeno v kódu webu (data-action).", source: "data-action" });
  });
}

function observe(doc, onChange) {
  let pending = 0;
  new MutationObserver((records) => {
    // Writes from applyText must not schedule another pass, or a trailing space loops the preview.
    if (records.every((r) => r.type === "characterData" && r.target && r.target.__ctOwn)) {
      for (const r of records) if (r.target) r.target.__ctOwn = 0;
      return;
    }
    const skip = (node) => isIgnored(node) || !!(node && node.closest && node.closest("#" + ADDED_LAYER));
    if (records.every((r) => skip(r.target.nodeType === 1 ? r.target : r.target.parentElement))) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(onChange);
  }).observe(doc.body, { childList: true, subtree: true, characterData: true });
}


function cssRgb(v) {
  if (!v || typeof v !== "string") return null;
  if (/^transparent$/i.test(v.trim())) return null;
  colorProbe.fillStyle = "#000";
  colorProbe.fillStyle = v;
  const s = colorProbe.fillStyle;
  if (!s || s === "rgba(0, 0, 0, 0)") return null;
  const hex = s.startsWith("#") ? (s.length === 4 ? "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s) : "";
  if (hex.length === 7) return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const m = String(s).match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
}
function colorLum(rgb) { return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]; }
function colorSat(rgb) {
  const max = Math.max(...rgb), min = Math.min(...rgb);
  return max === 0 ? 0 : (max - min) / 255;
}
function colorHex(rgb) { return "#" + rgb.map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0")).join(""); }
function mixRgb(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function applySiteTheme() {
  const found = [];
  const push = (name, value) => {
    const rgb = cssRgb(value);
    if (!rgb || rgb.some((n) => Number.isNaN(n))) return;
    const hex = colorHex(rgb);
    if (found.some((c) => c.hex === hex)) return;
    found.push({ name: String(name || ""), rgb, hex });
  };
  try { push("background", getComputedStyle(document.body).backgroundColor); } catch {}
  try { push("text", getComputedStyle(document.body).color); } catch {}
  for (const [name, token] of Object.entries(siteTokens)) if (token.type === "color") push(name, token.value);
  const button = document.querySelector(".dark, .button, a.button");
  if (button) {
    push("button", getComputedStyle(button).backgroundColor);
    push("button-text", getComputedStyle(button).color);
  }
  if (!found.length) return;
  const lumOf = (c) => colorLum(c.rgb);
  const darks = found.filter((c) => lumOf(c) < 130);
  const lights = found.filter((c) => lumOf(c) > 185);
  const named = (list, re) => list.filter((c) => re.test(c.name));
  const chrome = named(darks, /green|brand|primary|ink/i).sort((a, b) => colorSat(b.rgb) - colorSat(a.rgb))[0]
    || darks.slice().sort((a, b) => colorSat(b.rgb) - colorSat(a.rgb) || lumOf(a) - lumOf(b))[0]
    || found.slice().sort((a, b) => lumOf(a) - lumOf(b))[0];
  const paper = named(lights, /paper|bg|background|white|surface/i)[0]
    || lights.slice().sort((a, b) => lumOf(b) - lumOf(a))[0]
    || { rgb: [250, 249, 246], hex: "#faf9f6" };
  const accent = found.filter((c) => c !== paper && colorSat(c.rgb) > 0.12).sort((a, b) => colorSat(b.rgb) - colorSat(a.rgb))[0] || chrome;
  const ink = found.slice().sort((a, b) => lumOf(a) - lumOf(b))[0];
  const on = colorLum(accent.rgb) > 140 ? ink.rgb : paper.rgb;
  const bg = lumOf(chrome) > 90 ? mixRgb(chrome.rgb, [16, 20, 18], 0.72) : chrome.rgb;
  const set = (el) => {
    el.style.setProperty("--ui-bg", colorHex(bg));
    el.style.setProperty("--ui-bg-2", colorHex(mixRgb(bg, paper.rgb, 0.08)));
    el.style.setProperty("--ui-fg", paper.hex);
    el.style.setProperty("--ui-accent", accent.hex);
    el.style.setProperty("--ui-on", colorHex(on));
    el.style.setProperty("--ui-field", paper.hex);
    el.style.setProperty("--ui-ink", ink.hex);
  };
  set(host);
  set(uiRoot);
  document.documentElement.style.setProperty("--ct-chrome", colorHex(bg));
  document.documentElement.style.setProperty("--ct-accent", accent.hex);
  document.documentElement.style.setProperty("--ct-on", colorHex(on));
  if (!(Array.isArray(cfg.artColors) && cfg.artColors.length)) {
    const swatches = found.filter((c) => c.name && !/button/.test(c.name)).slice(0, 6);
    detectedArtColors = (swatches.length ? swatches : found.slice(0, 4)).map((c) => ({ name: c.name || c.hex, value: c.hex }));
  }
}

function motionSwitch() {
  const motion = store.settings.motion === "scroll" ? "scroll" : "auto";
  const opt = (id, label) => h("button", { type: "button", "data-motion": id, "aria-pressed": String(motion === id), onClick: () => setMotion(id) }, label);
  const snap = document.documentElement.dataset.ctSnap === "1";
  const lock = h("button", {
    type: "button",
    class: "motion-lock",
    "data-snap": "1",
    "aria-pressed": String(snap),
    "aria-label": "Přichytávání na střed",
    title: snap ? "Přichytávání je zapnuté. Kliknutím ho vypneš." : "Přichytit 3D objekt na střed stránky nebo prvku",
    onClick: () => setSnap(document.documentElement.dataset.ctSnap !== "1"),
  }, snap ? "🔒" : "🔓");
  return h("div", { class: "motion", role: "group", "aria-label": "Pohyb 3D objektu po čáře" }, opt("scroll", "Pohyb se scrollem"), opt("auto", "Pohyb automaticky"), lock);
}
function applySnapMode() {
  let on = false;
  try { on = localStorage.getItem(KEY + ":snap") === "1"; } catch {}
  const value = on ? "1" : "0";
  document.documentElement.dataset.ctSnap = value;
  try { if (view && view.doc) view.doc.documentElement.dataset.ctSnap = value; } catch {}
  const child = childApi();
  if (child && child.setSnap) child.setSnap(on);
}
function setSnap(on) {
  try { localStorage.setItem(KEY + ":snap", on ? "1" : "0"); } catch {}
  applySnapMode();
  const button = bar.querySelector("[data-snap]");
  if (!button) return;
  const active = document.documentElement.dataset.ctSnap === "1";
  button.setAttribute("aria-pressed", String(active));
  button.textContent = active ? "🔒" : "🔓";
  button.title = active ? "Přichytávání je zapnuté. Kliknutím ho vypneš." : "Přichytit 3D objekt na střed stránky nebo prvku";
}
function applyMotionMode() {
  const mode = store.settings.motion === "scroll" ? "scroll" : "auto";
  document.documentElement.dataset.ctMotion = mode;
  try { if (view && view.doc) view.doc.documentElement.dataset.ctMotion = mode; } catch {}
  try { localStorage.setItem(KEY + ":motion", mode); } catch {}
  const child = childApi();
  if (child && child.setMotion) child.setMotion(mode);
  window.dispatchEvent(new CustomEvent("creatool:motion", { detail: mode }));
}
function setMotion(mode) {
  store.settings.motion = mode === "scroll" ? "scroll" : "auto";
  persistNow();
  applyMotionMode();
  const group = bar.querySelector(".motion");
  if (!group) return;
  for (const b of group.querySelectorAll("button[data-motion]")) b.setAttribute("aria-pressed", String(b.dataset.motion === store.settings.motion));
}
function startBarDrag(event) {
  if (event.button !== 0 || S.hidden) return;
  const t = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
  if (!t || !t.closest) return;
  if (t.closest("button, input, textarea, select, a")) return;
  if (!t.closest(".bar-grip, .brand, .bar.is-mini, .bar.is-hidden")) return;
  event.preventDefault();
  const b = bar.getBoundingClientRect();
  const origin = S.barPos || { x: b.left, y: b.top };
  const sx = event.clientX;
  const sy = event.clientY;
  let moved = false;
  const move = (e) => {
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return;
    moved = true;
    S.barPos = {
      x: Math.round(clamp(origin.x + e.clientX - sx, 8, Math.max(8, innerWidth - b.width - 8))),
      y: Math.round(clamp(origin.y + e.clientY - sy, 8, Math.max(8, innerHeight - b.height - 8))),
    };
    placeBar();
  };
  const up = () => {
    removeEventListener("pointermove", move, true);
    removeEventListener("pointerup", up, true);
    if (moved) saveUi();
    else if (S.barHidden) ui.setBar({ hidden: false });
    else if (S.barMini) ui.setBar({ mini: false });
  };
  addEventListener("pointermove", move, true);
  addEventListener("pointerup", up, true);
}
bar.addEventListener("pointerdown", startBarDrag);

function startChild() {
  try {
    const saved = localStorage.getItem(KEY + ":motion");
    if (saved === "scroll" || saved === "auto") document.documentElement.dataset.ctMotion = saved;
  } catch {}
  try {
    const saved = localStorage.getItem(KEY + ":snap");
    if (saved === "1" || saved === "0") document.documentElement.dataset.ctSnap = saved;
  } catch {}
  document.head.append(pageStyle);
  discoverTokens();
  let mode = "browse";
  actionsEnabled = () => mode === "browse" && viewState !== "backup";
  installActionHandler(document);
  applyAll(document);
  observe(document, () => applyAll(document));
  addEventListener("resize", () => applyAll(document));
  addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue && e.newValue !== lastWritten) {
      const s = readJSON(KEY, null);
      if (validStore(s)) store = normalizeStore(s);
      applyAll(document);
    }
  });
  window.__creatoolChild = {
    device: childDevice,
    reload(json, vs) {
      try {
        const s = JSON.parse(json);
        if (validStore(s)) store = normalizeStore(s);
      } catch {}
      viewState = vs || viewState;
      document.documentElement.classList.toggle("ct-static-preview", viewState === "backup");
      applyAll(document);
    },
    preview(key, json) {
      if (json) previewOverrides.set(key, JSON.parse(json));
      else previewOverrides.delete(key);
      renderKey(key, document);
    },
    setMode(m) {
      mode = m;
      document.documentElement.classList.toggle("ct-mode-model", m === "model");
      applyAll(document);
    },
    setMotion(mode) {
      document.documentElement.dataset.ctMotion = mode === "scroll" ? "scroll" : "auto";
      window.dispatchEvent(new CustomEvent("creatool:motion", { detail: document.documentElement.dataset.ctMotion }));
    },
    setSnap(on) {
      document.documentElement.dataset.ctSnap = on ? "1" : "0";
    },
  };
  const top = () => {
    try {
      return window.parent.Creatool;
    } catch {
      return null;
    }
  };
  window.Creatool = { version: VERSION, child: true, show: () => top() && top().show(), hide: () => top() && top().hide(), toggle: () => top() && top().toggle(), get visible() { return !!(top() && top().visible); } };
}

function startTop() {
  applyMotionMode();
  applySnapMode();
  let extraTimer = 0;
  window.addEventListener("creatool:extras", () => {
    keepToothDraft();
    clearTimeout(extraTimer);
    extraTimer = setTimeout(() => {
      ui.updateStatus();
      if (S.panel && !S.collapsed && !S.sel) ui.renderPanel();
    }, 120);
  });
  addEventListener("pagehide", () => {
    rememberToothDraft();
    persistNow();
  });
  document.head.append(pageStyle);
  applySiteTheme();
  shadow.append(h("style", {}, CSS_TEXT));
  uiRoot.append(overlayEl, bar, panel, mini, banner, importInput);
  shadow.append(uiRoot);
  document.body.append(host);
  pageStyle.textContent += "#azervera-creatool{pointer-events:auto!important}";
  S.device = deviceOfWin(window);
  discoverTokens();
  applySiteTheme();
  models.refresh().catch(() => {});
  if (!S.hidden) sitePack.ask();
  sitePack.loadSavedFonts().then(() => { if (S.panel) ui.renderPanel(); }).catch(() => {});
  ownArt.refresh().then(() => { if (S.panel) ui.renderPanel(); }).catch(() => {});
  loadRegistry().then(() => ui.renderPanel());
  actionsEnabled = () => S.mode === "browse" && viewState !== "backup";
  installActionHandler(document);
  interact.attach(document);
  ui.render();
  engine.changed();
  setTimeout(() => registerAll(document), 300);
  let recount = 0;
  observe(document, () => {
    applyAll(document);
    if (S.mode === "text" || S.mode === "numbers") {
      clearTimeout(recount);
      recount = setTimeout(() => registerAll(view.doc), 400);
    }
  });
  addEventListener("resize", () => applyAll(document));
  addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue && e.newValue !== lastWritten) {
      const s = readJSON(KEY, null);
      if (validStore(s)) {
        store = normalizeStore(s);
        engine.changed(true);
      }
    }
    if (e.key === VIEW_KEY) {
      viewState = e.newValue || "draft";
      engine.changed(true);
    }
  });
  const focus = sessionStorage.getItem(KEY + ":focus");
  sessionStorage.removeItem(KEY + ":focus");
  if (focus && store.catalog[focus]) {
    let tries = 0;
    const wait = setInterval(() => {
      const el = elementFor(store.catalog[focus]);
      if (el || ++tries > 50) {
        clearInterval(wait);
        if (el) ui.reveal(focus);
      }
    }, 100);
  }
  let lastPage = curPage();
  let lastDevice = deviceOfWin(window);
  let lastDraw = 0;
  const loop = (time) => {
    const page = curPage();
    const dev = deviceOfWin(window);
    if (page !== lastPage || (dev !== lastDevice && !stage)) {
      lastPage = page;
      lastDevice = dev;
      if (!stage) S.device = dev;
      if (S.sel && !elementFor(store.catalog[S.sel])) S.sel = null;
      engine.changed();
      setTimeout(() => registerAll(view.doc), 300);
      ui.renderBar();
      ui.renderPanel();
    }
    if (time - lastDraw > 80) {
      lastDraw = time;
      drawOverlay();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.Creatool = {
    version: VERSION,
    show: () => ui.setHidden(false),
    hide: () => ui.setHidden(true),
    toggle: () => ui.setHidden(!S.hidden),
    get visible() {
      return !S.hidden;
    },
    get store() {
      return store;
    },
    download: () => exporter.download(),
    exportData: () => exporter.build(),
    models,
    applyAll: () => engine.changed(true),
  };
  if (cfg.debug) window.Creatool.debug = { S, get store() { return store; }, get view() { return view; }, setProps, resolveProps, ui, engine, exporter, media, publishDraft, undo, redo, setView, register, curPage, curDevice, createRequest, chooseScope, setMeta, playAnimation, candidatesAt, library, addArtAt, addTextAt, removeAdded, duplicateAdded, updateAdded, addedKey, deleteElement, restoreRemoved, get registry() { return registry; } };
  window.dispatchEvent(new CustomEvent("creatool:ready", { detail: { visible: !S.hidden } }));
  if (window.console && console.info) console.info(`%cAzervera CREATOOL ${VERSION}%c made by lupienskim`, "color:#ff5100;font-weight:700", "color:inherit");
}

function start() {
  if (isChild) startChild();
  else startTop();
}
window.__creatool = true;
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();

})();
