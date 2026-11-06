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
