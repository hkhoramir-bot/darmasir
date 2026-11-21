-- ============================================================
-- درمسیر — اسکیمای دیتابیس D1 (کلادفلر)
-- معادل ۱:۱ با prisma/schema.prisma — تاریخ‌ها ISO-8601 (TEXT)
-- اجرا: bunx wrangler d1 execute darmasir-db --remote --file=scripts/d1/schema.sql -y
-- ============================================================

CREATE TABLE IF NOT EXISTS "Favorite" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "stationId"  TEXT NOT NULL,
  "createdAt"  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_stationId_key" ON "Favorite" ("stationId");

CREATE TABLE IF NOT EXISTS "DailyRoute" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "kind"          TEXT NOT NULL,
  "label"         TEXT NOT NULL,
  "fromStationId" TEXT NOT NULL,
  "toStationId"   TEXT NOT NULL,
  "fromName"      TEXT NOT NULL,
  "toName"        TEXT NOT NULL,
  "createdAt"     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TripHistory" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "fromStationId" TEXT NOT NULL,
  "fromName"      TEXT NOT NULL,
  "toStationId"   TEXT NOT NULL,
  "toName"        TEXT NOT NULL,
  "minutes"       INTEGER NOT NULL,
  "transfers"     INTEGER NOT NULL,
  "fare"          INTEGER NOT NULL,
  "pref"          TEXT NOT NULL DEFAULT 'fastest',
  "createdAt"     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "User" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "name"         TEXT NOT NULL,
  "phone"        TEXT,
  "email"        TEXT,
  "passwordHash" TEXT,
  "status"       TEXT NOT NULL DEFAULT 'active',
  "createdAt"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLoginAt"  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User" ("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User" ("email");

CREATE TABLE IF NOT EXISTS "Session" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "token"      TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "device"     TEXT NOT NULL DEFAULT 'web',
  "createdAt"  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"  TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session" ("token");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session" ("userId");

CREATE TABLE IF NOT EXISTS "OtpCode" (
  "id"        TEXT PRIMARY KEY NOT NULL,
  "phone"     TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "attempts"  INTEGER NOT NULL DEFAULT 0,
  "used"      INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OtpCode_phone_idx" ON "OtpCode" ("phone");

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id"        TEXT PRIMARY KEY NOT NULL,
  "name"      TEXT NOT NULL,
  "contact"   TEXT NOT NULL,
  "category"  TEXT NOT NULL DEFAULT 'general',
  "subject"   TEXT NOT NULL,
  "message"   TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'open',
  "reply"     TEXT,
  "repliedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
