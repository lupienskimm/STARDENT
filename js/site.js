(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  var form = document.querySelector(".form");
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var body = [
        "Jméno: " + (data.get("jmeno") || ""),
        "E-mail: " + (data.get("email") || ""),
        "Telefon: " + (data.get("telefon") || ""),
        "",
        data.get("zprava") || ""
      ].join("\n");
      window.location.href = "mailto:recepce@stardent.cz?subject=" +
        encodeURIComponent("Zpráva z webu Star-Dent") +
        "&body=" + encodeURIComponent(body);
    });
  }

  var version = "1";
  try { version = localStorage.getItem("stardent-v") || "1"; } catch (e) {}
  if (!/^[1-5]$/.test(version)) version = "1";
  document.documentElement.setAttribute("data-v", version);
  function markVersion(current) {
    var buttons = document.querySelectorAll("[data-version]");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-version") === current ? "true" : "false");
    });
  }
  markVersion(version);
  Array.prototype.forEach.call(document.querySelectorAll("[data-version]"), function (btn) {
    btn.addEventListener("click", function () {
      version = btn.getAttribute("data-version");
      document.documentElement.setAttribute("data-v", version);
      try { localStorage.setItem("stardent-v", version); } catch (e) {}
      markVersion(version);
    });
  });

  var week = document.querySelectorAll(".week li");
  var today = new Date().getDay();
  if (today >= 1 && today <= 5 && week[today - 1]) week[today - 1].classList.add("is-today");

  var hero = document.querySelector(".home-hero");
  if (hero && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var header = document.querySelector(".site-header");
    var ticking = false;
    function updateLogo() {
      ticking = false;
      var headerH = header ? header.offsetHeight : 0;
      var rect = hero.getBoundingClientRect();
      var travel = hero.offsetHeight;
      var p = travel ? (headerH - rect.top) / travel : 0;
      if (p < 0) p = 0;
      if (p > 1) p = 1;
      hero.style.setProperty("--logo-p", p.toFixed(4));
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateLogo);
    }
    updateLogo();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
  }

  var links = Array.prototype.slice.call(document.querySelectorAll("[data-gallery]"));
  if (!links.length) return;
  var lb = document.querySelector(".lb");
  var lbImg = lb.querySelector("img");
  var lbCap = lb.querySelector("p");
  var index = 0;

  function show(i) {
    index = (i + links.length) % links.length;
    var link = links[index];
    lbImg.src = link.getAttribute("href");
    lbImg.alt = link.querySelector("img").alt;
    lbCap.textContent = link.querySelector("figcaption").textContent;
    lb.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function close() {
    lb.classList.remove("is-open");
    lbImg.removeAttribute("src");
    document.body.style.overflow = "";
  }

  links.forEach(function (link, i) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      show(i);
    });
  });
  lb.querySelector(".lb-close").addEventListener("click", close);
  lb.querySelector(".lb-prev").addEventListener("click", function () { show(index - 1); });
  lb.querySelector(".lb-next").addEventListener("click", function () { show(index + 1); });
  lb.addEventListener("click", function (event) {
    if (event.target === lb) close();
  });
  document.addEventListener("keydown", function (event) {
    if (!lb.classList.contains("is-open")) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowRight") show(index + 1);
    if (event.key === "ArrowLeft") show(index - 1);
  });
})();
