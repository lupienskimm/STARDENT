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
