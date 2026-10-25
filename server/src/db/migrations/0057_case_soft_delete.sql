-- The migration runner owns the transaction. Retain snapshots and owned assets;
-- runtime authorization excludes tombstones, without changing lifecycle history.
SET LOCAL lock_timeout = '5s';
ALTER TABLE organization_cases ADD COLUMN deleted_at timestamptz;
