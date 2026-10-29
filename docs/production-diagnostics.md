# Tester production diagnostics MCP

Add a Streamable HTTP MCP server at `https://admin.lingxilearn.cn/api/mcp`,
authenticated with the tester's dedicated Bearer token. A diagnostic token
exposes only `lingxiloop_diagnostics`; administrator and mutation tools are not
registered for that credential. Client-side tool lists are not the security
boundary. Do not distribute administrator MCP, release, database, Cloudflare
or Sigillo production credentials.

The tool accepts these views:

| View | Arguments and result |
| --- | --- |
| `runs` | Run list; optional `status`, `search`, `companyId`, `cursor`, `limit` |
| `run` | `id`: one run and its diagnostic detail |
| `operations` | `id`, optional `afterSeq`: run operations and context failures |
| `llm-calls` | LLM call errors and timing; same list filters |
| `delivery-failures` | Delivery failures; same list filters except `status` |

Default list limit is 20, maximum 100. Operations can continue from the returned
event cursor. Existing resource validation applies. Responses redact sensitive
fields and configured credentials, are bounded and are not cached. Reads record
the credential ID in the control audit. Active administrator, ban-state,
business-link, allowed-Origin and upstream product authorization checks remain.

These keys authorize diagnostic reads across production tenants. Share only with
authorized testers. They cannot log in as an administrator, execute commands,
cancel/retry runs, change settings or deploy. Every diagnostic query maps to a
fixed upstream GET; arbitrary paths, methods, headers and redirects are rejected.

Operators configure `DIAGNOSTIC_KEYS_JSON` as an array of
`{ "id": "tester01", "sha256": "<64 lowercase hex characters>",
"expiresAt": "<UTC ISO timestamp>" }`. Generate 32 random bytes, encode them
as base64url, and form `diag.tester01.<random value>`. Hash the entire token
using SHA-256. Store plaintext only in the approved secret provider; the Worker
needs only hashes. Each key expires independently. Removing its entry revokes
it after the updated configuration is deployed. Redeploy the Worker and
verify live rejection before claiming a revocation is effective.

Give each tester one key through a private channel. Keep it in
`LINGXILOOP_DIAGNOSTIC_TOKEN`, never in a repository, URL, issue, log or shared
prompt. For Codex, the MCP config is:

```toml
[mcp_servers.lingxiloop_diagnostics]
url = "https://admin.lingxilearn.cn/api/mcp"
bearer_token_env_var = "LINGXILOOP_DIAGNOSTIC_TOKEN"
```

Short prompt to distribute separately from each tester's key:

> 请为你当前使用的 Agent 安装 LingxiLoop 只读 MCP：
> https://admin.lingxilearn.cn/api/mcp，使用我单独提供的测试密钥做 Bearer
> 认证，密钥放入 LINGXILOOP_DIAGNOSTIC_TOKEN，不要显示密钥或覆盖现有配置。
> 安装后验证连接并列出工具，应只有 lingxiloop_diagnostics；用它排查我指定的
> 生产问题。需要重新启动 Agent 才生效时告诉我。

Validation: `npm run control:test -- workers/control-plane/src/diagnostics.test.ts`
and `npm run control:typecheck`. Before distribution, verify real initialize,
tools/list, a diagnostic read and refusal of a known administrator tool against
the accepted production Worker. Local tests alone do not establish live access.
