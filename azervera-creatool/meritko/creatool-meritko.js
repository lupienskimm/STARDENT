/*! Azervera CREATOOL: stable scale (stabilní měřítko). made by lupienskim
 * Inline this in <head> (or first thing in <body>) so it runs before the first paint; never load it async or deferred.
 *
 * Designs made in CREATOOL are exact at its preview widths (phone 390, tablet 768, desktop 1440 px), and everything the
 * editor writes is in pixels at those widths. This keeps every screen on one of them:
 *  1. Phones and tablets (touch screens) lay the page out at the phone or tablet width through the viewport tag and the
 *     browser scales it to the screen. Upright phones get the phone width, and so does a window already
 *     narrower than 500px; phones on their side and tablets up to the
 *     desktop breakpoint get the tablet width; wider screens keep device-width.
 *  2. A desktop window (from desktopFrom) uses the nearest of three layouts: 1280, 1440 or 1920.
 *     That layout is shown at 1:1, centered, the same with the editor closed as with it open.
 *     It is scaled down only when the window is narrower than the layout, so nothing is blown up to fill a wider screen.
 *     --page is that layout width. Media queries still see the real width. --vw and --vh follow the layout.
 * Off inside CREATOOL's preview frames. While the editor is open the chosen computer layout stays at 1:1.
 *
 * Settings (all optional), before this script: window.CreatoolFit = { phone: 390, tablet: 768, desktop: 1440,
 * desktopFrom: 1025, phoneMax: 600, short: 0, background: "" }. short > 0 sets html[data-short] while the layout is at most that tall,
 * for height checks that would otherwise need a (max-height) media query. background is the colour around the pinned column;
 * left empty, it is the page's own html background, so nothing flashes while the site's CSS is still loading.
 * Media queries see the window, not the layout: target one computer layout with html[data-pc="1280|1440|1920"].
 * Marks on <html>: data-fit="phone|tablet", data-fit-small (screen narrower than its layout), data-zoom, data-short.
 * window.CreatoolFit.zoom() returns the current zoom; divide getBoundingClientRect values by it before they go into CSS.
 */
