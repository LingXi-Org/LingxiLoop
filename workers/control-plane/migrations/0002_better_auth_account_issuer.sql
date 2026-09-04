PRAGMA foreign_keys = OFF;

CREATE TABLE account_v17 (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  issuer TEXT NOT NULL,
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

INSERT INTO account_v17 (
  id, accountId, providerId, issuer, userId, accessToken, refreshToken, idToken,
  accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt
)
SELECT
  id, accountId, providerId,
  CASE WHEN providerId IN ('credential', 'siwe') THEN 'local:' || providerId ELSE 'local:oauth:' || providerId END,
  userId, accessToken, refreshToken, idToken, accessTokenExpiresAt,
  refreshTokenExpiresAt, scope, password, createdAt, updatedAt
FROM account;

DROP TABLE account;
ALTER TABLE account_v17 RENAME TO account;
CREATE INDEX account_userId_idx ON account(userId);
CREATE UNIQUE INDEX account_issuer_accountId_uidx ON account(issuer, accountId);

PRAGMA foreign_keys = ON;
