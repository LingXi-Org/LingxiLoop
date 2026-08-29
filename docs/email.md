# Email — real external mail per agent

Every agent has a real address (`<participantId>.<companySlug>@<EMAIL_DOMAIN>`)
and can both send and receive mail. Agents use it via the `lingxiloop email …`
CLI subcommands (shelled through the engine's bash tool). Inbound mail
wakes the recipient agent like any other message; idle-heartbeat wakes
give a quiet agent the chance to decide on its own to send / reply /
start a thread.

## Architecture

```
┌──────────────┐  MIME    ┌────────────────────────┐  Svix-signed event  ┌──────────────────┐
│  Sender MTA  │ ───────► │  Resend Receiving     │ ──────────────────► │ lingxiloop-server│
│ (gmail, etc) │   MX     │  + Receiving API      │ POST /webhooks/     │ /webhooks/email  │
└──────────────┘          │                        │ email/resend        │ /resend          │
                          └────────────────────────┘                     └──────────────────┘
                                                                                 │
                                                                                 ▼ wakes the recipient agent
                                                                         ┌──────────────────┐
                                                                         │  Agent OS runs   │
                                                                         │  a learning      │
                                                                         │  turn, replies   │
                                                                         └──────────────────┘
                                                                                 │
                                                                                 ▼ lingxiloop email send/reply
                                                                         ┌──────────────────┐
                                                                         │  Resend HTTP API │
                                                                         └──────────────────┘
                                                                                 │
                                                                                 ▼ DKIM/SPF, MTA queue
                                                                         ┌──────────────────┐
                                                                         │  Recipient MTA   │
                                                                         └──────────────────┘
```

- **Inbound**: Resend Receiving emits a signed `email.received` event. The
  server verifies the raw request with the endpoint-specific Svix secret,
  retrieves the complete email and attachments through the Receiving API,
  resolves recipients to agents, and threads against
  In-Reply-To / References, writes one authoritative `email_messages` row,
  and publishes `CH_MESSAGE_NEW` so the recipient agent
  wakes through the existing scheduler.
- **Outbound**: Resend's HTTP API. If `RESEND_API_KEY` is absent, outbound
  mail is explicitly unavailable; production never fabricates delivery or a
  provider message id.

## Storage model

- One **conversation** per email thread (`conversations.kind = 'email'`).
- One **email_messages** row per individual email, storing author, body,
  thread sequence and the SMTP-level fields: `smtp_message_id` (RFC 5322 Message-ID without
  brackets), `in_reply_to`, `references_chain`, `direction` (`in`/`out`),
  `transport_status` (`queued`/`sent`/`failed`/`received`), `subject`,
  `from_addr`, `to_addrs`, `cc_addrs`. The `/conversations/:id/messages`
  endpoint projects this authoritative row into a typed `email` field on each
  message — the renderer never has to reason about JSONB shapes.
- An **email_contacts** table tracks external addresses we've corresponded
  with so the heartbeat prompt can suggest known recipients.

Threading rule: an inbound message threads under any existing conversation
whose `email_messages.smtp_message_id` matches its `In-Reply-To` or any
of its `References` ids. No match → new conversation, with the cleaned
subject as title.

## Address scheme

`<sanitized participantId>.<companySlug>@<EMAIL_DOMAIN>` — e.g.
`aurora.acme@mail.loop.example.com`. The `participants.email` column is filled
lazily the first time anything touches the agent's address; existing
agents pick up an address on their next email-related action.

Apex domain on purpose. Earlier iterations used per-tenant subdomains
(`aurora@acme.mail.loop.example.com`) but that meant verifying every new
`<slug>.mail.loop.example.com` at Resend with its own DKIM, which doesn't scale
without per-tenant automation that calls Resend's domain API + writes
DNS records. The dot-apex form keeps the visual structure
("`<who>` at `<where>`") while collapsing operational cost to a single
one-time apex setup. Tenant isolation is enforced in the recipient
resolver, not in DNS.

Local-part parsing back to `(id, slug)` is unambiguous because
`safeLocalPart` strips `.` from agent ids — the slug is always the
substring after the LAST `.` in the local-part.

Resend Receiving owns the domain-level MX boundary. Tenant isolation remains
inside the recipient resolver and every persisted message carries `companyId`.

## Setup

### 1. Server

Add to `.env`:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
EMAIL_DOMAIN=mail.loop.example.com
```

The `participants.email`, `email_messages`, and `email_contacts` tables are
part of the fixed v1 schema. Initialize a new empty database with
`npm run db:bootstrap` before starting the server.

### 2. Resend sending and receiving

1. Resend dashboard → API Keys → create one.
2. Add a dedicated receiving subdomain such as `mail.loop.example.com` and
   publish the MX records shown by Resend. Do not share it with another MX
   provider.
3. Configure the same domain for sending and publish Resend's SPF/DKIM records.
4. Add a webhook subscribing only to `email.received` with Endpoint
   `https://<api-host>/webhooks/email/resend`.
5. Copy that webhook's `whsec_...` secret into `RESEND_WEBHOOK_SECRET`.
   Development and production use separate webhooks and separate secrets.

### 4. Verify end-to-end

- Send mail to `<known-agent-id>.<company-slug>@mail.loop.example.com` from gmail.
- Resend Webhooks shows a successful `email.received` delivery.
- Server logs show the corresponding inbound delivery.
- The agent wakes within a few seconds. The agent's next turn sees
  the email in `lingxiloop email inbox` and decides whether to reply.

## Tests

The repo has two tiers of email tests:

### Unit (`npm test`)

Pure-function coverage — `sanitizeSubject`, `splitReplyAddresses`,
`sanitizeEmailHtml`, `parseAddress`, `normalizeMessageId`,
`computeAgentAddress`, Resend/Svix verification, Receiving API normalization,
and GC reconciliation (`pickOrphans`). No DB / Redis is needed.

### Integration (`npm run test:integration`)

End-to-end against a REAL Postgres + Redis. Skipped by default —
`INTEGRATION_DATABASE_URL` env var gates it. Setup:

```bash
# Pick whichever Postgres you have handy:
createdb lingxiloop_test
# or via Docker:
docker run -d --name pg-test -p 5433:5432 \
  -e POSTGRES_USER=lingxiloop -e POSTGRES_PASSWORD=lingxiloop \
  -e POSTGRES_DB=lingxiloop_test postgres:16-alpine

# Run the suite (the runner refuses to TRUNCATE non-test-looking URLs):
INTEGRATION_DATABASE_URL=postgres://lingxiloop:lingxiloop@localhost:5433/lingxiloop_test \
  npm run test:integration
```

Covers what unit tests can't:
- **Inbound webhook end-to-end** — Resend/Svix gate, recipient resolution
  against `participants.email`, `email_messages` + `email_attachments`
  row writes, idempotent dedup on a re-delivered Message-ID, acknowledged
  no-recipient events, and `Auto-Submitted` flag propagation.
- **Retry worker SQL** — `SELECT … FOR UPDATE SKIP LOCKED` claim,
  backoff progression (60s → 5m → 30m → 2h → 6h → 24h), terminal state
  with `next_retry_at=NULL` after the last step, inbound/sent rows
  correctly ignored.

The default suite leaves `RESEND_API_KEY` unset and injects a test-only
provider function for outbound cases. The seam is explicit per test and reset
after use; the production provider remains fail-closed and never manufactures
success. Tests use `node:test` + `tsx` — no new framework.

### Live Resend (`RESEND_LIVE_TEST=1`)

Opt-in integration test that exercises the real Resend HTTP path against the magic
sink addresses Resend provides for testing:

| Address | Behavior |
|---|---|
| `delivered@resend.dev` | API returns 200, no real delivery |
| `bounced@resend.dev`   | API returns 200, async bounce webhook |
| `complained@resend.dev`| API returns 200, async complaint webhook |

These addresses consume **zero quota** and never deliver to a real
recipient — safe to call on every CI run. Setup:

```bash
RESEND_LIVE_TEST=1 \
  RESEND_API_KEY=re_real_key \
  EMAIL_DOMAIN=your-verified-domain.com \
  INTEGRATION_DATABASE_URL=postgres://... \
  npm run test:integration
```

The harness refuses to enter live mode without both `RESEND_API_KEY` and
a `EMAIL_DOMAIN`; without `RESEND_LIVE_TEST=1` set the live specs
register as `skipped` rather than running. Sends carry a
`[LINGXILOOP-LIVE-TEST]` subject prefix so they're identifiable in the
Resend dashboard.

What live tests add beyond injected-provider integration:

- Real HTTP path to `api.resend.com` (TLS, headers, response parsing)
- Resend's validation of `From` / `Reply-To` / `In-Reply-To` /
  `References` / `attachments[]`
- The exact `provider_id` + `smtp_message_id` shapes we log + persist

What they can't catch: end-to-end MIME delivery (magic addresses don't
actually deliver) and bounce/complaint handling (those fire async via
webhook, not in the same request).

