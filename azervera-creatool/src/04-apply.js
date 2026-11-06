/* ---------- apply: data -> inline styles on the real elements ----------
 * Every value is written as an inline style (or a harmless attribute) and remembered, so removing a change restores
 * exactly what the site had. Moves, rotation and scale are added on top of the element's own CSS values. */

const originals = new WeakMap(); // el -> { style: {prop: [value, priority]}, attrs: {name: value|null} }
const appliedStyles = new WeakMap(); // el -> {prop: value} we set last time
const rendered = new Set();
const previewOverrides = new Map(); // key -> props used while dragging, before the commit

function memo(el) {
  let o = originals.get(el);
  if (!o) originals.set(el, (o = { style: {}, attrs: {} }));
  return o;
}
function writeStyles(el, styles) {
  const o = memo(el);
  const prev = appliedStyles.get(el) || {};
  // Originals are read before anything is written: aliases and shorthands (-webkit-mask and mask, background and its
  // parts) share values, so reading one after writing the other would remember our own value as the site's.
  for (const prop of Object.keys(styles)) if (!(prop in o.style)) o.style[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
  for (const prop of Object.keys(prev)) {
    if (prop in styles) continue;
    const [v, p] = o.style[prop] || ["", ""];
    if (v) el.style.setProperty(prop, v, p);
    else el.style.removeProperty(prop);
  }
  for (const [prop, value] of Object.entries(styles)) {
    if (el.style.getPropertyValue(prop) !== value || el.style.getPropertyPriority(prop) !== "important") el.style.setProperty(prop, value, "important");
  }
  appliedStyles.set(el, styles);
}
function writeAttr(el, name, value) {
  const o = memo(el);
  if (!(name in o.attrs)) o.attrs[name] = el.getAttribute(name);
  if (value === null) {
    const v = o.attrs[name];
    if (v === null || v === undefined) el.removeAttribute(name);
    else el.setAttribute(name, v);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function dropAttr(el, name) {
  const o = memo(el);
  if (!(name in o.attrs)) o.attrs[name] = el.getAttribute(name);
  el.removeAttribute(name);
}
function restoreAttrs(el, keep = []) {
  const o = originals.get(el);
  if (!o) return;
  for (const name of Object.keys(o.attrs)) if (!keep.includes(name)) writeAttr(el, name, null);
}
/** Computed values the site itself gives the element, without our inline changes. */
function baseValues(el, props) {
  const o = memo(el);
  const saved = [];
  for (const p of props) {
    saved.push([p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
    const ov = o.style[p];
    if (ov) {
      if (ov[0]) el.style.setProperty(p, ov[0], ov[1]);
      else el.style.removeProperty(p);
    }
  }
  const c = cs(el);
  const out = {};
  for (const p of props) out[p] = c.getPropertyValue(p);
  for (const [p, v, pr] of saved) {
    if (v) el.style.setProperty(p, v, pr);
    else el.style.removeProperty(p);
  }
  return out;
}
const lenOf = (v) => (!v || v.u === "auto" ? "auto" : `${round(num(v.v), 2)}${v.u || "px"}`);
function parentWidth(el) {
  const anchor = anchorOf(el);
  if (anchor) return anchor.getBoundingClientRect().width;
  const p = el.parentElement;
  return p ? p.getBoundingClientRect().width : winOf(el).innerWidth;
}

/* ---------- shape: four (or more) points ---------- */

const RECT = [[0, 0], [100, 0], [100, 100], [0, 100]];
/** Homography that maps the element box onto four target corners (for "Deformace obsahu"). */
function warpMatrix(w, h, pts) {
  const [p0, p1, p2, p3] = pts.map(([x, y]) => [(x / 100) * w, (y / 100) * h]);
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const dst = [p0, p1, p2, p3];
  // Solve the 8 unknowns of the projective transform with Gaussian elimination.
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    [b[c], b[pivot]] = [b[pivot], b[c]];
    if (Math.abs(A[c][c]) < 1e-9) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const [a, bb, c, d, e, f, g, hh] = b.map((v, i) => v / A[i][i]);
  return [a, d, 0, g, bb, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1];
}
const polygon = (pts) => `polygon(${pts.map(([x, y]) => `${round(x, 2)}% ${round(y, 2)}%`).join(", ")})`;

/* ---------- appearance helpers ---------- */

function colorOf(v, edits) {
  const t = tv(v, edits);
  return t && (t.startsWith("var(") || CSS.supports("color", t)) ? t : null;
}
function backgroundOf(bg, edits) {
  if (!bg || bg.type === "none") return null;
  if (bg.type === "transparent") return "transparent";
  if (bg.type === "solid") return colorOf(bg.color, edits);
  const stops = (bg.stops || []).map((s) => `${colorOf(s.c, edits) || "transparent"} ${clamp(num(s.p), 0, 100)}%`).join(", ");
  if (bg.type === "linear") return `linear-gradient(${num(bg.angle, 180)}deg, ${stops})`;
  if (bg.type === "radial") return `radial-gradient(circle at ${num(bg.cx, 50)}% ${num(bg.cy, 50)}%, ${stops})`;
  if (bg.type === "image") {
    const url = bg.image && bg.image.startsWith("media:") ? media.urlFor(bg.image.slice(6)) : safeUrl(bg.image);
    return url ? `${cssUrl(url)} ${bg.pos || "center"}/${bg.size || "cover"} no-repeat` : null;
  }
  return null;
}
const supportsGlass = () => CSS.supports("backdrop-filter", "blur(2px)") || CSS.supports("-webkit-backdrop-filter", "blur(2px)");
function radiusOf(r) {
  if (!r) return null;
  if (r.preset === "sharp") return "0";
  if (r.preset === "pill") return "9999px";
  if (r.preset === "circle") return "50%";
  const v = (n) => `${round(num(n), 1)}${r.unit || "px"}`;
  const main = [r.tl, r.tr, r.br, r.bl].map(v).join(" ");
  if (r.elliptic) return `${main} / ${[r.tlY ?? r.tl, r.trY ?? r.tr, r.brY ?? r.br, r.blY ?? r.bl].map(v).join(" ")}`;
  return main;
}

/* ---------- one element ---------- */

function renderElement(el, entry, props, from, device, meta, edits) {
  const st = {};
  const has = (p) => props[p] !== undefined;
  const moved = has("x") || has("y") || has("xPct") || has("yPct");
  const needed = [];
  if (moved) needed.push("translate");
  if (has("rotate")) needed.push("rotate");
  if (has("scale")) needed.push("scale");
  if (has("fontScale")) needed.push("font-size");
  if (has("font")) needed.push("font-family");
  if (props.shape && props.shape.mode === "warp") needed.push("transform", "transform-origin");
  const boxy = moved || has("rotate") || has("scale") || has("width") || has("height") || props.shape || props.radius || props.padding;
  if (boxy) needed.push("display");
  const base = needed.length ? baseValues(el, needed) : {};

  if (has("font")) st["font-family"] = `"${String(props.font).replace(/["\\]/g, "")}", ${base["font-family"]}`;
  if (has("color")) {
    const ink = colorOf(props.color, edits);
    if (ink) st.color = ink;
  }
  if (has("fontScale")) {
    const b = parseFloat(base["font-size"]) || 16;
    let size = b * clamp(num(props.fontScale, 1), 0.2, 6);
    // Normal text never drops below 16 px on a phone when the size came down from the desktop version.
    if (device === "mobile" && (from.fontScale === 0 || from.fontScale === 2) && b >= 16 && size < 16) size = 16;
    st["font-size"] = `${round(size, 2)}px`;
  }
  if (boxy && base.display === "inline") st.display = "inline-block";
  if (moved) {
    let dx = num(props.x);
    let dy = num(props.y);
    // Positions made on the desktop keep their place relative to the parent on smaller screens.
    if (device !== "desktop" && (from.x === 0 || from.x === 2) && num(props.refW) > 0) {
      const f = parentWidth(el) / num(props.refW);
      if (Number.isFinite(f) && f > 0) {
        dx *= f;
        dy *= f;
      }
    }
    const parts = !base.translate || base.translate === "none" ? [] : splitTop(base.translate);
    const pct = (v) => (num(v) ? ` + ${num(v)}%` : "");
    st.translate = `calc(${parts[0] || "0px"} + ${round(dx, 2)}px${pct(props.xPct)}) calc(${parts[1] || "0px"} + ${round(dy, 2)}px${pct(props.yPct)})${parts[2] ? " " + parts[2] : ""}`;
  }
  if (has("rotate")) {
    const parts = !base.rotate || base.rotate === "none" ? ["0deg"] : splitTop(base.rotate);
    const angle = parts[parts.length - 1];
    st.rotate = `${parts.length > 1 ? parts.slice(0, -1).join(" ") + " " : ""}calc(${angle} + ${round(num(props.rotate), 2)}deg)`;
  }
  if (has("scale")) {
    const parts = !base.scale || base.scale === "none" ? ["1"] : splitTop(base.scale);
    st.scale = parts.map((v) => round((parseFloat(v) || 1) * clamp(num(props.scale, 1), 0.05, 10), 4)).join(" ");
  }
  // Size: the width and height typed or dragged are the visible size, padding and border included.
  const inherited = (p) => device !== "desktop" && (from[p] === 0 || from[p] === 2);
  if (["width", "height", "minW", "maxW", "minH", "maxH"].some(has)) st["box-sizing"] = "border-box";
  if (has("width")) {
    st.width = lenOf(props.width);
    if (inherited("width") && props.width.u === "px" && !has("maxW")) st["max-width"] = "100%";
  }
  if (has("height")) st.height = lenOf(props.height);
  if (has("minW")) st["min-width"] = lenOf(props.minW);
  if (has("maxW")) st["max-width"] = lenOf(props.maxW);
  if (has("minH")) st["min-height"] = lenOf(props.minH);
  if (has("maxH")) st["max-height"] = lenOf(props.maxH);
  if (props.overflow === "hidden") st.overflow = "hidden";
  if (props.overflow === "scroll") st.overflow = "auto";
  if (props.overflow === "wrap") {
    st["overflow-wrap"] = "anywhere";
    st["white-space"] = "normal";
  }
  // Shape
  if (props.shape && Array.isArray(props.shape.pts) && props.shape.pts.length >= 3 && !same(props.shape.pts, RECT)) {
    if (props.shape.mode === "warp" && props.shape.pts.length === 4) {
      const m = warpMatrix(el.offsetWidth || 1, el.offsetHeight || 1, props.shape.pts);
      if (m) {
        const origin = splitTop(base["transform-origin"] || "0px 0px");
        const ox = origin[0] || "0px";
        const oy = origin[1] || "0px";
        const own = base.transform && base.transform !== "none" ? base.transform + " " : "";
        st.transform = `${own}translate(calc(-1 * ${ox}), calc(-1 * ${oy})) matrix3d(${m.map((v) => round(v, 6)).join(",")}) translate(${ox}, ${oy})`;
      }
    } else st["clip-path"] = polygon(props.shape.pts);
  }
  // Appearance
  const bg = backgroundOf(props.bg, edits);
  if (bg) st.background = bg;
  if (props.glass && props.glass.on) {
    const blur = clamp(num(props.glass.blur, 12), 0, 80);
    const sat = clamp(num(props.glass.sat, 140), 0, 300);
    const alpha = clamp(num(props.glass.alpha, 35), 0, 100) / 100;
    const tint = colorOf(props.glass.tint || "#ffffff", edits) || "#ffffff";
    const fallback = supportsGlass() ? alpha : Math.min(1, alpha + 0.45);
    if (!bg) st.background = `color-mix(in srgb, ${tint} ${round(fallback * 100)}%, transparent)`;
    if (supportsGlass()) {
      st["backdrop-filter"] = `blur(${blur}px) saturate(${sat}%)`;
      st["-webkit-backdrop-filter"] = st["backdrop-filter"];
    }
  }
  if (has("opacity")) st.opacity = String(clamp(num(props.opacity, 100), 0, 100) / 100);
  if (props.shadow && props.shadow.on) {
    const s = props.shadow;
    const color = colorOf(s.color, edits) || "rgba(0,0,0,.35)";
    st["box-shadow"] = `${s.inset ? "inset " : ""}${num(s.x)}px ${num(s.y, 8)}px ${num(s.blur, 24)}px ${num(s.spread)}px ${color}`;
  }
  if (props.border) {
    const b = props.border;
    const side = (s) => `${clamp(num(s.w), 0, 80)}px ${["solid", "dashed", "dotted", "double", "none"].includes(s.style) ? s.style : "solid"} ${colorOf(s.color, edits) || "currentColor"}`;
    if (b.each) for (const k of ["top", "right", "bottom", "left"]) st["border-" + k] = side((b.sides || {})[k] || b);
    else st.border = side(b);
  }
  if (props.blend && /^[a-z-]{3,20}$/.test(props.blend)) st["mix-blend-mode"] = props.blend;
  const radius = radiusOf(props.radius);
  if (radius) st["border-radius"] = radius;
  if (props.padding) for (const [k, n] of Object.entries({ t: "top", r: "right", b: "bottom", l: "left" })) if (props.padding[k] !== undefined) st["padding-" + n] = `${num(props.padding[k])}px`;
  const display = cs(el).display;
  const flexish = /flex|grid/.test(display) || props.flexify;
  if (props.flexify) {
    st.display = "flex";
    st["flex-direction"] = "column";
  }
  const column = props.flexify || cs(el).flexDirection.startsWith("column");
  const mapH = { left: "flex-start", center: "center", right: "flex-end", justify: "space-between" };
  const mapV = { top: "flex-start", center: "center", bottom: "flex-end" };
  if (props.alignH) {
    st["text-align"] = props.alignH;
    if (flexish) st[/grid/.test(display) ? "justify-items" : column ? "align-items" : "justify-content"] = props.alignH === "justify" && column ? "stretch" : mapH[props.alignH];
  }
  if (props.alignV && flexish) st[/grid/.test(display) ? "align-content" : column ? "justify-content" : "align-items"] = mapV[props.alignV];
  if (has("gap")) st.gap = `${num(props.gap)}px`;
  if (props.img) renderImage(el, props.img, st);
  // A drawing from the library in place of the element: its content hides (page style) and the box shows the drawing.
  if (!el.hasAttribute("data-ct-added")) {
    const art = props.art && safeUrl(props.art.src || "");
    if (art) {
      const mask = `${cssUrl(art)} center / contain no-repeat`;
      st.background = colorOf(props.art.color, edits) || "#111111";
      st["-webkit-mask"] = mask;
      st.mask = mask;
    }
    writeAttr(el, "data-ct-art", art ? "" : null);
  }
  if (props.removed) st.display = "none";
  if (validStill(props.still) && !st.mask && !st["mask-image"]) Object.assign(st, stillMaskStyles(props.still, el));
  if (props.shape && props.shapeFix && st["clip-path"] && el.parentElement) {
    const s = props.shadow && props.shadow.on ? props.shadow : { x: 0, y: 8, blur: 24, color: "rgba(0,0,0,.35)" };
    writeStyles(el.parentElement, { filter: `drop-shadow(${num(s.x)}px ${num(s.y, 8)}px ${num(s.blur, 24) / 2}px ${colorOf(s.color, edits) || "rgba(0,0,0,.35)"})` });
    rendered.add(el.parentElement);
    delete st["box-shadow"];
  }
  writeStyles(el, st);
  placeStill(el, validStill(props.still) ? props.still : null);
  if (props.overflow === "shrink") shrinkToFit(el);
  // Texts
  if (entry.original && Array.isArray(props.text)) applyText(el, entry, props.text);
  else if (entry.original) restoreText(el, entry);
  // Actions and animations work in "Procházet web" (and for visitors of the preview).
  applyAction(el, props.action);
  bindAnimations(el, props.animations);
  rendered.add(el);
}
function shrinkToFit(el) {
  const ratio = Math.min(1, el.clientWidth / Math.max(1, el.scrollWidth), el.clientHeight / Math.max(1, el.scrollHeight));
  if (ratio < 0.999) {
    const cur = appliedStyles.get(el) || {};
    const size = parseFloat(cs(el).fontSize) * ratio;
    writeStyles(el, Object.assign({}, cur, { "font-size": `${round(size, 2)}px` }));
  }
}
function restoreElement(el) {
  writeStyles(el, {});
  placeStill(el, null);
  restoreAttrs(el, ["data-ct"]);
  const key = el.getAttribute("data-ct");
  const entry = key && store.catalog[key];
  if (entry && entry.original) restoreText(el, entry);
  bindAnimations(el, null);
}

/* ---------- texts ---------- */

const textNodes = new WeakMap();
const appliedText = new WeakMap();
const textEdges = new WeakMap();
function splitEdge(value) {
  const m = String(value ?? "").match(/^(\s*)([\s\S]*?)(\s*)$/);
  return { lead: m[1], core: m[2], trail: m[3] };
}
/** Indentation around the site's own text. Spaces the user types belong to the text, not to this edge. */
function edgeOf(node, originalCore) {
  let edge = textEdges.get(node);
  if (edge) return edge;
  const parts = splitEdge(node.nodeValue);
  if (parts.core !== originalCore && !appliedText.has(node)) return null;
  edge = { lead: parts.lead, trail: parts.trail };
  textEdges.set(node, edge);
  return edge;
}
function visibleTextNodes(el) {
  const out = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || SKIP_TEXT.has(parent.tagName)) continue;
    if (parent.closest("svg, script, style, textarea, input, select")) continue;
    if (!String(n.nodeValue).trim() && !appliedText.has(n)) continue;
    out.push(n);
  }
  return out;
}
function segmentsOf(el, entry) {
  let nodes = textNodes.get(el);
  if (!nodes || nodes.some((n) => !n.isConnected || !el.contains(n))) {
    nodes = ownTextNodes(el);
    if (nodes.length !== entry.original.length) nodes = visibleTextNodes(el);
    if (nodes.length !== entry.original.length) return null;
    textNodes.set(el, nodes);
  }
  return nodes;
}
function applyText(el, entry, segments) {
  const nodes = segmentsOf(el, entry);
  if (!nodes) return;
  nodes.forEach((node, i) => {
    const want = String(segments[i] ?? entry.original[i] ?? "");
    const edge = edgeOf(node, entry.original[i]);
    if (!edge) return;
    const next = edge.lead + want + edge.trail;
    if (node.nodeValue === next) {
      appliedText.set(node, want);
      return;
    }
    const applied = appliedText.get(node);
    const { core } = splitEdge(node.nodeValue);
    const stillOurs = applied !== undefined && (node.nodeValue === edge.lead + String(applied) + edge.trail || core === applied);
    const stillOriginal = core === entry.original[i];
    // Leave text the page itself replaced. Everything we wrote, including a trailing space, stays editable.
    if (!stillOurs && !stillOriginal) return;
    node.__ctOwn = 1;
    node.nodeValue = next;
    appliedText.set(node, want);
  });
}
function restoreText(el, entry) {
  const nodes = segmentsOf(el, entry);
  if (!nodes) return;
  nodes.forEach((node, i) => {
    if (appliedText.get(node) === undefined) return;
    const edge = textEdges.get(node) || { lead: "", trail: "" };
    const back = edge.lead + entry.original[i] + edge.trail;
    if (node.nodeValue !== back) {
      node.__ctOwn = 1;
      node.nodeValue = back;
    }
    appliedText.delete(node);
  });
}

/* ---------- images ---------- */

function renderImage(el, img, st) {
  if (el.tagName.toLowerCase() !== "img") return;
  if (img.media) {
    const url = media.urlFor(img.media);
    if (url) {
      writeAttr(el, "src", url);
      dropAttr(el, "srcset");
      dropAttr(el, "sizes");
      const picture = el.parentElement && el.parentElement.tagName.toLowerCase() === "picture" ? el.parentElement : null;
      if (picture) picture.querySelectorAll("source").forEach((s) => {
        dropAttr(s, "srcset");
        rendered.add(s);
      });
    }
  }
  if (typeof img.alt === "string") writeAttr(el, "alt", img.alt);
  if (img.focal) {
    st["object-position"] = `${clamp(num(img.focal.x, 50), 0, 100)}% ${clamp(num(img.focal.y, 50), 0, 100)}%`;
    st["object-fit"] = img.fit || "cover";
  }
}

/* ---------- actions ---------- */

const INTERACTIVE = "a[href], button, input, select, textarea, summary, [role=button], [role=link]";
function applyAction(el, action) {
  const active = action && action.id && (action.replace || !el.matches(INTERACTIVE));
  if (active) {
    writeAttr(el, "data-ct-action", action.id);
    if (!el.matches(INTERACTIVE)) {
      writeAttr(el, "role", el.getAttribute("role") || "button");
      writeAttr(el, "tabindex", el.getAttribute("tabindex") || "0");
    }
  } else if (el.hasAttribute("data-ct-action")) {
    writeAttr(el, "data-ct-action", null);
    writeAttr(el, "role", null);
    writeAttr(el, "tabindex", null);
  }
}
let actionsEnabled = () => true;
function runAction(el, event) {
  const key = el.getAttribute("data-ct");
  if (!key) return false;
  const win = winOf(el);
  const action = resolveProps(key, pageOfWin(win), deviceOfWin(win), activeEdits()).props.action;
  if (!action) return false;
  const p = action.params || {};
  switch (action.id) {
    case "link-page":
      if (!p.path) return false;
      win.location.assign(p.path);
      return true;
    case "scroll-to": {
      const target = p.target && query(el.ownerDocument, "#" + CSS.escape(p.target));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return !!target;
    }
    case "call":
      if (!p.phone) return false;
      win.location.href = "tel:" + String(p.phone).replace(/[^\d+]/g, "");
      return true;
    case "email":
      if (!p.email) return false;
      win.location.href = "mailto:" + encodeURIComponent(p.email).replace(/%40/g, "@");
      return true;
    case "open-url": {
      const url = safeUrl(p.url || "");
      if (!url || url.startsWith("media:")) return false;
      if (p.newWindow) win.open(url, "_blank", "noopener");
      else win.location.assign(url);
      return true;
    }
    default:
      return false; // saved actions from the agent are implemented in the site's own code
  }
}
function installActionHandler(doc) {
  const onClick = (event) => {
    if (!actionsEnabled()) return;
    const el = event.target && event.target.closest && event.target.closest("[data-ct-action]");
    if (el && runAction(el, event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target && event.target.matches && event.target.matches("[data-ct-action][role=button]")) onClick(event);
  }, true);
}

/* ---------- still region: a marked part stays at the rest pose while the rest keeps moving ---------- */

function stillIsDraw(s) {
  return !!(s && Array.isArray(s.strokes) && s.strokes.some((st) => st && Array.isArray(st.pts) && st.pts.length));
}
function stillBrushOf(s) {
  const n = Number(s && s.brush);
  return Number.isFinite(n) ? clamp(n, 1, 40) : 6;
}
function validStill(s) {
  if (stillIsDraw(s)) return true;
  if (!s || typeof s !== "object") return false;
  const x = Number(s.x);
  const y = Number(s.y);
  const w = Number(s.w);
  const h = Number(s.h);
  return [x, y, w, h].every((n) => Number.isFinite(n)) && w >= 2 && h >= 2 && x < 100 && y < 100;
}
function stillStamp(s) {
  if (!s) return "";
  if (stillIsDraw(s)) {
    const n = s.strokes.reduce((a, st) => a + (st.pts ? st.pts.length : 0), 0);
    const p = s.strokes[0] && s.strokes[0].pts && s.strokes[0].pts[0];
    return `d${s.strokes.length}:${n}:${stillBrushOf(s)}:${p ? p.join(",") : ""}`;
  }
  return `r${s.x}:${s.y}:${s.w}:${s.h}`;
}
function shiftStill(still, dx, dy) {
  return {
    brush: stillBrushOf(still),
    strokes: still.strokes.map((s) => ({ pts: (s.pts || []).map(([x, y]) => [round(num(x) + dx, 1), round(num(y) + dy, 1)]) })),
  };
}
function stillSvg(still, w, h, mode) {
  const brush = stillBrushOf(still);
  const sw = Math.max(1, (brush / 100) * Math.min(Math.max(1, w), Math.max(1, h)));
  const ink = mode === "hole" ? "black" : mode === "keep" ? "white" : "#6fb7ff";
  const paths = (still.strokes || []).filter((s) => s && s.pts && s.pts.length).map((s) => {
    const d = s.pts.map((p, i) => `${i ? "L" : "M"}${round((num(p[0]) / 100) * w, 2)} ${round((num(p[1]) / 100) * h, 2)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${round(sw, 2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  const vb = `0 0 ${Math.max(1, round(w, 2))} ${Math.max(1, round(h, 2))}`;
  if (mode === "hole") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="none"><defs><mask id="ct-still"><rect width="100%" height="100%" fill="white"/>${paths}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#ct-still)"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="none">${paths}</svg>`;
}
function stillMaskUrl(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function normStill(x1, y1, x2, y2) {
  const x = clamp(Math.min(x1, x2), 0, 100);
  const y = clamp(Math.min(y1, y2), 0, 100);
  const r = clamp(Math.max(x1, x2), 0, 100);
  const b = clamp(Math.max(y1, y2), 0, 100);
  return { x: round(x, 1), y: round(y, 1), w: round(Math.max(0, r - x), 1), h: round(Math.max(0, b - y), 1) };
}
function stillMaskStyles(still, el) {
  if (stillIsDraw(still)) {
    const w = Math.max(1, (el && el.offsetWidth) || 1);
    const h = Math.max(1, (el && el.offsetHeight) || 1);
    const url = stillMaskUrl(stillSvg(still, w, h, "hole"));
    return {
      "mask-image": url,
      "-webkit-mask-image": url,
      "mask-size": "100% 100%",
      "-webkit-mask-size": "100% 100%",
      "mask-repeat": "no-repeat",
      "-webkit-mask-repeat": "no-repeat",
      "mask-position": "0 0",
      "-webkit-mask-position": "0 0",
    };
  }
  const x = round(clamp(num(still.x), 0, 99), 2);
  const y = round(clamp(num(still.y), 0, 99), 2);
  const w = round(clamp(num(still.w), 1, 100 - x), 2);
  const h = round(clamp(num(still.h), 1, 100 - y), 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path fill="white" fill-rule="evenodd" d="M0 0 H100 V100 H0 Z M${x} ${y} H${round(x + w, 2)} V${round(y + h, 2)} H${x} Z"/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return {
    "mask-image": url,
    "-webkit-mask-image": url,
    "mask-size": "100% 100%",
    "-webkit-mask-size": "100% 100%",
    "mask-repeat": "no-repeat",
    "-webkit-mask-repeat": "no-repeat",
    "mask-position": "0 0",
    "-webkit-mask-position": "0 0",
  };
}
function nodeMoves(node) {
  const c = node.ownerDocument.defaultView.getComputedStyle(node);
  if (c.animationName && c.animationName !== "none") {
    let frames = [];
    try {
      const running = node.getAnimations ? node.getAnimations() : [];
      for (const a of running) {
        const list = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
        frames = frames.concat(list);
      }
    } catch {}
    if (!frames.length) return true;
    if (frames.some((f) => f && ["transform", "translate", "rotate", "scale", "left", "top", "right", "bottom"].some((k) => f[k] != null && f[k] !== ""))) return true;
  }
  if (c.transform && c.transform !== "none") return true;
  if (c.translate && c.translate !== "none") return true;
  if (c.rotate && c.rotate !== "none" && c.rotate !== "0deg") return true;
  return false;
}
const motionMemo = new WeakMap();
function motionRoot(el) {
  const cached = motionMemo.get(el);
  if (cached && cached.root && cached.root.isConnected) return cached.root;
  let root = el;
  let n = el;
  const doc = el.ownerDocument;
  while (n && n !== doc.body && n !== doc.documentElement) {
    if (!(n.hasAttribute && n.hasAttribute("data-ct-still")) && nodeMoves(n)) root = n;
    n = n.parentElement;
  }
  return root;
}
function layoutWithin(el, ancestor) {
  if (el === ancestor) return { x: 0, y: 0, w: el.offsetWidth, h: el.offsetHeight };
  const chain = [];
  let n = el;
  const doc = el.ownerDocument;
  while (n && n !== doc.body && n !== doc.documentElement) {
    chain.push(n);
    if (n === ancestor) break;
    n = n.offsetParent;
  }
  if (n === ancestor) {
    let x = 0;
    let y = 0;
    for (const node of chain) {
      if (node === ancestor) break;
      x += node.offsetLeft;
      y += node.offsetTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }
  const a = ancestor.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const sx = ancestor.offsetWidth ? a.width / ancestor.offsetWidth : 1;
  const sy = ancestor.offsetHeight ? a.height / ancestor.offsetHeight : 1;
  return { x: (r.left - a.left) / (sx || 1), y: (r.top - a.top) / (sy || 1), w: el.offsetWidth, h: el.offsetHeight };
}
function restBoxInDocument(el) {
  const root = motionRoot(el);
  const parent = root.offsetParent || el.ownerDocument.documentElement;
  const pr = parent.getBoundingClientRect();
  const sx = parent.offsetWidth ? pr.width / parent.offsetWidth : 1;
  const sy = parent.offsetHeight ? pr.height / parent.offsetHeight : 1;
  const local = layoutWithin(el, parent);
  return { left: pr.left + local.x * sx, top: pr.top + local.y * sy, width: Math.max(1, local.w * sx), height: Math.max(1, local.h * sy) };
}
function restViewportBox(el) {
  const inner = restBoxInDocument(el);
  if (!inner || !(inner.width > 1) || !(inner.height > 1)) return null;
  const v = el.ownerDocument === document ? { x: 0, y: 0, s: 1 } : viewBox();
  const left = v.x + inner.left * v.s;
  const top = v.y + inner.top * v.s;
  const width = inner.width * v.s;
  const height = inner.height * v.s;
  return { left, top, width, height, right: left + width, bottom: top + height };
}
function stillSpace(el) {
  if (S.stillDraw && S.stillEl === el) return boxOf(el);
  return restViewportBox(el);
}
function holdSheet(doc) {
  if (doc.getElementById("ct-still-hold-style")) return;
  const style = doc.createElement("style");
  style.id = "ct-still-hold-style";
  style.textContent = ".ct-still-hold,.ct-still-hold *{animation:none!important;transition:none!important;transform:none!important}html.ct-still-draw,html.ct-still-draw *{cursor:crosshair!important}";
  (doc.head || doc.documentElement).appendChild(style);
}
function holdMotion(el) {
  if (!el) return;
  const root = motionRoot(el);
  motionMemo.set(el, { root });
  holdSheet(el.ownerDocument);
  root.classList.add("ct-still-hold");
}
function releaseMotion(el) {
  if (!el) return;
  const cached = motionMemo.get(el);
  motionMemo.delete(el);
  if (cached && cached.root) cached.root.classList.remove("ct-still-hold");
}
const stillHosts = new Map();
const STILL_OFF = ["animation", "transition", "transform", "mask", "mask-image", "-webkit-mask", "-webkit-mask-image", "clip-path"];
function placeStill(el, still) {
  let host = stillHosts.get(el);
  if (!el || !el.isConnected || !validStill(still)) {
    if (host) host.remove();
    stillHosts.delete(el);
    return;
  }
  const root = motionRoot(el);
  const parent = root.offsetParent || el.parentElement;
  if (!parent || !(root.offsetWidth > 1) || !(el.offsetWidth > 1)) return;
  const doc = el.ownerDocument;
  if (!host || host.ownerDocument !== doc) {
    host = doc.createElement("div");
    host.setAttribute("data-ct-still", "");
    host.setAttribute("aria-hidden", "true");
    host.inert = true;
    stillHosts.set(el, host);
  }
  host.style.position = "absolute";
  host.style.left = root.offsetLeft + "px";
  host.style.top = root.offsetTop + "px";
  host.style.width = root.offsetWidth + "px";
  host.style.height = root.offsetHeight + "px";
  host.style.margin = "0";
  host.style.padding = "0";
  host.style.border = "0";
  host.style.pointerEvents = "none";
  host.style.overflow = "visible";
  host.style.animation = "none";
  host.style.transition = "none";
  host.style.transform = "none";
  host.style.background = "none";
  const z = doc.defaultView.getComputedStyle(root).zIndex;
  host.style.zIndex = z !== "auto" && Number.isFinite(parseInt(z, 10)) ? String(parseInt(z, 10) + 1) : "1";
  if (host.parentElement !== parent) parent.appendChild(host);
  const local = layoutWithin(el, root);
  const drawn = stillIsDraw(still);
  if (drawn) host.style.clipPath = "none";
  else {
    const rw = root.offsetWidth || 1;
    const rh = root.offsetHeight || 1;
    const pad = 0.4;
    const mx = (local.x / rw) * 100 + num(still.x) * (local.w / rw) - pad;
    const my = (local.y / rh) * 100 + num(still.y) * (local.h / rh) - pad;
    const mw = num(still.w) * (local.w / rw) + pad * 2;
    const mh = num(still.h) * (local.h / rh) + pad * 2;
    host.style.clipPath = `inset(${round(my, 2)}% ${round(100 - mx - mw, 2)}% ${round(100 - my - mh, 2)}% ${round(mx, 2)}%)`;
  }
  const sig = `${el.tagName}|${el.getAttribute("src") || ""}|${el.className}|${el.childElementCount}`;
  let clone = host.firstElementChild;
  if (!clone || clone.getAttribute("data-ct-sig") !== sig) {
    const deep = el.tagName !== "IMG" && el.tagName !== "VIDEO" && el.tagName !== "CANVAS";
    clone = el.cloneNode(deep);
    clone.removeAttribute("id");
    clone.removeAttribute("data-ct");
    clone.setAttribute("data-ct-sig", sig);
    clone.setAttribute("data-ct-still-clone", "");
    if (clone.querySelectorAll) {
      clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      clone.querySelectorAll("[data-ct]").forEach((n) => n.removeAttribute("data-ct"));
    }
    host.replaceChildren(clone);
  }
  const pin = (node, source) => {
    for (const prop of STILL_OFF) node.style.setProperty(prop, "none", "important");
    if (source) {
      node.style.translate = source.style.translate || "none";
      node.style.rotate = source.style.rotate || "none";
      node.style.scale = source.style.scale || "none";
      node.style.transformOrigin = doc.defaultView.getComputedStyle(source).transformOrigin;
    }
  };
  clone.style.position = "absolute";
  clone.style.left = local.x + "px";
  clone.style.top = local.y + "px";
  clone.style.width = local.w + "px";
  clone.style.height = local.h + "px";
  clone.style.margin = "0";
  clone.style.maxWidth = "none";
  clone.style.maxHeight = "none";
  pin(clone, el);
  if (clone.querySelectorAll) clone.querySelectorAll("*").forEach((n) => pin(n, null));
  if (drawn) {
    const url = stillMaskUrl(stillSvg(still, local.w, local.h, "keep"));
    for (const prop of ["mask-image", "-webkit-mask-image"]) clone.style.setProperty(prop, url, "important");
    for (const prop of ["mask-size", "-webkit-mask-size"]) clone.style.setProperty(prop, "100% 100%", "important");
    for (const prop of ["mask-repeat", "-webkit-mask-repeat"]) clone.style.setProperty(prop, "no-repeat", "important");
    for (const prop of ["mask-position", "-webkit-mask-position"]) clone.style.setProperty(prop, "0 0", "important");
  }
}

/* ---------- animations (Web Animations API, added on top of the element's own values) ---------- */

const BUILTIN_ANIMATIONS = [
  { id: "fade-up", type: "enter", name: "Vyjetí zdola", duration: 700, delay: 0, easing: "cubic-bezier(.22,1,.36,1)", changes: "průhlednost, posun", replace: [{ opacity: 0 }, { opacity: 1 }], add: [{ translate: "0px 28px" }, { translate: "0px 0px" }], builtin: true },
  { id: "fade-in", type: "enter", name: "Prolnutí", duration: 600, easing: "ease-out", changes: "průhlednost", replace: [{ opacity: 0 }, { opacity: 1 }], builtin: true },
  { id: "scale-in", type: "enter", name: "Přiblížení", duration: 600, easing: "cubic-bezier(.22,1,.36,1)", changes: "průhlednost, velikost", replace: [{ opacity: 0 }, { opacity: 1 }], add: [{ scale: "0.9" }, { scale: "1" }], builtin: true },
  { id: "draw-in", type: "enter", name: "Nakreslení (odkrytí zleva)", duration: 900, easing: "cubic-bezier(.65,0,.35,1)", changes: "ořez", replace: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], builtin: true },
  { id: "slide-left", type: "enter", name: "Vyjetí zprava", duration: 700, easing: "cubic-bezier(.22,1,.36,1)", changes: "průhlednost, posun", replace: [{ opacity: 0 }, { opacity: 1 }], add: [{ translate: "48px 0px" }, { translate: "0px 0px" }], builtin: true },
  { id: "hover-lift", type: "hover", name: "Nadzvednutí", duration: 220, easing: "ease-out", changes: "posun", add: [{ translate: "0px 0px" }, { translate: "0px -6px" }], builtin: true },
  { id: "hover-grow", type: "hover", name: "Zvětšení", duration: 220, easing: "ease-out", changes: "velikost", add: [{ scale: "1" }, { scale: "1.05" }], builtin: true },
  { id: "hover-tilt", type: "hover", name: "Naklonění", duration: 220, easing: "ease-out", changes: "otočení", add: [{ rotate: "0deg" }, { rotate: "-3deg" }], builtin: true },
  { id: "click-pulse", type: "click", name: "Pulz", duration: 320, easing: "ease-out", changes: "velikost", add: [{ scale: "1" }, { scale: "0.94" }, { scale: "1" }], builtin: true },
  { id: "click-shake", type: "click", name: "Zatřesení", duration: 420, easing: "ease-in-out", changes: "posun", add: [{ translate: "0px 0px" }, { translate: "-6px 0px" }, { translate: "6px 0px" }, { translate: "-3px 0px" }, { translate: "0px 0px" }], builtin: true },
];
let registry = { actions: [], animations: [] };
const animationDef = (id) => registry.animations.find((a) => a.id === id) || BUILTIN_ANIMATIONS.find((a) => a.id === id);
function playAnimation(el, a, opts = {}) {
  const def = animationDef(a.id);
  if (!def || !el.animate) return [];
  const timing = { duration: clamp(num(a.duration, def.duration || 500), 0, 20000), delay: clamp(num(a.delay, def.delay || 0), 0, 20000), easing: a.easing || def.easing || "ease", fill: opts.fill || "none", direction: opts.reverse ? "reverse" : "normal" };
  const out = [];
  try {
    if (def.replace) out.push(el.animate(def.replace, Object.assign({}, timing, { composite: "replace" })));
    if (def.add) out.push(el.animate(def.add, Object.assign({}, timing, { composite: "add" })));
  } catch {}
  return out;
}
const animBound = new WeakMap();
const enteredOnce = new WeakSet();
function bindAnimations(el, anims) {
  const sig = JSON.stringify(anims || null);
  const cur = animBound.get(el);
  if (cur && cur.sig === sig) return;
  if (cur) cur.off();
  if (!anims || isEmptyObj(anims)) {
    animBound.delete(el);
    return;
  }
  const offs = [];
  const win = winOf(el);
  if (anims.enter && anims.enter.id && !enteredOnce.has(el)) {
    const io = new win.IntersectionObserver((list) => {
      if (list.some((e) => e.isIntersecting)) {
        io.disconnect();
        enteredOnce.add(el);
        playAnimation(el, anims.enter);
      }
    }, { threshold: 0.15 });
    io.observe(el);
    offs.push(() => io.disconnect());
  }
  if (anims.hover && anims.hover.id) {
    let running = [];
    const enter = () => {
      running.forEach((a) => a.cancel());
      running = playAnimation(el, anims.hover, { fill: "forwards" });
    };
    const leave = () => {
      running.forEach((a) => a.cancel());
      running = playAnimation(el, anims.hover, { reverse: true });
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    offs.push(() => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      running.forEach((a) => a.cancel());
    });
  }
  if (anims.click && anims.click.id) {
    const click = () => actionsEnabled() && playAnimation(el, anims.click);
    el.addEventListener("click", click);
    offs.push(() => el.removeEventListener("click", click));
  }
  animBound.set(el, { sig, off: () => offs.forEach((f) => f()) });
}

/* ---------- tokens on :root ---------- */

function applyTokens(doc, edits) {
  const root = doc.documentElement;
  const st = {};
  for (const [name, t] of Object.entries(edits.tokens || {})) {
    const def = allTokens(edits)[name];
    if (!def || t.value === undefined) continue;
    const value = String(t.value);
    if (value.length > 200 || /[;{}<>]/.test(value)) continue;
    st[def.var] = value;
  }
  writeStyles(root, st);
  if (!isEmptyObj(st)) rendered.add(root);
}

/* ---------- drawings added to the page ----------
 * One layer at the end of <body>, outside the site's own markup. Each drawing is pinned to an anchor element:
 * x and y are its centre in % of the anchor box and w its width at the anchor width refW, so it follows the section
 * on every screen. Moves, sizes, rotation and animations on top of that are ordinary element edits. */

const ADDED_LAYER = "creatool-added";
const addedWatched = new WeakSet();
function anchorOf(el) {
  const id = el && el.getAttribute && el.getAttribute("data-ct-added");
  if (!id) return null;
  const a = (activeEdits().added || []).find((x) => x.id === id);
  return a ? query(el.ownerDocument, a.anchor) : null;
}
function showModelStops(doc) {
  if (S.hidden) return false;
  const root = doc && doc.documentElement;
  if (root && root.classList.contains("ct-mode-model")) return true;
  return doc === document && !isChild;
}
function renderAdded(doc, edits) {
  const page = pageOfWin(doc.defaultView);
  const list = (edits.added || []).filter((a) => a && a.id && (a.art || a.kind === "text" || a.kind === "model") && addedOnPage(a, page));
  let layer = doc.getElementById(ADDED_LAYER);
  if (!list.length) {
    if (layer) layer.replaceChildren();
    placeAdded(doc, edits);
    return;
  }
  if (!layer) {
    layer = doc.createElement("div");
    layer.id = ADDED_LAYER;
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = `position:absolute;left:0;top:0;width:100%;height:0;overflow:visible;pointer-events:none;z-index:${Math.round(num(cfg.addedLayerZ, 40))}`;
  }
  if (!layer.isConnected) doc.body.append(layer);
  const seen = new Set();
  const device = deviceOfWin(doc.defaultView);
  const showStops = showModelStops(doc);
  const jobs = [];
  for (const a of list) {
    const live = resolvedAdded(a, device);
    if (live.removed) continue;
    if (a.kind === "model" && showStops && Array.isArray(live.stops) && live.stops.length > 1) {
      live.stops.forEach((stop, index) => jobs.push({ a, stop, index }));
      continue;
    }
    jobs.push({ a, stop: null, index: 0 });
  }
  for (const job of jobs) {
    const a = job.a;
    const stopKey = job.stop ? job.stop.id : "";
    let node = Array.from(layer.children).find((n) => n.getAttribute("data-ct-added") === a.id && (n.getAttribute("data-ct-stop") || "") === stopKey);
    if (!node) {
      node = doc.createElement("span");
      node.className = "ct-added";
      node.setAttribute("data-ct-added", a.id);
      node.setAttribute("data-creatool-id", "ct-add-" + a.id);
      layer.append(node);
    }
    if (stopKey) node.setAttribute("data-ct-stop", stopKey);
    else node.removeAttribute("data-ct-stop");
    node.setAttribute("data-ct-page", a.page);
    if (a.kind === "text") {
      // Text goes in as a text node, never as HTML.
      const text = String(a.text ?? "");
      if (node.textContent !== text) node.textContent = text;
      const t = a.style || {};
      node.setAttribute("data-kind", "text");
      node.setAttribute("data-creatool-label", "Přidaný text · „" + text.replace(/\s+/g, " ").slice(0, 50) + "“");
      node.style.setProperty("--ct-font", t.font ? `"${String(t.font).replace(/["\\]/g, "")}", sans-serif` : "inherit");
      node.style.setProperty("--ct-color", colorOf(t.color, edits) || "#111111");
      node.style.setProperty("--ct-weight", String(clamp(Math.round(num(t.weight, 400) / 100) * 100, 100, 900)));
      node.style.setProperty("--ct-style", t.italic ? "italic" : "normal");
      node.style.setProperty("--ct-align", ["left", "center", "right"].includes(t.align) ? t.align : "left");
      node.style.setProperty("--ct-tt", t.upper ? "uppercase" : "none");
      node.style.setProperty("--ct-lh", String(clamp(num(t.lineHeight, 1.2), 0.7, 3)));
    } else if (a.kind !== "model") {
      const url = safeUrl(a.art.src || "");
      node.setAttribute("data-kind", "art");
      node.setAttribute("data-creatool-label", "Přidaný prvek · " + String(a.art.name || "kresba").slice(0, 80));
      node.style.setProperty("--ct-art", url ? cssUrl(url) : "none");
      node.style.setProperty("--ct-color", colorOf(a.art.color, edits) || "#111111");
      node.style.setProperty("--ct-ratio", String(round(clamp(num(a.art.ratio, 1), 0.05, 20), 4)));
    } else {
      const live = resolvedAdded(a, device);
      const model = live.model || {};
      const stop = job.stop;
      node.setAttribute("data-kind", "model");
      node.setAttribute("data-creatool-label", "3D model · " + String(model.name || "model").slice(0, 80));
      node.style.setProperty("--ct-ratio", "0.9");
      let bar = node.querySelector(".ct-model-bar");
      let canvas = node.querySelector("canvas");
      if (!bar) {
        bar = doc.createElement("div");
        bar.className = "ct-model-bar";
        node.append(bar);
      }
      const deg = (rad) => Math.round(num(rad) * 180 / Math.PI);
      const order = (Array.isArray(live.stops) ? live.stops : []).map((s, n) => ({ id: s.id, y: num(s.y), x: num(s.x), n })).sort((p, q) => p.y - q.y || p.x - q.x || p.n - q.n);
      const place = stop ? order.findIndex((row) => row.id === stop.id) + 1 : 0;
      let name = bar.querySelector(".ct-model-name");
      if (!name) {
        bar.replaceChildren();
        name = doc.createElement("span");
        name.className = "ct-model-name";
        bar.append(name);
      }
      name.textContent = stop ? `Pozice ${place} · ${deg(stop.ry)}°` : String(model.name || "3D model");
      let scaleBtn = node.querySelector(".ct-model-scale");
      if (!scaleBtn) {
        scaleBtn = doc.createElement("button");
        scaleBtn.type = "button";
        scaleBtn.className = "ct-model-scale";
        scaleBtn.textContent = "⤡";
        scaleBtn.title = "Změnit velikost této zastávky";
        scaleBtn.setAttribute("aria-label", "Změnit velikost");
        node.append(scaleBtn);
      }
      scaleBtn.setAttribute("data-ct-scale", a.id);
      if (stop) scaleBtn.setAttribute("data-ct-stop", stop.id);
      else scaleBtn.removeAttribute("data-ct-stop");
      if (!canvas) {
        canvas = doc.createElement("canvas");
        node.append(canvas);
      }
      canvas.setAttribute("data-ct-orbit", a.id);
      if (stop) canvas.setAttribute("data-ct-stop", stop.id);
      else canvas.removeAttribute("data-ct-stop");
      models.mount(canvas, a.id, stop && stop.id);
    }
    seen.add(node);
  }
  for (const node of Array.from(layer.children)) if (!seen.has(node)) node.remove();
  placeAdded(doc, edits);
  if (!addedWatched.has(doc)) {
    // Anchors also move without DOM changes (images loading, sticky sections), so the layer follows on its own.
    addedWatched.add(doc);
    const win = doc.defaultView;
    let frame = 0;
    const follow = () => {
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => placeAdded(doc));
    };
    win.addEventListener("scroll", follow, { passive: true });
    win.addEventListener("resize", follow);
    win.setInterval(() => placeAdded(doc), 500);
  }
}
function placeAdded(doc, edits = activeEdits()) {
  if (typeof models !== "undefined") models.syncGates(doc);
  const layer = doc.getElementById(ADDED_LAYER);
  if (!layer || !layer.children.length) return;
  const origin = layer.getBoundingClientRect();
  for (const node of Array.from(layer.children)) {
    const a = (edits.added || []).find((x) => x.id === node.getAttribute("data-ct-added"));
    const anchor = a && query(doc, a.anchor);
    const r = anchor && anchor.getBoundingClientRect();
    if (!a || !r || (!r.width && !r.height)) {
      node.style.display = "none";
      continue;
    }
    const device = deviceOfWin(doc.defaultView);
    const live = resolvedAdded(a, device);
    if (live.removed) {
      node.style.display = "none";
      continue;
    }
    let x = num(live.x);
    let y = num(live.y);
    const stopId = node.getAttribute("data-ct-stop");
    const showStops = showModelStops(doc);
    let pose = null;
    if (a.kind === "model" && stopId && Array.isArray(live.stops)) {
      const stop = live.stops.find((s) => s.id === stopId);
      if (stop) { x = num(stop.x); y = num(stop.y); pose = stop; }
    } else if (a.kind === "model" && !showStops && Array.isArray(live.stops) && live.stops.length > 1) {
      pose = models.blend(a, doc.defaultView);
      x = pose.x;
      y = pose.y;
    }
    const stopScale = a.kind === "model" ? num(pose && pose.s, 1) : 1;
    // On a narrower anchor the drawing shrinks less than the layout does.
    const f = num(a.refW) > 0 ? clamp(Math.sqrt(r.width / num(a.refW)), 0.45, 1.6) : 1;
    node.style.display = "";
    node.style.left = `${round(r.left - origin.left + (x / 100) * r.width, 1)}px`;
    node.style.top = `${round(r.top - origin.top + (y / 100) * r.height, 1)}px`;
    node.style.setProperty("--ct-w", `${round(num(live.w != null ? live.w : a.w, 120) * f * stopScale, 1)}px`);
    if (a.kind === "text") node.style.setProperty("--ct-size", `${round(Math.max(12, num((a.style || {}).size, 24) * f), 1)}px`);
  }
}

/* ---------- everything ---------- */

function addedOnPage(a, page) {
  if (a.page === "*" || a.page === page) return true;
  if (langOf(a.page) !== baseLang()) return false;
  return a.page === basePageOf(page);
}
function roleOnPage(entry, page) {
  if (!entry) return null;
  if (onPageOf(entry, page)) return "local";
  if (!entry.shared && entry.pages.includes(basePageOf(page)) && basePageOf(page) !== page) return "base";
  return null;
}
function applyAll(doc = document) {
  const edits = activeEdits();
  const win = doc.defaultView;
  const page = pageOfWin(win);
  const device = deviceOfWin(win);
  applyTokens(doc, edits);
  renderAdded(doc, edits);
  const seen = new Set([doc.documentElement]);
  const jobs = [];
  for (const [key, meta] of Object.entries(edits.elements)) {
    const entry = store.catalog[key];
    const role = roleOnPage(entry, page);
    if (role) jobs.push({ key, meta, entry, role });
  }
  jobs.sort((a, b) => (a.role === "base" ? 0 : 1) - (b.role === "base" ? 0 : 1));
  for (const job of jobs) {
    const el = query(doc, job.entry.selector);
    if (!el || isIgnored(el)) continue;
    if (job.role === "local") el.setAttribute("data-ct", job.key);
    const { props, from } = resolveProps(job.key, page, device, edits);
    const temp = previewOverrides.get(job.key);
    if (temp) Object.assign(props, temp);
    renderElement(el, job.entry, props, from, device, job.meta, edits);
    seen.add(el);
    if (props.shapeFix && el.parentElement) seen.add(el.parentElement);
    if (el.parentElement && el.parentElement.tagName.toLowerCase() === "picture") el.parentElement.querySelectorAll("source").forEach((s) => seen.add(s));
  }
  for (const key of previewOverrides.keys()) {
    if (edits.elements[key]) continue;
    const entry = store.catalog[key];
    const el = entry && query(doc, entry.selector);
    if (!el) continue;
    renderElement(el, entry, Object.assign({}, previewOverrides.get(key)), {}, device, null, edits);
    seen.add(el);
  }
  for (const el of Array.from(rendered)) {
    if (el.ownerDocument !== doc) continue;
    if (!el.isConnected) rendered.delete(el);
    else if (!seen.has(el)) {
      restoreElement(el);
      rendered.delete(el);
    }
  }
}
