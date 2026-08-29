-- LingxiLoop v1 schema.
-- Bootstrap-only: apply to an empty PostgreSQL database; this file is not an upgrade migration.


-- Dumped from database version 16.15 (Debian 16.15-1.pgdg12+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg12+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: enforce_group_context_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_group_context_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM conversations c WHERE c.id = NEW.conversation_id AND c.company_id = NEW.company_id AND c.kind = 'group') THEN
    RAISE EXCEPTION 'canvases require a group conversation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: touch_knowledge_workspace_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_knowledge_workspace_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE projects SET updated_at = NOW() WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: touch_participant_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_participant_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_action_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_action_executions (
    idempotency_key text NOT NULL,
    agent_id text NOT NULL,
    input_scope_key text NOT NULL,
    action_index integer NOT NULL,
    action_type text NOT NULL,
    action_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    result_json jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_approvals (
    id text NOT NULL,
    company_id text NOT NULL,
    agent_id text NOT NULL,
    conversation_id text NOT NULL,
    run_id text,
    message_id text,
    kind text NOT NULL,
    summary text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    payload_hash text NOT NULL,
    action_key text,
    action_index integer,
    blocked_action jsonb,
    remaining_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    input_scope_key text,
    continuation_status text DEFAULT 'pending'::text NOT NULL,
    resumed_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by text,
    consumed_at timestamp with time zone
);


--
-- Name: agent_autonomy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_autonomy (
    user_id text NOT NULL,
    agent_id text NOT NULL,
    threshold real DEFAULT 0.6 NOT NULL,
    pulled integer DEFAULT 0 NOT NULL,
    led integer DEFAULT 0 NOT NULL,
    dissolved integer DEFAULT 0 NOT NULL,
    company_id text
);


