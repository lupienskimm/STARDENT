/* ---------- interaction: picking, moving, resizing, shape points, keys, dropping images ---------- */

const childApi = () => {
  try {
    return view.kind === "frame" && view.win && view.win.__creatoolChild ? view.win.__creatoolChild : null;
  } catch {
    return null;
  }
};
/** Live preview while dragging; the owner of the document (this script or the one in the frame) writes the styles. */
function preview(key, props) {
  const child = childApi();
  if (child) child.preview(key, props ? JSON.stringify(props) : null);
  if (props) previewOverrides.set(key, props);
  else previewOverrides.delete(key);
  // Paint the framed page from here too. The copy inside the frame may not know a key that was just created.
  renderKey(key, (view && view.doc) || document);
}
function renderKey(key, doc) {
  const entry = store.catalog[key];
  const el = entry && elementFor(entry, doc);
  if (!el) return;
  const edits = activeEdits();
  const win = doc.defaultView;
  const { props, from } = resolveProps(key, pageOfWin(win), deviceOfWin(win), edits);
  const temp = previewOverrides.get(key);
  if (temp) Object.assign(props, temp);
  if (isEmptyObj(props)) {
    restoreElement(el);
    rendered.delete(el);
    return;
  }
  renderElement(el, entry, props, from, deviceOfWin(win), edits.elements[key], edits);
}

function topPoint(event) {
  const win = event.view;
  if (!win || win === window) return { x: event.clientX, y: event.clientY };
  const v = viewBox();
  return { x: v.x + event.clientX * v.s, y: v.y + event.clientY * v.s };
}
function stillCursor(el, on) {
  const doc = el && el.ownerDocument;
  if (doc && doc.documentElement) doc.documentElement.classList.toggle("ct-still-draw", !!on);
}
function cancelStillDraw() {
  const el = S.stillEl;
  S.stillDraw = false;
  S.stillDrag = null;
  S.stillStroke = null;
  S.stillInk = null;
  S.stillNudge = null;
  S.stillEl = null;
  stillCursor(el, false);
  releaseMotion(el);
}
function stillPoint(event, el) {
  const b = boxOf(el);
  if (!b || b.width < 2 || b.height < 2) return null;
  const p = topPoint(event);
  if (p.x < b.left - 8 || p.x > b.right + 8 || p.y < b.top - 8 || p.y > b.bottom + 8) return null;
  return [round(clamp(((p.x - b.left) / b.width) * 100, -2, 102), 1), round(clamp(((p.y - b.top) / b.height) * 100, -2, 102), 1)];
}
function pushStillPoint(stroke, pt) {
  if (!pt || stroke.pts.length > 600) return;
  const last = stroke.pts[stroke.pts.length - 1];
  if (last && Math.hypot(last[0] - pt[0], last[1] - pt[1]) < 0.35) return;
  stroke.pts.push(pt);
}
function toggleStillDraw(keep) {
  if (S.stillDraw) {
    if ((S.stillInk && S.stillInk.length) || (S.stillStroke && S.stillStroke.pts.length)) commitStill();
    else cancelStillDraw();
    ui.renderPanel();
    drawOverlay(true);
    return;
  }
  const el = selectedEl();
  if (!el) {
    ui.flashNotice("Nejdřív vyber prvek, na kterém část nakreslíš.");
    return;
  }
  const saved = S.sel ? resolveProps(S.sel, curPage(), curDevice(), store.edits).props.still : null;
  S.stillDraw = true;
  S.stillDrag = null;
  S.stillStroke = null;
  S.stillNudge = null;
  S.stillInk = keep && stillIsDraw(saved) ? JSON.parse(JSON.stringify(saved.strokes)) : [];
  if (saved && Number.isFinite(Number(saved.brush))) S.stillBrush = stillBrushOf(saved);
  S.stillEl = el;
  holdMotion(el);
  stillCursor(el, true);
  ui.renderPanel();
  drawOverlay(true);
}
function commitStill() {
  const strokes = (S.stillInk || []).filter((s) => s && s.pts && s.pts.length);
  const key = S.sel;
  const el = S.stillEl;
  S.stillDraw = false;
  S.stillStroke = null;
  S.stillInk = null;
  S.stillEl = null;
  stillCursor(el, false);
  releaseMotion(el);
  if (key && strokes.length) setProp(key, "still", { brush: S.stillBrush || 6, strokes }, { label: "Nehybná část" });
  ui.renderPanel();
  drawOverlay(true);
}
function clearStill(key) {
  cancelStillDraw();
  setProp(key, "still", null, { label: "Nehybná část" });
  ui.renderPanel();
  drawOverlay(true);
}

