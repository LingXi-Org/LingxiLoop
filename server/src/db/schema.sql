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
    company_id text DEFAULT 'personal'::text NOT NULL,
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
    token_count integer DEFAULT 0 NOT NULL,
    fingerprint text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    input_tokens integer DEFAULT 0 NOT NULL,
    cached_input_tokens integer DEFAULT 0 NOT NULL,
    cache_creation_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cost_usd double precision DEFAULT 0 NOT NULL,
    cost_estimated boolean DEFAULT true NOT NULL,
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
    cost_usd double precision DEFAULT 0 NOT NULL,
    cost_estimated boolean DEFAULT true NOT NULL,
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
    error text
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
    project_id text
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
    status text DEFAULT 'sent'::text NOT NULL,
    error text
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
    CONSTRAINT canvas_activity_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['user'::text, 'agent'::text])))
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
    origin text DEFAULT 'legacy'::text NOT NULL,
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
    starter_seeded_at timestamp with time zone,
    starter_dms_seeded_at timestamp with time zone,
    all_hands_conversation_id text,
    all_hands_seeded_at timestamp with time zone,
    starter_preset_version integer DEFAULT 0 NOT NULL,
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
-- Name: conversation_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_counters (
    conversation_id text NOT NULL,
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
    poll jsonb NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    wukong_message_id text,
    wukong_message_seq bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: llm_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_calls (
    id text NOT NULL,
    company_id text,
    agent_id text,
    run_id text,
    conversation_id text,
    purpose text NOT NULL,
    source text DEFAULT 'cloud'::text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    cached_input_tokens integer DEFAULT 0 NOT NULL,
    cache_creation_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    reasoning_tokens integer DEFAULT 0 NOT NULL,
    cost_usd double precision DEFAULT 0 NOT NULL,
    cost_estimated boolean DEFAULT true NOT NULL,
    measured boolean DEFAULT true NOT NULL,
    latency_ms integer,
    status text DEFAULT 'ok'::text NOT NULL,
    error text,
    extras jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: llm_calls_rollup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_calls_rollup (
    bucket_hour timestamp with time zone NOT NULL,
    company_id text,
    agent_id text,
    purpose text NOT NULL,
    model text NOT NULL,
    source text NOT NULL,
    calls bigint DEFAULT 0 NOT NULL,
    ok_calls bigint DEFAULT 0 NOT NULL,
    failed_calls bigint DEFAULT 0 NOT NULL,
    rate_limited_calls bigint DEFAULT 0 NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    cached_input_tokens bigint DEFAULT 0 NOT NULL,
    cache_creation_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    reasoning_tokens bigint DEFAULT 0 NOT NULL,
    cost_usd double precision DEFAULT 0 NOT NULL,
    cost_estimated boolean DEFAULT true NOT NULL
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    message_id text NOT NULL,
    user_id text NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id text
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id text NOT NULL,
    conversation_id text NOT NULL,
    author_id text NOT NULL,
    kind text NOT NULL,
    body text NOT NULL,
    sequence integer NOT NULL,
    reactions jsonb,
    tool jsonb,
    attachment jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    quoted_message_id text,
    mentioned_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    mention_all boolean DEFAULT false NOT NULL,
    idempotency_key text,
    company_id text,
    poll jsonb,
    handoff jsonb,
    approval jsonb
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
    email text
);


--
-- Name: poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.poll_votes (
    message_id text NOT NULL,
    voter_participant_id text NOT NULL,
    voter_kind text NOT NULL,
    option_id text NOT NULL,
    company_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: push_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_devices (
    id text NOT NULL,
    user_id text NOT NULL,
    platform text NOT NULL,
    token text NOT NULL,
    app_version text,
    device_model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled_at timestamp with time zone
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
-- Name: shipping_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_events (
    id text NOT NULL,
    company_id text NOT NULL,
    feature_id text,
    actor_id text,
    kind text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shipping_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_features (
    id text NOT NULL,
    company_id text NOT NULL,
    project_id text,
    conversation_id text,
    document_id text,
    board_card_id text,
    title text NOT NULL,
    problem text DEFAULT ''::text NOT NULL,
    desired_outcome text DEFAULT ''::text NOT NULL,
    contract_summary text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    risk_level text DEFAULT 'medium'::text NOT NULL,
    release_target text,
    builder_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT shipping_features_priority_check CHECK ((priority = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT shipping_features_risk_check CHECK ((risk_level = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT shipping_features_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'contract'::text, 'building'::text, 'verifying'::text, 'ready'::text, 'releasing'::text, 'watching'::text, 'learned'::text, 'paused'::text, 'archived'::text])))
);


--
-- Name: shipping_friction_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_friction_reports (
    id text NOT NULL,
    company_id text NOT NULL,
    feature_id text,
    conversation_id text,
    message_id text,
    reporter_id text,
    source text DEFAULT 'manual'::text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    frequency text DEFAULT 'once'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_key text,
    CONSTRAINT shipping_friction_frequency_check CHECK ((frequency = ANY (ARRAY['once'::text, 'occasional'::text, 'frequent'::text, 'constant'::text]))),
    CONSTRAINT shipping_friction_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT shipping_friction_status_check CHECK ((status = ANY (ARRAY['open'::text, 'triaged'::text, 'planned'::text, 'resolved'::text, 'dismissed'::text])))
);


--
-- Name: shipping_invariants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_invariants (
    id text NOT NULL,
    feature_id text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    kind text DEFAULT 'behavior'::text NOT NULL,
    required boolean DEFAULT true NOT NULL,
    "position" double precision DEFAULT 0 NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipping_invariants_kind_check CHECK ((kind = ANY (ARRAY['behavior'::text, 'architecture'::text, 'data'::text, 'security'::text, 'performance'::text, 'ux'::text, 'operability'::text])))
);


--
-- Name: shipping_regressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_regressions (
    id text NOT NULL,
    feature_id text NOT NULL,
    invariant_id text,
    source_verification_id text,
    title text NOT NULL,
    kind text DEFAULT 'automated'::text NOT NULL,
    command text,
    expected text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_result text,
    last_evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_run_at timestamp with time zone,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipping_regressions_kind_check CHECK ((kind = ANY (ARRAY['automated'::text, 'benchmark'::text, 'manual_replay'::text, 'monitor'::text]))),
    CONSTRAINT shipping_regressions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'passing'::text, 'failing'::text, 'disabled'::text])))
);


--
-- Name: shipping_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_releases (
    id text NOT NULL,
    feature_id text NOT NULL,
    environment text NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    version text,
    commit_sha text,
    started_by text,
    approved_by text,
    release_notes text DEFAULT ''::text NOT NULL,
    rollback_plan text DEFAULT ''::text NOT NULL,
    known_gaps jsonb DEFAULT '[]'::jsonb NOT NULL,
    baseline jsonb DEFAULT '[]'::jsonb NOT NULL,
    smoke_evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    readback_due_at timestamp with time zone,
    readback_status text DEFAULT 'pending'::text NOT NULL,
    readback_evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    rolled_back_at timestamp with time zone,
    rollback_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipping_releases_environment_check CHECK ((environment = ANY (ARRAY['development'::text, 'staging'::text, 'canary'::text, 'production'::text]))),
    CONSTRAINT shipping_releases_readback_check CHECK ((readback_status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'overdue'::text]))),
    CONSTRAINT shipping_releases_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'approved'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'rolled_back'::text])))
);


