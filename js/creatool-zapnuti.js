/* Azervera CREATOOL 4.7 — zapnutí. made by lupienskim.
 *
 * Pravidlo: při načtení stránky se creatool.js nenačítá a editor se nezobrazuje.
 * Zapínání je tlačítko CREATOOL úplně dole ve footeru, u pravého kraje obrazovky.
 * Otázka na export písem a barev se ukáže až po zapnutí editoru. Skrytí editoru
 * ji zase schová, dokud na ni není odpověď.
 *
 * HTML, poslední prvek footeru. Footer je na celou šířku okna; obsah patičky
 * může zůstat ve sloupci, tlačítko je až za ním:
 * <button type="button" class="creatool-switch" data-creatool-ignore aria-pressed="false" title="Zapnout CREATOOL">CREATOOL</button>
 *
 * Cesta ke skriptu, když není vedle stránky: data-creatool-src="/creatool.js"
 *
 * CSS:
 * .footer{padding-bottom:0}
 * .creatool-switch{display:block;width:max-content;margin:0 0 0 auto;border:0;background:transparent;color:#777469;font-size:.69rem;letter-spacing:.14em;line-height:1;padding:10px 0 8px 16px}
 * .creatool-switch:hover{color:inherit}
 *
 * CreatoolConfig může na stránce být pořád. Skript creatool.js v HTML není.
 * startHidden: true, forceHidden: true, hiddenPill: false
 */
(function () {
  var button = document.querySelector(".creatool-switch");
  if (!button) return;
  var loading = false;
  function on() { return !!(window.Creatool && window.Creatool.visible); }
  function paint() {
    var visible = on();
    button.setAttribute("aria-pressed", String(visible));
    button.title = visible ? "Skrýt CREATOOL" : "Zapnout CREATOOL";
  }
  function load() {
    if (window.Creatool) { window.Creatool.show(); paint(); return; }
    if (loading) return;
    loading = true;
    var script = document.createElement("script");
    script.src = button.getAttribute("data-creatool-src") || "./creatool.js";
    script.onload = function () { loading = false; if (window.Creatool) window.Creatool.show(); paint(); };
    script.onerror = function () { loading = false; };
    document.body.append(script);
  }
  button.addEventListener("click", function () {
    if (on()) { window.Creatool.hide(); paint(); }
    else load();
  });
  window.addEventListener("creatool:visibility", paint);
  window.addEventListener("creatool:ready", paint);
})();
