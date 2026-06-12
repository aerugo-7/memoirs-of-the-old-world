const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const express = require("express");
const session = require("express-session");
const { ensureUsersTable } = require("./db");
const { registerGitHubAuth, logGitHubOAuthStartup } = require("./auth-github");
const { ensureMemoryHallTables, registerMemoryRoomRoutes } = require("./memory-room");
const { ensureCommunityTables, registerCommunityRoutes } = require("./community");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);

function requireConfig(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is missing in .env`);
  }
}

async function main() {
  requireConfig("DATABASE_URL");
  requireConfig("SESSION_SECRET");

  await ensureUsersTable();
  await ensureMemoryHallTables();
  await ensureCommunityTables();

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "8mb" }));
  app.use(session({
    name: "old_world_sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }));

  registerGitHubAuth(app);
  registerMemoryRoomRoutes(app);
  registerCommunityRoutes(app);
  app.get("/api/ping", (req, res) => {
  res.json({ ok: true, message: "api alive" });
});

app.get("/api/memory-room-debug", (req, res) => {
  res.json({
    ok: true,
    session: req.session || null,
    user: req.session?.user || null,
  });
});

  app.use((req, res, next) => {
    if (
      req.path === "/pages/memory-hall.html" ||
      req.path === "/pages/community.html" ||
      req.path === "/assets/js/memory-hall.js" ||
      req.path === "/assets/js/community.js" ||
      req.path === "/assets/css/memory-hall.css" ||
      req.path === "/assets/css/community.css" ||
      req.path === "/config/public-env.js"
    ) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  app.get("/config/public-env.js", (req, res) => {
    const publicConfig = {};

    res.type("application/javascript");
    res.send(`window.__LAST_NOTES_CONFIG__ = ${JSON.stringify(publicConfig).replaceAll("<", "\\u003c")};`);
  });

  app.use(express.static(ROOT, {
    extensions: ["html"],
  }));

  app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT, "index.html"));
  });

  app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) {
      next(error);
      return;
    }
    if (req.path.startsWith("/auth/")) {
      res.redirect("/pages/login.html?error=oauth_failed");
      return;
    }
    res.status(error.status || 500).json({
      ok: false,
      error: error.code || "server_error",
      message: error.message || "服务器暂时没有回应。",
    });
  });

  app.listen(PORT, () => {
    console.log(`Old World Memoirs server running at http://localhost:${PORT}`);
    logGitHubOAuthStartup();
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exitCode = 1;
});