--
-- Name: agent_autonomy_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_autonomy_rules (
    id text NOT NULL,
    company_id text NOT NULL,
    user_id text NOT NULL,
    agent_id text NOT NULL,
    scope text NOT NULL,
    operation text NOT NULL,
    mode text NOT NULL,
    source text DEFAULT 'explicit_user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_climate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_climate (
    agent_id text NOT NULL,
    about_id text NOT NULL,
    company_id text NOT NULL,
    affinity real DEFAULT 0 NOT NULL,
    trust real DEFAULT 0 NOT NULL,
    last_note text DEFAULT ''::text NOT NULL,
    history jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_events (
    id text NOT NULL,
    run_id text NOT NULL,
    agent_id text NOT NULL,
    company_id text,
    kind text NOT NULL,
    level text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sequence integer
);


--
-- Name: agent_handoffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_handoffs (
    id text NOT NULL,
    company_id text NOT NULL,
    conversation_id text NOT NULL,
    source_message_id text,
    from_agent_id text NOT NULL,
    to_agent_id text NOT NULL,
    title text NOT NULL,
    context_message_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    shared_paths jsonb DEFAULT '[]'::jsonb NOT NULL,
    browser_targets jsonb DEFAULT '[]'::jsonb NOT NULL,
    note text,
    status text DEFAULT 'working'::text NOT NULL,
    result_message_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text
);


--
-- Name: agent_host_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_host_actions (
    idempotency_key text NOT NULL,
    work_id text NOT NULL,
    run_id text NOT NULL,
    cell_id text NOT NULL,
    call_index integer NOT NULL,
    action text NOT NULL,
    args jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    result jsonb,
    error text,
    approval_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_log (
    id text NOT NULL,
    agent_id text NOT NULL,
    kind text NOT NULL,
    body text NOT NULL,
    ref jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id text
);


--
-- Name: agent_memory_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_memory_evidence (
    id text NOT NULL,
    company_id text NOT NULL,
    agent_id text NOT NULL,
    learner_id text NOT NULL,
    conversation_id text NOT NULL,
    user_event_id text NOT NULL,
    assistant_event_id text NOT NULL,
    user_text text NOT NULL,
    assistant_text text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT (now() + '00:00:15'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    error text
);


--
-- Name: agent_os_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_os_approvals (
    id text NOT NULL,
    company_id text NOT NULL,
    agent_id text NOT NULL,
    channel_id text NOT NULL,
    work_id text NOT NULL,
    idempotency_key text NOT NULL,
    action text NOT NULL,
    args jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by text,
    result jsonb,
    error text
);


--
-- Name: agent_os_session_leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_os_session_leases (
    session_key text NOT NULL,
    work_id text NOT NULL,
    fence bigint NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_os_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_os_sessions (
    session_key text NOT NULL,
    company_id text NOT NULL,
    agent_id text NOT NULL,
    channel_id text NOT NULL,
    thread_root_client_msg_no text,
    summary text,
    history jsonb DEFAULT '[]'::jsonb NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    compaction_epoch integer DEFAULT 0 NOT NULL,
    prompt_context jsonb,
    applied_work_ids jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: agent_routine_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_routine_runs (
    id text NOT NULL,
    routine_id text NOT NULL,
    work_id text,
    status text DEFAULT 'queued'::text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    error text
);


--
-- Name: agent_routines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_routines (
    id text NOT NULL,
    company_id text NOT NULL,
    agent_id text NOT NULL,
    channel_id text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    instructions text NOT NULL,
    schedule jsonb NOT NULL,
    timezone text DEFAULT 'Asia/Shanghai'::text NOT NULL,
    status text DEFAULT 'paused'::text NOT NULL,
    next_run_at timestamp with time zone,
    created_by text NOT NULL,
    approved_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id text NOT NULL,
    agent_id text NOT NULL,
    company_id text,
    trigger jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    stage text,
    summary text,
    error text,
    input_message_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    inbox_count integer DEFAULT 0 NOT NULL,
    tool_call_count integer DEFAULT 0 NOT NULL,
    fingerprint text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    input_tokens integer DEFAULT 0 NOT NULL,
    cached_input_tokens integer DEFAULT 0 NOT NULL,
    cache_creation_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    model text,
    reasoning_runtime text,
    external_runtime_run_id text
);


--
-- Name: agent_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tasks (
    id text NOT NULL,
    agent_id text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    due_at timestamp with time zone,
    ref jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id text
);


--
-- Name: agent_triages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_triages (
    id text NOT NULL,
    agent_id text NOT NULL,
    company_id text,
    source text NOT NULL,
    model text,
    actionable boolean DEFAULT false NOT NULL,
    reason text,
    input_tokens integer DEFAULT 0 NOT NULL,
    cached_input_tokens integer DEFAULT 0 NOT NULL,
    cache_creation_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    measured boolean DEFAULT true NOT NULL,
    run_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_work_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_work_items (
    id text NOT NULL,
    company_id text NOT NULL,
    agent_id text NOT NULL,
    channel_id text NOT NULL,
    thread_root_client_msg_no text,
    trigger_client_msg_no text NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    fence bigint DEFAULT 0 NOT NULL,
    lease_token_hash text,
    leased_by text,
    lease_expires_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    cancel_requested_at timestamp with time zone,
    steer_inputs jsonb DEFAULT '[]'::jsonb NOT NULL,
    canvas_id text,
    canvas_assignment_id text,
    result_text text,
    preempt_requested_at timestamp with time zone,
    preempt_grace_expires_at timestamp with time zone,
    preemptions integer DEFAULT 0 NOT NULL,
    lease_started_at timestamp with time zone,
    lane text GENERATED ALWAYS AS (
CASE
    WHEN (reason = ANY (ARRAY['message'::text, 'mention'::text])) THEN 'learner'::text
    WHEN (reason = 'resume'::text) THEN 'approval'::text
    WHEN (reason = ANY (ARRAY['handoff'::text, 'canvas_worker'::text, 'canvas_summary'::text])) THEN 'collaboration'::text
    ELSE 'background'::text
END) STORED
);


--
-- Name: agent_workspace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_workspace (
    agent_id text NOT NULL,
    path text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    meta jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id text,
    embedding public.vector(1536)
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id bigint NOT NULL,
    user_id text,
    company_id text,
    ip text,
    user_agent text,
    kind text NOT NULL,
    detail jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_events_id_seq OWNED BY public.audit_events.id;


--
-- Name: board_card_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_card_comments (
    id text NOT NULL,
    card_id text NOT NULL,
    author_id text NOT NULL,
    body text NOT NULL,
    mentions jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: board_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_cards (
    id text NOT NULL,
    board_id text NOT NULL,
    column_id text NOT NULL,
    title text NOT NULL,
    description text,
    "position" double precision DEFAULT 0 NOT NULL,
    assignee_id text,
    mentions jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: board_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_columns (
    id text NOT NULL,
    board_id text NOT NULL,
    title text NOT NULL,
    "position" double precision DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: board_mention_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_mention_reads (
    user_id text NOT NULL,
    last_read_at timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone NOT NULL
);


--
-- Name: boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boards (
    id text NOT NULL,
    company_id text NOT NULL,
    title text NOT NULL,
    description text,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id text
);


--
-- Name: calendar_dispatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_dispatches (
    id text NOT NULL,
    event_id text NOT NULL,
    company_id text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    dispatched_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'dispatched'::text NOT NULL,
    conversation_id text,
    message_id text,
    error text,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    attempt_count integer DEFAULT 1 NOT NULL,
    CONSTRAINT calendar_dispatches_attempt_count_check CHECK (attempt_count > 0)
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id text NOT NULL,
    company_id text NOT NULL,
    created_by text NOT NULL,
    kind text DEFAULT 'personal'::text NOT NULL,
    title text NOT NULL,
    description text,
    assignee_id text,
    target_conversation_id text,
    agent_prompt text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone,
    all_day boolean DEFAULT false NOT NULL,
    recurrence jsonb,
    status text DEFAULT 'active'::text NOT NULL,
    last_fired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_minutes_before integer,
    reminder_channel text,
    is_private boolean DEFAULT false NOT NULL,
    project_id text NOT NULL,
    CONSTRAINT calendar_events_kind_check CHECK (kind = ANY (ARRAY['personal'::text, 'agent_task'::text])),
    CONSTRAINT calendar_events_status_check CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'done'::text, 'cancelled'::text])),
    CONSTRAINT calendar_events_agent_task_check CHECK (kind <> 'agent_task'::text OR (assignee_id IS NOT NULL AND target_conversation_id IS NOT NULL)),
    CONSTRAINT calendar_events_reminder_check CHECK ((reminder_minutes_before IS NULL) = (reminder_channel IS NULL)),
    CONSTRAINT calendar_events_reminder_minutes_check CHECK (reminder_minutes_before IS NULL OR (reminder_minutes_before >= 0 AND reminder_minutes_before <= 20160)),
    CONSTRAINT calendar_events_reminder_channel_check CHECK (reminder_channel IS NULL OR reminder_channel = ANY (ARRAY['toast'::text, 'email'::text, 'both'::text]))
);


--
-- Name: calendar_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_reminders (
    id text NOT NULL,
    event_id text NOT NULL,
    company_id text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    fired_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text NOT NULL,
    recipients jsonb DEFAULT '[]'::jsonb NOT NULL,
    delivered_legs jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    error text,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    attempt_count integer DEFAULT 1 NOT NULL,
    CONSTRAINT calendar_reminders_attempt_count_check CHECK (attempt_count > 0)
);


--
-- Name: canvas_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_activity (
    id text NOT NULL,
    canvas_id text NOT NULL,
    frame_id text,
    actor_id text NOT NULL,
    actor_kind text NOT NULL,
    action text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT canvas_activity_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['user'::text, 'agent'::text]))),
    CONSTRAINT canvas_activity_action_check CHECK ((action = ANY (ARRAY[
      'workspace_started'::text, 'workspace_updated'::text,
      'frame_created'::text, 'frame_updated'::text, 'frame_deleted'::text,
      'comment_created'::text, 'agent_status'::text,
      'assignment_created'::text, 'assignment_updated'::text,
      'handoff'::text, 'task_completed'::text, 'task_failed'::text, 'task_cancelled'::text
    ])))
);


--
-- Name: canvas_agent_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_agent_assignments (
    id text NOT NULL,
    canvas_id text NOT NULL,
    agent_id text NOT NULL,
    assignment text NOT NULL,
    color text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    work_x double precision DEFAULT 0 NOT NULL,
    work_y double precision DEFAULT 0 NOT NULL,
    work_width double precision DEFAULT 680 NOT NULL,
    work_height double precision DEFAULT 520 NOT NULL,
    active_frame_id text,
    cursor_x double precision,
    cursor_y double precision,
    work_id text,
    result text,
    error text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT canvas_agent_assignments_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'blocked'::text, 'working'::text, 'waiting'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: canvas_assignment_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_assignment_dependencies (
    assignment_id text NOT NULL,
    depends_on_assignment_id text NOT NULL,
    CONSTRAINT canvas_assignment_dependencies_check CHECK ((assignment_id <> depends_on_assignment_id))
);


--
-- Name: canvas_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_comments (
    id text NOT NULL,
    canvas_id text NOT NULL,
    frame_id text,
    author_id text NOT NULL,
    author_kind text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT canvas_comments_author_kind_check CHECK ((author_kind = ANY (ARRAY['user'::text, 'agent'::text])))
);


--
-- Name: canvas_frames; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_frames (
    id text NOT NULL,
    canvas_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    x double precision DEFAULT 0 NOT NULL,
    y double precision DEFAULT 0 NOT NULL,
    width double precision DEFAULT 420 NOT NULL,
    height double precision DEFAULT 300 NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT canvas_frames_type_check CHECK ((type = ANY (ARRAY['html'::text, 'markdown'::text, 'document'::text, 'image'::text, 'artifact'::text])))
);


--
-- Name: canvas_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_presence (
    canvas_id text NOT NULL,
    participant_id text NOT NULL,
    participant_kind text NOT NULL,
    status text NOT NULL,
    frame_id text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    color text,
    cursor_x double precision,
    cursor_y double precision,
    CONSTRAINT canvas_presence_participant_kind_check CHECK ((participant_kind = ANY (ARRAY['user'::text, 'agent'::text])))
);


--
-- Name: canvases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvases (
    id text NOT NULL,
    company_id text NOT NULL,
    title text DEFAULT 'Shared Canvas'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    conversation_id text,
    trigger_client_msg_no text,
    goal text DEFAULT ''::text NOT NULL,
    initiator_agent_id text,
    status text DEFAULT 'active'::text NOT NULL,
    origin text NOT NULL,
    summary text,
    completed_at timestamp with time zone,
    project_id text,
    CONSTRAINT canvases_status_check CHECK ((status = ANY (ARRAY['active'::text, 'summarizing'::text, 'completed'::text, 'stopped'::text, 'failed'::text])))
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    owner_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description text DEFAULT ''::text NOT NULL
);


--
-- Name: company_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_invitations (
    token_hash text NOT NULL,
    company_id text NOT NULL,
    invited_by text NOT NULL,
    email text,
    role text DEFAULT 'member'::text NOT NULL,
    note text,
    max_uses integer DEFAULT 1 NOT NULL,
    use_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    last_accepted_at timestamp with time zone,
    last_accepted_by text
);


--
-- Name: company_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_members (
    company_id text NOT NULL,
    user_id text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: convene_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.convene_sessions (
    id text NOT NULL,
    conversation_id text NOT NULL,
    title text NOT NULL,
    flair text,
    started_by text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    state text DEFAULT 'live'::text NOT NULL,
    company_id text
);


--
-- Name: convene_transcript; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.convene_transcript (
    id text NOT NULL,
    session_id text NOT NULL,
    author_id text NOT NULL,
    kind text NOT NULL,
    body text NOT NULL,
    sequence integer NOT NULL,
    decision jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id text
);


--
-- Name: convening_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.convening_info (
    conversation_id text NOT NULL,
    pulled_by_id text NOT NULL,
    pulled_at timestamp with time zone DEFAULT now() NOT NULL,
    headline_lead text NOT NULL,
    headline_tail text NOT NULL,
    subhead text NOT NULL,
    who_and_why jsonb NOT NULL,
    evidence jsonb NOT NULL,
    asks jsonb NOT NULL,
    trigger jsonb NOT NULL,
    reasoning jsonb NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    company_id text
);


--
-- Name: email_sequence_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sequence_counters (
    conversation_id text NOT NULL,
    company_id text NOT NULL,
    next_sequence integer DEFAULT 1 NOT NULL
);


--
-- Name: conversation_mutes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_mutes (
    user_id text NOT NULL,
    conversation_id text NOT NULL,
    muted_at timestamp with time zone DEFAULT now() NOT NULL,
    muted_until timestamp with time zone
);


--
-- Name: conversation_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_reads (
    user_id text NOT NULL,
    conversation_id text NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL,
    last_read_message_id text DEFAULT ''::text NOT NULL,
    company_id text
);


--
-- Name: conversation_source_exclusions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_source_exclusions (
    conversation_id text NOT NULL,
    source_id text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    subtitle text,
    members jsonb NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    tag text,
    pulled_by jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    preset_key text,
    leader_id text,
    topic text,
    company_id text,
    project_id text
);


--
-- Name: course_invitation_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_invitation_acceptances (
    token_hash text NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_invitation_acceptances_role_check CHECK ((role = ANY (ARRAY['teacher'::text, 'learner'::text])))
);


--
-- Name: course_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_invitations (
    token_hash text NOT NULL,
    course_id text NOT NULL,
    company_id text NOT NULL,
    invited_by text NOT NULL,
    email text,
    role text NOT NULL,
    note text,
    max_uses integer NOT NULL,
    use_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    last_accepted_at timestamp with time zone,
    last_accepted_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_invitations_check CHECK (((use_count >= 0) AND (use_count <= max_uses))),
    CONSTRAINT course_invitations_max_uses_check CHECK (((max_uses >= 1) AND (max_uses <= 100))),
    CONSTRAINT course_invitations_role_check CHECK ((role = ANY (ARRAY['teacher'::text, 'learner'::text])))
);


--
-- Name: course_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_members (
    course_id text NOT NULL,
    company_id text NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_members_role_check CHECK ((role = ANY (ARRAY['teacher'::text, 'learner'::text])))
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id text NOT NULL,
    company_id text NOT NULL,
    project_id text NOT NULL,
    created_by text NOT NULL,
    study_room_conversation_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_mentions (
    id text NOT NULL,
    document_id text NOT NULL,
    company_id text NOT NULL,
    mentioner_id text NOT NULL,
    mentioned_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_snapshots (
    document_id text NOT NULL,
    state_bytes bytea NOT NULL,
    snapshot_at_update_id bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_updates (
    id bigint NOT NULL,
    document_id text NOT NULL,
    author_id text NOT NULL,
    update_bytes bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_updates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_updates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_updates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_updates_id_seq OWNED BY public.document_updates.id;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    company_id text NOT NULL,
    title text DEFAULT 'Untitled'::text NOT NULL,
    created_by text NOT NULL,
    conversation_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id text
);


--
-- Name: email_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_attachments (
    id text NOT NULL,
    message_id text NOT NULL,
    conversation_id text NOT NULL,
    company_id text NOT NULL,
    filename text NOT NULL,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    storage_key text,
    truncated boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_contacts (
    company_id text NOT NULL,
    address text NOT NULL,
    display_name text,
    message_count integer DEFAULT 0 NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_messages (
    message_id text NOT NULL,
    conversation_id text NOT NULL,
    company_id text NOT NULL,
    author_id text NOT NULL,
    body text NOT NULL,
    sequence integer NOT NULL,
    direction text NOT NULL,
    transport_status text NOT NULL,
    transport_error text,
    smtp_message_id text,
    in_reply_to text,
    references_chain jsonb DEFAULT '[]'::jsonb NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    from_addr text NOT NULL,
    to_addrs jsonb DEFAULT '[]'::jsonb NOT NULL,
    cc_addrs jsonb DEFAULT '[]'::jsonb NOT NULL,
    bcc_addrs jsonb DEFAULT '[]'::jsonb NOT NULL,
    html text,
    raw_size_bytes integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_submitted boolean DEFAULT false NOT NULL,
    retry_attempts integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone
);


--
-- Name: eval_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_cases (
    id text NOT NULL,
    eval_run_id text NOT NULL,
    case_key text NOT NULL,
    name text NOT NULL,
    "position" integer NOT NULL,
    source_agent_run_id text,
    status text NOT NULL,
    score double precision NOT NULL,
    observation jsonb NOT NULL,
    expectations jsonb NOT NULL,
    failure_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT eval_cases_score_check CHECK (((score >= (0)::double precision) AND (score <= (1)::double precision))),
    CONSTRAINT eval_cases_status_check CHECK ((status = ANY (ARRAY['pass'::text, 'fail'::text, 'error'::text])))
);


--
-- Name: eval_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_runs (
    id text NOT NULL,
    suite_key text NOT NULL,
    suite_name text NOT NULL,
    version text NOT NULL,
    commit_sha text,
    prompt_version text,
    model text,
    baseline_run_id text,
    status text NOT NULL,
    score double precision NOT NULL,
    pass_threshold double precision NOT NULL,
    case_count integer NOT NULL,
    passed_cases integer NOT NULL,
    failed_cases integer NOT NULL,
    error_cases integer DEFAULT 0 NOT NULL,
    source text NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT eval_runs_pass_threshold_check CHECK (((pass_threshold >= (0)::double precision) AND (pass_threshold <= (1)::double precision))),
    CONSTRAINT eval_runs_score_check CHECK (((score >= (0)::double precision) AND (score <= (1)::double precision))),
    CONSTRAINT eval_runs_source_check CHECK ((source = ANY (ARRAY['inline'::text, 'agent-os'::text, 'mixed'::text]))),
    CONSTRAINT eval_runs_status_check CHECK ((status = ANY (ARRAY['pass'::text, 'fail'::text, 'error'::text])))
);


--
-- Name: eval_stage_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_stage_results (
    id text NOT NULL,
    eval_run_id text NOT NULL,
    eval_case_id text NOT NULL,
    stage text NOT NULL,
    "position" integer NOT NULL,
    status text NOT NULL,
    score double precision,
    duration_ms integer DEFAULT 0 NOT NULL,
    findings jsonb DEFAULT '[]'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT eval_stage_results_score_check CHECK (((score >= (0)::double precision) AND (score <= (1)::double precision))),
    CONSTRAINT eval_stage_results_stage_check CHECK ((stage = ANY (ARRAY['ingest'::text, 'answer'::text, 'teaching'::text, 'rag'::text, 'tools'::text, 'safety'::text, 'task'::text, 'collaboration'::text, 'efficiency'::text, 'aggregate'::text]))),
    CONSTRAINT eval_stage_results_status_check CHECK ((status = ANY (ARRAY['pass'::text, 'fail'::text, 'skipped'::text, 'error'::text])))
);


--
-- Name: im_channel_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.im_channel_bindings (
    channel_id text NOT NULL,
    company_id text NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    leader_agent_id text,
    preset_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: im_poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.im_poll_votes (
    poll_client_msg_no text NOT NULL,
    voter_participant_id text NOT NULL,
    voter_kind text NOT NULL,
    option_id text NOT NULL,
    company_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: im_polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.im_polls (
    poll_client_msg_no text NOT NULL,
    channel_id text NOT NULL,
    channel_type integer DEFAULT 2 NOT NULL,
    company_id text NOT NULL,
    author_id text NOT NULL,
    request_fingerprint text NOT NULL,
    poll jsonb NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    published_revision bigint DEFAULT 0 NOT NULL,
    wukong_message_id text,
    wukong_message_seq bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT im_polls_revision_check CHECK (published_revision >= 0 AND published_revision <= revision)
);


--
-- Name: im_send_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.im_send_acceptances (
    company_id text NOT NULL,
    user_id text NOT NULL,
    client_nonce text NOT NULL,
    input_digest text NOT NULL,
    channel_id text NOT NULL,
    channel_type integer NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    echo jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_insight_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_insight_bindings (
    id text NOT NULL,
    company_id text NOT NULL,
    source_id text NOT NULL,
    external_insight_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_note_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_note_bindings (
    id text NOT NULL,
    company_id text NOT NULL,
    project_id text NOT NULL,
    external_note_id text NOT NULL,
    title text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_notebook_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_notebook_bindings (
    project_id text NOT NULL,
    company_id text NOT NULL,
    external_key text NOT NULL,
    external_notebook_id text,
    state text DEFAULT 'pending'::text NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_source_chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_source_chat_sessions (
    id text NOT NULL,
    company_id text NOT NULL,
    project_id text NOT NULL,
    source_id text NOT NULL,
    agent_id text NOT NULL,
    external_session_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: knowledge_source_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_source_jobs (
    id text NOT NULL,
    source_id text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    leased_until timestamp with time zone,
    leased_by text,
    last_error text,
    wake_recipients jsonb,
    wake_channel_id text,
    wake_trigger_client_msg_no text,
    wake_thread_root_client_msg_no text,
    wake_deadline timestamp with time zone,
    wake_released_at timestamp with time zone,
    wake_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_sources (
    id text NOT NULL,
    company_id text NOT NULL,
    project_id text NOT NULL,
    conversation_id text,
    origin_client_msg_no text,
    kind text NOT NULL,
    title text NOT NULL,
    mime_type text,
    size_bytes integer DEFAULT 0 NOT NULL,
    storage_key text,
    original_url text,
    external_source_id text,
    external_command_id text,
    external_chunk_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT 'queued'::text NOT NULL,
    error text,
    is_truncated boolean DEFAULT false NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: document_mention_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_mention_deliveries (
    id text NOT NULL,
    company_id text NOT NULL,
    document_id text NOT NULL,
    project_id text NOT NULL,
    mentioner_id text NOT NULL,
    mentioner_name text NOT NULL,
    document_title text NOT NULL,
    recipients jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    leased_until timestamp with time zone,
    leased_by text,
    last_error text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_mention_deliveries_recipients_check CHECK (((jsonb_typeof(recipients) = 'array'::text) AND (jsonb_array_length(recipients) > 0))),
    CONSTRAINT document_mention_deliveries_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: llm_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_calls (
    id text NOT NULL,
    company_id text NOT NULL,
    agent_id text,
    run_id text,
    conversation_id text,
    purpose text NOT NULL,
    source text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    cached_input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    cost_estimated boolean DEFAULT true NOT NULL,
    measured boolean DEFAULT false NOT NULL,
    latency_ms integer DEFAULT 0 NOT NULL,
    status text NOT NULL,
    error text,
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT llm_calls_source_check CHECK (source = ANY (ARRAY['product'::text, 'agent-os'::text, 'eval'::text])),
    CONSTRAINT llm_calls_status_check CHECK (status = ANY (ARRAY['succeeded'::text, 'failed'::text])),
    CONSTRAINT llm_calls_tokens_check CHECK (input_tokens >= 0 AND cached_input_tokens >= 0 AND output_tokens >= 0 AND latency_ms >= 0 AND cost_usd >= 0)
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    message_id text NOT NULL,
    user_id text NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id text NOT NULL,
    conversation_id text,
    message_seq bigint
);


--
-- Name: participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participants (
    id text NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    role text,
    initial text NOT NULL,
    avatar_bg text NOT NULL,
    status text NOT NULL,
    bio text,
    tools jsonb,
    system_prompt text,
    capabilities jsonb DEFAULT '["canvas", "web", "files", "email", "documents"]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    departed_at timestamp with time zone,
    status_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_url text,
    preset_key text,
    company_id text NOT NULL,
    email text,
    CONSTRAINT participants_agent_bloub_only CHECK (((kind <> 'agent'::text) OR (avatar_url IS NULL)))
);


--
-- Name: project_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_visits (
    project_id text NOT NULL,
    user_id text NOT NULL,
    visited_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id text NOT NULL,
    company_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    color text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    created_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_general boolean DEFAULT false NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    token_hash text NOT NULL,
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    ip text,
    user_agent text
);


--
-- Name: tool_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_calls (
    id text NOT NULL,
    agent_id text NOT NULL,
    name text NOT NULL,
    args jsonb NOT NULL,
    result jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    run_id text,
    company_id text
);


--
-- Name: user_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_identities (
    provider text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    email_lower text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id text NOT NULL,
    prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    password_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    email_verified_at timestamp with time zone,
    avatar_url text,
    deleted_at timestamp with time zone,
    is_admin boolean DEFAULT false NOT NULL,
    suspended_at timestamp with time zone,
    suspension_reason text,
    suspended_by text
);


--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id text NOT NULL,
    provider text NOT NULL,
    provider_id text NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    note text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by text
);


--
-- Name: ws_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ws_tickets (
    token_hash text NOT NULL,
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: wukong_webhook_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wukong_webhook_receipts (
    event_id text NOT NULL,
    event_type text NOT NULL,
    payload_hash text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    error text
);


--
-- Name: audit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events ALTER COLUMN id SET DEFAULT nextval('public.audit_events_id_seq'::regclass);


--
-- Name: document_updates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_updates ALTER COLUMN id SET DEFAULT nextval('public.document_updates_id_seq'::regclass);


--
-- Name: agent_action_executions agent_action_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_executions
    ADD CONSTRAINT agent_action_executions_pkey PRIMARY KEY (idempotency_key);


--
-- Name: agent_approvals agent_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_approvals
    ADD CONSTRAINT agent_approvals_pkey PRIMARY KEY (id);


--
-- Name: agent_autonomy agent_autonomy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_autonomy
    ADD CONSTRAINT agent_autonomy_pkey PRIMARY KEY (user_id, agent_id);


--
-- Name: agent_autonomy_rules agent_autonomy_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_autonomy_rules
    ADD CONSTRAINT agent_autonomy_rules_pkey PRIMARY KEY (id);


--
-- Name: agent_autonomy_rules agent_autonomy_rules_user_id_agent_id_scope_operation_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_autonomy_rules
    ADD CONSTRAINT agent_autonomy_rules_user_id_agent_id_scope_operation_key UNIQUE (user_id, agent_id, scope, operation);


--
-- Name: agent_climate agent_climate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_climate
    ADD CONSTRAINT agent_climate_pkey PRIMARY KEY (company_id, agent_id, about_id);


--
-- Name: agent_events agent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_events
    ADD CONSTRAINT agent_events_pkey PRIMARY KEY (id);


--
-- Name: agent_handoffs agent_handoffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_handoffs
    ADD CONSTRAINT agent_handoffs_pkey PRIMARY KEY (id);


--
-- Name: agent_host_actions agent_host_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_host_actions
    ADD CONSTRAINT agent_host_actions_pkey PRIMARY KEY (idempotency_key);


--
-- Name: agent_log agent_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_log
    ADD CONSTRAINT agent_log_pkey PRIMARY KEY (id);


--
-- Name: agent_memory_evidence agent_memory_evidence_company_id_agent_id_user_event_id_ass_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_evidence
    ADD CONSTRAINT agent_memory_evidence_company_id_agent_id_user_event_id_ass_key UNIQUE (company_id, agent_id, user_event_id, assistant_event_id);


--
-- Name: agent_memory_evidence agent_memory_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_evidence
    ADD CONSTRAINT agent_memory_evidence_pkey PRIMARY KEY (id);


--
-- Name: agent_os_approvals agent_os_approvals_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_os_approvals
    ADD CONSTRAINT agent_os_approvals_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: agent_os_approvals agent_os_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_os_approvals
    ADD CONSTRAINT agent_os_approvals_pkey PRIMARY KEY (id);


--
-- Name: agent_os_session_leases agent_os_session_leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_os_session_leases
    ADD CONSTRAINT agent_os_session_leases_pkey PRIMARY KEY (session_key);


--
-- Name: agent_os_sessions agent_os_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_os_sessions
    ADD CONSTRAINT agent_os_sessions_pkey PRIMARY KEY (session_key);


--
-- Name: agent_routine_runs agent_routine_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_routine_runs
    ADD CONSTRAINT agent_routine_runs_pkey PRIMARY KEY (id);


--
-- Name: agent_routine_runs agent_routine_runs_routine_id_scheduled_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_routine_runs
    ADD CONSTRAINT agent_routine_runs_routine_id_scheduled_at_key UNIQUE (routine_id, scheduled_at);


--
-- Name: agent_routines agent_routines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_routines
    ADD CONSTRAINT agent_routines_pkey PRIMARY KEY (id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: agent_tasks agent_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_pkey PRIMARY KEY (id);


--
-- Name: agent_triages agent_triages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_triages
    ADD CONSTRAINT agent_triages_pkey PRIMARY KEY (id);


--
-- Name: agent_work_items agent_work_items_agent_id_trigger_client_msg_no_reason_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_items
    ADD CONSTRAINT agent_work_items_agent_id_trigger_client_msg_no_reason_key UNIQUE (agent_id, trigger_client_msg_no, reason);


--
-- Name: agent_work_items agent_work_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_items
    ADD CONSTRAINT agent_work_items_pkey PRIMARY KEY (id);


--
-- Name: agent_workspace agent_workspace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_workspace
    ADD CONSTRAINT agent_workspace_pkey PRIMARY KEY (agent_id, path);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: board_card_comments board_card_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_card_comments
    ADD CONSTRAINT board_card_comments_pkey PRIMARY KEY (id);


--
-- Name: board_cards board_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_cards
    ADD CONSTRAINT board_cards_pkey PRIMARY KEY (id);


--
-- Name: board_columns board_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_pkey PRIMARY KEY (id);


--
-- Name: board_mention_reads board_mention_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_mention_reads
    ADD CONSTRAINT board_mention_reads_pkey PRIMARY KEY (user_id);


--
-- Name: boards boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT boards_pkey PRIMARY KEY (id);


--
-- Name: calendar_dispatches calendar_dispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_dispatches
    ADD CONSTRAINT calendar_dispatches_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_reminders calendar_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_reminders
    ADD CONSTRAINT calendar_reminders_pkey PRIMARY KEY (id);


--
-- Name: canvas_activity canvas_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_activity
    ADD CONSTRAINT canvas_activity_pkey PRIMARY KEY (id);


--
-- Name: canvas_agent_assignments canvas_agent_assignments_canvas_id_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_agent_assignments
    ADD CONSTRAINT canvas_agent_assignments_canvas_id_agent_id_key UNIQUE (canvas_id, agent_id);


--
-- Name: canvas_agent_assignments canvas_agent_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_agent_assignments
    ADD CONSTRAINT canvas_agent_assignments_pkey PRIMARY KEY (id);


--
-- Name: canvas_assignment_dependencies canvas_assignment_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_assignment_dependencies
    ADD CONSTRAINT canvas_assignment_dependencies_pkey PRIMARY KEY (assignment_id, depends_on_assignment_id);


--
-- Name: canvas_comments canvas_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_comments
    ADD CONSTRAINT canvas_comments_pkey PRIMARY KEY (id);


--
-- Name: canvas_frames canvas_frames_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_frames
    ADD CONSTRAINT canvas_frames_pkey PRIMARY KEY (id);


--
-- Name: canvas_presence canvas_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_presence
    ADD CONSTRAINT canvas_presence_pkey PRIMARY KEY (canvas_id, participant_id);


--
-- Name: canvases canvases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvases
    ADD CONSTRAINT canvases_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);


--
-- Name: company_invitations company_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_invitations
    ADD CONSTRAINT company_invitations_pkey PRIMARY KEY (token_hash);


--
-- Name: company_members company_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_pkey PRIMARY KEY (company_id, user_id);


--
-- Name: convene_sessions convene_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convene_sessions
    ADD CONSTRAINT convene_sessions_pkey PRIMARY KEY (id);


--
-- Name: convene_transcript convene_transcript_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convene_transcript
    ADD CONSTRAINT convene_transcript_pkey PRIMARY KEY (id);


--
-- Name: convening_info convening_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convening_info
    ADD CONSTRAINT convening_info_pkey PRIMARY KEY (conversation_id);


--
-- Name: email_sequence_counters email_sequence_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_counters
    ADD CONSTRAINT email_sequence_counters_pkey PRIMARY KEY (conversation_id, company_id);


--
-- Name: conversation_mutes conversation_mutes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_mutes
    ADD CONSTRAINT conversation_mutes_pkey PRIMARY KEY (user_id, conversation_id);


--
-- Name: conversation_reads conversation_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_reads
    ADD CONSTRAINT conversation_reads_pkey PRIMARY KEY (user_id, conversation_id);


--
-- Name: conversation_source_exclusions conversation_source_exclusions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_source_exclusions
    ADD CONSTRAINT conversation_source_exclusions_pkey PRIMARY KEY (conversation_id, source_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: course_invitation_acceptances course_invitation_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_invitation_acceptances
    ADD CONSTRAINT course_invitation_acceptances_pkey PRIMARY KEY (token_hash, user_id);


--
-- Name: course_invitations course_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_invitations
    ADD CONSTRAINT course_invitations_pkey PRIMARY KEY (token_hash);


--
-- Name: course_members course_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_members
    ADD CONSTRAINT course_members_pkey PRIMARY KEY (course_id, user_id);


--
-- Name: courses courses_id_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_id_company_id_key UNIQUE (id, company_id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: courses courses_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_project_id_key UNIQUE (project_id);


--
-- Name: document_mentions document_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_mentions
    ADD CONSTRAINT document_mentions_pkey PRIMARY KEY (id);


--
-- Name: document_mention_deliveries document_mention_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_mention_deliveries
    ADD CONSTRAINT document_mention_deliveries_pkey PRIMARY KEY (id);


--
-- Name: document_snapshots document_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_snapshots
    ADD CONSTRAINT document_snapshots_pkey PRIMARY KEY (document_id);


--
-- Name: document_updates document_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_updates
    ADD CONSTRAINT document_updates_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: email_attachments email_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_pkey PRIMARY KEY (id);


--
-- Name: email_contacts email_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_contacts
    ADD CONSTRAINT email_contacts_pkey PRIMARY KEY (company_id, address);


--
-- Name: email_messages email_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (message_id);


--
-- Name: eval_cases eval_cases_eval_run_id_case_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_cases
    ADD CONSTRAINT eval_cases_eval_run_id_case_key_key UNIQUE (eval_run_id, case_key);


--
-- Name: eval_cases eval_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_cases
    ADD CONSTRAINT eval_cases_pkey PRIMARY KEY (id);


--
-- Name: eval_runs eval_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_runs
    ADD CONSTRAINT eval_runs_pkey PRIMARY KEY (id);


--
-- Name: eval_stage_results eval_stage_results_eval_case_id_stage_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_stage_results
    ADD CONSTRAINT eval_stage_results_eval_case_id_stage_key UNIQUE (eval_case_id, stage);


--
-- Name: eval_stage_results eval_stage_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_stage_results
    ADD CONSTRAINT eval_stage_results_pkey PRIMARY KEY (id);


--
-- Name: im_channel_bindings im_channel_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.im_channel_bindings
    ADD CONSTRAINT im_channel_bindings_pkey PRIMARY KEY (channel_id);


--
-- Name: im_poll_votes im_poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.im_poll_votes
    ADD CONSTRAINT im_poll_votes_pkey PRIMARY KEY (poll_client_msg_no, voter_participant_id, option_id);


--
-- Name: im_polls im_polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.im_polls
    ADD CONSTRAINT im_polls_pkey PRIMARY KEY (poll_client_msg_no);


--
-- Name: im_send_acceptances im_send_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.im_send_acceptances
    ADD CONSTRAINT im_send_acceptances_pkey PRIMARY KEY (company_id, user_id, client_nonce);


--
-- Name: knowledge_insight_bindings knowledge_insight_bindings_external_insight_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_insight_bindings
    ADD CONSTRAINT knowledge_insight_bindings_external_insight_id_key UNIQUE (external_insight_id);


--
-- Name: knowledge_insight_bindings knowledge_insight_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_insight_bindings
    ADD CONSTRAINT knowledge_insight_bindings_pkey PRIMARY KEY (id);


--
-- Name: knowledge_note_bindings knowledge_note_bindings_external_note_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_note_bindings
    ADD CONSTRAINT knowledge_note_bindings_external_note_id_key UNIQUE (external_note_id);


--
-- Name: knowledge_note_bindings knowledge_note_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_note_bindings
    ADD CONSTRAINT knowledge_note_bindings_pkey PRIMARY KEY (id);


--
-- Name: knowledge_notebook_bindings knowledge_notebook_bindings_external_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_notebook_bindings
    ADD CONSTRAINT knowledge_notebook_bindings_external_key_key UNIQUE (external_key);


--
-- Name: knowledge_notebook_bindings knowledge_notebook_bindings_external_notebook_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_notebook_bindings
    ADD CONSTRAINT knowledge_notebook_bindings_external_notebook_id_key UNIQUE (external_notebook_id);


--
-- Name: knowledge_notebook_bindings knowledge_notebook_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_notebook_bindings
    ADD CONSTRAINT knowledge_notebook_bindings_pkey PRIMARY KEY (project_id);


--
-- Name: knowledge_source_chat_sessions knowledge_source_chat_sessions_external_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_source_chat_sessions
    ADD CONSTRAINT knowledge_source_chat_sessions_external_session_id_key UNIQUE (external_session_id);


--
-- Name: knowledge_source_chat_sessions knowledge_source_chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_source_chat_sessions
    ADD CONSTRAINT knowledge_source_chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: knowledge_source_jobs knowledge_source_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_source_jobs
    ADD CONSTRAINT knowledge_source_jobs_pkey PRIMARY KEY (id);


--
-- Name: knowledge_source_jobs knowledge_source_jobs_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_source_jobs
    ADD CONSTRAINT knowledge_source_jobs_source_id_key UNIQUE (source_id);


--
-- Name: knowledge_sources knowledge_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_sources
    ADD CONSTRAINT knowledge_sources_pkey PRIMARY KEY (id);


--
-- Name: llm_calls llm_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_calls
    ADD CONSTRAINT llm_calls_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (message_id, user_id, emoji);


--
-- Name: participants participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id, company_id);


--
-- Name: project_visits project_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_visits
    ADD CONSTRAINT project_visits_pkey PRIMARY KEY (project_id, user_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: tool_calls tool_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_calls
    ADD CONSTRAINT tool_calls_pkey PRIMARY KEY (id);


--
-- Name: user_identities user_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_pkey PRIMARY KEY (provider, provider_id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: waitlist waitlist_provider_provider_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_provider_provider_id_key UNIQUE (provider, provider_id);


--
-- Name: ws_tickets ws_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ws_tickets
    ADD CONSTRAINT ws_tickets_pkey PRIMARY KEY (token_hash);


--
-- Name: wukong_webhook_receipts wukong_webhook_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wukong_webhook_receipts
    ADD CONSTRAINT wukong_webhook_receipts_pkey PRIMARY KEY (event_id);


--
-- Name: idx_agent_action_executions_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_action_executions_scope ON public.agent_action_executions USING btree (agent_id, input_scope_key);


--
-- Name: idx_agent_approvals_gate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_approvals_gate ON public.agent_approvals USING btree (agent_id, payload_hash, status, consumed_at);


--
-- Name: idx_agent_approvals_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_approvals_pending ON public.agent_approvals USING btree (company_id, status, requested_at DESC);


--
-- Name: idx_agent_autonomy_rules_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_autonomy_rules_user ON public.agent_autonomy_rules USING btree (company_id, user_id, agent_id);


--
-- Name: idx_agent_climate_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_climate_agent ON public.agent_climate USING btree (agent_id, updated_at DESC);


--
-- Name: idx_agent_climate_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_climate_company ON public.agent_climate USING btree (company_id);


--
-- Name: idx_agent_events_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_events_agent ON public.agent_events USING btree (agent_id, created_at DESC);


--
-- Name: idx_agent_events_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_events_company ON public.agent_events USING btree (company_id, created_at DESC);


--
-- Name: idx_agent_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_events_created ON public.agent_events USING btree (created_at);


--
-- Name: idx_agent_events_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_events_run ON public.agent_events USING btree (run_id, created_at);


--
-- Name: idx_agent_events_run_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_events_run_sequence ON public.agent_events USING btree (run_id, sequence) WHERE (sequence IS NOT NULL);


--
-- Name: idx_agent_handoffs_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_handoffs_conversation ON public.agent_handoffs USING btree (conversation_id, created_at DESC);


--
-- Name: idx_agent_handoffs_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_handoffs_idempotency_key ON public.agent_handoffs USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_agent_handoffs_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_handoffs_owner ON public.agent_handoffs USING btree (company_id, to_agent_id, status);


--
-- Name: idx_agent_host_actions_work; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_host_actions_work ON public.agent_host_actions USING btree (work_id, created_at);


--
-- Name: idx_agent_log_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_log_agent ON public.agent_log USING btree (agent_id, created_at DESC);


--
-- Name: idx_agent_log_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_log_company ON public.agent_log USING btree (company_id, agent_id);


--
-- Name: idx_agent_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_log_created ON public.agent_log USING btree (created_at);


--
-- Name: idx_agent_memory_evidence_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_evidence_pending ON public.agent_memory_evidence USING btree (company_id, agent_id, status, available_at, created_at);


--
-- Name: idx_agent_os_approvals_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_os_approvals_pending ON public.agent_os_approvals USING btree (company_id, status, requested_at DESC);


--
-- Name: idx_agent_os_session_leases_work; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_os_session_leases_work ON public.agent_os_session_leases USING btree (work_id);


--
-- Name: idx_agent_os_sessions_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_os_sessions_agent ON public.agent_os_sessions USING btree (company_id, agent_id, updated_at DESC);


--
-- Name: idx_agent_routines_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_routines_due ON public.agent_routines USING btree (status, next_run_at) WHERE (status = 'active'::text);


--
-- Name: idx_agent_runs_agent_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_agent_started ON public.agent_runs USING btree (agent_id, started_at DESC);


--
-- Name: idx_agent_runs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_company ON public.agent_runs USING btree (company_id, started_at DESC);


--
-- Name: idx_agent_runs_company_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_company_started ON public.agent_runs USING btree (company_id, started_at DESC);


--
-- Name: idx_agent_runs_external_runtime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_external_runtime ON public.agent_runs USING btree (agent_id, external_runtime_run_id) WHERE (external_runtime_run_id IS NOT NULL);


--
-- Name: idx_agent_runs_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_started ON public.agent_runs USING btree (started_at);


--
-- Name: idx_agent_runs_status_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_status_updated ON public.agent_runs USING btree (status, updated_at DESC);


--
-- Name: idx_agent_tasks_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tasks_agent ON public.agent_tasks USING btree (agent_id, status, updated_at DESC);


--
-- Name: idx_agent_triages_agent_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_triages_agent_created ON public.agent_triages USING btree (agent_id, created_at DESC);


--
-- Name: idx_agent_triages_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_triages_company_created ON public.agent_triages USING btree (company_id, created_at DESC);


--
-- Name: idx_agent_work_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_work_agent ON public.agent_work_items USING btree (company_id, agent_id, created_at DESC);


--
-- Name: idx_agent_work_canvas_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_work_canvas_assignment ON public.agent_work_items USING btree (canvas_assignment_id) WHERE (canvas_assignment_id IS NOT NULL);


--
-- Name: idx_agent_work_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_work_claim ON public.agent_work_items USING btree (status, available_at, priority DESC, created_at);


--
-- Name: idx_agent_work_lane_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_work_lane_claim ON public.agent_work_items USING btree (status, available_at, lane, priority DESC, created_at);


--
-- Name: idx_agent_workspace_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_workspace_agent ON public.agent_workspace USING btree (agent_id, updated_at DESC);


--
-- Name: idx_audit_events_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_events_kind ON public.audit_events USING btree (kind, created_at DESC);


--
-- Name: idx_audit_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_events_user ON public.audit_events USING btree (user_id, created_at DESC);


--
-- Name: idx_board_card_comments_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_board_card_comments_card ON public.board_card_comments USING btree (card_id, created_at);


--
-- Name: idx_board_cards_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_board_cards_assignee ON public.board_cards USING btree (assignee_id) WHERE (assignee_id IS NOT NULL);


--
-- Name: idx_board_cards_board; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_board_cards_board ON public.board_cards USING btree (board_id, updated_at DESC);


--
-- Name: idx_board_cards_column; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_board_cards_column ON public.board_cards USING btree (column_id, "position");


--
-- Name: idx_board_columns_board; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_board_columns_board ON public.board_columns USING btree (board_id, "position");


--
-- Name: idx_boards_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_boards_company ON public.boards USING btree (company_id, updated_at DESC);


--
-- Name: idx_boards_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_boards_project ON public.boards USING btree (project_id, updated_at DESC);


--
-- Name: idx_calendar_dispatches_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_dispatches_company ON public.calendar_dispatches USING btree (company_id, dispatched_at DESC);


--
-- Name: idx_calendar_dispatches_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_dispatches_event ON public.calendar_dispatches USING btree (event_id, scheduled_for DESC);


--
-- Name: idx_calendar_events_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_assignee ON public.calendar_events USING btree (assignee_id, start_at) WHERE (assignee_id IS NOT NULL);


--
-- Name: idx_calendar_events_company_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_company_start ON public.calendar_events USING btree (company_id, start_at);


--
-- Name: idx_calendar_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_status ON public.calendar_events USING btree (status, start_at) WHERE (status = 'active'::text);


--
-- Name: idx_calendar_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_project ON public.calendar_events USING btree (project_id, start_at);


--
-- Name: idx_calendar_reminders_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_reminders_event ON public.calendar_reminders USING btree (event_id, scheduled_for DESC);


--
-- Name: idx_canvas_activity_canvas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canvas_activity_canvas ON public.canvas_activity USING btree (canvas_id, created_at DESC);


--
-- Name: idx_canvas_assignments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canvas_assignments_status ON public.canvas_agent_assignments USING btree (canvas_id, status, created_at);


--
-- Name: idx_canvas_comments_canvas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canvas_comments_canvas ON public.canvas_comments USING btree (canvas_id, created_at DESC);


--
-- Name: idx_canvas_comments_frame; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canvas_comments_frame ON public.canvas_comments USING btree (frame_id, created_at DESC) WHERE (frame_id IS NOT NULL);


--
-- Name: idx_canvas_frames_canvas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canvas_frames_canvas ON public.canvas_frames USING btree (canvas_id, created_at);


--
-- Name: idx_canvas_presence_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canvas_presence_seen ON public.canvas_presence USING btree (canvas_id, last_seen_at DESC);


--
-- Name: idx_canvases_company_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canvases_company_updated ON public.canvases USING btree (company_id, updated_at DESC);


--
-- Name: idx_canvases_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canvases_conversation ON public.canvases USING btree (company_id, conversation_id, updated_at DESC) WHERE (conversation_id IS NOT NULL);


--
-- Name: idx_canvases_one_per_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_canvases_one_per_conversation ON public.canvases USING btree (conversation_id);


--
-- Name: idx_canvases_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canvases_project ON public.canvases USING btree (project_id, updated_at DESC);


--
-- Name: idx_company_invitations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_invitations_company ON public.company_invitations USING btree (company_id, created_at DESC);


--
-- Name: idx_company_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_invitations_email ON public.company_invitations USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_convene_transcript_session_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_convene_transcript_session_seq ON public.convene_transcript USING btree (session_id, sequence);


--
-- Name: idx_conversations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_company ON public.conversations USING btree (company_id, updated_at DESC);


--
-- Name: idx_conversations_company_preset_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conversations_company_preset_key ON public.conversations USING btree (company_id, preset_key) WHERE (preset_key IS NOT NULL);


--
-- Name: idx_conversations_id_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conversations_id_company ON public.conversations USING btree (id, company_id);


--
-- Name: idx_conversations_members_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_members_gin ON public.conversations USING gin (members jsonb_path_ops);


--
-- Name: idx_conversations_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_project ON public.conversations USING btree (project_id);


--
-- Name: idx_course_invitations_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_invitations_course ON public.course_invitations USING btree (course_id, created_at DESC);


--
-- Name: idx_course_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_invitations_email ON public.course_invitations USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_course_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_members_user ON public.course_members USING btree (company_id, user_id, role);


--
-- Name: idx_courses_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_company ON public.courses USING btree (company_id, created_at DESC);


--
-- Name: idx_document_mentions_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_mentions_doc ON public.document_mentions USING btree (document_id, created_at DESC);


--
-- Name: idx_document_mentions_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_mentions_recipient ON public.document_mentions USING btree (mentioned_id, created_at DESC);


--
-- Name: idx_document_mention_deliveries_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_mention_deliveries_due ON public.document_mention_deliveries USING btree (available_at, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'processing'::text]));


--
-- Name: idx_document_mention_deliveries_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_mention_deliveries_company ON public.document_mention_deliveries USING btree (company_id, created_at DESC);


--
-- Name: idx_document_updates_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_updates_doc ON public.document_updates USING btree (document_id, id);


--
-- Name: idx_documents_company_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_company_updated ON public.documents USING btree (company_id, updated_at DESC);


--
-- Name: idx_documents_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_conversation ON public.documents USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: idx_documents_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_project ON public.documents USING btree (project_id, updated_at DESC);


--
-- Name: idx_email_attachments_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_attachments_conv ON public.email_attachments USING btree (conversation_id, created_at DESC);


--
-- Name: idx_email_attachments_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_attachments_msg ON public.email_attachments USING btree (message_id);


--
-- Name: idx_email_contacts_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_contacts_seen ON public.email_contacts USING btree (company_id, last_seen_at DESC);


--
-- Name: idx_email_messages_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_company ON public.email_messages USING btree (company_id, created_at DESC);


--
-- Name: idx_email_messages_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_conv ON public.email_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_email_messages_convo_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_messages_convo_seq ON public.email_messages USING btree (company_id, conversation_id, sequence);


--
-- Name: idx_email_messages_identity_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_messages_identity_scope ON public.email_messages USING btree (message_id, company_id, conversation_id);


--
-- Name: idx_email_messages_retry_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_retry_due ON public.email_messages USING btree (next_retry_at) WHERE ((direction = 'out'::text) AND (transport_status = 'failed'::text) AND (next_retry_at IS NOT NULL));


--
-- Name: idx_eval_cases_run_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eval_cases_run_position ON public.eval_cases USING btree (eval_run_id, "position");


--
-- Name: idx_eval_cases_source_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eval_cases_source_run ON public.eval_cases USING btree (source_agent_run_id) WHERE (source_agent_run_id IS NOT NULL);


--
-- Name: idx_eval_runs_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eval_runs_status_created ON public.eval_runs USING btree (status, created_at DESC);


--
-- Name: idx_eval_runs_suite_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eval_runs_suite_created ON public.eval_runs USING btree (suite_key, created_at DESC);


--
-- Name: idx_eval_stages_failures; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eval_stages_failures ON public.eval_stage_results USING btree (eval_run_id, status) WHERE (status = ANY (ARRAY['fail'::text, 'error'::text]));


--
-- Name: idx_eval_stages_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eval_stages_run ON public.eval_stage_results USING btree (eval_run_id, "position");


--
-- Name: idx_im_channel_bindings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_im_channel_bindings_company ON public.im_channel_bindings USING btree (company_id, updated_at DESC);


--
-- Name: idx_im_poll_votes_voter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_im_poll_votes_voter ON public.im_poll_votes USING btree (company_id, voter_participant_id);


--
-- Name: idx_im_polls_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_im_polls_channel ON public.im_polls USING btree (company_id, channel_id, created_at DESC);


--
-- Name: idx_im_polls_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_im_polls_expiry ON public.im_polls USING btree (updated_at) WHERE (((poll ->> 'closedAt'::text) IS NULL) AND ((poll ->> 'expiresAt'::text) IS NOT NULL));


--
-- Name: idx_im_send_acceptances_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_im_send_acceptances_pending ON public.im_send_acceptances USING btree (status, updated_at);


--
-- Name: idx_knowledge_jobs_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_jobs_claim ON public.knowledge_source_jobs USING btree (status, available_at, leased_until);


--
-- Name: idx_knowledge_notes_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_notes_project ON public.knowledge_note_bindings USING btree (company_id, project_id, updated_at DESC);


--
-- Name: idx_knowledge_sources_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_knowledge_sources_external ON public.knowledge_sources USING btree (external_source_id) WHERE (external_source_id IS NOT NULL);


--
-- Name: idx_knowledge_sources_origin_message; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_knowledge_sources_origin_message ON public.knowledge_sources USING btree (company_id, conversation_id, origin_client_msg_no) WHERE ((origin_client_msg_no IS NOT NULL) AND (conversation_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_knowledge_sources_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_sources_project ON public.knowledge_sources USING btree (company_id, project_id, status, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_llm_calls_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_calls_company_created ON public.llm_calls USING btree (company_id, created_at DESC);


--
-- Name: idx_llm_calls_run_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_calls_run_created ON public.llm_calls USING btree (run_id, created_at) WHERE (run_id IS NOT NULL);


--
-- Name: idx_participants_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_active ON public.participants USING btree (kind) WHERE (departed_at IS NULL);


--
-- Name: idx_participants_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_company ON public.participants USING btree (company_id);


--
-- Name: idx_participants_company_preset_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_participants_company_preset_key ON public.participants USING btree (company_id, preset_key) WHERE (preset_key IS NOT NULL);


--
-- Name: idx_participants_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_email_lower ON public.participants USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: idx_project_visits_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_visits_user ON public.project_visits USING btree (user_id, visited_at DESC);


--
-- Name: idx_projects_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_company ON public.projects USING btree (company_id, status);


--
-- Name: idx_projects_company_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_company_updated ON public.projects USING btree (company_id, status, updated_at DESC);


--
-- Name: idx_projects_id_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_projects_id_company ON public.projects USING btree (id, company_id);


--
-- Name: idx_projects_one_general; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_projects_one_general ON public.projects USING btree (company_id) WHERE (is_general = true);


--
-- Name: idx_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_expires ON public.sessions USING btree (expires_at);


--
-- Name: idx_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);


--
-- Name: idx_tool_calls_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_calls_agent ON public.tool_calls USING btree (agent_id, created_at DESC);


--
-- Name: idx_tool_calls_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_calls_run ON public.tool_calls USING btree (run_id);


--
-- Name: idx_user_identities_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_identities_email ON public.user_identities USING btree (email_lower);


--
-- Name: idx_user_identities_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_identities_user ON public.user_identities USING btree (user_id);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (lower(email));


--
-- Name: idx_users_is_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_admin ON public.users USING btree (is_admin) WHERE (is_admin = true);


--
-- Name: idx_users_suspended; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_suspended ON public.users USING btree (suspended_at) WHERE (suspended_at IS NOT NULL);


--
-- Name: idx_waitlist_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_email ON public.waitlist USING btree (lower(email));


--
-- Name: idx_waitlist_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_status ON public.waitlist USING btree (status, requested_at);


--
-- Name: idx_workspace_embed_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workspace_embed_hnsw ON public.agent_workspace USING hnsw (embedding public.vector_cosine_ops) WHERE (path ~~ 'memory/%'::text);


--
-- Name: idx_workspace_memory_about; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workspace_memory_about ON public.agent_workspace USING btree (((meta ->> 'about'::text))) WHERE (path ~~ 'memory/%'::text);


--
-- Name: idx_workspace_memory_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workspace_memory_scope ON public.agent_workspace USING btree (company_id, ((meta ->> 'scopeType'::text)), ((meta ->> 'scopeId'::text)), updated_at DESC) WHERE (path ~~ 'memory/%'::text);


--
-- Name: idx_ws_tickets_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ws_tickets_expires ON public.ws_tickets USING btree (expires_at);


--
-- Name: idx_ws_tickets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ws_tickets_user ON public.ws_tickets USING btree (user_id);


--
-- Name: participants_agent_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX participants_agent_id_unique ON public.participants USING btree (id) WHERE (kind = 'agent'::text);


--
-- Name: uniq_calendar_dispatch_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_calendar_dispatch_slot ON public.calendar_dispatches USING btree (event_id, scheduled_for);


--
-- Name: uniq_calendar_reminders_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_calendar_reminders_slot ON public.calendar_reminders USING btree (event_id, scheduled_for);


--
-- Name: uniq_email_messages_smtp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_email_messages_smtp_id ON public.email_messages USING btree (company_id, lower(smtp_message_id)) WHERE (smtp_message_id IS NOT NULL);


--
-- Name: uniq_participants_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_participants_email ON public.participants USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: participants participants_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER participants_touch_updated_at BEFORE UPDATE ON public.participants FOR EACH ROW EXECUTE FUNCTION public.touch_participant_updated_at();


--
-- Name: canvases trg_canvas_group_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_canvas_group_only BEFORE INSERT OR UPDATE OF conversation_id ON public.canvases FOR EACH ROW EXECUTE FUNCTION public.enforce_group_context_owner();


--
-- Name: boards trg_touch_workspace; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_workspace AFTER INSERT OR DELETE OR UPDATE ON public.boards FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_workspace_updated_at();


--
-- Name: calendar_events trg_touch_workspace; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_workspace AFTER INSERT OR DELETE OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_workspace_updated_at();


--
-- Name: canvases trg_touch_workspace; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_workspace AFTER INSERT OR DELETE OR UPDATE ON public.canvases FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_workspace_updated_at();


--
-- Name: conversations trg_touch_workspace; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_workspace AFTER INSERT OR DELETE OR UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_workspace_updated_at();


--
-- Name: documents trg_touch_workspace; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_workspace AFTER INSERT OR DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_workspace_updated_at();


--
-- Name: knowledge_sources trg_touch_workspace; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_workspace AFTER INSERT OR DELETE OR UPDATE ON public.knowledge_sources FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_workspace_updated_at();


--
-- Name: agent_approvals agent_approvals_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_approvals
    ADD CONSTRAINT agent_approvals_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: agent_events agent_events_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_events
    ADD CONSTRAINT agent_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: agent_handoffs agent_handoffs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_handoffs
    ADD CONSTRAINT agent_handoffs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: agent_host_actions agent_host_actions_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_host_actions
    ADD CONSTRAINT agent_host_actions_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.agent_work_items(id) ON DELETE CASCADE;


--
-- Name: agent_memory_evidence agent_memory_evidence_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_evidence
    ADD CONSTRAINT agent_memory_evidence_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agent_os_approvals agent_os_approvals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_os_approvals
    ADD CONSTRAINT agent_os_approvals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agent_os_approvals agent_os_approvals_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_os_approvals
    ADD CONSTRAINT agent_os_approvals_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.agent_work_items(id) ON DELETE CASCADE;


--
-- Name: agent_os_session_leases agent_os_session_leases_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_os_session_leases
    ADD CONSTRAINT agent_os_session_leases_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.agent_work_items(id) ON DELETE CASCADE;


--
-- Name: agent_os_sessions agent_os_sessions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_os_sessions
    ADD CONSTRAINT agent_os_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agent_routine_runs agent_routine_runs_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_routine_runs
    ADD CONSTRAINT agent_routine_runs_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.agent_routines(id) ON DELETE CASCADE;


--
-- Name: agent_routine_runs agent_routine_runs_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_routine_runs
    ADD CONSTRAINT agent_routine_runs_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.agent_work_items(id) ON DELETE SET NULL;


--
-- Name: agent_routines agent_routines_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_routines
    ADD CONSTRAINT agent_routines_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agent_work_items agent_work_items_canvas_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_items
    ADD CONSTRAINT agent_work_items_canvas_assignment_id_fkey FOREIGN KEY (canvas_assignment_id) REFERENCES public.canvas_agent_assignments(id) ON DELETE SET NULL;


--
-- Name: agent_work_items agent_work_items_canvas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_items
    ADD CONSTRAINT agent_work_items_canvas_id_fkey FOREIGN KEY (canvas_id) REFERENCES public.canvases(id) ON DELETE SET NULL;


--
-- Name: agent_work_items agent_work_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_items
    ADD CONSTRAINT agent_work_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: board_card_comments board_card_comments_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_card_comments
    ADD CONSTRAINT board_card_comments_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.board_cards(id) ON DELETE CASCADE;


--
-- Name: board_cards board_cards_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_cards
    ADD CONSTRAINT board_cards_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;


--
-- Name: board_cards board_cards_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_cards
    ADD CONSTRAINT board_cards_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.board_columns(id) ON DELETE CASCADE;


--
-- Name: board_columns board_columns_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;


--
-- Name: boards boards_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT boards_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: boards boards_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT boards_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: calendar_dispatches calendar_dispatches_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_dispatches
    ADD CONSTRAINT calendar_dispatches_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.calendar_events(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: calendar_events calendar_events_target_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_target_conversation_id_fkey FOREIGN KEY (target_conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: calendar_reminders calendar_reminders_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_reminders
    ADD CONSTRAINT calendar_reminders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.calendar_events(id) ON DELETE CASCADE;


--
-- Name: canvas_activity canvas_activity_canvas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_activity
    ADD CONSTRAINT canvas_activity_canvas_id_fkey FOREIGN KEY (canvas_id) REFERENCES public.canvases(id) ON DELETE CASCADE;


--
-- Name: canvas_activity canvas_activity_frame_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_activity
    ADD CONSTRAINT canvas_activity_frame_id_fkey FOREIGN KEY (frame_id) REFERENCES public.canvas_frames(id) ON DELETE SET NULL;


--
-- Name: canvas_agent_assignments canvas_agent_assignments_active_frame_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_agent_assignments
    ADD CONSTRAINT canvas_agent_assignments_active_frame_id_fkey FOREIGN KEY (active_frame_id) REFERENCES public.canvas_frames(id) ON DELETE SET NULL;


--
-- Name: canvas_agent_assignments canvas_agent_assignments_canvas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_agent_assignments
    ADD CONSTRAINT canvas_agent_assignments_canvas_id_fkey FOREIGN KEY (canvas_id) REFERENCES public.canvases(id) ON DELETE CASCADE;


--
-- Name: canvas_assignment_dependencies canvas_assignment_dependencies_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_assignment_dependencies
    ADD CONSTRAINT canvas_assignment_dependencies_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.canvas_agent_assignments(id) ON DELETE CASCADE;


--
-- Name: canvas_assignment_dependencies canvas_assignment_dependencies_depends_on_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_assignment_dependencies
    ADD CONSTRAINT canvas_assignment_dependencies_depends_on_assignment_id_fkey FOREIGN KEY (depends_on_assignment_id) REFERENCES public.canvas_agent_assignments(id) ON DELETE CASCADE;


--
-- Name: canvas_comments canvas_comments_canvas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_comments
    ADD CONSTRAINT canvas_comments_canvas_id_fkey FOREIGN KEY (canvas_id) REFERENCES public.canvases(id) ON DELETE CASCADE;


--
-- Name: canvas_comments canvas_comments_frame_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_comments
    ADD CONSTRAINT canvas_comments_frame_id_fkey FOREIGN KEY (frame_id) REFERENCES public.canvas_frames(id) ON DELETE SET NULL;


--
-- Name: canvas_frames canvas_frames_canvas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_frames
    ADD CONSTRAINT canvas_frames_canvas_id_fkey FOREIGN KEY (canvas_id) REFERENCES public.canvases(id) ON DELETE CASCADE;


--
-- Name: canvas_presence canvas_presence_canvas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_presence
    ADD CONSTRAINT canvas_presence_canvas_id_fkey FOREIGN KEY (canvas_id) REFERENCES public.canvases(id) ON DELETE CASCADE;


--
-- Name: canvas_presence canvas_presence_frame_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_presence
    ADD CONSTRAINT canvas_presence_frame_id_fkey FOREIGN KEY (frame_id) REFERENCES public.canvas_frames(id) ON DELETE SET NULL;


--
-- Name: canvases canvases_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvases
    ADD CONSTRAINT canvases_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: canvases canvases_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvases
    ADD CONSTRAINT canvases_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: canvases canvases_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvases
    ADD CONSTRAINT canvases_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
--
-- Name: company_invitations company_invitations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_invitations
    ADD CONSTRAINT company_invitations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_members company_members_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: convene_sessions convene_sessions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convene_sessions
    ADD CONSTRAINT convene_sessions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: convene_transcript convene_transcript_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convene_transcript
    ADD CONSTRAINT convene_transcript_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.convene_sessions(id) ON DELETE CASCADE;


--
-- Name: convening_info convening_info_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convening_info
    ADD CONSTRAINT convening_info_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: email_sequence_counters email_sequence_counters_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_counters
    ADD CONSTRAINT email_sequence_counters_conversation_id_fkey FOREIGN KEY (conversation_id, company_id) REFERENCES public.conversations(id, company_id) ON DELETE CASCADE;


--
-- Name: conversation_mutes conversation_mutes_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_mutes
    ADD CONSTRAINT conversation_mutes_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_reads conversation_reads_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_reads
    ADD CONSTRAINT conversation_reads_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_source_exclusions conversation_source_exclusions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_source_exclusions
    ADD CONSTRAINT conversation_source_exclusions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_source_exclusions conversation_source_exclusions_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_source_exclusions
    ADD CONSTRAINT conversation_source_exclusions_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.knowledge_sources(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: course_invitation_acceptances course_invitation_acceptances_token_hash_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_invitation_acceptances
    ADD CONSTRAINT course_invitation_acceptances_token_hash_fkey FOREIGN KEY (token_hash) REFERENCES public.course_invitations(token_hash) ON DELETE CASCADE;


--
-- Name: course_invitations course_invitations_course_id_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_invitations
    ADD CONSTRAINT course_invitations_course_id_company_id_fkey FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE;


--
-- Name: course_members course_members_company_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_members
    ADD CONSTRAINT course_members_company_id_user_id_fkey FOREIGN KEY (company_id, user_id) REFERENCES public.company_members(company_id, user_id) ON DELETE CASCADE;


--
-- Name: course_members course_members_course_id_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_members
    ADD CONSTRAINT course_members_course_id_company_id_fkey FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE;


--
-- Name: courses courses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: courses courses_project_id_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_project_id_company_id_fkey FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id) ON DELETE CASCADE;


--
-- Name: courses courses_study_room_conversation_id_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_study_room_conversation_id_company_id_fkey FOREIGN KEY (study_room_conversation_id, company_id) REFERENCES public.conversations(id, company_id);


--
-- Name: document_mentions document_mentions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_mentions
    ADD CONSTRAINT document_mentions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_mention_deliveries document_mention_deliveries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_mention_deliveries
    ADD CONSTRAINT document_mention_deliveries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: document_mention_deliveries document_mention_deliveries_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_mention_deliveries
    ADD CONSTRAINT document_mention_deliveries_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_mention_deliveries document_mention_deliveries_project_id_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_mention_deliveries
    ADD CONSTRAINT document_mention_deliveries_project_id_company_id_fkey FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id) ON DELETE CASCADE;


--
-- Name: document_snapshots document_snapshots_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_snapshots
    ADD CONSTRAINT document_snapshots_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_updates document_updates_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_updates
    ADD CONSTRAINT document_updates_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: documents documents_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: documents documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: email_attachments email_attachments_message_scope_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_message_scope_fkey FOREIGN KEY (message_id, company_id, conversation_id) REFERENCES public.email_messages(message_id, company_id, conversation_id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_conversation_id_fkey FOREIGN KEY (conversation_id, company_id) REFERENCES public.conversations(id, company_id) ON DELETE CASCADE;


--
-- Name: eval_cases eval_cases_eval_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_cases
    ADD CONSTRAINT eval_cases_eval_run_id_fkey FOREIGN KEY (eval_run_id) REFERENCES public.eval_runs(id) ON DELETE CASCADE;


--
-- Name: eval_runs eval_runs_baseline_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_runs
    ADD CONSTRAINT eval_runs_baseline_run_id_fkey FOREIGN KEY (baseline_run_id) REFERENCES public.eval_runs(id) ON DELETE SET NULL;


--
-- Name: eval_stage_results eval_stage_results_eval_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_stage_results
    ADD CONSTRAINT eval_stage_results_eval_case_id_fkey FOREIGN KEY (eval_case_id) REFERENCES public.eval_cases(id) ON DELETE CASCADE;


--
-- Name: eval_stage_results eval_stage_results_eval_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_stage_results
    ADD CONSTRAINT eval_stage_results_eval_run_id_fkey FOREIGN KEY (eval_run_id) REFERENCES public.eval_runs(id) ON DELETE CASCADE;


--
-- Name: im_channel_bindings im_channel_bindings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.im_channel_bindings
    ADD CONSTRAINT im_channel_bindings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: im_poll_votes im_poll_votes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.im_poll_votes
    ADD CONSTRAINT im_poll_votes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: im_poll_votes im_poll_votes_poll_client_msg_no_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.im_poll_votes
    ADD CONSTRAINT im_poll_votes_poll_client_msg_no_fkey FOREIGN KEY (poll_client_msg_no) REFERENCES public.im_polls(poll_client_msg_no) ON DELETE CASCADE;


--
-- Name: im_polls im_polls_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.im_polls
    ADD CONSTRAINT im_polls_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: im_send_acceptances im_send_acceptances_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.im_send_acceptances
    ADD CONSTRAINT im_send_acceptances_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: knowledge_insight_bindings knowledge_insight_bindings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_insight_bindings
    ADD CONSTRAINT knowledge_insight_bindings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: knowledge_insight_bindings knowledge_insight_bindings_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_insight_bindings
    ADD CONSTRAINT knowledge_insight_bindings_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.knowledge_sources(id) ON DELETE CASCADE;


--
-- Name: knowledge_note_bindings knowledge_note_bindings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_note_bindings
    ADD CONSTRAINT knowledge_note_bindings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: knowledge_note_bindings knowledge_note_bindings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_note_bindings
    ADD CONSTRAINT knowledge_note_bindings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: knowledge_notebook_bindings knowledge_notebook_bindings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_notebook_bindings
    ADD CONSTRAINT knowledge_notebook_bindings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: knowledge_notebook_bindings knowledge_notebook_bindings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_notebook_bindings
    ADD CONSTRAINT knowledge_notebook_bindings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: knowledge_source_chat_sessions knowledge_source_chat_sessions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_source_chat_sessions
    ADD CONSTRAINT knowledge_source_chat_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: llm_calls llm_calls_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_calls
    ADD CONSTRAINT llm_calls_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: knowledge_source_chat_sessions knowledge_source_chat_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_source_chat_sessions
    ADD CONSTRAINT knowledge_source_chat_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: knowledge_source_chat_sessions knowledge_source_chat_sessions_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_source_chat_sessions
    ADD CONSTRAINT knowledge_source_chat_sessions_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.knowledge_sources(id) ON DELETE CASCADE;


--
-- Name: knowledge_source_jobs knowledge_source_jobs_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_source_jobs
    ADD CONSTRAINT knowledge_source_jobs_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.knowledge_sources(id) ON DELETE CASCADE;


--
-- Name: knowledge_sources knowledge_sources_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_sources
    ADD CONSTRAINT knowledge_sources_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: knowledge_sources knowledge_sources_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_sources
    ADD CONSTRAINT knowledge_sources_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: knowledge_sources knowledge_sources_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_sources
    ADD CONSTRAINT knowledge_sources_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_visits project_visits_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_visits
    ADD CONSTRAINT project_visits_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_identities user_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ws_tickets ws_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ws_tickets
    ADD CONSTRAINT ws_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Pulse teacher Agent, native learning, structured Canvas reports and
-- append-only IM read receipts. These are part of the immutable v1 schema;
-- Web and Worker processes never create or backfill them at runtime.
--

ALTER TABLE public.canvas_agent_assignments
    ADD COLUMN execution_role text DEFAULT 'specialist'::text NOT NULL,
    ADD COLUMN verifies_assignment_id text;

ALTER TABLE ONLY public.canvas_agent_assignments
    ADD CONSTRAINT canvas_assignment_execution_role_check
    CHECK (execution_role = ANY (ARRAY['specialist'::text, 'verifier'::text]));

ALTER TABLE ONLY public.canvas_agent_assignments
    ADD CONSTRAINT canvas_assignment_verifier_not_self_check
    CHECK ((verifies_assignment_id IS NULL) OR (verifies_assignment_id <> id));

ALTER TABLE ONLY public.canvas_agent_assignments
    ADD CONSTRAINT canvas_assignment_verifies_assignment_id_fkey
    FOREIGN KEY (verifies_assignment_id) REFERENCES public.canvas_agent_assignments(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.canvases
    ADD CONSTRAINT canvases_id_company_id_key UNIQUE (id, company_id);

ALTER TABLE ONLY public.canvas_agent_assignments
    ADD CONSTRAINT canvas_agent_assignments_id_canvas_id_key UNIQUE (id, canvas_id);

CREATE TABLE public.canvas_assignment_reports (
    id text PRIMARY KEY,
    company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    canvas_id text NOT NULL,
    assignment_id text,
    author_agent_id text NOT NULL,
    execution_role text NOT NULL,
    schema_version text DEFAULT 'learning_report_v1'::text NOT NULL,
    finding text NOT NULL,
    evidence_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    confidence double precision NOT NULL,
    unresolved jsonb DEFAULT '[]'::jsonb NOT NULL,
    next_step text,
    verifies_report_id text REFERENCES public.canvas_assignment_reports(id) ON DELETE SET NULL,
    disconfirming_checks jsonb DEFAULT '[]'::jsonb NOT NULL,
    verdict text,
    consumed_report_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    conflict_resolution jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT canvas_assignment_reports_execution_role_check
      CHECK (execution_role = ANY (ARRAY['specialist'::text, 'verifier'::text, 'reporter'::text])),
    CONSTRAINT canvas_assignment_reports_schema_version_check
      CHECK (schema_version = 'learning_report_v1'::text),
    CONSTRAINT canvas_assignment_reports_confidence_check CHECK ((confidence >= 0) AND (confidence <= 1)),
    CONSTRAINT canvas_assignment_reports_verdict_check
      CHECK ((verdict IS NULL) OR (verdict = ANY (ARRAY['supported'::text, 'rejected'::text, 'inconclusive'::text]))),
    CONSTRAINT canvas_assignment_reports_canvas_company_fkey
      FOREIGN KEY (canvas_id, company_id) REFERENCES public.canvases(id, company_id) ON DELETE CASCADE,
    CONSTRAINT canvas_assignment_reports_assignment_canvas_fkey
      FOREIGN KEY (assignment_id, canvas_id) REFERENCES public.canvas_agent_assignments(id, canvas_id) ON DELETE CASCADE,
    CONSTRAINT canvas_assignment_reports_author_company_fkey
      FOREIGN KEY (author_agent_id, company_id) REFERENCES public.participants(id, company_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_canvas_report_assignment
    ON public.canvas_assignment_reports USING btree (assignment_id) WHERE (assignment_id IS NOT NULL);
CREATE INDEX idx_canvas_reports_canvas
    ON public.canvas_assignment_reports USING btree (company_id, canvas_id, created_at);

ALTER TABLE public.agent_work_items
    ADD COLUMN execution_role text DEFAULT 'specialist'::text NOT NULL,
    ADD COLUMN progress_fingerprint text,
    ADD COLUMN no_progress_count integer DEFAULT 0 NOT NULL;

ALTER TABLE ONLY public.agent_work_items
    ADD CONSTRAINT agent_work_execution_role_check
    CHECK (execution_role = ANY (ARRAY['coordinator'::text, 'specialist'::text, 'verifier'::text, 'reporter'::text]));

ALTER TABLE public.agent_os_approvals
    ADD COLUMN requested_by text,
    ADD COLUMN scope jsonb DEFAULT '{}'::jsonb NOT NULL,
    ADD COLUMN preview jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE TABLE public.im_read_receipt_advances (
    company_id text NOT NULL,
    channel_id text NOT NULL,
    reader_id text NOT NULL,
    previous_read_seq bigint NOT NULL,
    read_through_seq bigint NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (company_id, channel_id, reader_id, read_through_seq),
    CONSTRAINT im_read_receipt_monotonic_check
      CHECK ((previous_read_seq >= 0) AND (read_through_seq > previous_read_seq)),
    CONSTRAINT im_read_receipt_channel_company_fkey
      FOREIGN KEY (channel_id, company_id) REFERENCES public.conversations(id, company_id) ON DELETE CASCADE,
    CONSTRAINT im_read_receipt_reader_company_fkey
      FOREIGN KEY (company_id, reader_id) REFERENCES public.company_members(company_id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_im_read_receipt_range
    ON public.im_read_receipt_advances USING btree (company_id, channel_id, previous_read_seq, read_through_seq);
CREATE INDEX idx_im_read_receipt_reader
    ON public.im_read_receipt_advances USING btree (company_id, reader_id, read_at DESC);

CREATE TABLE public.learning_project_teacher_agents (
    project_id text PRIMARY KEY,
    company_id text NOT NULL,
    agent_id text NOT NULL,
    preset_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (company_id, agent_id),
    CONSTRAINT learning_project_teacher_agents_project_company_fkey
      FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id) ON DELETE CASCADE,
    CONSTRAINT learning_project_teacher_agents_agent_company_fkey
      FOREIGN KEY (agent_id, company_id) REFERENCES public.participants(id, company_id) ON DELETE RESTRICT
);

CREATE INDEX idx_learning_project_teacher_agents_company
    ON public.learning_project_teacher_agents USING btree (company_id, project_id);

CREATE TABLE public.learning_course_teacher_rooms (
    course_id text PRIMARY KEY,
    company_id text NOT NULL,
    conversation_id text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    UNIQUE (conversation_id),
    CONSTRAINT learning_course_teacher_rooms_status_check
      CHECK (status = ANY (ARRAY['active'::text, 'closed'::text])),
    CONSTRAINT learning_course_teacher_rooms_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE,
    CONSTRAINT learning_course_teacher_rooms_conversation_company_fkey
      FOREIGN KEY (conversation_id, company_id) REFERENCES public.conversations(id, company_id) ON DELETE CASCADE
);

CREATE INDEX idx_learning_course_teacher_rooms_status
    ON public.learning_course_teacher_rooms USING btree (company_id, status, course_id);

-- The canonical Study Room lives on courses.study_room_conversation_id.
-- This table intentionally stores only additional Lab/Discussion bindings.
CREATE TABLE public.learning_course_rooms (
    course_id text NOT NULL,
    company_id text NOT NULL,
    conversation_id text NOT NULL,
    purpose text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (course_id, conversation_id),
    UNIQUE (conversation_id),
    CONSTRAINT learning_course_rooms_purpose_check
      CHECK (purpose = ANY (ARRAY['lab'::text, 'discussion'::text])),
    CONSTRAINT learning_course_rooms_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE,
    CONSTRAINT learning_course_rooms_conversation_company_fkey
      FOREIGN KEY (conversation_id, company_id) REFERENCES public.conversations(id, company_id) ON DELETE CASCADE,
    CONSTRAINT learning_course_rooms_creator_company_fkey
      FOREIGN KEY (company_id, created_by) REFERENCES public.company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.learning_objectives (
    id text PRIMARY KEY,
    course_id text NOT NULL,
    company_id text NOT NULL,
    title text NOT NULL,
    success_criteria text NOT NULL,
    target_level integer DEFAULT 3 NOT NULL,
    position double precision DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (id, course_id),
    CONSTRAINT learning_objectives_target_level_check CHECK ((target_level >= 1) AND (target_level <= 4)),
    CONSTRAINT learning_objectives_status_check
      CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])),
    CONSTRAINT learning_objectives_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE
);

CREATE INDEX idx_learning_objectives_course
    ON public.learning_objectives USING btree (company_id, course_id, status, position);

CREATE TABLE public.learning_objective_dependencies (
    objective_id text NOT NULL REFERENCES public.learning_objectives(id) ON DELETE CASCADE,
    prerequisite_objective_id text NOT NULL REFERENCES public.learning_objectives(id) ON DELETE CASCADE,
    PRIMARY KEY (objective_id, prerequisite_objective_id),
    CONSTRAINT learning_objective_dependencies_not_self_check CHECK (objective_id <> prerequisite_objective_id)
);

CREATE TABLE public.learning_activities (
    id text PRIMARY KEY,
    course_id text NOT NULL,
    company_id text NOT NULL,
    title text NOT NULL,
    instructions text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    evaluation_mode text DEFAULT 'teacher_required'::text NOT NULL,
    target_level integer DEFAULT 2 NOT NULL,
    rubric jsonb DEFAULT '[]'::jsonb NOT NULL,
    objective_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    due_at timestamp with time zone,
    created_by text NOT NULL,
    published_by text,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_activities_type_check
      CHECK (type = ANY (ARRAY['lesson'::text, 'practice'::text, 'assessment'::text, 'project'::text, 'review'::text])),
    CONSTRAINT learning_activities_status_check
      CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text])),
    CONSTRAINT learning_activities_evaluation_mode_check
      CHECK (evaluation_mode = ANY (ARRAY['agent_formative'::text, 'teacher_required'::text])),
    CONSTRAINT learning_activities_target_level_check CHECK ((target_level >= 1) AND (target_level <= 4)),
    CONSTRAINT learning_activities_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE
);

CREATE INDEX idx_learning_activities_course
    ON public.learning_activities USING btree (company_id, course_id, status, due_at);

CREATE TABLE public.learning_missions (
    id text PRIMARY KEY,
    course_id text NOT NULL,
    company_id text NOT NULL,
    learner_id text NOT NULL,
    conversation_id text NOT NULL,
    trigger_client_msg_no text NOT NULL,
    goal text NOT NULL,
    success_criteria text NOT NULL,
    mission_kind text DEFAULT 'study'::text NOT NULL,
    coordinator_agent_id text,
    status text DEFAULT 'planning'::text NOT NULL,
    created_by text NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (course_id, learner_id, conversation_id, trigger_client_msg_no),
    CONSTRAINT learning_missions_kind_check
      CHECK (mission_kind = ANY (ARRAY['study'::text, 'research'::text, 'project'::text])),
    CONSTRAINT learning_missions_status_check
      CHECK (status = ANY (ARRAY['planning'::text, 'active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])),
    CONSTRAINT learning_missions_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE,
    CONSTRAINT learning_missions_learner_company_fkey
      FOREIGN KEY (company_id, learner_id) REFERENCES public.company_members(company_id, user_id) ON DELETE CASCADE,
    CONSTRAINT learning_missions_conversation_company_fkey
      FOREIGN KEY (conversation_id, company_id) REFERENCES public.conversations(id, company_id) ON DELETE CASCADE
);

CREATE INDEX idx_learning_missions_learner
    ON public.learning_missions USING btree (company_id, course_id, learner_id, status, updated_at DESC);

CREATE TABLE public.learning_mission_steps (
    id text PRIMARY KEY,
    mission_id text NOT NULL REFERENCES public.learning_missions(id) ON DELETE CASCADE,
    type text NOT NULL,
    description text NOT NULL,
    success_criteria text NOT NULL,
    objective_id text REFERENCES public.learning_objectives(id) ON DELETE SET NULL,
    status text DEFAULT 'open'::text NOT NULL,
    position double precision DEFAULT 0 NOT NULL,
    outcome text,
    completion_report_id text REFERENCES public.canvas_assignment_reports(id) ON DELETE SET NULL,
    completion_attempt_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_mission_steps_type_check
      CHECK (type = ANY (ARRAY['learn'::text, 'practice'::text, 'check'::text, 'reflect'::text])),
    CONSTRAINT learning_mission_steps_status_check
      CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]))
);

CREATE INDEX idx_learning_mission_steps
    ON public.learning_mission_steps USING btree (mission_id, position);

CREATE TABLE public.learning_attempts (
    id text PRIMARY KEY,
    course_id text NOT NULL,
    company_id text NOT NULL,
    learner_id text NOT NULL,
    activity_id text REFERENCES public.learning_activities(id) ON DELETE SET NULL,
    mission_step_id text REFERENCES public.learning_mission_steps(id) ON DELETE SET NULL,
    assistance text DEFAULT 'none'::text NOT NULL,
    evidence jsonb NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    client_submission_id text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_attempts_single_source_check CHECK (num_nonnulls(activity_id, mission_step_id) = 1),
    CONSTRAINT learning_attempts_assistance_check
      CHECK (assistance = ANY (ARRAY['none'::text, 'hint'::text, 'guided'::text])),
    CONSTRAINT learning_attempts_status_check
      CHECK (status = ANY (ARRAY['submitted'::text, 'evaluated'::text, 'rejected'::text])),
    CONSTRAINT learning_attempts_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE,
    CONSTRAINT learning_attempts_learner_company_fkey
      FOREIGN KEY (company_id, learner_id) REFERENCES public.company_members(company_id, user_id) ON DELETE CASCADE
);

ALTER TABLE ONLY public.learning_mission_steps
    ADD CONSTRAINT learning_step_completion_attempt_fkey
    FOREIGN KEY (completion_attempt_id) REFERENCES public.learning_attempts(id) ON DELETE SET NULL;

CREATE INDEX idx_learning_attempts_learner
    ON public.learning_attempts USING btree (company_id, course_id, learner_id, submitted_at DESC);

CREATE UNIQUE INDEX uniq_learning_activity_submission
    ON public.learning_attempts USING btree (company_id, course_id, activity_id, learner_id, client_submission_id)
    WHERE client_submission_id IS NOT NULL;

CREATE TABLE public.learning_evaluations (
    id text PRIMARY KEY,
    attempt_id text NOT NULL REFERENCES public.learning_attempts(id) ON DELETE CASCADE,
    demonstrated_level integer NOT NULL,
    confidence double precision NOT NULL,
    rubric_results jsonb DEFAULT '[]'::jsonb NOT NULL,
    feedback text DEFAULT ''::text NOT NULL,
    evaluator_id text NOT NULL,
    evaluator_kind text NOT NULL,
    source_report_id text REFERENCES public.canvas_assignment_reports(id) ON DELETE SET NULL,
    verifier_report_id text REFERENCES public.canvas_assignment_reports(id) ON DELETE SET NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    review_reason text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_evaluations_level_check CHECK ((demonstrated_level >= 0) AND (demonstrated_level <= 4)),
    CONSTRAINT learning_evaluations_confidence_check CHECK ((confidence >= 0) AND (confidence <= 1)),
    CONSTRAINT learning_evaluations_evaluator_kind_check
      CHECK (evaluator_kind = ANY (ARRAY['agent'::text, 'teacher'::text])),
    CONSTRAINT learning_evaluations_status_check
      CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text]))
);

CREATE INDEX idx_learning_evaluations_review
    ON public.learning_evaluations USING btree (status, created_at) WHERE (status = 'pending'::text);

CREATE TABLE public.learning_mastery (
    course_id text NOT NULL,
    company_id text NOT NULL,
    learner_id text NOT NULL,
    objective_id text NOT NULL REFERENCES public.learning_objectives(id) ON DELETE CASCADE,
    level integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'learning'::text NOT NULL,
    independent_evidence_count integer DEFAULT 0 NOT NULL,
    review_interval_days integer DEFAULT 1 NOT NULL,
    next_review_at timestamp with time zone,
    version bigint DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (course_id, learner_id, objective_id),
    CONSTRAINT learning_mastery_level_check CHECK ((level >= 0) AND (level <= 4)),
    CONSTRAINT learning_mastery_status_check
      CHECK (status = ANY (ARRAY['learning'::text, 'verified'::text, 'needs_review'::text])),
    CONSTRAINT learning_mastery_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE,
    CONSTRAINT learning_mastery_learner_company_fkey
      FOREIGN KEY (company_id, learner_id) REFERENCES public.company_members(company_id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_learning_mastery_due
    ON public.learning_mastery USING btree (company_id, learner_id, next_review_at) WHERE (next_review_at IS NOT NULL);

CREATE TABLE public.learning_mastery_events (
    id text PRIMARY KEY,
    course_id text NOT NULL,
    company_id text NOT NULL,
    learner_id text NOT NULL,
    objective_id text NOT NULL REFERENCES public.learning_objectives(id) ON DELETE CASCADE,
    evaluation_id text REFERENCES public.learning_evaluations(id) ON DELETE SET NULL,
    previous_level integer NOT NULL,
    next_level integer NOT NULL,
    kind text NOT NULL,
    reason text NOT NULL,
    actor_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_mastery_events_kind_check
      CHECK (kind = ANY (ARRAY['evidence'::text, 'teacher_override'::text, 'review_flag'::text])),
    CONSTRAINT learning_mastery_events_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE
);

CREATE INDEX idx_learning_mastery_events
    ON public.learning_mastery_events USING btree (company_id, course_id, learner_id, objective_id, created_at DESC);

CREATE TABLE public.learning_notification_preferences (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    user_id text NOT NULL,
    course_id text,
    in_app_enabled boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT false NOT NULL,
    timezone text DEFAULT 'Asia/Shanghai'::text NOT NULL,
    preferred_time time without time zone DEFAULT '19:00:00'::time without time zone NOT NULL,
    quiet_start time without time zone,
    quiet_end time without time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_notification_preferences_member_company_fkey
      FOREIGN KEY (company_id, user_id) REFERENCES public.company_members(company_id, user_id) ON DELETE CASCADE,
    CONSTRAINT learning_notification_preferences_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_learning_notification_preferences_global
    ON public.learning_notification_preferences USING btree (company_id, user_id) WHERE (course_id IS NULL);
CREATE UNIQUE INDEX uq_learning_notification_preferences_course
    ON public.learning_notification_preferences USING btree (company_id, user_id, course_id) WHERE (course_id IS NOT NULL);

CREATE TABLE public.learning_notification_deliveries (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    user_id text NOT NULL,
    course_id text,
    channel text NOT NULL,
    kind text NOT NULL,
    digest_date date NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    sent_at timestamp with time zone,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_token text,
    lease_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_notification_deliveries_channel_check
      CHECK (channel = ANY (ARRAY['in_app'::text, 'email'::text])),
    CONSTRAINT learning_notification_deliveries_kind_check
      CHECK (kind = ANY (ARRAY['review_due'::text, 'grading_queue'::text])),
    CONSTRAINT learning_notification_deliveries_status_check
      CHECK (status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])),
    CONSTRAINT learning_notification_deliveries_member_company_fkey
      FOREIGN KEY (company_id, user_id) REFERENCES public.company_members(company_id, user_id) ON DELETE CASCADE,
    CONSTRAINT learning_notification_deliveries_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_learning_deliveries_global
    ON public.learning_notification_deliveries USING btree (company_id, user_id, channel, kind, digest_date)
    WHERE (course_id IS NULL);
CREATE UNIQUE INDEX uq_learning_deliveries_course
    ON public.learning_notification_deliveries USING btree (company_id, user_id, course_id, channel, kind, digest_date)
    WHERE (course_id IS NOT NULL);
CREATE INDEX idx_learning_notification_pending
    ON public.learning_notification_deliveries USING btree (status, available_at, created_at)
    WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));

CREATE TABLE public.learning_effects (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    course_id text NOT NULL,
    kind text NOT NULL,
    effect_key text DEFAULT 'singleton'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    queued_payload jsonb,
    generation integer DEFAULT 1 NOT NULL,
    queued_generation integer,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_token text,
    lease_expires_at timestamp with time zone,
    error text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_effects_kind_check CHECK (kind = ANY (ARRAY[
      'study_room.sync'::text, 'teacher_room.sync'::text, 'teacher_agent.welcome'::text,
      'notebook.ensure'::text, 'course_metadata.sync'::text, 'course_archive.sync'::text,
      'member_access.revoke'::text, 'member_onboarding.seed'::text
    ])),
    CONSTRAINT learning_effects_status_check CHECK (status = ANY (ARRAY[
      'pending'::text, 'processing'::text, 'completed'::text, 'failed'::text
    ])),
    CONSTRAINT learning_effects_course_company_fkey
      FOREIGN KEY (course_id, company_id) REFERENCES public.courses(id, company_id) ON DELETE CASCADE,
    CONSTRAINT learning_effects_attempts_check CHECK (attempts >= 0),
    CONSTRAINT learning_effects_generation_check CHECK (
      generation > 0 AND (queued_generation IS NULL OR queued_generation > generation)
    ),
    CONSTRAINT learning_effects_effect_identity_key UNIQUE(company_id, course_id, kind, effect_key)
);

CREATE INDEX idx_learning_effects_pending
    ON public.learning_effects USING btree (status, available_at, created_at)
    WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));

CREATE TABLE public.company_onboarding_effects (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    member_id text NOT NULL,
    kind text DEFAULT 'member_directs.seed'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_token text,
    lease_expires_at timestamp with time zone,
    error text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_onboarding_effects_kind_check CHECK (kind = 'member_directs.seed'::text),
    CONSTRAINT company_onboarding_effects_status_check CHECK (status = ANY (ARRAY[
      'pending'::text, 'processing'::text, 'completed'::text, 'failed'::text
    ])),
    CONSTRAINT company_onboarding_effects_attempts_check CHECK (attempts >= 0),
    CONSTRAINT company_onboarding_effects_lease_check CHECK (
      (status = 'processing'::text) = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    ),
    CONSTRAINT company_onboarding_effects_member_fkey
      FOREIGN KEY (company_id, member_id) REFERENCES public.company_members(company_id, user_id) ON DELETE CASCADE,
    CONSTRAINT company_onboarding_effects_identity_key UNIQUE(company_id, member_id, kind)
);

CREATE INDEX idx_company_onboarding_effects_due
    ON public.company_onboarding_effects USING btree (status, available_at, created_at)
    WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text, 'processing'::text]));


-- Written last so a failed or partial bootstrap is never accepted as v1.
COMMENT ON SCHEMA public IS 'LingxiLoop schema v1';


--
-- PostgreSQL database dump complete
--
