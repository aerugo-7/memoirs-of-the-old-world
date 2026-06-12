(function () {
  var path = window.location.pathname.replace(/\\/g, "/");
  document.querySelectorAll(".site-links a").forEach(function (link) {
    var href = link.getAttribute("href");
    if (!href) return;
    var resolved = new URL(href, window.location.href).pathname.replace(/\\/g, "/");
    if (path.endsWith(resolved.split("/").pop())) {
      link.classList.add("is-active");
    }
  });
})();
