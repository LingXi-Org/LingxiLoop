-- The migration runner installs published SDK migration 013 in this transaction.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lingxios_installation WHERE singleton AND (
    runtime_version='3.3.0' AND schema_version=11 AND protocol_version=11 OR
    runtime_version='3.2.13' AND schema_version=10 AND protocol_version=10
      AND schema_sha256='94f58c7133a39a9a847f5829b6946292a105bc92e573c5e8c04e7699aeb80072')) THEN
    RAISE EXCEPTION 'LingxiOS 3.3.0 requires the verified 3.2.13 schema or a fresh 3.3.0 installation';
  END IF;
  IF EXISTS (SELECT 1 FROM lingxios.agent_work_items WHERE status='leased') THEN
    RAISE EXCEPTION 'drain workers before the LingxiOS 3.3.0 protocol upgrade';
  END IF;
END $$;