(function () {
  try {
    var cfg = window.CreatoolFit || {};
    var PHONE = cfg.phone || 390, TABLET = cfg.tablet || 768, DESKTOP = cfg.desktop || 1440;
    var DESKTOP_FROM = cfg.desktopFrom || 1025, PHONE_MAX = cfg.phoneMax || 600, SHORT = cfg.short || 0;
    var d = document, h = d.documentElement, frame = /^creatool-frame:/.test(window.name || "");
    var editor = false, raf = 0, want = "width=device-width, initial-scale=1";
    var touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;

    // Frameworks (Next.js among them) add their own viewport tag again while hydrating and the last tag wins,
    // so every viewport tag in <head>, present or added later, is kept on the chosen value.
    function sync() {
      var all = d.querySelectorAll('meta[name="viewport"]');
      if (!all.length) { var m = d.createElement("meta"); m.name = "viewport"; (d.head || h).appendChild(m); all = [m]; }
      for (var i = 0; i < all.length; i++) if (all[i].getAttribute("content") !== want) all[i].setAttribute("content", want);
    }
    function fit() {
      var s = Math.min(screen.width, screen.height), l = Math.max(screen.width, screen.height);
      var o = screen.orientation && screen.orientation.type;
      var up = o ? o.indexOf("portrait") === 0 : matchMedia("(orientation: portrait)").matches;
      var cur = up ? s : l, w = 0;
      // A window already under 500px is a phone even when the reported screen sits just
      // above phoneMax. PageSpeed's lab does that and would otherwise lay the page out at 768.
      if (touch && !frame) { if ((innerWidth > 0 && innerWidth < 500) || (up && s < PHONE_MAX)) w = PHONE; else if (cur < DESKTOP_FROM) w = TABLET; }
      want = w ? "width=" + w : "width=device-width, initial-scale=1";
      sync();
      if (w) {
        h.setAttribute("data-fit", w === PHONE ? "phone" : "tablet");
        if (cur < w) h.setAttribute("data-fit-small", ""); else h.removeAttribute("data-fit-small");
      } else { h.removeAttribute("data-fit"); h.removeAttribute("data-fit-small"); }
    }
    var PC = [1280, DESKTOP, 1920];
    function design(w) {
      if (cfg.forcePc) return cfg.forcePc;
      if (w < DESKTOP_FROM) return w >= TABLET ? TABLET : PHONE;
      if (w < (PC[0] + PC[1]) / 2) return PC[0];
      if (w < (PC[1] + PC[2]) / 2) return PC[1];
      return PC[2];
    }
    function pcLayout(dw) { return PC.indexOf(dw) >= 0; }
    function short(z) {
      if (!SHORT) return;
      if (innerHeight / z <= SHORT) h.setAttribute("data-short", ""); else h.removeAttribute("data-short");
    }
    function unpin() {
      var style = d.getElementById("creatool-pin");
      if (style) style.remove();
      var b = d.body; if (b) { b.style.removeProperty("width"); b.style.removeProperty("margin-left"); b.style.removeProperty("margin-right"); }
    }
    function clear() {
      h.style.removeProperty("zoom"); h.style.removeProperty("--vw"); h.style.removeProperty("--vh");
      h.style.removeProperty("--page"); h.style.removeProperty("background");
      h.removeAttribute("data-zoom"); h.removeAttribute("data-pc");
      unpin();
      short(1);
    }
    // Before <body> exists there is no scrollbar yet. These pages scroll, and a classic
    // scrollbar is about 16px, so reserve it or the first paint picks 1440 and then jumps.
    function bar() {
      var sb = Math.max(0, Math.min(40, innerWidth - h.clientWidth));
      if (!sb && !d.body) return 16;
      return sb;
    }
    // A colour read from the page before the pin overrides it. var(--paper) alone is empty until the site's CSS
    // arrives, which shows the browser's white for one frame on every page load.
    var paperColor = cfg.background || "";
    function paper() {
      if (paperColor) return paperColor;
      try {
        var c = getComputedStyle(h).backgroundColor;
        if (c && c !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(c)) paperColor = c;
      } catch (e) {}
      return paperColor || "var(--paper)";
    }
    // Editor shows one of the three layouts at its real pixel size.
    // --page is set even when <body> is still missing, and the column width lives in a
    // style element so it applies as the body is parsed, before the first paint. That element sits before the site's
    // stylesheets, so a plain body selector would lose to their body{margin:0} and paint the column at the left edge first.
    function pin(dw) {
      h.style.removeProperty("zoom"); h.removeAttribute("data-zoom");
      h.style.setProperty("background", paper());
      h.style.setProperty("--vw", dw / 100 + "px");
      h.style.setProperty("--vh", innerHeight / 100 + "px");
      h.style.setProperty("--page", dw + "px");
      h.setAttribute("data-pc", String(dw));
      var style = d.getElementById("creatool-pin");
      if (!style) { style = d.createElement("style"); style.id = "creatool-pin"; (d.head || h).appendChild(style); }
      style.textContent = "html body{width:" + dw + "px;margin-left:auto;margin-right:auto}";
      var b = d.body;
      if (b) { b.style.width = dw + "px"; b.style.marginLeft = "auto"; b.style.marginRight = "auto"; }
      short(1);
    }
    function zoom() {
      if (!editor) cfg.forcePc = 0;
      var w = innerWidth, dw = design(w);
      if (frame || h.hasAttribute("data-fit") || !dw) { clear(); return; }
      if (editor && pcLayout(dw)) { pin(dw); return; }
      if (editor) { clear(); return; }
      // Visitors get the same 1:1 column as the open editor. A wider window stays
      // centered instead of enlarging the page; a narrower one scales the column down.
      if (pcLayout(dw) && w + 1 >= dw) {
        var gutter = bar();
        if (w - gutter >= dw - 1) { pin(dw); return; }
        unpin();
        h.style.removeProperty("zoom");
        h.style.removeProperty("background");
        h.removeAttribute("data-zoom");
        h.style.setProperty("--vw", dw / 100 + "px");
        h.style.setProperty("--vh", innerHeight / 100 + "px");
        h.style.setProperty("--page", dw + "px");
        h.setAttribute("data-pc", String(dw));
        short(1);
        return;
      }
      unpin();
      h.style.removeProperty("background");
      if (Math.abs(w - dw) < 2) {
        h.style.removeProperty("zoom");
        h.removeAttribute("data-zoom");
        h.style.setProperty("--vw", dw / 100 + "px");
        h.style.setProperty("--vh", innerHeight / 100 + "px");
        h.style.setProperty("--page", dw + "px");
        if (pcLayout(dw)) h.setAttribute("data-pc", String(dw)); else h.removeAttribute("data-pc");
        short(1);
        return;
      }
      // clientWidth stays the visual width minus the scrollbar. The html box is the zoomed
      // layout, so it cannot be used here: a resize would bake the previous zoom into the next one.
      var sb = bar();
      if (dw - sb < 1) { clear(); return; }
      var z = (w - sb) / (dw - sb);
      h.style.zoom = String(z);
      h.style.setProperty("--vw", dw / 100 + "px");
      h.style.setProperty("--vh", innerHeight / 100 / z + "px");
      h.style.setProperty("--page", dw + "px");
      h.setAttribute("data-zoom", String(Math.round(z * 1000) / 1000));
      if (pcLayout(dw)) h.setAttribute("data-pc", String(dw)); else h.removeAttribute("data-pc");
      short(z);
    }
    function all() { raf = 0; fit(); zoom(); }
    function onEditor(e) { editor = !!(e.detail && e.detail.visible); zoom(); }

    all();
    if (!d.body) d.addEventListener("DOMContentLoaded", all);
    new MutationObserver(sync).observe(d.head || h, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
    addEventListener("resize", function () { if (!raf) raf = requestAnimationFrame(all); });
    addEventListener("orientationchange", all);
    addEventListener("creatool:ready", onEditor);
    addEventListener("creatool:visibility", onEditor);
    cfg.zoom = function () { return parseFloat(h.style.zoom) || 1; };
    cfg.pc = PC.slice();
    cfg.forcePc = 0;
    cfg.layout = function () {
      var n = parseInt(h.getAttribute("data-pc"), 10);
      return n === 1280 || n === 1440 || n === 1920 ? n : 1440;
    };
    cfg.apply = zoom;
    window.CreatoolFit = cfg;
  } catch (e) {}
})();
