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

