# lingxiloop-server — the product control plane and web application.
#
# Serves three surfaces from the same Node process:
#   /api/*        — JSON API (Express router)
#   everything else — the React SPA bundle (built into /app/dist below)
#
# Entry points:
#   npm run server:start  →  tsx server/src/bin/web.ts  (HTTP/WS runtime)
#   npm run worker:start  →  tsx server/src/bin/worker.ts  (background tasks)
#   npm run db:migrate  →  tsx server/src/migrate-bin.ts
#
# Model turns run only in the separate Agent OS service. The control plane
# owns product authorization, approvals, WuKong integration and projections.
#
# Build (from repo root):
#   docker build \
#     -f server/docker/lingxiloop-server.Dockerfile \
#     --secret id=npm_token,env=NODE_AUTH_TOKEN \
#     -t ghcr.io/lingxi-org/lingxiloop-server:dev \
#     .
#
# OrbStack auto-loads into its K8s.

# ─── stage 1: install runtime node deps (prod only) ─────────────────
ARG NODE_BASE_IMAGE=accel.way2api.fun/docker.io/library/node:22-bookworm-slim
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG APT_MIRROR=http://mirrors.aliyun.com

FROM ${NODE_BASE_IMAGE} AS deps
ARG NPM_REGISTRY
WORKDIR /app
COPY server/package.json server/package-lock.json server/.npmrc ./
COPY package.json /tmp/qualified-package.json
COPY scripts/prune-pdfjs-server-runtime.mjs /tmp/prune-pdfjs-server-runtime.mjs
COPY scripts/prune-glibc-canvas-runtime.mjs /tmp/prune-glibc-canvas-runtime.mjs
RUN node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; const expected=JSON.parse(fs.readFileSync("/tmp/qualified-package.json")).dependencies["@lyyzka/lingxios"]; assert.match(expected,/^\d+\.\d+\.\d+$/); assert.equal(JSON.parse(fs.readFileSync("package.json")).dependencies["@lyyzka/lingxios"],expected,"server runtime must match root qualification");'
RUN --mount=type=secret,id=npm_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token 2>/dev/null)" npm ci --registry="${NPM_REGISTRY}" --omit=dev --no-audit --no-fund --prefer-offline \
    && node /tmp/prune-pdfjs-server-runtime.mjs /app/node_modules/pdfjs-dist --apply \
    && node /tmp/prune-glibc-canvas-runtime.mjs /app/node_modules --apply \
    && node --input-type=module -e 'for (const name of ["pdfjs-dist", "pdfjs-dist/legacy/build/pdf.mjs"]) { const { getDocument } = await import(name); if (typeof getDocument !== "function") throw Error(`Broken PDF.js entry: ${name}`); }'
RUN node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {releaseVersions} from "@lyyzka/lingxios"; assert.equal(releaseVersions.runtime,JSON.parse(fs.readFileSync("/tmp/qualified-package.json")).dependencies["@lyyzka/lingxios"],"installed image runtime must match root qualification");'

# ─── stage 2: build the web SPA bundle ──────────────────────────────
# Separate stage with FULL devDeps installed so vite + tsc + tailwind +
# postcss are available. The output (dist/) is copied into the runtime
# image; nothing from this stage's node_modules makes it through.
#
# The SPA uses same-origin `/api` routes through the control-plane Worker.
FROM ${NODE_BASE_IMAGE} AS spa-build
ARG NPM_REGISTRY
WORKDIR /app
ARG VITE_PUBLIC_POSTHOG_KEY=""
ARG VITE_PUBLIC_POSTHOG_HOST=""
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_PUBLIC_POSTHOG_KEY=${VITE_PUBLIC_POSTHOG_KEY}
ENV VITE_PUBLIC_POSTHOG_HOST=${VITE_PUBLIC_POSTHOG_HOST}
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}
COPY package.json package-lock.json .npmrc ./
# The Web build uses optional platform packages and needs no install scripts;
# skip Electron's binary download in this stage too.
RUN --mount=type=secret,id=npm_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token 2>/dev/null)" npm ci --registry="${NPM_REGISTRY}" --no-audit --no-fund --prefer-offline --ignore-scripts
COPY src ./src
COPY public ./public
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY postcss.config.js ./
COPY tailwind.config.ts ./
COPY third_party/zcode ./third_party/zcode
# StreamingText imports the pinned upstream range helper; include its license and provenance.
COPY third_party/assistant-ui/streaming-text ./third_party/assistant-ui/streaming-text
COPY scripts/verify-zcode-visualize.mjs scripts/build-visualize-runtime.mjs ./scripts/
RUN npm run build

