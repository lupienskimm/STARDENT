/*! Azervera CREATOOL: stable scale (stabilní měřítko). made by lupienskim
 * Inline this in <head> (or first thing in <body>) so it runs before the first paint; never load it async or deferred.
 *
 * Designs made in CREATOOL are exact at its preview widths (phone 390, tablet 768, desktop 1440 px), and everything the
 * editor writes is in pixels at those widths. This keeps every screen on one of them:
 *  1. Phones and tablets (touch screens) lay the page out at the phone or tablet width through the viewport tag and the
 *     browser scales it to the screen. Upright phones get the phone width; phones on their side and tablets up to the
 *     desktop breakpoint get the tablet width; wider screens keep device-width.
 *  2. Any other window narrower than the design width of its layout is zoomed (CSS zoom), so it is laid out at that width
 *     and scaled down or up. Media queries still see the real width and pick the layout; the viewport units of the design
 *     width go into --vw and --vh, which postcss-zoom-units.cjs (or prevest-jednotky.mjs) puts in place of vw and vh.
 * Off inside CREATOOL's preview frames and while the editor is open (it measures the page).
 *
 * Settings (all optional), before this script: window.CreatoolFit = { phone: 390, tablet: 768, desktop: 1440,
 * desktopFrom: 1025, phoneMax: 600, short: 0 }. short > 0 sets html[data-short] while the layout is at most that tall,
 * for height checks that would otherwise need a (max-height) media query.
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
      if (touch && !frame) { if (up && s < PHONE_MAX) w = PHONE; else if (cur < DESKTOP_FROM) w = TABLET; }
      want = w ? "width=" + w : "width=device-width, initial-scale=1";
      sync();
      if (w) {
        h.setAttribute("data-fit", w === PHONE ? "phone" : "tablet");
        if (cur < w) h.setAttribute("data-fit-small", ""); else h.removeAttribute("data-fit-small");
      } else { h.removeAttribute("data-fit"); h.removeAttribute("data-fit-small"); }
    }
    function design(w) { return w >= DESKTOP ? 0 : w >= DESKTOP_FROM ? DESKTOP : w >= TABLET ? TABLET : PHONE; }
    function short(z) {
      if (!SHORT) return;
      if (innerHeight / z <= SHORT) h.setAttribute("data-short", ""); else h.removeAttribute("data-short");
    }
    function clear() {
      h.style.removeProperty("zoom"); h.style.removeProperty("--vw"); h.style.removeProperty("--vh");
      h.removeAttribute("data-zoom"); short(1);
    }
    function zoom() {
      var w = innerWidth, dw = design(w);
      if (frame || editor || h.hasAttribute("data-fit") || !dw || Math.abs(w - dw) < 2) { clear(); return; }
      // The scrollbar is not zoomed, so it stays out of the factor.
      var sb = Math.max(0, w - h.getBoundingClientRect().width), z = (w - sb) / (dw - sb);
      h.style.zoom = String(z);
      h.style.setProperty("--vw", dw / 100 + "px");
      h.style.setProperty("--vh", innerHeight / 100 / z + "px");
      h.setAttribute("data-zoom", String(Math.round(z * 1000) / 1000));
      short(z);
    }
    function all() { raf = 0; fit(); zoom(); }
    function onEditor(e) { editor = !!(e.detail && e.detail.visible); zoom(); }

    all();
    new MutationObserver(sync).observe(d.head || h, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
    addEventListener("resize", function () { if (!raf) raf = requestAnimationFrame(all); });
    addEventListener("orientationchange", all);
    addEventListener("creatool:ready", onEditor);
    addEventListener("creatool:visibility", onEditor);
    cfg.zoom = function () { return parseFloat(h.style.zoom) || 1; };
    window.CreatoolFit = cfg;
  } catch (e) {}
})();
