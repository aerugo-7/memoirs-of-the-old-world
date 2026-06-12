const { query } = require("./db");

const N8N_PROXY_TIMEOUT_MS = 60000;

function requireMemoryAuth(req, res, next) {
  if (!req.session?.user?.id) {
    res.status(401).json({ error: "not_authenticated", message: "请先登录后再归档你的记忆房间。" });
    return;
  }
  next();
}

function getWebhookUrl(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

async function fetchWebhookJson(webhookUrl, options, label) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), N8N_PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      ...options,
      signal: controller.signal,
    });

    const rawText = await response.text();

    if (!response.ok) {
      const detail = rawText ? ` ${rawText.slice(0, 500)}` : "";
      const error = new Error(`${label} webhook returned ${response.status}.${detail}`);
      error.status = response.status;
      throw error;
    }

    if (!rawText) {
      const error = new Error(`${label} webhook returned an empty body.`);
      error.status = 502;
      throw error;
    }

    try {
      return JSON.parse(rawText);
    } catch (parseError) {
      const error = new Error(`${label} webhook did not return valid JSON: ${rawText.slice(0, 500)}`);
      error.status = 502;
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

async function ensureMemoryHallTables() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id UUID DEFAULT gen_random_uuid()`);
  await query(`UPDATE users SET public_id = gen_random_uuid() WHERE public_id IS NULL`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique ON users(public_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS memory_rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(public_id) ON DELETE CASCADE,
      title TEXT DEFAULT 'Memory Hall',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS memory_fragments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID REFERENCES memory_rooms(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(public_id) ON DELETE CASCADE,
      node_id TEXT,
      node_name TEXT,
      question TEXT,
      answer TEXT,
      style_variant INT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS memory_archives (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID REFERENCES memory_rooms(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(public_id) ON DELETE CASCADE,
      profile TEXT,
      diary TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS memory_rooms_user_id_idx ON memory_rooms(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS memory_fragments_room_id_idx ON memory_fragments(room_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS memory_archives_room_id_idx ON memory_archives(room_id, created_at)`);
}

async function getUserPublicId(sessionUserId) {
  const result = await query(
    `SELECT public_id FROM users WHERE id = $1 LIMIT 1`,
    [sessionUserId],
  );
  return result.rows[0]?.public_id || null;
}

