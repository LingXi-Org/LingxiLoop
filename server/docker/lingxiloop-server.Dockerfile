# lingxiloop-server — the product control plane and web application.
#
# Serves three surfaces from the same Node process:
#   /api/*        — JSON API (Express router)
#   /internal/agent-os/v2/* — private LingxiOS control-plane API
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
#     -t ghcr.io/lingxi-org/lingxiloop-server:dev \
#     .
#
# OrbStack auto-loads into its K8s.

# ─── stage 1: install runtime node deps (prod only) ─────────────────
ARG NODE_BASE_IMAGE=docker.m.daocloud.io/library/node:20-bookworm-slim
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG APT_MIRROR=http://mirrors.aliyun.com

FROM ${NODE_BASE_IMAGE} AS deps
ARG NPM_REGISTRY
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --registry="${NPM_REGISTRY}" --omit=dev --no-audit --no-fund --prefer-offline

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
COPY package.json package-lock.json ./
# --ignore-scripts: electron-icon-builder transitively pulls
# phantomjs-prebuilt, whose postinstall extracts a bz2 tarball — but
# the slim base image has no `bzip2` binary, so the install dies with
# `tar (child): bzip2: Cannot exec`. Vite/tsc/tailwind/postcss don't
# need any postinstall (esbuild's platform native lands via
# optionalDependencies, not a script), so skipping all postinstall
# scripts is safe in this stage AND faster than apt-get'ing bzip2.
RUN npm ci --registry="${NPM_REGISTRY}" --no-audit --no-fund --prefer-offline --ignore-scripts
COPY src ./src
COPY public ./public
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY postcss.config.js ./
COPY tailwind.config.ts ./
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
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules from the deps stage first (rare changes → good
# caching), then the source on top (changes every commit).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY server ./server
COPY third_party/lingxios ./third_party/lingxios
# Canvas service deliberately shares these dependency-free domain helpers with
# the React client. They are loaded by tsx at runtime, so include them in the
# control-plane image as well (the SPA build stage's source is not copied into
# this final stage).
COPY src/lib/canvasLayout.ts src/lib/canvasEventKinds.ts ./src/lib/
# Web SPA bundle — read by server/src/web.ts at boot via existsSync().
# When this is absent (e.g. an older runtime image) the server falls
# back to a JSON `/` response.
COPY --from=spa-build /app/dist ./dist

ENV NODE_ENV=production \
    LINGXILOOP_VERSION=${LINGXILOOP_VERSION} \
    LINGXILOOP_COMMIT_SHA=${LINGXILOOP_COMMIT_SHA}

# tini for PID-1 reaping. Default command runs the server; the
# production Compose migration job overrides this with `npm run db:migrate`.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "server:start"]
