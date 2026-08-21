# One persistent user-level Computer shared by multiple LingxiGraph agents.
# Reasoning stays in LingxiGraph; this image supplies tools, files, browser and
# lightweight desktop sessions only. Build from the repository root:
#   docker build -f server/docker/user-computer.Dockerfile \
#     -t ghcr.io/lingxi-org/lingxiloop-user-computer:dev .
FROM debian:bookworm-slim

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates curl git jq ripgrep bash tini \
       python3 python3-pip nodejs npm \
       chromium chromium-driver \
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
    DISPLAY=:10

WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/user-computer-entrypoint"]
