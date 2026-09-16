-- Existing identities keep their current avatar until explicitly changed.
ALTER TABLE users ADD COLUMN avatar_seed TEXT CHECK (length(avatar_seed) BETWEEN 1 AND 128);
ALTER TABLE projects
  ADD COLUMN avatar_seed TEXT CHECK (length(avatar_seed) BETWEEN 1 AND 128),
  ADD COLUMN avatar_url TEXT;
