const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is missing. Add it to .env before using the auth/session API.");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

async function ensureUsersTable() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      github_id TEXT UNIQUE NOT NULL,
      username TEXT,
      email TEXT,
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id UUID DEFAULT gen_random_uuid()`);
  await query(`UPDATE users SET public_id = gen_random_uuid() WHERE public_id IS NULL`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique ON users(public_id)`);
}

async function upsertGitHubUser(profile) {
  const result = await query(
    `INSERT INTO users (github_id, username, email, avatar_url, last_login_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (github_id)
     DO UPDATE SET
       username = EXCLUDED.username,
       email = EXCLUDED.email,
       avatar_url = EXCLUDED.avatar_url,
       last_login_at = CURRENT_TIMESTAMP
     RETURNING id, public_id, github_id, username, email, avatar_url, created_at, last_login_at`,
    [profile.github_id, profile.username, profile.email, profile.avatar_url],
  );
  return result.rows[0];
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  query,
  ensureUsersTable,
  upsertGitHubUser,
  closePool,
};
