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
