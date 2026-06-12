const { query } = require("./db");

const EMPTY_SESSION_DATA = {
  taste: {},
  keywords: [],
  unsaidWords: "",
  memorialObject: {},
  roomMemories: [],
  generatedMemoir: "",
};

function normalizeSession(row) {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    currentStep: row.current_step,
    sessionData: row.session_data || EMPTY_SESSION_DATA,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function registerMemoirSessionRoutes(app, requireAuth) {
  app.post("/api/memoir-session/start", requireAuth, async (req, res, next) => {
    try {
      const result = await query(
        `INSERT INTO memoir_sessions (user_id, current_step, session_data)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [req.user.id, req.body?.currentStep || "taste", req.body?.sessionData || EMPTY_SESSION_DATA],
      );
      res.status(201).json({ session: normalizeSession(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/memoir-session/current", requireAuth, async (req, res, next) => {
    try {
      const result = await query(
        `SELECT *
         FROM memoir_sessions
         WHERE user_id = $1 AND status = 'in_progress'
         ORDER BY updated_at DESC
         LIMIT 1`,
        [req.user.id],
      );
      res.json({ session: result.rowCount ? normalizeSession(result.rows[0]) : null });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/memoir-session/:id", requireAuth, async (req, res, next) => {
    try {
      const result = await query(
        `UPDATE memoir_sessions
         SET
           current_step = COALESCE($3, current_step),
           session_data = COALESCE($4, session_data),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2 AND status = 'in_progress'
         RETURNING *`,
        [req.params.id, req.user.id, req.body?.currentStep || null, req.body?.sessionData || null],
      );
      if (!result.rowCount) {
        res.status(404).json({ error: "session_not_found" });
        return;
      }
      res.json({ session: normalizeSession(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/memoir-session/:id/complete", requireAuth, async (req, res, next) => {
    try {
      const result = await query(
        `UPDATE memoir_sessions
         SET
           status = 'completed',
           session_data = COALESCE($3, session_data),
           updated_at = CURRENT_TIMESTAMP,
           completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [req.params.id, req.user.id, req.body?.sessionData || null],
      );
      if (!result.rowCount) {
        res.status(404).json({ error: "session_not_found" });
        return;
      }
      res.json({ session: normalizeSession(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  EMPTY_SESSION_DATA,
  registerMemoirSessionRoutes,
};
