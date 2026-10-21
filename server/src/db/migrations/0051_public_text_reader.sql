-- Reader capability release only: native schema14 and existing event bytes stay unchanged.
-- The runner validates all50 historical names/checksums before entering this transaction.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.schema_migrations) <> 50
    OR (SELECT MAX(version) FROM public.schema_migrations) <> 50
    OR NOT EXISTS (SELECT 1 FROM lingxios.schema_version WHERE singleton AND version=14)
    OR NOT EXISTS (SELECT 1 FROM public.lingxios_installation WHERE singleton
      AND runtime_version='3.6.0' AND schema_version=14 AND protocol_version=11
      AND schema_sha256='c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f') THEN
    RAISE EXCEPTION '0051 requires exact runtime3.6/native14/product50 source provenance';
  END IF;
END $$;
UPDATE public.lingxios_installation SET runtime_version='3.7.0',installed_at=NOW()
WHERE singleton AND runtime_version='3.6.0';
