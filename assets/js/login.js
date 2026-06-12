(function () {
  var loginButton = document.getElementById("githubLogin");
  var guestButton = document.getElementById("guestEntry");
  var nextButton = document.getElementById("nextStep");
  var status = document.getElementById("loginStatus");
  var panel = document.getElementById("loginPanel");

  function setStatus(text, className) {
    status.classList.remove("is-success", "is-warning");
    if (className) status.classList.add(className);
    status.textContent = text;
  }

  function cacheAuth(user) {
    localStorage.setItem("oldWorldAuth", JSON.stringify({
      provider: "github",
      username: user.username || "",
      email: user.email || "",
      loggedIn: true,
      loginAt: new Date().toISOString(),
    }));
  }

  function showLoggedIn(user) {
    panel.classList.add("is-authenticated");
    loginButton.disabled = false;
    loginButton.textContent = "GitHub 已登录";
    setStatus("已登录", "is-success");
    cacheAuth(user || {});
  }

  function showLoggedOut() {
    panel.classList.remove("is-authenticated");
    loginButton.disabled = false;
    loginButton.textContent = "使用 GitHub 登录";
    localStorage.removeItem("oldWorldAuth");
  }

  function showOAuthNotConfigured() {
    showLoggedOut();
    setStatus("GitHub OAuth 尚未配置", "is-warning");
    loginButton.disabled = true;
  }

  async function loadMe() {
    var params = new URLSearchParams(window.location.search);
    try {
      var response = await fetch("/api/me", { credentials: "same-origin" });
      if (!response.ok) throw new Error("api_me_failed");
      var data = await response.json();

      if (!data.oauthConfigured) {
        showOAuthNotConfigured();
        return;
      }

      if (data.authenticated) {
        showLoggedIn(data.user);
        return;
      }

      showLoggedOut();
      if (params.get("error") === "oauth_not_configured") {
        setStatus("GitHub OAuth 尚未配置", "is-warning");
      } else if (params.get("error")) {
        setStatus("登录失败，请检查 GitHub OAuth 配置后重试", "is-warning");
      } else {
        setStatus("", "");
      }
    } catch (error) {
      showOAuthNotConfigured();
    }
  }

  loginButton.addEventListener("click", function () {
    window.location.href = "/auth/github";
  });

  if (guestButton) {
    guestButton.addEventListener("click", function () {
      localStorage.setItem("oldWorldGuest", JSON.stringify({
        guest: true,
        enteredAt: new Date().toISOString(),
      }));
      localStorage.removeItem("oldWorldAuth");
      window.location.href = "./journey/food.html";
    });
  }

  loadMe();
})();