--
-- Name: shipping_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_verifications (
    id text NOT NULL,
    feature_id text NOT NULL,
    invariant_id text,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    method text DEFAULT 'user_path'::text NOT NULL,
    required boolean DEFAULT true NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    owner_id text,
    verified_by_id text,
    builder_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    "position" double precision DEFAULT 0 NOT NULL,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipping_verifications_method_check CHECK ((method = ANY (ARRAY['user_path'::text, 'property'::text, 'trace'::text, 'data_reconciliation'::text, 'design_qa'::text, 'security'::text, 'performance'::text, 'release_note'::text]))),
    CONSTRAINT shipping_verifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'passed'::text, 'failed'::text, 'waived'::text]))),
    CONSTRAINT shipping_verifier_not_builder CHECK (((verified_by_id IS NULL) OR (NOT (builder_ids ? verified_by_id))))
);


--
-- Name: tool_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_calls (
    id text NOT NULL,
    message_id text,
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
    tier text DEFAULT 'free'::text NOT NULL,
    sub2api_user_id bigint,
    sub2api_api_key text,
    pro_trial_expires_at timestamp with time zone,
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
    ADD CONSTRAINT agent_climate_pkey PRIMARY KEY (agent_id, about_id);


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
-- Name: conversation_counters conversation_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_counters
    ADD CONSTRAINT conversation_counters_pkey PRIMARY KEY (conversation_id);


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
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: participants participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id, company_id);


--
-- Name: poll_votes poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_pkey PRIMARY KEY (message_id, voter_participant_id, option_id);


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
-- Name: push_devices push_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_devices
    ADD CONSTRAINT push_devices_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: shipping_events shipping_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_events
    ADD CONSTRAINT shipping_events_pkey PRIMARY KEY (id);


