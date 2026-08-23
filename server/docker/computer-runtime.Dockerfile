FROM docker:27-cli

RUN apk add --no-cache nodejs npm tini
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server

ENV NODE_ENV=production \
    COMPUTER_RUNTIME_PORT=5195 \
    LINGXILOOP_LOG_LEVEL=warn

EXPOSE 5195
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "server/src/computer-runtime/service.ts"]
