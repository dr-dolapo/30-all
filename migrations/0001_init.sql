-- 30-All database schema (Cloudflare D1 / SQLite)

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  pid           TEXT NOT NULL UNIQUE,            -- public player ID, e.g. DA348789 (never changes)
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash     TEXT NOT NULL,
  pass_salt     TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding','active','suspended','deleted')),
  is_admin      INTEGER NOT NULL DEFAULT 0,
  gender        TEXT CHECK (gender IN ('Male','Female')),
  dob           TEXT,                            -- YYYY-MM-DD
  nationality   TEXT,
  whatsapp      TEXT,                            -- visible to admins only
  height_cm     INTEGER,
  height_unit   TEXT NOT NULL DEFAULT 'metric' CHECK (height_unit IN ('metric','imperial')),
  hand          TEXT CHECK (hand IN ('Right','Left')),
  backhand      TEXT CHECK (backhand IN ('One-handed','Two-handed')),
  fav_shot      TEXT,
  avatar        INTEGER NOT NULL DEFAULT 0,
  photo_key     TEXT,                            -- R2 object key when a photo is uploaded
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_users_names ON users(first_name, last_name);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- One active code per email + purpose ('verify' or 'reset').
CREATE TABLE email_codes (
  email       TEXT NOT NULL COLLATE NOCASE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  sent_at     INTEGER NOT NULL,
  PRIMARY KEY (email, purpose)
);

CREATE TABLE courts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  country       TEXT NOT NULL DEFAULT 'Nigeria',
  state         TEXT NOT NULL,
  area          TEXT,
  address       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved','pending','rejected','merged')),
  submitted_by  TEXT REFERENCES users(id),
  merged_into   TEXT REFERENCES courts(id),
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_courts_state ON courts(state, status);

CREATE TABLE user_courts (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  court_id  TEXT NOT NULL REFERENCES courts(id),
  role      TEXT NOT NULL CHECK (role IN ('home','secondary')),
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, court_id)
);

CREATE TABLE racquet_models (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  brand  TEXT NOT NULL,
  model  TEXT NOT NULL,
  UNIQUE (brand, model)
);

CREATE TABLE user_racquets (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,                  -- 0..2
  brand       TEXT NOT NULL,
  model       TEXT NOT NULL,
  is_custom   INTEGER NOT NULL DEFAULT 0,        -- typed by the player; private to their profile
  is_primary  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, position)
);

CREATE TABLE favourites (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fav_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, fav_id)
);

CREATE TABLE matches (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('singles','doubles')),
  match_date    TEXT NOT NULL,                   -- YYYY-MM-DD
  court_id      TEXT REFERENCES courts(id),
  format        TEXT NOT NULL CHECK (format IN ('bo3','set6','set4','stb')),
  sets_json     TEXT NOT NULL,                   -- [[a,b],...] from side A's view
  winner_side   TEXT NOT NULL CHECK (winner_side IN ('A','B')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','expired')),
  submitted_by  TEXT NOT NULL REFERENCES users(id),
  submitted_at  INTEGER NOT NULL,
  resolved_at   INTEGER,
  resolved_by   TEXT REFERENCES users(id)
);
CREATE INDEX idx_matches_status_date ON matches(status, match_date);
CREATE INDEX idx_matches_pending ON matches(status, submitted_at);

-- Side A is always the submitter's side.
CREATE TABLE match_players (
  match_id  TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id),
  side      TEXT NOT NULL CHECK (side IN ('A','B')),
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX idx_match_players_user ON match_players(user_id);

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  match_id    TEXT,
  created_at  INTEGER NOT NULL,
  read_at     INTEGER
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);
