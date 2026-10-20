-- The runner applies the packaged native schema14 upgrade in this same transaction.
-- Historical rows have no proven request version and deliberately remain NULL.
SET LOCAL lock_timeout = '5s';
ALTER TABLE im_visualize_documents ADD COLUMN request_version integer
  CHECK (request_version > 0);
