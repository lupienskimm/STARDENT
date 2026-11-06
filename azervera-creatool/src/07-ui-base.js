/* ---------- UI state and building blocks (the UI lives in a shadow root, apart from the site's styles) ---------- */

const S = {
  mode: "browse", // browse | numbers | text | element | comment
  sel: null, // selected catalog key
  hovered: null,
  hoverKind: null,
  panel: false,
  collapsed: false,
  pos: null,
  barPos: null, // {x, y} of the toolbar; null keeps the default corner
  barMini: false,
  barHidden: false,
  hub: "list",
  tab: "texts",
  query: "",
  changesOnly: false,
  shapeEdit: false,
  shapePoint: null,
  stillDraw: false, // freehand: painting the region that stays put
  stillDrag: null, // rectangle preview while an older box mark is nudged
  stillStroke: null, // {pts:[[x,y],...]} the stroke under the pointer, in % of the element
  stillInk: null, // finished strokes of the current freehand session
  stillNudge: null, // saved freehand mark while it is being dragged
  stillBrush: 6, // stroke width, percent of the element's shorter side
  stillEl: null,
  guides: [],
  paddingHover: false,
  hidden: cfg.startHidden,
  device: "desktop", // device chosen in the switcher
  ask: null, // {key, group}
  notice: null, // {text, kind}
  open: new Set(["text", "layout"]),
  lastPoint: null,
  childStack: [],
  importing: null,
  commentFilter: { page: "", status: "open" },
  requestDraft: null, // {kind, trigger}
  crop: null,
  placing: null, // {art} or {kind: "text"} while the next click on the page places it
  rotating: null, // {deg, x, y} while turning an element by its handle
  focusAdded: null, // id of added text whose field gets focus when its panel opens
  placeAt: null, // {doc, x, y} pointer while placing, for the preview
  artColor: null, // colour chosen in the library
  lib: { pack: "", group: "", query: "" },
};
(() => {
  const saved = readJSON(UI_KEY, null);
  if (!saved) return;
  S.pos = saved.pos || null;
  S.barPos = saved.barPos || null;
  S.collapsed = !!saved.collapsed;
  if (typeof saved.hidden === "boolean" && !cfg.forceHidden) S.hidden = saved.hidden;
  if (saved.barMini || saved.barHidden) S.barHidden = true;
  if (Array.isArray(saved.open)) S.open = new Set(saved.open);
})();
const saveUi = () => {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ pos: S.pos, barPos: S.barPos, barMini: S.barMini, barHidden: S.barHidden, collapsed: S.collapsed, hidden: S.hidden, open: [...S.open] }));
  } catch {}
};
const isClient = () => store.settings.role === "client";
const editingMode = () => S.mode === "text" || S.mode === "element" || S.mode === "model" || S.mode === "comment";

