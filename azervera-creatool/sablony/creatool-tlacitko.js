// Z verze 4.0 se tohle tlačítko nepoužívá. Zapnutí je sablony/creatool-zapnuti.js:
// při načtení se editor nenačítá, tlačítko CREATOOL je úplně dole vpravo ve footeru.
// Every element with data-creatool-toggle shows or hides Azervera CREATOOL. It stays hidden until the editor has
// loaded (and inside its device preview), so the page looks untouched where the editor is not running.
// <button type="button" data-creatool-toggle data-creatool-ignore hidden>✎ Začít upravovat web</button>
// Optional labels: data-open-label="…" data-close-label="…"
(function () {
  function sync() {
    var c = window.Creatool;
    document.querySelectorAll("[data-creatool-toggle]").forEach(function (el) {
      el.hidden = !c || !!c.child;
      if (c) el.textContent = c.visible ? el.getAttribute("data-close-label") || "Skrýt editor úprav" : el.getAttribute("data-open-label") || "✎ Začít upravovat web";
    });
  }
  document.addEventListener("click", function (event) {
    var el = event.target && event.target.closest && event.target.closest("[data-creatool-toggle]");
    if (el && window.Creatool) {
      event.preventDefault();
      window.Creatool.toggle();
    }
  });
  window.addEventListener("creatool:ready", sync);
  window.addEventListener("creatool:visibility", sync);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
