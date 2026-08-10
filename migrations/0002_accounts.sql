ALTER TABLE rooms ADD COLUMN owner_user_id TEXT;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS room_members (
  room_code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_code, user_id),
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS rooms_owner_user_idx ON rooms(owner_user_id);
CREATE INDEX IF NOT EXISTS room_members_user_idx ON room_members(user_id, created_at DESC);
