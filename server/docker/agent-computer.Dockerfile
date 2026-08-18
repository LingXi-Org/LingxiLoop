# cumora-agent-computer — the per-agent pod image.
#
# Inside the pod two processes run:
#   1. /usr/local/bin/cumora-fuse — mounts the agent's slice of
#      `agent_workspace` from Postgres at /workspace, via FUSE. The
#      agent's persona dir, memory, skills, scratch — all on the FS,
#      backed by DB rows.
#   2. node /app/agent-computer.cjs — the agent loop. Connects to the
#      cumora server's /runtime/wake-stream over SSE, processes wakes,
#      idle-times-out and exits cleanly when there's no work.
#
# Build (from repo root, AFTER running build-agent-bundle.mjs):
#   docker build \
#     -f server/docker/agent-computer.Dockerfile \
#     -t quay.io/yetoneful/cumora-agent-computer:dev \
#     .
#
# OrbStack auto-loads images into its bundled K8s; no `docker push`
# needed locally. Push only when promoting to a real cluster.

# ─── stage 0: uv binary, pulled from Astral's official multi-arch image ─
# Declared as a real stage so we can `COPY --from=uv-stage` later. The
# ARG has to live in the global scope (above all FROM lines) for Docker
# to expand it on the FROM directive — otherwise we'd hit "variable
# expansion is not supported for --from".
ARG UV_VERSION=0.5.13
FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv-stage

# ─── stage 1: build cumora-fuse (Go) ────────────────────────────────
FROM golang:1.24-bookworm AS fuse-build

WORKDIR /src
COPY agent-fuse/go.mod agent-fuse/go.sum* ./
RUN GOPROXY=https://proxy.golang.org,direct go mod download
COPY agent-fuse/ ./
RUN GOPROXY=https://proxy.golang.org,direct CGO_ENABLED=0 GOOS=linux go build \
      -ldflags="-s -w" \
      -o /out/cumora-fuse \
      .

# ─── stage 2: the runtime image ─────────────────────────────────────
FROM node:20-bookworm-slim

