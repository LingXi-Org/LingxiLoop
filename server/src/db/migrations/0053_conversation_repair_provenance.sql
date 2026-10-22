-- Conversation repair release only: native schema14 and historical SQL stay unchanged.
-- The runner validates all52 historical names/checksums before entering this transaction.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.schema_migrations) <> 52
    OR (SELECT MAX(version) FROM public.schema_migrations) <> 52
    OR NOT EXISTS (SELECT 1 FROM lingxios.schema_version WHERE singleton AND version=14)
    OR NOT EXISTS (SELECT 1 FROM public.lingxios_installation WHERE singleton
      AND runtime_version='3.8.0' AND schema_version=14 AND protocol_version=11
      AND schema_sha256='c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f') THEN
    RAISE EXCEPTION '0053 requires exact runtime3.8.0/native14/product52 source provenance';
  END IF;
END $$;
UPDATE public.lingxios_installation SET runtime_version='3.8.1',installed_at=NOW()
WHERE singleton AND runtime_version='3.8.0';
