# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
RUN --mount=type=secret,id=proxy_ca,required=true \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update && \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends \
      chromium fcitx5 fcitx5-pinyin fcitx5-frontend-gtk3 fcitx5-module-xorg \
      dbus-x11 xvfb xauth xdotool scrot fonts-noto-cjk && \
    rm -rf /var/lib/apt/lists/*
USER node
WORKDIR /workspace/LingxiLoop
ENV GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx LANG=C.UTF-8