const host = h("div", { id: "azervera-creatool", "data-creatool-ignore": "" });
const shadow = host.attachShadow({ mode: "open" });
const pageStyle = document.createElement("style");
pageStyle.setAttribute("data-creatool-ignore", "");
pageStyle.textContent = `
  html.ct-mode-element *, html.ct-mode-comment *{cursor:crosshair!important}
  html.ct-mode-element.ct-dragging *{cursor:grabbing!important}
  html.ct-mode-text *{cursor:text!important}
  html.ct-mode-element, html.ct-mode-text, html.ct-mode-model, html.ct-mode-comment{-webkit-user-select:none;user-select:none}
  html.ct-mode-element [data-creatool-id], html.ct-mode-element [data-review-id], html.ct-mode-element svg,
  html.ct-mode-comment [data-creatool-id], html.ct-mode-comment [data-review-id], html.ct-mode-comment svg{pointer-events:auto!important}
  [data-ct-flash]{outline:3px solid #ff5100!important;outline-offset:4px!important;animation:ct-flash .6s ease-in-out 3}
  @keyframes ct-flash{50%{outline-color:#ff510022}}
  html.ct-static-preview body{pointer-events:none!important}
  html.ct-placing *{cursor:copy!important}
  [data-ct-art]:not([data-ct-added]) *{visibility:hidden!important}
  [data-ct-art]:not([data-ct-added]){color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}
  img[data-ct-art]{object-position:-99999px -99999px!important}
  .ct-added{position:absolute;display:block;translate:-50% -50%;pointer-events:none}
  .ct-added[data-kind=art]{width:var(--ct-w,120px);aspect-ratio:var(--ct-ratio,1);height:auto;background:var(--ct-color,#111);-webkit-mask:var(--ct-art) center/contain no-repeat;mask:var(--ct-art) center/contain no-repeat}
  .ct-added[data-kind=text]{width:max-content;max-width:var(--ct-w,480px);margin:0;padding:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--ct-font);font-size:var(--ct-size,24px);font-weight:var(--ct-weight,400);font-style:var(--ct-style,normal);line-height:var(--ct-lh,1.2);letter-spacing:normal;text-transform:var(--ct-tt,none);text-align:var(--ct-align,left);color:var(--ct-color,#111)}
  html.ct-mode-text .ct-added{pointer-events:auto!important}
  .ct-added[data-kind=model]{width:var(--ct-w,260px);height:calc(var(--ct-w,260px) / .9);display:flex;flex-direction:column}
  .ct-model-bar{display:none;flex:0 0 auto;flex-direction:column;gap:4px;font:600 11px/1.3 system-ui,sans-serif;padding:4px 8px;background:var(--ct-chrome,#34483e);color:var(--ct-on,#fff);border-radius:12px 12px 0 0;pointer-events:auto;cursor:grab}
  html.ct-mode-element .ct-model-bar,html.ct-mode-text .ct-model-bar,html.ct-mode-model .ct-model-bar,html.ct-mode-comment .ct-model-bar{display:flex}
  .ct-gate{position:fixed;left:0;right:0;height:28px;margin-top:-14px;z-index:2147483000;display:flex;align-items:center;pointer-events:none}
  .ct-gate::before{content:"";position:absolute;left:0;right:0;top:50%;border-top:1.5px dashed #aa8c5088}
  .ct-gate.is-set::before{border-top-color:#aa8c50}
  .ct-gate button{position:relative;margin-left:16px;pointer-events:auto;border:0;border-radius:999px;background:#34483e;color:#faf9f6;font:600 12px/1 system-ui,sans-serif;padding:6px 10px;cursor:ns-resize}
  .ct-added[data-kind=model] canvas{display:block;width:100%;height:100%;flex:1;min-height:0;pointer-events:none}
  .ct-model-scale{display:none;position:absolute;right:4px;bottom:4px;z-index:2;width:28px;height:28px;border:0;border-radius:50%;background:var(--ct-chrome,#34483e);color:var(--ct-on,#fff);cursor:nwse-resize;pointer-events:auto;font-size:14px}
  html.ct-mode-element .ct-model-scale,html.ct-mode-model .ct-model-scale{display:grid;place-items:center}
  html.ct-mode-element .ct-added[data-kind=model],html.ct-mode-model .ct-added[data-kind=model]{pointer-events:auto}
  html.ct-mode-element .ct-added[data-kind=model] canvas,html.ct-mode-model .ct-added[data-kind=model] canvas{pointer-events:auto;cursor:grab!important;touch-action:none}`;

