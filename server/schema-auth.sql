CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  github_id TEXT UNIQUE NOT NULL,
  username TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memoir_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'in_progress',
  current_step TEXT,
  session_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memoir_sessions_user_status
  ON memoir_sessions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_memoir_sessions_updated_at
  ON memoir_sessions (updated_at);

CREATE OR REPLACE FUNCTION set_memoir_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memoir_sessions_updated_at ON memoir_sessions;

CREATE TRIGGER trg_memoir_sessions_updated_at
BEFORE UPDATE ON memoir_sessions
FOR EACH ROW
EXECUTE FUNCTION set_memoir_sessions_updated_at();
