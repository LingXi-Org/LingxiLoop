-- The migration runner wraps this file in a transaction. Existing knowledge stays intact.
SET LOCAL lock_timeout = '5s';
ALTER TABLE knowledge_sources ADD COLUMN origin_attachment_id text;
DROP INDEX idx_knowledge_sources_origin_message;
CREATE UNIQUE INDEX idx_knowledge_sources_origin_attachment
  ON knowledge_sources(company_id,conversation_id,origin_client_msg_no,origin_attachment_id)
  WHERE origin_client_msg_no IS NOT NULL AND conversation_id IS NOT NULL AND deleted_at IS NULL;
ALTER TABLE lingxios_ingress_outbox ADD COLUMN knowledge_source_ids text[] NOT NULL DEFAULT '{}';
-- Old queue columns remain until operations clears old message state at the coordinated cutover.

-- Preserve old run records for business references while excluding them from native-message discovery.
ALTER TABLE agent_run_bindings ADD COLUMN message_protocol smallint NOT NULL DEFAULT 1 CHECK(message_protocol IN (1,2));
