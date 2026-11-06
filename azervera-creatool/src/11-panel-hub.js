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
