/* ---------- 3D models: GLB files uploaded as ordinary elements ----------
 * The file lives in IndexedDB. The draft only stores its id and the rotation, so undo stays light.
 * The export carries the GLB itself, so a coding agent can put the file back on the site. */

const models = (() => {
  const DB = "creatool-models:" + location.host;
  const STORE = "files";
  const urls = new Map();
  const metas = new Map();
  const parsed = new Map();
  const views = new Set();
  let dbp = null;
  let items = [];
  let loopOn = false;

  function db() {
    if (!dbp)
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    return dbp;
  }
  function run(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  const get = (id) => run("readonly", (s) => s.get(id));
  const put = (rec) => run("readwrite", (s) => s.put(rec));
  const all = () => run("readonly", (s) => s.getAll());
  const metaOf = (rec) => ({ id: rec.id, name: rec.name, bytes: rec.blob ? rec.blob.size : 0, created: rec.created });

  function mat4() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function rotX(a) {
    const c = Math.cos(a), s = Math.sin(a), o = mat4();
    o[5] = c; o[6] = s; o[9] = -s; o[10] = c;
    return o;
  }
  function rotY(a) {
    const c = Math.cos(a), s = Math.sin(a), o = mat4();
    o[0] = c; o[2] = -s; o[8] = s; o[10] = c;
    return o;
  }
  function rotZ(a) {
    const c = Math.cos(a), s = Math.sin(a), o = mat4();
    o[0] = c; o[1] = s; o[4] = -s; o[5] = c;
    return o;
  }
  function translate(x, y, z) {
    const o = mat4();
    o[12] = x; o[13] = y; o[14] = z;
    return o;
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    const o = new Float32Array(16);
    o[0] = f / Math.max(0.05, aspect);
    o[5] = f;
    o[10] = (far + near) * nf;
    o[11] = -1;
    o[14] = 2 * far * near * nf;
    return o;
  }
  function nodeMatrix(node) {
    if (node.matrix && node.matrix.length === 16) return new Float32Array(node.matrix);
    const t = node.translation || [0, 0, 0];
    const q = node.rotation || [0, 0, 0, 1];
    const s = node.scale || [1, 1, 1];
    const [x, y, z, w] = q;
    const m = mat4();
    m[0] = (1 - 2 * (y * y + z * z)) * s[0];
    m[1] = (2 * (x * y + z * w)) * s[0];
    m[2] = (2 * (x * z - y * w)) * s[0];
    m[4] = (2 * (x * y - z * w)) * s[1];
    m[5] = (1 - 2 * (x * x + z * z)) * s[1];
    m[6] = (2 * (y * z + x * w)) * s[1];
    m[8] = (2 * (x * z + y * w)) * s[2];
    m[9] = (2 * (y * z - x * w)) * s[2];
    m[10] = (1 - 2 * (x * x + y * y)) * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
    return m;
  }
  function applyMat(pos, m) {
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    return out;
  }
  function readFloats(json, bin, index) {
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type] || 1;
    const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const src = new Uint8Array(bin, start, acc.count * comps * 4);
    const copy = new Uint8Array(src.byteLength);
    copy.set(src);
    return new Float32Array(copy.buffer);
  }
  function readIndices(json, bin, index) {
    if (index == null) return null;
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const width = acc.componentType === 5125 ? 4 : acc.componentType === 5123 ? 2 : 1;
    const src = new Uint8Array(bin, start, acc.count * width);
    const copy = new Uint8Array(src.byteLength);
    copy.set(src);
    if (acc.componentType === 5125) return new Uint32Array(copy.buffer);
    if (acc.componentType === 5123) return new Uint16Array(copy.buffer);
    return new Uint8Array(copy.buffer);
  }
  function parseGlb(buffer) {
    const dv = new DataView(buffer);
    if (buffer.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error("Soubor není GLB. Exportuj model jako .glb.");
    let off = 12;
    let json = null;
    let bin = null;
    while (off + 8 <= buffer.byteLength) {
      const len = dv.getUint32(off, true);
      const type = dv.getUint32(off + 4, true);
      const start = off + 8;
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
      else if (type === 0x004e4942) bin = buffer.slice(start, start + len);
      off = start + len;
    }
    if (!json || !bin) throw new Error("V GLB chybí geometrie.");
    const scene = (json.scenes || [])[json.scene || 0] || { nodes: [] };
    const parts = [];
    const walk = (index, parent) => {
      const node = (json.nodes || [])[index];
      if (!node) return;
      const world = parent ? mul(parent, nodeMatrix(node)) : nodeMatrix(node);
      if (node.mesh != null) {
        const mesh = json.meshes[node.mesh];
        for (const prim of mesh.primitives || []) {
          if (prim.mode != null && prim.mode !== 4) continue;
          if (prim.attributes == null || prim.attributes.POSITION == null) continue;
          let positions = applyMat(readFloats(json, bin, prim.attributes.POSITION), world);
          let normals = prim.attributes.NORMAL != null ? applyMat(readFloats(json, bin, prim.attributes.NORMAL), world) : null;
          const indices = readIndices(json, bin, prim.indices);
          const mat = (json.materials || [])[prim.material] || {};
          const factor = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor;
          const color = factor && factor.length >= 3 ? factor.slice(0, 3) : [0.93, 0.9, 0.84];
          parts.push({ positions, normals, indices, color, count: positions.length / 3 });
        }
      }
      for (const child of node.children || []) walk(child, world);
    };
    for (const n of scene.nodes || []) walk(n, null);
    if (!parts.length) throw new Error("V modelu není žádná trojúhelníková síť.");
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const part of parts) {
      const p = part.positions;
      for (let i = 0; i < p.length; i += 3) {
        min[0] = Math.min(min[0], p[i]); max[0] = Math.max(max[0], p[i]);
        min[1] = Math.min(min[1], p[i + 1]); max[1] = Math.max(max[1], p[i + 1]);
        min[2] = Math.min(min[2], p[i + 2]); max[2] = Math.max(max[2], p[i + 2]);
      }
    }
    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const radius = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.001) / 2;
    for (const part of parts) {
      const p = part.positions;
      for (let i = 0; i < p.length; i += 3) { p[i] -= center[0]; p[i + 1] -= center[1]; p[i + 2] -= center[2]; }
      if (!part.normals) {
        part.normals = new Float32Array(p.length);
        const add = (i, nx, ny, nz) => { part.normals[i] += nx; part.normals[i + 1] += ny; part.normals[i + 2] += nz; };
        const tri = (a, b, c) => {
          const ax = p[b] - p[a], ay = p[b + 1] - p[a + 1], az = p[b + 2] - p[a + 2];
          const bx = p[c] - p[a], by = p[c + 1] - p[a + 1], bz = p[c + 2] - p[a + 2];
          add(a, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
        };
        if (part.indices) {
          const ix = part.indices;
          for (let i = 0; i < ix.length; i += 3) tri(ix[i] * 3, ix[i + 1] * 3, ix[i + 2] * 3);
        } else {
          for (let i = 0; i < p.length; i += 9) tri(i, i + 3, i + 6);
        }
      }
    }
    return { parts, radius };
  }

  const VERT = "attribute vec3 aPos;attribute vec3 aNrm;uniform mat4 uMvp;uniform mat4 uModel;varying vec3 vN;void main(){vN=mat3(uModel)*aNrm;gl_Position=uMvp*vec4(aPos,1.0);}";
  const FRAG = "precision mediump float;varying vec3 vN;uniform vec3 uColor;void main(){vec3 n=normalize(vN);float l=0.38+0.62*abs(dot(n,normalize(vec3(0.35,0.85,0.45))));gl_FragColor=vec4(uColor*l,1.0);}";
  function shader(gl, type, text) {
    const s = gl.createShader(type);
    gl.shaderSource(s, text);
    gl.compileShader(s);
    return s;
  }
  function program(gl) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.bindAttribLocation(p, 1, "aNrm");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn(gl.getProgramInfoLog(p));
    return p;
  }
  function upload(gl, geo) {
    const gpu = [];
    for (const part of geo.parts) {
      const pos = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pos);
      gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW);
      const nrm = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
      gl.bufferData(gl.ARRAY_BUFFER, part.normals, gl.STATIC_DRAW);
      let idx = null;
      if (part.indices) {
        idx = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW);
      }
      gpu.push({ pos, nrm, idx, color: part.color, count: part.indices ? part.indices.length : part.count, type: part.indices ? (part.indices instanceof Uint32Array ? gl.UNSIGNED_INT : part.indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE) : 0 });
    }
    return gpu;
  }
  async function geometry(id) {
    if (parsed.has(id)) return parsed.get(id);
    const rec = await get(id);
    if (!rec || !rec.blob) return null;
    const geo = parseGlb(await rec.blob.arrayBuffer());
    parsed.set(id, geo);
    return geo;
  }
  function ensureLoop() {
    if (loopOn) return;
    loopOn = true;
    const frame = () => {
      for (const view of views) draw(view);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function draw(view) {
    const canvas = view.canvas;
    if (!canvas.isConnected) { views.delete(view); return; }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 2 || h < 2 || !view.gpu) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    const gl = view.gl;
    const spin = spinOf(view);
    const model = mul(mul(rotZ(num(spin.rz)), rotY(num(spin.ry))), rotX(num(spin.rx)));
    const dist = Math.max(view.radius, 0.2) * 2.8;
    const proj = perspective(0.7, w / h, dist / 50, dist * 20);
    const mvp = mul(proj, mul(translate(0, 0, -dist), model));
    gl.viewport(0, 0, bw, bh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(view.prog);
    gl.uniformMatrix4fv(view.uMvp, false, mvp);
    gl.uniformMatrix4fv(view.uModel, false, model);
    for (const part of view.gpu) {
      gl.bindBuffer(gl.ARRAY_BUFFER, part.pos);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.nrm);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(view.uColor, part.color);
      if (part.idx) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.idx);
        gl.drawElements(gl.TRIANGLES, part.count, part.type, 0);
      } else gl.drawArrays(gl.TRIANGLES, 0, part.count);
    }
  }
  function mount(canvas, addedId, stopId) {
    let view = [...views].find((v) => v.canvas === canvas);
    const item = addedById(addedId);
    const id = item && item.model && item.model.id;
    if (!id) return;
    if (view && view.modelId === id) { view.addedId = addedId; view.stopId = stopId || ""; return; }
    if (view) views.delete(view);
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return;
    gl.getExtension("OES_element_index_uint");
    gl.enable(gl.DEPTH_TEST);
    const prog = program(gl);
    view = { canvas, gl, prog, addedId, stopId: stopId || "", modelId: id, uMvp: gl.getUniformLocation(prog, "uMvp"), uModel: gl.getUniformLocation(prog, "uModel"), uColor: gl.getUniformLocation(prog, "uColor"), radius: 1, gpu: null };
    views.add(view);
    ensureLoop();
    geometry(id).then((geo) => {
      if (!geo || !canvas.isConnected) return;
      view.radius = geo.radius;
      view.gpu = upload(gl, geo);
    }).catch(() => {});
  }
  function liveOf(addedId) {
    return resolvedAdded(addedById(addedId), curDevice());
  }
  function gateOf(s) {
    return s && typeof s.gate === "number" ? s.gate : null;
  }
  function copyStop(s, patch) {
    return Object.assign({
      id: s.implicit ? uid("st") : s.id,
      rx: num(s.rx), ry: num(s.ry), rz: num(s.rz),
      x: num(s.x), y: num(s.y), s: num(s.s, 1),
      gate: gateOf(s),
    }, patch || {});
  }
  function listStops(live) {
    if (!live) return [];
    if (Array.isArray(live.stops) && live.stops.length) return live.stops.map((s) => ({ id: s.id, rx: num(s.rx), ry: num(s.ry), rz: num(s.rz), x: num(s.x, live.x), y: num(s.y, live.y), s: num(s.s, 1), gate: gateOf(s) }));
    const m = live.model || {};
    return [{ id: "base", rx: num(m.rx), ry: num(m.ry), rz: num(m.rz), x: num(live.x), y: num(live.y), s: 1, implicit: true }];
  }
  function spinOf(view) {
    const item = addedById(view.addedId);
    if (!item) return {};
    const win = view.canvas.ownerDocument.defaultView || window;
    const live = resolvedAdded(item, deviceOfWin(win));
    if (view.stopId && Array.isArray(live.stops)) {
      const stop = live.stops.find((s) => s.id === view.stopId);
      if (stop) return stop;
    }
    if (!view.stopId && Array.isArray(live.stops) && live.stops.length > 1 && (isChild || S.hidden || view.canvas.ownerDocument !== document)) return blend(item, win);
    return live.model || {};
  }
  const autoFlights = new Map();
  function motionChoice() {
    const picked = document.documentElement.dataset.ctMotion;
    if (picked === "scroll" || picked === "auto") return picked;
    try {
      const saved = localStorage.getItem(KEY + ":motion");
      if (saved === "scroll" || saved === "auto") return saved;
    } catch {}
    return "auto";
  }
  function autoAmount(id, from, to) {
    const key = `${from.id}>${to.id}`;
    const now = performance.now();
    let flight = autoFlights.get(id);
    if (!flight || flight.key !== key) {
      flight = { key, start: now, duration: flight ? 520 : 1650 };
      autoFlights.set(id, flight);
    }
    const u = clamp((now - flight.start) / flight.duration, 0, 1);
    return u * u * u * (u * (u * 6 - 15) + 10);
  }
  addEventListener("creatool:motion", () => autoFlights.clear());
  function blend(a, win) {
    const live = resolvedAdded(a, deviceOfWin(win));
    const raw = listStops(live).filter((s) => !s.implicit);
    if (raw.length < 2) {
      const m = (live && live.model) || {};
      return { rx: num(m.rx), ry: num(m.ry), rz: num(m.rz), x: num(live && live.x), y: num(live && live.y), s: num(raw[0] && raw[0].s, 1) };
    }
    const anchor = query(win.document, a.anchor);
    const rect = anchor && anchor.getBoundingClientRect();
    if (!rect) return Object.assign({ s: num(raw[0].s, 1) }, raw[0]);
    const mid = win.innerHeight * 0.5;
    const stops = raw.map((s) => Object.assign({}, s, {
      _y: rect.top + (num(s.y) / 100) * rect.height,
      _x: rect.left + (num(s.x) / 100) * rect.width,
    })).sort((p, q) => p._y - q._y || p._x - q._x);
    const doc = win.document;
    const pageH = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1);
    const maxScroll = Math.max(0, pageH - win.innerHeight);
    const scroll = Math.max(0, Math.min(maxScroll, win.scrollY || doc.documentElement.scrollTop || 0));
    const mode = motionChoice();
    let i = 0;
    let holding = false;
    for (let n = 0; n < stops.length - 1; n++) {
      if (typeof stops[n].gate !== "number") {
        if (stops[n + 1]._y <= mid) { i = n + 1; continue; }
        i = n;
        break;
      }
      const gateY = clamp(stops[n].gate * pageH, 0, maxScroll);
      if (scroll < gateY) { i = n; holding = true; break; }
      if (mode === "scroll") {
        const nextGate = typeof stops[n + 1].gate === "number" ? clamp(stops[n + 1].gate * pageH, 0, maxScroll) : null;
        const natural = (stops[n + 1]._y + scroll) - mid;
        const end = nextGate != null && nextGate > gateY + 24
          ? nextGate
          : Math.max(gateY + win.innerHeight * 0.62, Math.min(maxScroll, Math.max(gateY + 48, natural)));
        if (scroll < end) { i = n; break; }
      }
      i = n + 1;
    }
    const A = stops[i];
    const B = stops[Math.min(i + 1, stops.length - 1)];
    const span = (B._y - A._y) || 1;
    const along = clamp((mid - A._y) / span, 0, 1);
    const ease = (u) => { const t = clamp(u, 0, 1); return t * t * (3 - 2 * t); };
    let t = holding || A === B ? 0 : ease(along);
    if (holding) autoFlights.delete(a.id);
    else if (typeof A.gate === "number" && A !== B) {
      if (mode === "scroll") {
        const gateY = clamp(A.gate * pageH, 0, maxScroll);
        const nextGate = typeof B.gate === "number" ? clamp(B.gate * pageH, 0, maxScroll) : null;
        const natural = (B._y + scroll) - mid;
        const end = nextGate != null && nextGate > gateY + 24
          ? nextGate
          : Math.max(gateY + win.innerHeight * 0.62, Math.min(maxScroll, Math.max(gateY + 48, natural)));
        t = ease((scroll - gateY) / Math.max(1, end - gateY));
      } else t = autoAmount(a.id, A, B);
    }
    const ang = (p, q) => {
      let d = q - p;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return p + d * t;
    };
    return {
      rx: ang(num(A.rx), num(B.rx)), ry: ang(num(A.ry), num(B.ry)), rz: ang(num(A.rz), num(B.rz)),
      x: num(A.x) + (num(B.x) - num(A.x)) * t, y: num(A.y) + (num(B.y) - num(A.y)) * t,
      s: num(A.s, 1) + (num(B.s, 1) - num(A.s, 1)) * t,
    };
  }
  function patchStops(addedId, stops, extra, label) {
    const live = liveOf(addedId);
    const first = stops[0] || {};
    writeAdded(addedId, Object.assign({
      stops: stops.length > 1 ? stops : null,
      activeStop: stops.length > 1 ? (extra && extra.activeStop) || first.id : null,
      x: first.x, y: first.y,
      model: Object.assign({}, live.model, { rx: first.rx, ry: first.ry, rz: first.rz }),
    }, extra || {}), label, { group: true });
  }
  function addStop(addedId) {
    const live = liveOf(addedId);
    if (!live) return;
    const stops = listStops(live).map((s) => copyStop(s));
    const active = stops.findIndex((s) => s.id === live.activeStop);
    const i = active >= 0 ? active : stops.length - 1;
    const cur = stops[i];
    const next = stops[i + 1];
    const neu = copyStop(cur, {
      id: uid("st"),
      x: next ? round((num(cur.x) + num(next.x)) / 2, 2) : cur.x,
      y: next ? round((num(cur.y) + num(next.y)) / 2, 2) : round(clamp(num(cur.y) + 14, 0, 100), 2),
      gate: null,
    });
    stops.splice(i + 1, 0, neu);
    patchStops(addedId, stops, { activeStop: neu.id }, "Přidat pozici");
    ui.renderPanel();
  }
  function removeStop(addedId) {
    const live = liveOf(addedId);
    const stops = listStops(live);
    if (stops.length < 2 || stops[0].implicit) return;
    const found = stops.findIndex((s) => s.id === live.activeStop);
    const i = found >= 0 ? found : stops.length - 1;
    const next = stops.filter((_, n) => n !== i).map((s) => copyStop(s));
    const keep = next[Math.max(0, i - 1)] || next[0];
    patchStops(addedId, next, { activeStop: keep && next.length > 1 ? keep.id : null }, "Odebrat pozici");
    ui.renderPanel();
  }
  function selectStop(addedId, stopId) {
    writeAdded(addedId, { activeStop: stopId }, "Pozice", { group: true });
    ui.renderPanel();
  }
  function beginMoveStop(addedId, stopId, event) {
    const item = addedById(addedId);
    if (!item) return;
    const anchor = query(document, item.anchor);
    const rect = anchor ? anchor.getBoundingClientRect() : { width: 1, height: 1 };
    const live = liveOf(addedId);
    const stop = listStops(live).find((s) => s.id === stopId) || listStops(live)[0];
    const start = { x: event.clientX, y: event.clientY, sx: num(stop.x), sy: num(stop.y) };
    const move = (ev) => {
      const cur = listStops(liveOf(addedId)).map((s) => copyStop(s));
      const hit = cur.find((s) => s.id === stopId) || cur[0];
      if (!hit) return;
      hit.x = round(clamp(start.sx + ((ev.clientX - start.x) / Math.max(1, rect.width)) * 100, -20, 120), 2);
      hit.y = round(clamp(start.sy + ((ev.clientY - start.y) / Math.max(1, rect.height)) * 100, -20, 120), 2);
      patchStops(addedId, cur, { activeStop: hit.id }, "Posun pozice");
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
  function beginOrbit(addedId, event, stopId) {
    const live = liveOf(addedId);
    if (!live || !live.model) return;
    const stops = listStops(live);
    const stop = stopId ? stops.find((s) => s.id === stopId) : null;
    const base = stop || live.model;
    const start = { x: event.clientX, y: event.clientY, rx: num(base.rx), ry: num(base.ry), rz: num(base.rz), shift: event.shiftKey };
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const rx = ev.shiftKey || start.shift ? start.rx : start.rx + dy * 0.01;
      const ry = ev.shiftKey || start.shift ? start.ry : start.ry + dx * 0.01;
      const rz = ev.shiftKey || start.shift ? start.rz + dx * 0.01 : start.rz;
      if (stopId && Array.isArray(liveOf(addedId).stops)) {
        const cur = listStops(liveOf(addedId)).map((s) => copyStop(s, s.id === stopId ? { rx, ry, rz } : null));
        patchStops(addedId, cur, { activeStop: stopId }, "3D otočení");
      } else {
        writeAdded(addedId, { model: Object.assign({}, liveOf(addedId).model, { rx, ry, rz }) }, "3D otočení", { group: true });
      }
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
  function beginScale(addedId, stopId, event) {
    const live = liveOf(addedId);
    if (!live) return;
    event.preventDefault();
    event.stopPropagation();
    const node = event.target.closest && event.target.closest("[data-ct-added]");
    const rect = node ? node.getBoundingClientRect() : { left: event.clientX, top: event.clientY, width: 0, height: 0 };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const origin = Math.max(24, Math.hypot(event.clientX - cx, event.clientY - cy));
    const baseW = num(live.w, 260);
    const stop = stopId && listStops(live).find((s) => s.id === stopId && !s.implicit);
    const startS = stop ? num(stop.s, 1) : 1;
    const move = (ev) => {
      const dist = Math.max(24, Math.hypot(ev.clientX - cx, ev.clientY - cy));
      const factor = dist / origin;
      if (stop) {
        const s = round(clamp(startS * factor, 0.25, 2.5), 3);
        const cur = listStops(liveOf(addedId)).map((row) => copyStop(row, row.id === stopId ? { s } : null));
        patchStops(addedId, cur, { activeStop: stopId }, "Velikost pozice");
      } else {
        writeAdded(addedId, { w: round(clamp(baseW * factor, 40, 900)) }, "Velikost 3D modelu", { group: true });
      }
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
  async function rememberAll() {
    const recs = (await all()) || [];
    items = recs.map(metaOf).sort((a, b) => (a.created < b.created ? 1 : -1));
    for (const rec of recs) metas.set(rec.id, metaOf(rec));
    return items;
  }
  async function add(file) {
    const name = file && file.name || "";
    if (!/\.glb$/i.test(name) && file.type !== "model/gltf-binary") throw new Error("Nahraj model ve formátu GLB.");
    if (file.size > 40 * 1024 * 1024) throw new Error("Model je větší než 40 MB.");
    parseGlb(await file.arrayBuffer());
    const rec = { id: uid("mdl"), name: name.replace(/\.glb$/i, "") || "model", blob: file, created: now() };
    await put(rec);
    metas.set(rec.id, metaOf(rec));
    parsed.delete(rec.id);
    await rememberAll();
    return metaOf(rec);
  }
  async function restore(list) {
    for (const item of list || []) {
      if (!item || typeof item.id !== "string" || typeof item.glb !== "string") continue;
      const blob = await (await fetch(item.glb)).blob();
      await put({ id: item.id, name: String(item.name || "model").slice(0, 120), blob, created: now() });
      parsed.delete(item.id);
    }
    await rememberAll();
  }
  async function dataUrl(id) {
    const rec = await get(id);
    if (!rec || !rec.blob) return null;
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(rec.blob);
    });
  }
  function removeLocal(id) {
    return run("readwrite", (s) => s.delete(id)).then(() => { metas.delete(id); parsed.delete(id); return rememberAll(); });
  }
  function setGate(addedId, stopId, gate) {
    const value = gate == null ? null : round(clamp(num(gate), 0, 1), 4);
    const cur = listStops(liveOf(addedId)).map((row) => copyStop(row, row.id === stopId ? { gate: value } : null));
    patchStops(addedId, cur, { activeStop: stopId }, "Odjezd pozice");
  }
  function syncGates(doc) {
    const root = doc && doc.body;
    if (!root) return;
    const win = doc.defaultView || window;
    const html = doc.documentElement;
    const modes = ["ct-mode-model", "ct-mode-element", "ct-mode-text", "ct-mode-comment"];
    const show = showModelStops(doc) && !html.classList.contains("ct-device-frame") && modes.some((name) => html.classList.contains(name));
    const wanted = new Set();
    if (show) {
      const pageH = Math.max(html.scrollHeight, doc.body.scrollHeight, 1);
      const maxScroll = Math.max(0, pageH - win.innerHeight);
      const scroll = Math.max(0, Math.min(maxScroll, win.scrollY || html.scrollTop || 0));
      for (const item of store.edits.added || []) {
        if (!item || item.kind !== "model") continue;
        const live = resolvedAdded(item, deviceOfWin(win));
        if (!live || live.removed) continue;
        const stops = listStops(live).filter((s) => !s.implicit);
        if (stops.length < 2) continue;
        const order = stops.map((s, n) => Object.assign({ n }, s)).sort((p, q) => num(p.y) - num(q.y) || num(p.x) - num(q.x) || p.n - q.n);
        order.slice(0, -1).forEach((stop, index) => {
          const key = item.id + ":" + stop.id;
          wanted.add(key);
          let line = root.querySelector(`[data-ct-gate="${CSS.escape(key)}"]`);
          if (!line) {
            line = doc.createElement("div");
            line.className = "ct-gate";
            line.dataset.ctGate = key;
            line.dataset.creatoolIgnore = "";
            const button = doc.createElement("button");
            button.type = "button";
            const drag = (event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              button.setPointerCapture(event.pointerId);
              const move = (ev) => {
                const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1);
                const limit = Math.max(0, height - win.innerHeight);
                const y = Math.max(0, Math.min(limit, ev.clientY + (win.scrollY || 0)));
                setGate(item.id, stop.id, y / height);
              };
              const up = () => {
                button.removeEventListener("pointermove", move);
                button.removeEventListener("pointerup", up);
              };
              button.addEventListener("pointermove", move);
              button.addEventListener("pointerup", up);
            };
            button.addEventListener("pointerdown", drag);
            button.addEventListener("dblclick", (event) => {
              event.preventDefault();
              event.stopPropagation();
              setGate(item.id, stop.id, null);
            });
            line.append(button);
            root.append(line);
          }
          const node = root.querySelector(`[data-ct-added="${CSS.escape(item.id)}"][data-ct-stop="${CSS.escape(stop.id)}"]`);
          const fallback = node ? node.getBoundingClientRect().bottom + (win.scrollY || 0) : scroll + win.innerHeight * 0.6;
          const docY = typeof stop.gate === "number" ? clamp(stop.gate * pageH, 0, maxScroll) : clamp(fallback, 0, maxScroll);
          line.style.top = `${docY - scroll}px`;
          line.classList.toggle("is-set", typeof stop.gate === "number");
          const button = line.querySelector("button");
          const label = `Pozice ${index + 1}`;
          button.textContent = typeof stop.gate === "number" ? `${label} · odjezd` : `${label} · zatáhni čáru odjezdu`;
          button.title = motionChoice() === "scroll"
            ? "Až tahle čára zajede za horní okraj, model se dál posouvá se scrollem. Dvojklik čáru zruší."
            : "Až tahle čára zajede za horní okraj, model sám dojede na další pozici. Dvojklik čáru zruší.";
        });
      }
    }
    for (const line of Array.from(root.querySelectorAll(".ct-gate"))) {
      if (!wanted.has(line.dataset.ctGate)) line.remove();
    }
  }
  function place(id, x, y) {
    const meta = metas.get(id);
    if (!meta) return null;
    return addModelAt(document, x, y, meta);
  }
  rememberAll().catch(() => {});
  return { add, restore, dataUrl, mount, beginOrbit, beginMoveStop, beginScale, addStop, removeStop, selectStop, setGate, syncGates, listStops, blend, place, meta: (id) => metas.get(id), listSync: () => items, refresh: rememberAll, remove: removeLocal };
})();