const CSS_TEXT = `
:host{all:initial}
*{box-sizing:border-box}
[hidden]{display:none!important}
.ui{font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#f0eee7;-webkit-font-smoothing:antialiased}
button,input,textarea,select{font:inherit;color:inherit;letter-spacing:normal;text-transform:none}
button{cursor:pointer;min-height:32px;padding:5px 10px;background:transparent;border:1px solid #f0eee738;border-radius:6px}
button:hover{border-color:#f0eee780}
button:disabled{opacity:.4;cursor:default}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #ff7e42;outline-offset:2px}
button[aria-pressed=true]{background:#ff5100;border-color:#ff5100;color:#111}
.box.still{outline:2px dashed #6fb7ff;background:#6fb7ff33;pointer-events:auto;cursor:move;touch-action:none}
.box.still span,.box.still-target span{position:absolute;left:0;bottom:100%;margin-bottom:3px;padding:2px 6px;background:#16324a;color:#bfe0ff;border-radius:3px;font:10px/1.3 ui-monospace,monospace;white-space:nowrap;pointer-events:none}
.box.still i{position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;margin:0;background:#6fb7ff;border:2px solid #fff;border-radius:2px;cursor:nwse-resize;pointer-events:auto;touch-action:none}
.box.still.live{pointer-events:none}
.box.still-target{outline:1px dashed #6fb7ff;pointer-events:none}
.still-ink{position:absolute;overflow:visible}
.still-ink,.still-ink svg,.still-ink path{pointer-events:none}
.still-ink.hit path{pointer-events:stroke;cursor:move;touch-action:none}
.still-ink span{position:absolute;left:0;bottom:100%;margin-bottom:3px;padding:2px 6px;background:#16324a;color:#bfe0ff;border-radius:3px;font:10px/1.3 ui-monospace,monospace;white-space:nowrap;pointer-events:none}
.bar{position:fixed;left:14px;bottom:14px;z-index:2147483646;display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:calc(100vw - 28px);padding:7px;background:#111110;border:1px solid #f0eee73b;border-radius:11px;box-shadow:0 8px 30px #0007}
.bar-grip{display:inline-flex;align-items:center;justify-content:center;min-width:18px;padding:0 2px;cursor:grab;user-select:none;touch-action:none;opacity:.8;font-size:15px;line-height:1;letter-spacing:-.14em}
.bar-grip:active{cursor:grabbing}
.bar-icon{min-width:32px;padding:5px 8px}
.bar.is-mini,.bar.is-hidden{width:max-content;flex-wrap:nowrap;cursor:grab}
.bar.is-hidden{border-radius:999px;padding:8px 12px}
.motion-slot{display:flex;max-width:0;max-height:0;opacity:0;overflow:hidden;transform:translateY(8px);margin-right:-6px;pointer-events:none;transition:max-width .34s cubic-bezier(.2,.85,.2,1),max-height .34s cubic-bezier(.2,.85,.2,1),opacity .24s ease,transform .34s cubic-bezier(.2,.85,.2,1),margin-right .34s ease}
.motion-slot.is-on{max-width:720px;max-height:64px;opacity:1;transform:none;margin-right:0;pointer-events:auto}
.motion button.motion-lock{min-width:46px;padding:8px 12px;font-size:16px;line-height:1}
.brand{font:800 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;padding:0 6px;color:#ff5100;white-space:nowrap}
.brand small{display:block;font:500 8px/1.4 ui-monospace,monospace;letter-spacing:.06em;color:#8d8a82;margin-top:3px}
.grp{display:flex;gap:2px;padding:2px;background:#f0eee714;border-radius:8px}
.grp button{border-color:transparent;font-size:12px}
.motion{display:flex;gap:3px;padding:4px;background:#f0eee714;border:1px solid #f0eee738;border-radius:14px}
.motion button{min-height:46px;padding:8px 18px;font-size:15px;font-weight:700;border-color:transparent;border-radius:10px}
.status{font-size:10px;color:#aaa;padding:0 4px;max-width:200px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ff5100;margin-left:5px;vertical-align:middle}
.pill{position:fixed;left:14px;bottom:14px;z-index:2147483646;background:#111110;border-color:#f0eee755;font:700 11px/1 ui-monospace,monospace;letter-spacing:.1em;color:#ff5100;padding:9px 12px;border-radius:999px}
.panel{position:fixed;right:14px;top:14px;bottom:80px;z-index:2147483645;width:min(420px,calc(100vw - 28px));overflow:auto;overscroll-behavior:contain;padding:16px 16px 20px;background:#191917;border:1px solid #f0eee74a;border-radius:13px;box-shadow:0 14px 70px #0009}
.panel>header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #ffffff22;cursor:move;touch-action:none;user-select:none}
.panel>header strong{font-size:17px;font-weight:650}
.panel>header .acts{display:flex;gap:2px}
.panel>header .acts button{font-size:20px;line-height:1;width:32px;padding:0}
.mini{position:fixed;right:14px;top:14px;z-index:2147483645;display:flex;align-items:center;gap:10px;min-height:38px;padding:7px 10px 7px 15px;background:#191917;border:1px solid #f0eee74a;border-radius:999px;box-shadow:0 8px 30px #0008;font-size:12px;white-space:nowrap;cursor:move;touch-action:none;user-select:none}
.mini b{background:#ff5100;color:#111;border-radius:999px;padding:1px 8px;font-size:11px}
.tabs{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 12px}
.tabs button{font-size:11px;padding:4px 8px;min-height:28px}
.tabs button[aria-selected=true]{background:#f0eee7;color:#111;border-color:#f0eee7}
.help,.meta{font-size:11px;line-height:1.6;color:#b5b2aa;margin:6px 0}
.title{font-size:15px;font-weight:600;margin:6px 0 2px;overflow-wrap:anywhere}
.row{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.row button{font-size:11px}
.note{font-size:12px;line-height:1.55;padding:9px 11px;margin:10px 0;border:1px solid #ff510066;border-radius:8px;background:#ff510012}
.note.ok{border-color:#7fd18b66;background:#7fd18b12}
.note.warn{border-color:#ffcc4d88;background:#ffcc4d14}
.tag{display:inline-block;font-size:10px;line-height:1.3;padding:2px 7px;border-radius:999px;background:#f0eee71c;color:#e8e5dc;margin:2px 4px 2px 0}
.tag.local{background:#6fb7ff2e;color:#bfe0ff}
.tag.dev{background:#b9ef7a2e;color:#dcf7b8}
.tag.pend{background:#ffcc4d33;color:#ffe29a}
details.sec{border-top:1px solid #ffffff1c;padding:2px 0}
details.sec>summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:650;color:#eae7de;padding:10px 0}
details.sec>summary::-webkit-details-marker{display:none}
details.sec>summary::after{content:"+";font-weight:400;color:#999}
details.sec[open]>summary::after{content:"–"}
details.sec>div{padding:0 0 12px}
h3{font-size:12px;font-weight:650;color:#ddd;margin:16px 0 8px}
label.l{display:block;font-size:11px;color:#cfccc4;margin:10px 0 5px}
textarea,input[type=search],input[type=text],input[type=url],input[type=email],input[type=tel],select{width:100%;padding:7px 9px;background:#f5f3ec;color:#111;border:1px solid #d9d6cc;border-radius:6px}
textarea{min-height:80px;resize:vertical;line-height:1.55}
select{padding:5px 8px}
.field{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;font-size:12px;margin:10px 0}
.field .lbl{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.field input[type=range]{grid-column:1/-1;width:100%;accent-color:#ff5100;margin:0}
.field .val{display:flex;align-items:center;gap:4px;color:#bbb}
.field .val input{width:70px;padding:3px 6px;background:#f5f3ec;color:#111;border:1px solid #d9d6cc;border-radius:5px;text-align:right}
.field .val select{width:auto;padding:2px 4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.grid4 label{font-size:10px;color:#aaa;display:grid;gap:3px}
.grid4 input{width:100%;padding:3px 5px;background:#f5f3ec;color:#111;border:1px solid #d9d6cc;border-radius:5px;text-align:right}
.seg{display:flex;flex-wrap:wrap;gap:3px;margin:6px 0}
.seg button{font-size:11px;padding:3px 8px;min-height:28px}
.check{display:flex;align-items:center;gap:8px;font-size:12px;margin:8px 0;cursor:pointer}
.check input{accent-color:#ff5100;width:16px;height:16px}
.color{display:flex;align-items:center;gap:6px;margin:8px 0;font-size:12px}
.color .lbl{flex:1}
.color input[type=color]{width:34px;height:28px;padding:0;border:1px solid #f0eee755;border-radius:5px;background:none;cursor:pointer}
.color input[type=text]{width:118px;padding:3px 6px}
.color select{width:98px;padding:2px 4px;font-size:11px}
.mini-reset{min-height:0;padding:0 5px;font-size:11px;line-height:1.5;border-radius:4px}
.fonts{display:grid;gap:6px}
.font{display:block;width:100%;text-align:left;padding:8px 10px 10px;background:#242421;border-color:#ffffff22}
.font[aria-pressed=true]{background:#ff51001c;border-color:#ff5100;color:inherit}
.font small{display:block;font:10px/1.4 ui-monospace,monospace;color:#bbb;margin-bottom:6px}
.font span{display:block;font-size:22px;line-height:1.35;max-height:66px;overflow:hidden;overflow-wrap:anywhere}
.list button.item{display:flex;gap:10px;width:100%;text-align:left;padding:9px 0;border:0;border-bottom:1px solid #ffffff20;border-radius:0;font-size:12px}
.list b{color:#ff864d;min-width:36px}
.list small{display:block;color:#999;font-size:10px;margin-top:3px}
.card{border:1px solid #ffffff22;border-radius:9px;padding:10px;margin:8px 0;background:#1f1f1d}
.card .row{margin:6px 0 0}
.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.thumbs figure{margin:0;border:1px solid #ffffff22;border-radius:7px;overflow:hidden;background:#222;cursor:pointer}
.thumbs img{display:block;width:100%;height:78px;object-fit:cover}
.thumbs figcaption{font-size:10px;padding:4px 6px;color:#bbb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cropbox{position:relative;margin:8px 0;user-select:none;touch-action:none;background:#000;border-radius:6px;overflow:hidden}
.cropbox img{display:block;width:100%;opacity:.55}
.cropbox .crop{position:absolute;border:2px solid #ff5100;box-shadow:0 0 0 999px #0008;cursor:move}
.cropbox .crop i{position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;background:#ff5100;border-radius:3px;cursor:nwse-resize}
.cropbox .focal{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #ff5100;pointer-events:none}
.comp-prev{width:100%;height:120px;border:1px solid #ffffff22;border-radius:7px;background:#fff;overflow:hidden;position:relative}
.comp-prev iframe{position:absolute;left:0;top:0;border:0;width:400%;height:400%;transform:scale(.25);transform-origin:0 0;pointer-events:none}
.thread{border-left:2px solid #ff510066;padding-left:10px;margin:8px 0}
.thread p{margin:4px 0;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.thread small{color:#999;font-size:10px}
footer{font-size:10px;color:#9d9a92;margin-top:20px;padding-top:12px;border-top:1px solid #ffffff22}
footer b{color:#ff864d;font-weight:600}
.overlay{position:fixed;inset:0;pointer-events:none;z-index:2147483644}
.box{position:absolute;border-radius:2px}
.box.hover{outline:1px dashed #f0eee7cc;background:#ff510012}
.box.hover span,.lab{position:absolute;left:0;bottom:100%;margin-bottom:3px;padding:2px 6px;background:#111;color:#f0eee7;border:1px solid #f0eee755;border-radius:3px;font:10px/1.3 ui-monospace,monospace;white-space:nowrap;max-width:min(420px,80vw);overflow:hidden;text-overflow:ellipsis}
.box.sel{outline:2px solid #ff5100;outline-offset:1px}
.box.pad{background:#7fd18b40;outline:0}
.box.place{outline:2px dashed #6fb7ff;background:#6fb7ff18}
.box.place span{position:absolute;left:6px;top:4px;font:10px/1.3 ui-monospace,monospace;color:#bfe0ff;background:#111c;padding:2px 5px;border-radius:3px}
.handle{position:absolute;width:11px;height:11px;margin:-6px 0 0 -6px;background:#fff;border:2px solid #ff5100;border-radius:2px;pointer-events:auto;touch-action:none}
.pt{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;background:#ff5100;border:2px solid #fff;border-radius:50%;pointer-events:auto;cursor:move;touch-action:none}
.pt.on{background:#fff;border-color:#ff5100}
.edge{position:absolute;height:12px;margin-top:-6px;transform-origin:0 50%;pointer-events:auto;cursor:copy}
.guide{position:absolute;background:#ff2d8f;pointer-events:none}
.guide span{position:absolute;padding:1px 5px;background:#ff2d8f;color:#fff;font:10px/1.3 ui-monospace,monospace;border-radius:3px;white-space:nowrap}
.gridlines{position:absolute;inset:0;background-image:linear-gradient(#6fb7ff22 1px,transparent 1px),linear-gradient(90deg,#6fb7ff22 1px,transparent 1px)}
.badge{position:absolute;transform:translateY(-100%);padding:1px 5px;min-height:0;background:#ff5100;color:#111;border:1px solid #111;border-radius:3px;font:10px/1.2 ui-monospace,monospace;pointer-events:auto;cursor:pointer}
.badge.changed{background:#b9ef7a}
.badge.sel{outline:2px solid #f0eee7;outline-offset:1px}
.badge.com{background:#6fb7ff;border-radius:10px 10px 10px 2px}
.badge.pend{background:#ffcc4d}
.reach{position:absolute;z-index:5;transform:translate(-50%,-50%);max-width:210px;padding:5px 9px;border:0;border-radius:999px;background:#ff5100;color:#111;font:600 11px/1.2 system-ui,sans-serif;cursor:grab;pointer-events:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 16px #0008}
.stage{position:fixed;inset:0;z-index:2147483640;background:#252522;background-image:radial-gradient(#ffffff10 1px,transparent 1px);background-size:18px 18px}
.stage iframe{position:absolute;top:14px;border:0;background:#fff;border-radius:10px;box-shadow:0 20px 60px #000a;transform-origin:0 0}
.stage .dev{position:absolute;top:18px;left:18px;font:11px/1.4 ui-monospace,monospace;color:#bbb}
.banner{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483646;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;background:#1f3b57;border:1px solid #6fb7ff88;border-radius:10px;font-size:12px;color:#e6f2ff;box-shadow:0 8px 30px #0008;max-width:calc(100vw - 28px)}
.banner select{width:auto;padding:3px 6px}
.rot-stem{position:absolute;width:0;border-left:1px dashed #ff5100;pointer-events:none}
.rot{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;border:2px solid #ff5100;box-shadow:0 1px 4px #0006;pointer-events:auto;cursor:grab;touch-action:none}
.rot:hover{background:#ff5100}
.rot-lab{position:absolute;transform:translate(-50%,-130%);padding:2px 6px;background:#ff5100;color:#111;border-radius:3px;font:11px/1.3 ui-monospace,monospace;pointer-events:none;white-space:nowrap}
button.danger{border-color:#ff6b6b88;color:#ffb3b3}
button.danger:hover{border-color:#ff6b6b;background:#ff6b6b1f}
.ghost-text{position:absolute;transform:translate(-50%,-50%);padding:2px 8px;border:1px dashed #6fb7ff;background:#6fb7ff22;color:var(--c);font:600 20px/1.2 system-ui,sans-serif;white-space:nowrap;pointer-events:none}
.ghost{position:absolute;transform:translate(-50%,-50%);opacity:.8;background:var(--c);-webkit-mask:var(--src) center/contain no-repeat;mask:var(--src) center/contain no-repeat;pointer-events:none}
.ghost-lab{position:absolute;transform:translateX(-50%);padding:2px 6px;background:#111;color:#f0eee7;border:1px solid #f0eee755;border-radius:3px;font:10px/1.3 ui-monospace,monospace;white-space:nowrap;pointer-events:none}
.swatches{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:6px 0}
.swatches button{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:3px 9px 3px 5px;min-height:28px}
.swatches i{width:16px;height:16px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 1px #ffffff66,0 0 0 1px #0006}
.swatches input[type=color]{width:30px;height:28px;padding:0;border:1px solid #f0eee755;border-radius:6px;background:none;cursor:pointer}
.chips{display:flex;flex-wrap:wrap;gap:3px;margin:8px 0}
.chips button{font-size:10.5px;padding:2px 8px;min-height:24px;border-radius:999px}
.lib{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0}
.lib button{display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:8px 5px 6px;min-height:0;border-radius:8px;background:var(--tile);border-color:transparent}
.lib button:hover{border-color:#ff5100}
.lib button[aria-pressed=true]{background:var(--tile);color:inherit;outline:2px solid #ff5100;outline-offset:1px}
.lib i,.art-prev i{display:block;background:var(--c);-webkit-mask:var(--src) center/contain no-repeat;mask:var(--src) center/contain no-repeat}
.lib i{height:52px}
.lib small{font-size:9.5px;line-height:1.25;color:var(--tc);text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.art-prev{display:flex;align-items:center;gap:12px;margin:8px 0;padding:10px 12px;border-radius:9px;background:var(--tile)}
.art-prev i{flex:none;width:76px;height:56px}
.art-prev span{font-size:12px;font-weight:600;color:var(--tc)}
.art-prev small{display:block;font-weight:400;font-size:10px;opacity:.75;margin-top:2px}

.ui{color:var(--ui-fg,#f0eee7)}
button{border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 22%,transparent)}
button:hover{border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 50%,transparent)}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline-color:var(--ui-accent,#ff5100)}
button[aria-pressed=true]{background:var(--ui-accent,#ff5100);border-color:var(--ui-accent,#ff5100);color:var(--ui-on,#111)}
.bar{background:var(--ui-bg,#111110);color:var(--ui-fg,#f0eee7);border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 24%,transparent)}
.brand,.pill{color:var(--ui-accent,#ff5100)}
.pill{background:var(--ui-bg,#111110);border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 32%,transparent)}
.brand small,.status,.help,.meta{color:color-mix(in srgb,var(--ui-fg,#f0eee7) 68%,transparent)}
.grp{background:color-mix(in srgb,var(--ui-fg,#f0eee7) 8%,transparent)}
.dot{background:var(--ui-accent,#ff5100)}
.panel,.mini{background:var(--ui-bg-2,#191917);color:var(--ui-fg,#f0eee7);border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 28%,transparent)}
.panel>header{border-bottom-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent)}
.mini b,.badge{background:var(--ui-accent,#ff5100);color:var(--ui-on,#111)}
.tabs button[aria-selected=true]{background:var(--ui-fg,#f0eee7);color:var(--ui-ink,#111);border-color:var(--ui-fg,#f0eee7)}
.note{border-color:color-mix(in srgb,var(--ui-accent,#ff5100) 45%,transparent);background:color-mix(in srgb,var(--ui-accent,#ff5100) 14%,transparent)}
.title,h3,details.sec>summary,label.l{color:var(--ui-fg,#f0eee7)}
details.sec{border-top-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 14%,transparent)}
textarea,input[type=search],input[type=text],input[type=url],input[type=email],input[type=tel],select,.field .val input,.grid4 input{background:var(--ui-field,#f5f3ec);color:var(--ui-ink,#111);border-color:color-mix(in srgb,var(--ui-ink,#111) 16%,var(--ui-field,#f5f3ec))}
.field input[type=range],.check input{accent-color:var(--ui-accent,#ff5100)}
.font,.card{background:color-mix(in srgb,var(--ui-fg,#f0eee7) 7%,var(--ui-bg,#111110));border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent)}
.font[aria-pressed=true]{background:color-mix(in srgb,var(--ui-accent,#ff5100) 16%,var(--ui-bg,#111110));border-color:var(--ui-accent,#ff5100);color:inherit}
.list b,footer b{color:var(--ui-accent,#ff5100)}
.list button.item{border-bottom-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 14%,transparent)}
.thumbs figure{border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent);background:color-mix(in srgb,var(--ui-fg,#f0eee7) 6%,var(--ui-bg,#111110))}
.cropbox .crop{border-color:var(--ui-accent,#ff5100)}
.cropbox .crop i,.pt{background:var(--ui-accent,#ff5100)}
.cropbox .focal{box-shadow:0 0 0 2px var(--ui-accent,#ff5100)}
footer{border-top-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent);color:color-mix(in srgb,var(--ui-fg,#f0eee7) 60%,transparent)}
.box.hover{outline-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 80%,transparent);background:color-mix(in srgb,var(--ui-accent,#ff5100) 12%,transparent)}
.box.hover span,.lab,.ghost-lab{background:var(--ui-bg,#111);color:var(--ui-fg,#f0eee7);border-color:color-mix(in srgb,var(--ui-fg,#f0eee7) 32%,transparent)}
.box.sel{outline-color:var(--ui-accent,#ff5100)}
.handle,.rot{border-color:var(--ui-accent,#ff5100)}
.pt{border-color:var(--ui-field,#fff)}
.rot-stem{border-left-color:var(--ui-accent,#ff5100)}
.rot-lab{background:var(--ui-accent,#ff5100);color:var(--ui-on,#111)}
.rot:hover{background:var(--ui-accent,#ff5100)}
.stage{background:var(--ui-bg,#252522)}
.lib button:hover,.lib button[aria-pressed=true]{border-color:var(--ui-accent,#ff5100);outline-color:var(--ui-accent,#ff5100)}
.lib button.model-tile b{font:700 18px/1 ui-monospace,monospace;letter-spacing:.08em;color:var(--ui-accent,#ff5100);padding:14px 0 2px}
.model-shelf{margin:8px 0 18px;padding-bottom:12px;border-bottom:1px solid color-mix(in srgb,var(--ui-fg,#f0eee7) 16%,transparent)}
`;

