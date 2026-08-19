# Security Policy

We take the security of LingxiLoop seriously. Thank you for helping keep it and
its users safe.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Report privately through **GitHub private vulnerability reporting** — go to the
   [Security tab](https://github.com/LingXi-Org/LingxiLoop/security) of this
   repository and click **Report a vulnerability**. This opens a private
   advisory visible only to you and the maintainers.

Please include:

- The type of issue (e.g. auth bypass, injection, XSS, privilege escalation).
- The affected component and file(s) — server API, agent runtime, the BYOA
  daemon (`agent-cli`), the Electron desktop shell, the Cloudflare workers, or
  the web client.
- Step-by-step reproduction, and a proof-of-concept if you have one.
- The impact you believe it has (what an attacker gains).

You'll get an acknowledgement as soon as we've seen the report. We'll keep you
updated on our assessment and a fix timeline, and we're happy to credit you
when the fix ships (let us know if you'd prefer to stay anonymous).

## Scope

In scope — anything that lets someone:

- Access another user's or tenant's data (cross-tenant isolation breaks).
- Act as another user or agent (authentication / identity-pinning bypass).
- Execute code or inject content (SQLi, command injection, stored/reflected
  XSS, deserialization).
- Escalate privileges (non-admin reaching admin surfaces).
- Recover secrets from the server, the client, or in transit.

Out of scope:

- Findings that require a misconfigured self-hosted deployment the code
  actively warns against — e.g. running in production with a dev-default
  secret. The server refuses to boot in that state on purpose
  (`AGENT_RUNTIME_SECRET`); a report that assumes it was forced past that gate
  is a configuration issue, not a vulnerability.
- Denial of service / volumetric abuse.
- Reports from automated scanners without a demonstrated, exploitable impact.
- Social engineering, physical access, or attacks requiring a
  compromised operator machine.

## The trust model, in one paragraph

The **server is the only trust boundary**. Every client — the web app, the
Electron shell, the mobile shell, and the BYOA daemon — is untrusted and must
have its input validated server-side. Agent identity on every `/runtime/*`
call is pinned from a signed JWT, never from the request body. Tenants are
isolated in SQL, not in the client. If you find a place where the server
trusts the client for any of these, that's a vulnerability we want to hear
about.

## Deploying LingxiLoop securely

If you self-host, at minimum:

- Set a high-entropy `AGENT_RUNTIME_SECRET` (`openssl rand -hex 32`). The
  server will refuse to start in production otherwise.
- Serve user-uploaded attachments from a **separate origin** (configure the
  `R2_*` variables) rather than the local-disk fallback, so a hostile upload
  can never run on the app's origin.
- Keep every other secret (OAuth client secrets, `RESEND_API_KEY`,
  `EMAIL_INBOUND_HMAC_SECRET`, `R2_URL_SIGNING_SECRET`, APNs/FCM credentials)
  out of the repo and in your deployment's secret store.

See [`.env.example`](.env.example) for the full annotated list.
