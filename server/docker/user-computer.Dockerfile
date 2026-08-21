# One persistent user-level Computer shared by multiple LingxiGraph agents.
# Reasoning stays in LingxiGraph; this image supplies tools, files, browser and
# lightweight desktop sessions only. Build from the repository root:
#   docker build -f server/docker/user-computer.Dockerfile \
#     -t ghcr.io/lingxi-org/lingxiloop-user-computer:dev .
ARG BASE_IMAGE=docker.m.daocloud.io/library/debian:bookworm-slim
FROM ${BASE_IMAGE}

ARG DEBIAN_MIRROR=http://mirrors.aliyun.com/debian
ARG DEBIAN_SECURITY_MIRROR=http://mirrors.aliyun.com/debian-security
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple

# Mainland-China deployment defaults. All mirrors stay build-time overridable
# for private registries or air-gapped environments.
RUN sed -i \
      -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
      -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
      /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
  && mkdir -p /etc/pip \
  && printf '[global]\nindex-url = %s\ntrusted-host = mirrors.aliyun.com\n' "${PIP_INDEX_URL}" > /etc/pip.conf

RUN apt-get -o Acquire::Retries=3 update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates curl git jq ripgrep bash tini \
       python3 python3-pip \
       chromium chromium-driver chromium-sandbox \
       xvfb xauth openbox x11vnc novnc websockify xterm pcmanfm scrot xdotool \
       fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
       procps \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --home-dir /home/lingxi --shell /bin/bash lingxi \
  && mkdir -p /workspace /documents /downloads /home/lingxi/shared /home/lingxi/agent-private \
  && chown -R lingxi:lingxi /home/lingxi /workspace /documents /downloads

COPY server/docker/user-computer-entrypoint.sh /usr/local/bin/user-computer-entrypoint
RUN chmod +x /usr/local/bin/user-computer-entrypoint

ENV HOME=/home/lingxi \
    CHROME_PROFILE_DIR=/home/lingxi/.config/chromium \
    DISPLAY=:10 \
    PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple \
    PIP_TRUSTED_HOST=mirrors.aliyun.com

WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/user-computer-entrypoint"]
