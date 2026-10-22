-- Product-only public presentation provenance. Historical runs remain unmarked.
-- The runner validates all53 historical names/checksums before this transaction.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.schema_migrations) <> 53
    OR (SELECT MAX(version) FROM public.schema_migrations) <> 53
    OR NOT EXISTS (SELECT 1 FROM lingxios.schema_version WHERE singleton AND version=14)
    OR NOT EXISTS (SELECT 1 FROM public.lingxios_installation WHERE singleton
      AND runtime_version='3.8.2' AND schema_version=14 AND protocol_version=11
      AND schema_sha256='c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f') THEN
    RAISE EXCEPTION '0054 requires exact runtime3.8.2/native14/product53 source provenance';
  END IF;
END $$;
ALTER TABLE public.agent_run_bindings
  ADD COLUMN presentation_version smallint
    CHECK (presentation_version IS NULL OR presentation_version=1);
COMMENT ON COLUMN public.agent_run_bindings.presentation_version IS
  'Host-proven new-run display contract; NULL preserves historical unknown purpose. Never backfill.';
