/** Narrow GitHub Actions OIDC bridge to the existing production mail transport. */
const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'https://admin.lingxilearn.cn/api/internal/issue-dot-email';
const REPO = 'LingXi-Org/LingxiLoop';
const WORKFLOW = `${REPO}/.github/workflows/issue-dot-email.yml@refs/heads/main`;
const SUBJECTS = new Set([
  `repo:${REPO}:environment:production`,
  'repo:LingXi-Org@306189337/LingxiLoop@1338634622:environment:production',
]);
type Claims = Record<string, unknown>;
type Jwk = JsonWebKey & { kid?: string; use?: string; alg?: string };
let jwksCache: { keys: Jwk[]; expires: number } | undefined;
class AuthError extends Error {}
class UnavailableError extends Error {}

function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function decode(part: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new AuthError();
  const value = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - part.length % 4) % 4));
  return Uint8Array.from(value, character => character.charCodeAt(0));
}

async function keys(): Promise<Jwk[]> {
  if (jwksCache && jwksCache.expires > Date.now()) return jwksCache.keys;
  try {
    const result = await fetch(`${ISSUER}/.well-known/jwks`, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!result.ok) throw new UnavailableError();
    const raw = await result.text();
    if (raw.length > 100_000) throw new UnavailableError();
    const body = JSON.parse(raw);
    if (!Array.isArray(body.keys) || !body.keys.length || body.keys.length > 30) throw new UnavailableError();
    jwksCache = { keys: body.keys, expires: Date.now() + 300_000 };
    return jwksCache.keys;
  } catch { throw new UnavailableError(); }
}

async function authenticate(request: Request): Promise<Claims> {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 20_000) throw new AuthError();
  const token = authorization.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError();
  let header: Claims;
  let claims: Claims;
  try {
    header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(parts[0])));
    claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(parts[1])));
  } catch { throw new AuthError(); }
  if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit !== undefined) throw new AuthError();
  const candidates = (await keys()).filter(key => key.kid === header.kid && key.kty === 'RSA'
    && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
  if (candidates.length !== 1) throw new AuthError();
  try {
    const key = await crypto.subtle.importKey('jwk', candidates[0], { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new AuthError();
  } catch { throw new AuthError(); }
  const now = Date.now() / 1000;
  const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  if (!validTime(claims.exp) || !validTime(claims.nbf) || !validTime(claims.iat)
    || claims.exp < now - 30 || claims.nbf > now + 30 || claims.iat > now + 30
    || claims.exp <= claims.iat || claims.nbf > claims.exp) throw new AuthError();
  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE || claims.repository !== REPO
    || claims.repository_id !== '1338634622' || claims.repository_owner_id !== '306189337'
    || claims.ref !== 'refs/heads/main' || claims.workflow_ref !== WORKFLOW
    || claims.environment !== 'production' || typeof claims.sub !== 'string' || !SUBJECTS.has(claims.sub)
    || typeof claims.run_id !== 'string' || !/^[1-9][0-9]*$/.test(claims.run_id)
    || !['issues', 'issue_comment', 'workflow_dispatch', 'push'].includes(String(claims.event_name))) throw new AuthError();
  return claims;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export async function handleIssueDotEmail(
  request: Request,
  env: { ALIYUN_OTP_EMAIL_PASSWORD: string },
  send: (account: { address: string; password: string }, message: { to: string; subject: string; html: string }) => Promise<void>,
): Promise<Response> {
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
  let claims: Claims;
  try { claims = await authenticate(request); }
  catch (error) {
    return error instanceof UnavailableError
      ? response(503, { error: 'identity_service_unavailable' })
      : response(401, { error: 'unauthorized' });
  }
  let body: Claims;
  try {
    // Python's JSON encoder may escape each Chinese character as six ASCII bytes.
    if (Number(request.headers.get('content-length') || 0) > 1_000_000) throw new Error();
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_000_000) throw new Error();
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch { return response(400, { error: 'invalid_payload' }); }
  if (!env.ALIYUN_OTP_EMAIL_PASSWORD?.trim()) return response(503, { error: 'mail_binding_unavailable' });
  if (body.mode === 'probe') return response(200, { ready: true, provider: 'control-plane-smtp' });
  if (claims.event_name === 'push') return response(403, { error: 'probe_only_event' });
  const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (body.mode !== 'dispatch' || !positiveInteger(body.issue_number) || !positiveInteger(body.issue_id)
    || typeof body.idempotency_key !== 'string' || !/^lingxiloop-dot-[a-f0-9]{64}$/.test(body.idempotency_key)
    || typeof body.subject !== 'string' || body.subject.length > 500
    || !body.subject.startsWith(`[LingxiLoop Dot] #${body.issue_number} `)
    || Array.from(body.subject).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 150_000) return response(400, { error: 'invalid_payload' });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${REPO}:${body.issue_id}:v1`));
  const expectedKey = 'lingxiloop-dot-' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (body.idempotency_key !== expectedKey) return response(400, { error: 'invalid_idempotency_key' });
  // The caller owns per-issue concurrency and receipts. SMTP has no idempotency primitive.
  try {
    await send({ address: 'no-reply@lingxilearn.cn', password: env.ALIYUN_OTP_EMAIL_PASSWORD }, {
      to: 'yangyangli0426@gmail.com', subject: body.subject,
      html: `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(body.text)}</pre>`,
    });
  } catch { return response(502, { error: 'mail_transport_failed' }); }
  return response(200, { id: `smtp-${body.issue_id}-${claims.run_id}`, provider: 'control-plane-smtp' });
}
