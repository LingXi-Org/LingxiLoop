# Synthetic local task fixtures; run from repository root in a clean environment.
export NODE_ENV=test
export DOTENV_CONFIG_PATH=/workspace/LingxiLoop/artifacts/issue-449/__no_dotenv__
export DATABASE_URL=postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_cases_449_auth_test
export INTEGRATION_DATABASE_URL="$DATABASE_URL"
export REDIS_URL=redis://127.0.0.1:56379/8
export OPENAI_API_KEY=isolated-cases-449-test
export OPENAI_BASE_URL=http://127.0.0.1:1/v1
export OPENAI_EMBEDDING_MODEL=disabled
export LINGXILOOP_DISABLE_EMBEDDINGS=1
export OPEN_NOTEBOOK_ENABLED=false
export RESEND_API_KEY=
export ALERT_WEBHOOK_URL=
export WUKONG_USER_TOKEN_SECRET=isolated-cases-449-test-secret
export LINGXILOOP_GATEWAY_HMAC_SECRET=isolated-cases-449-test-gateway
export LINGXILOOP_INVITE_BASE_URL=http://127.0.0.1:53108
export INTEGRATION_REPORT_PATH=/workspace/LingxiLoop/artifacts/issue-449/integration-results.json