/* ---------- field builders ---------- */

function numField(label, value, o = {}) {
  const min = o.min ?? 0;
  const max = o.max ?? 100;
  const step = o.step ?? 1;
  const v = num(value, o.fallback ?? 0);
  const range = h("input", { type: "range", min, max, step, value: clamp(v, min, max), "aria-label": label });
  const input = h("input", { type: "number", step, value: round(v, 2), "aria-label": label });
  const emit = (n) => o.onInput && o.onInput(n);
  range.addEventListener("input", () => {
    input.value = range.value;
    emit(Number(range.value));
  });
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (input.value !== "" && Number.isFinite(n)) {
      range.value = clamp(n, min, max);
      emit(n);
    }
  });
  if (o.onFocus) [range, input].forEach((x) => {
    x.addEventListener("pointerenter", () => o.onFocus(true));
    x.addEventListener("pointerleave", () => o.onFocus(false));
    x.addEventListener("focus", () => o.onFocus(true));
    x.addEventListener("blur", () => o.onFocus(false));
  });
  return h("div", { class: "field" }, h("span", { class: "lbl" }, label, o.badge || null), h("span", { class: "val" }, input, o.unitEl || o.unit || ""), range);
}
function lengthField(label, len, o = {}) {
  const units = o.units || ["px", "%", "vw", "vh", "auto"];
  const cur = len || { v: o.current ?? 0, u: "px" };
  const unit = h("select", { "aria-label": label + " jednotka" }, units.map((u) => h("option", { value: u, selected: u === cur.u }, u)));
  const max = { px: 2400, "%": 200, vw: 200, vh: 200, auto: 1 }[cur.u] || 2400;
  const f = numField(label, cur.u === "auto" ? 0 : cur.v, { min: 0, max, step: cur.u === "px" ? 1 : 0.5, unitEl: unit, badge: o.badge, onInput: (n) => o.onInput({ v: n, u: unit.value }) });
  unit.addEventListener("change", () => o.onUnit ? o.onUnit(unit.value) : o.onInput({ v: num(cur.v), u: unit.value }));
  return f;
}
function colorField(label, value, onInput, o = {}) {
  const tokens = Object.entries(allTokens(store.edits)).filter(([, t]) => t.type === "color");
  const isToken = typeof value === "string" && value.startsWith("token:");
  const hex = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#000000";
  const picker = h("input", { type: "color", value: hex, "aria-label": label });
  const text = h("input", { type: "text", value: isToken ? "" : value || "", placeholder: isToken ? "z tokenu" : "#ff5100 / rgba()", "aria-label": label + " hodnota" });
  const tok = tokens.length ? h("select", { "aria-label": label + " token" }, h("option", { value: "" }, "token…"), tokens.map(([n]) => h("option", { value: n, selected: isToken && value === "token:" + n }, n))) : null;
  picker.addEventListener("input", () => {
    text.value = picker.value;
    if (tok) tok.value = "";
    onInput(picker.value);
  });
  text.addEventListener("change", () => {
    const v = safeColor(text.value.trim());
    if (v) {
      if (/^#[0-9a-f]{6}$/i.test(v)) picker.value = v;
      if (tok) tok.value = "";
      onInput(v);
    }
  });
  if (tok) tok.addEventListener("change", () => tok.value && onInput("token:" + tok.value));
  const swatches = artColors().slice(0, 8).map((c) => h("button", { type: "button", title: c.name + " " + c.value, "aria-label": c.name, "aria-pressed": String(String(value).toLowerCase() === String(c.value).toLowerCase()), onClick: () => { text.value = c.value; if (/^#[0-9a-f]{6}$/i.test(c.value)) picker.value = c.value; if (tok) tok.value = ""; onInput(c.value); } }, withVars(h("i", {}), { "--c": resolveColor(c.value) })));
  return h("div", { class: "color" }, h("span", { class: "lbl" }, label, o.badge || null), swatches.length ? h("span", { class: "swatches" }, ...swatches) : null, picker, text, tok);
}
function seg(options, value, onPick, o = {}) {
  return h("div", { class: "seg", role: "group", "aria-label": o.label || "" }, options.map(([v, text, title]) => h("button", { type: "button", title: title || null, "aria-pressed": String(value === v), onClick: () => onPick(v) }, text)));
}
function check(label, checked, onChange, o = {}) {
  const input = h("input", { type: "checkbox", checked: !!checked, disabled: !!o.disabled });
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "check", title: o.title || null }, input, h("span", {}, label));
}
function selectField(label, options, value, onChange) {
  const s = h("select", { "aria-label": label }, options.map(([v, text]) => h("option", { value: v, selected: v === value }, text)));
  s.addEventListener("change", () => onChange(s.value));
  return h("div", {}, h("label", { class: "l" }, label), s);
}
function section(id, title, body, o = {}) {
  const d = h("details", { class: "sec", open: o.open ?? S.open.has(id) });
  d.addEventListener("toggle", () => {
    if (d.open) S.open.add(id);
    else S.open.delete(id);
    saveUi();
  });
  d.append(h("summary", {}, h("span", {}, title, o.tag || null)), h("div", {}, body()));
  return d;
}

/* ---------- drawings in the panel ---------- */

function withVars(el, vars) {
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  return el;
}
/** Tile colours so a white drawing sits on a dark tile and a dark drawing on a light one. */
function tileVars(color) {
  const light = isLightColor(color);
  return { "--c": resolveColor(color), "--tile": light ? "#2b2b28" : "#f0eee7", "--tc": light ? "#d6d3cb" : "#4a4843" };
}
function artPreview(art, note) {
  const url = safeUrl(art.src || "");
  return withVars(h("div", { class: "art-prev" }, withVars(h("i", {}), { "--src": url ? cssUrl(url) : "none" }), h("span", {}, art.name || art.id || "kresba", note ? h("small", {}, note) : null)), tileVars(art.color));
}
function artColorPicker(value, onPick) {
  const wrap = h("div", { class: "swatches", role: "group", "aria-label": "Barva kresby" });
  const known = artColors().some((c) => c.value === value);
  for (const c of artColors()) wrap.append(h("button", { type: "button", "aria-pressed": String(value === c.value), title: c.value, onClick: () => onPick(c.value) }, withVars(h("i", {}), { "--c": resolveColor(c.value) }), c.name));
  const hex = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#000000";
  const custom = h("input", { type: "color", value: hex, title: "Vlastní barva", "aria-label": "Vlastní barva" });
  custom.addEventListener("change", () => onPick(custom.value));
  wrap.append(custom);
  if (!known && value) wrap.append(h("span", { class: "tag" }, "vlastní"));
  return wrap;
}
