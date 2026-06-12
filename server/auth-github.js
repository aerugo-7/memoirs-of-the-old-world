const crypto = require("crypto");
const { upsertGitHubUser } = require("./db");

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const GITHUB_SCOPE = "read:user user:email";

function getEnv(name) {
  return (process.env[name] || "").trim();
}

function isGitHubOAuthConfigured() {
  return Boolean(getEnv("GITHUB_CLIENT_ID") && getEnv("GITHUB_CLIENT_SECRET"));
}

function getCallbackUrl() {
  return getEnv("GITHUB_CALLBACK_URL") || getLocalCallbackUrl();
}

function getLocalCallbackUrl() {
  return "http://localhost:3100/auth/github/callback";
}

function buildGitHubAuthorizeUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: getEnv("GITHUB_CLIENT_ID"),
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPE,
    allow_signup: "true",
  });
  if (state) params.set("state", state);
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

function logGitHubOAuthStartup() {
  const callbackUrl = getCallbackUrl();
  console.log(`[GitHub OAuth] GITHUB_CLIENT_ID loaded: ${getEnv("GITHUB_CLIENT_ID") ? "yes" : "no"}`);
  console.log(`[GitHub OAuth] GITHUB_CALLBACK_URL: ${callbackUrl}`);
  if (getEnv("GITHUB_CLIENT_ID")) {
    console.log(`[GitHub OAuth] /auth/github redirect URL template: ${buildGitHubAuthorizeUrl(callbackUrl)}`);
  } else {
    console.log("[GitHub OAuth] /auth/github redirect URL template: unavailable, missing GITHUB_CLIENT_ID");
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${text}`);
  }
  return data;
}

async function exchangeCodeForAccessToken(code, redirectUri) {
  const data = await fetchJson(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: getEnv("GITHUB_CLIENT_ID"),
      client_secret: getEnv("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub did not return access_token.");
  }
  return data.access_token;
}

async function getGitHubProfile(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "old-world-memoirs",
  };

  const user = await fetchJson(GITHUB_USER_URL, { headers });
  const emails = await fetchJson(GITHUB_EMAILS_URL, { headers });
  const primaryEmail = Array.isArray(emails)
    ? emails.find((item) => item.primary && item.verified) || emails.find((item) => item.verified) || emails[0]
    : null;

  return {
    github_id: String(user.id),
    username: user.login,
    email: primaryEmail?.email || user.email || null,
    avatar_url: user.avatar_url || null,
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    provider: "github",
    username: user.username,
    email: user.email,
    avatarUrl: user.avatar_url,
    lastLoginAt: user.last_login_at,
  };
}

function requireLogin(req, res, next) {
  if (!req.session?.user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  next();
}

function registerGitHubAuth(app) {
  app.get("/auth/github", (req, res) => {
    if (!getEnv("GITHUB_CLIENT_ID")) {
      res.status(500).send("Missing GITHUB_CLIENT_ID");
      return;
    }

    if (!getEnv("GITHUB_CLIENT_SECRET")) {
      res.redirect("/pages/login.html?error=oauth_not_configured");
      return;
    }

    const state = crypto.randomBytes(16).toString("hex");
    req.session.githubOAuthState = state;

    const redirectUri = getCallbackUrl();
    const authorizeUrl = buildGitHubAuthorizeUrl(redirectUri, state);

    console.log(`[GitHub OAuth] /auth/github redirect URL: ${authorizeUrl}`);
    res.redirect(authorizeUrl);
  });

  app.get("/auth/github/callback", async (req, res, next) => {
    try {
      if (!isGitHubOAuthConfigured()) {
        res.redirect("/pages/login.html?error=oauth_not_configured");
        return;
      }

      if (!req.query.code) {
        res.redirect("/pages/login.html?error=missing_code");
        return;
      }

      if (!req.query.state || req.query.state !== req.session.githubOAuthState) {
        res.redirect("/pages/login.html?error=invalid_state");
        return;
      }

      delete req.session.githubOAuthState;

      const accessToken = await exchangeCodeForAccessToken(req.query.code, getCallbackUrl());
      const profile = await getGitHubProfile(accessToken);
      const user = await upsertGitHubUser(profile);

      req.session.user = publicUser(user);
      res.redirect("/pages/login.html?login=success");
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/me", (req, res) => {
    res.json({
      authenticated: Boolean(req.session?.user),
      oauthConfigured: isGitHubOAuthConfigured(),
      user: req.session?.user || null,
    });
  });

  app.post("/api/logout", (req, res, next) => {
    req.session.destroy((error) => {
      if (error) {
        next(error);
        return;
      }
      res.clearCookie("old_world_sid");
      res.json({ ok: true });
    });
  });
}

module.exports = {
  registerGitHubAuth,
  requireLogin,
  isGitHubOAuthConfigured,
  buildGitHubAuthorizeUrl,
  getLocalCallbackUrl,
  logGitHubOAuthStartup,
};
