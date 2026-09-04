PRAGMA foreign_keys = ON;

CREATE TABLE user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0,
  banReason TEXT,
  banExpires INTEGER
);
CREATE INDEX user_role_idx ON user(role);

CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  impersonatedBy TEXT
);
CREATE INDEX session_userId_idx ON session(userId);

CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX account_userId_idx ON account(userId);
CREATE UNIQUE INDEX account_provider_idx ON account(providerId, accountId);

CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE INDEX verification_identifier_idx ON verification(identifier);

CREATE TABLE rateLimit (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);

CREATE TABLE app_user_links (
  auth_user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  app_user_id TEXT NOT NULL UNIQUE,
  provisioned_at INTEGER NOT NULL,
  suspended_at INTEGER
);

CREATE TABLE registration_claims (
  auth_user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  invite_token TEXT NOT NULL,
  invite_kind TEXT NOT NULL CHECK(invite_kind IN ('company', 'project')),
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'provisioning', 'provisioned', 'failed')),
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE release_requests (
  commit_sha TEXT PRIMARY KEY NOT NULL,
  image_digests TEXT NOT NULL,
  status TEXT NOT NULL,
  openship_deployment_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE control_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  reason TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX control_audit_created_idx ON control_audit(created_at DESC);

CREATE TABLE bootstrap_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  completed_at INTEGER,
  admin_user_id TEXT REFERENCES user(id)
);
INSERT INTO bootstrap_state(id) VALUES (1);
