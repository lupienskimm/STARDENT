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
