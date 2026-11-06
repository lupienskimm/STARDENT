(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    var closeTimer = 0;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    toggle.addEventListener("click", function () {
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      window.clearTimeout(closeTimer);
      if (expanded) {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
        if (reduceMotion) {
          nav.classList.remove("is-closing");
          document.body.style.overflow = "";
          return;
        }
        nav.classList.add("is-closing");
        closeTimer = window.setTimeout(function () {
          nav.classList.remove("is-closing");
          document.body.style.overflow = "";
        }, 820);
      } else {
        nav.classList.remove("is-closing");
        nav.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
      }
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

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".hero-bg").forEach(function (clip) {
    if (reduceMotion) {
      clip.removeAttribute("autoplay");
      clip.pause();
      return;
    }
    var kicking = false;
    clip.muted = true;
    clip.loop = true;
    var keepPlaying = function () {
      if (document.hidden || kicking) return;
      kicking = true;
      var pending = clip.play();
      if (pending && pending.finally) pending.finally(function () { kicking = false; });
      else kicking = false;
    };
    clip.addEventListener("pause", keepPlaying);
    keepPlaying();
  });

  var hero = document.querySelector(".home-hero");
  var heroVideo = hero && hero.querySelector(".hero-bg");
  if (hero && heroVideo && !reduceMotion) {
    var desktop = window.matchMedia("(min-width: 981px)");
    var parallaxTicking = false;
    var moveHero = function () {
      parallaxTicking = false;
      if (!desktop.matches) {
        heroVideo.style.transform = "";
        return;
      }
      var top = hero.getBoundingClientRect().top;
      if (top > window.innerHeight || top < -hero.offsetHeight) return;
      var shift = Math.max(0, -top) * 0.28;
      heroVideo.style.transform = "translate3d(0, " + shift.toFixed(1) + "px, 0)";
    };
    var requestHero = function () {
      if (parallaxTicking) return;
      parallaxTicking = true;
      window.requestAnimationFrame(moveHero);
    };
    window.addEventListener("scroll", requestHero, { passive: true });
    window.addEventListener("resize", requestHero);
    moveHero();
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