## Local dev (no real DNS)

For a real local end-to-end path, run
`cloudflared tunnel --url http://localhost:5181` and create a dedicated Resend
development webhook whose Endpoint is
`https://<generated-tunnel-host>/webhooks/email/resend`. Subscribe only to
`email.received`, copy its signing secret into `.env.local` as
`RESEND_WEBHOOK_SECRET`, and restart the API. A changed tunnel URL requires
updating the Resend development webhook; the secret belongs to that webhook
record, not to the URL or API key.

## Commands available to agents

```
lingxiloop email whoami                              # your address
lingxiloop email contacts                            # everyone you can write to
lingxiloop email inbox [--unread] [--limit N]        # your email threads
lingxiloop email show <conversation_id>              # full thread
lingxiloop email send --to <addr|id>[,...] [--cc ...] --subject "..." --body "..."
lingxiloop email reply <message_id> --body "..." [--cc ...]
```

`--to` and `--cc` accept either real addresses (`someone@example.com`) or
participant ids (`aurora`); ids are resolved against the agent's tenant.

## Heartbeat integration

`server/src/agents/idle.ts` runs every `IDLE_INTERVAL_MS` (default
15 min). Each tick picks one quiet agent per tenant and gives it a
synthetic idle wake through the normal turn loop — the scheduler never
decides what the agent should say. Before waking the brain, a cheap
classifier checks whether the agent has actionable Kanban cards or
current-slot Calendar events; if so, the wake carries a focused agenda
brief. Either way the turn has the full CLI available, so sending,
replying to, or starting an email thread is one of the actions the
agent can decide to take on its own.

Set `IDLE_INTERVAL_MS=0` (or `ENABLE_IDLE=false`) to disable the
heartbeat entirely without removing the email feature.
