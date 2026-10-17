-- The migration runner applies the published schema-12 asset in this transaction.
-- Drain old workers before applying; never replay historical terminal failures.
SET LOCAL lock_timeout = '5s';
LOCK TABLE lingxios.agent_work_items IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM lingxios.agent_work_items WHERE status='leased' AND lease_expires_at>NOW()) THEN
    RAISE EXCEPTION 'LingxiOS 3.5.0 requires drained workers before migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lingxios_installation WHERE singleton
    AND runtime_version IN ('3.4.1','3.4.7') AND schema_version=11 AND protocol_version=11
    AND schema_sha256='5d77d0140de93d5c9fc205942c77b850b799d257ef49c056da2af84e15f4bb9f') THEN
    RAISE EXCEPTION 'LingxiOS 3.5.0 requires the verified schema-11 installation';
  END IF;
END $$;
