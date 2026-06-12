(function () {
  var scene = document.getElementById("deskScene");
  var dust = document.getElementById("dust");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion) {
    document.body.classList.add("is-intro-playing");
    window.setTimeout(function () {
      document.body.classList.remove("is-intro-playing");
    }, 4200);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function updateMouse(event) {
    if (!scene || reduceMotion) return;
    var x = (event.clientX / window.innerWidth - 0.5) * 22;
    var y = (event.clientY / window.innerHeight - 0.5) * 16;
    scene.style.setProperty("--mouse-x", x.toFixed(2) + "px");
    scene.style.setProperty("--mouse-y", y.toFixed(2) + "px");
  }

  function resetMouse() {
    if (!scene) return;
    scene.style.setProperty("--mouse-x", "0px");
    scene.style.setProperty("--mouse-y", "0px");
  }

  function setupDust() {
    if (!dust || reduceMotion) return;
    var context = dust.getContext("2d");
    var particles = [];
    var width = 0;
    var height = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dust.width = Math.floor(width * dpr);
      dust.height = Math.floor(height * dpr);
      dust.style.width = width + "px";
      dust.style.height = height + "px";
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      var count = Math.floor(clamp(width * height / 17000, 42, 110));
      particles = Array.from({ length: count }, function () {
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.2 + 0.25,
          a: Math.random() * 0.16 + 0.035,
          vx: Math.random() * 0.07 - 0.015,
          vy: Math.random() * -0.04 - 0.008,
        };
      });
    }

    function tick() {
      context.clearRect(0, 0, width, height);
      for (var i = 0; i < particles.length; i += 1) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x > width + 12) p.x = -12;
        if (p.x < -12) p.x = width + 12;
        if (p.y < -12) p.y = height + 12;
        context.beginPath();
        context.fillStyle = "rgba(225,205,164," + p.a + ")";
        context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        context.fill();
      }
      requestAnimationFrame(tick);
    }

    resize();
    tick();
    window.addEventListener("resize", resize, { passive: true });
  }

  function setupReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll(".reveal-on-scroll"));
    if (!items.length) return;

    if (!("IntersectionObserver" in window) || reduceMotion) {
      items.forEach(function (item) {
        item.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.16,
      rootMargin: "0px 0px -8% 0px",
    });

    items.forEach(function (item) {
      observer.observe(item);
    });
  }

  setupDust();
  setupReveal();
  window.addEventListener("mousemove", updateMouse, { passive: true });
  window.addEventListener("mouseleave", resetMouse, { passive: true });
})();
