CREATE TABLE public.agent_os_workers (
    worker_id text PRIMARY KEY,
    last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.agent_os_workers (worker_id, last_seen_at, updated_at)
SELECT leased_by, MAX(updated_at), MAX(updated_at)
FROM public.agent_work_items
WHERE leased_by IS NOT NULL AND btrim(leased_by) <> ''
GROUP BY leased_by;

CREATE TABLE public.agent_os_session_routes (
    session_key text PRIMARY KEY,
    worker_id text NOT NULL REFERENCES public.agent_os_workers(worker_id),
    home_epoch bigint NOT NULL DEFAULT 1,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT agent_os_session_routes_home_epoch_check CHECK (home_epoch > 0)
);

WITH latest_workers AS (
    SELECT DISTINCT ON (session_key) session_key, leased_by
    FROM (
        SELECT
            company_id || ':' || agent_id || ':' || channel_id || ':' || COALESCE(thread_root_client_msg_no, '-') AS session_key,
            leased_by,
            updated_at,
            id
        FROM public.agent_work_items
        WHERE leased_by IS NOT NULL AND btrim(leased_by) <> ''
    ) work
    ORDER BY session_key, updated_at DESC, id DESC
)
INSERT INTO public.agent_os_session_routes (session_key, worker_id)
SELECT session.session_key, latest.leased_by
FROM public.agent_os_sessions session
JOIN latest_workers latest ON latest.session_key = session.session_key;
