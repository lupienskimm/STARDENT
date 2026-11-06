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
