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
