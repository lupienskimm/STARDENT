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
