-- Preserve product history, but never resume retired effects from stored configuration.
SET LOCAL lock_timeout = '5s';
ALTER TABLE participants ALTER COLUMN capabilities SET DEFAULT '["canvas","web","files","documents","knowledge","learning","handoffs","routines"]'::jsonb;
UPDATE participants SET capabilities=capabilities-'email'-'calendar',
  tools=COALESCE((SELECT jsonb_agg(tool) FROM jsonb_array_elements_text(tools) tool
    WHERE tool !~* '(email|calendar)'), '[]'::jsonb)
WHERE kind='agent' AND (capabilities ?| ARRAY['email','calendar'] OR tools::text ~* '(email|calendar)');
UPDATE calendar_events SET status='cancelled',updated_at=NOW() WHERE status IN ('active','paused');
UPDATE email_messages SET next_retry_at=NULL WHERE next_retry_at IS NOT NULL;
UPDATE lingxios_ingress_outbox SET failed_at=NOW(),claim_token=NULL,claimed_until=NULL,error='calendar tasks are retired'
WHERE kind='calendar' AND delivered_at IS NULL AND failed_at IS NULL;
UPDATE agent_native_event_outbox SET failed_at=NOW(),claim_token=NULL,last_error='calendar events are retired'
WHERE delivered_at IS NULL AND failed_at IS NULL AND (event->>'type'='calendar.changed'
  OR event->'payload'->'metadata'->'custom' ? 'calendarEventId');
UPDATE notification_preferences SET email_enabled=false WHERE email_enabled;
UPDATE notification_deliveries SET status='CANCELLED',error='product email notifications are retired',
  lease_token=NULL,lease_expires_at=NULL,updated_at=NOW()
WHERE channel='EMAIL' AND status IN ('PENDING','FAILED','SENDING');
