# Synthetic, task-owned local fixtures only. Use from a clean environment:
# env -i PATH="$PATH" HOME="$HOME" bash -c 'source docs/evidence/issue-389/integration-env.sh; node server/run-integration-tests.mjs --file organization-cases.test.ts --file case-covers.test.ts'
export NODE_ENV=test
export DOTENV_CONFIG_PATH="$PWD/artifacts/issue-389/__no_dotenv__"
export DATABASE_URL=postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_cases_auth_test
export INTEGRATION_DATABASE_URL="$DATABASE_URL"
export REDIS_URL=redis://127.0.0.1:56379/6
export OPENAI_API_KEY=isolated-cases-test
export OPENAI_BASE_URL=http://127.0.0.1:1/v1
export OPENAI_EMBEDDING_MODEL=disabled
export LINGXILOOP_DISABLE_EMBEDDINGS=1
export OPEN_NOTEBOOK_ENABLED=false
export RESEND_API_KEY=
export ALERT_WEBHOOK_URL=
export WUKONG_USER_TOKEN_SECRET=isolated-cases-test-secret
export LINGXILOOP_GATEWAY_HMAC_SECRET=isolated-cases-test-gateway
export LINGXILOOP_INVITE_BASE_URL=http://127.0.0.1:53108
export INTEGRATION_REPORT_PATH="$PWD/artifacts/issue-389/integration-results.json"