const interact = (() => {
  const attached = new Map();
  let hoverFrame = 0;
  let previewFrame = 0;
  const schedulePreview = (key, props) => {
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => preview(key, props));
  };
  const clientCan = (entry) => {
    const meta = entry && store.edits.elements[entry.key];
    return !!(meta && meta.lock === "client");
  };
  function pick(doc, x, y) {
    const sel = selectedEl();
    if (sel && sel.ownerDocument === doc && doc.elementsFromPoint(x, y).some((hit) => sel.contains(hit))) return sel;
    return candidatesAt(doc, x, y)[0] || null;
  }
  function attach(doc) {
    if (attached.has(doc)) return;
    const win = doc.defaultView;
    const onMove = (event) => {
      if (S.stillStroke && S.stillEl && S.stillEl.isConnected) {
        event.stopPropagation();
        pushStillPoint(S.stillStroke, stillPoint(event, S.stillEl));
        drawOverlay();
        return;
      }
      if (S.stillDraw) event.stopPropagation();
      if (S.placing && !event.buttons) {
        S.placeAt = { doc, x: event.clientX, y: event.clientY };
        drawOverlay();
      }
      if (event.buttons || !editingMode()) return;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => {
        if (isIgnored(event.target)) {
          S.hovered = null;
          return;
        }
        S.hovered = S.placing ? anchorAt(doc, event.clientX, event.clientY) : S.mode === "text" ? textAt(doc, event.clientX, event.clientY) : S.mode === "model" ? (event.target.closest && event.target.closest("[data-ct-added][data-kind=model]")) : pick(doc, event.clientX, event.clientY);
        S.hoverKind = S.mode;
      });
    };
    const onUp = (event) => {
      if (!S.stillStroke) return;
      event.preventDefault();
      event.stopPropagation();
      const stroke = S.stillStroke;
      S.stillStroke = null;
      if (stroke.pts.length) {
        S.stillInk = S.stillInk || [];
        if (S.stillInk.length < 80) S.stillInk.push(stroke);
      }
      ui.renderPanel();
      drawOverlay(true);
    };
    const onDown = (event) => {
      if (!editingMode() || event.button !== 0 || isIgnored(event.target) || viewState !== "draft") return;
      if (S.stillDraw && !isClient()) {
        const el = S.stillEl && S.stillEl.isConnected ? S.stillEl : selectedEl();
        const pt = el && el.ownerDocument === doc ? stillPoint(event, el) : null;
        if (pt) {
          event.preventDefault();
          event.stopPropagation();
          S.stillEl = el;
          S.stillStroke = { pts: [pt] };
          drawOverlay(true);
          return;
        }
        if ((S.stillInk && S.stillInk.length) || (S.stillStroke && S.stillStroke.pts.length)) commitStill();
        else {
          cancelStillDraw();
          ui.renderPanel();
          drawOverlay(true);
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      S.lastPoint = { x: event.clientX, y: event.clientY, doc };
      if (S.placing && !isClient()) {
        const placing = S.placing;
        const more = event.shiftKey && placing.art;
        if (!more) {
          S.placing = null;
          S.placeAt = null;
          ui.syncModeClasses();
        }
        if (placing.kind === "text") addTextAt(doc, event.clientX, event.clientY);
        else if (placing.kind === "model") addModelAt(doc, event.clientX, event.clientY, placing.model);
        else addArtAt(doc, event.clientX, event.clientY, placing.art);
        S.notice = { text: placing.kind === "text" ? "Text je přidaný. Přepiš ho v panelu, tam je i písmo, velikost a barva. Táhni ho myší, otáčí se tečkou nad rámečkem." : placing.kind === "model" ? "3D model je na stránce. Táhni přímo modelem pro otočení, lištou pro posun, úchyty mění velikost." : more ? "Přidáno. Se Shiftem přidáváš další, Esc přidávání ukončí." : "Prvek je přidaný. Táhni ho myší, úchyty mění velikost; barvu a kresbu změníš tady v panelu.", kind: "ok" };
        ui.renderPanel();
        drawOverlay(true);
        return;
      }
      if (isClient()) {
        // The client edits only what the owner unlocked: a text or an image.
        const img = doc.elementsFromPoint(event.clientX, event.clientY).find((x) => x.tagName && x.tagName.toLowerCase() === "img" && !isIgnored(x));
        const textEl = textAt(doc, event.clientX, event.clientY);
        const candidates = [textEl && register(textEl, "text", true), img && register(img, "el", true)].filter(Boolean);
        const allowed = candidates.find(clientCan);
        if (S.mode === "comment" && candidates[0]) {
          S.open.add("comments");
          ui.select(candidates[0].key);
          return;
        }
        if (!allowed) {
          if (candidates.length) ui.flashNotice("Tenhle prvek je zamčený. Upravit jde jen to, co ti majitel webu odemkl.");
          return;
        }
        ui.select(allowed.key);
        return;
      }
      if (S.mode === "text") {
        const added = doc.elementsFromPoint(event.clientX, event.clientY).find((n) => n.hasAttribute && n.hasAttribute("data-ct-added"));
        if (added) {
          ui.select(register(added, "el").key);
          return;
        }
        const el = textAt(doc, event.clientX, event.clientY);
        if (!el) return;
        ui.select(register(el, "text").key);
        return;
      }
      if (S.mode === "model") {
        const modelHit = event.target.closest && event.target.closest("[data-ct-added][data-kind=model]");
        if (!modelHit) return;
      }
      const addedHost = event.target.closest && event.target.closest("[data-ct-added]");
      const el = addedHost || pick(doc, event.clientX, event.clientY);
      if (!el) return;
      const entry = register(el, "el");
      if (S.mode === "comment") {
        S.open.add("comments");
        ui.select(entry.key);
        return;
      }
      if (S.sel !== entry.key) {
        S.childStack = [];
        ui.select(entry.key);
      }
      const editing3d = S.mode === "element" || S.mode === "model";
      const scaleHit = event.target.closest && event.target.closest(".ct-model-scale");
      if (scaleHit && editing3d) {
        models.beginScale(scaleHit.getAttribute("data-ct-scale"), scaleHit.getAttribute("data-ct-stop") || "", event);
        return;
      }
      const orbit = event.target.closest && event.target.closest("[data-ct-orbit]");
      if (orbit && editing3d) {
        models.beginOrbit(orbit.getAttribute("data-ct-orbit"), event, orbit.getAttribute("data-ct-stop"));
        return;
      }
      const stopId = addedHost && addedHost.getAttribute("data-ct-stop");
      if (stopId && editing3d && event.target.closest && event.target.closest(".ct-model-bar")) {
        models.beginMoveStop(addedHost.getAttribute("data-ct-added"), stopId, event);
        return;
      }
      if (!S.shapeEdit) startMove(el, entry, event, doc);
    };
    const block = (event) => {
      if (isIgnored(event.target)) return;
      if (editingMode() || viewState === "backup") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKey = (event) => keys(event);
    const onDragOver = (event) => {
      if (S.hidden || !event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
      event.preventDefault();
    };
    const onDrop = (event) => {
      if (S.hidden || !event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
      const file = Array.from(event.dataTransfer.files).find((f) => /^image\//.test(f.type) || /\.glb$/i.test(f.name) || f.type === "model/gltf-binary");
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      if (/\.glb$/i.test(file.name) || file.type === "model/gltf-binary") {
        models.add(file).then((rec) => {
          addModelAt(doc, event.clientX, event.clientY, rec);
          S.notice = { text: "3D model „" + rec.name + "“ je na stránce. Táhni jím pro otočení.", kind: "ok" };
          ui.renderPanel();
        }).catch((err) => ui.flashNotice(err.message || "Model se nepodařilo nahrát."));
        return;
      }
      const img = doc.elementsFromPoint(event.clientX, event.clientY).find((x) => x.tagName && x.tagName.toLowerCase() === "img" && !isIgnored(x));
      ui.dropImage(file, img || null);
    };
    const handlers = [["pointermove", onMove], ["pointerdown", onDown], ["pointerup", onUp], ["pointercancel", onUp], ["keydown", onKey], ["dragover", onDragOver], ["drop", onDrop]];
    for (const type of ["click", "dblclick", "dragstart", "selectstart", "submit", "auxclick", "contextmenu"]) handlers.push([type, block]);
    handlers.forEach(([t, f]) => doc.addEventListener(t, f, true));
    attached.set(doc, () => handlers.forEach(([t, f]) => doc.removeEventListener(t, f, true)));
    if (doc !== document) win.addEventListener("unload", () => detach(doc));
  }
  function detach(doc) {
    const off = attached.get(doc);
    if (off) off();
    attached.delete(doc);
  }

  function startMove(el, entry, event, doc, reach = null) {
    const key = entry.key;
    const win = doc.defaultView;
    const listen = (reach && reach.listen) || win;
    const scale = (reach && reach.scale) || 1;
    const P = resolveProps(key, curPage(), curDevice(), store.edits).props;
    const x0 = num(P.x);
    const y0 = num(P.y);
    const r0 = el.getBoundingClientRect();
    const sx = event.clientX;
    const sy = event.clientY;
    const targets = store.settings.snap && !snapOff(el) ? snapTargets(el) : [];
    let moved = false;
    let last = { x: x0, y: y0 };
    if (reach) lockFrame(true);
    const move = (e) => {
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 3) return;
      moved = true;
      doc.documentElement.classList.add("ct-dragging");
      let dx = (e.clientX - sx) / scale;
      let dy = (e.clientY - sy) / scale;
      const b = { left: r0.left + dx, top: r0.top + dy, width: r0.width, height: r0.height, right: r0.right + dx, bottom: r0.bottom + dy };
      const snap = snapBox(b, targets, { disabled: e.ctrlKey || e.metaKey || !store.settings.snap || snapOff(el), win });
      dx += snap.dx;
      dy += snap.dy;
      S.guides = snap.guides;
      last = { x: x0 + dx, y: y0 + dy };
      schedulePreview(key, { x: last.x, y: last.y });
    };
    const up = () => {
      listen.removeEventListener("pointermove", move, true);
      listen.removeEventListener("pointerup", up, true);
      listen.removeEventListener("pointercancel", up, true);
      if (reach) lockFrame(false);
      doc.documentElement.classList.remove("ct-dragging");
      cancelAnimationFrame(previewFrame);
      S.guides = [];
      if (moved) {
        previewOverrides.delete(key);
        const child = childApi();
        if (child) child.preview(key, null);
        setProps(key, { x: round(last.x), y: round(last.y), refW: round(parentWidth(el)) }, { label: "Posun" });
        ui.renderPanel();
      }
      drawOverlay(true);
    };
    listen.addEventListener("pointermove", move, true);
    listen.addEventListener("pointerup", up, true);
    listen.addEventListener("pointercancel", up, true);
  }

  function startStillAdjust(mode, event) {
    event.preventDefault();
    event.stopPropagation();
    const el = selectedEl();
    const key = S.sel;
    if (!el || !key || S.stillDraw) return;
    const P = resolveProps(key, curPage(), curDevice(), store.edits).props;
    const drawn = stillIsDraw(P.still);
    if (drawn && mode !== "move") return;
    if (!drawn && !validStill(P.still)) return;
    const base = drawn ? P.still : { x: num(P.still.x), y: num(P.still.y), w: num(P.still.w), h: num(P.still.h) };
    const sx = event.clientX;
    const sy = event.clientY;
    let last = base;
    const move = (e) => {
      const b = stillSpace(el);
      if (!b || !b.width || !b.height) return;
      const p = topPoint(e);
      const dx = ((p.x - sx) / b.width) * 100;
      const dy = ((p.y - sy) / b.height) * 100;
      if (drawn) {
        last = shiftStill(base, dx, dy);
        S.stillNudge = last;
      } else {
        last = mode === "move"
          ? normStill(base.x + dx, base.y + dy, base.x + base.w + dx, base.y + base.h + dy)
          : normStill(base.x, base.y, base.x + base.w + dx, base.y + base.h + dy);
        S.stillDrag = last;
      }
      drawOverlay();
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      S.stillDrag = null;
      S.stillNudge = null;
      if (validStill(last)) setProp(key, "still", last, { label: "Nehybná část" });
      ui.renderPanel();
      drawOverlay(true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  }

  /** Resizing from the overlay handles (top-window events, converted to the edited document). */
  function startResize(dir, event) {
    const el = selectedEl();
    const key = S.sel;
    if (!el || !key) return;
    event.preventDefault();
    event.stopPropagation();
    lockFrame(true);
    const vb = viewBox();
    const P = resolveProps(key, curPage(), curDevice(), store.edits).props;
    // A box already sized in % (or vw/vh) stays in that unit after the first drag, so it scales with the picture.
    const inlineLen = (prop) => {
      const m = /^(-?[\d.]+)(px|%|vw|vh)$/.exec((el.style.getPropertyValue(prop) || "").trim());
      return m ? { v: parseFloat(m[1]), u: m[2] } : null;
    };
    const unitW = P.width || inlineLen("width");
    const unitH = P.height || inlineLen("height");
    const w0 = el.offsetWidth || el.getBoundingClientRect().width;
    const h0 = el.offsetHeight || el.getBoundingClientRect().height;
    const ratio = w0 / Math.max(1, h0);
    const x0 = num(P.x);
    const y0 = num(P.y);
    const r0 = el.getBoundingClientRect();
    const targets = store.settings.snap && !snapOff(el) ? snapTargets(el) : [];
    const sx = event.clientX;
    const sy = event.clientY;
    let last = null;
    const move = (e) => {
      let dx = (e.clientX - sx) / vb.s;
      let dy = (e.clientY - sy) / vb.s;
      const H = dir.includes("e") || dir.includes("w");
      const V = dir.includes("n") || dir.includes("s");
      // Snap the moving edges.
      if (!(e.ctrlKey || e.metaKey) && store.settings.snap && !snapOff(el)) {
        const b = { left: r0.left, top: r0.top, width: r0.width, height: r0.height, right: r0.right, bottom: r0.bottom };
        if (dir.includes("e")) b.right += dx;
        if (dir.includes("w")) b.left += dx;
        if (dir.includes("s")) b.bottom += dy;
        if (dir.includes("n")) b.top += dy;
        b.width = b.right - b.left;
        b.height = b.bottom - b.top;
        const snap = snapBox(b, targets, { edgesX: dir.includes("e") ? ["r"] : dir.includes("w") ? ["l"] : [], edgesY: dir.includes("s") ? ["b"] : dir.includes("n") ? ["t"] : [], win: winOf(el) });
        if (!snap.grid) {
          dx += snap.dx;
          dy += snap.dy;
          S.guides = snap.guides;
        }
      } else S.guides = [];
      let w = w0;
      let hh = h0;
      let x = x0;
      let y = y0;
      const k = e.altKey ? 2 : 1;
      if (dir.includes("e")) {
        w = w0 + dx * k;
        if (e.altKey) x = x0 - dx;
      }
      if (dir.includes("w")) {
        w = w0 - dx * k;
        x = x0 + dx;
      }
      if (dir.includes("s")) {
        hh = h0 + dy * k;
        if (e.altKey) y = y0 - dy;
      }
      if (dir.includes("n")) {
        hh = h0 - dy * k;
        y = y0 + dy;
      }
      if (e.shiftKey || P.lockRatio) {
        if (H && V) {
          if (Math.abs(w / w0) > Math.abs(hh / h0)) hh = w / ratio;
          else w = hh * ratio;
          if (dir.includes("n")) y = y0 + (h0 - hh);
          if (dir.includes("w")) x = x0 + (w0 - w);
        } else if (H) hh = w / ratio;
        else if (V) w = hh * ratio;
      }
      w = Math.max(4, w);
      hh = Math.max(4, hh);
      const next = { x, y };
      if (H || e.shiftKey || P.lockRatio) next.width = { v: round(w), u: "px" };
      if (V || e.shiftKey || P.lockRatio) next.height = { v: round(hh), u: "px" };
      last = next;
      schedulePreview(key, next);
    };
    const up = () => {
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", up, true);
      lockFrame(false);
      cancelAnimationFrame(previewFrame);
      S.guides = [];
      previewOverrides.delete(key);
      const child = childApi();
      if (child) child.preview(key, null);
      if (!last) return;
      const values = { refW: round(parentWidth(el)) };
      const pw = parentWidth(el);
      const vw = winOf(el).innerWidth;
      const vhh = winOf(el).innerHeight;
      const toUnit = (len, cur, basis) => {
        if (!cur || cur.u === "px" || cur.u === "auto") return len;
        const b = cur.u === "%" ? basis : cur.u === "vw" ? vw : vhh;
        return { v: round((len.v / Math.max(1, b)) * 100, 2), u: cur.u };
      };
      if (last.width) values.width = toUnit(last.width, unitW, pw);
      if (last.height) values.height = toUnit(last.height, unitH, el.parentElement ? el.parentElement.getBoundingClientRect().height : vhh);
      if (last.x !== x0) values.x = round(last.x);
      if (last.y !== y0) values.y = round(last.y);
      setProps(key, values, { label: "Změna velikosti" });
      ui.renderPanel();
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", up, true);
  }

  /** While dragging an overlay handle, the device preview frame must not swallow the pointer. */
  const lockFrame = (on) => {
    if (stage && stage.frame) stage.frame.style.pointerEvents = on ? "none" : "";
  };
  /** Turning by the knob above the selection: the angle follows the pointer around the element's centre. */
  function startRotate(event) {
    const el = selectedEl();
    const key = S.sel;
    const b = boxOf(el);
    if (!el || !key || !b || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const r0 = num(resolveProps(key, curPage(), curDevice(), store.edits).props.rotate);
    const a0 = Math.atan2(event.clientY - cy, event.clientX - cx);
    let last = r0;
    lockFrame(true);
    document.documentElement.classList.add("ct-dragging");
    const move = (e) => {
      let r = r0 + ((Math.atan2(e.clientY - cy, e.clientX - cx) - a0) * 180) / Math.PI;
      r = ((((r + 180) % 360) + 360) % 360) - 180;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      else if (Math.abs(Math.round(r / 45) * 45 - r) < 2) r = Math.round(r / 45) * 45;
      last = round(r, 1);
      S.rotating = { deg: last, x: e.clientX, y: e.clientY };
      schedulePreview(key, { rotate: last });
      drawOverlay();
    };
    const up = () => {
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", up, true);
      lockFrame(false);
      document.documentElement.classList.remove("ct-dragging");
      cancelAnimationFrame(previewFrame);
      previewOverrides.delete(key);
      const child = childApi();
      if (child) child.preview(key, null);
      S.rotating = null;
      if (last !== r0) setProps(key, { rotate: last || undefined }, { label: "Otočení" });
      ui.renderPanel();
      drawOverlay(true);
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", up, true);
  }
  function resetRotate(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!S.sel) return;
    setProps(S.sel, { rotate: undefined }, { label: "Otočení na 0°" });
    ui.renderPanel();
  }

  function currentShape() {
    const P = resolveProps(S.sel, curPage(), curDevice(), store.edits).props;
    return P.shape && Array.isArray(P.shape.pts) ? clone(P.shape) : { mode: "clip", pts: clone(RECT) };
  }
  function startPoint(i, event, info) {
    event.preventDefault();
    event.stopPropagation();
    S.shapePoint = i;
    const key = S.sel;
    const shape = currentShape();
    const el = selectedEl();
    const targets = el ? snapTargets(el).map((t) => boxOf(t.el)).filter(Boolean) : [];
    let moved = false;
    const move = (e) => {
      moved = true;
      let px = e.clientX;
      let py = e.clientY;
      if (!(e.ctrlKey || e.metaKey) && store.settings.snap) {
        // Points snap to the element's own quarters and to the edges of nearby elements.
        const xs = [0, 0.25, 0.5, 0.75, 1].map((f) => info.ox + f * info.w);
        const ys = [0, 0.25, 0.5, 0.75, 1].map((f) => info.oy + f * info.h);
        for (const t of targets) xs.push(t.left, t.right), ys.push(t.top, t.bottom);
        const nx = xs.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a), Infinity);
        const ny = ys.reduce((a, b) => (Math.abs(b - py) < Math.abs(a - py) ? b : a), Infinity);
        if (Math.abs(nx - px) <= SNAP_PX) px = nx;
        if (Math.abs(ny - py) <= SNAP_PX) py = ny;
      }
      shape.pts[i] = [round(clamp(((px - info.ox) / info.w) * 100, -100, 200), 2), round(clamp(((py - info.oy) / info.h) * 100, -100, 200), 2)];
      schedulePreview(key, { shape: clone(shape) });
    };
    const up = () => {
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      cancelAnimationFrame(previewFrame);
      previewOverrides.delete(key);
      const child = childApi();
      if (child) child.preview(key, null);
      if (moved) setProp(key, "shape", shape, { label: "Tvar" });
      ui.renderPanel();
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
  }
  function addPoint(i, event, info) {
    event.preventDefault();
    event.stopPropagation();
    const shape = currentShape();
    const x = round(((event.clientX - info.ox) / info.w) * 100, 2);
    const y = round(((event.clientY - info.oy) / info.h) * 100, 2);
    shape.pts.splice(i + 1, 0, [x, y]);
    if (shape.mode === "warp") shape.mode = "clip";
    S.shapePoint = i + 1;
    setProp(S.sel, "shape", shape, { label: "Přidat bod tvaru" });
    ui.renderPanel();
  }
  function removePoint() {
    const shape = currentShape();
    if (S.shapePoint === null || shape.pts.length <= 3) return;
    shape.pts.splice(S.shapePoint, 1);
    S.shapePoint = null;
    setProp(S.sel, "shape", shape, { label: "Smazat bod tvaru" });
    ui.renderPanel();
  }

  function keys(event) {
    const t = event.composedPath ? event.composedPath()[0] : event.target;
    const typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName || "") || t.isContentEditable);
    if (event.altKey && event.shiftKey && event.code === "KeyR") {
      event.preventDefault();
      ui.setHidden(!S.hidden);
      return;
    }
    if (S.hidden) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !typing && event.code === "KeyZ") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && !typing && event.code === "KeyY") {
      event.preventDefault();
      redo();
      return;
    }
    if (typing) return;
    if (event.key === "Enter" && S.stillDraw) {
      event.preventDefault();
      if ((S.stillInk && S.stillInk.length) || (S.stillStroke && S.stillStroke.pts.length)) commitStill();
      else {
        cancelStillDraw();
        ui.renderPanel();
        drawOverlay(true);
      }
      return;
    }
    if (event.key === "Escape" && (S.stillDraw || S.stillStroke)) {
      cancelStillDraw();
      ui.renderPanel();
      drawOverlay(true);
      return;
    }
    if (event.key === "Escape" && S.placing) {
      S.placing = null;
      S.placeAt = null;
      ui.syncModeClasses();
      ui.renderPanel();
      drawOverlay(true);
      return;
    }
    if (event.key === "Escape") {
      if (S.shapeEdit) S.shapeEdit = false;
      else ui.select(null);
      ui.renderPanel();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && S.shapeEdit && S.shapePoint !== null) {
      event.preventDefault();
      removePoint();
      return;
    }
    if (!S.sel || isClient() || viewState !== "draft") return;
    // Delete removes the selected element in Prvky and Texty; Backspace only in Prvky, where nothing is typed on the page.
    if (!S.shapeEdit && (event.key === "Delete" ? S.mode === "element" || S.mode === "text" : event.key === "Backspace" && S.mode === "element")) {
      event.preventDefault();
      deleteElement(S.sel, curDevice());
      ui.renderPanel();
      drawOverlay(true);
      return;
    }
    if (S.mode !== "element") return;
    const step = event.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!d) return;
    event.preventDefault();
    const P = resolveProps(S.sel, curPage(), curDevice(), store.edits).props;
    const el = selectedEl();
    setProps(S.sel, { x: num(P.x) + d[0], y: num(P.y) + d[1], refW: el ? round(parentWidth(el)) : P.refW }, { label: "Posun šipkami", group: true });
    ui.renderPanel();
  }
  return { attach, detach, startMove, startResize, startRotate, resetRotate, startPoint, addPoint, removePoint, keys, startStillAdjust, toggleStillDraw, cancelStillDraw, clearStill };
})();
