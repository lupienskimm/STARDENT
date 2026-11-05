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

  var frame = document.querySelector(".slide-frame");
  if (frame) {
    var slides = Array.prototype.slice.call(frame.querySelectorAll("a"));
    var slideIndex = 0;
    function goSlide(n) {
      slideIndex = (n + slides.length) % slides.length;
      slides.forEach(function (slide, idx) {
        slide.classList.toggle("is-on", idx === slideIndex);
      });
    }
    var prev = document.querySelector(".slide-prev");
    var next = document.querySelector(".slide-next");
    if (prev) prev.addEventListener("click", function () { goSlide(slideIndex - 1); });
    if (next) next.addEventListener("click", function () { goSlide(slideIndex + 1); });
    if (slides.length > 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInterval(function () { goSlide(slideIndex + 1); }, 5000);
    }
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
    var cap = link.querySelector("figcaption");
    lbCap.textContent = cap ? cap.textContent : "";
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
