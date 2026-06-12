const { query } = require("./db");

function getSessionUser(req) {
  return req.session?.user || null;
}

function publicCommunityUser(user) {
  if (!user) return null;
  return {
    id: String(user.id),
    name: user.username || "匿名访客",
    avatar: user.avatarUrl || "",
    role: "旧世界访客",
  };
}

function requireCommunityAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user?.id) {
    res.status(401).json({ ok: false, error: "not_authenticated", message: "请先登录后进入旧世界社区。" });
    return;
  }
  next();
}

function normalizeNote(row) {
  return {
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name || "匿名访客",
    authorAvatar: row.author_avatar || "",
    content: row.content,
    createdAt: row.created_at,
  };
}

function normalizePost(row) {
  return {
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name || "匿名访客",
    authorAvatar: row.author_avatar || "",
    title: row.title,
    content: row.content,
    imageUrl: row.image_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commentCount: Number(row.comment_count || 0),
    visitCount: Number(row.visit_count || 0),
    visitedByMe: Boolean(row.visited_by_me),
  };
}

function normalizeComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorName: row.author_name || "匿名访客",
    authorAvatar: row.author_avatar || "",
    content: row.content,
    createdAt: row.created_at,
    postTitle: row.post_title,
  };
}

async function ensureCommunityTables() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await query(`
    CREATE TABLE IF NOT EXISTS community_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      author_name TEXT,
      author_avatar TEXT,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      author_name TEXT,
      author_avatar TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS community_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      author_name TEXT,
      author_avatar TEXT,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS community_visits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(post_id, user_id)
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS community_notes_created_at_idx ON community_notes(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS community_posts_created_at_idx ON community_posts(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS community_comments_post_id_idx ON community_comments(post_id, created_at ASC)`);
  await query(`CREATE INDEX IF NOT EXISTS community_comments_user_id_idx ON community_comments(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS community_visits_post_id_idx ON community_visits(post_id)`);
}

function getAuthor(req) {
  const user = publicCommunityUser(getSessionUser(req));
  return {
    userId: user.id,
    authorName: user.name,
    authorAvatar: user.avatar,
  };
}

function assertText(value, label, maxLength) {
  const text = String(value || "").trim();
  if (!text) {
    const error = new Error(`${label}不能为空。`);
    error.status = 400;
    throw error;
  }
  if (maxLength && text.length > maxLength) {
    const error = new Error(`${label}不能超过 ${maxLength} 字。`);
    error.status = 400;
    throw error;
  }
  return text;
}

