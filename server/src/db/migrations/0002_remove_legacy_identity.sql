DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS user_identities;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
