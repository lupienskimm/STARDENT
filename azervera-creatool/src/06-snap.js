/* ---------- magnetic snapping and guides ----------
 * Works in the coordinates of the edited document. Targets are measured once when a drag starts. */

const SNAP_PX = 6;
const snapOff = (el) => {
  const key = el && el.getAttribute && el.getAttribute("data-ct");
  const meta = key && store.edits.elements[key];
  return !!(meta && meta.snap === false);
};
function snapTargets(el) {
  const out = [];
  const win = winOf(el);
  // A drawing added to the page lines up with the section it is pinned to, not with its layer.
  const parent = anchorOf(el) || el.parentElement;
  if (parent && parent !== el.ownerDocument.body) out.push({ el: parent, r: parent.getBoundingClientRect(), parent: true });
  let scope = parent;
  for (let i = 0; i < 2 && scope && scope.parentElement && scope.parentElement !== el.ownerDocument.body; i++) scope = scope.parentElement;
  const list = scope ? scope.querySelectorAll("*") : [];
  for (const x of list) {
    if (out.length > 300) break;
    if (x === el || el.contains(x) || x.contains(el) || isIgnored(x) || snapOff(x)) continue;
    const r = x.getBoundingClientRect();
    if (r.width < 6 || r.height < 6 || r.bottom < -300 || r.top > win.innerHeight + 300) continue;
    out.push({ el: x, r });
  }
  return out;
}
/** Nearest line for each axis. edges: which edges of the moved box may snap ("l","c","r" / "t","m","b"). */
function snapBox(box, targets, opts = {}) {
  const res = { dx: 0, dy: 0, guides: [] };
  if (opts.disabled) return res;
  const grid = store.settings.grid;
  const win = opts.win || window;
  const ex = opts.edgesX || ["l", "c", "r"];
  const ey = opts.edgesY || ["t", "m", "b"];
  const pos = { l: box.left, c: box.left + box.width / 2, r: box.left + box.width, t: box.top, m: box.top + box.height / 2, b: box.top + box.height };
  if (grid && grid.on && grid.size >= 2) {
    const size = grid.size;
    const gx = ex.includes("l") ? "l" : ex[0];
    const gy = ey.includes("t") ? "t" : ey[0];
    const absX = pos[gx] + win.scrollX;
    const absY = pos[gy] + win.scrollY;
    res.dx = Math.round(absX / size) * size - absX;
    res.dy = Math.round(absY / size) * size - absY;
    res.grid = true;
    return res;
  }
  let bx = null;
  let by = null;
  for (const t of targets) {
    const r = t.r;
    const tx = [r.left, r.left + r.width / 2, r.right];
    const ty = [r.top, r.top + r.height / 2, r.bottom];
    for (const e of ex) for (const x of tx) {
      const d = x - pos[e];
      if (Math.abs(d) <= SNAP_PX && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, x, t };
    }
    for (const e of ey) for (const y of ty) {
      const d = y - pos[e];
      if (Math.abs(d) <= SNAP_PX && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, y, t };
    }
  }
  // Equal spacing between neighbours in the same row or column.
  const row = targets.filter((t) => !t.parent && t.r.bottom > box.top && t.r.top < box.bottom);
  const left = row.filter((t) => t.r.right <= box.left + SNAP_PX).sort((a, b) => b.r.right - a.r.right)[0];
  const right = row.filter((t) => t.r.left >= box.right - SNAP_PX).sort((a, b) => a.r.left - b.r.left)[0];
  if (left && right && ex.includes("l") && ex.includes("r")) {
    const x = (left.r.right + right.r.left - box.width) / 2;
    const d = x - box.left;
    if (Math.abs(d) <= SNAP_PX && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, spacing: [left, right], gap: round(x - left.r.right, 0) };
  }
  const col = targets.filter((t) => !t.parent && t.r.right > box.left && t.r.left < box.right);
  const above = col.filter((t) => t.r.bottom <= box.top + SNAP_PX).sort((a, b) => b.r.bottom - a.r.bottom)[0];
  const below = col.filter((t) => t.r.top >= box.bottom - SNAP_PX).sort((a, b) => a.r.top - b.r.top)[0];
  if (above && below && ey.includes("t") && ey.includes("b")) {
    const y = (above.r.bottom + below.r.top - box.height) / 2;
    const d = y - box.top;
    if (Math.abs(d) <= SNAP_PX && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, spacing: [above, below], gap: round(y - above.r.bottom, 0) };
  }
  if (bx) {
    res.dx = bx.d;
    if (bx.spacing) res.guides.push({ kind: "spaceX", a: bx.spacing[0].r, b: bx.spacing[1].r, gap: bx.gap });
    else {
      const top = Math.min(box.top, bx.t.r.top);
      const bottom = Math.max(box.bottom, bx.t.r.bottom);
      const gap = box.top >= bx.t.r.bottom ? box.top - bx.t.r.bottom : bx.t.r.top >= box.bottom ? bx.t.r.top - box.bottom : 0;
      res.guides.push({ kind: "v", x: bx.x, top, bottom, label: bx.t.parent ? "rodič" : gap ? `${round(gap, 0)} px` : "" });
    }
  }
  if (by) {
    res.dy = by.d;
    if (by.spacing) res.guides.push({ kind: "spaceY", a: by.spacing[0].r, b: by.spacing[1].r, gap: by.gap });
    else {
      const l = Math.min(box.left, by.t.r.left);
      const r = Math.max(box.right, by.t.r.right);
      const gap = box.left >= by.t.r.right ? box.left - by.t.r.right : by.t.r.left >= box.right ? by.t.r.left - box.right : 0;
      res.guides.push({ kind: "h", y: by.y, left: l, right: r, label: by.t.parent ? "rodič" : gap ? `${round(gap, 0)} px` : "" });
    }
  }
  return res;
}
