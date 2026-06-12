CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id UUID DEFAULT gen_random_uuid();
UPDATE users SET public_id = gen_random_uuid() WHERE public_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique ON users(public_id);

CREATE TABLE IF NOT EXISTS memory_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(public_id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Memory Hall',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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
);

CREATE TABLE IF NOT EXISTS memory_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES memory_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(public_id) ON DELETE CASCADE,
  profile TEXT,
  diary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_rooms_user_id_idx ON memory_rooms(user_id);
CREATE INDEX IF NOT EXISTS memory_fragments_room_id_idx ON memory_fragments(room_id, created_at);
CREATE INDEX IF NOT EXISTS memory_archives_room_id_idx ON memory_archives(room_id, created_at);