# ─── stage 3: runtime ───────────────────────────────────────────────
FROM ${NODE_BASE_IMAGE}
ARG APT_MIRROR
ARG LINGXILOOP_VERSION=0.0.0-dev
ARG LINGXILOOP_COMMIT_SHA=dev

RUN sed -i "s|http://deb.debian.org|${APT_MIRROR}|g; s|https://deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       tini \
       ca-certificates \
       python3 \
       bubblewrap \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules from the deps stage first (rare changes → good
# caching), then the source on top (changes every commit).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY server ./server
# Canvas service deliberately shares these dependency-free domain helpers with
# the React client. They are loaded by tsx at runtime, so include them in the
# control-plane image as well (the SPA build stage's source is not copied into
# this final stage).
COPY src/lib/agentToolCards.ts src/lib/researchSources.ts src/lib/agentCapabilities.ts src/lib/canvasLayout.ts src/lib/canvasEventKinds.ts src/lib/mentions.ts src/lib/participantDisplayName.ts src/lib/agentRunSnapshot.ts src/lib/nativeMessage.ts src/lib/userFacingError.ts src/lib/runActivity.ts src/lib/runTrace.ts src/lib/memoryActivity.ts ./src/lib/
COPY src/features/chat/visualize/zcode/shared/gen-ui ./src/features/chat/visualize/zcode/shared/gen-ui
COPY src/features/chat/visualize/zcode/gen-ui/domain ./src/features/chat/visualize/zcode/gen-ui/domain
COPY src/features/chat/visualize/zcode/lib/assistantDirectiveParser.ts ./src/features/chat/visualize/zcode/lib/assistantDirectiveParser.ts
# Keep the complete skill (including Python exports, vendor assets and licenses).
# The full upstream source is a SPA build input; only this served script is read
# by the server at runtime. Retain the pinned source inventory and attribution.
COPY third_party/zcode/skills/visualize ./third_party/zcode/skills/visualize
COPY third_party/zcode/upstream/packages/desktop/src/renderer/src/plugin-sandbox/genUiTweakRuntime.js ./third_party/zcode/upstream/packages/desktop/src/renderer/src/plugin-sandbox/genUiTweakRuntime.js
COPY third_party/zcode/LICENSE third_party/zcode/README.md third_party/zcode/manifest.json ./third_party/zcode/
COPY third_party/zcode/upstream/LICENSE ./third_party/zcode/upstream/LICENSE
COPY --from=spa-build /app/server/assets/visualize-runtime ./server/assets/visualize-runtime
# Web SPA bundle — read by server/src/web.ts at boot via existsSync().
# When this is absent (e.g. an older runtime image) the server falls
# back to a JSON `/` response.
COPY --from=spa-build /app/dist ./dist
COPY third_party/assistant-ui/streaming-text/LICENSE ./dist/licenses/assistant-ui-streaming-text.txt

ENV NODE_ENV=production \
    LINGXILOOP_VERSION=${LINGXILOOP_VERSION} \
    LINGXILOOP_COMMIT_SHA=${LINGXILOOP_COMMIT_SHA}

# Check the final package, after every runtime COPY. The dependency-free helper
# loads with native Node type stripping; Web/Worker use their production tsx
# launcher and stop at the required-environment guard without credentials.
# This is import/link coverage, not a DB-backed readiness or health check.
RUN node --experimental-strip-types --input-type=module -e 'await import("./src/lib/participantDisplayName.ts")' \
  && node server/scripts/check-packaged-startup.mjs

# tini for PID-1 reaping. Default command runs the server; the
# production Compose migration job overrides this with `npm run db:migrate`.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "server:start"]