# tini    — PID-1 reaper / signal forwarder
# curl / wget — used by the in-pod `cumora` shim + OpenCLI extension fetch
# fuse3   — userspace FUSE: /sbin/mount.fuse3 + /bin/fusermount3
# bash — required by the runtime bash tool (`spawn('bash', ['-c', ...])`)
# git / ripgrep / jq — native-tool surface for the agent
# python3 / python3-pip — for skill bundles that ship python scripts
# ffmpeg  — media transcoding (agents do A/V work via bash)
# ca-certificates — TLS to OpenAI and the cumora server
# chromium + chromium-driver — agent-driven browser (under Xvfb)
# xvfb + xauth — virtual X display so Chromium can run "headed" without
#   a real GPU. OpenCLI requires a real Chrome extension context — pure
#   headless Chromium doesn't load extensions, so Xvfb is the cheapest
#   way to give Chromium a display server to attach to.
# fonts-* — emoji + CJK + base sans/serif so pages render correctly.
#   Without these, OpenCLI's DOM snapshots come back with tofu boxes
#   and the LLM can't tell what's on the page.
# unzip — for unpacking the OpenCLI browser-bridge extension at build time
# procps — for pgrep used by the entrypoint heartbeat
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       tini \
       bash \
       curl \
       wget \
       fuse3 \
       git \
       ripgrep \
       jq \
       python3 \
       python3-pip \
       ffmpeg \
       ca-certificates \
       chromium \
       chromium-driver \
       xvfb \
       xauth \
       fonts-noto-core \
       fonts-noto-cjk \
       fonts-noto-color-emoji \
       unzip \
       procps \
  && rm -rf /var/lib/apt/lists/*

# ─── uv: Astral's Rust-built Python package/project manager ───────────
# Bundled because skill packages and many agent scripts assume `uv` for
# venv + dependency resolution. Sourced from the named `uv-stage` at
# the top of the file (Docker requires a real stage reference rather
# than a templated image:tag inside COPY --from).
COPY --from=uv-stage /uv /uvx /usr/local/bin/

# Isolated, pinned LingxiGraph runtime for stateless communication turns.
COPY server/lingxigraph/requirements.txt /tmp/lingxigraph-requirements.txt
RUN uv venv /opt/lingxigraph-venv \
  && uv pip install --python /opt/lingxigraph-venv/bin/python -r /tmp/lingxigraph-requirements.txt \
  && rm /tmp/lingxigraph-requirements.txt
COPY server/lingxigraph/lingxigraph_runner.py /opt/lingxiloop/lingxigraph_runner.py

# ─── yt-dlp: media-extraction CLI for YouTube + 1000s of other sites ──
# The agent's bash tool uses it for "summarise this video" / "pull the
# transcript" flows. The single-file standalone is a Python zipapp; it
# only needs python3 (already installed above) and ffmpeg (also above)
# to do A/V postprocessing. Pinned for reproducibility — bump when a
# new extractor fix is needed.
ARG YT_DLP_VERSION=2026.03.17
RUN curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp" \
      -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp

# ─── OpenCLI: CLI binary + browser-bridge extension ───────────────────
# We pin both versions so a release of either project can't surprise us
# mid-deploy. Update by bumping these two ARGs and rebuilding the image.
ARG OPENCLI_CLI_VERSION=1.8.0
ARG OPENCLI_EXTENSION_VERSION=1.0.15

# Global install of @jackwener/opencli — gives us the `opencli` binary on
# PATH for the in-pod agent. Daemon auto-starts on first use; the agent
# entrypoint also primes it eagerly so the first browser call has no
# cold-start lag.
RUN npm install -g "@jackwener/opencli@${OPENCLI_CLI_VERSION}"

# Bundle the OpenCLI browser-bridge extension. Chrome needs the unpacked
# extension directory passed via --load-extension, so we unzip at build
# time and keep the directory under /opt/opencli-extension. Picked the
# asset filename out of the v${OPENCLI_CLI_VERSION} release; if the
# release bumps the extension version, update OPENCLI_EXTENSION_VERSION
# above accordingly.
RUN mkdir -p /opt/opencli-extension \
  && curl -fsSL "https://github.com/jackwener/opencli/releases/download/v${OPENCLI_CLI_VERSION}/opencli-extension-v${OPENCLI_EXTENSION_VERSION}.zip" -o /tmp/opencli-ext.zip \
  && unzip -q /tmp/opencli-ext.zip -d /opt/opencli-extension \
  && rm /tmp/opencli-ext.zip \
  && ls /opt/opencli-extension

WORKDIR /app

# The CJS bundle (esbuild output) — agent loop entry: pod-agent.ts.
COPY dist/agent/agent-computer.cjs /app/agent-computer.cjs

# The FUSE driver built in stage 1.
COPY --from=fuse-build /out/cumora-fuse /usr/local/bin/cumora-fuse

# The shell shim agents invoke via bash → forwards argv to /runtime/cli.
COPY server/docker/agent-computer-cumora.sh /usr/local/bin/cumora
# Browser ergonomics wrapper. Agents call `cumora-web search/read` for
# the two common cases; anything richer goes through `opencli browser`
# directly. Stays in /usr/local/bin so bash finds it via PATH.
COPY server/docker/agent-computer-cumora-web.sh /usr/local/bin/cumora-web
RUN chmod +x /usr/local/bin/cumora /usr/local/bin/cumora-web /usr/local/bin/cumora-fuse

# Entrypoint: mount FUSE first, then exec the agent loop.
COPY server/docker/agent-computer-entrypoint.sh /usr/local/bin/agent-entrypoint
RUN chmod +x /usr/local/bin/agent-entrypoint

# Env contract — orchestrator injects all of these at pod-spawn time:
#   CUMORA_AGENT_ID            which agent to wake
#   CUMORA_AGENT_RUNTIME_URL   server origin (e.g. http://host.docker.internal:5181/runtime)
#   CUMORA_AGENT_RUNTIME_TOKEN signed JWT pinning agentId + companyId
#   CUMORA_PG_URL              postgres://agent_<id>:<pw>@…/cumora  (FUSE backend)
#   CUMORA_AGENT_IDLE_MS       ms before the Pod idle-times-out and exits
#   OPENAI_API_KEY             agent's LLM key
ENV CUMORA_RUNTIME_CLIENT=http \
    NODE_ENV=production \
    LINGXIGRAPH_PYTHON_BIN=/opt/lingxigraph-venv/bin/python \
    LINGXIGRAPH_RUNNER_PATH=/opt/lingxiloop/lingxigraph_runner.py \
    DISPLAY=:99 \
    OPENCLI_EXTENSION_DIR=/opt/opencli-extension \
    CHROME_PROFILE_DIR=/opt/chrome-profile \
    CHROMIUM_BIN=/usr/bin/chromium

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/agent-entrypoint"]