function registerCommunityRoutes(app) {
  app.get("/api/community/me", (req, res) => {
    const user = publicCommunityUser(getSessionUser(req));
    if (!user) {
      res.status(401).json({ ok: false, error: "not_authenticated", message: "请先登录后进入旧世界社区。" });
      return;
    }
    res.json({ ok: true, user });
  });

  app.get("/api/community/notes", async (req, res, next) => {
    try {
      const result = await query(`
        SELECT *
        FROM community_notes
        ORDER BY created_at DESC
        LIMIT 120
      `);
      res.json({ ok: true, notes: result.rows.map(normalizeNote) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/community/notes", requireCommunityAuth, async (req, res, next) => {
    try {
      const content = assertText(req.body?.content, "纸条内容", 50);
      const author = getAuthor(req);
      const result = await query(
        `INSERT INTO community_notes (user_id, author_name, author_avatar, content)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [author.userId, author.authorName, author.authorAvatar, content],
      );
      res.status(201).json({ ok: true, note: normalizeNote(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/community/posts", async (req, res, next) => {
    try {
      const viewerId = getSessionUser(req)?.id ? String(getSessionUser(req).id) : "";
      const result = await query(
        `
        SELECT
          p.*,
          COUNT(DISTINCT c.id) AS comment_count,
          COUNT(DISTINCT v.id) AS visit_count,
          BOOL_OR(v.user_id = $1) AS visited_by_me
        FROM community_posts p
        LEFT JOIN community_comments c ON c.post_id = p.id
        LEFT JOIN community_visits v ON v.post_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 80
        `,
        [viewerId],
      );
      res.json({ ok: true, posts: result.rows.map(normalizePost) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/community/posts", requireCommunityAuth, async (req, res, next) => {
    try {
      const title = assertText(req.body?.title, "标题", 40);
      const content = assertText(req.body?.content, "正文", 3000);
      const imageUrl = String(req.body?.imageUrl || "").trim();
      const author = getAuthor(req);
      const result = await query(
        `INSERT INTO community_posts (user_id, author_name, author_avatar, title, content, image_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *,
          0::int AS comment_count,
          0::int AS visit_count,
          false AS visited_by_me`,
        [author.userId, author.authorName, author.authorAvatar, title, content, imageUrl || null],
      );
      res.status(201).json({ ok: true, post: normalizePost(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/community/posts/:id", async (req, res, next) => {
    try {
      const viewerId = getSessionUser(req)?.id ? String(getSessionUser(req).id) : "";
      const postResult = await query(
        `
        SELECT
          p.*,
          COUNT(DISTINCT c.id) AS comment_count,
          COUNT(DISTINCT v.id) AS visit_count,
          BOOL_OR(v.user_id = $2) AS visited_by_me
        FROM community_posts p
        LEFT JOIN community_comments c ON c.post_id = p.id
        LEFT JOIN community_visits v ON v.post_id = p.id
        WHERE p.id = $1
        GROUP BY p.id
        LIMIT 1
        `,
        [req.params.id, viewerId],
      );

      if (!postResult.rowCount) {
        res.status(404).json({ ok: false, error: "post_not_found", message: "没有找到这份旧世界日志。" });
        return;
      }

      const comments = await query(
        `SELECT *
         FROM community_comments
         WHERE post_id = $1
         ORDER BY created_at ASC`,
        [req.params.id],
      );

      res.json({
        ok: true,
        post: normalizePost(postResult.rows[0]),
        comments: comments.rows.map(normalizeComment),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/community/posts/:id/comments", requireCommunityAuth, async (req, res, next) => {
    try {
      const content = assertText(req.body?.content, "回声", 600);
      const author = getAuthor(req);
      const result = await query(
        `INSERT INTO community_comments (post_id, user_id, author_name, author_avatar, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.params.id, author.userId, author.authorName, author.authorAvatar, content],
      );
      res.status(201).json({ ok: true, comment: normalizeComment(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/community/posts/:id/visit", requireCommunityAuth, async (req, res, next) => {
    try {
      const userId = String(getSessionUser(req).id);
      await query(
        `INSERT INTO community_visits (post_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (post_id, user_id) DO NOTHING`,
        [req.params.id, userId],
      );
      const count = await query(
        `SELECT COUNT(*)::int AS visit_count FROM community_visits WHERE post_id = $1`,
        [req.params.id],
      );
      res.json({ ok: true, visitCount: Number(count.rows[0]?.visit_count || 0), visitedByMe: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/community/mine", requireCommunityAuth, async (req, res, next) => {
    try {
      const userId = String(getSessionUser(req).id);
      const [notes, posts, comments] = await Promise.all([
        query(`SELECT * FROM community_notes WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
        query(`
          SELECT
            p.*,
            COUNT(DISTINCT c.id) AS comment_count,
            COUNT(DISTINCT v.id) AS visit_count,
            BOOL_OR(v.user_id = $1) AS visited_by_me
          FROM community_posts p
          LEFT JOIN community_comments c ON c.post_id = p.id
          LEFT JOIN community_visits v ON v.post_id = p.id
          WHERE p.user_id = $1
          GROUP BY p.id
          ORDER BY p.created_at DESC
        `, [userId]),
        query(`
          SELECT c.*, p.title AS post_title
          FROM community_comments c
          LEFT JOIN community_posts p ON p.id = c.post_id
          WHERE c.user_id = $1
          ORDER BY c.created_at DESC
        `, [userId]),
      ]);
      res.json({
        ok: true,
        notes: notes.rows.map(normalizeNote),
        posts: posts.rows.map(normalizePost),
        comments: comments.rows.map(normalizeComment),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/community/agent", requireCommunityAuth, async (req, res) => {
    const replies = [
      "这段话已经被放进旧世界的公共档案。",
      "有些回忆不是答案，只是一盏灯。",
      "我会替你保管这句话，直到有人在墙上再次读到它。",
    ];
    const seed = String(req.body?.message || "").length;
    res.json({ ok: true, reply: replies[seed % replies.length] });
  });
}

module.exports = {
  ensureCommunityTables,
  registerCommunityRoutes,
};