--
-- Name: shipping_features shipping_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_features
    ADD CONSTRAINT shipping_features_pkey PRIMARY KEY (id);


--
-- Name: shipping_friction_reports shipping_friction_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_friction_reports
    ADD CONSTRAINT shipping_friction_reports_pkey PRIMARY KEY (id);


--
-- Name: shipping_invariants shipping_invariants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_invariants
    ADD CONSTRAINT shipping_invariants_pkey PRIMARY KEY (id);


--
-- Name: shipping_regressions shipping_regressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_regressions
    ADD CONSTRAINT shipping_regressions_pkey PRIMARY KEY (id);


--
-- Name: shipping_releases shipping_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_releases
    ADD CONSTRAINT shipping_releases_pkey PRIMARY KEY (id);


--
-- Name: shipping_verifications shipping_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_verifications
    ADD CONSTRAINT shipping_verifications_pkey PRIMARY KEY (id);


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
-- Name: idx_llm_calls_agent_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_calls_agent_created ON public.llm_calls USING btree (agent_id, created_at DESC) WHERE (agent_id IS NOT NULL);


--
-- Name: idx_llm_calls_company_purpose_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_calls_company_purpose_created ON public.llm_calls USING btree (company_id, purpose, created_at DESC);


--
-- Name: idx_llm_calls_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_calls_created ON public.llm_calls USING btree (created_at);


--
-- Name: idx_llm_calls_created_brin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_calls_created_brin ON public.llm_calls USING brin (created_at);


--
-- Name: idx_llm_calls_model_purpose_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_calls_model_purpose_created ON public.llm_calls USING btree (model, purpose, created_at DESC);


--
-- Name: idx_llm_calls_run_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_calls_run_created ON public.llm_calls USING btree (run_id, created_at) WHERE (run_id IS NOT NULL);


--
-- Name: idx_llm_rollup_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_rollup_bucket ON public.llm_calls_rollup USING btree (bucket_hour DESC);


--
-- Name: idx_llm_rollup_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_llm_rollup_key ON public.llm_calls_rollup USING btree (bucket_hour, company_id, agent_id, purpose, model, source) NULLS NOT DISTINCT;


--
-- Name: idx_messages_author_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_author_created ON public.messages USING btree (author_id, created_at DESC);


--
-- Name: idx_messages_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_company ON public.messages USING btree (company_id, created_at DESC);


--
-- Name: idx_messages_convo_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_convo_created ON public.messages USING btree (conversation_id, created_at);


--
-- Name: idx_messages_convo_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_convo_seq ON public.messages USING btree (conversation_id, sequence);


--
-- Name: idx_messages_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_messages_idempotency_key ON public.messages USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_messages_quoted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_quoted ON public.messages USING btree (quoted_message_id);


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
-- Name: idx_poll_votes_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_poll_votes_message ON public.poll_votes USING btree (message_id);


--
-- Name: idx_poll_votes_voter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_poll_votes_voter ON public.poll_votes USING btree (voter_participant_id);


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
-- Name: idx_push_devices_platform_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_push_devices_platform_token ON public.push_devices USING btree (platform, token);


--
-- Name: idx_push_devices_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_devices_user ON public.push_devices USING btree (user_id) WHERE (disabled_at IS NULL);


--
-- Name: idx_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_expires ON public.sessions USING btree (expires_at);


--
-- Name: idx_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);


--
-- Name: idx_shipping_events_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_events_feature ON public.shipping_events USING btree (feature_id, created_at);


--
-- Name: idx_shipping_features_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_features_company_status ON public.shipping_features USING btree (company_id, status, updated_at DESC);


--
-- Name: idx_shipping_features_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_features_project ON public.shipping_features USING btree (project_id, updated_at DESC) WHERE (project_id IS NOT NULL);


--
-- Name: idx_shipping_friction_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_friction_company ON public.shipping_friction_reports USING btree (company_id, status, severity, last_seen_at DESC);


--
-- Name: idx_shipping_friction_source_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_shipping_friction_source_key ON public.shipping_friction_reports USING btree (company_id, source_key) WHERE (source_key IS NOT NULL);


--
-- Name: idx_shipping_invariants_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_invariants_feature ON public.shipping_invariants USING btree (feature_id, "position");


--
-- Name: idx_shipping_regressions_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_regressions_feature ON public.shipping_regressions USING btree (feature_id, status, updated_at DESC);


--
-- Name: idx_shipping_regressions_source_verification; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_shipping_regressions_source_verification ON public.shipping_regressions USING btree (source_verification_id) WHERE (source_verification_id IS NOT NULL);