function modelShelf() {
  const input = h("input", { type: "file", accept: ".glb,model/gltf-binary", hidden: true });
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    try {
      const rec = await models.add(file);
      S.placing = { kind: "model", model: { id: rec.id, name: rec.name } };
      if (S.mode !== "element") ui.setMode("element");
      ui.syncModeClasses();
      S.notice = { text: "Model „" + rec.name + "“ je v knihovně. Klikni na stránku, kam ho přidat.", kind: "ok" };
      ui.renderPanel();
    } catch (err) {
      ui.flashNotice(err.message || "Model se nepodařilo nahrát.");
    }
  });
  const tiles = models.listSync().map((rec) => h("button", {
    type: "button",
    class: "model-tile",
    title: rec.name,
    "aria-pressed": String(!!S.placing && S.placing.kind === "model" && S.placing.model && S.placing.model.id === rec.id),
    onClick: () => {
      S.placing = { kind: "model", model: { id: rec.id, name: rec.name } };
      if (S.mode !== "element") ui.setMode("element");
      ui.syncModeClasses();
      ui.renderPanel();
    },
  }, h("b", {}, "3D"), h("small", {}, rec.name)));
  return h("div", { class: "model-shelf" },
    h("h3", {}, "3D modely"),
    h("p", { class: "help" }, "Nahraj soubor GLB. Bere se jako prvek: klikneš na stránku a přidá se. Tažením za model ho plně otáčíš ve 3D, Shift otáčí kolem osy, lišta ho posouvá a úchyty mění velikost. V exportu model jede s sebou."),
    h("div", { class: "row" }, h("button", { type: "button", onClick: () => input.click() }, "Nahrát GLB"), input),
    tiles.length ? h("div", { class: "lib" }, ...tiles) : h("p", { class: "meta" }, "Zatím žádný 3D model. Přetáhni GLB na stránku, nebo ho nahraj tady."),
  );
}
