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
