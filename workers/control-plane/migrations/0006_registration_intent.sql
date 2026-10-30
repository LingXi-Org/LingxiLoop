-- Written atomically with the real Better Auth identity; never accepted from clients.
ALTER TABLE user ADD COLUMN registrationIntent TEXT;