--
-- Name: idx_shipping_releases_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_releases_feature ON public.shipping_releases USING btree (feature_id, created_at DESC);


--
-- Name: idx_shipping_releases_readback; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_releases_readback ON public.shipping_releases USING btree (readback_status, readback_due_at) WHERE ((status = 'succeeded'::text) AND (environment = 'production'::text));


--
-- Name: idx_shipping_verifications_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_verifications_feature ON public.shipping_verifications USING btree (feature_id, "position");


--
-- Name: idx_shipping_verifications_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_verifications_owner ON public.shipping_verifications USING btree (owner_id, status, updated_at DESC) WHERE (owner_id IS NOT NULL);


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

CREATE UNIQUE INDEX uniq_email_messages_smtp_id ON public.email_messages USING btree (lower(smtp_message_id)) WHERE (smtp_message_id IS NOT NULL);


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
-- Name: agent_approvals agent_approvals_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_approvals
    ADD CONSTRAINT agent_approvals_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


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
-- Name: agent_handoffs agent_handoffs_result_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_handoffs
    ADD CONSTRAINT agent_handoffs_result_message_id_fkey FOREIGN KEY (result_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: agent_handoffs agent_handoffs_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_handoffs
    ADD CONSTRAINT agent_handoffs_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


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
-- Name: companies companies_all_hands_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_all_hands_conversation_id_fkey FOREIGN KEY (all_hands_conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


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
-- Name: conversation_counters conversation_counters_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_counters
    ADD CONSTRAINT conversation_counters_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


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
-- Name: email_attachments email_attachments_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: email_attachments email_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


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
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


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
-- Name: push_devices push_devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_devices
    ADD CONSTRAINT push_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shipping_events shipping_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_events
    ADD CONSTRAINT shipping_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: shipping_events shipping_events_feature_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_events
    ADD CONSTRAINT shipping_events_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.shipping_features(id) ON DELETE CASCADE;


--
-- Name: shipping_features shipping_features_board_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_features
    ADD CONSTRAINT shipping_features_board_card_id_fkey FOREIGN KEY (board_card_id) REFERENCES public.board_cards(id) ON DELETE SET NULL;


--
-- Name: shipping_features shipping_features_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_features
    ADD CONSTRAINT shipping_features_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: shipping_features shipping_features_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_features
    ADD CONSTRAINT shipping_features_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: shipping_features shipping_features_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_features
    ADD CONSTRAINT shipping_features_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: shipping_features shipping_features_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_features
    ADD CONSTRAINT shipping_features_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: shipping_friction_reports shipping_friction_reports_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_friction_reports
    ADD CONSTRAINT shipping_friction_reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: shipping_friction_reports shipping_friction_reports_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_friction_reports
    ADD CONSTRAINT shipping_friction_reports_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: shipping_friction_reports shipping_friction_reports_feature_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_friction_reports
    ADD CONSTRAINT shipping_friction_reports_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.shipping_features(id) ON DELETE SET NULL;


--
-- Name: shipping_invariants shipping_invariants_feature_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_invariants
    ADD CONSTRAINT shipping_invariants_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.shipping_features(id) ON DELETE CASCADE;


--
-- Name: shipping_regressions shipping_regressions_feature_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_regressions
    ADD CONSTRAINT shipping_regressions_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.shipping_features(id) ON DELETE CASCADE;


--
-- Name: shipping_regressions shipping_regressions_invariant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_regressions
    ADD CONSTRAINT shipping_regressions_invariant_id_fkey FOREIGN KEY (invariant_id) REFERENCES public.shipping_invariants(id) ON DELETE SET NULL;


--
-- Name: shipping_regressions shipping_regressions_source_verification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_regressions
    ADD CONSTRAINT shipping_regressions_source_verification_id_fkey FOREIGN KEY (source_verification_id) REFERENCES public.shipping_verifications(id) ON DELETE SET NULL;


--
-- Name: shipping_releases shipping_releases_feature_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_releases
    ADD CONSTRAINT shipping_releases_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.shipping_features(id) ON DELETE CASCADE;


--
-- Name: shipping_verifications shipping_verifications_feature_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_verifications
    ADD CONSTRAINT shipping_verifications_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.shipping_features(id) ON DELETE CASCADE;


--
-- Name: shipping_verifications shipping_verifications_invariant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_verifications
    ADD CONSTRAINT shipping_verifications_invariant_id_fkey FOREIGN KEY (invariant_id) REFERENCES public.shipping_invariants(id) ON DELETE SET NULL;


--
-- Name: tool_calls tool_calls_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_calls
    ADD CONSTRAINT tool_calls_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


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
-- PostgreSQL database dump complete
--