async function getOrCreateMemoryRoom(userId) {
  const existing = await query(
    `SELECT * FROM memory_rooms WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId],
  );
  if (existing.rowCount) return existing.rows[0];

  const created = await query(
    `INSERT INTO memory_rooms (user_id, title)
     VALUES ($1, 'Memory Hall')
     RETURNING *`,
    [userId],
  );
  return created.rows[0];
}

function normalizeRoom(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeFragment(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    nodeId: row.node_id,
    nodeName: row.node_name,
    question: row.question,
    answer: row.answer,
    styleVariant: row.style_variant,
    createdAt: row.created_at,
  };
}

function normalizeArchive(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    profile: row.profile,
    diary: row.diary,
    createdAt: row.created_at,
  };
}

async function getRequestContext(req, res) {
  const userId = await getUserPublicId(req.session.user.id);
  if (!userId) {
    res.status(401).json({ error: "user_not_found", message: "请先登录后再归档你的记忆房间。" });
    return null;
  }
  const room = await getOrCreateMemoryRoom(userId);
  return { userId, room };
}

function registerMemoryRoomRoutes(app) {
  const handleGetMemoryRoom = async (req, res, next) => {
    try {
      const context = await getRequestContext(req, res);
      if (!context) return;

      const fragments = await query(
        `SELECT * FROM memory_fragments
         WHERE room_id = $1 AND user_id = $2
         ORDER BY created_at ASC`,
        [context.room.id, context.userId],
      );

      res.json({
        userId: context.userId,
        room: normalizeRoom(context.room),
        fragments: fragments.rows.map(normalizeFragment),
      });
    } catch (error) {
      next(error);
    }
  };

  const handleGetFragments = async (req, res, next) => {
    try {
      const context = await getRequestContext(req, res);
      if (!context) return;

      const fragments = await query(
        `SELECT * FROM memory_fragments
         WHERE room_id = $1 AND user_id = $2
         ORDER BY created_at ASC`,
        [context.room.id, context.userId],
      );

      res.json({
        userId: context.userId,
        room: normalizeRoom(context.room),
        fragments: fragments.rows.map(normalizeFragment),
      });
    } catch (error) {
      next(error);
    }
  };

  const handleCreateFragment = async (req, res, next) => {
    try {
      const context = await getRequestContext(req, res);
      if (!context) return;

      const body = req.body || {};
      if (!body.answer || !String(body.answer).trim()) {
        res.status(400).json({ error: "empty_answer" });
        return;
      }

      const result = await query(
        `INSERT INTO memory_fragments
          (room_id, user_id, node_id, node_name, question, answer, style_variant)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          context.room.id,
          context.userId,
          body.nodeId || null,
          body.nodeName || null,
          body.question || null,
          String(body.answer).trim(),
          Number.isFinite(Number(body.styleVariant)) ? Number(body.styleVariant) : null,
        ],
      );

      await query(`UPDATE memory_rooms SET updated_at = now() WHERE id = $1`, [context.room.id]);

      res.status(201).json({
        userId: context.userId,
        room: normalizeRoom(context.room),
        fragment: normalizeFragment(result.rows[0]),
      });
    } catch (error) {
      next(error);
    }
  };

  const handleDeleteFragment = async (req, res, next) => {
    try {
      const context = await getRequestContext(req, res);
      if (!context) return;

      const result = await query(
        `DELETE FROM memory_fragments
         WHERE id = $1 AND room_id = $2 AND user_id = $3
         RETURNING id`,
        [req.params.id, context.room.id, context.userId],
      );

      if (!result.rowCount) {
        res.status(404).json({ error: "fragment_not_found" });
        return;
      }

      await query(`UPDATE memory_rooms SET updated_at = now() WHERE id = $1`, [context.room.id]);
      res.json({ ok: true, id: req.params.id });
    } catch (error) {
      next(error);
    }
  };

  const handleCreateArchive = async (req, res, next) => {
    try {
      const context = await getRequestContext(req, res);
      if (!context) return;

      const body = req.body || {};
      const result = await query(
        `INSERT INTO memory_archives (room_id, user_id, profile, diary)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [context.room.id, context.userId, body.profile || "", body.diary || ""],
      );

      res.status(201).json({ archive: normalizeArchive(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  };

  const handleProxyNews = async (req, res, next) => {
    try {
      const webhookUrl = getWebhookUrl(["N8N_NEWS_WEBHOOK_URL", "LAST_NOTES_NEWS_WEBHOOK_URL"]);
      if (!webhookUrl) {
        res.status(500).json({
          error: "missing_news_webhook",
          message: "Missing N8N_NEWS_WEBHOOK_URL in server environment.",
        });
        return;
      }

      const url = new URL(webhookUrl);
      if (req.query.category) {
        url.searchParams.set("category", String(req.query.category));
      }

      const data = await fetchWebhookJson(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }, "news");

      res.json(data);
    } catch (error) {
      next(error);
    }
  };

  const handleProxyArchive = async (req, res, next) => {
    try {
      const webhookUrl = getWebhookUrl([
        "N8N_GENERATE_DIARY_WEBHOOK_URL",
        "VITE_N8N_GENERATE_DIARY_WEBHOOK_URL",
      ]);

      if (!webhookUrl) {
        res.status(500).json({
          error: "missing_archive_webhook",
          message: "Missing N8N_GENERATE_DIARY_WEBHOOK_URL in server environment.",
        });
        return;
      }

      const data = await fetchWebhookJson(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req.body || {}),
      }, "archive");

      res.json(data);
    } catch (error) {
      next(error);
    }
  };

  app.get("/api/memory-room", requireMemoryAuth, handleGetMemoryRoom);
  app.post("/api/memory-fragments", requireMemoryAuth, handleCreateFragment);
  app.delete("/api/memory-fragments/:id", requireMemoryAuth, handleDeleteFragment);
  app.post("/api/memory-archive", requireMemoryAuth, handleCreateArchive);

  app.get("/api/memory-room/current", requireMemoryAuth, handleGetMemoryRoom);
  app.get("/api/memory-room/fragments", requireMemoryAuth, handleGetFragments);
  app.post("/api/memory-room/fragments", requireMemoryAuth, handleCreateFragment);
  app.delete("/api/memory-room/fragments/:id", requireMemoryAuth, handleDeleteFragment);
  app.post("/api/memory-room/archives", requireMemoryAuth, handleCreateArchive);

  app.get("/api/memory-hall/news", requireMemoryAuth, handleProxyNews);
  app.post("/api/memory-hall/archive", requireMemoryAuth, handleProxyArchive);
}

module.exports = {
  ensureMemoryHallTables,
  registerMemoryRoomRoutes,
};
