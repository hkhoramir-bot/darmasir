-- ============================================================
-- درمسیر API — اسکیمای D1 (معادل ۱:۱ با prisma/schema.prisma پنل)
-- اعمال:  wrangler d1 execute darmasir-db --remote --file schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'VIEWER',
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  admin_id   TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  ip         TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_admin ON sessions(admin_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT,
  admin_name TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);

CREATE TABLE IF NOT EXISTS lines (
  id              TEXT PRIMARY KEY,
  city_id         TEXT NOT NULL,
  number          INTEGER NOT NULL,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL,
  text_on_color   TEXT NOT NULL DEFAULT '#ffffff',
  terminals       TEXT NOT NULL,
  direction       TEXT NOT NULL,
  headway         INTEGER NOT NULL DEFAULT 10,
  headway_peak    INTEGER,
  headway_off     INTEGER,
  first_train     TEXT NOT NULL DEFAULT '04:30',
  last_train      TEXT NOT NULL DEFAULT '22:30',
  segment_minutes REAL NOT NULL DEFAULT 2.5,
  badges          TEXT,
  status          TEXT NOT NULL DEFAULT 'normal',
  status_note     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lines_city ON lines(city_id);

CREATE TABLE IF NOT EXISTS stations (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  city_id   TEXT NOT NULL,
  lines     TEXT NOT NULL,
  amenities TEXT NOT NULL DEFAULT '[]',
  featured  INTEGER NOT NULL DEFAULT 0,
  lat       REAL,
  lng       REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stations_city ON stations(city_id);
CREATE INDEX IF NOT EXISTS idx_stations_name ON stations(name);

CREATE TABLE IF NOT EXISTS app_users (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL UNIQUE,
  name        TEXT,
  platform    TEXT,
  app_version TEXT,
  city        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  banned      INTEGER NOT NULL DEFAULT 0,
  ban_reason  TEXT,
  last_seen_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ads (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT,
  image_url  TEXT,
  link_url   TEXT,
  placement  TEXT NOT NULL DEFAULT 'HOME_BANNER',
  active     INTEGER NOT NULL DEFAULT 0,
  starts_at  TEXT,
  ends_at    TEXT,
  views      INTEGER NOT NULL DEFAULT 0,
  clicks     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ads_active ON ads(active);

CREATE TABLE IF NOT EXISTS tickets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  device_id  TEXT,
  subject    TEXT NOT NULL,
  category   TEXT,
  status     TEXT NOT NULL DEFAULT 'OPEN',
  priority   TEXT NOT NULL DEFAULT 'NORMAL',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  author_name TEXT,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tmsg_ticket ON ticket_messages(ticket_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_versions (
  id           TEXT PRIMARY KEY,
  version_name TEXT NOT NULL,
  version_code INTEGER NOT NULL UNIQUE,
  apk_url      TEXT,
  notes        TEXT,
  mandatory    INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_buckets (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
