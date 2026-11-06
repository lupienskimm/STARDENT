/* CREATOOL se spouští jen na testovací adrese. Ostrý web skript editoru nenačítá. */
(function () {
  var host = location.hostname;
  var testing = host === "stardent-roan.vercel.app" || host === "localhost" || host === "127.0.0.1";
  if (!testing) return;

  var robots = document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex, nofollow";
  document.head.appendChild(robots);

  window.CreatoolConfig = {
    storageKey: "creatool:stardent",
    siteName: "Star-Dent clinic",
    mainSelector: "main",
    breakpoints: { tablet: 640, desktop: 981 },
    previewWidths: { desktop: 1440, tablet: 768, mobile: 390 },
    startHidden: true,
    forceHidden: true,
    hiddenPill: false,
    registryUrl: "creatool.registry.json",
    libraryUrl: "creatool/prvky/prvky.json",
    addedLayerZ: 30,
    artColors: [
      { name: "Tmavá", value: "#062B38" },
      { name: "Limetková", value: "#B5CA2C" },
      { name: "Tyrkysová", value: "#22A7C4" },
      { name: "Petrolej", value: "#0B6683" },
      { name: "Bílá", value: "#ffffff" }
    ],
    pages: [
      { path: "index.html", label: "Domů" },
      { path: "o-nas.html", label: "Klinika/tým" },
      { path: "sluzby.html", label: "Služby" },
      { path: "pravidelne-prohlidky.html", label: "Pravidelné prohlídky" },
      { path: "dentalni-hygiena.html", label: "Dentální hygiena" },
      { path: "zubni-implantaty.html", label: "Zubní implantáty" },
      { path: "zubni-protetika.html", label: "Zubní protetika" },
      { path: "odborna-konzultace.html", label: "Odborná konzultace" },
      { path: "kontakt.html", label: "Kontakt" },
      { path: "ochrana-osobnich-udaju.html", label: "Ochrana osobních údajů" },
      { path: "cookies.html", label: "Cookies" }
    ],
    pageKey: function (loc) { return loc.pathname.split("/").pop() || "index.html"; }
  };

  var footer = document.querySelector(".site-footer");
  if (!footer) return;
  var button = document.createElement("button");
  button.type = "button";
  button.className = "creatool-switch";
  button.setAttribute("data-creatool-ignore", "");
  button.setAttribute("data-creatool-src", "creatool.js");
  button.setAttribute("aria-pressed", "false");
  button.title = "Zapnout CREATOOL";
  button.textContent = "CREATOOL";
  footer.appendChild(button);

  var script = document.createElement("script");
  script.src = "js/creatool-zapnuti.js";
  document.body.appendChild(script);
})();
