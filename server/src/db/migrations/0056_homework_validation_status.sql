-- The runner owns the transaction. Existing values remain valid; publication
-- still requires READY for the current draft revision.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE homeworks DROP CONSTRAINT homeworks_validation_status_check;
ALTER TABLE homeworks ADD CONSTRAINT homeworks_validation_status_check
  CHECK (validation_status IN ('PENDING','READY','INVALID','MATERIAL_ERROR','ERROR')) NOT VALID;
ALTER TABLE homeworks VALIDATE CONSTRAINT homeworks_validation_status_check;
