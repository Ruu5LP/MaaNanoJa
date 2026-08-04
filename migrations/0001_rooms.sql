CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  players_json TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  draft_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  last_write_token TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  date TEXT NOT NULL,
  game_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS games_room_date_idx ON games(room_code, date);
