-- 3.2.10 changes completion review only; retain the existing schema and all run data.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lingxios_installation WHERE singleton AND runtime_version = '3.2.9'
    AND (schema_version<>10 OR protocol_version<>9 OR schema_sha256<>'94f58c7133a39a9a847f5829b6946292a105bc92e573c5e8c04e7699aeb80072')) THEN
    RAISE EXCEPTION 'LingxiOS 3.2.10 requires the verified 3.2.9 schema';
  END IF;
END $$;
UPDATE public.lingxios_installation SET runtime_version='3.2.10',installed_at=NOW()
WHERE singleton AND runtime_version = '3.2.9';
