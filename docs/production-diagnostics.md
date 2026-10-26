# Tester production diagnostics

`GET https://admin.lingxilearn.cn/api/diagnostics` accepts a dedicated
`Authorization: Bearer <diagnostic key>` header. It does not require MCP or a
Sigillo account. Do not distribute the administrator MCP, release, database,
Cloudflare or Sigillo production credentials.

Supported queries:

| Query | Result |
| --- | --- |
| `?view=runs&status=failed` | Agent runs (default limit 20, maximum 100) |
| `?view=run&id=RUN_ID` | One run and its diagnostic detail |
| `?view=operations&id=RUN_ID` | Run operations and context failures |
| `?view=llm-calls&status=failed` | LLM call errors and timing |
| `?view=delivery-failures` | Delivery failures |

List queries also accept `limit`, `search`, `companyId` and `cursor`, subject to
the existing resource validation. Detail queries accept `view` and `id`;
operations also accepts `afterSeq` to continue from a returned event cursor.
Responses redact sensitive fields and configured credentials, have a bounded
size and are not cached. Reads record the diagnostic credential ID in the
existing control audit. The underlying active administrator and product
authorization checks still apply.

These keys authorize diagnostic reads across production tenants. Share them
only with authorized testers. They cannot authenticate to MCP, log in as an
administrator, execute commands, cancel/retry runs, change settings or deploy.
The endpoint accepts GET only, rejects browser Origin headers, and cannot
forward arbitrary paths, methods, headers or redirects.

Operators configure `DIAGNOSTIC_KEYS_JSON` as an array of
`{ "id": "tester01", "sha256": "<64 lowercase hex characters>",
"expiresAt": "<UTC ISO timestamp>" }`. Generate 32 random bytes, encode them
as base64url, and form `diag.tester01.<random value>`. Hash the entire token
using SHA-256. Store plaintext keys only in the approved secret provider;
the Worker needs only hashes. Each entry expires independently. Removing its
entry revokes the key after the updated configuration is deployed. Use the
release controller and verify the new Worker version and HTTP denial before
claiming a revocation is effective.

Give each tester one key through the secret provider or another approved
private channel. Keep it in `LINGXILOOP_DIAGNOSTIC_TOKEN`, never in a repository,
URL, command argument, issue, log or shared prompt. Their agent can use a normal
HTTP client that reads the environment variable. A short onboarding prompt:

> 使用环境变量 LINGXILOOP_DIAGNOSTIC_TOKEN，通过 HTTPS GET 调用
> https://admin.lingxilearn.cn/api/diagnostics 排查我指定的生产问题。
> 将密钥放在 Authorization: Bearer 请求头，不要显示或保存密钥。
> 先查询 ?view=runs&status=failed，再按运行 ID 查询
> ?view=operations&id=运行ID；需要时查询 ?view=llm-calls&status=failed。
> 只报告错误证据和建议，不执行任何生产修改。

Validation: `npm run control:test -- workers/control-plane/src/diagnostics.test.ts`
and `npm run control:typecheck`. Before distribution, additionally verify a real
read, a denied POST and rejection of the same key at `/api/mcp` against the
accepted production Worker. Local checks alone do not establish live access.
