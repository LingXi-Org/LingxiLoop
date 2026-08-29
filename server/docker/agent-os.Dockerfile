ARG NODE_BASE_IMAGE=docker.m.daocloud.io/library/node:20-bookworm-slim
ARG APT_MIRROR=http://mirrors.aliyun.com
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PYPI_INDEX_URL=https://pypi.org/simple
FROM ${NODE_BASE_IMAGE}

ARG APT_MIRROR
ARG NPM_REGISTRY
ARG PYPI_INDEX_URL
RUN sed -i "s|http://deb.debian.org|${APT_MIRROR}|g; s|https://deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 python3-pip tini ca-certificates \
  && pip3 install --break-system-packages --no-cache-dir --index-url "$PYPI_INDEX_URL" "ipython==9.4.0" \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY" --omit=dev --no-audit --no-fund
COPY server ./server

ENV NODE_ENV=production \
    AGENT_OS_PYTHON=python3 \
    AGENT_OS_HOMES_ROOT=/var/lib/lingxiloop-agent-os/homes

VOLUME ["/var/lib/lingxiloop-agent-os"]
EXPOSE 5190
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "agent-os:start"]
