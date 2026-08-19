# cumora-server — the API + scheduler + orchestrator process.
#
# Serves THREE surfaces from the same Node process:
#   /api/*        — JSON API (Express router)
#   /runtime/*    — per-pod agent runtime API (JWT-authed)
#   everything else — the React SPA bundle (built into /app/dist below)
#
# Entry points:
#   npm run server:start  →  tsx server/src/index.ts  (main runtime)
#   npm run migrate       →  tsx server/src/migrate-bin.ts  (init container)
#
# The MVP server image intentionally does not ship kubectl. Kubernetes cloud
# agents are optional; ordinary server-mode builds require no cluster tooling.
#
# Build (from repo root):
#   docker build \
#     -f server/docker/cumora-server.Dockerfile \
#     -t quay.io/yetoneful/cumora-server:dev \
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
COPY package.json package-lock.json ./
# `--omit=dev` skips devDependencies — that's electron, vite,
# electron-icon-builder (which transitively pulls phantomjs-prebuilt,
# whose postinstall fails on linux/arm64), etc. Server runtime only
# needs the actual runtime deps + tsx (moved out of devDeps for
# exactly this reason).
RUN npm ci --registry="${NPM_REGISTRY}" --omit=dev --no-audit --no-fund --prefer-offline

# ─── stage 2: build the web SPA bundle ──────────────────────────────
# Separate stage with FULL devDeps installed so vite + tsc + tailwind +
# postcss are available. The output (dist/) is copied into the runtime
# image; nothing from this stage's node_modules makes it through.
#
# VITE_CUMORA_API_BASE is intentionally NOT baked here — the SPA serves
# from the SAME origin as the API in prod (app.cumora.ai → same backend
# as api.cumora.ai), so relative URLs (`/api/...`) work without any
# baked origin. Builders pointing the SPA at a remote API (e.g. for a
# separate Cloudflare Pages deploy) should override via --build-arg.
FROM ${NODE_BASE_IMAGE} AS spa-build
ARG NPM_REGISTRY
WORKDIR /app
ARG VITE_CUMORA_API_BASE=""
ARG VITE_PUBLIC_POSTHOG_KEY=""
ARG VITE_PUBLIC_POSTHOG_HOST=""
ENV VITE_CUMORA_API_BASE=${VITE_CUMORA_API_BASE}
ENV VITE_PUBLIC_POSTHOG_KEY=${VITE_PUBLIC_POSTHOG_KEY}
ENV VITE_PUBLIC_POSTHOG_HOST=${VITE_PUBLIC_POSTHOG_HOST}
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
COPY package.json package-lock.json ./
COPY server ./server
# Keep `bin/cumora` available for any in-process CLI calls the server
# itself might make (e.g. from the test endpoints).
COPY bin ./bin
# Web SPA bundle — read by server/src/index.ts at boot via existsSync().
# When this is absent (e.g. an older runtime image) the server falls
# back to a JSON `/` response.
COPY --from=spa-build /app/dist ./dist

ENV NODE_ENV=production

# tini for PID-1 reaping. Default command runs the server; the
# init-container in our k8s manifests overrides to `npm run migrate`.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "server:start"]
