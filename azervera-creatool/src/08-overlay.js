/* ---------- overlay: hover, selection with handles, shape points, guides, numbers, comments ---------- */

const overlayEl = h("div", { class: "overlay" });
let overlaySig = "";
const HANDLES = [["nw", 0, 0, "nwse"], ["n", 0.5, 0, "ns"], ["ne", 1, 0, "nesw"], ["e", 1, 0.5, "ew"], ["se", 1, 1, "nwse"], ["s", 0.5, 1, "ns"], ["sw", 0, 1, "nesw"], ["w", 0, 0.5, "ew"]];

const selectedEl = () => (S.sel ? elementFor(store.catalog[S.sel]) : null);
function shapeInfo(el, P) {
  const shape = P.shape && Array.isArray(P.shape.pts) ? P.shape : { mode: "clip", pts: RECT };
  const b = boxOf(el);
  if (!b) return null;
  const s = viewBox().s;
  const w = el.offsetWidth * s || b.width;
  const hgt = el.offsetHeight * s || b.height;
  let ox = b.left;
  let oy = b.top;
  if (shape.mode === "warp" && shape.pts.length === 4 && !same(shape.pts, RECT)) {
    ox = b.left - Math.min(...shape.pts.map((p) => (p[0] / 100) * w));
    oy = b.top - Math.min(...shape.pts.map((p) => (p[1] / 100) * hgt));
  } else if (b.width > w + 1 || b.height > hgt + 1) {
    // Scaled element: the shape follows the visible box.
    return { shape, ox: b.left, oy: b.top, w: b.width, h: b.height };
  }
  return { shape, ox, oy, w, h: hgt };
}
function horizontalMiss(b, frame, margin = 6) {
  return !!b && (b.right < frame.left + margin || b.left > frame.right - margin);
}
function frameMiss(b, frame, margin = 6) {
  return !!b && (horizontalMiss(b, frame, margin) || b.bottom < frame.top + margin || b.top > frame.bottom - margin);
}
/** Grab points for elements the device frame clips, so they can be dragged back in. */
function collectReach() {
  if (S.hidden || view.kind !== "frame" || !view.frame || !view.doc) return [];
  if (S.mode !== "element" && S.mode !== "model" && S.mode !== "text") return [];
  const frame = view.frame.getBoundingClientRect();
  const doc = view.doc;
  const page = curPage();
  const items = [];
  const take = (item) => {
    if (!item.b || !(item.b.width > 1 || item.b.height > 1)) return;
    const side = horizontalMiss(item.b, frame);
    if (item.kind === "tooth" && !side) return;
    if (!side && !frameMiss(item.b, frame)) return;
    item.side = side;
    items.push(item);
  };
  try {
    doc.querySelectorAll("[data-ct]").forEach((el) => {
      if (el.closest("[data-creatool-ignore], .tooth-frame, [data-ct-added]")) return;
      const key = el.getAttribute("data-ct");
      const entry = store.catalog[key];
      if (!entry || !onPageOf(entry, page)) return;
      const edited = hasEdits(key) || key === S.sel;
      let b = null;
      try { b = boxOf(el); } catch { return; }
      if (!edited && !horizontalMiss(b, frame)) return;
      take({ kind: "el", el, entry, b, label: entry.label || labelFor(el), priority: key === S.sel ? 0 : edited ? 3 : 4 });
    });
    doc.querySelectorAll("[data-ct-added]").forEach((el) => {
      const key = el.getAttribute("data-ct");
      const entry = (key && store.catalog[key]) || null;
      let b = null;
      try { b = boxOf(el); } catch { return; }
      const name = el.getAttribute("data-kind") === "model" ? "3D model" : (el.getAttribute("aria-label") || (el.innerText || "").replace(/\s+/g, " ").trim() || "přidaný prvek");
      take({ kind: "added", el, entry, b, label: name, priority: 2 });
    });
    if (S.mode === "model") {
      doc.querySelectorAll(".tooth-frame").forEach((el) => {
        const span = el.querySelector(".tooth-frame-bar span");
        let b = null;
        try { b = boxOf(el); } catch { return; }
        take({ kind: "tooth", el, entry: null, b, label: (span && span.textContent) || "3D zastávka", priority: 1 });
      });
    }
  } catch {
    return [];
  }
  items.sort((a, b) => a.priority - b.priority || Number(b.side) - Number(a.side));
  return items.slice(0, 10);
}
function reachSpot(frame, b, used) {
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const scores = [
    ["l", Math.abs(cx - frame.left)],
    ["r", Math.abs(frame.right - cx)],
    ["t", Math.abs(cy - frame.top)],
    ["b", Math.abs(frame.bottom - cy)],
  ];
  scores.sort((a, c) => a[1] - c[1]);
  const edge = scores[0][0];
  const n = used[edge]++;
  if (edge === "l" || edge === "r") {
    return {
      x: edge === "l" ? frame.left + 22 : frame.right - 22,
      y: Math.min(frame.bottom - 18, frame.top + 28 + n * 28),
    };
  }
  return {
    x: Math.min(frame.right - 48, frame.left + 88 + (n % 4) * 128),
    y: edge === "t" ? frame.top + 22 : frame.bottom - 22,
  };
}
function dragReach(item, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (item.kind === "tooth") {
    if (typeof item.el.__ctMove !== "function") return;
    const scale = view.scale || 1;
    if (view.frame) view.frame.style.pointerEvents = "none";
    let lx = event.clientX;
    let ly = event.clientY;
    const move = (e) => {
      const dx = (e.clientX - lx) / scale;
      const dy = (e.clientY - ly) / scale;
      lx = e.clientX;
      ly = e.clientY;
      if (dx || dy) item.el.__ctMove(dx, dy);
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      if (view.frame) view.frame.style.pointerEvents = "";
      if (typeof item.el.__ctSettle === "function") item.el.__ctSettle();
      drawOverlay(true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return;
  }
  const entry = item.entry || register(item.el, "el");
  if (!entry) return;
  interact.startMove(item.el, entry, event, view.doc, { listen: window, scale: view.scale || 1 });
  ui.select(entry.key);
}
function drawOverlay(force) {
  if (isChild) return;
  const reach = collectReach();
  const showing = !S.hidden && (S.mode !== "browse" || S.sel || reach.length);
  if (!showing) {
    if (overlaySig) overlayEl.replaceChildren();
    overlaySig = "";
    return;
  }
  const items = [];
  const vb = viewBox();
  const vw = innerWidth;
  const vh = innerHeight;
  const visible = (b) => b && b.bottom >= 0 && b.top <= vh && b.right >= 0 && b.left <= vw;
  const sel = selectedEl();
  const doc = view.doc;
  if (S.hovered && S.hovered !== sel && S.hovered.isConnected) {
    const b = boxOf(S.hovered);
    if (visible(b)) items.push({ k: "hover", el: S.hovered, b });
  }
  const sb = boxOf(sel);
  if (sb) items.push({ k: "sel", b: sb });
  const page = curPage();
  if (S.mode === "numbers" || S.mode === "text" || S.mode === "element") {
    doc.querySelectorAll("[data-ct]").forEach((el) => {
      const e = store.catalog[el.getAttribute("data-ct")];
      if (!e || !onPageOf(e, page)) return;
      const edited = hasEdits(e.key);
      if (S.mode === "text" && !e.t) return;
      if (S.mode === "element" && !(edited || e.key === S.sel)) return;
      const b = boxOf(el);
      if (visible(b)) items.push({ k: "badge", e, el, b, edited });
    });
  }
  const comments = store.edits.comments.filter((c) => c.page === page && c.status === "open");
  for (const c of comments) {
    const e = store.catalog[c.key];
    const el = e && elementFor(e);
    const b = boxOf(el);
    if (visible(b)) items.push({ k: "com", c, b });
  }
  for (const r of store.edits.requests) {
    if (r.status !== "pending" || (r.page !== page && r.scope !== "site")) continue;
    const e = store.catalog[r.elementId];
    const el = e && elementFor(e);
    const b = boxOf(el);
    if (!visible(b)) continue;
    if (r.type === "component") items.push({ k: "place", r, b });
    else items.push({ k: "pend", r, b });
  }
  const P = S.sel ? resolveProps(S.sel, page, curDevice(), store.edits).props : {};
  const shape = sel && S.shapeEdit && S.mode === "element" ? shapeInfo(sel, P) : null;
  const grid = store.settings.grid.on && S.mode === "element";
  const ghost = S.placing && S.placeAt && S.placeAt.doc === doc ? S.placeAt : null;
  const stillNow = S.stillNudge && stillIsDraw(S.stillNudge) ? S.stillNudge : S.stillDrag && S.stillDrag.w ? S.stillDrag : !S.stillDraw && validStill(P.still) ? P.still : null;
  const inkLive = S.stillDraw ? stillStamp({ brush: S.stillBrush, strokes: [...(S.stillInk || []), ...(S.stillStroke ? [S.stillStroke] : [])] }) : "";
  const sig = (ghost ? `ghost:${Math.round(ghost.x)}:${Math.round(ghost.y)}:${S.placing.kind || S.placing.art.src}:${S.placing.art ? S.placing.art.color : ""}|` : "") + (S.rotating ? `rot:${Math.round(S.rotating.deg * 10)}:${Math.round(S.rotating.x)}:${Math.round(S.rotating.y)}|` : "") + (S.stillDraw ? "still-draw|" + inkLive + "|" : "") + (stillNow ? `still:${stillStamp(stillNow)}|` : "") + items.map((i) => [i.k, i.e ? i.e.key + i.edited : "", i.c ? i.c.id : "", i.r ? i.r.id : "", Math.round(i.b.left), Math.round(i.b.top), Math.round(i.b.width), Math.round(i.b.height)].join(":")).join("|") +
    `|${S.sel}|${S.mode}|${S.hoverKind}|${JSON.stringify(S.guides)}|${S.paddingHover}|${shape ? JSON.stringify(shape) + S.shapePoint : ""}|${grid ? store.settings.grid.size + ":" + Math.round(view.win.scrollX) + ":" + Math.round(view.win.scrollY) + ":" + Math.round(vb.x) + ":" + Math.round(vb.y) : ""}|${reach.map((r) => `${r.kind}:${Math.round(r.b.left)}:${Math.round(r.b.top)}:${r.label}`).join(",")}`;
  if (sig === overlaySig && !force) return;
  overlaySig = sig;
  const px = (b) => ({ left: b.left + "px", top: b.top + "px", width: b.width + "px", height: b.height + "px" });
  const nodes = [];
  if (grid) {
    const size = store.settings.grid.size * vb.s;
    const g = h("div", { class: "gridlines" });
    g.style.backgroundSize = `${size}px ${size}px`;
    g.style.backgroundPosition = `${vb.x - (view.win.scrollX * vb.s) % size}px ${vb.y - (view.win.scrollY * vb.s) % size}px`;
    nodes.push(g);
  }
  for (const i of items) {
    if (i.k === "hover") {
      const id = i.el.getAttribute("data-ct");
      const e = id && store.catalog[id];
      const num = e ? (S.mode === "text" && e.t ? "T" + e.t : e.p ? "P" + e.p : e.t ? "T" + e.t : "") : "";
      nodes.push(h("div", { class: "box hover", style: px(i.b) }, h("span", {}, S.placing ? "Kresba se připne k: " + labelFor(i.el) : (num ? num + " · " : "") + labelFor(i.el))));
    } else if (i.k === "sel") {
      const box = h("div", { class: "box sel", style: px(i.b) });
      nodes.push(box);
      if (S.mode === "element" && !isClient() && !S.shapeEdit) {
        for (const [dir, fx, fy, cur] of HANDLES)
          nodes.push(h("div", { class: "handle", title: "Táhni: změna velikosti (Shift zamkne poměr, Alt od středu)", style: { left: i.b.left + fx * i.b.width + "px", top: i.b.top + fy * i.b.height + "px", cursor: cur + "-resize" }, onPointerdown: (e) => interact.startResize(dir, e) }));
        // Rotation knob above the box (below it when the box touches the top of the screen).
        const cx = i.b.left + i.b.width / 2;
        const above = i.b.top - 30 > 6;
        const ky = above ? i.b.top - 30 : i.b.bottom + 30;
        nodes.push(h("div", { class: "rot-stem", style: { left: cx + "px", top: (above ? ky : i.b.bottom) + "px", height: "30px" } }));
        nodes.push(h("div", { class: "rot", title: "Táhni: otočení (Shift po 15°, dvojklik vrátí na 0°)", style: { left: cx + "px", top: ky + "px" }, onPointerdown: (e) => interact.startRotate(e), onDblclick: (e) => interact.resetRotate(e) }));
      }
      if (S.paddingHover && sel) {
        const c = cs(sel);
        const s = vb.s;
        const pt = parseFloat(c.paddingTop) * s;
        const pr = parseFloat(c.paddingRight) * s;
        const pb = parseFloat(c.paddingBottom) * s;
        const pl = parseFloat(c.paddingLeft) * s;
        const b = i.b;
        nodes.push(h("div", { class: "box pad", style: px({ left: b.left, top: b.top, width: b.width, height: pt }) }), h("div", { class: "box pad", style: px({ left: b.left, top: b.bottom - pb, width: b.width, height: pb }) }), h("div", { class: "box pad", style: px({ left: b.left, top: b.top + pt, width: pl, height: b.height - pt - pb }) }), h("div", { class: "box pad", style: px({ left: b.right - pr, top: b.top + pt, width: pr, height: b.height - pt - pb }) }));
      }
    } else if (i.k === "badge") {
      const e = i.e;
      const label = S.mode === "text" ? "T" + e.t : e.p ? "P" + e.p : "T" + e.t;
      nodes.push(h("button", { type: "button", class: "badge" + (i.edited ? " changed" : "") + (e.key === S.sel ? " sel" : ""), style: { left: Math.max(4, i.b.left) + "px", top: Math.max(18, i.b.top) + "px" }, title: e.label,
        onPointerenter: () => { S.hovered = i.el; S.hoverKind = "badge"; },
        onPointerleave: () => { if (S.hovered === i.el) { S.hovered = null; S.hoverKind = null; } },
        onClick: () => ui.select(e.key) }, label));
    } else if (i.k === "com") {
      nodes.push(h("button", { type: "button", class: "badge com", title: i.c.text, style: { left: Math.max(4, i.b.right - 26) + "px", top: Math.max(18, i.b.top) + "px" }, onClick: () => { S.open.add("comments"); ui.select(i.c.key); } }, "K"));
    } else if (i.k === "pend") {
      nodes.push(h("button", { type: "button", class: "badge pend", title: "Čeká na implementaci: " + i.r.description, style: { left: Math.max(4, i.b.left) + "px", top: Math.max(18, i.b.bottom + 16) + "px" }, onClick: () => { S.panel = true; S.sel = null; S.hub = "requests"; ui.renderPanel(); } }, "čeká na implementaci"));
    } else if (i.k === "place") {
      const b = i.r.position === "before" ? { left: i.b.left, top: i.b.top - 36, width: i.b.width, height: 30 } : { left: i.b.left, top: i.b.bottom + 6, width: i.b.width, height: 30 };
      nodes.push(h("div", { class: "box place", style: px(b) }, h("span", {}, `Sem přijde komponenta „${i.r.componentName}“ · čeká na implementaci`)));
    }
  }
  if (shape) {
    const pts = shape.shape.pts.map(([x, y]) => [shape.ox + (x / 100) * shape.w, shape.oy + (y / 100) * shape.h]);
    pts.forEach(([x1, y1], i) => {
      const [x2, y2] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x2 - x1, y2 - y1);
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      nodes.push(h("div", { class: "edge", title: "Dvojklik přidá bod", style: { left: x1 + "px", top: y1 + "px", width: len + "px", transform: `rotate(${angle}deg)`, borderTop: "1px dashed #ff5100" }, onDblclick: (e) => interact.addPoint(i, e, shape) }));
    });
    pts.forEach(([x, y], i) => nodes.push(h("div", { class: "pt" + (S.shapePoint === i ? " on" : ""), title: `Bod ${i + 1} (Delete smaže)`, style: { left: x + "px", top: y + "px" }, onPointerdown: (e) => interact.startPoint(i, e, shape) })));
  }
  if (sel && S.mode === "element" && !isClient()) {
    const pctBox = (b, region) => ({ left: b.left + (region.x / 100) * b.width, top: b.top + (region.y / 100) * b.height, width: (region.w / 100) * b.width, height: (region.h / 100) * b.height });
    const inkNode = (b, still, hit) => {
      const node = h("div", { class: "still-ink" + (hit ? " hit" : ""), style: { left: b.left + "px", top: b.top + "px", width: b.width + "px", height: b.height + "px" } });
      node.innerHTML = stillSvg(still, b.width, b.height, "preview");
      if (hit) node.querySelectorAll("path").forEach((path) => path.addEventListener("pointerdown", (e) => interact.startStillAdjust("move", e)));
      return node;
    };
    if (S.stillDraw) {
      const b = boxOf(sel);
      if (b) {
        nodes.push(h("div", { class: "box still-target", style: px(b) }, h("span", {}, "Kresli tužkou část, která se nehýbe. Hotovo uloží, Esc zruší.")));
        const strokes = [...(S.stillInk || []), ...(S.stillStroke ? [S.stillStroke] : [])];
        if (strokes.length) nodes.push(inkNode(b, { brush: S.stillBrush, strokes }, false));
      }
    } else if (stillIsDraw(stillNow)) {
      const b = restViewportBox(sel);
      if (b) {
        const node = inkNode(b, stillNow, true);
        node.append(h("span", {}, "nehýbe se"));
        nodes.push(node);
      }
    } else if (validStill(P.still)) {
      const b = restViewportBox(sel);
      if (b) {
        nodes.push(h("div", { class: "box still", style: px(pctBox(b, P.still)), title: "Táhni: posun části, která se nehýbe", onPointerdown: (e) => interact.startStillAdjust("move", e) },
          h("span", {}, "nehýbe se"),
          h("i", { title: "Táhni: změna velikosti", onPointerdown: (e) => { e.stopPropagation(); interact.startStillAdjust("resize", e); } })));
      }
    }
  }
  for (const g of S.guides) {
    const t = (v, axis) => (axis === "x" ? vb.x + v * vb.s : vb.y + v * vb.s);
    if (g.kind === "v") nodes.push(h("div", { class: "guide", style: { left: t(g.x, "x") + "px", top: t(g.top, "y") + "px", width: "1px", height: Math.max(1, (g.bottom - g.top) * vb.s) + "px" } }, g.label ? h("span", { style: { left: "4px", top: "50%" } }, g.label) : null));
    if (g.kind === "h") nodes.push(h("div", { class: "guide", style: { left: t(g.left, "x") + "px", top: t(g.y, "y") + "px", height: "1px", width: Math.max(1, (g.right - g.left) * vb.s) + "px" } }, g.label ? h("span", { style: { top: "4px", left: "50%" } }, g.label) : null));
    if (g.kind === "spaceX") {
      const y = t((Math.max(g.a.top, g.b.top) + Math.min(g.a.bottom, g.b.bottom)) / 2, "y");
      nodes.push(h("div", { class: "guide", style: { left: t(g.a.right, "x") + "px", top: y + "px", height: "2px", width: Math.max(1, (g.b.left - g.a.right) * vb.s) + "px" } }, h("span", { style: { top: "4px", left: "4px" } }, `${g.gap} px = ${g.gap} px`)));
    }
    if (g.kind === "spaceY") {
      const x = t((Math.max(g.a.left, g.b.left) + Math.min(g.a.right, g.b.right)) / 2, "x");
      nodes.push(h("div", { class: "guide", style: { left: x + "px", top: t(g.a.bottom, "y") + "px", width: "2px", height: Math.max(1, (g.b.top - g.a.bottom) * vb.s) + "px" } }, h("span", { style: { left: "4px", top: "4px" } }, `${g.gap} px = ${g.gap} px`)));
    }
  }
  if (S.rotating) nodes.push(h("div", { class: "rot-lab", style: { left: S.rotating.x + "px", top: S.rotating.y + "px" } }, `${round(S.rotating.deg, 1)}°`));
  if (ghost && S.placing.kind === "text") {
    const x = vb.x + ghost.x * vb.s;
    const y = vb.y + ghost.y * vb.s;
    nodes.push(withVars(h("div", { class: "ghost-text", style: { left: x + "px", top: y + "px" } }, "Nový text"), { "--c": "#bfe0ff" }));
    nodes.push(h("div", { class: "ghost-lab", style: { left: x + "px", top: y + 24 + "px" } }, "Klikni pro přidání textu · Esc zruší"));
  } else if (ghost && S.placing.kind === "model") {
    const x = vb.x + ghost.x * vb.s;
    const y = vb.y + ghost.y * vb.s;
    const w = 120 * vb.s;
    nodes.push(h("div", { class: "ghost", style: { left: x + "px", top: y + "px", width: w + "px", height: w + "px" } }));
    nodes.push(h("div", { class: "ghost-lab", style: { left: x + "px", top: y + w / 2 + 10 + "px" } }, "Klikni pro přidání 3D modelu · Esc zruší"));
  } else if (ghost && S.placing.art) {
    const art = S.placing.art;
    const url = safeUrl(art.src || "");
    const w = defaultArtWidth(art.ratio) * vb.s;
    const hh = w / clamp(num(art.ratio, 1), 0.05, 20);
    const x = vb.x + ghost.x * vb.s;
    const y = vb.y + ghost.y * vb.s;
    nodes.push(withVars(h("div", { class: "ghost", style: { left: x + "px", top: y + "px", width: w + "px", height: hh + "px" } }), { "--c": resolveColor(art.color), "--src": url ? cssUrl(url) : "none" }));
    nodes.push(h("div", { class: "ghost-lab", style: { left: x + "px", top: y + hh / 2 + 10 + "px" } }, "Klikni pro přidání · Shift přidá další · Esc zruší"));
  }
  if (reach.length && view.frame) {
    const frame = view.frame.getBoundingClientRect();
    const used = { l: 0, r: 0, t: 0, b: 0 };
    for (const item of reach) {
      const spot = reachSpot(frame, item.b, used);
      const text = "mimo · " + String(item.label).replace(/\s+/g, " ").trim().slice(0, 32);
      nodes.push(h("button", { type: "button", class: "reach", title: "Táhni prvek zpátky do zobrazení. Počítač se nemění.", style: { left: spot.x + "px", top: spot.y + "px" }, onPointerdown: (e) => dragReach(item, e) }, text));
    }
  }
  overlayEl.replaceChildren(...nodes);
}
