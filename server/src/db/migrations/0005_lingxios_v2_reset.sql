-- Maintenance-window hard cut from the legacy AgentOS runtime to LingxiOS v2.
-- Durable audit/history remains; only resumable runtime state is invalidated.

UPDATE public.approvals
SET status = 'CANCELLED',
    continuation_status = 'REJECTED',
    resolved_at = COALESCE(resolved_at, NOW()),
    cancel_reason = 'LingxiOS v2 runtime reset',
    error = COALESCE(error, 'LingxiOS v2 runtime reset')
WHERE source = 'AGENT_OS'
  AND status IN ('PENDING', 'APPROVED');

UPDATE public.agent_host_actions
SET status = 'failed',
    error = COALESCE(error, 'LingxiOS v2 runtime reset'),
    updated_at = NOW()
WHERE status IN ('pending', 'awaiting_approval');

UPDATE public.agent_work_items
SET status = 'cancelled',
    lease_token_hash = NULL,
    leased_by = NULL,
    lease_started_at = NULL,
    lease_expires_at = NULL,
    cancel_requested_at = NULL,
    steer_inputs = '[]'::jsonb,
    preempt_requested_at = NULL,
    preempt_grace_expires_at = NULL,
    error = COALESCE(error, 'LingxiOS v2 runtime reset'),
    finished_at = COALESCE(finished_at, NOW()),
    updated_at = NOW()
WHERE status IN ('queued', 'leased');

DELETE FROM public.agent_os_session_leases;
DELETE FROM public.agent_os_session_routes;
DELETE FROM public.agent_os_sessions;
DELETE FROM public.agent_os_workers;
